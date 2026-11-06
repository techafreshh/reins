import { randomUUID } from "node:crypto";

import { defineActionErrors } from "@agent-native/core/action";
import { eq } from "drizzle-orm";

import { getDb } from "../db/index.js";
import { auditEvents, decisions, jobs } from "../db/schema.js";

/**
 * Job lifecycle state machine: planning → running → awaiting_review → complete.
 *
 * Every status write in the app flows through `transitionJob`, so illegal
 * moves and unapproved completions fail with typed 409s (never a 500). The
 * `status` column and the `state` API field are the same value under
 * different names.
 */
export const JOB_STATES = ["planning", "running", "awaiting_review", "complete"] as const;

export type JobState = (typeof JOB_STATES)[number];

export const TRANSITIONS: Record<JobState, readonly JobState[]> = {
  planning: ["running"],
  running: ["awaiting_review"],
  awaiting_review: ["running", "complete"],
  complete: [],
};

/** Pure predicate over the transition table; unknown states never transition. */
export function canTransition(from: string, to: string): boolean {
  const targets = (TRANSITIONS as Record<string, readonly string[]>)[from];
  return targets?.includes(to) ?? false;
}

export const jobErrors = defineActionErrors("job_not_found", "job_paused", "policy_blocked");

type Db = ReturnType<typeof getDb>;

/** The agent-facing follow-up for each state. */
export function nextActionFor(state: string): string {
  switch (state) {
    case "planning":
      return "advance_job";
    case "running":
      return "advance_job";
    case "awaiting_review":
      return "steer_job";
    default:
      return "list_jobs";
  }
}

/**
 * The single writer of job status. Loads the job (missing → 404), rejects
 * pairs outside the transition table (`job_paused` 409), rejects `complete`
 * without a human `approve` row in `decisions` (`policy_blocked` 409),
 * otherwise persists the move, bumps `attemptCount` on the steer bounce
 * (`awaiting_review → running`), and appends a `transition` audit row.
 */
export async function transitionJob(db: Db, id: string, to: JobState) {
  const rows = await db.select().from(jobs).where(eq(jobs.id, id));
  const job = rows[0];
  if (!job) {
    return jobErrors.fail("Job not found.", "job_not_found", { statusCode: 404 });
  }
  const from = job.status;
  if (!canTransition(from, to)) {
    return jobErrors.fail(
      `Cannot move job from "${from}" to "${to}".`,
      "job_paused",
      { statusCode: 409 },
    );
  }
  if (to === "complete") {
    const prior = await db.select().from(decisions).where(eq(decisions.jobId, id));
    if (!prior.some((d) => d.decision === "approve")) {
      return jobErrors.fail(
        "Job completion requires human approval.",
        "policy_blocked",
        { statusCode: 409 },
      );
    }
  }
  const now = new Date().toISOString();
  await db
    .update(jobs)
    .set({
      status: to,
      updatedAt: now,
      ...(from === "awaiting_review" && to === "running"
        ? { attemptCount: (job.attemptCount ?? 0) + 1 }
        : {}),
    })
    .where(eq(jobs.id, id));
  await db.insert(auditEvents).values({
    id: randomUUID(),
    jobId: id,
    kind: "transition",
    payload: JSON.stringify({ from, to }),
  });
  const updated = await db.select().from(jobs).where(eq(jobs.id, id));
  return updated[0]!;
}
