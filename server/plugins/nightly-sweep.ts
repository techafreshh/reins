import { defineNitroPlugin } from "@agent-native/core/server";

import { ensureNightlySweepJob } from "../lib/sweep.js";

/**
 * Boot-time sweep ensure: the seeded nightly-sweep row converges on read,
 * so the plugin fires once at server start and never throws.
 */
export default defineNitroPlugin(() => {
  void ensureNightlySweepJob().catch(() => {});
});
