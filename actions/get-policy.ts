import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import {
  getCapabilityLevel,
  isKillSwitchOn,
  policyErrors,
  TRUST_CAPABILITIES,
  type PolicyLevel,
  type TrustCapability,
} from "../server/lib/policy.js";

export default defineAction({
  description: "Read the per-capability trust levels and the global kill switch.",
  schema: z.object({}),
  http: { method: "GET" },
  errors: policyErrors,
  run: async () => {
    const db = getDb();
    const levels = {} as Record<TrustCapability, PolicyLevel>;
    for (const capability of TRUST_CAPABILITIES) {
      levels[capability] = await getCapabilityLevel(db, capability);
    }
    return {
      killSwitch: await isKillSwitchOn(db),
      levels,
      send_followup: levels.send_followup,
      message: "Policy loaded",
    };
  },
});
