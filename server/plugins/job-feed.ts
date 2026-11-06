import { defineNitroPlugin } from "@agent-native/core/server";

import { startJobFeedHeartbeat } from "../lib/loops/heartbeat.js";

export default defineNitroPlugin(() => {
  startJobFeedHeartbeat();
});
