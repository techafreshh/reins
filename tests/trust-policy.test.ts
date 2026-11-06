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
import getPolicy from "../actions/get-policy.js";
import proposeEffect from "../actions/propose-effect.js";
import updatePolicy from "../actions/update-policy.js";
import { TrustPanel } from "../app/routes/trust.js";
import { getDb } from "../server/db/index.js";
import { auditEvents, threads } from "../server/db/schema.js";
import { countWords, evaluateSendFollowup } from "../server/lib/policy.js";

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

function words(n: number): string {
  return Array.from({ length: n }, () => "word").join(" ");
}

async function policyChangeCount(): Promise<number> {
  const db = getDb();
  const rows = await db.select().from(auditEvents).where(eq(auditEvents.kind, "policy_change"));
  return rows.length;
}

describe("trust policy predicates", () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  afterAll(async () => {
    await closeDbExec();
  });

  it("counts words with whitespace collapsing", () => {
    expect(countWords("  hello   world ")).toBe(2);
    expect(countWords("")).toBe(0);
    expect(countWords(words(60))).toBe(60);
  });

  it("evaluates the send_followup SMART predicate without touching actions", async () => {
    const db = getDb();
    await db
      .insert(threads)
      .values({ id: "th_eval_stale", stalenessDays: 70 })
      .onConflictDoNothing({ target: threads.id });

    expect(await evaluateSendFollowup(db, { body: "short", to: "priya@example.com", threadId: "th_missing" }))
      .toEqual({ allowed: true });
    expect(await evaluateSendFollowup(db, { body: words(61), to: "priya@example.com", threadId: "th_missing" }))
      .toEqual({ allowed: false, reason: "too_long" });
    expect(await evaluateSendFollowup(db, { body: "short", to: "Alex@example.com", threadId: "th_missing" }))
      .toEqual({ allowed: false, reason: "sensitive" });
    expect(await evaluateSendFollowup(db, { body: "short", to: "priya@example.com", threadId: "th_eval_stale" }))
      .toEqual({ allowed: false, reason: "stale" });
  });
});

describe("get-policy defaults", () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  afterAll(async () => {
    await closeDbExec();
  });

  it("returns ASK/SMART send_followup with the kill switch off on a fresh database", async () => {
    const policy = await getPolicy.run({});
    expect(["ASK", "SMART"]).toContain(policy.send_followup);
    expect(policy.send_followup).toBe("ASK");
    expect(policy.killSwitch).toBe(false);
    expect(policy.levels).toMatchObject({
      send_followup: "ASK",
      draft_reply: "ASK",
      label_or_tag: "ASK",
    });
  });
});

describe("update-policy writes and audit", () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  afterAll(async () => {
    await closeDbExec();
  });

  it("flips send_followup to ASK with exactly one new policy_change audit row", async () => {
    await updatePolicy.run({ capability: "send_followup", level: "SMART" });
    const before = await policyChangeCount();
    const updated = await updatePolicy.run({ capability: "send_followup", level: "ASK" });
    expect(updated).toMatchObject({ id: "send_followup", capability: "send_followup", level: "ASK" });
    expect(await policyChangeCount()).toBe(before + 1);

    const policy = await getPolicy.run({});
    expect(policy.send_followup).toBe("ASK");
    expect(policy.levels.send_followup).toBe("ASK");
  });

  it("renders the live ASK level in the Trust panel markup", async () => {
    await updatePolicy.run({ capability: "send_followup", level: "ASK" });
    const policy = await getPolicy.run({});
    const html = renderToStaticMarkup(
      createElement(TrustPanel, {
        levels: policy.levels,
        killSwitch: policy.killSwitch,
        onUpdate: () => {},
      }),
    );
    expect(html).toContain("send_followup");
    expect(html.toLowerCase()).toContain("kill switch");
    expect(html).toContain("ASK");
  });

  it("keeps the kill-switch toggle shape and message", async () => {
    const switchedOn = await updatePolicy.run({ killSwitch: true });
    expect(switchedOn).toMatchObject({ id: "kill_switch", killSwitch: true });
    expect(switchedOn.message).toContain("paused");

    const switchedOff = await updatePolicy.run({ killSwitch: false });
    expect(switchedOff).toMatchObject({ id: "kill_switch", killSwitch: false });
  });
});

describe("SMART propose gate", () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  afterAll(async () => {
    await closeDbExec();
  });

  it("blocks an 80-word body, an alex@ recipient, and a 70-day stale thread with 403", async () => {
    await updatePolicy.run({ killSwitch: false });
    await updatePolicy.run({ capability: "send_followup", level: "SMART" });
    const db = getDb();
    await db
      .insert(threads)
      .values({ id: "th_stale_70", stalenessDays: 70 })
      .onConflictDoNothing({ target: threads.id });
    const created = await createJob.run({ template: "chase-up", title: "SMART triple" });

    const longBody = await proposeEffect
      .run({
        jobId: created.id,
        capability: "send_followup",
        payload: { threadId: "th_1", to: "priya@example.com", subject: "Hi", body: words(80) },
      })
      .catch((e) => e);
    expect(contractError(longBody)).toEqual({ errorCode: "trust_below_threshold", statusCode: 403 });

    const sensitive = await proposeEffect
      .run({
        jobId: created.id,
        capability: "send_followup",
        payload: { threadId: "th_1", to: "alex@example.com", subject: "Hi", body: "short nudge" },
      })
      .catch((e) => e);
    expect(contractError(sensitive)).toEqual({ errorCode: "trust_below_threshold", statusCode: 403 });

    const stale = await proposeEffect
      .run({
        jobId: created.id,
        capability: "send_followup",
        payload: { threadId: "th_stale_70", to: "priya@example.com", subject: "Hi", body: "short nudge" },
      })
      .catch((e) => e);
    expect(contractError(stale)).toEqual({ errorCode: "trust_below_threshold", statusCode: 403 });

    const clean = await proposeEffect.run({
      jobId: created.id,
      capability: "send_followup",
      payload: { threadId: "th_1", to: "priya@example.com", subject: "Hi", body: "short nudge" },
    });
    expect(clean.status).toBe("pending_review");
  });

  it("holds the 60/61 word and 59/60 day boundaries", async () => {
    await updatePolicy.run({ killSwitch: false });
    await updatePolicy.run({ capability: "send_followup", level: "SMART" });
    const db = getDb();
    await db
      .insert(threads)
      .values({ id: "th_stale_59", stalenessDays: 59 })
      .onConflictDoNothing({ target: threads.id });
    await db
      .insert(threads)
      .values({ id: "th_stale_60", stalenessDays: 60 })
      .onConflictDoNothing({ target: threads.id });
    const created = await createJob.run({ template: "chase-up", title: "SMART boundaries" });

    const sixty = await proposeEffect.run({
      jobId: created.id,
      capability: "send_followup",
      payload: { threadId: "th_1", to: "priya@example.com", subject: "Hi", body: words(60) },
    });
    expect(sixty.status).toBe("pending_review");

    const sixtyOne = await proposeEffect
      .run({
        jobId: created.id,
        capability: "send_followup",
        payload: { threadId: "th_1", to: "priya@example.com", subject: "Hi", body: words(61) },
      })
      .catch((e) => e);
    expect(contractError(sixtyOne)).toEqual({ errorCode: "trust_below_threshold", statusCode: 403 });

    const fresh = await proposeEffect.run({
      jobId: created.id,
      capability: "send_followup",
      payload: { threadId: "th_stale_59", to: "priya@example.com", subject: "Hi", body: "short nudge" },
    });
    expect(fresh.status).toBe("pending_review");

    const stale = await proposeEffect
      .run({
        jobId: created.id,
        capability: "send_followup",
        payload: { threadId: "th_stale_60", to: "priya@example.com", subject: "Hi", body: "short nudge" },
      })
      .catch((e) => e);
    expect(contractError(stale)).toEqual({ errorCode: "trust_below_threshold", statusCode: 403 });

    await updatePolicy.run({ capability: "send_followup", level: "ASK" });
  });
});

describe("kill-switch propose gate", () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  afterAll(async () => {
    await closeDbExec();
  });

  it("blocks proposing with policy_blocked while on and resumes when off", async () => {
    await updatePolicy.run({ capability: "send_followup", level: "ASK" });
    await updatePolicy.run({ killSwitch: true });
    const created = await createJob.run({ template: "chase-up", title: "Kill gated" });

    const blocked = await proposeEffect
      .run({
        jobId: created.id,
        capability: "send_followup",
        payload: { threadId: "th_1", to: "priya@example.com", subject: "Hi", body: "nudge" },
      })
      .catch((e) => e);
    expect(contractError(blocked)).toEqual({ errorCode: "policy_blocked", statusCode: 409 });

    await updatePolicy.run({ killSwitch: false });
    const resumed = await proposeEffect.run({
      jobId: created.id,
      capability: "send_followup",
      payload: { threadId: "th_1", to: "priya@example.com", subject: "Hi", body: "nudge" },
    });
    expect(resumed.status).toBe("pending_review");
  });
});
