import { randomUUID } from "node:crypto";

import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { auditEvents } from "../server/db/schema.js";
import {
  KILL_SWITCH_CAPABILITY,
  POLICY_LEVELS,
  policyErrors,
  setCapabilityLevel,
  setKillSwitch,
  TRUST_CAPABILITIES,
} from "../server/lib/policy.js";

export { policyErrors };

const capabilityUpdateSchema = z.object({
  capability: z.enum(TRUST_CAPABILITIES).describe("Capability to set, e.g. send_followup"),
  level: z.enum(POLICY_LEVELS).describe("Trust level: ASK, SMART, or AUTO"),
});

const killSwitchUpdateSchema = z.object({
  killSwitch: z.boolean().describe("true pauses executions, false resumes them"),
});

export default defineAction({
  description: "Set a per-capability trust level or toggle the global kill switch.",
  schema: z.union([capabilityUpdateSchema, killSwitchUpdateSchema]),
  outputSchema: z.union([
    z.object({
      id: z.string(),
      capability: z.string(),
      level: z.string(),
      message: z.string(),
    }),
    z.object({
      id: z.string(),
      killSwitch: z.boolean(),
      message: z.string(),
    }),
  ]),
  errors: policyErrors,
  // Human-only: hidden from the agent tool surface; HTTP/CLI still serve the UI.
  agentTool: false,
  run: async (input) => {
    const db = getDb();
    if ("killSwitch" in input) {
      const killSwitch = input.killSwitch;
      await setKillSwitch(db, killSwitch);
      await db.insert(auditEvents).values({
        id: randomUUID(),
        jobId: "",
        kind: "policy_change",
        payload: JSON.stringify({
          capability: KILL_SWITCH_CAPABILITY,
          enabled: killSwitch ? 1 : 0,
        }),
      });
      return {
        id: "kill_switch",
        killSwitch,
        message: killSwitch
          ? "Kill switch on, executions paused"
          : "Kill switch off, executions resumed",
      };
    }
    const { capability, level } = input;
    if (!(TRUST_CAPABILITIES as readonly string[]).includes(capability)) {
      return policyErrors.fail(`Unknown capability "${capability}".`, "policy_not_found", {
        statusCode: 404,
      });
    }
    await setCapabilityLevel(db, capability, level);
    await db.insert(auditEvents).values({
      id: randomUUID(),
      jobId: "",
      kind: "policy_change",
      payload: JSON.stringify({ capability, level }),
    });
    return {
      id: capability,
      capability,
      level,
      message: `Policy for ${capability} set to ${level}`,
    };
  },
});
