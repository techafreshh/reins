// Legacy snake_case alias: preserves the `GET /_agent-native/actions/get_job_state`
// HTTP path. The canonical implementation lives in `./get-job-state.js`; this alias
// stays hidden from agent/MCP tool lists while remaining callable over HTTP.
import canonical from "./get-job-state.js";

export default { ...canonical, agentTool: false, mcpTool: false };
