import { randomUUID } from "node:crypto";

import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { auditEvents, decisions, proposedEffects } from "../server/db/schema.js";
import { normalizeDecision, SIMULATED_OUTBOX_NOTE } from "../server/lib/effects.js";
import { isKillSwitchOn } from "../server/lib/policy.js";

export const executeErrors = defineActionErrors(
  "effect_not_found",
  "not_approved",
  "stale_decision",
  "policy_blocked",
);

const executedRowSchema = z.object({
  effectId: z.string(),
  receipt: z.literal("simulated-sent"),
});

export default defineAction({
  description:
    "Human-only execute of approved effects: simulated-send plus receipt, exactly once. No egress.",
  schema: z
    .object({
      effectId: z.string().min(1).optional().describe("Effect id, e.g. eff_..."),
      effectIds: z.array(z.string().min(1)).optional().describe("Batch of effect ids"),
    })
    .refine((v) => Boolean(v.effectId) || (v.effectIds && v.effectIds.length > 0), {
      message: "Provide effectId or a non-empty effectIds.",
    }),
  outputSchema: z.object({
    id: z.string(),
    receipt: z.literal("simulated-sent"),
    message: z.string(),
    executed: z.array(executedRowSchema),
  }),
  errors: executeErrors,
  // Human-only launcher: hidden from agents/MCP. Unproven HTTP callers fail
  // with 409 approval_required before run() via needsApproval, so only a
  // proven UI principal reaches the gate below. Default HTTP POST stays
  // mounted on purpose: the contract answers POSTs with typed 409s.
  agentTool: false,
  needsApproval: true,
  allowPersistentApproval: false,
  run: async ({ effectId, effectIds }) => {
    const db = getDb();
    // Kill switch first: a paused system reveals nothing about approval state.
    if (await isKillSwitchOn(db)) {
      return executeErrors.fail("Kill switch is on; execution refused.", "policy_blocked", {
        statusCode: 409,
      });
    }
    const ids = [...new Set([...(effectId ? [effectId] : []), ...(effectIds ?? [])])];
    // Validate everything before executing anything: a half-executed batch
    // would leave ambiguous exactly-once state.
    const pending: { id: string; jobId: string; capability: string; to: string; subject: string }[] =
      [];
    for (const id of ids) {
      const rows = await db.select().from(proposedEffects).where(eq(proposedEffects.id, id));
      const effect = rows[0];
      if (!effect) {
        return executeErrors.fail("Effect not found.", "effect_not_found", { statusCode: 404 });
      }
      const prior = await db.select().from(decisions).where(eq(decisions.effectId, id));
      const approved = prior.some((row) => {
        const canonical = normalizeDecision(row.decision);
        return canonical === "approve" || canonical === "edit";
      });
      if (!approved) {
        return executeErrors.fail(
          `${SIMULATED_OUTBOX_NOTE}. Effect ${id} is not approved; execution refused (receipt: false).`,
          "not_approved",
          { statusCode: 409, details: { receipt: false, simulatedOutbox: true } },
        );
      }
      const receipts = await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.kind, "execute"));
      const already = receipts.some((row) => {
        try {
          return (JSON.parse(row.payload) as { effectId?: unknown }).effectId === id;
        } catch {
          return false;
        }
      });
      if (already) {
        return executeErrors.fail(
          `Effect ${id} was already executed; decision is stale.`,
          "stale_decision",
          { statusCode: 409 },
        );
      }
      let to = "";
      let subject = effect.summary;
      try {
        const payload = JSON.parse(effect.payload) as { to?: unknown; subject?: unknown };
        if (typeof payload.to === "string") {
          to = payload.to;
        }
        if (typeof payload.subject === "string") {
          subject = payload.subject;
        }
      } catch {
        // Keep the row summary as the receipt subject when payload is unreadable.
      }
      pending.push({ id, jobId: effect.jobId, capability: effect.kind, to, subject });
    }
    // No network egress anywhere in this module: demo mode is simulated-send plus receipt.
    const executedAt = new Date().toISOString();
    for (const item of pending) {
      await db.insert(auditEvents).values({
        id: randomUUID(),
        jobId: item.jobId,
        kind: "execute",
        payload: JSON.stringify({
          effectId: item.id,
          jobId: item.jobId,
          capability: item.capability,
          receipt: "simulated-sent",
          to: item.to,
          subject: item.subject,
          executedAt,
        }),
      });
    }
    return {
      id: pending[0]!.id,
      receipt: "simulated-sent" as const,
      message: "Simulated send recorded — no egress",
      executed: pending.map((item) => ({
        effectId: item.id,
        receipt: "simulated-sent" as const,
      })),
    };
  },
});
