import { z } from "zod";

/**
 * Shared pure contract for outward effects. No DB or node-only imports here
 * so both actions and the client-side review queue can import this module.
 */

/** Payload for the `send_followup` capability: a human-reviewable email draft. */
export const sendFollowupPayloadSchema = z.object({
  threadId: z.string().min(1).describe("Opaque thread reference, e.g. th_1"),
  to: z.string().email().describe("Recipient address"),
  subject: z.string().min(1).describe("Email subject"),
  body: z.string().min(1).describe("Email body"),
});

export type SendFollowupPayload = z.infer<typeof sendFollowupPayloadSchema>;

/** Effect lifecycle states stored in `proposed_effects.status`. */
export const EFFECT_STATUS = [
  "pending_review",
  "approved",
  "edited",
  "rejected",
] as const;

export type EffectStatus = (typeof EFFECT_STATUS)[number];

/** Canonical human decisions stored in `decisions.decision`. */
export const DECISIONS = ["approve", "edit", "reject"] as const;

export type CanonicalDecision = (typeof DECISIONS)[number];

const DECISION_ALIASES: Record<string, CanonicalDecision> = {
  approve: "approve",
  approved: "approve",
  edit: "edit",
  "edit-approve": "edit",
  edited: "edit",
  reject: "reject",
  rejected: "reject",
};

/** Normalize any accepted decision spelling to its canonical value. */
export function normalizeDecision(input: string): CanonicalDecision | null {
  return DECISION_ALIASES[input] ?? null;
}

/** Static outbox chip: demo mode never leaves this machine. Single-sourced
 * here so the execute gate message and the Review Queue SSR chip cannot drift. */
export const SIMULATED_OUTBOX_NOTE = "Simulated outbox — nothing leaves this machine";

/** New effect ids carry an `eff_` prefix so probes can assert the shape. */
export function newEffectId(): string {
  return `eff_${globalThis.crypto.randomUUID()}`;
}

/** Parse a stored JSON payload back into a `send_followup` draft. */
export function parseEffectPayload(raw: string): SendFollowupPayload {
  return sendFollowupPayloadSchema.parse(JSON.parse(raw));
}
