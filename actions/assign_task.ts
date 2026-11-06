// Legacy snake_case alias: preserves the `GET /_agent-native/actions/assign_task`
// HTTP path. The canonical implementation lives in `./assign-task.js`; this alias
// stays hidden from agent/MCP tool lists while remaining callable over HTTP.
import canonical from "./assign-task.js";

export default { ...canonical, agentTool: false, mcpTool: false };
