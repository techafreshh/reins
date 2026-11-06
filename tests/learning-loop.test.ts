import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isActionContractError } from "@agent-native/core/action";
import { closeDbExec, getDbExec } from "@agent-native/core/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import createJob from "../actions/create_job.js";
import listLearnings from "../actions/list_learnings.js";
import proposeEffect from "../actions/propose_effect.js";
import proposeLearning from "../actions/propose_learning.js";
import resolveLearning from "../actions/resolve_learning.js";
import { getDb } from "../server/db/index.js";
import { auditEvents } from "../server/db/schema.js";
import { applyApprovedRules, renderLearningsHtml } from "../server/lib/learnings.js";

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../server/db/migrations",
);

async function applyMigrations(): Promise<void> {
  const exec = getDbExec();
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const body = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    for (const chunk of body.split("--> statement-breakpoint")) {
      const statement = chunk.trim().replace(/;$/, "");
      if (statement) await exec.execute(statement);
    }
  }
}

function contractError(error: unknown): { errorCode: string; statusCode: number } {
  expect(isActionContractError(error)).toBe(true);
  const contract = error as { errorCode: string; statusCode: number };
  return { errorCode: contract.errorCode, statusCode: contract.statusCode };
}

const DRAFT = {
  threadId: "th_1",
  to: "priya@example.com",
  subject: "Following up",
  body: "Quick nudge — I will share delivery by Friday.",
};

describe("learning loop", () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  afterAll(async () => {
    await closeDbExec();
  });

  it("proposes a learning with a learn_ id", async () => {
    const created = await createJob.run({ template: "chase-up", title: "Learn one" });
    const proposed = await proposeLearning.run({
      jobId: created.id,
      fromEffectId: "eff_rejected",
      rule: "never promise delivery dates in first outreach",
    });
    expect(proposed.id.startsWith("learn_")).toBe(true);
    expect(proposed).toMatchObject({ status: "pending", nextRequiredAction: "resolve_learning" });
  });

  it("returns 404 when proposing for an unknown job", async () => {
    const failure = await proposeLearning
      .run({ jobId: "job_missing", fromEffectId: "eff_x", rule: "never promise delivery dates" })
      .catch((e) => e);
    expect(contractError(failure)).toEqual({ errorCode: "job_not_found", statusCode: 404 });
  });

  it("lists the pending learning newest-first", async () => {
    const created = await createJob.run({ template: "chase-up", title: "Learn listed" });
    const proposed = await proposeLearning.run({
      jobId: created.id,
      fromEffectId: "eff_1",
      rule: "never promise delivery dates in first outreach",
    });
    const rows = await listLearnings.run({ jobId: created.id });
    expect(rows.map((row) => row.id)).toContain(proposed.id);
    expect(rows.find((row) => row.id === proposed.id)).toMatchObject({
      rule: "never promise delivery dates in first outreach",
      fromEffectId: "eff_1",
      status: "pending",
    });
  });

  it("renders diff-card HTML with current, proposed, and the rule text", async () => {
    const created = await createJob.run({ template: "chase-up", title: "Learn html" });
    const proposed = await proposeLearning.run({
      jobId: created.id,
      fromEffectId: "eff_2",
      rule: "never promise delivery dates in first outreach",
    });
    const rows = await listLearnings.run({ jobId: created.id });
    const html = renderLearningsHtml(rows);
    expect(html).toContain("current");
    expect(html).toContain("proposed");
    expect(html).toContain("never promise delivery dates");
    expect(html).toContain(proposed.id);
  });

  it("sanitizes drafts only after approval and writes a learning_approved audit row", async () => {
    const created = await createJob.run({ template: "chase-up", title: "Learn applied" });
    const before = await proposeEffect.run({
      jobId: created.id,
      capability: "send_followup",
      payload: { ...DRAFT },
    });
    expect(before.body).toContain("delivery by Friday");

    const proposed = await proposeLearning.run({
      jobId: created.id,
      fromEffectId: before.id,
      rule: "never promise delivery dates in first outreach",
    });
    const decided = await resolveLearning.run({
      learningId: proposed.id,
      resolution: "approved",
    });
    expect(decided).toMatchObject({
      id: proposed.id,
      resolution: "approved",
      nextRequiredAction: "propose_effect",
    });

    const db = getDb();
    const approved = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.jobId, created.id));
    expect(approved.map((row) => row.kind)).toContain("learning_approved");

    const after = await proposeEffect.run({
      jobId: created.id,
      capability: "send_followup",
      payload: { ...DRAFT },
    });
    expect(after.body).not.toContain("delivery by Friday");
    const applied = await db.select().from(auditEvents).where(eq(auditEvents.jobId, created.id));
    expect(applied.map((row) => row.kind)).toContain("learning_applied");
  });

  it("resolving twice yields stale_decision 409", async () => {
    const created = await createJob.run({ template: "chase-up", title: "Learn twice" });
    const proposed = await proposeLearning.run({
      jobId: created.id,
      fromEffectId: "eff_3",
      rule: "never promise delivery dates in first outreach",
    });
    await resolveLearning.run({ learningId: proposed.id, resolution: "approved" });
    const retry = await resolveLearning
      .run({ learningId: proposed.id, resolution: "approved" })
      .catch((e) => e);
    expect(contractError(retry)).toEqual({ errorCode: "stale_decision", statusCode: 409 });
  });

  it("returns 404 for unknown learning ids", async () => {
    const failure = await resolveLearning
      .run({ learningId: "learn_missing", resolution: "approved" })
      .catch((e) => e);
    expect(contractError(failure)).toEqual({ errorCode: "learning_not_found", statusCode: 404 });
  });

  it("sanitizes banned exemplars only when approved rules exist", () => {
    expect(applyApprovedRules("delivery by Friday", []).body).toBe("delivery by Friday");
    const rewritten = applyApprovedRules("We promise delivery by Friday.", ["never promise"]);
    expect(rewritten.applied).toBe(true);
    expect(rewritten.body).not.toContain("delivery by Friday");
  });
});
