import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isActionContractError } from "@agent-native/core/action";
import { closeDbExec, getDbExec } from "@agent-native/core/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import advanceJob from "../actions/advance_job.js";
import createJob from "../actions/create_job.js";
import getJobState from "../actions/get_job_state.js";
import steerJob from "../actions/steer_job.js";
import { getDb } from "../server/db/index.js";
import { auditEvents, messages } from "../server/db/schema.js";
import { pipeSteeringToLiveThread } from "../server/lib/chat-bridge.js";

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

async function runningJob(title: string): Promise<string> {
  const created = await createJob.run({ template: "chase-up", title });
  await advanceJob.run({ id: created.id, to: "running" });
  return created.id;
}

describe("steer_job from running", () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  afterAll(async () => {
    await closeDbExec();
  });

  it("accepts jobId, stays running, and returns the exact acknowledgement", async () => {
    const jobId = await runningJob("Mid-flight steer");

    const steered = await steerJob.run({ jobId, instruction: "skip anyone over 60 days stale" });
    expect(steered).toMatchObject({
      id: jobId,
      message: "Steering acknowledged",
      state: "running",
      nextRequiredAction: "advance_job",
    });
    expect(await getJobState.run({ id: jobId })).toMatchObject({ state: "running" });
  });

  it("persists the steering message row and the steer audit row", async () => {
    const jobId = await runningJob("Steer persistence");
    await steerJob.run({ jobId, instruction: "skip anyone over 60 days stale" });

    const db = getDb();
    const rows = await db.select().from(messages).where(eq(messages.jobId, jobId));
    const steering = rows.find((row) => row.body === "skip anyone over 60 days stale");
    expect(steering?.role).toBe("steering");

    const state = await getJobState.run({ id: jobId });
    expect(state.state).toBe("running");
    const steerRows = state.audit.filter((row) => row.kind === "steer");
    expect(steerRows.length).toBeGreaterThan(0);
    expect(steerRows.some((row) => row.payload.includes("skip anyone over 60 days stale"))).toBe(
      true,
    );
  });

  it("treats legacy id as an alias of jobId", async () => {
    const viaJobId = await runningJob("Steer via jobId");
    const viaLegacyId = await runningJob("Steer via legacy id");

    const a = await steerJob.run({ jobId: viaJobId, instruction: "widen scope" });
    const b = await steerJob.run({ id: viaLegacyId, instruction: "widen scope" });
    expect(a).toMatchObject({ id: viaJobId, message: "Steering acknowledged", state: "running" });
    expect(b).toMatchObject({
      id: viaLegacyId,
      message: "Steering acknowledged",
      state: "running",
    });
    expect(await getJobState.run({ id: viaJobId })).toMatchObject({ state: "running" });
    expect(await getJobState.run({ id: viaLegacyId })).toMatchObject({ state: "running" });
  });

  it("still bounces awaiting_review back to running", async () => {
    const created = await createJob.run({ template: "chase-up", title: "Steer bounce" });
    await advanceJob.run({ id: created.id, to: "running" });
    await advanceJob.run({ id: created.id, to: "awaiting_review" });

    const steered = await steerJob.run({ jobId: created.id, instruction: "tighten the list" });
    expect(steered).toMatchObject({
      id: created.id,
      message: "Steering acknowledged",
      state: "running",
    });
    expect(await getJobState.run({ id: created.id })).toMatchObject({ state: "running" });
  });

  it("rejects steering outside running and awaiting_review", async () => {
    const planning = await createJob.run({ template: "chase-up", title: "Still planning" });
    const planningFailure = await steerJob
      .run({ jobId: planning.id, instruction: "Go." })
      .catch((e) => e);
    expect(contractError(planningFailure)).toEqual({ errorCode: "job_paused", statusCode: 409 });
  });

  it("returns 404 for unknown job ids", async () => {
    const missing = await steerJob
      .run({ jobId: "job_missing", instruction: "Go." })
      .catch((e) => e);
    expect(contractError(missing)).toEqual({ errorCode: "job_not_found", statusCode: 404 });
  });

  it("requires at least one of jobId and id", () => {
    const schema = (
      steerJob as unknown as { schema: { safeParse: (value: unknown) => { success: boolean } } }
    ).schema;
    expect(
      schema.safeParse({ jobId: "job_1", instruction: "widen scope" }).success,
    ).toBe(true);
    expect(schema.safeParse({ id: "job_1", instruction: "widen scope" }).success).toBe(true);
    expect(schema.safeParse({ instruction: "widen scope" }).success).toBe(false);
    expect(schema.safeParse({ jobId: "job_1", instruction: "" }).success).toBe(false);
  });

  it("maps changeResource input/result to the job resource", () => {
    expect(
      steerJob.changeResource?.(
        { jobId: "job_1", instruction: "widen scope" },
        { id: "job_1", message: "Steering acknowledged", state: "running", nextRequiredAction: "advance_job" },
      ),
    ).toEqual({ resourceType: "job", resourceId: "job_1" });
    expect(
      steerJob.changeResource?.(
        { id: "job_2", instruction: "widen scope" },
        { id: "job_2", message: "Steering acknowledged", state: "running", nextRequiredAction: "advance_job" },
      ),
    ).toEqual({ resourceType: "job", resourceId: "job_2" });
  });

  it("exposes audit rows oldest-first on get_job_state", async () => {
    const jobId = await runningJob("Audit order");
    await steerJob.run({ jobId, instruction: "first steer" });
    await steerJob.run({ jobId, instruction: "second steer" });

    const state = await getJobState.run({ id: jobId });
    const kinds = state.audit.map((row) => row.kind);
    expect(kinds.filter((kind) => kind === "steer")).toHaveLength(2);
    const stamps = state.audit.map((row) => row.createdAt);
    expect([...stamps].sort()).toEqual(stamps);

    const db = getDb();
    const direct = await db.select().from(auditEvents).where(eq(auditEvents.jobId, jobId));
    expect(state.audit).toHaveLength(direct.length);
  });
});

describe("chat-bridge pipe", () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  afterAll(async () => {
    await closeDbExec();
  });

  it("queues steering for a live job and never throws", async () => {
    const jobId = await runningJob("Bridge delivery");
    await expect(
      pipeSteeringToLiveThread(jobId, "skip anyone over 60 days stale"),
    ).resolves.toEqual({ delivered: true, mode: "queued" });
  });

  it("resolves (never rejects) even for a missing job", async () => {
    await expect(pipeSteeringToLiveThread("job_missing", "widen scope")).resolves.toEqual({
      delivered: false,
      mode: "queued",
    });
  });
});
