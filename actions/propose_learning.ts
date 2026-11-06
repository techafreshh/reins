import { randomUUID } from "node:crypto";

import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { auditEvents, jobs, learnings } from "../server/db/schema.js";
import { learningErrors } from "../server/lib/learnings.js";

export default defineAction({
  description:
    "Propose a skill/rule diff from a rejected effect's feedback. Creates a pending learning for human review.",
  schema: z.object({
    jobId: z.string().min(1).describe("Job id, e.g. job_..."),
    fromEffectId: z.string().min(1).describe("Rejected effect id the rule was learned from"),
    rule: z.string().min(1).describe("Proposed rule text, e.g. never promise delivery dates"),
  }),
  outputSchema: z.object({
    id: z.string(),
    message: z.string(),
    status: z.string(),
    nextRequiredAction: z.string(),
  }),
  errors: learningErrors,
  changeResource: (input, result) =>
    result ? { resourceType: "job", resourceId: input.jobId } : undefined,
  run: async ({ jobId, fromEffectId, rule }) => {
    const db = getDb();
    const rows = await db.select().from(jobs).where(eq(jobs.id, jobId));
    if (!rows[0]) {
      return learningErrors.fail("Job not found.", "job_not_found", { statusCode: 404 });
    }
    const id = `learn_${randomUUID()}`;
    const now = new Date().toISOString();
    await db.insert(learnings).values({
      id,
      jobId,
      title: rule,
      body: rule,
      source: fromEffectId,
      fromEffectId,
      rule,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(auditEvents).values({
      id: randomUUID(),
      jobId,
      kind: "learning_proposed",
      payload: JSON.stringify({ learningId: id, jobId, fromEffectId, rule }),
    });
    return {
      id,
      message: "Learning proposed",
      status: "pending",
      nextRequiredAction: "resolve_learning",
    };
  },
});
