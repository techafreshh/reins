import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { ensureFanout } from "../server/lib/loops/orchestrator.js";
import { JOB_STATES, jobErrors, transitionJob } from "../server/lib/state.js";

export default defineAction({
  description: "Move a job to its next lifecycle state.",
  schema: z.object({
    id: z.string().min(1).describe("Job id, e.g. job_..."),
    to: z.enum(["running", "awaiting_review", "complete"]).describe("Target state"),
  }),
  outputSchema: z.object({
    id: z.string(),
    message: z.string(),
    state: z.enum(JOB_STATES),
    nextRequiredAction: z.string(),
  }),
  errors: jobErrors,
  changeResource: (input) => ({ resourceType: "job", resourceId: input.id }),
  run: async ({ id, to }) => {
    const db = getDb();
    await transitionJob(db, id, to);
    if (to === "running") {
      await ensureFanout(id);
    }
    return {
      id,
      message: `Job moved to ${to}`,
      state: to,
      nextRequiredAction: to === "complete" ? "list_jobs" : "get_job_state",
    };
  },
});
