// Legacy snake_case alias: preserves the `GET /_agent-native/actions/create_job`
// HTTP path. The canonical implementation lives in `./create-job.js`; this alias
// stays hidden from agent/MCP tool lists while remaining callable over HTTP.
import canonical from "./create-job.js";

export default { ...canonical, agentTool: false, mcpTool: false };
