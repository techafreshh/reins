import { randomUUID } from "node:crypto";

import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { auditEvents } from "../server/db/schema.js";
import { KILL_SWITCH_CAPABILITY, setKillSwitch } from "../server/lib/policy.js";

export const policyErrors = defineActionErrors("policy_failed");

export default defineAction({
  description: "Toggle the global kill switch; on pauses executions, off resumes them.",
  schema: z.object({
    killSwitch: z.boolean().describe("true pauses executions, false resumes them"),
  }),
  outputSchema: z.object({
    id: z.string(),
    killSwitch: z.boolean(),
    message: z.string(),
  }),
  errors: policyErrors,
  // Human-only: hidden from the agent tool surface; HTTP/CLI still serve the UI.
  agentTool: false,
  run: async ({ killSwitch }) => {
    const db = getDb();
    await setKillSwitch(db, killSwitch);
    await db.insert(auditEvents).values({
      id: randomUUID(),
      jobId: "",
      kind: "policy.update",
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
  },
});
