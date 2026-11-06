import { createToolkitAuthPlugin } from "@agent-native/toolkit/app/auth/server";

export default createToolkitAuthPlugin({
  workspaceAppPublicPaths: ["/"],
  // The walking skeleton owns "/" as a public placeholder page and
  // "/api/health" as an unauthenticated probe, so rootAuth stays off and
  // the health route bypasses the guard. Sign-in, /home and /chat are unchanged.
  rootAuth: false,
  publicPaths: ["/api/health", "/demo", "/mcp"],
  marketing: false,
});
