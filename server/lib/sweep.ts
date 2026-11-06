import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { getDb } from "../db/index.js";
import { auditEvents, jobs } from "../db/schema.js";

/**
 * Nightly-sweep skeleton: a single seeded row instead of a live cron.
 * The fixed id keeps the ensure idempotent and probe-observable — reruns
 * converge on one row, mirroring the `seedDemo` convergence idiom.
 */
export const NIGHTLY_SWEEP_JOB_ID = "sweep-job-nightly-001";
export const NIGHTLY_SWEEP_TEMPLATE = "nightly-sweep";
export const NIGHTLY_SWEEP_TITLE = "Nightly sweep";

export interface SweepEnsureResult {
  id: string;
  created: boolean;
}

/**
 * Idempotent seeded sweep job. Selects the fixed-id row first; inserts it
 * (`status: "planning"`) with one `sweep.ensure` audit row only when newly
 * created. Never throws beyond the caller's control — the Nitro plugin
 * swallows failures so boot never fails.
 */
export async function ensureNightlySweepJob(): Promise<SweepEnsureResult> {
  const db = getDb();
  const existing = await db.select().from(jobs).where(eq(jobs.id, NIGHTLY_SWEEP_JOB_ID));
  if (existing[0]) {
    return { id: NIGHTLY_SWEEP_JOB_ID, created: false };
  }
  const now = new Date().toISOString();
  await db
    .insert(jobs)
    .values({
      id: NIGHTLY_SWEEP_JOB_ID,
      status: "planning",
      template: NIGHTLY_SWEEP_TEMPLATE,
      title: NIGHTLY_SWEEP_TITLE,
      summary: "Seeded nightly sweep skeleton: review open threads and synthesize a digest.",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: jobs.id });
  const after = await db.select().from(jobs).where(eq(jobs.id, NIGHTLY_SWEEP_JOB_ID));
  if (!after[0]) {
    return { id: NIGHTLY_SWEEP_JOB_ID, created: false };
  }
  const audits = await db.select().from(auditEvents).where(eq(auditEvents.jobId, NIGHTLY_SWEEP_JOB_ID));
  const hasEnsure = audits.some((row) => row.kind === "sweep.ensure");
  if (!hasEnsure) {
    await db.insert(auditEvents).values({
      id: randomUUID(),
      jobId: NIGHTLY_SWEEP_JOB_ID,
      kind: "sweep.ensure",
      payload: JSON.stringify({ template: NIGHTLY_SWEEP_TEMPLATE }),
    });
  }
  return { id: NIGHTLY_SWEEP_JOB_ID, created: true };
}
