import { randomUUID } from "node:crypto";

import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { auditEvents, decisions, proposedEffects } from "../server/db/index.js";
import {
  EFFECT_STATUS,
  normalizeDecision,
  sendFollowupPayloadSchema,
  type CanonicalDecision,
  type EffectStatus,
} from "../server/lib/effects.js";

export const effectErrors = defineActionErrors(
  "effect_not_found",
  "effect_decided",
  "feedback_required",
);

const decisionInputSchema = z.enum([
  "approve",
  "approved",
  "edit",
  "edit-approve",
  "edited",
  "reject",
  "rejected",
]);

const decidedRowSchema = z.object({
  effectId: z.string(),
  status: z.enum(EFFECT_STATUS),
});

const TERMINAL_STATUS: Record<CanonicalDecision, EffectStatus> = {
  approve: "approved",
  edit: "edited",
  reject: "rejected",
};

function decidedMessage(decision: CanonicalDecision, count: number): string {
  if (count > 1) {
    return `Decided ${count} effects`;
  }
  switch (decision) {
    case "approve":
      return "Effect approved";
    case "edit":
      return "Effect approved with edits";
    case "reject":
      return "Effect rejected";
  }
}

export default defineAction({
  description:
    "Human-only decision on pending effects: approve, edit-approve, or reject with feedback. Supports batches.",
  schema: z
    .object({
      effectId: z.string().min(1).optional().describe("Effect id, e.g. eff_..."),
      effectIds: z.array(z.string().min(1)).optional().describe("Batch of effect ids"),
      decision: decisionInputSchema.describe("Human decision"),
      feedback: z.string().optional().describe("Required when rejecting"),
      edits: sendFollowupPayloadSchema
        .partial()
        .optional()
        .describe("Reviewer edits applied on edit-approve"),
    })
    .refine((v) => Boolean(v.effectId) || (v.effectIds && v.effectIds.length > 0), {
      message: "Provide effectId or a non-empty effectIds.",
    }),
  outputSchema: z.object({
    id: z.string(),
    status: z.enum(EFFECT_STATUS),
    message: z.string(),
    decided: z.array(decidedRowSchema),
  }),
  errors: effectErrors,
  // Human-only: hidden from the agent tool surface; HTTP/CLI still serve the UI.
  agentTool: false,
  run: async ({ effectId, effectIds, decision, feedback, edits }) => {
    const canonical = normalizeDecision(decision);
    if (!canonical) {
      return effectErrors.fail(`Unknown decision "${decision}".`, "effect_decided", {
        statusCode: 400,
      });
    }
    if (canonical === "reject" && !feedback?.trim()) {
      return effectErrors.fail("feedback: Required", "feedback_required", { statusCode: 400 });
    }
    const ids = [...new Set([...(effectId ? [effectId] : []), ...(effectIds ?? [])])];
    const db = getDb();
    // Validate everything before deciding anything: a half-decided batch
    // would leave ambiguous retry/cleanup state.
    const toDecide: { id: string; effect: typeof proposedEffects.$inferSelect; needsWrite: boolean }[] =
      [];
    for (const id of ids) {
      const rows = await db.select().from(proposedEffects).where(eq(proposedEffects.id, id));
      const effect = rows[0];
      if (!effect) {
        return effectErrors.fail("Effect not found.", "effect_not_found", { statusCode: 404 });
      }
      const prior = await db.select().from(decisions).where(eq(decisions.effectId, id));
      const same = prior.find((row) => row.decision === canonical);
      if (same) {
        toDecide.push({ id, effect, needsWrite: false });
        continue;
      }
      const firstPrior = prior[0];
      if (firstPrior) {
        return effectErrors.fail(
          `Effect already decided as "${firstPrior.decision}".`,
          "effect_decided",
          { statusCode: 409 },
        );
      }
      toDecide.push({ id, effect, needsWrite: true });
    }
    const decided: { effectId: string; status: EffectStatus }[] = [];
    for (const { id, effect, needsWrite } of toDecide) {
      if (!needsWrite) {
        decided.push({ effectId: id, status: effect.status as EffectStatus });
        continue;
      }
      const status = TERMINAL_STATUS[canonical];
      const now = new Date().toISOString();
      if (canonical === "edit") {
        const current = JSON.parse(effect.payload) as Record<string, unknown>;
        const merged = { ...current, ...(edits ?? {}) };
        const summary =
          typeof merged.subject === "string" && merged.subject.length > 0
            ? merged.subject
            : effect.summary;
        await db
          .update(proposedEffects)
          .set({ status, payload: JSON.stringify(merged), summary, updatedAt: now })
          .where(eq(proposedEffects.id, id));
      } else {
        await db
          .update(proposedEffects)
          .set({ status, updatedAt: now })
          .where(eq(proposedEffects.id, id));
      }
      const reason =
        feedback?.trim() ||
        (canonical === "approve" ? "approved as proposed" : "edited by reviewer");
      await db.insert(decisions).values({
        id: randomUUID(),
        jobId: effect.jobId,
        effectId: id,
        decision: canonical,
        reason,
      });
      await db.insert(auditEvents).values({
        id: randomUUID(),
        jobId: effect.jobId,
        kind: "decide",
        payload: JSON.stringify({ effectId: id, decision: canonical }),
      });
      decided.push({ effectId: id, status });
    }
    const first = decided[0]!;
    return {
      id: first.effectId,
      status: first.status,
      message: decidedMessage(canonical, decided.length),
      decided,
    };
  },
});
