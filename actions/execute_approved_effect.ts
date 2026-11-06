// Legacy snake_case alias: preserves the `GET /_agent-native/actions/execute_approved_effect`
// HTTP path. The canonical implementation lives in `./execute-approved-effect.js`; this alias
// stays hidden from agent/MCP tool lists while remaining callable over HTTP.
import canonical from "./execute-approved-effect.js";

export default { ...canonical, agentTool: false, mcpTool: false };
