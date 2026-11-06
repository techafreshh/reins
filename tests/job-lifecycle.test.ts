import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isActionContractError } from "@agent-native/core/action";
import { closeDbExec, getDbExec } from "@agent-native/core/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import advanceJob from "../actions/advance_job.js";
import createJob from "../actions/create_job.js";
import getJobState from "../actions/get_job_state.js";
import listJobs from "../actions/list_jobs.js";
import steerJob from "../actions/steer_job.js";
import { getDb } from "../server/db/index.js";
import { decisions, messages } from "../server/db/schema.js";
import { canTransition, JOB_STATES, nextActionFor, TRANSITIONS } from "../server/lib/state.js";

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

describe("job lifecycle state machine", () => {
  it("declares exactly the four lifecycle states", () => {
    expect([...JOB_STATES]).toEqual(["planning", "running", "awaiting_review", "complete"]);
  });

  it("allows exactly the four legal transitions", () => {
    expect(canTransition("planning", "running")).toBe(true);
    expect(canTransition("running", "awaiting_review")).toBe(true);
    expect(canTransition("awaiting_review", "running")).toBe(true);
    expect(canTransition("awaiting_review", "complete")).toBe(true);
    expect(TRANSITIONS.planning).toEqual(["running"]);
    expect(TRANSITIONS.running).toEqual(["awaiting_review"]);
    expect([...TRANSITIONS.awaiting_review].sort()).toEqual(["complete", "running"]);
    expect(TRANSITIONS.complete).toEqual([]);
  });

  it("rejects every other pair in the 4x4 matrix", () => {
    const legal = new Set([
      "planning>running",
      "running>awaiting_review",
      "awaiting_review>running",
      "awaiting_review>complete",
    ]);
    for (const from of JOB_STATES) {
      for (const to of JOB_STATES) {
        expect(canTransition(from, to)).toBe(legal.has(`${from}>${to}`));
      }
    }
    expect(canTransition("planning", "complete")).toBe(false);
    expect(canTransition("planning", "planning")).toBe(false);
    expect(canTransition("complete", "running")).toBe(false);
    expect(canTransition("proposed", "running")).toBe(false);
  });

  it("maps each state to its next required action", () => {
    expect(nextActionFor("planning")).toBe("advance_job");
    expect(nextActionFor("running")).toBe("advance_job");
    expect(nextActionFor("awaiting_review")).toBe("steer_job");
    expect(nextActionFor("complete")).toBe("list_jobs");
  });
});

describe("job lifecycle actions", () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  afterAll(async () => {
    await closeDbExec();
  });

  it("creates a job in planning with a job_ id", async () => {
    const created = await createJob.run({ template: "chase-up", title: "Post-launch sweep" });
    expect(created.id.startsWith("job_")).toBe(true);
    expect(created.message).toBe("Job created in planning");
    expect(created.state).toBe("planning");
    expect(created.nextRequiredAction).toBe("advance_job");

    const state = await getJobState.run({ id: created.id });
    expect(state).toMatchObject({ id: created.id, title: "Post-launch sweep", state: "planning" });
  });

  it("lists created jobs", async () => {
    const created = await createJob.run({ template: "chase-up", title: "Listable sweep" });
    const listed = await listJobs.run({ limit: 50 });
    expect(listed.map((row) => row.id)).toContain(created.id);
    const entry = listed.find((row) => row.id === created.id)!;
    expect(entry).toMatchObject({ title: "Listable sweep", state: "planning" });
    expect(typeof entry.updatedAt).toBe("string");
  });

  it("advances planning to awaiting_review, then steer bounces back to running", async () => {
    const created = await createJob.run({ template: "chase-up", title: "Steer me" });

    const running = await advanceJob.run({ id: created.id, to: "running" });
    expect(running.state).toBe("running");

    const waiting = await advanceJob.run({ id: created.id, to: "awaiting_review" });
    expect(waiting.state).toBe("awaiting_review");
    expect(await getJobState.run({ id: created.id })).toMatchObject({ state: "awaiting_review" });

    const steered = await steerJob.run({ id: created.id, instruction: "Skip sensitive contacts." });
    expect(steered).toMatchObject({
      id: created.id,
      message: "Steering acknowledged",
      state: "running",
      nextRequiredAction: "advance_job",
    });
    expect(await getJobState.run({ id: created.id })).toMatchObject({ state: "running" });

    const db = getDb();
    const steering = await db.select().from(messages).where(eq(messages.jobId, created.id));
    expect(steering.map((row) => row.body)).toContain("Skip sensitive contacts.");
    expect(steering.find((row) => row.body === "Skip sensitive contacts.")?.role).toBe("steering");
  });

  it("refuses complete without a human approval decision", async () => {
    const created = await createJob.run({ template: "chase-up", title: "Needs approval" });
    await advanceJob.run({ id: created.id, to: "running" });
    await advanceJob.run({ id: created.id, to: "awaiting_review" });

    const failure = await advanceJob.run({ id: created.id, to: "complete" }).catch((e) => e);
    expect(contractError(failure)).toEqual({ errorCode: "policy_blocked", statusCode: 409 });
    expect(await getJobState.run({ id: created.id })).toMatchObject({ state: "awaiting_review" });
  });

  it("completes with an approve decision row", async () => {
    const created = await createJob.run({ template: "chase-up", title: "Approved sweep" });
    await advanceJob.run({ id: created.id, to: "running" });
    await advanceJob.run({ id: created.id, to: "awaiting_review" });

    const db = getDb();
    await db.insert(decisions).values({
      id: randomUUID(),
      jobId: created.id,
      effectId: "",
      decision: "approve",
      reason: "Human reviewed the chase plan.",
    });

    const done = await advanceJob.run({ id: created.id, to: "complete" });
    expect(done).toMatchObject({
      id: created.id,
      state: "complete",
      nextRequiredAction: "list_jobs",
    });
    expect(await getJobState.run({ id: created.id })).toMatchObject({ state: "complete" });
  });

  it("rejects planning to complete as an illegal transition", async () => {
    const created = await createJob.run({ template: "chase-up", title: "Too fast" });
    const failure = await advanceJob.run({ id: created.id, to: "complete" }).catch((e) => e);
    expect(contractError(failure)).toEqual({ errorCode: "job_paused", statusCode: 409 });
  });

  it("rejects steering outside awaiting_review", async () => {
    const created = await createJob.run({ template: "chase-up", title: "Not waiting" });
    const failure = await steerJob.run({ id: created.id, instruction: "Go." }).catch((e) => e);
    expect(contractError(failure)).toEqual({ errorCode: "job_paused", statusCode: 409 });
  });

  it("returns 404 for unknown job ids", async () => {
    const missing = await getJobState.run({ id: "job_missing" }).catch((e) => e);
    expect(contractError(missing)).toEqual({ errorCode: "job_not_found", statusCode: 404 });

    const advanceMissing = await advanceJob
      .run({ id: "job_missing", to: "running" })
      .catch((e) => e);
    expect(contractError(advanceMissing)).toEqual({ errorCode: "job_not_found", statusCode: 404 });
  });
});
