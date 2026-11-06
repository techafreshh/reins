import { defineNitroPlugin, getH3App } from "@agent-native/core/server";
import { defineEventHandler, getMethod } from "h3";

import catalogHandler from "../routes/mcp.get.js";

/**
 * Public `GET /mcp` catalog.
 *
 * The framework mounts its authenticated MCP handshake with
 * `app.use("/mcp", ...)` (prefix middleware), which runs before Nitro's
 * scanned routes — so `server/routes/mcp.get.ts` alone can never answer
 * `GET /mcp` in a built server. App `server/plugins` register before the
 * framework mount, so this exact-path GET handler answers first with the
 * static catalog (same handler object the route file exports, keeping one
 * source of truth for the unit test). Every other method/path returns
 * `undefined` and falls through untouched to the framework handshake, so
 * POST /mcp auth behavior is unchanged.
 */
export default defineNitroPlugin((nitroApp) => {
  getH3App(nitroApp).use(
    "/mcp",
    defineEventHandler((event) => {
      // The prefix mount strips `/mcp` before invoking us: an exact catalog
      // request arrives with an empty (or root) subpath.
      const subpath = event.url?.pathname ?? "";
      if (getMethod(event) === "GET" && (subpath === "" || subpath === "/")) {
        return catalogHandler(event);
      }
      return undefined;
    }),
  );
});
