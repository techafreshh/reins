import { describe, expect, it } from "vitest";

import {
  agentTurnKeyFromEvent,
  checkAgentTurnCap,
  isAgentTurnRequest,
  resetAgentTurnCaps,
  TURN_CAP_LIMIT,
  TURN_CAP_WINDOW_MS,
} from "../server/lib/rate";

describe("agent turn cap", () => {
  it("allows 20 turns then blocks the 21st with a retry hint", () => {
    resetAgentTurnCaps();
    const now = 1_000_000;
    for (let i = 0; i < TURN_CAP_LIMIT; i += 1) {
      expect(checkAgentTurnCap("k", now).allowed).toBe(true);
    }
    const blocked = checkAgentTurnCap("k", now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("slides the window so old turns expire", () => {
    resetAgentTurnCaps();
    const now = 5_000_000;
    for (let i = 0; i < TURN_CAP_LIMIT; i += 1) {
      checkAgentTurnCap("k", now);
    }
    expect(checkAgentTurnCap("k", now).allowed).toBe(false);
    expect(checkAgentTurnCap("k", now + TURN_CAP_WINDOW_MS + 1).allowed).toBe(true);
  });

  it("isolates keys and resets cleanly", () => {
    resetAgentTurnCaps();
    const now = 9_000_000;
    for (let i = 0; i < TURN_CAP_LIMIT; i += 1) {
      checkAgentTurnCap("a", now);
    }
    expect(checkAgentTurnCap("a", now).allowed).toBe(false);
    expect(checkAgentTurnCap("b", now).allowed).toBe(true);
    resetAgentTurnCaps();
    expect(checkAgentTurnCap("a", now).allowed).toBe(true);
  });

  it("matches only POSTs to the agent-chat runtime", () => {
    expect(isAgentTurnRequest("POST", "/_agent-native/agent-chat")).toBe(true);
    expect(isAgentTurnRequest("POST", "/_agent-native/agent-chat/threads/abc")).toBe(true);
    expect(isAgentTurnRequest("GET", "/_agent-native/agent-chat")).toBe(false);
    expect(isAgentTurnRequest("POST", "/api/health")).toBe(false);
    expect(isAgentTurnRequest("POST", "/_agent-native/events")).toBe(false);
  });

  it("derives a stable key from the event", () => {
    const event = {
      req: {
        method: "POST",
        headers: new Headers({ host: "example.com" }),
      },
      path: "/_agent-native/agent-chat",
    } as unknown as Parameters<typeof agentTurnKeyFromEvent>[0];
    expect(agentTurnKeyFromEvent(event)).toBe("unknown@example.com");
  });
});
