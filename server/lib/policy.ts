import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { getDb } from "../db/index.js";
import { policies } from "../db/schema.js";

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
