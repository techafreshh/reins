import { sql } from "drizzle-orm";
import { index, integer, pgTable, text } from "drizzle-orm/pg-core";

// Domain tables for jobs, threads, effects, decisions, policies, audit, and
// learnings. Every NOT NULL column carries a DEFAULT so later additive
// migrations stay backward compatible with older inserts; the single
// exception is policies.capability, a unique natural key that callers must
// always supply. Ids are TEXT (populated via crypto.randomUUID() by later
// actions) and timestamps are TEXT ISO strings defaulting to now().
export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(),
  status: text("status").notNull().default("proposed"),
  title: text("title").notNull().default(""),
  summary: text("summary").notNull().default(""),
  attemptCount: integer("attempt_count").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`now()`),
});

export const threads = pgTable(
  "threads",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id").notNull().default(""),
    title: text("title").notNull().default(""),
    messageCount: integer("message_count").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`now()`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`now()`),
  },
  (t) => [index("threads_job_id_idx").on(t.jobId)],
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id").notNull().default(""),
    jobId: text("job_id").notNull().default(""),
    role: text("role").notNull().default(""),
    body: text("body").notNull().default(""),
    seq: integer("seq").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("messages_thread_id_idx").on(t.threadId),
    index("messages_job_id_idx").on(t.jobId),
  ],
);

export const proposedEffects = pgTable(
  "proposed_effects",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id").notNull().default(""),
    kind: text("kind").notNull().default(""),
    summary: text("summary").notNull().default(""),
    payload: text("payload").notNull().default(""),
    status: text("status").notNull().default("proposed"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`now()`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`now()`),
  },
  (t) => [index("proposed_effects_job_id_idx").on(t.jobId)],
);

export const decisions = pgTable(
  "decisions",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id").notNull().default(""),
    effectId: text("effect_id").notNull().default(""),
    decision: text("decision").notNull().default(""),
    reason: text("reason").notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("decisions_job_id_idx").on(t.jobId),
    index("decisions_effect_id_idx").on(t.effectId),
  ],
);

export const policies = pgTable("policies", {
  id: text("id").primaryKey(),
  capability: text("capability").notNull().unique(),
  rule: text("rule").notNull().default(""),
  enabled: integer("enabled").notNull().default(1),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`now()`),
});

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id").notNull().default(""),
    kind: text("kind").notNull().default(""),
    payload: text("payload").notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`now()`),
  },
  (t) => [index("audit_events_job_id_idx").on(t.jobId)],
);

export const learnings = pgTable(
  "learnings",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id").notNull().default(""),
    title: text("title").notNull().default(""),
    body: text("body").notNull().default(""),
    source: text("source").notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .default(sql`now()`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`now()`),
  },
  (t) => [index("learnings_job_id_idx").on(t.jobId)],
);
