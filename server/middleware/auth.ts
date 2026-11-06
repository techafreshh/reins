import { runAuthGuard } from "@agent-native/core/server";
import { defineEventHandler, getMethod, setResponseHeader, setResponseStatus } from "h3";

import { agentTurnKeyFromEvent, checkAgentTurnCap, isAgentTurnRequest } from "../lib/rate.js";

export default defineEventHandler(async (event) => {
  // Per-hour agent-turn cap enforced before auth: the 21st POST to the
  // agent-chat runtime in one hour/source gets 429, everything else falls
  // through to the unchanged auth guard below.
  const pathname = (event.node?.req?.url ?? event.path ?? "").split("?")[0] ?? "";
  if (isAgentTurnRequest(getMethod(event), pathname)) {
    const decision = checkAgentTurnCap(agentTurnKeyFromEvent(event));
    if (!decision.allowed) {
      setResponseStatus(event, 429);
      setResponseHeader(event, "Retry-After", String(decision.retryAfterSec));
      return {
        error: "Agent turn cap exceeded: 20 turns/hour/source; try again later.",
        errorCode: "rate_limited",
      };
    }
  }
  return runAuthGuard(event);
});
