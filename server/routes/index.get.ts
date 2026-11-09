import { defineEventHandler, sendRedirect } from "h3";

// "/" is not an app surface: signed-in visitors land on the Get started
// page, and signed-out visitors continue through the workspace guard to
// the shared sign-in. The framework SSR shell cannot match the bare root
// (the catch-all handler requires a splat), so this explicit route owns it.
export default defineEventHandler((event) => {
  return sendRedirect(event, "/home", 302);
});
