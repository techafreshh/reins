import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { getDb } from "../db/index.js";
import { auditEvents, jobs, messages, threads } from "../db/schema.js";

/**
 * Deterministic demo world for the Reins three-beat demo.
 *
 * Seven synthetic stakeholder threads (`demo-thread-01` … `demo-thread-07`)
 * under one demo job (`demo-job-chase-001`). Fixture truth lives here: both
 * entry points (`pnpm seed:demo` via `server/db/seed.ts`, and `GET /demo`)
 * call `seedDemo()`, so reseeds converge instead of duplicating.
 *
 * All contacts use synthetic `@example.com` addresses. No real PII.
 */
export const DEMO_JOB_ID = "demo-job-chase-001";

export interface DemoMessage {
  id: string;
  role: string;
  body: string;
  seq: number;
}

export interface DemoThread {
  id: string;
  title: string;
  stakeholder: string;
  contactEmail: string;
  snippet: string;
  stalenessDays: number;
  sensitive: boolean;
  promisedDateMissed: boolean;
  messages: DemoMessage[];
}

function threadMessages(id: string, bodies: Array<[string, string]>): DemoMessage[] {
  return bodies.map(([role, body], i) => ({
    id: `demo-msg-${id}-${i + 1}`,
    role,
    body,
    seq: i + 1,
  }));
}

export const DEMO_THREADS: DemoThread[] = [
  {
    id: "demo-thread-01",
    title: "Q3 budget sign-off",
    stakeholder: "Maya Chen",
    contactEmail: "maya@example.com",
    snippet: "Waiting on finance to countersign the Q3 spend plan.",
    stalenessDays: 3,
    sensitive: false,
    promisedDateMissed: false,
    messages: threadMessages("demo-thread-01", [
      ["stakeholder", "Finance review is queued — I will countersign the Q3 spend plan this week."],
      ["agent", "Noted. I will hold the chase until your sign-off lands."],
    ]),
  },
  {
    id: "demo-thread-02",
    title: "Vendor renewal terms",
    stakeholder: "Jordan Ellis",
    contactEmail: "jordan@example.com",
    snippet: "Renewal draft sent; awaiting redlines from procurement.",
    stalenessDays: 7,
    sensitive: false,
    promisedDateMissed: false,
    messages: threadMessages("demo-thread-02", [
      ["stakeholder", "Renewal draft received. Procurement will return redlines shortly."],
    ]),
  },
  {
    /**
     * Sensitive-contact rule: Alex Rivera (alex@example.com) is the sensitive
     * contact in the demo world. Never auto-email Alex; exclude this thread
     * from auto-sends. A steering instruction like "don't email Alex before
     * Thursday" must keep holding even when a chase is overdue.
     */
    id: "demo-thread-03",
    title: "Private compensation discussion",
    stakeholder: "Alex Rivera",
    contactEmail: "alex@example.com",
    snippet: "Confidential thread — compensation details, no auto-send.",
    stalenessDays: 12,
    sensitive: true,
    promisedDateMissed: false,
    messages: threadMessages("demo-thread-03", [
      ["stakeholder", "Sharing my compensation details in confidence — please keep this between us."],
      ["agent", "Understood. This thread is marked sensitive and excluded from auto-sends."],
    ]),
  },
  {
    id: "demo-thread-04",
    title: "Launch checklist review",
    stakeholder: "Priya Nair",
    contactEmail: "priya@example.com",
    snippet: "Promised the checklist by Friday — missed, still pending.",
    stalenessDays: 28,
    sensitive: false,
    promisedDateMissed: true,
    messages: threadMessages("demo-thread-04", [
      ["stakeholder", "I promised the launch checklist by Friday and missed it. Still working through it."],
      ["agent", "Recorded as a promised-then-missed date. Following up on the revised timeline."],
    ]),
  },
  {
    id: "demo-thread-05",
    title: "Security questionnaire",
    stakeholder: "Sam Okafor",
    contactEmail: "sam@example.com",
    snippet: "Questionnaire partially answered; blocked on infra details.",
    stalenessDays: 45,
    sensitive: false,
    promisedDateMissed: false,
    messages: threadMessages("demo-thread-05", [
      ["stakeholder", "Halfway through the questionnaire — blocked on two infra questions."],
    ]),
  },
  {
    id: "demo-thread-06",
    title: "Contract legal review",
    stakeholder: "Dana Kim",
    contactEmail: "dana@example.com",
    snippet: "With outside counsel for six weeks; nudged twice.",
    stalenessDays: 62,
    sensitive: false,
    promisedDateMissed: false,
    messages: threadMessages("demo-thread-06", [
      ["stakeholder", "Outside counsel still has the contract. I have nudged them twice."],
      ["agent", "Acknowledged. Keeping this chase open until counsel replies."],
    ]),
  },
  {
    id: "demo-thread-07",
    title: "Data retention policy sign-off",
    stakeholder: "Leo Martins",
    contactEmail: "leo@example.com",
    snippet: "Oldest open loop — retention policy awaiting signature.",
    stalenessDays: 70,
    sensitive: false,
    promisedDateMissed: false,
    messages: threadMessages("demo-thread-07", [
      ["stakeholder", "The retention policy is still awaiting signature on my side."],
    ]),
  },
];

export interface SeedResult {
  threads: number;
  jobId: string;
  threadIds: string[];
}

export interface DemoThreadRow {
  id: string;
  stakeholder: string;
  contactEmail: string;
  sensitive: boolean;
  promisedDateMissed: boolean;
  stalenessDays: number;
  lastMessageAt: string;
  snippet: string;
  messageCount: number;
  // Snake-case aliases mirroring the SQL column names used in the issue
  // contract (`promised_date_missed`, `staleness_days`, ...).
  contact_email: string;
  promised_date_missed: boolean;
  staleness_days: number;
  last_message_at: string;
  message_count: number;
}

/** All demo threads ordered by id, with the fields the read actions expose. */
export async function listDemoThreads(): Promise<DemoThreadRow[]> {
  const db = getDb();
  const rows = await db.select().from(threads).orderBy(threads.id);
  return rows.map((row) => ({
    id: row.id,
    stakeholder: row.stakeholder,
    contactEmail: row.contactEmail,
    sensitive: row.sensitive,
    promisedDateMissed: row.promisedDateMissed,
    stalenessDays: row.stalenessDays,
    lastMessageAt: row.lastMessageAt,
    snippet: row.snippet,
    messageCount: row.messageCount,
    contact_email: row.contactEmail,
    promised_date_missed: row.promisedDateMissed,
    staleness_days: row.stalenessDays,
    last_message_at: row.lastMessageAt,
    message_count: row.messageCount,
  }));
}

const DAY_MS = 24 * 60 * 60 * 1000;

function lastMessageAt(stalenessDays: number, now: number): string {
  return new Date(now - stalenessDays * DAY_MS).toISOString();
}

/**
 * Seed (or reseed) the deterministic demo world.
 *
 * Without `force`, rows are inserted by fixed id with `onConflictDoNothing`,
 * so reruns converge: no duplicated jobs, threads, or messages, and the
 * world is byte-identical across runs. With `force`, the demo job's
 * threads/messages are deleted first, then the same 7 ids are reinserted —
 * the final count and ids are identical either way. One `seed.demo` audit
 * row is appended per run (audit grows; jobs do not).
 */
export async function seedDemo(options: { force?: boolean } = {}): Promise<SeedResult> {
  const force = options.force ?? false;
  const db = getDb();
  const now = Date.now();

  if (force) {
    await db.delete(messages).where(eq(messages.jobId, DEMO_JOB_ID));
    await db.delete(threads).where(eq(threads.jobId, DEMO_JOB_ID));
  }

  await db
    .insert(jobs)
    .values({
      id: DEMO_JOB_ID,
      status: "running",
      title: "Demo stakeholder chase",
      summary: "Deterministic demo world: 7 synthetic stakeholder threads.",
    })
    .onConflictDoNothing({ target: jobs.id });

  for (const thread of DEMO_THREADS) {
    await db
      .insert(threads)
      .values({
        id: thread.id,
        jobId: DEMO_JOB_ID,
        title: thread.title,
        messageCount: thread.messages.length,
        stakeholder: thread.stakeholder,
        contactEmail: thread.contactEmail,
        snippet: thread.snippet,
        lastMessageAt: lastMessageAt(thread.stalenessDays, now),
        sensitive: thread.sensitive,
        promisedDateMissed: thread.promisedDateMissed,
        stalenessDays: thread.stalenessDays,
      })
      .onConflictDoNothing({ target: threads.id });

    for (const message of thread.messages) {
      await db
        .insert(messages)
        .values({
          id: message.id,
          threadId: thread.id,
          jobId: DEMO_JOB_ID,
          role: message.role,
          body: message.body,
          seq: message.seq,
        })
        .onConflictDoNothing({ target: messages.id });
    }
  }

  await db.insert(auditEvents).values({
    id: randomUUID(),
    jobId: DEMO_JOB_ID,
    kind: "seed.demo",
    payload: JSON.stringify({ threads: DEMO_THREADS.length, force }),
  });

  return {
    threads: DEMO_THREADS.length,
    jobId: DEMO_JOB_ID,
    threadIds: DEMO_THREADS.map((t) => t.id),
  };
}
