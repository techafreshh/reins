import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { isActionContractError } from "@agent-native/core/action";
import { closeDbExec, getDbExec } from "@agent-native/core/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import advanceJob from "../actions/advance-job.js";
import createJob from "../actions/create-job.js";
import decideEffect from "../actions/decide-effect.js";
import digestCompletedJob from "../actions/digest-completed-job.js";
import getJobState from "../actions/get-job-state.js";
import proposeEffect from "../actions/propose-effect.js";
import JobDigest from "../app/components/jobs/JobDigest.js";
import { getDb } from "../server/db/index.js";
import { jobs, threads } from "../server/db/schema.js";
import { buildDigest } from "../server/lib/digest.js";
import {
  ensureNightlySweepJob,
  NIGHTLY_SWEEP_JOB_ID,
  NIGHTLY_SWEEP_TEMPLATE,
} from "../server/lib/sweep.js";

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

const DRAFT = {
  threadId: "th_1",
  to: "priya@example.com",
  subject: "Hi",
  body: "nudge",
};

describe("digest-completed-job", () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  afterAll(async () => {
    await closeDbExec();
  });

  it("synthesizes a completed 2-effect job with Digest ready plus approved/rejected counts", async () => {
    const created = await createJob.run({ template: "chase-up", title: "Digest me" });
    await advanceJob.run({ id: created.id, to: "running" });
    await advanceJob.run({ id: created.id, to: "awaiting_review" });
    const first = await proposeEffect.run({
      jobId: created.id,
      capability: "send_followup",
      payload: { ...DRAFT },
    });
    const second = await proposeEffect.run({
      jobId: created.id,
      capability: "send_followup",
      payload: { ...DRAFT, subject: "Follow-up" },
    });
    await decideEffect.run({ effectId: first.id, decision: "approve" });
    await decideEffect.run({ effectId: second.id, decision: "reject", feedback: "too soon" });
    await advanceJob.run({ id: created.id, to: "complete" });

    const digest = await digestCompletedJob.run({ jobId: created.id });
    expect(digest.message).toContain("Digest ready");
    expect(digest).toMatchObject({
      id: created.id,
      approved: 1,
      rejected: 1,
      proposed: 2,
      state: "complete",
    });

    // Repeat call is idempotent and never transitions state.
    const again = await digestCompletedJob.run({ jobId: created.id });
    expect(again).toMatchObject({ state: "complete", approved: 1, rejected: 1 });
    expect(await getJobState.run({ id: created.id })).toMatchObject({ state: "complete" });
  });

  it("accepts the legacy id alias", async () => {
    const created = await createJob.run({ template: "chase-up", title: "Digest alias" });
    const digest = await digestCompletedJob.run({ id: created.id });
    expect(digest.message).toContain("Digest ready");
    expect(digest).toMatchObject({ id: created.id, proposed: 0 });
  });

  it("returns 404 for unknown jobs", async () => {
    const failure = await digestCompletedJob.run({ jobId: "job_missing" }).catch((e) => e);
    expect(contractError(failure)).toEqual({ errorCode: "job_not_found", statusCode: 404 });
  });

  it("never auto-completes: a planning job stays planning", async () => {
    const created = await createJob.run({ template: "chase-up", title: "Digest planning" });
    const digest = await digestCompletedJob.run({ jobId: created.id });
    expect(digest.message).toContain("Digest ready");
    expect(digest).toMatchObject({ state: "planning" });
    expect(await getJobState.run({ id: created.id })).toMatchObject({ state: "planning" });
  });

  it("counts thread skips from the job's thread rows", async () => {
    const created = await createJob.run({ template: "chase-up", title: "Digest threads" });
    const db = getDb();
    await db.insert(threads).values({
      id: `th_sensitive_${created.id}`,
      jobId: created.id,
      contactEmail: "alex@example.com",
      sensitive: true,
      stalenessDays: 3,
    });
    await db.insert(threads).values({
      id: `th_stale_${created.id}`,
      jobId: created.id,
      contactEmail: "sam@example.com",
      sensitive: false,
      stalenessDays: 70,
    });
    const digest = await digestCompletedJob.run({ jobId: created.id });
    expect(digest).toMatchObject({
      openThreads: 2,
      skippedSensitive: 1,
      skippedStale: 1,
    });
  });
});

describe("buildDigest pure counter", () => {
  it("counts edited as approved and stale at the SMART boundary", () => {
    const counts = buildDigest(
      [
        { status: "approved" },
        { status: "edited" },
        { status: "rejected" },
        { status: "pending_review" },
      ],
      ["eff_a", "eff_a", "eff_b"],
      [
        { sensitive: true, stalenessDays: 1 },
        { sensitive: false, stalenessDays: 60 },
        { sensitive: false, stalenessDays: 5 },
      ],
    );
    expect(counts).toMatchObject({
      proposed: 4,
      approved: 2,
      rejected: 1,
      pending: 1,
      executed: 2,
      openThreads: 3,
      skippedSensitive: 1,
      skippedStale: 1,
    });
  });
});

describe("nightly sweep skeleton", () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  afterAll(async () => {
    await closeDbExec();
  });

  it("converges on one planning row with the nightly-sweep template", async () => {
    const first = await ensureNightlySweepJob();
    const second = await ensureNightlySweepJob();
    expect(first.id).toBe(NIGHTLY_SWEEP_JOB_ID);
    expect(second.id).toBe(NIGHTLY_SWEEP_JOB_ID);

    const db = getDb();
    const rows = await db.select().from(jobs).where(eq(jobs.id, NIGHTLY_SWEEP_JOB_ID));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "planning",
      template: NIGHTLY_SWEEP_TEMPLATE,
    });
  });
});

describe("job digest section", () => {
  it("renders Job digest plus the approved count without client JS", () => {
    const html = renderToStaticMarkup(
      createElement(JobDigest, {
        digest: {
          message: "Digest ready: 1 approved, 1 rejected (2 proposed, 0 sent)",
          approved: 1,
          rejected: 1,
          proposed: 2,
          pending: 0,
          executed: 0,
          openThreads: 0,
          skippedSensitive: 0,
          skippedStale: 0,
        },
      }),
    );
    expect(html).toContain("Job digest");
    expect(html).toContain("Digest ready");
    expect(html).toContain("1");
  });

  it("renders nothing when the digest is unavailable", () => {
    const html = renderToStaticMarkup(createElement(JobDigest, { digest: null }));
    expect(html).not.toContain("Job digest");
  });
});
