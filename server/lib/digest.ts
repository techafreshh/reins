import { eq } from "drizzle-orm";

import { auditEvents, jobs, proposedEffects, threads } from "../db/index.js";
import { getDb } from "../db/index.js";
import { EFFECT_STATUS } from "./effects.js";
import { SMART_MAX_STALENESS_DAYS } from "./policy.js";
import { JOB_STATES, jobErrors, type JobState } from "./state.js";

/**
 * Input rows for the pure digest counter. Effects carry only their status,
 * execute rows carry distinct effect ids, and threads carry the two skip
 * signals — so the counter stays free of DB imports like `groupFeedForJob`.
 */
export interface DigestEffectInput {
  status: string;
}

export interface DigestThreadInput {
  sensitive: boolean;
  stalenessDays: number;
}

export interface DigestCounts {
  proposed: number;
  approved: number;
  rejected: number;
  pending: number;
  executed: number;
  openThreads: number;
  skippedSensitive: number;
  skippedStale: number;
}

/**
 * Pure counter over a job's rows. The human-approved family is `approved`
 * plus `edited` (edit-approve counts as approval, matching the execute
 * gate); `rejected` counts `rejected` only. Stale threads are those at or
 * past `SMART_MAX_STALENESS_DAYS`.
 */
export function buildDigest(
  effects: DigestEffectInput[],
  executeEffectIds: string[],
  threadRows: DigestThreadInput[],
): DigestCounts {
  let approved = 0;
  let rejected = 0;
  let pending = 0;
  for (const effect of effects) {
    if (effect.status === "approved" || effect.status === "edited") {
      approved += 1;
    } else if (effect.status === "rejected") {
      rejected += 1;
    } else if (effect.status === "pending_review") {
      pending += 1;
    }
  }
  void EFFECT_STATUS;
  return {
    proposed: effects.length,
    approved,
    rejected,
    pending,
    executed: new Set(executeEffectIds).size,
    openThreads: threadRows.length,
    skippedSensitive: threadRows.filter((row) => row.sensitive).length,
    skippedStale: threadRows.filter((row) => row.stalenessDays >= SMART_MAX_STALENESS_DAYS).length,
  };
}

export interface JobDigest extends DigestCounts {
  id: string;
  title: string;
  state: JobState;
  message: string;
}

/** Shape the digest message; `Digest ready` is the probe-visible prefix. */
export function digestMessage(counts: DigestCounts): string {
  return `Digest ready: ${counts.approved} approved, ${counts.rejected} rejected (${counts.proposed} proposed, ${counts.executed} sent)`;
}

/**
 * Read-only synthesis over a job's existing rows. Missing jobs throw the
 * shared 404; the digest never writes and never transitions state, so it is
 * safe to call from any lifecycle state including `complete`.
 */
export async function readDigestForJob(jobId: string): Promise<JobDigest> {
  const db = getDb();
  const jobRows = await db.select().from(jobs).where(eq(jobs.id, jobId));
  const job = jobRows[0];
  if (!job) {
    throw jobErrors.fail("Job not found.", "job_not_found", { statusCode: 404 });
  }
  const effects = await db.select().from(proposedEffects).where(eq(proposedEffects.jobId, jobId));
  const audits = await db.select().from(auditEvents).where(eq(auditEvents.jobId, jobId));
  const executeEffectIds: string[] = [];
  for (const row of audits) {
    if (row.kind !== "execute") {
      continue;
    }
    try {
      const payload = JSON.parse(row.payload) as { effectId?: unknown };
      if (typeof payload.effectId === "string" && payload.effectId.length > 0) {
        executeEffectIds.push(payload.effectId);
      }
    } catch {
      // Malformed audit payloads never break the digest.
    }
  }
  const threadRows = await db.select().from(threads).where(eq(threads.jobId, jobId));
  const counts = buildDigest(
    effects.map((row) => ({ status: row.status })),
    executeEffectIds,
    threadRows.map((row) => ({
      sensitive: row.sensitive,
      stalenessDays: row.stalenessDays,
    })),
  );
  void JOB_STATES;
  return {
    id: job.id,
    title: job.title,
    state: job.status as JobState,
    message: digestMessage(counts),
    ...counts,
  };
}
