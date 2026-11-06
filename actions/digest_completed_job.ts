// Legacy snake_case alias: preserves the `GET /_agent-native/actions/digest_completed_job`
// HTTP path. The canonical implementation lives in `./digest-completed-job.js`; this alias
// stays hidden from agent/MCP tool lists while remaining callable over HTTP.
import canonical from "./digest-completed-job.js";

export default { ...canonical, agentTool: false, mcpTool: false };
