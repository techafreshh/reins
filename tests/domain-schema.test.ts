import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import * as schema from "../server/db/schema";

const TABLES = [
  "jobs",
  "threads",
  "messages",
  "proposed_effects",
  "decisions",
  "policies",
  "audit_events",
  "learnings",
] as const;

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../server/db/migrations",
);

function readMigrationSql(): string[] {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  return files.map((f) => fs.readFileSync(path.join(migrationsDir, f), "utf8"));
}

describe("domain schema", () => {
  it("exports all 8 domain tables", () => {
    expect(schema.jobs).toBeDefined();
    expect(schema.threads).toBeDefined();
    expect(schema.messages).toBeDefined();
    expect(schema.proposedEffects).toBeDefined();
    expect(schema.decisions).toBeDefined();
    expect(schema.policies).toBeDefined();
    expect(schema.auditEvents).toBeDefined();
    expect(schema.learnings).toBeDefined();
  });

  it("ships at least one migration with CREATE TABLE", () => {
    const bodies = readMigrationSql();
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies.some((sql) => sql.includes("CREATE TABLE"))).toBe(true);
  });

  it("creates each domain table and constrains policies.capability", () => {
    const combined = readMigrationSql().join("\n");
    for (const table of TABLES) {
      expect(combined).toMatch(
        new RegExp(`CREATE TABLE\\s+"?${table}"?`, "i"),
      );
    }
    expect(combined).toMatch(/UNIQUE\s*\(\s*"capability"\s*\)/i);
  });
});
