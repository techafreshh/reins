// Legacy snake_case alias: preserves the `GET /_agent-native/actions/decide_effect`
// HTTP path. The canonical implementation lives in `./decide-effect.js`; this alias
// stays hidden from agent/MCP tool lists while remaining callable over HTTP.
import canonical from "./decide-effect.js";

export default { ...canonical, agentTool: false, mcpTool: false };
