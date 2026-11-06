import { getHeader, getRequestIP } from "h3";

import type { H3Event } from "h3";

/**
 * Per-hour agent-turn cap (PRD appendix default: 20 turns/hour/source).
 *
 * HTTP-only enforcement lives in `server/middleware/auth.ts`: the auth guard
 * runs first, and only guard-approved POSTs to the agent-chat runtime are
 * recorded — past this cap such turns get 429.
 * Action `run()` functions are untouched, so `pnpm test` stays hermetic
 * (unit tests invoke `run()` dozens of times per process), and CLI calls
 * (separate process, in-process dispatcher) are unaffected.
 *
 * Single Node process in prod, so a module-level in-memory `Map` suffices;
 * horizontal scaling would need a shared store (out of scope).
 */

/** Max agent turns allowed per source per window. The 21st turn blocks. */
export const TURN_CAP_LIMIT = 20;

/** Sliding window for the turn cap: one hour in milliseconds. */
export const TURN_CAP_WINDOW_MS = 3_600_000;

export interface TurnCapDecision {
  allowed: boolean;
  /** Seconds until the oldest turn in the window expires (0 when allowed). */
  retryAfterSec: number;
}

const turnsByKey = new Map<string, number[]>();

function prune(now: number, stamps: number[]): number[] {
  const cutoff = now - TURN_CAP_WINDOW_MS;
  return stamps.filter((t) => t > cutoff);
}

/**
 * Record one agent turn for `key` at `now` (defaults to `Date.now()`).
 * Returns `{ allowed: true }` while fewer than `TURN_CAP_LIMIT` turns sit
 * inside the window, else `{ allowed: false, retryAfterSec }`.
 */
export function checkAgentTurnCap(key: string, now: number = Date.now()): TurnCapDecision {
  const stamps = prune(now, turnsByKey.get(key) ?? []);
  if (stamps.length < TURN_CAP_LIMIT) {
    stamps.push(now);
    turnsByKey.set(key, stamps);
    return { allowed: true, retryAfterSec: 0 };
  }
  turnsByKey.set(key, stamps);
  const oldest = stamps[0] ?? now;
  return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((oldest + TURN_CAP_WINDOW_MS - now) / 1000)) };
}

/** Clear all recorded turns. Exported for tests; production never calls it. */
export function resetAgentTurnCaps(): void {
  turnsByKey.clear();
}

const AGENT_CHAT_PATH = "/_agent-native/agent-chat";

/**
 * Pure predicate: true only for POSTs to the agent-chat runtime
 * (`/_agent-native/agent-chat` and its `/threads` sub-paths).
 */
export function isAgentTurnRequest(method: string | undefined, pathname: string): boolean {
  if (method !== "POST") {
    return false;
  }
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return normalized === AGENT_CHAT_PATH || normalized.startsWith(`${AGENT_CHAT_PATH}/threads`);
}

/**
 * Source identity for the cap: client IP (forwarded-for first entry wins)
 * plus host, defaulting to `"unknown"`. Probes may be unauthenticated, so
 * no user identity is used here.
 */
export function agentTurnKeyFromEvent(event: H3Event): string {
  const forwarded = getHeader(event, "x-forwarded-for");
  const firstForwarded = forwarded?.split(",")[0]?.trim();
  const ip = firstForwarded || getRequestIP(event, { xForwardedFor: true }) || "unknown";
  const host = getHeader(event, "host") || "unknown-host";
  return `${ip}@${host}`;
}
