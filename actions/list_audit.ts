import { defineAction } from "@agent-native/core/action";
import { asc } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { auditEvents } from "../server/db/schema.js";

const auditEntrySchema = z.object({
  id: z.string(),
  jobId: z.string(),
  kind: z.string(),
  payload: z.string(),
  createdAt: z.string(),
});

export default defineAction({
  description: "List audit events oldest-first, optionally filtered by job.",
  schema: z.object({
    jobId: z.string().min(1).optional().describe("Filter by job id"),
    kind: z.string().min(1).optional().describe("Filter by event kind, e.g. decide"),
    limit: z.coerce.number().int().min(1).max(200).default(100).describe("Max events to return"),
  }),
  outputSchema: z.array(auditEntrySchema),
  http: { method: "GET" },
  run: async ({ jobId, kind, limit }) => {
    const db = getDb();
    const rows = await db.select().from(auditEvents).orderBy(asc(auditEvents.createdAt));
    return rows
      .filter((row) => (jobId ? row.jobId === jobId : true))
      .filter((row) => (kind ? row.kind === kind : true))
      .slice(0, limit)
      .map((row) => ({
        id: row.id,
        jobId: row.jobId,
        kind: row.kind,
        payload: row.payload,
        createdAt: row.createdAt,
      }));
  },
});
