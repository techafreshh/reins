import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { getDb } from "../../db/index.js";
import { auditEvents, jobs, messages } from "../../db/schema.js";

/**
 * Orchestrator fan-out over tracked `messages` rows (recorded fallback for
 * live `agent-teams` spawns, see `docs/DECISIONS.md` D6).
 *
 * A running job gets exactly one `orchestrator` log row plus one `drafter`
 * and one `tracker` seed row (all with `threadId: ""`, since these are
 * job-scoped agent threads, not chat threads). Reruns converge: roles that
 * already exist for the job are never duplicated.
 */

export interface FeedRow {
  id: string;
  role: string;
  body: string;
  seq: number;
}

export interface GroupedFeed {
  log: FeedRow[];
  agents: {
    drafter: FeedRow[];
    tracker: FeedRow[];
  };
}

/** Project a job's message rows into orchestrator log + per-agent cards, newest first. */
export function groupFeedForJob(messageRows: FeedRow[]): GroupedFeed {
  const sorted = [...messageRows].sort((a, b) => b.seq - a.seq);
  const pick = (role: string): FeedRow[] =>
    sorted.filter((row) => row.role === role);
  return {
    log: pick("orchestrator"),
    agents: {
      drafter: pick("drafter"),
      tracker: pick("tracker"),
    },
  };
}

/**
 * Seed the orchestrator log + Drafter/Tracker rows for a running job.
 * No-ops unless the job exists and its status is `running`; reruns insert
 * nothing once every role is present.
 */
export async function ensureFanout(jobId: string): Promise<void> {
  const db = getDb();
  const jobRows = await db.select().from(jobs).where(eq(jobs.id, jobId));
  const job = jobRows[0];
  if (!job || job.status !== "running") {
    return;
  }
  const existing = await db
    .select()
    .from(messages)
    .where(eq(messages.jobId, jobId));
  const has = (role: string): boolean =>
    existing.some((row) => row.role === role);
  if (has("drafter") && has("tracker")) {
    return;
  }
  const seeds: Array<{ role: string; body: string }> = [];
  if (!has("orchestrator")) {
    seeds.push({
      role: "orchestrator",
      body: "Orchestrator fanned out to Drafter and Tracker.",
    });
  }
  if (!has("drafter")) {
    seeds.push({
      role: "drafter",
      body: "Drafter standing by for follow-up drafts.",
    });
  }
  if (!has("tracker")) {
    seeds.push({
      role: "tracker",
      body: "Tracker standing by for stakeholder tracking.",
    });
  }
  let nextSeq = existing.reduce((max, row) => Math.max(max, row.seq), 0);
  for (const seed of seeds) {
    nextSeq += 1;
    await db.insert(messages).values({
      id: randomUUID(),
      threadId: "",
      jobId,
      role: seed.role,
      body: seed.body,
      seq: nextSeq,
    });
  }
  await db.insert(auditEvents).values({
    id: randomUUID(),
    jobId,
    kind: "fanout",
    payload: JSON.stringify({ agents: ["drafter", "tracker"] }),
  });
}
