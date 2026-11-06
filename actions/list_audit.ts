// Legacy snake_case alias: preserves the `GET /_agent-native/actions/list_audit`
// HTTP path. The canonical implementation lives in `./list-audit.js`; this alias
// stays hidden from agent/MCP tool lists while remaining callable over HTTP.
import canonical from "./list-audit.js";

export default { ...canonical, agentTool: false, mcpTool: false };
