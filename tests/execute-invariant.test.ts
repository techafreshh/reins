import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { isActionContractError } from "@agent-native/core/action";
import { closeDbExec, getDbExec } from "@agent-native/core/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import createJob from "../actions/create-job.js";
import decideEffect from "../actions/decide-effect.js";
import executeEffect from "../actions/execute-approved-effect.js";
import proposeEffect from "../actions/propose-effect.js";
import updatePolicy from "../actions/update-policy.js";
import ReviewRoute, {
  QUEUE_ACTION_LABELS,
  SIMULATED_OUTBOX_NOTE,
} from "../app/routes/review.js";
import { getDb } from "../server/db/index.js";
import { auditEvents } from "../server/db/schema.js";

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

async function jobWithProposal(title: string) {
  const created = await createJob.run({ template: "chase-up", title });
  const proposed = await proposeEffect.run({
    jobId: created.id,
    capability: "send_followup",
    payload: { ...DRAFT },
  });
  return { jobId: created.id, effectId: proposed.id };
}

async function executeAuditRows(effectId: string) {
  const db = getDb();
  const rows = await db.select().from(auditEvents).where(eq(auditEvents.kind, "execute"));
  return rows.filter((row) => {
    try {
      return (JSON.parse(row.payload) as { effectId?: unknown }).effectId === effectId;
    } catch {
      return false;
    }
  });
}

describe("execute-approved-effect gate", () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  afterAll(async () => {
    await closeDbExec();
  });

  it("refuses an unapproved effect with 409 not_approved and a false receipt flag", async () => {
    const { effectId } = await jobWithProposal("Never approved");
    const failure = await executeEffect.run({ effectId }).catch((e) => e);
    expect(contractError(failure)).toEqual({ errorCode: "not_approved", statusCode: 409 });
    expect((failure as Error).message).toContain("Simulated outbox");
    expect((failure as { details?: unknown }).details).toMatchObject({ receipt: false });
    expect(await executeAuditRows(effectId)).toHaveLength(0);
  });

  it("returns 404 for unknown effect ids", async () => {
    const failure = await executeEffect.run({ effectId: "eff_missing" }).catch((e) => e);
    expect(contractError(failure)).toEqual({ errorCode: "effect_not_found", statusCode: 404 });
  });

  it("executes an approved effect once, then reports a stale decision", async () => {
    const { effectId } = await jobWithProposal("Approve then execute");
    await decideEffect.run({ effectId, decision: "approve" });

    const first = await executeEffect.run({ effectId });
    expect(first).toMatchObject({ id: effectId, receipt: "simulated-sent" });
    expect(first.message).toContain("Simulated");
    expect(first.executed).toEqual([{ effectId, receipt: "simulated-sent" }]);

    const retry = await executeEffect.run({ effectId }).catch((e) => e);
    expect(contractError(retry)).toEqual({ errorCode: "stale_decision", statusCode: 409 });

    const rows = await executeAuditRows(effectId);
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.payload)).toMatchObject({
      effectId,
      receipt: "simulated-sent",
    });
  });

  it("treats edit-approve as approval but never executes a rejection", async () => {
    const edited = await jobWithProposal("Edit then execute");
    await decideEffect.run({
      effectId: edited.effectId,
      decision: "edit-approve",
      edits: { subject: "Revised subject" },
    });
    const done = await executeEffect.run({ effectId: edited.effectId });
    expect(done.receipt).toBe("simulated-sent");

    const rejected = await jobWithProposal("Rejected never executes");
    await decideEffect.run({ effectId: rejected.effectId, decision: "reject", feedback: "nope" });
    const failure = await executeEffect.run({ effectId: rejected.effectId }).catch((e) => e);
    expect(contractError(failure)).toEqual({ errorCode: "not_approved", statusCode: 409 });
  });

  it("pauses execution while the kill switch is on and resumes when off", async () => {
    const { effectId } = await jobWithProposal("Kill switched");
    await decideEffect.run({ effectId, decision: "approve" });

    const switchedOn = await updatePolicy.run({ killSwitch: true });
    expect(switchedOn).toMatchObject({ id: "kill_switch", killSwitch: true });
    expect(switchedOn.message).toContain("paused");

    const blocked = await executeEffect.run({ effectId }).catch((e) => e);
    expect(contractError(blocked)).toEqual({ errorCode: "job_paused", statusCode: 409 });
    expect(await executeAuditRows(effectId)).toHaveLength(0);

    const switchedOff = await updatePolicy.run({ killSwitch: false });
    expect(switchedOff).toMatchObject({ id: "kill_switch", killSwitch: false });

    const done = await executeEffect.run({ effectId });
    expect(done.receipt).toBe("simulated-sent");
  });

  it("executes a batch of approved effects exactly once each", async () => {
    await updatePolicy.run({ killSwitch: false });
    const first = await jobWithProposal("Batch exec one");
    const second = await jobWithProposal("Batch exec two");
    await decideEffect.run({
      effectIds: [first.effectId, second.effectId],
      decision: "approve",
    });

    const result = await executeEffect.run({ effectIds: [first.effectId, second.effectId] });
    expect(result.receipt).toBe("simulated-sent");
    expect(result.executed).toHaveLength(2);

    const retry = await executeEffect
      .run({ effectIds: [first.effectId, second.effectId] })
      .catch((e) => e);
    expect(contractError(retry)).toEqual({ errorCode: "stale_decision", statusCode: 409 });
    expect(await executeAuditRows(first.effectId)).toHaveLength(1);
    expect(await executeAuditRows(second.effectId)).toHaveLength(1);
  });

  it("validates the whole batch before executing anything", async () => {
    await updatePolicy.run({ killSwitch: false });
    const approved = await jobWithProposal("Batch mixed approved");
    const pending = await jobWithProposal("Batch mixed pending");
    await decideEffect.run({ effectId: approved.effectId, decision: "approve" });

    const failure = await executeEffect
      .run({ effectIds: [approved.effectId, pending.effectId] })
      .catch((e) => e);
    expect(contractError(failure)).toEqual({ errorCode: "not_approved", statusCode: 409 });
    // Nothing was written for the approved member either: still executable.
    const done = await executeEffect.run({ effectId: approved.effectId });
    expect(done.receipt).toBe("simulated-sent");
    expect(await executeAuditRows(pending.effectId)).toHaveLength(0);
  });
});

describe("simulated outbox chip", () => {
  it("exports the exact string rendered under the queue header", () => {
    expect(SIMULATED_OUTBOX_NOTE).toBe("Simulated outbox — nothing leaves this machine");
    const html = renderToStaticMarkup(createElement("p", null, SIMULATED_OUTBOX_NOTE));
    expect(html).toContain("Simulated outbox — nothing leaves this machine");
  });

  it("ships the exact string in the review route SSR HTML", async () => {
    const { createStaticHandler, createStaticRouter, StaticRouterProvider } =
      await import("react-router");
    const routes = [
      {
        path: "/review",
        Component: ReviewRoute,
        loader: () => ({ pending: [], decided: [], labels: QUEUE_ACTION_LABELS }),
      },
    ];
    const handler = createStaticHandler(routes);
    const context = await handler.query(new Request("http://localhost/review"));
    expect(context).not.toBeInstanceOf(Response);
    if (context instanceof Response) {
      throw new Error(`Unexpected redirect to ${context.headers.get("location")}`);
    }
    const router = createStaticRouter(routes, context);
    const html = renderToStaticMarkup(
      createElement(StaticRouterProvider, { router, context }),
    );
    expect(html).toContain("Review Queue");
    expect(html).toContain("Simulated outbox — nothing leaves this machine");
  });
});
