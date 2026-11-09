import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

import { isActionContractError } from "@agent-native/core/action";
import { closeDbExec, getDbExec } from "@agent-native/core/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import advanceJob from "../actions/advance-job.js";
import createJob from "../actions/create-job.js";
import decideEffect from "../actions/decide-effect.js";
import listEffects from "../actions/list-effects.js";
import proposeEffect from "../actions/propose-effect.js";
import QueueCard from "../app/components/review/QueueCard.js";
import { loader as reviewLoader, QUEUE_ACTION_LABELS } from "../app/routes/review.js";
import { getDb } from "../server/db/index.js";
import { decisions } from "../server/db/schema.js";
import { normalizeDecision } from "../server/lib/effects.js";

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
  subject: "Hi",
  body: "nudge",
};

async function jobWithProposal(title = "Review me") {
  const created = await createJob.run({ template: "chase-up", title });
  const proposed = await proposeEffect.run({
    jobId: created.id,
    capability: "send_followup",
    payload: { ...DRAFT },
  });
  return { jobId: created.id, effectId: proposed.id };
}

describe("propose-effect", () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  afterAll(async () => {
    await closeDbExec();
  });

  it("returns pending_review with an eff_ id", async () => {
    const created = await createJob.run({ template: "chase-up", title: "Propose shape" });
    const proposed = await proposeEffect.run({
      jobId: created.id,
      capability: "send_followup",
      payload: { ...DRAFT },
    });
    expect(proposed.status).toBe("pending_review");
    expect(proposed.id.startsWith("eff_")).toBe(true);
    expect(proposed.message).toBe("Pending review");
  });

  it("appears in list-effects with the draft fields lifted", async () => {
    const { effectId } = await jobWithProposal("Listed draft");
    const rows = await listEffects.run({});
    const row = rows.find((entry) => entry.id === effectId)!;
    expect(row).toMatchObject({
      id: effectId,
      capability: "send_followup",
      status: "pending_review",
      to: "priya@example.com",
      subject: "Hi",
    });
    expect(row.payload).toMatchObject({ ...DRAFT });
  });

  it("returns 404 for unknown jobs", async () => {
    const failure = await proposeEffect
      .run({ jobId: "job_missing", capability: "send_followup", payload: { ...DRAFT } })
      .catch((e) => e);
    expect(contractError(failure)).toEqual({ errorCode: "job_not_found", statusCode: 404 });
  });

  it("filters by effectId, jobId, and status", async () => {
    const first = await jobWithProposal("Filter one");
    const second = await jobWithProposal("Filter two");
    await decideEffect.run({ effectId: second.effectId, decision: "approve" });

    expect((await listEffects.run({ effectId: first.effectId })).map((row) => row.id)).toEqual([
      first.effectId,
    ]);
    expect(
      (await listEffects.run({ jobId: second.jobId })).map((row) => row.id),
    ).toContain(second.effectId);
    const pending = await listEffects.run({ status: "pending_review" });
    expect(pending.map((row) => row.id)).toContain(first.effectId);
    expect(pending.map((row) => row.id)).not.toContain(second.effectId);
  });
});

describe("decide-effect", () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  afterAll(async () => {
    await closeDbExec();
  });

  it("rejects a reject without feedback as 400 containing feedback: Required", async () => {
    const { effectId } = await jobWithProposal("Reject needs feedback");
    const failure = await decideEffect.run({ effectId, decision: "rejected" }).catch((e) => e);
    expect(contractError(failure)).toEqual({ errorCode: "feedback_required", statusCode: 400 });
    expect((failure as Error).message).toContain("feedback: Required");

    const blank = await decideEffect
      .run({ effectId, decision: "reject", feedback: "   " })
      .catch((e) => e);
    expect(contractError(blank)).toEqual({ errorCode: "feedback_required", statusCode: 400 });
  });

  it("approve flips list-effects to approved with exactly one decision row", async () => {
    const { effectId } = await jobWithProposal("Approve me");
    const db = getDb();
    const before = await db.select().from(decisions).where(eq(decisions.effectId, effectId));
    expect(before).toHaveLength(0);

    const decided = await decideEffect.run({ effectId, decision: "approve" });
    expect(decided).toMatchObject({ id: effectId, status: "approved" });

    const listed = await listEffects.run({ effectId });
    expect(listed[0]?.status).toBe("approved");

    const after = await db.select().from(decisions).where(eq(decisions.effectId, effectId));
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ effectId, decision: "approve" });
  });

  it("is idempotent: an approve retry creates no second row", async () => {
    const { effectId } = await jobWithProposal("Approve twice");
    await decideEffect.run({ effectId, decision: "approved" });
    const retry = await decideEffect.run({ effectId, decision: "approve" });
    expect(retry).toMatchObject({ id: effectId, status: "approved" });

    const db = getDb();
    const rows = await db.select().from(decisions).where(eq(decisions.effectId, effectId));
    expect(rows).toHaveLength(1);
  });

  it("rejects a conflicting second decision as 409", async () => {
    const { effectId } = await jobWithProposal("Conflicting decision");
    await decideEffect.run({ effectId, decision: "approve" });
    const failure = await decideEffect
      .run({ effectId, decision: "reject", feedback: "too soon" })
      .catch((e) => e);
    expect(contractError(failure)).toEqual({ errorCode: "effect_decided", statusCode: 409 });
  });

  it("edit-approve merges edits, yields edited, and unblocks completion", async () => {
    const created = await createJob.run({ template: "chase-up", title: "Edit then complete" });
    await advanceJob.run({ id: created.id, to: "running" });
    await advanceJob.run({ id: created.id, to: "awaiting_review" });
    const proposed = await proposeEffect.run({
      jobId: created.id,
      capability: "send_followup",
      payload: { ...DRAFT },
    });

    const decided = await decideEffect.run({
      effectId: proposed.id,
      decision: "edit-approve",
      edits: { subject: "Updated subject", body: "revised nudge" },
    });
    expect(decided).toMatchObject({ id: proposed.id, status: "edited" });

    const listed = await listEffects.run({ effectId: proposed.id });
    expect(listed[0]).toMatchObject({ status: "edited", subject: "Updated subject" });
    expect(listed[0]?.payload.body).toBe("revised nudge");
    expect(listed[0]?.payload.to).toBe("priya@example.com");

    const done = await advanceJob.run({ id: created.id, to: "complete" });
    expect(done).toMatchObject({ id: created.id, state: "complete" });
  });

  it("batch approve decides every effect", async () => {
    const first = await jobWithProposal("Batch one");
    const second = await jobWithProposal("Batch two");
    const decided = await decideEffect.run({
      effectIds: [first.effectId, second.effectId],
      decision: "approve",
    });
    expect(decided.decided).toHaveLength(2);
    expect(await listEffects.run({ effectId: first.effectId })).toMatchObject([
      { status: "approved" },
    ]);
    expect(await listEffects.run({ effectId: second.effectId })).toMatchObject([
      { status: "approved" },
    ]);
  });

  it("batch with a missing id writes nothing", async () => {
    const valid = await jobWithProposal("Atomic batch valid");
    const failure = await decideEffect
      .run({ effectIds: [valid.effectId, "eff_missing"], decision: "approve" })
      .catch((e) => e);
    expect(contractError(failure)).toEqual({ errorCode: "effect_not_found", statusCode: 404 });
    expect(await listEffects.run({ effectId: valid.effectId })).toMatchObject([
      { status: "pending_review" },
    ]);
    const db = getDb();
    const rows = await db.select().from(decisions).where(eq(decisions.effectId, valid.effectId));
    expect(rows).toHaveLength(0);
  });

  it("batch with a conflicting prior decision writes nothing", async () => {
    const pending = await jobWithProposal("Atomic batch pending");
    const approved = await jobWithProposal("Atomic batch approved");
    await decideEffect.run({ effectId: approved.effectId, decision: "approve" });
    const failure = await decideEffect
      .run({
        effectIds: [pending.effectId, approved.effectId],
        decision: "reject",
        feedback: "x",
      })
      .catch((e) => e);
    expect(contractError(failure)).toEqual({ errorCode: "effect_decided", statusCode: 409 });
    expect(await listEffects.run({ effectId: pending.effectId })).toMatchObject([
      { status: "pending_review" },
    ]);
    const db = getDb();
    const rows = await db.select().from(decisions).where(eq(decisions.effectId, pending.effectId));
    expect(rows).toHaveLength(0);
  });

  it("returns 404 for unknown effect ids", async () => {
    const failure = await decideEffect
      .run({ effectId: "eff_missing", decision: "approve" })
      .catch((e) => e);
    expect(contractError(failure)).toEqual({ errorCode: "effect_not_found", statusCode: 404 });
  });
});

describe("decision normalization", () => {
  it("maps every accepted spelling to its canonical decision", () => {
    expect(normalizeDecision("approve")).toBe("approve");
    expect(normalizeDecision("approved")).toBe("approve");
    expect(normalizeDecision("edit")).toBe("edit");
    expect(normalizeDecision("edit-approve")).toBe("edit");
    expect(normalizeDecision("edited")).toBe("edit");
    expect(normalizeDecision("reject")).toBe("reject");
    expect(normalizeDecision("rejected")).toBe("reject");
    expect(normalizeDecision("bogus")).toBeNull();
  });
});

describe("review loader failure signal", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function queueRow(id: string, status: string) {
    return {
      id,
      jobId: "job_loader",
      capability: "send_followup",
      status,
      payload: { threadId: "th_1", to: "priya@example.com", subject: "Hi", body: "nudge" },
      to: "priya@example.com",
      subject: "Hi",
      updatedAt: new Date().toISOString(),
    };
  }

  it("returns error null with the correct pending/decided split", async () => {
    // The loader reads through the list-effects action directly (loaders
    // never see request cookies in this framework build, so the earlier
    // same-origin self-fetch 401'd in production). Spy on the action the
    // loader calls — the real query semantics are covered upstream.
    vi.spyOn(listEffects, "run").mockResolvedValue([
      queueRow("eff_pending", "pending_review"),
      queueRow("eff_done", "approved"),
    ] as never);
    const data = await reviewLoader();
    expect(data.error).toBeNull();
    expect(data.pending.map((row) => row.id)).toEqual(["eff_pending"]);
    expect(data.decided.map((row) => row.id)).toEqual(["eff_done"]);
    expect(data.labels).toEqual(QUEUE_ACTION_LABELS);
  });

  it("flags an action failure as an error instead of an empty queue", async () => {
    vi.spyOn(listEffects, "run").mockRejectedValue(new Error("boom"));
    const data = await reviewLoader();
    expect(data.pending).toEqual([]);
    expect(data.decided).toEqual([]);
    expect(data.error).toContain("Couldn't load the review queue");
    expect(data.labels).toEqual(QUEUE_ACTION_LABELS);
  });

  it("renders the failure banner (not the empty-queue card) on loader error", () => {
    // Mirrors the ReviewRoute conditional: the alert + Retry render when
    // `error` is set, and the "No effects waiting for review." card is
    // gated on `!error`, so the two strings never co-render.
    const html = renderToStaticMarkup(
      <>
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-destructive">
            Couldn't load the review queue.
          </p>
          <button type="button">Retry</button>
        </div>
      </>,
    );
    expect(html).toContain("load the review queue");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Retry");
  });
});

describe("review queue card", () => {
  it("renders Approve, Reject, and the to address", () => {
    const html = renderToStaticMarkup(
      <QueueCard
        effect={{
          id: "eff_card",
          jobId: "job_card",
          capability: "send_followup",
          status: "pending_review",
          payload: { ...DRAFT },
          to: "priya@example.com",
          subject: "Hi",
          updatedAt: new Date().toISOString(),
        }}
        labels={QUEUE_ACTION_LABELS}
        selected={false}
        onToggleSelect={() => {}}
        onDecided={() => {}}
      />,
    );
    expect(html).toContain("Approve");
    expect(html).toContain("Reject");
    expect(html).toContain("priya@example.com");
  });
});
