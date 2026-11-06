import { defineAction } from "@agent-native/core/action";
import { readAppState } from "@agent-native/core/application-state";
import { z } from "zod";

export default defineAction({
  description:
    "Read the Chat app's current navigation state. Basic navigation is already included in <current-screen>; use this action only when you need a fresh read.",
  schema: z.object({
    screen: z.string().optional().describe("Screen path to echo back, e.g. /review"),
  }),
  http: { method: "POST" },
  readOnly: true,
  run: async (args) => {
    const navigation = await readAppState("navigation");

    const screen: Record<string, unknown> = {};
    if (args.screen) {
      screen.screen = args.screen;
    }
    if (navigation) {
      screen.navigation = navigation;
    } else if (!args.screen) {
      return "No application state found. Is the app running?";
    } else {
      screen.navigation = null;
    }
    return screen;
  },
});
