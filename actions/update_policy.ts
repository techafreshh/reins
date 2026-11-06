// Legacy snake_case alias: preserves the `GET /_agent-native/actions/update_policy`
// HTTP path. The canonical implementation lives in `./update-policy.js`; this alias
// stays hidden from agent/MCP tool lists while remaining callable over HTTP.
import canonical from "./update-policy.js";

export default { ...canonical, agentTool: false, mcpTool: false };
