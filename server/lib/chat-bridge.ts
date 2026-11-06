import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { getDb } from "../db/index.js";
import { auditEvents, jobs } from "../db/schema.js";

/**
 * Best-effort pipe from `steer_job` into the job's live thread.
 *
 * Delivery is queue-not-interrupt (see `docs/DECISIONS.md` D1/D7): steering
 * is plan recalibration, not cancellation, so the instruction is recorded
 * for the running loop to claim at its next tool boundary
 * (`deliverInActiveRun` semantics) and the run is never aborted
 * (`interruptActiveRun` would risk double-sending chase emails).
 *
 * This bridge stays dependency-light (only `server/db` + schema) and never
 * throws: a failed pipe must never fail the steer that requested it.
 */
export async function pipeSteeringToLiveThread(
  jobId: string,
  instruction: string,
): Promise<{ delivered: boolean; mode: "queued" }> {
  try {
    const db = getDb();
    const rows = await db.select().from(jobs).where(eq(jobs.id, jobId));
    if (!rows[0]) {
      return { delivered: false, mode: "queued" };
    }
    await db.insert(auditEvents).values({
      id: randomUUID(),
      jobId,
      kind: "steer_queued",
      payload: JSON.stringify({ instruction, mode: "queued", via: "deliverInActiveRun" }),
    });
    return { delivered: true, mode: "queued" };
  } catch {
    return { delivered: false, mode: "queued" };
  }
}
