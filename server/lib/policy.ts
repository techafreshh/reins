import { randomUUID } from "node:crypto";

import { defineActionErrors } from "@agent-native/core/action";
import { eq } from "drizzle-orm";

import { getDb } from "../db/index.js";
import { policies, threads } from "../db/schema.js";

type Db = ReturnType<typeof getDb>;

/** Capability key for the global kill-switch row in `policies`. */
export const KILL_SWITCH_CAPABILITY = "kill_switch";

/**
 * True only when an explicit enabled kill-switch row exists. A missing row
 * (or any value other than 1) means the system is running.
 */
export async function isKillSwitchOn(db: Db): Promise<boolean> {
  const rows = await db
    .select()
    .from(policies)
    .where(eq(policies.capability, KILL_SWITCH_CAPABILITY));
  const row = rows[0];
  return row !== undefined && row.enabled === 1;
}

/** Insert-or-update the kill-switch row keyed by capability, refreshing `updatedAt`. */
export async function setKillSwitch(db: Db, on: boolean): Promise<void> {
  const now = new Date().toISOString();
  const rows = await db
    .select()
    .from(policies)
    .where(eq(policies.capability, KILL_SWITCH_CAPABILITY));
  if (rows[0]) {
    await db
      .update(policies)
      .set({ enabled: on ? 1 : 0, updatedAt: now })
      .where(eq(policies.capability, KILL_SWITCH_CAPABILITY));
    return;
  }
  await db.insert(policies).values({
    id: randomUUID(),
    capability: KILL_SWITCH_CAPABILITY,
    rule: "",
    enabled: on ? 1 : 0,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Per-capability trust levels. ASK parks every draft for human review,
 * SMART enforces the server-side predicate before proposing, and AUTO
 * proposes without predicate checks (human approval still gates sending).
 */
export const POLICY_LEVELS = ["ASK", "SMART", "AUTO"] as const;

export type PolicyLevel = (typeof POLICY_LEVELS)[number];

/** Capabilities governed by the trust panel. */
export const TRUST_CAPABILITIES = ["send_followup", "draft_reply", "label_or_tag"] as const;

export type TrustCapability = (typeof TRUST_CAPABILITIES)[number];

/**
 * Shared closed error set for the policy surface. Superset of the job
 * lifecycle codes so the propose gate keeps its 404/409 shapes.
 */
export const policyErrors = defineActionErrors(
  "job_not_found",
  "job_paused",
  "policy_blocked",
  "trust_below_threshold",
  "policy_not_found",
);

/** Narrow an unknown level value; anything else falls back to ASK. */
export function isPolicyLevel(value: unknown): value is PolicyLevel {
  return typeof value === "string" && (POLICY_LEVELS as readonly string[]).includes(value);
}

/** Read a capability's level; rows missing the column value read as ASK. */
export async function getCapabilityLevel(db: Db, capability: string): Promise<PolicyLevel> {
  const rows = await db
    .select()
    .from(policies)
    .where(eq(policies.capability, capability));
  const level = rows[0]?.level;
  return isPolicyLevel(level) ? level : "ASK";
}

/** Insert-or-update a capability level row keyed by capability. */
export async function setCapabilityLevel(
  db: Db,
  capability: string,
  level: PolicyLevel,
): Promise<void> {
  const now = new Date().toISOString();
  const rows = await db
    .select()
    .from(policies)
    .where(eq(policies.capability, capability));
  if (rows[0]) {
    await db
      .update(policies)
      .set({ level, updatedAt: now })
      .where(eq(policies.capability, capability));
    return;
  }
  await db.insert(policies).values({
    id: randomUUID(),
    capability,
    rule: "",
    enabled: 1,
    level,
    createdAt: now,
    updatedAt: now,
  });
}

/** SMART predicate bounds for `send_followup`. */
export const SMART_WORD_LIMIT = 60;
export const SMART_MAX_STALENESS_DAYS = 60;

/** Word count for the SMART length check; exactly 60 words passes. */
export function countWords(body: string): number {
  return body.split(/\s+/).filter(Boolean).length;
}

/** The demo world's sensitive contact: any `alex@` recipient. */
export function isSensitiveRecipient(to: string): boolean {
  return to.toLowerCase().startsWith("alex@");
}

export type SendFollowupVerdict =
  | { allowed: true }
  | { allowed: false; reason: "too_long" | "sensitive" | "stale" };

/**
 * SMART predicate for `send_followup`. Word-count and recipient checks
 * always apply; thread-row checks (sensitive flag, contact, staleness) are
 * skipped when no thread row exists, so synthetic propose ids keep working.
 */
export async function evaluateSendFollowup(
  db: Db,
  input: { body: string; to: string; threadId: string },
): Promise<SendFollowupVerdict> {
  if (countWords(input.body) > SMART_WORD_LIMIT) {
    return { allowed: false, reason: "too_long" };
  }
  if (isSensitiveRecipient(input.to)) {
    return { allowed: false, reason: "sensitive" };
  }
  const rows = await db.select().from(threads).where(eq(threads.id, input.threadId));
  const thread = rows[0];
  if (!thread) {
    return { allowed: true };
  }
  if (thread.sensitive || isSensitiveRecipient(thread.contactEmail)) {
    return { allowed: false, reason: "sensitive" };
  }
  if (thread.stalenessDays >= SMART_MAX_STALENESS_DAYS) {
    return { allowed: false, reason: "stale" };
  }
  return { allowed: true };
}
