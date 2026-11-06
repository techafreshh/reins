import { randomUUID } from "node:crypto";

import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { auditEvents, jobs, proposedEffects } from "../server/db/index.js";
import { EFFECT_STATUS, newEffectId, sendFollowupPayloadSchema } from "../server/lib/effects.js";
import { jobErrors } from "../server/lib/state.js";

export default defineAction({
  description: "Propose an outward effect for human review. It stays pending until decided.",
  schema: z.object({
    jobId: z.string().min(1).describe("Job id, e.g. job_..."),
    capability: z.enum(["send_followup"]).describe("Effect capability"),
    payload: sendFollowupPayloadSchema.describe("Effect payload"),
  }),
  outputSchema: z.object({
    id: z.string(),
    message: z.string(),
    status: z.enum(EFFECT_STATUS),
  }),
  errors: jobErrors,
  changeResource: (input, result) =>
    result ? { resourceType: "job", resourceId: input.jobId } : undefined,
  run: async ({ jobId, capability, payload }) => {
    const db = getDb();
    const rows = await db.select().from(jobs).where(eq(jobs.id, jobId));
    const job = rows[0];
    if (!job) {
      return jobErrors.fail("Job not found.", "job_not_found", { statusCode: 404 });
    }
    const id = newEffectId();
    const now = new Date().toISOString();
    await db.insert(proposedEffects).values({
      id,
      jobId,
      kind: capability,
      summary: payload.subject,
      payload: JSON.stringify(payload),
      status: "pending_review",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(auditEvents).values({
      id: randomUUID(),
      jobId,
      kind: "propose",
      payload: JSON.stringify({ effectId: id, capability }),
    });
    return {
      id,
      message: "Pending review",
      status: "pending_review" as const,
    };
  },
});
