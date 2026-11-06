// Legacy snake_case alias: preserves the `GET /_agent-native/actions/list_effects`
// HTTP path. The canonical implementation lives in `./list-effects.js`; this alias
// stays hidden from agent/MCP tool lists while remaining callable over HTTP.
import canonical from "./list-effects.js";

export default { ...canonical, agentTool: false, mcpTool: false };
