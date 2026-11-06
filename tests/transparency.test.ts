import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isActionContractError } from "@agent-native/core/action";
import { closeDbExec, getDbExec } from "@agent-native/core/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import advanceJob from "../actions/advance_job.js";
import createJob from "../actions/create_job.js";
import decideEffect from "../actions/decide_effect.js";
import listAudit from "../actions/list_audit.js";
import listJobs from "../actions/list_jobs.js";
import proposeEffect from "../actions/propose_effect.js";
import steerJob from "../actions/steer_job.js";
import { getDb } from "../server/db/index.js";
import { decisions, jobs } from "../server/db/schema.js";
import { DEMO_JOB_ID, DEMO_THREADS, seedDemo } from "../server/lib/demo.js";
import { canTransition, JOB_STATES, TRANSITIONS } from "../server/lib/state.js";

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

describe("transparency", () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  afterAll(async () => {
    await closeDbExec();
  });

  it("state-machine", async () => {
    // The full 4x4 matrix: only the four documented moves are legal.
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
    expect(TRANSITIONS.planning).toEqual(["running"]);
    expect(TRANSITIONS.running).toEqual(["awaiting_review"]);
    expect([...TRANSITIONS.awaiting_review].sort()).toEqual(["complete", "running"]);
    expect(TRANSITIONS.complete).toEqual([]);

    // The single documented backward move: the steer bounce
    // `awaiting_review -> running` via `steer_job`.
    const created = await createJob.run({ template: "chase-up", title: "State matrix sweep" });
    await advanceJob.run({ id: created.id, to: "running" });
    await advanceJob.run({ id: created.id, to: "awaiting_review" });
    const steered = await steerJob.run({ id: created.id, instruction: "Hold the chase." });
    expect(steered).toMatchObject({ id: created.id, state: "running" });

    // Every other backward move stays rejected.
    const backward = await advanceJob.run({ id: created.id, to: "complete" }).catch((e) => e);
    // `running -> complete` is outside the transition table (`job_paused` 409).
    expect(contractError(backward)).toEqual({ errorCode: "job_paused", statusCode: 409 });
  });

  it("policy-gate", async () => {
    const created = await createJob.run({ template: "chase-up", title: "Policy gated sweep" });
    await advanceJob.run({ id: created.id, to: "running" });
    await advanceJob.run({ id: created.id, to: "awaiting_review" });

    // No human approval yet: completion fails closed.
    const blocked = await advanceJob.run({ id: created.id, to: "complete" }).catch((e) => e);
    expect(contractError(blocked)).toEqual({ errorCode: "policy_blocked", statusCode: 409 });

    // A human approve decision opens the gate.
    const proposed = await proposeEffect.run({
      jobId: created.id,
      capability: "send_followup",
      payload: { threadId: "th_1", to: "priya@example.com", subject: "Hi", body: "short nudge" },
    });
    await decideEffect.run({ effectId: proposed.id, decision: "approve" });

    const done = await advanceJob.run({ id: created.id, to: "complete" });
    expect(done).toMatchObject({ id: created.id, state: "complete" });
  });

  it("decision-idempotency", async () => {
    const created = await createJob.run({ template: "chase-up", title: "Idempotent review" });
    const proposed = await proposeEffect.run({
      jobId: created.id,
      capability: "send_followup",
      payload: { threadId: "th_1", to: "priya@example.com", subject: "Hi", body: "short nudge" },
    });

    await decideEffect.run({ effectId: proposed.id, decision: "approve" });
    // Retry with the same decision: no second `decisions` row.
    await decideEffect.run({ effectId: proposed.id, decision: "approve" });

    const db = getDb();
    const rows = await db.select().from(decisions).where(eq(decisions.effectId, proposed.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ decision: "approve" });
  });

  it("seed-determinism", async () => {
    const first = await seedDemo();
    const second = await seedDemo();

    expect(first.jobId).toBe(DEMO_JOB_ID);
    expect(second.threadIds).toEqual(first.threadIds);
    expect(second.threadIds).toEqual(DEMO_THREADS.map((t) => t.id));

    const db = getDb();
    const rows = await db.select().from(jobs).where(eq(jobs.id, DEMO_JOB_ID));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: DEMO_JOB_ID, title: "Chase-up sweep", status: "running" });

    // The jobs board and the audit trail read the same seeded world.
    const listed = await listJobs.run({ limit: 50 });
    expect(listed.map((row) => row.id)).toContain(DEMO_JOB_ID);
    expect(listed.find((row) => row.id === DEMO_JOB_ID)).toMatchObject({
      title: "Chase-up sweep",
      state: "running",
    });

    const audit = await listAudit.run({});
    expect(audit.length).toBeGreaterThan(0);
    const stamps = audit.map((row) => row.createdAt);
    expect([...stamps].sort()).toEqual(stamps);
    expect(audit.filter((row) => row.jobId === DEMO_JOB_ID).length).toBeGreaterThan(0);
  });
});
