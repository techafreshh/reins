# Reins — Solidified Design (2026-11-05)

> Decision record for the Builder.io Agent-Native hackathon entry. This document
> assumes its companion specs and narrows where they were ambiguous:
> - `AGENT-NATIVE-HACKATHON-BRIEF.md` — the product PRD (becomes `.agents/PRDs/PRD.md` in the repo)
> - `REINS-FACTORY-OFFLOAD.md` — what is offloaded to the pi-dark-factory lap loop
>
> Where this document contradicts the PRD, **this document wins** — every
> contradiction here is a correction grounded in the framework's own docs,
> read 2026-11-05 at agent-native.com/docs.

## 1. Intent

Delegated work under an auditable contract. One workload (stakeholder chase-up
coordination), product quality: the agent works quiet email threads in the
background with two visible sub-agent streams, every external effect lands as a
reviewable card, trust is a programmable dial enforced server-side, and every
rejected correction permanently upgrades the agent. Judged on: Usefulness &
Execution 40% · Creativity & Design 20% · Innovation 20% · Use of Agent-Native
20% (verified against the official rules).

## 2. Goals / non-goals / anti-goals

**Goals**
- Beats 1–3 of PRD §3 demonstrable end-to-end on screen: watch streams (SSE),
  steer mid-flight with visible plan recalibration, reject→propose→approve→behavior-change.
- Server-enforced invariant: no code path runs `execute_approved_effect`
  without `decision = approved` and a passing policy chain.
- Deployed live URL that judges can reach **and log into** (seeded demo world).
- Shop Ledger-grade discipline: append-only audit, typed errors, Vitest,
  `agent-native:doctor` + typecheck clean, honest "verified vs not" README.

**Non-goals** (unchanged from PRD §8): real email, multi-tenant auth/orgs,
A2A federation, voice, mobile UI, a second workload, plugin marketplaces.

**Anti-goals** (would fail even if technically working)
- Any path where the agent sends mail or mutates policy without a reviewed,
  audited decision.
- Inventing framework APIs — every framework name used must appear in the
  docs or repo source.
- A demo that shows unbounded autonomy (the product *is* the contract).

## 3. Constraints

- Framework: `@agent-native/core` (hard requirement). Only documented APIs.
- Node 22.22+, pnpm via corepack, TypeScript, React, Drizzle DSL only
  (no raw SQL except additive migrations), no `fs`/`child_process`/`path` in
  app code, everything serverless-safe in shape even though we deploy on a
  long-lived Node host.
- All state in SQL (production: real PostgreSQL; local dev: PGlite).
- LLM via `.env` / host env (`ANTHROPIC_API_KEY` provided in environment).
- Dev machine: WSL2 (brief's "Windows/Git Bash" accepted; `pnpm dev` check on
  Git Bash is a user-side spot-check near ship time).
- Deadline: Nov 10 08:59 WAT; submit with ≥6h buffer.

## 4. Decided approaches

### 4.1 Approvals — Hybrid (chosen over custom-only and native-only)
Custom Review Queue is the product: `propose_effect` (agent-only tool,
returns `pending_review`) → queue card rendered from the action's Zod schema →
`decide_effect` (`agentTool: false`; approve / edit+approve / reject+feedback;
reject **requires** feedback text) → `execute_approved_effect` executes only
rows with `decision = approved` + passing policy chain.

`execute_approved_effect` additionally declares `needsApproval`, so on
surfaces we did not build (CLI, MCP, A2A, direct HTTP) the framework's own
approval contract gates it: CLI `y/N` prompt, unproven callers get 409
`approval_required`. The action is also `agentTool: false` — the agent can
never call execution.

Why not the alternatives: native-only relies on `needsApproval` as *the*
mechanism — its Deny is a silent local dismissal (no recorded feedback →
learning loop dies), there is no documented pending-queue UI, and
edit-and-approve is not documented. Custom-only ignores the framework's
approval idiom entirely; hybrid gains a second, framework-native lock for one
option flag.

### 4.2 Trust dial — 3-level stepper (chosen over 0–100 dial and binary toggles)
Per-capability stepper: `ASK` (always approval) / `SMART` (auto-runs only if
the capability's policy conditions pass) / `AUTO` (never asks; kill switch
still stops everything) + global `kill_switch` pause. Conditions are
predicates in the policy engine, e.g. `send_followup` SMART-conditions:
≤N words, recipient not the sensitive contact, thread staleness < 60 days,
job not paused. `update_policy` is `agentTool: false` and writes an audit
event — the dial's changes are themselves reviewed world-state.

### 4.3 Deployment — user's VPS (chosen over Vercel + Neon)
VPS runs `docker-compose.yml` (app container + postgres container), Nitro
node preset, reverse proxy at e.g. `reins.techa.pro` beside the existing
`factory-api.techa.pro`. Consequences, all favorable:
- Live sync on the live URL is real SSE (polling is only the serverless
  fallback — moot here).
- No third-party DB: Postgres runs locally on the box; migrations via
  explicit `pnpm migrate:production` during deploy.
- Repo ships `docker-compose.yml` anyway → factory `env.mode` can be `docker`.
- Seed the demo world on the deployed instance; **demo account credentials
  published in the README** so judges log into the already-seeded world.
- Tradeoff owned: the URL is only as alive as the VPS — the app joins the
  box's restart/runbook discipline. (VPS confirmed active by owner 2026-11-05.)
- Owner role (decided 2026-11-05): the repo ships a production
  `docker-compose.yml` plus a deploy checklist (env vars,
  `pnpm migrate:production`, reverse-proxy note); the owner runs host-side
  steps themselves — no SSH access for the builder is assumed or required.
  The checklist must warn: disable response buffering on
  `/_agent-native/events` or the live URL's streams degrade to polling.
- Vercel Cron is moot; the evening sweep either uses the framework's
  scheduled jobs (see spike §8) or system cron hitting a protected action.

### 4.4 Nightly sweep — spike, then decide
Day 1 spike verifies the scheduled-jobs API from repo source (feature
confirmed in docs but no docs page exists). If workable: real automation.
Fallback: "yesterday's sweep found 6" is seeded state, noted honestly in the
README. Hard cap: half a day combined with the other spikes.

### 4.5 Offload split (per REINS-FACTORY-OFFLOAD.md, amended)
Factory keeps: Drizzle schema + migrations, the typed actions with their
typed errors, the execute-invariant and its holdout scenarios, append-only
audit semantics, seed dataset + idempotent reseed, sweep skeleton.
Interactive agent keeps: mid-flight steering, learning/connection writeback,
sub-agent orchestration + SSE feed rendering, Review Queue / SteerBar /
policy dial UX, design pass, demo choreography, Clips recording.
**Amendment:** everywhere the offload doc and PRD say `uiOnly` actions,
substitute `agentTool: false` (§5.1) — do not carry `uiOnly` into factory
issues. Offload doc §3's status notes are stale: on 2026-11-05 the factory is
verified alive and authed (`factory-remote doctor`/`status` pass; API answers
401-unauthed, 24 repos onboarded; `reins` not yet onboarded). The offload
doc's §3 should be read as historical.

Tick policy (owner decision 2026-11-05): once the backlog and both scenario
files are approved, evening→morning ticks are **pre-authorized unattended
with no spend cap** ("the factory keeps working"); every merged link is
confirmed via `gh pr view` the next morning before it counts as done. Setup
verbs (`onboard`, backlog `--create`, scenario uploads) keep the
explicit-yes rule.

## 5. Framework-reality corrections (docs-grounded)

1. **`uiOnly` does not exist.** The human-only mechanism is `agentTool: false`
   (hidden from the model's tool list; still callable from UI hooks, CLI,
   HTTP, MCP per its other flags). Applies to `decide_effect`,
   `update_policy`, `resolve_learning`, and any reject/feedback path.
2. **Typed errors are a closed, declared set.** `defineActionErrors(...)` →
   `errors.fail(msg, "policy_blocked", { statusCode })`-style calls are the
   only throws whose message reaches callers (else: opaque 500). Our codes:
   `policy_blocked`, `job_paused`, `trust_below_threshold`, `not_approved`,
   `stale_decision`. Holdout scenarios assert 4xx + `errorCode` — never 500.
3. **`useDbSync` is opt-in** (`{ queryClient, realtime: { reason: "..." } }`),
   private routes only, with poll fallback built in. Mutating actions
   auto-invalidate action-backed queries.
4. **Agent resources persist in PostgreSQL, not files.** Skills,
   `LEARNINGS.md`, personal memory, `AGENTS.md`, custom sub-agents, and
   scheduled jobs are per-user agent resources stored in the database.
   `AGENTS.md` loads **every turn** — this is why the approved-learning →
   next-draft behavior change (Finale Beat) can be same-process. The
   remaining unknown is only the write mechanism (spike §8).
5. **Sub-agents exist** ("own thread and tools, surfaced as a chip inline in
   chat") — the spawn API itself needs the Day 1 source spike.
6. **Actions mount at** `POST /_agent-native/actions/<name>` (filename = id);
   `http: { method: "GET" }` for GET/query-param actions; `http: false`
   removes the endpoint entirely (use for `execute_approved_effect` — factory
   holdout asserts direct POST fails closed).
7. **Action outputs must be plain data** (no Map/Set/class instances), and the
   result contract for flows that continue: return `id`, one-line `message`,
   `nextRequiredAction`; external surfaces must not carry wait-for-user
   language (`pnpm guard:external-result-contract`).

## 6. Action surface (~12, all `defineAction`, all Zod)

| Action | Visibility flags | Notes |
|---|---|---|
| `create_job` | agent tool | CLI beat uses `pnpm action create-job --template=chase-up` |
| `list_jobs` | agent tool, GET | |
| `get_job_state` | agent tool, GET | |
| `assign_task` | agent tool | orchestrator → sub-agent; threads belong to sub-agents |
| `steer_job` | agent tool (human-triggered via UI) | appends to steering channel; pipes via `sendToAgentChat` |
| `propose_effect` | agent tool | the ONLY external-effect path; returns `pending_review` |
| `decide_effect` | `agentTool: false` | approve / edit+approve / reject+feedback (required) |
| `execute_approved_effect` | `agentTool: false`, `http: false`, `needsApproval: true` | invariant live here |
| `get_policy` | agent tool / GET | |
| `update_policy` | `agentTool: false` | writes audit event |
| `propose_learning` | agent tool | creates SkillDiffCard proposal |
| `resolve_learning` | `agentTool: false` | approve/reject |
| `digest_completed_job` | agent tool | roundup synthesis |
| `view-screen`, `navigate` | framework-standard pair | context awareness — agent sees which card you're reviewing |

## 7. Product defaults (approved 2026-11-05)

- **Job state machine:** agent moves forward only (`planning → running →
  awaiting_review`); steering or a newly proposed effect may bounce
  `awaiting_review → running`; only a human completes a job. States are rows,
  transitions audited.
- **Sub-agent division:** Drafter drafts follow-ups (`draft_reply`,
  `send_followup` effects); Tracker owns the promised-date ledger and
  staleness facts (`label_or_tag`, tracking updates); Orchestrator plans,
  assigns, synthesizes the digest.
- **SMART conditions** are per-capability predicates in the policy engine
  (example under §4.2), evaluated in `run` alongside the policy chain.
- **Demo honesty:** persistent demo-mode chip "Simulated outbox — nothing
  leaves this machine" + one spoken line in the Clips script.
- **Design:** calm "control tower", dark, one accent; Review Queue as hero;
  components per PRD §6 precisely (`JobCard`, `ThreadStream`, `SteerBar`,
  `QueueCard`, `PolicyDial`, `SkillDiffCard`, `AuditTrail`).

## 8. Spike ledger (Day 1, hard cap: half a day total)

| Unknown | What proves it | Fallback if it fails |
|---|---|---|
| Mid-flight steering semantics | `sendToAgentChat` interrupts in-flight turn vs queues; UX identical either way (control-channel table checked per step is the documented-shared-store variant) | queue-for-next-turn, demo copy unchanged |
| Scheduled jobs API | repo source shows a documented automation primitive | choreographed seeded sweep + HUD note |
| Skill/writeback mechanism | how the agent updates its own Postgres-resident `LEARNINGS.md`/skills and whether next turn re-reads them in-process | write via a small action; copy says "rule"; behavior change still same-process via turn reload |
| Sub-agent spawn API | exact documented export for "own thread and tools + chip" | single agent with multiple tracked thread rows (chips still render) |
| `needsApproval` app-path semantics | approve path (`approvedToolCalls`) round-trips in our UI | drop the `needsApproval` flag from `execute_approved_effect` (custom gate already covers the product; README notes coverage) |

Each spike outcome is recorded in `docs/DECISIONS.md` before backlog slicing —
the backlog encodes proven facts, not hopes (offload doc §2).

## 9. Quality bar & logistics additions

- `pnpm actions:audit` and `pnpm guard:external-result-contract` join the
  verification set (doctor, typecheck, Vitest: policy gate, state machine,
  decision idempotency, seed determinism).
- `docker-compose.yml` (app + postgres) is itself a deliverable; factory
  `env.mode = docker`.
- Demo account + credentials in README; audit log demonstrates the full
  decision history on the deployed instance.
- Clips account created and recording rehearsed **before Day 5**; no
  published length limit — the ≤2:30 cap is our own discipline.
- Factory caveat from deploy docs adopted as test design: malformed input →
  4xx with declared `errorCode`, invalid resource → 404, never opaque 500.
- Live LLM funding (owner decision 2026-11-05): the provided key funds the
  VPS instance, protected by a lightweight server-side turn cap (per-hour
  ceiling on agent turns) so the public README credentials cannot generate
  an unbounded bill. The cap is part of the quality bar and the backlog.
- Owner availability Nov 5–10: most days — confirmations flow continuously,
  no batching strategy needed; Clips rehearsal still planned before Day 5.
