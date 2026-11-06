import { randomUUID } from "node:crypto";

import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { auditEvents, learnings } from "../server/db/schema.js";
import { learningErrors } from "../server/lib/learnings.js";

export default defineAction({
  description: "Human-only decision on a pending learning: approve or reject a proposed rule.",
  schema: z.object({
    learningId: z.string().min(1).describe("Learning id, e.g. learn_..."),
    resolution: z.enum(["approved", "rejected"]).describe("Human decision on the proposal"),
  }),
  outputSchema: z.object({
    id: z.string(),
    message: z.string(),
    resolution: z.string(),
    nextRequiredAction: z.string(),
  }),
  errors: learningErrors,
  // Human-only: hidden from the agent tool surface; HTTP/CLI still serve the UI.
  agentTool: false,
  run: async ({ learningId, resolution }) => {
    const db = getDb();
    const rows = await db.select().from(learnings).where(eq(learnings.id, learningId));
    const learning = rows[0];
    if (!learning) {
      return learningErrors.fail("Learning not found.", "learning_not_found", { statusCode: 404 });
    }
    if (learning.status !== "pending") {
      return learningErrors.fail(
        `Learning already decided as "${learning.status}".`,
        "stale_decision",
        { statusCode: 409 },
      );
    }
    const now = new Date().toISOString();
    await db
      .update(learnings)
      .set({ status: resolution, updatedAt: now })
      .where(eq(learnings.id, learningId));
    await db.insert(auditEvents).values({
      id: randomUUID(),
      jobId: learning.jobId,
      kind: resolution === "approved" ? "learning_approved" : "learning_rejected",
      payload: JSON.stringify({ learningId, jobId: learning.jobId, rule: learning.rule }),
    });
    return {
      id: learningId,
      message: resolution === "approved" ? "Learning approved" : "Learning rejected",
      resolution,
      nextRequiredAction: "propose_effect",
    };
  },
});
