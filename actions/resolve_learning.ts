// Legacy snake_case alias: preserves the `GET /_agent-native/actions/resolve_learning`
// HTTP path. The canonical implementation lives in `./resolve-learning.js`; this alias
// stays hidden from agent/MCP tool lists while remaining callable over HTTP.
import canonical from "./resolve-learning.js";

export default { ...canonical, agentTool: false, mcpTool: false };
