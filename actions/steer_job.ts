import { randomUUID } from "node:crypto";

import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { auditEvents, jobs, messages } from "../server/db/schema.js";
import { JOB_STATES, jobErrors, transitionJob } from "../server/lib/state.js";

export default defineAction({
  description: "Append a steering instruction and bounce the job back to running.",
  schema: z.object({
    id: z.string().min(1).describe("Job id, e.g. job_..."),
    instruction: z.string().min(1).describe("Steering instruction for the agent loop"),
  }),
  outputSchema: z.object({
    id: z.string(),
    message: z.string(),
    state: z.enum(JOB_STATES),
    nextRequiredAction: z.string(),
  }),
  errors: jobErrors,
  run: async ({ id, instruction }) => {
    const db = getDb();
    const rows = await db.select().from(jobs).where(eq(jobs.id, id));
    const job = rows[0];
    if (!job) {
      return jobErrors.fail("Job not found.", "job_not_found", { statusCode: 404 });
    }
    if (job.status !== "awaiting_review") {
      return jobErrors.fail(
        `Cannot steer a job in "${job.status}".`,
        "job_paused",
        { statusCode: 409 },
      );
    }
    const existing = await db.select().from(messages).where(eq(messages.jobId, id));
    const nextSeq = existing.reduce((max, row) => Math.max(max, row.seq), 0) + 1;
    await db.insert(messages).values({
      id: randomUUID(),
      threadId: "",
      jobId: id,
      role: "steering",
      body: instruction,
      seq: nextSeq,
    });
    await db.insert(auditEvents).values({
      id: randomUUID(),
      jobId: id,
      kind: "steer",
      payload: JSON.stringify({ instruction }),
    });
    await transitionJob(db, id, "running");
    return {
      id,
      message: "Steering recorded; job back to running",
      state: "running" as const,
      nextRequiredAction: "advance_job",
    };
  },
});
