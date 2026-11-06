import { defineAction } from "@agent-native/core/action";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { auditEvents, jobs } from "../server/db/schema.js";
import { JOB_STATES, jobErrors, nextActionFor } from "../server/lib/state.js";

const auditRowSchema = z.object({
  kind: z.string(),
  payload: z.string(),
  createdAt: z.string(),
});

export default defineAction({
  description: "Read a job's current lifecycle state.",
  schema: z.object({
    id: z.string().min(1).describe("Job id, e.g. job_..."),
  }),
  outputSchema: z.object({
    id: z.string(),
    title: z.string(),
    state: z.enum(JOB_STATES),
    message: z.string(),
    nextRequiredAction: z.string(),
    audit: z.array(auditRowSchema),
  }),
  errors: jobErrors,
  http: { method: "GET" },
  run: async ({ id }) => {
    const db = getDb();
    const rows = await db.select().from(jobs).where(eq(jobs.id, id));
    const job = rows[0];
    if (!job) {
      return jobErrors.fail("Job not found.", "job_not_found", { statusCode: 404 });
    }
    const state = job.status as (typeof JOB_STATES)[number];
    const audit = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.jobId, id))
      .orderBy(asc(auditEvents.createdAt));
    return {
      id: job.id,
      title: job.title,
      state,
      message: `Job is ${state}`,
      nextRequiredAction: nextActionFor(state),
      audit: audit.map((row) => ({
        kind: row.kind,
        payload: row.payload,
        createdAt: row.createdAt,
      })),
    };
  },
});
