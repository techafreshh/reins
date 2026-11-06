import { defineAction } from "@agent-native/core/action";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { jobs } from "../server/db/schema.js";
import { JOB_STATES, jobErrors } from "../server/lib/state.js";

const jobSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  state: z.enum(JOB_STATES),
  updatedAt: z.string(),
});

export default defineAction({
  description: "List jobs newest-first, optionally filtered by state.",
  schema: z.object({
    state: z.enum(JOB_STATES).optional().describe("Filter by job state"),
    limit: z.coerce.number().int().min(1).max(200).default(50).describe("Max jobs to return"),
  }),
  outputSchema: z.array(jobSummarySchema),
  errors: jobErrors,
  http: { method: "GET" },
  run: async ({ state, limit }) => {
    const db = getDb();
    const rows = await (state
      ? db
          .select()
          .from(jobs)
          .where(eq(jobs.status, state))
          .orderBy(desc(jobs.updatedAt))
          .limit(limit)
      : db.select().from(jobs).orderBy(desc(jobs.updatedAt)).limit(limit));
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      state: row.status as (typeof JOB_STATES)[number],
      updatedAt: row.updatedAt,
    }));
  },
});
