import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { isActionContractError } from "@agent-native/core/action";
import { closeDbExec, getDbExec } from "@agent-native/core/db";
import { getChangesSince } from "@agent-native/core/server/poll";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import advanceJob from "../actions/advance-job.js";
import assignTask from "../actions/assign-task.js";
import createJob from "../actions/create-job.js";
import getJobFeed from "../actions/get-job-feed.js";
import { getDb } from "../server/db/index.js";
import { auditEvents, decisions, jobs, messages } from "../server/db/schema.js";
import { ensureFanout, groupFeedForJob } from "../server/lib/loops/orchestrator.js";
import { startJobFeedHeartbeat, stopJobFeedHeartbeat } from "../server/lib/loops/heartbeat.js";

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../server/db/migrations",
);

async function applyMigrations(): Promise<void> {
  const exec = getDbExec();
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const body = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    for (const chunk of body.split("--> statement-breakpoint")) {
      const statement = chunk.trim().replace(/;$/, "");
      if (statement) await exec.execute(statement);
    }
  }
}

function contractError(error: unknown): { errorCode: string; statusCode: number } {
  expect(isActionContractError(error)).toBe(true);
  const contract = error as { errorCode: string; statusCode: number };
  return { errorCode: contract.errorCode, statusCode: contract.statusCode };
}

async function runningJob(title: string): Promise<string> {
  const created = await createJob.run({ template: "chase-up", title });
  await advanceJob.run({ id: created.id, to: "running" });
  return created.id;
}

describe("orchestrator fan-out", () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  afterAll(async () => {
    stopJobFeedHeartbeat();
    await closeDbExec();
  });

  it("creates exactly one orchestrator log plus drafter and tracker rows", async () => {
    const jobId = await runningJob("Fanout seeds three rows");
    const db = getDb();
    const rows = await db.select().from(messages).where(eq(messages.jobId, jobId));
    const roles = rows.map((row) => row.role).sort();
    expect(roles).toEqual(["drafter", "orchestrator", "tracker"]);
    expect(new Set(rows.map((row) => row.threadId))).toEqual(new Set([""]));
    const seqs = [...rows.map((row) => row.seq)].sort((a, b) => a - b);
    expect(seqs[2] - seqs[0]).toBe(2);
  });

  it("is idempotent: reruns insert nothing", async () => {
    const jobId = await runningJob("Fanout converges");
    const db = getDb();
    const before = await db.select().from(messages).where(eq(messages.jobId, jobId));
    const auditsBefore = await db.select().from(auditEvents).where(eq(auditEvents.jobId, jobId));
    await ensureFanout(jobId);
    await ensureFanout(jobId);
    const after = await db.select().from(messages).where(eq(messages.jobId, jobId));
    const auditsAfter = await db.select().from(auditEvents).where(eq(auditEvents.jobId, jobId));
    expect(after.length).toBe(before.length);
    expect(auditsAfter.length).toBe(auditsBefore.length);
  });

  it("no-ops unless the job is running", async () => {
    const created = await createJob.run({ template: "chase-up", title: "Still planning" });
    await ensureFanout(created.id);
    const db = getDb();
    const rows = await db.select().from(messages).where(eq(messages.jobId, created.id));
    expect(rows).toEqual([]);
    await ensureFanout("job_missing");
  });

  it("groups feed rows by role, newest first", () => {
    const grouped = groupFeedForJob([
      { id: "a", role: "orchestrator", body: "log", seq: 1 },
      { id: "b", role: "drafter", body: "old", seq: 2 },
      { id: "c", role: "tracker", body: "track", seq: 3 },
      { id: "d", role: "drafter", body: "new", seq: 4 },
      { id: "e", role: "steering", body: "steer", seq: 5 },
    ]);
    expect(grouped.log.map((row) => row.id)).toEqual(["a"]);
    expect(grouped.agents.drafter.map((row) => row.id)).toEqual(["d", "b"]);
    expect(grouped.agents.tracker.map((row) => row.id)).toEqual(["c"]);
  });
});

describe("assign-task and get-job-feed", () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  afterAll(async () => {
    stopJobFeedHeartbeat();
    await closeDbExec();
  });

  it("returns an id and the card appears in the feed", async () => {
    const jobId = await runningJob("Assign round-trip");
    const assigned = await assignTask.run({ jobId, agent: "drafter", task: "draft follow-up" });
    expect(typeof assigned.id).toBe("string");
    expect(assigned.id.length).toBeGreaterThan(0);
    expect(assigned).toMatchObject({ jobId, agent: "drafter", nextRequiredAction: "get-job-feed" });

    const feed = await getJobFeed.run({ id: jobId });
    expect(feed).toMatchObject({ id: jobId, state: "running" });
    expect(feed.log.length).toBeGreaterThan(0);
    expect(feed.agents.drafter.map((row) => row.body)).toContain("draft follow-up");
    expect(feed.cards.map((row) => row.body)).toContain("draft follow-up");
    const card = feed.cards.find((row) => row.id === assigned.id)!;
    expect(card).toMatchObject({ agent: "drafter", body: "draft follow-up" });
  });

  it("tracker cards land in the tracker column", async () => {
    const jobId = await runningJob("Tracker assign");
    await assignTask.run({ jobId, agent: "tracker", task: "check stakeholder reply" });
    const feed = await getJobFeed.run({ id: jobId });
    expect(feed.agents.tracker.map((row) => row.body)).toContain("check stakeholder reply");
    expect(feed.agents.drafter.map((row) => row.body)).not.toContain("check stakeholder reply");
  });

  it("maps changeResource input/result to the job resource", () => {
    expect(
      assignTask.changeResource?.(
        { jobId: "job_1", agent: "drafter", task: "t" },
        { id: "m", message: "m", jobId: "job_1", agent: "drafter", nextRequiredAction: "get-job-feed" },
      ),
    ).toEqual({ resourceType: "job", resourceId: "job_1" });
    expect(
      getJobFeed.changeResource?.(
        { id: "job_2" },
        {
          id: "job_2",
          title: "t",
          state: "running",
          log: [],
          agents: { drafter: [], tracker: [] },
          cards: [],
        },
      ),
    ).toEqual({ resourceType: "job", resourceId: "job_2" });
    expect(
      advanceJob.changeResource?.({ id: "job_3", to: "running" }, { id: "job_3", message: "m", state: "running", nextRequiredAction: "x" }),
    ).toEqual({ resourceType: "job", resourceId: "job_3" });
    expect(
      createJob.changeResource?.(
        { template: "chase-up", title: "t" },
        { id: "job_4", message: "m", state: "planning", nextRequiredAction: "advance-job" },
      ),
    ).toEqual({ resourceType: "job", resourceId: "job_4" });
    expect(
      createJob.changeResource?.(
        { template: "chase-up", title: "t" },
        undefined as never,
      ),
    ).toBeUndefined();
  });

  it("returns 404 for unknown job ids", async () => {
    const assignMissing = await assignTask
      .run({ jobId: "job_missing", agent: "drafter", task: "draft follow-up" })
      .catch((e) => e);
    expect(contractError(assignMissing)).toEqual({ errorCode: "job_not_found", statusCode: 404 });

    const feedMissing = await getJobFeed.run({ id: "job_missing" }).catch((e) => e);
    expect(contractError(feedMissing)).toEqual({ errorCode: "job_not_found", statusCode: 404 });
  });

  it("returns 409 when the job is complete", async () => {
    const created = await createJob.run({ template: "chase-up", title: "Done deal" });
    await advanceJob.run({ id: created.id, to: "running" });
    await advanceJob.run({ id: created.id, to: "awaiting_review" });
    const db = getDb();
    await db.insert(decisions).values({
      id: `dec_${created.id}`,
      jobId: created.id,
      effectId: "",
      decision: "approve",
      reason: "Reviewed.",
    });
    await advanceJob.run({ id: created.id, to: "complete" });

    const failure = await assignTask
      .run({ jobId: created.id, agent: "drafter", task: "draft follow-up" })
      .catch((e) => e);
    expect(contractError(failure)).toEqual({ errorCode: "job_paused", statusCode: 409 });
  });

  it("rejects a bad agent as a validation failure, never a 500", async () => {
    const jobId = await runningJob("Bad agent rejected");
    const db = getDb();
    const before = await db.select().from(messages).where(eq(messages.jobId, jobId));

    const failure = await assignTask
      .run({ jobId, agent: "bogus", task: "draft follow-up" } as unknown as {
        jobId: string;
        agent: "drafter";
        task: string;
      })
      .catch((e) => e);
    expect(isActionContractError(failure)).toBe(false);
    expect((failure as { statusCode?: number } | undefined)?.statusCode ?? 400).not.toBe(500);

    const schema = (assignTask as unknown as {
      schema: { safeParse: (value: unknown) => { success: boolean } };
    }).schema;
    expect(schema.safeParse({ jobId, agent: "bogus", task: "draft follow-up" }).success).toBe(false);
    expect(schema.safeParse({ jobId, agent: "tracker", task: "draft follow-up" }).success).toBe(true);

    const after = await db.select().from(messages).where(eq(messages.jobId, jobId));
    expect(after.length).toBe(before.length);
  });
});

describe("job feed heartbeat", () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  afterAll(async () => {
    stopJobFeedHeartbeat();
    await closeDbExec();
  });

  it("ticks without writing domain rows and stops cleanly", async () => {
    const jobId = await runningJob("Heartbeat job");
    const db = getDb();
    const before = await db.select().from(messages).where(eq(messages.jobId, jobId));

    startJobFeedHeartbeat(25);
    startJobFeedHeartbeat(25);
    await new Promise((resolve) => setTimeout(resolve, 120));
    stopJobFeedHeartbeat();

    const after = await db.select().from(messages).where(eq(messages.jobId, jobId));
    expect(after.length).toBe(before.length);
  });

  it("emits a heartbeat frame for every running job past the old 50 cap", async () => {
    const db = getDb();
    const ids = Array.from({ length: 65 }, () => randomUUID());
    await db.insert(jobs).values(
      ids.map((id) => ({ id, status: "running", template: "chase-up", title: "Heartbeat fleet" })),
    );
    const messagesBefore = (await db.select({ id: messages.id }).from(messages)).length;
    const baseline = getChangesSince(0).version;

    startJobFeedHeartbeat(25);
    await new Promise((resolve) => setTimeout(resolve, 150));
    stopJobFeedHeartbeat();

    const seen = new Set(
      getChangesSince(baseline)
        .events.filter((event) => event.source === "jobs")
        .map((event) => event.key),
    );
    for (const id of ids) {
      expect(seen.has(id)).toBe(true);
    }
    const messagesAfter = (await db.select({ id: messages.id }).from(messages)).length;
    expect(messagesAfter).toBe(messagesBefore);
  });
});
