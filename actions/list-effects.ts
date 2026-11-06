import { defineAction } from "@agent-native/core/action";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { proposedEffects } from "../server/db/index.js";
import { sendFollowupPayloadSchema } from "../server/lib/effects.js";
import { jobErrors } from "../server/lib/state.js";

const effectRowSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  capability: z.string(),
  status: z.string(),
  payload: sendFollowupPayloadSchema,
  to: z.string(),
  subject: z.string(),
  updatedAt: z.string(),
});

export default defineAction({
  description: "List proposed effects newest-first, optionally filtered.",
  schema: z.object({
    effectId: z.string().min(1).optional().describe("Filter to a single effect id"),
    jobId: z.string().min(1).optional().describe("Filter by job id"),
    status: z.string().min(1).optional().describe("Filter by effect status"),
  }),
  outputSchema: z.array(effectRowSchema),
  errors: jobErrors,
  http: { method: "GET" },
  run: async ({ effectId, jobId, status }) => {
    const db = getDb();
    const rows = await db
      .select()
      .from(proposedEffects)
      .orderBy(desc(proposedEffects.updatedAt));
    return rows
      .filter((row) => (effectId ? row.id === effectId : true))
      .filter((row) => (jobId ? row.jobId === jobId : true))
      .filter((row) => (status ? row.status === status : true))
      .map((row) => {
        const payload = sendFollowupPayloadSchema.parse(JSON.parse(row.payload));
        return {
          id: row.id,
          jobId: row.jobId,
          capability: row.kind,
          status: row.status,
          payload,
          to: payload.to,
          subject: payload.subject,
          updatedAt: row.updatedAt,
        };
      });
  },
});
