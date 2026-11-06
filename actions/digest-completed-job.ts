// guard:allow-resource-action-access — jobs are single-tenant with no per-job visibility; changeResource only scopes realtime fan-out, not authorization; revisit when per-job visibility is hardened.
import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { readDigestForJob } from "../server/lib/digest.js";
import { JOB_STATES, jobErrors } from "../server/lib/state.js";

export default defineAction({
  description: "Synthesize an end-of-job roundup: proposed/approved/rejected/executed plus skipped threads.",
  schema: z
    .object({
      jobId: z.string().min(1).optional().describe("Job id, e.g. job_..."),
      id: z.string().min(1).optional().describe("Job id, e.g. job_... (legacy alias)"),
    })
    .refine((v) => Boolean(v.jobId ?? v.id), {
      message: "Provide jobId (or legacy id).",
    }),
  outputSchema: z.object({
    id: z.string(),
    message: z.string(),
    state: z.enum(JOB_STATES),
    proposed: z.number(),
    approved: z.number(),
    rejected: z.number(),
    pending: z.number(),
    executed: z.number(),
    openThreads: z.number(),
    skippedSensitive: z.number(),
    skippedStale: z.number(),
  }),
  errors: jobErrors,
  changeResource: (input) => ({
    resourceType: "job",
    resourceId: input.jobId ?? input.id ?? "",
  }),
  run: async (input) => {
    const jobId = input.jobId ?? input.id ?? "";
    // Read-only synthesis: zero writes, so the digest never completes a job.
    const digest = await readDigestForJob(jobId);
    return {
      id: digest.id,
      message: digest.message,
      state: digest.state,
      proposed: digest.proposed,
      approved: digest.approved,
      rejected: digest.rejected,
      pending: digest.pending,
      executed: digest.executed,
      openThreads: digest.openThreads,
      skippedSensitive: digest.skippedSensitive,
      skippedStale: digest.skippedStale,
    };
  },
});
