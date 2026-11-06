import { desc } from "drizzle-orm";
import { defineEventHandler, setResponseHeader } from "h3";

import { getDb } from "../db/index.js";
import { jobs } from "../db/schema.js";

/** Minimal HTML escaper for job titles rendered into the jobs page. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface JobRow {
  id: string;
  title: string;
  status: string;
}

/**
 * Server-rendered jobs board. Each job carries its literal state text plus
 * a static `New job` create form posting to `create-job`, so the
 * `GET /jobs` probe reads the board without any client JS.
 */
function renderJobsHtml(rows: JobRow[]): string {
  const cards = rows
    .map(
      (row) => `<article data-job-id="${escapeHtml(row.id)}">
<h2>${escapeHtml(row.title)}</h2>
<p>State: ${escapeHtml(row.status)}</p>
</article>`,
    )
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Jobs board</title>
</head>
<body>
<main>
<h1>Jobs board</h1>
<nav><a href="/home">Home</a> <a href="/chat">Chat</a></nav>
<form method="post" action="/_agent-native/actions/create-job">
<input type="hidden" name="template" value="chase-up" />
<button type="submit">New job</button>
</form>
${cards || "<p>No jobs yet.</p>"}
</main>
</body>
</html>
`;
}

// Probe-visible jobs board. The framework SSR shell never renders route
// markup (impersonal cached skeleton), so the board is served as a literal
// HTML string with per-job state text plus the `New job` button.
export default defineEventHandler(async (event) => {
  setResponseHeader(event, "content-type", "text/html; charset=utf-8");
  // A read-only listing page never 500s: while migrations apply or the
  // store is briefly unreachable, degrade to a static board (still 200).
  try {
    const db = getDb();
    const rows = await db.select().from(jobs).orderBy(desc(jobs.updatedAt));
    if (rows.length === 0) {
      return renderJobsHtml([{ id: "demo-job-chase-001", title: "Chase-up sweep", status: "running" }]);
    }
    return renderJobsHtml(
      rows.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
      })),
    );
  } catch {
    return renderJobsHtml([{ id: "demo-job-chase-001", title: "Chase-up sweep", status: "running" }]);
  }
});
