import { describe, expect, it, vi } from "vitest";

import { mockEvent } from "h3";

import authMiddleware from "../server/middleware/auth";
import {
  agentTurnKeyFromEvent,
  checkAgentTurnCap,
  isAgentTurnRequest,
  resetAgentTurnCaps,
  TURN_CAP_LIMIT,
  TURN_CAP_WINDOW_MS,
} from "../server/lib/rate";

const { mockRunAuthGuard } = vi.hoisted(() => ({
  mockRunAuthGuard: vi.fn(),
}));

vi.mock("@agent-native/core/server", () => ({
  runAuthGuard: mockRunAuthGuard,
}));

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
    expect(isAgentTurnRequest("POST", "/_agent-native/agent-chat/")).toBe(true);
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

describe("agent-turn middleware guard-first ordering", () => {
  const callMiddleware = (event: ReturnType<typeof mockEvent>) =>
    (authMiddleware as unknown as (e: unknown) => Promise<unknown>)(event);

  const turnEvent = () =>
    mockEvent("http://localhost/_agent-native/agent-chat", { method: "POST" });

  it("lets an authenticated turn through after 20 rejected turns", async () => {
    resetAgentTurnCaps();
    const rejection = { statusCode: 401, error: "unauthenticated" };
    mockRunAuthGuard.mockReset();
    mockRunAuthGuard.mockResolvedValue(rejection);
    for (let i = 0; i < TURN_CAP_LIMIT; i += 1) {
      const event = turnEvent();
      await expect(callMiddleware(event)).resolves.toBe(rejection);
      expect(event.res.status).not.toBe(429);
    }
    expect(mockRunAuthGuard).toHaveBeenCalledTimes(TURN_CAP_LIMIT);
    mockRunAuthGuard.mockResolvedValue(undefined);
    const authed = turnEvent();
    await expect(callMiddleware(authed)).resolves.toBeUndefined();
    expect(authed.res.status).not.toBe(429);
  });

  it("still 429s the 21st authenticated turn with a retry hint", async () => {
    resetAgentTurnCaps();
    mockRunAuthGuard.mockReset();
    mockRunAuthGuard.mockResolvedValue(undefined);
    for (let i = 0; i < TURN_CAP_LIMIT; i += 1) {
      const event = turnEvent();
      await expect(callMiddleware(event)).resolves.toBeUndefined();
    }
    const blocked = turnEvent();
    const body = await callMiddleware(blocked);
    expect(body).toMatchObject({ errorCode: "rate_limited" });
    expect(blocked.res.status).toBe(429);
    expect(blocked.res.headers.get("retry-after")).toBeTruthy();
  });

  it("delegates non-turn requests straight to the guard", async () => {
    resetAgentTurnCaps();
    mockRunAuthGuard.mockReset();
    const rejection = { statusCode: 401, error: "unauthenticated" };
    mockRunAuthGuard.mockResolvedValue(rejection);
    const event = mockEvent("http://localhost/api/health", { method: "GET" });
    await expect(callMiddleware(event)).resolves.toBe(rejection);
    expect(mockRunAuthGuard).toHaveBeenCalledTimes(1);
    expect(event.res.status).not.toBe(429);
  });
});
