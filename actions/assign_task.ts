import { randomUUID } from "node:crypto";

import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { auditEvents, jobs, messages } from "../server/db/schema.js";
import { jobErrors } from "../server/lib/state.js";

export default defineAction({
  description: "Assign a follow-up card to the Drafter or Tracker agent thread.",
  schema: z.object({
    jobId: z.string().min(1).describe("Job id, e.g. job_..."),
    agent: z.enum(["drafter", "tracker"]).describe("Agent thread to append the card to"),
    task: z.string().min(1).describe("Follow-up task for the agent"),
  }),
  outputSchema: z.object({
    id: z.string(),
    message: z.string(),
    jobId: z.string(),
    agent: z.enum(["drafter", "tracker"]),
    nextRequiredAction: z.string(),
  }),
  errors: jobErrors,
  changeResource: (input) => ({ resourceType: "job", resourceId: input.jobId }),
  run: async ({ jobId, agent, task }) => {
    const db = getDb();
    const rows = await db.select().from(jobs).where(eq(jobs.id, jobId));
    const job = rows[0];
    if (!job) {
      return jobErrors.fail("Job not found.", "job_not_found", { statusCode: 404 });
    }
    if (job.status === "complete") {
      return jobErrors.fail(
        "Cannot assign a task on a complete job.",
        "job_paused",
        { statusCode: 409 },
      );
    }
    const existing = await db.select().from(messages).where(eq(messages.jobId, jobId));
    const nextSeq = existing.reduce((max, row) => Math.max(max, row.seq), 0) + 1;
    const id = randomUUID();
    await db.insert(messages).values({
      id,
      threadId: "",
      jobId,
      role: agent,
      body: task,
      seq: nextSeq,
    });
    await db.insert(auditEvents).values({
      id: randomUUID(),
      jobId,
      kind: "assign",
      payload: JSON.stringify({ agent, task }),
    });
    return {
      id,
      message: `Task assigned to ${agent}`,
      jobId,
      agent,
      nextRequiredAction: "get_job_feed",
    };
  },
});
