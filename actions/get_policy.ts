// Legacy snake_case alias: preserves the `GET /_agent-native/actions/get_policy`
// HTTP path. The canonical implementation lives in `./get-policy.js`; this alias
// stays hidden from agent/MCP tool lists while remaining callable over HTTP.
import canonical from "./get-policy.js";

export default { ...canonical, agentTool: false, mcpTool: false };
