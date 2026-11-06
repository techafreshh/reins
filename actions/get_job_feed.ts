// Legacy snake_case alias: preserves the `GET /_agent-native/actions/get_job_feed`
// HTTP path. The canonical implementation lives in `./get-job-feed.js`; this alias
// stays hidden from agent/MCP tool lists while remaining callable over HTTP.
import canonical from "./get-job-feed.js";

export default { ...canonical, agentTool: false, mcpTool: false };
