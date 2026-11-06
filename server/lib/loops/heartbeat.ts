import { desc, eq } from "drizzle-orm";

import { recordChange } from "@agent-native/core/server/poll";

import { getDb } from "../../db/index.js";
import { jobs } from "../../db/schema.js";

/**
 * Live-feed heartbeat for running jobs.
 *
 * Framework SSE (`/_agent-native/events`) only pushes changes that happen
 * after a subscriber connects — it never replays history. While at least one
 * job is `running`, this ticks every 2s and emits one visible
 * `{ source: "jobs", type: "change", key: jobId }` frame per running job.
 * The event carries no owner/org/resourceType, so every authenticated SSE
 * subscriber sees it, and the serialized frame always contains the `jobId`.
 * The tick only reads; it never writes domain rows.
 */

let timer: NodeJS.Timeout | null = null;

async function tickOnce(): Promise<void> {
  try {
    const db = getDb();
    const running = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.status, "running"))
      .orderBy(desc(jobs.updatedAt))
      .limit(50);
    for (const job of running) {
      recordChange({ source: "jobs", type: "change", key: job.id });
    }
  } catch {
    // A heartbeat must never break its host; the next tick retries.
  }
}

/** Start the 2s heartbeat. Module-singleton: repeated calls are no-ops. */
export function startJobFeedHeartbeat(intervalMs = 2000): void {
  if (timer) {
    return;
  }
  timer = setInterval(() => {
    void tickOnce();
  }, intervalMs);
  if (typeof timer.unref === "function") {
    timer.unref();
  }
  void tickOnce();
}

/** Stop the heartbeat. Exported for tests; the Nitro plugin never calls it. */
export function stopJobFeedHeartbeat(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
