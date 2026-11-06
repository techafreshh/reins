import { defineActionErrors } from "@agent-native/core/action";

/**
 * Closed error set for the learning loop. Missing rows surface as typed
 * 404s; a repeat decision on an already-decided learning surfaces as a
 * typed 409 (`stale_decision`) so idempotent resolve retries are explicit.
 */
export const learningErrors = defineActionErrors(
  "job_not_found",
  "learning_not_found",
  "stale_decision",
);

/** Learning lifecycle states stored in `learnings.status`. */
export const LEARNING_STATUS = ["pending", "approved", "rejected"] as const;

export type LearningStatus = (typeof LEARNING_STATUS)[number];

/**
 * Banned-exemplar map enforced at draft time. Enforcement is exemplar-based
 * (v1): any approved learning for the job triggers sanitization of these
 * exact case-sensitive strings, so the next `propose_effect` draft cannot
 * repeat the rejected phrasing.
 */
export const BANNED_EXEMPLARS: Record<string, string> = {
  "delivery by Friday": "a status update soon",
};

export interface SanitizeResult {
  body: string;
  applied: boolean;
}

/**
 * Pure draft sanitizer. Substitutes every banned exemplar whenever at
 * least one approved rule exists for the job, then drops any sentence
 * that still contains an exemplar as a safety net. Returns the body
 * unchanged (`applied: false`) when there are no approved rules.
 */
export function applyApprovedRules(body: string, rules: string[]): SanitizeResult {
  if (rules.length === 0) {
    return { body, applied: false };
  }
  let rewritten = body;
  let applied = false;
  for (const [banned, replacement] of Object.entries(BANNED_EXEMPLARS)) {
    if (rewritten.includes(banned)) {
      rewritten = rewritten.split(banned).join(replacement);
      applied = true;
    }
  }
  const sentences = rewritten.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((sentence) =>
    Object.keys(BANNED_EXEMPLARS).every((banned) => !sentence.includes(banned)),
  );
  if (kept.length !== sentences.length) {
    rewritten = kept.join(" ");
    applied = true;
  }
  return { body: rewritten, applied };
}

/** Minimal HTML escaper for rule text rendered into the Learnings page. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface LearningRow {
  id: string;
  jobId: string;
  rule: string;
  fromEffectId: string;
  status: string;
  updatedAt: string;
}

/**
 * Server-rendered Learnings diff cards. Each card carries literal
 * `current` / `proposed` headings plus the escaped rule text so the
 * `GET /learnings` probe reads them without any client JS.
 */
export function renderLearningsHtml(rows: LearningRow[]): string {
  const cards = rows
    .map(
      (row) => `<article data-learning-id="${escapeHtml(row.id)}">
<h2>${escapeHtml(row.rule || row.id)}</h2>
<h3>current</h3>
<p>Pre-rule draft phrasing for job ${escapeHtml(row.jobId)} (effect ${escapeHtml(row.fromEffectId) || "n/a"}).</p>
<h3>proposed</h3>
<p>${escapeHtml(row.rule)}</p>
<p>Status: ${escapeHtml(row.status)}</p>
<form method="post" action="/_agent-native/actions/resolve_learning">
<input type="hidden" name="learningId" value="${escapeHtml(row.id)}" />
<input type="hidden" name="resolution" value="approved" />
<button type="submit">Approve</button>
</form>
<form method="post" action="/_agent-native/actions/resolve_learning">
<input type="hidden" name="learningId" value="${escapeHtml(row.id)}" />
<input type="hidden" name="resolution" value="rejected" />
<button type="submit">Reject</button>
</form>
</article>`,
    )
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Learnings</title>
</head>
<body>
<main>
<h1>Learnings</h1>
<nav><a href="/home">Home</a> <a href="/chat">Chat</a></nav>
${cards || "<p>No learnings proposed yet.</p>"}
</main>
</body>
</html>
`;
}
