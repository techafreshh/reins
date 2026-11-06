import { defineAction } from "@agent-native/core/action";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { learnings } from "../server/db/schema.js";
import { learningErrors, LEARNING_STATUS } from "../server/lib/learnings.js";

const learningRowSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  rule: z.string(),
  fromEffectId: z.string(),
  status: z.string(),
  updatedAt: z.string(),
});

export default defineAction({
  description: "List learning proposals newest-first, optionally filtered by job or status.",
  schema: z.object({
    jobId: z.string().min(1).optional().describe("Filter by job id"),
    status: z.enum(LEARNING_STATUS).optional().describe("Filter by learning status"),
  }),
  outputSchema: z.array(learningRowSchema),
  errors: learningErrors,
  http: { method: "GET" },
  run: async ({ jobId, status }) => {
    const db = getDb();
    const rows = await db.select().from(learnings).orderBy(desc(learnings.updatedAt));
    return rows
      .filter((row) => (jobId ? row.jobId === jobId : true))
      .filter((row) => (status ? row.status === status : true))
      .map((row) => ({
        id: row.id,
        jobId: row.jobId,
        rule: row.rule,
        fromEffectId: row.fromEffectId,
        status: row.status,
        updatedAt: row.updatedAt,
      }));
  },
});
