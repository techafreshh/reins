import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import actionsRegistry from "../../.generated/actions-registry.js";

const INITIAL_TOOL_NAMES = [
  "view-screen",
  "navigate",
  "hello",
  "list_threads",
  "provider-api-request",
  "ask-question",
  "create_job",
  "list_jobs",
  "get_job_state",
  "steer_job",
  "advance_job",
];

export default createAgentChatPlugin({
  appId: "reins",
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  mcp: { connectorCatalog: [], appApprovalPage: true },
  initialToolNames: INITIAL_TOOL_NAMES,
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  systemPrompt: `You are the Chat app agent.

This is a minimal chat-first Agent-Native app. The chat is the product surface, and actions are the contract shared by chat, UI, HTTP, MCP, A2A, and CLI.

Use actions as the source of truth. Start by inspecting the current screen when context matters. When the user asks to extend this app, keep the change small and agent-native: add or update actions, expose useful UI, and keep application state/navigation visible to the agent.`,
});
