// guard:allow-resource-action-access — jobs are single-tenant with no per-job visibility; changeResource only scopes realtime fan-out, not authorization; revisit when per-job visibility is hardened.
import { randomUUID } from "node:crypto";

import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { auditEvents, jobs, messages } from "../server/db/schema.js";
import { pipeSteeringToLiveThread } from "../server/lib/chat-bridge.js";
import { JOB_STATES, jobErrors, transitionJob } from "../server/lib/state.js";

export default defineAction({
  description: "Append a steering instruction; running jobs stay running.",
  schema: z
    .object({
      id: z.string().min(1).optional().describe("Job id, e.g. job_... (legacy alias)"),
      jobId: z.string().min(1).optional().describe("Job id, e.g. job_..."),
      instruction: z.string().min(1).describe("Steering instruction for the agent loop"),
    })
    .refine((v) => Boolean(v.jobId ?? v.id), {
      message: "Provide jobId (or legacy id).",
    }),
  outputSchema: z.object({
    id: z.string(),
    message: z.string(),
    state: z.enum(JOB_STATES),
    nextRequiredAction: z.string(),
  }),
  errors: jobErrors,
  changeResource: (input) => ({ resourceType: "job", resourceId: input.jobId ?? input.id ?? "" }),
  run: async (input) => {
    const jobId = input.jobId ?? input.id ?? "";
    const { instruction } = input;
    const db = getDb();
    const rows = await db.select().from(jobs).where(eq(jobs.id, jobId));
    const job = rows[0];
    if (!job) {
      return jobErrors.fail("Job not found.", "job_not_found", { statusCode: 404 });
    }
    if (job.status !== "running" && job.status !== "awaiting_review") {
      return jobErrors.fail(
        `Cannot steer a job in "${job.status}".`,
        "job_paused",
        { statusCode: 409 },
      );
    }
    const existing = await db.select().from(messages).where(eq(messages.jobId, jobId));
    const nextSeq = existing.reduce((max, row) => Math.max(max, row.seq), 0) + 1;
    await db.insert(messages).values({
      id: randomUUID(),
      threadId: "",
      jobId,
      role: "steering",
      body: instruction,
      seq: nextSeq,
    });
    await db.insert(auditEvents).values({
      id: randomUUID(),
      jobId,
      kind: "steer",
      payload: JSON.stringify({ instruction }),
    });
    if (job.status === "awaiting_review") {
      await transitionJob(db, jobId, "running");
    }
    try {
      await pipeSteeringToLiveThread(jobId, instruction);
    } catch {
      // The bridge never throws; steering persistence above is authoritative.
    }
    return {
      id: jobId,
      message: "Steering acknowledged",
      state: "running" as const,
      nextRequiredAction: "advance-job",
    };
  },
});
