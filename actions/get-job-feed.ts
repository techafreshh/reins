import { defineAction } from "@agent-native/core/action";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { jobs, messages } from "../server/db/schema.js";
import { ensureFanout, groupFeedForJob } from "../server/lib/loops/orchestrator.js";
import { JOB_STATES, jobErrors } from "../server/lib/state.js";

const feedRowSchema = z.object({
  id: z.string(),
  role: z.string(),
  body: z.string(),
  seq: z.number(),
});

export default defineAction({
  description: "Read a job's live orchestrator log plus Drafter/Tracker agent cards.",
  schema: z.object({
    id: z.string().min(1).describe("Job id, e.g. job_..."),
  }),
  outputSchema: z.object({
    id: z.string(),
    title: z.string(),
    state: z.enum(JOB_STATES),
    log: z.array(feedRowSchema),
    agents: z.object({
      drafter: z.array(feedRowSchema),
      tracker: z.array(feedRowSchema),
    }),
    cards: z.array(
      z.object({
        id: z.string(),
        agent: z.string(),
        body: z.string(),
        seq: z.number(),
      }),
    ),
  }),
  errors: jobErrors,
  http: { method: "GET" },
  changeResource: (input) => ({ resourceType: "job", resourceId: input.id }),
  run: async ({ id }) => {
    const db = getDb();
    const rows = await db.select().from(jobs).where(eq(jobs.id, id));
    const job = rows[0];
    if (!job) {
      return jobErrors.fail("Job not found.", "job_not_found", { statusCode: 404 });
    }
    if (job.status === "running") {
      // Covers jobs that entered `running` before the fan-out hook existed
      // (including the seeded demo job): the feed reads converge on read.
      await ensureFanout(id);
    }
    const messageRows = await db
      .select()
      .from(messages)
      .where(eq(messages.jobId, id))
      .orderBy(asc(messages.seq));
    const grouped = groupFeedForJob(
      messageRows.map((row) => ({
        id: row.id,
        role: row.role,
        body: row.body,
        seq: row.seq,
      })),
    );
    const cards = [...grouped.agents.drafter, ...grouped.agents.tracker]
      .sort((a, b) => b.seq - a.seq)
      .map((row) => ({ id: row.id, agent: row.role, body: row.body, seq: row.seq }));
    return {
      id: job.id,
      title: job.title,
      state: job.status as (typeof JOB_STATES)[number],
      log: grouped.log,
      agents: grouped.agents,
      cards,
    };
  },
});
