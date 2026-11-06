// Legacy snake_case alias: preserves the `GET /_agent-native/actions/advance_job`
// HTTP path. The canonical implementation lives in `./advance-job.js`; this alias
// stays hidden from agent/MCP tool lists while remaining callable over HTTP.
import canonical from "./advance-job.js";

export default { ...canonical, agentTool: false, mcpTool: false };
