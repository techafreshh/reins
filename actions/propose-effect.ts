// guard:allow-resource-action-access — jobs are single-tenant with no per-job visibility; changeResource only scopes realtime fan-out, not authorization; revisit when per-job visibility is hardened.
import { randomUUID } from "node:crypto";

import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { auditEvents, jobs, learnings, proposedEffects } from "../server/db/index.js";
import { EFFECT_STATUS, newEffectId, sendFollowupPayloadSchema } from "../server/lib/effects.js";
import { applyApprovedRules } from "../server/lib/learnings.js";
import {
  evaluateSendFollowup,
  getCapabilityLevel,
  isKillSwitchOn,
  policyErrors,
} from "../server/lib/policy.js";

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
    body: z.string(),
  }),
  errors: policyErrors,
  changeResource: (input, result) =>
    result ? { resourceType: "job", resourceId: input.jobId } : undefined,
  run: async ({ jobId, capability, payload }) => {
    const db = getDb();
    const rows = await db.select().from(jobs).where(eq(jobs.id, jobId));
    const job = rows[0];
    if (!job) {
      return policyErrors.fail("Job not found.", "job_not_found", { statusCode: 404 });
    }
    if (await isKillSwitchOn(db)) {
      return policyErrors.fail("Kill switch is on; proposing is blocked.", "policy_blocked", {
        statusCode: 409,
      });
    }
    // Learning loop: approved rules for this job rewrite the draft in-process
    // so the next proposal cannot repeat rejected phrasing.
    const learningRows = await db.select().from(learnings).where(eq(learnings.jobId, jobId));
    const approvedRules = learningRows
      .filter((row) => row.status === "approved")
      .map((row) => row.rule)
      .filter((rule) => rule.length > 0);
    const sanitized = applyApprovedRules(payload.body, approvedRules);
    const finalPayload = sanitized.applied ? { ...payload, body: sanitized.body } : payload;
    if ((await getCapabilityLevel(db, capability)) === "SMART") {
      const verdict = await evaluateSendFollowup(db, {
        body: finalPayload.body,
        to: finalPayload.to,
        threadId: finalPayload.threadId,
      });
      if (!verdict.allowed) {
        return policyErrors.fail(
          `SMART policy blocked send_followup (${verdict.reason}).`,
          "trust_below_threshold",
          { statusCode: 403 },
        );
      }
    }
    const id = newEffectId();
    const now = new Date().toISOString();
    await db.insert(proposedEffects).values({
      id,
      jobId,
      kind: capability,
      summary: finalPayload.subject,
      payload: JSON.stringify(finalPayload),
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
    if (sanitized.applied) {
      await db.insert(auditEvents).values({
        id: randomUUID(),
        jobId,
        kind: "learning_applied",
        payload: JSON.stringify({ effectId: id, rules: approvedRules }),
      });
    }
    return {
      id,
      message: "Pending review",
      status: "pending_review" as const,
      body: finalPayload.body,
    };
  },
});
