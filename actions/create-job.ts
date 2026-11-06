// guard:allow-resource-action-access — jobs are single-tenant with no per-job visibility; changeResource only scopes realtime fan-out, not authorization; revisit when per-job visibility is hardened.
import { randomUUID } from "node:crypto";

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { auditEvents, jobs } from "../server/db/schema.js";
import { JOB_STATES, jobErrors } from "../server/lib/state.js";

export default defineAction({
  description: "Create a chase-up job in planning.",
  schema: z.object({
    template: z.string().min(1).default("chase-up").describe("Job template, e.g. chase-up"),
    title: z.string().min(1).default("Chase-up sweep").describe("Job title"),
  }),
  outputSchema: z.object({
    id: z.string(),
    message: z.string(),
    state: z.enum(JOB_STATES),
    nextRequiredAction: z.string(),
  }),
  errors: jobErrors,
  changeResource: (_input, result) =>
    result ? { resourceType: "job", resourceId: result.id } : undefined,
  run: async ({ template, title }) => {
    const db = getDb();
    const id = `job_${randomUUID()}`;
    const now = new Date().toISOString();
    await db.insert(jobs).values({
      id,
      status: "planning",
      template,
      title,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(auditEvents).values({
      id: randomUUID(),
      jobId: id,
      kind: "create",
      payload: JSON.stringify({ template, title }),
    });
    return {
      id,
      message: "Job created in planning",
      state: "planning" as const,
      nextRequiredAction: "advance-job",
    };
  },
});
