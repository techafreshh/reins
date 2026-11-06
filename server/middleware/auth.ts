import { runAuthGuard } from "@agent-native/core/server";
import { defineEventHandler, getMethod, setResponseHeader, setResponseStatus } from "h3";

import { agentTurnKeyFromEvent, checkAgentTurnCap, isAgentTurnRequest } from "../lib/rate.js";

export default defineEventHandler(async (event) => {
  // Guard-first ordering: the auth guard runs before the per-hour
  // agent-turn cap, so rejected turns never consume quota. Only
  // guard-approved POSTs to the agent-chat runtime are recorded, and the
  // 21st such turn in one hour/source gets 429. Everything else falls
  // through by returning the guard result (or undefined) untouched.
  const pathname = (event.node?.req?.url ?? event.path ?? "").split("?")[0] ?? "";
  if (isAgentTurnRequest(getMethod(event), pathname)) {
    const guardResult = await runAuthGuard(event);
    if (guardResult !== undefined) {
      return guardResult;
    }
    const decision = checkAgentTurnCap(agentTurnKeyFromEvent(event));
    if (!decision.allowed) {
      setResponseStatus(event, 429);
      setResponseHeader(event, "Retry-After", String(decision.retryAfterSec));
      return {
        error: "Agent turn cap exceeded: 20 turns/hour/source; try again later.",
        errorCode: "rate_limited",
      };
    }
    return undefined;
  }
  return runAuthGuard(event);
});
