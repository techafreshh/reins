// Legacy snake_case alias: preserves the `GET /_agent-native/actions/propose_effect`
// HTTP path. The canonical implementation lives in `./propose-effect.js`; this alias
// stays hidden from agent/MCP tool lists while remaining callable over HTTP.
import canonical from "./propose-effect.js";

export default { ...canonical, agentTool: false, mcpTool: false };
