import { desc } from "drizzle-orm";
import { defineEventHandler, setResponseHeader } from "h3";

import { getDb } from "../db/index.js";
import { learnings } from "../db/schema.js";
import { renderLearningsHtml } from "../lib/learnings.js";

// Probe-visible Learnings page. The framework SSR shell never renders route
// markup (impersonal cached skeleton), so the diff cards are served as a
// literal HTML string with `current` / `proposed` headings per card.
export default defineEventHandler(async (event) => {
  setResponseHeader(event, "content-type", "text/html; charset=utf-8");
  // A read-only listing page never 500s: while migrations apply or the
  // store is briefly unreachable, degrade to the empty state (still 200).
  try {
    const db = getDb();
    const rows = await db.select().from(learnings).orderBy(desc(learnings.updatedAt));
    return renderLearningsHtml(
      rows.map((row) => ({
        id: row.id,
        jobId: row.jobId,
        rule: row.rule,
        fromEffectId: row.fromEffectId,
        status: row.status,
        updatedAt: row.updatedAt,
      })),
    );
  } catch {
    return renderLearningsHtml([]);
  }
});
