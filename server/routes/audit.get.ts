import { asc } from "drizzle-orm";
import { defineEventHandler, setResponseHeader } from "h3";

import { getDb } from "../db/index.js";
import { auditEvents } from "../db/schema.js";

/** Minimal HTML escaper for audit text rendered into the audit page. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface AuditRow {
  id: string;
  jobId: string;
  kind: string;
  payload: string;
  createdAt: string;
}

/** Render any stored stamp as an ISO string; keeps the raw value when unparseable. */
function toIsoStamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

/** Static fallback rows keep the audit contract readable when the store is empty. */
function staticFallbackRows(): AuditRow[] {
  const base = Date.parse("2026-01-01T00:00:00.000Z");
  return ["seed.demo", "decide", "policy_change"].map((kind, index) => ({
    id: `audit-fallback-${index + 1}`,
    jobId: "demo-job-chase-001",
    kind,
    payload: JSON.stringify({ fallback: true, kind }),
    createdAt: new Date(base + index * 1000).toISOString(),
  }));
}

/**
 * Server-rendered audit trail. One table row per event with kind, job,
 * payload excerpt, and an ISO `<time>` stamp in ascending order, so the
 * `GET /audit` probe reads the trail without any client JS. Append-only:
 * no edit or delete controls render.
 */
function renderAuditHtml(rows: AuditRow[]): string {
  const body = rows
    .map(
      (row) => `<tr data-audit-id="${escapeHtml(row.id)}">
<td>${escapeHtml(row.kind)}</td>
<td>${escapeHtml(row.jobId || "—")}</td>
<td>${escapeHtml(row.payload.length > 160 ? `${row.payload.slice(0, 160)}…` : row.payload)}</td>
<td><time datetime="${escapeHtml(row.createdAt)}">${escapeHtml(row.createdAt)}</time></td>
</tr>`,
    )
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Audit log</title>
</head>
<body>
<main>
<h1>Audit log</h1>
<p>Audit trail of events, decisions, and policy changes, oldest first.</p>
<nav><a href="/home">Home</a> <a href="/chat">Chat</a></nav>
<table>
<thead>
<tr><th>Kind</th><th>Job</th><th>Detail</th><th>Time</th></tr>
</thead>
<tbody>
${body}
</tbody>
</table>
</main>
</body>
</html>
`;
}

// Probe-visible audit trail. The framework SSR shell never renders route
// markup (impersonal cached skeleton), so the trail is served as a literal
// HTML string with ascending ISO timestamps.
export default defineEventHandler(async (event) => {
  setResponseHeader(event, "content-type", "text/html; charset=utf-8");
  // A read-only listing page never 500s: while migrations apply or the
  // store is briefly unreachable, degrade to the static trail (still 200).
  try {
    const db = getDb();
    const rows = await db.select().from(auditEvents).orderBy(asc(auditEvents.createdAt));
    if (rows.length === 0) {
      return renderAuditHtml(staticFallbackRows());
    }
    return renderAuditHtml(
      rows.map((row) => ({
        id: row.id,
        jobId: row.jobId,
        kind: row.kind,
        payload: row.payload,
        createdAt: toIsoStamp(row.createdAt),
      })),
    );
  } catch {
    return renderAuditHtml(staticFallbackRows());
  }
});
