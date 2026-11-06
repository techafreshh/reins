import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { closeDbExec, getDbExec } from "@agent-native/core/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDb } from "../server/db/index.js";
import { jobs, threads } from "../server/db/schema.js";
import { DEMO_JOB_ID, DEMO_THREADS, listDemoThreads, seedDemo } from "../server/lib/demo.js";

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

describe("demo seed", () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  afterAll(async () => {
    await closeDbExec();
  });

  it("declares exactly 7 deterministic fixture threads", () => {
    expect(DEMO_THREADS).toHaveLength(7);
    const ids = DEMO_THREADS.map((t) => t.id);
    expect(new Set(ids).size).toBe(7);
    expect(ids).toEqual([
      "demo-thread-01",
      "demo-thread-02",
      "demo-thread-03",
      "demo-thread-04",
      "demo-thread-05",
      "demo-thread-06",
      "demo-thread-07",
    ]);
    expect(DEMO_THREADS.map((t) => t.stalenessDays)).toEqual([3, 7, 12, 28, 45, 62, 70]);
    expect(DEMO_THREADS.filter((t) => t.sensitive)).toHaveLength(1);
    expect(DEMO_THREADS.filter((t) => t.promisedDateMissed)).toHaveLength(1);
  });

  it("seeds 7 threads with identical ids on rerun", async () => {
    const first = await seedDemo();
    expect(first.threads).toBe(7);
    expect(first.jobId).toBe(DEMO_JOB_ID);

    const second = await seedDemo();
    expect(second.threads).toBe(7);
    expect(second.threadIds).toEqual(first.threadIds);

    const db = getDb();
    const rows = await db.select().from(threads);
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.id).sort()).toEqual([...first.threadIds].sort());
  });

  it("covers staleness, sensitive contact, and promised-then-missed flags", async () => {
    await seedDemo();
    const db = getDb();
    const rows = await db.select().from(threads);

    expect(rows.filter((r) => r.sensitive)).toHaveLength(1);
    expect(rows.filter((r) => r.promisedDateMissed)).toHaveLength(1);
    expect(Math.max(...rows.map((r) => r.stalenessDays))).toBeGreaterThanOrEqual(60);

    const alex = rows.find((r) => r.contactEmail === "alex@example.com");
    expect(alex?.sensitive).toBe(true);
  });

  it("lists threads with both camelCase and snake_case flag fields", async () => {
    await seedDemo();
    const rows = await listDemoThreads();

    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.id)).toEqual(DEMO_THREADS.map((t) => t.id));
    expect(rows.filter((r) => r.sensitive)).toHaveLength(1);
    expect(rows.filter((r) => r.promised_date_missed)).toHaveLength(1);
    expect(Math.max(...rows.map((r) => r.staleness_days))).toBeGreaterThanOrEqual(60);
  });

  it("does not duplicate jobs on reseed", async () => {
    await seedDemo();
    const db = getDb();
    const before = await db.select().from(jobs);

    await seedDemo();

    const after = await db.select().from(jobs);
    expect(after.length).toBe(before.length);
    expect(after.filter((j) => j.id === DEMO_JOB_ID)).toHaveLength(1);
  });

  it("force reseed returns the same 7 ids", async () => {
    await seedDemo();
    const forced = await seedDemo({ force: true });

    expect(forced.threadIds).toEqual(DEMO_THREADS.map((t) => t.id));

    const db = getDb();
    const rows = await db.select().from(threads);
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.id).sort()).toEqual([...forced.threadIds].sort());
  });
});
