# Reins — Product Requirements Document

> **Status:** v1.0, 2026-11-05. Derived from `AGENT-NATIVE-HACKATHON-BRIEF.md`
> (§ references below point at it) and the approved design record
> `docs/superpowers/specs/2026-11-05-reins-design.md`. **This PRD supersedes
> both wherever they conflict** — most visibly: the brief's `uiOnly` wording
> is corrected to `agentTool: false` throughout (the option does not exist in
> the framework). Companion ops doc: `REINS-FACTORY-OFFLOAD.md`.

---

## 1. Executive Summary

**Reins** (*run agents, hold the reins*) is an entry for the Builder.io
Agent-Native hackathon (deadline Nov 9, 2026 11:59 PM PT; submit ≥6h early).
It delegates one concrete workload — **stakeholder chase-up coordination** over
quiet email threads — to an autonomous agent working under an auditable
contract: two sub-agent streams work in the open over live SSE, every external
effect lands as an editable review card that only a human decision can
execute, per-capability trust levels decide what may auto-run, mid-flight
steering redirects a running job, and every rejected correction is distilled
into a proposed skill/rule change whose approval permanently upgrades the
agent. Every agent effect, decision, and policy change is an append-only,
reviewable record.

Core value proposition: *delegate with a contract, not a chatbot* — background
agency plus a human checkpoint on everything that reaches the outside world,
with corrections compounding instead of repeating.

**MVP goal:** a working, deployed app that demonstrates the three hackathon
beats end-to-end on the seeded demo world — watch it work, steer it mid-flight,
watch it learn — with server-enforced guarantees, and submit with a public
Clips demo (~2 min) by the deadline.

## 2. Mission

**Mission statement:** make delegating real work to an agent as accountable as
delegating it to a careful employee — visible process, approval rights,
adjustable trust, and learning from correction.

**Core principles**
1. **The agent proposes; only a human disposes.** Outward effects exist on one
   path (`propose_effect` → review → execute) with a server-enforced
   invariant.
2. **State is data.** Job states, policies, decisions, and learnings are SQL
   rows the UI reads live — zero sync code.
3. **Trust is programmable, not vibes.** Per-capability levels with typed,
   deterministic predicates; changes are audited events.
4. **Corrections compound.** Reject-with-feedback always yields a skill/rule
   proposal; an approved rule changes the *next* draft in the same process.
5. **One action, every surface.** The same `defineAction` powers UI, agent
   tool, HTTP, CLI, MCP — counted explicitly by the hackathon's "cleverness"
   axis.

## 3. Target Users

**Primary persona — Maya, the solo operator / ED / founder** who runs
partnerships and support by email. Technical comfort: intermediate
(can run `docker compose up`, read a dashboard). Pain: threads go quiet,
promised dates slip, chasing feels endless and unprioritized; delegating to a
chatbot feels like handing over the sending keys.

**Secondary persona — the hackathon judge** (expert; 2 minutes of attention):
logs into the demo account (credentials published in README), replays the
three beats on the seeded world, checks the audit trail and the TypeScript
discipline. Needs instant comprehension of what's agent-proposed vs.
human-approved.

Needs: background follow-up work they can watch; a veto point that always
exists; steering that changes the current job, not a new prompt; proof that
corrections stick.

## 4. MVP Scope

### In scope

**Core functionality**
- [ ] Jobs board: create job from "Chase-up sweep" template; job list with
      state machine `planning → running → awaiting_review → complete` (states
      as rows, agent moves forward only; steer/new effect may bounce
      `awaiting_review → running`; only a human completes a job)
- [ ] Live work feed per job: orchestrator log + two sub-agent thread streams
      (Drafter, Tracker) as chips/cards over live sync (`useDbSync`, opt-in
      with a stated reason; SSE at `/_agent-native/events`)
- [ ] SteerBar inside the live feed: text + quick chips ("widen scope",
      "budget: 3 emails max"); steering via `steer_job` → `sendToAgentChat`;
      visible plan recalibration in the feed
- [ ] Review Queue (hero screen): every proposed external effect as a card
      rendered from the action's Zod schema; to/subject/body editable inline;
      decisions = Approve / Edit & approve / Reject with feedback (feedback
      required on reject); batch-approve for low-risk categories
- [ ] Trust & Policy panel: per-capability `ASK / SMART / AUTO` stepper +
      global `kill_switch`; SMART conditions are server-side predicates;
      every policy change writes an audit event
- [ ] Learning & audit screen: pending skill/rule proposals as diff cards
      (current excerpt → proposed addition), approve/reject; append-only
      audit log of every effect, decision, and policy change
- [ ] Job digest: end-of-job status roundup synthesized by the orchestrator

**Technical**
- [ ] GitHub Actions CI from lap 1: typecheck + Vitest on every PR (verification gate from lap 2 on; `merge.required_checks = ["*"]`)
- [ ] ~13 `defineAction` actions (§7) with Zod schemas, `defineActionErrors`
      typed errors, and the execute-invariant
- [ ] Drizzle schema + additive migrations (jobs, threads/messages, proposed
      effects + decisions, policies, audit events, learnings)
- [ ] Demo seed: 6–8 synthetic stakeholder threads (staleness 3–70 days, one
      promised-then-missed date, one sensitive contact), idempotent reseed via
      `--demo`/`/demo`
- [ ] Nightly sweep skeleton (framework scheduled jobs iff the Day 1 spike
      proves them; otherwise a choreographed seeded sweep — decision recorded
      in `docs/DECISIONS.md`)
- [ ] Vitest suite: policy gate, state-machine transitions, decision
      idempotency, seed determinism
- [ ] `docker-compose.yml` (app + postgres) + deploy checklist (env vars,
      `pnpm migrate:production`, reverse-proxy SSE anti-buffering note)
- [ ] Transparency pair `view-screen` / `navigate`; result contract
      (`id`, `message`, `nextRequiredAction`) on continuing flows

**Integration / deployment**
- [ ] MCP export live (`/mcp`) — "your running jobs are steerable from Claude
      Desktop"; CLI surface used in the demo (`pnpm action create-job
      --template=chase-up`)
- [ ] VPS deployment via the compose file; seeded demo world + demo account
      with credentials published in README; server-side per-hour agent-turn
      cap protecting the funded key

**Demo deliverable**
- [ ] Public Clips demo (≤2:30, target ~2:00) covering Beats 1–3 of PRD §3
      with the "Simulated outbox — nothing leaves this machine" chip visible
      and one spoken honesty line

### Out of scope

**Functionality**
- [ ] Real email connections (Gmail/IMAP/OAuth) — "connector ships
      post-hackathon"; simulated effects only
- [ ] Multi-tenant auth/orgs; A2A federation; voice/STT; mobile-specific UI;
      a second job workload; plugin marketplaces

**Technical**
- [ ] Raw SQL beyond additive migrations; Node-only APIs (`fs`,
      `child_process`, `path`) in app code; serverless-safe shape is
      preserved anyway (VPS is a long-lived Node target)

## 5. User Stories

1. As **Maya**, I want to launch a chase-up sweep over the threads that went
   quiet, so that follow-up work happens while I do everything else.
   *Example:* "chase the 6 threads that went quiet" → job appears
   `planning → running` with two sub-agent chips streaming.
2. As **Maya**, I want to watch the agent's work stream live, so that I trust
   what it's doing without babysitting it. *Example:* Drafter drafts a
   follow-up to Priya; Tracker updates a promised-date ledger; both visible
   as cards the moment they happen.
3. As **Maya**, I want to steer a running job mid-flight ("skip anyone over
   60 days stale; don't email Alex before Thursday"), so that good news
   (a deal closed) changes the plan instantly. *Example:* steer bar →
   confirmation → feed shows the recalibrated plan and affected cards update.
4. As **Maya**, I want every outward effect to stop at a review card, so that
   nothing is sent without my decision. *Example:* an auto-rule wants to send
   a 22-word nudge; trust is ASK for `send_followup`; the send waits as a
   card.
5. As **Maya**, I want to edit a draft in place and approve it, so that a fix
   costs five seconds instead of a reject cycle. *Example:* soften "you
   promised Nov 1" → "circling back on Nov 1?" → Edit & approve.
6. As **Maya**, I want rejections with my reasons to permanently change
   behavior, so that I never correct the same thing twice. *Example:* reject
   a draft ("never promise delivery dates in first outreach") → approve the
   proposed rule diff → the next draft already respects it.
7. As **Maya**, I want a trust level per capability, so that low-risk work
   (labeling threads) runs itself while sends always ask me. *Example:* flip
   `send_followup` SMART → ASK mid-job; the very next auto-send requires
   approval.
8. As **Maya**, I want a kill switch and an append-only audit trail, so that
   I can stop everything instantly and reconstruct exactly what happened.
   *Example:* kill switch pauses in-flight job; audit log shows every event,
   decision, and policy change in order, corrections as new rows.

**Technical stories**
- As a **verifier**, I can POST every action over HTTP with a session/bearer
  token and observe JSON results and typed errorCodes, so acceptance is
  black-box.
- As an **external agent** (MCP client), I can list Reins' tools and read job
  state and audit entries, so Reins is an MCP citizen.
- As a **developer**, I can run `pnpm test`, `pnpm typecheck`,
  `agent-native:doctor`, `pnpm actions:audit`,
  `pnpm guard:external-result-contract` with everything green.

## 6. Core Architecture & Patterns

**Runtime:** `npx --yes @agent-native/core@latest create reins --standalone
--template chat` — one Nitro app: agent agent-server + React UI on the same
Drizzle/Postgres (dev: PGlite) state. Node 22.22+, pnpm via corepack.

**Layers**
- `actions/*.ts` — the typed capability surface (one file per action, default
  export `defineAction`), auto-discovered on startup. A dev-server restart
  discovers new routes/actions.
- `server/db/schema.ts` — domain tables via framework schema helpers
  (`table`, `text`, `integer` …). Append-only semantics enforced in action
  code (agents only ever insert event rows; corrections are new rows).
- `server/lib/policy.ts` — policy engine: per-capability level + SMART
  predicate evaluation + kill switch; returns the five typed outcomes.
- `server/lib/loops/` — orchestrator + sub-agents (Drafter, Tracker); exact
  sub-agent spawn API resolved by the Day 1 spike.
- React app — Jobs board, live feed (SteerBar embedded), Review Queue,
  Trust panel, Learning & audit. All private routes; `useDbSync({ queryClient,
  realtime: { reason } })` streaming `/_agent-native/events` with poll
  fallback.

**Patterns**
- Hierarchical agents: orchestrator assigns sub-agents their own threads;
  feed renders each as a chip. Steering pipes into the running job's thread.
- Approvals as data: `proposed_effects` rows move `pending_review → approved
  / edited / rejected`; `decisions` are separate append-only rows.
- Idempotent seeds + snapshot-style deterministic demo fixtures.
- Everything serverless-safe in shape (no Node-only APIs) even though prod
  is a long-lived container.

## 7. Tools/Features (action surface)

All actions: Zod schema, declared typed errors, result contract
(`id` + `message` + `nextRequiredAction` where a flow continues).

| Action | Flags | Purpose |
|---|---|---|
| `create_job` | agent tool | open a chase-up job from a template (`--template=chase-up` via CLI) |
| `list_jobs` | GET | board + agent visibility |
| `get_job_state` | GET | state machine for one job |
| `assign_task` | agent tool | orchestrator → sub-agent; threads belong to sub-agents |
| `steer_job` | agent tool | append steering instruction; pipes to the running job thread |
| `propose_effect` | agent tool | ONLY path to external effect; creates review card; returns `pending_review` |
| `decide_effect` | `agentTool: false` | approve / edit+approve / reject+feedback (required) |
| `execute_approved_effect` | `agentTool: false`, `http: false`, `needsApproval: true` | runs an approved effect once (demo mode: records simulated-send + receipt) |
| `get_policy` | GET | capability levels + conditions |
| `update_policy` | `agentTool: false` | set level/conditions; writes audit event |
| `propose_learning` | agent tool | from rejection feedback → skill/rule diff proposal |
| `resolve_learning` | `agentTool: false` | approve/reject proposal |
| `digest_completed_job` | agent tool | roundup synthesis |
| `view-screen`, `navigate` | framework-standard | context awareness (agent sees which card is being reviewed) |

**Framework idioms deliberately showcased** (the 20% axis): one-action-every-
surface (all of the above), sub-agent chips, live sync with zero sync code,
`sendToAgentChat` steering channel, scheduled sweeps (or documented fallback),
AGENTS.md + skills + per-user memory in Postgres, approvals-as-actions,
`needsApproval` on execution, MCP export at `/mcp`, CLI beat, `view-screen` /
`navigate`.

## 8. Technology Stack

- **Framework:** `@agent-native/core` (latest; scaffolded with `--standalone
  --template chat`) — actions, agents, auth (Better Auth), live sync, MCP/CLI
- **Language/UI:** TypeScript, React (template shell); one dark theme + one
  accent color per the calm "control tower" design direction
- **Data:** Drizzle ORM DSL only; PGlite in dev; PostgreSQL 16 in prod
- **Runtime:** Node 22.22+, pnpm via corepack; Nitro node preset
- **LLM:** Anthropic (or OpenAI) key from env — never committed; hosted
  Builder.io option as simplicity fallback
- **Infra:** `docker-compose.yml` (app + postgres) on the owner's VPS;
  reverse proxy at `reins.techa.pro`; SSE anti-buffering documented
- **Testing:** Vitest; verification set: typecheck, `agent-native:doctor`,
  `pnpm actions:audit`, `pnpm guard:external-result-contract`

## 9. Security & Configuration

- **Auth:** Better Auth sessions; demo account credentials published in the
  README by design (judges must see the world) — the blast radius is bounded
  server-side by the turn cap + the invariant (no externally-effectful action
  is agent-executable) + compose network isolation (no real mail host
  configured).
- **Rate protection:** lightweight per-hour agent-turn cap around the chat
  bridge (public credentials must not generate an unbounded bill).
- **Config:** `.env` for local (LLM key, `BETTER_AUTH_SECRET`,
  `DATABASE_URL`); host env for prod; keys never committed; Git Bash spot
  check near ship.
- **Out of scope:** real mail credentials, OAuth providers, org/tenant
  isolation, PII beyond synthetic demo data.

## 10. API Specification

Every action: `POST /_agent-native/actions/<name>` (filename = id), raw-JSON
body matching the Zod schema, bare-JSON result at top level; GET actions take
query params. Auth = session cookie (browser) or bearer token (HTTP/MCP).
Errors: 400 validation (message names the field), 401/403 auth/access,
404 unknown resource, **declared typed errors with explicit statusCodes**,
500 opaque.

Declared error codes (via `defineActionErrors`): `policy_blocked` (409),
`job_paused` (409), `trust_below_threshold` (403), `not_approved` (404 for
missing resource / conflict variants per call site), `stale_decision` (409).

Examples:

```jsonc
// POST /_agent-native/actions/create_job
{ "template": "chase-up", "title": "Post-launch stakeholder sweep" }
// 200 → { "id": "job_01HW…", "message": "Job created in planning", "nextRequiredAction": "assign plan" }

// POST /_agent-native/actions/propose_effect
{ "jobId": "job_01HW…", "capability": "send_followup",
  "payload": { "threadId": "th_31", "to": "priya@…", "subject": "…", "body": "…" } }
// 200 → { "id": "eff_91", "message": "Pending review", "status": "pending_review" }

// POST /_agent-native/actions/execute_approved_effect  (no valid decision row)
{ "effectId": "eff_91" }
// 409 → { "error": "…", "errorCode": "not_approved" }
// (also unverifiable without framework approval proof: 409 "approval_required")

// POST /_agent-native/actions/decide_effect  (reject without feedback)
{ "effectId": "eff_91", "decision": "rejected" }
// 400 → { "error": "feedback: Required", "errorCode": "action_failed" }
```

MCP catalog at `/mcp`; CLI `pnpm action <name> [--flags | 'json']` — note the
CLI's approval flag is reserved framework metadata (`--approved`), stripped
pre-parse.

## 11. Success Criteria

**MVP success =** all four true: (a) Beats 1–3 each demonstrable end-to-end on
screen from the seed; (b) the execute-invariant holds under adversarial
attempts (typed 4xx, never 500, never silent); (c) live URL reachable,
logged-in demo world loaded, audit trail populated; (d) verification set green
and honest README.

**Functional requirements**
- [ ] All §7 actions callable from UI, agent, and HTTP; ≥4 also exercised via CLI/MCP in the demo
- [ ] Policy gate demonstrably blocks a real attempt (typed error visible in logs/feed)
- [ ] Reject→propose→approve→behavior-change loop recorded in the audit trail
- [ ] Steering received mid-flight; feed shows adaptation; state machine never moves backward except per the documented bounce rule
- [ ] Batch-approve executes all approved effects exactly once (idempotent)
- [ ] Seed reseed deterministically (same world re-created)

**Quality / UX**
- [ ] Append-only: no delete/update paths on agent-created event rows
- [ ] QueueCard renders fully from the action's Zod schema — no field-specific UI drift
- [ ] Trust change effect visible in the same job's subsequent actions
- [ ] Doctor + typecheck + full Vitest suite + guard scripts clean

## 12. Implementation Phases

**Phase 1 — Skeleton + de-risk (Day 1, Nov 5)**
Goal: proven rails. Deliverables: [ ] repo + both docs committed
(`.agents/PRDs/PRD.md` = this file) [ ] scaffold boots (`pnpm dev`) [ ] CI
workflow (typecheck + Vitest) [ ] thin
schema + seed [ ] 5 spikes executed → `docs/DECISIONS.md` (steering
interrupt-vs-queue, scheduled-jobs API, learning writeback, sub-agent spawn,
needsApproval round-trip) [ ] factory onboarding + scenarios + backlog
(confirmed with owner). *Validation:* `pnpm dev` clean; each spike has a
decision + fallback; demo beats blocked-xs.

**Phase 2 — The loop (Day 2, Nov 6)**
Goal: a running job you can watch and steer. Deliverables: [ ] orchestrator +
Drafter + Tracker [ ] live feed with chips (SSE) [ ] `steer_job` +
SteerBar [ ] state machine wired [ ] sweep decision implemented. *Validation:*
Beat 1 + Beat 2 (steer half) live locally.

**Phase 3 — The contract (Day 3, Nov 7)**
Goal: everything gated. Deliverables: [ ] Review Queue cards (Zod-rendered,
editable) [ ] `decide_effect` UI + `execute_approved_effect` + invariants
[ ] policy actions + typed errors [ ] trust dial UI + kill switch [ ]
append-only hardening. *Validation:* Beat 2 (trust half) + policy-block
evidence on screen.

**Phase 4 — The brain + polish (Day 4, Nov 8)**
Goal: corrections compound; ship-shaped. Deliverables: [ ] learning loop
finale (`propose_learning` → SkillDiffCard → `resolve_learning` → behavior
change in next draft) [ ] digest synthesis [ ] design pass (control-tower
aesthetic) [ ] Vitest suite green [ ] audit hardening [ ] compose file +
deploy checklist rehearsed. *Validation:* Beat 3 end-to-end; full verification
set locally.

**Phase 5 — Ship (Day 5, Nov 9 → owner deadline 08:59 WAT Nov 10)**
Goal: submitted with buffer. Deliverables: [ ] VPS live via compose (owner
runs) + demo world seeded + creds in README [ ] doctor/typecheck/tests/guards
green [ ] README "Real vs not yet" [ ] Clips recorded + published (account
pre-made) [ ] submit form filled ≥6h early. *Validation:* acceptance
checklist (brief §9).

**Ops overnight (Nov 5–9):** factory ticks pre-authorized unattended once
backlog + scenarios approved; merged links confirmed via `gh pr view` in the
morning; blocked laps handled via `status` → `logs` → fix → `unblock`.

## 13. Future Considerations

Post-hackathon: real mail connector (Gmail/IMAP); multi-tenant workspaces;
A2A endpoint consuming an external MCP (sanctioned stretch goals only if
everything else is verified and days remain: (a) one consumed external MCP
server, (b) A2A endpoint); richer trust predicates; per-thread SLA analytics.

## 14. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Steering semantics (interrupt vs queue) unknown | Beat 2 UX | Half-day spike Day 1; fallback: control-channel table checked per step (documented idiom), identical UX |
| Scheduled-jobs API undocumented | Sweep beat | Spike from repo source; fallback choreographed "yesterday's sweep found 6" + honest note |
| Learning writeback persistence/mechanism | Finale beat | Docs confirm per-user resources in Postgres + `AGENTS.md` loaded every turn; fallback: write via action, copy says "rule"; spike confirms same-process change |
| Sub-agent spawn API unknown | Beat 1 two-stream story | Fallback: single agent with two tracked thread rows (chips still render) |
| `needsApproval` app-path round-trip unclear | Defense-in-depth layer | It is additive only — drop the flag if it fights the UI; custom gate already covers the product |
| Factory unavailable at slicing time | Overnight chain | Solo fallback: implementer builds schema/actions/invariant directly (offload doc §6 principle); scenarios still authored as local Vitest |
| VPS downtime near judging | Live-URL criterion | Runbook join + Clips carries the demo; README documents state |
| Public demo creds → LLM spend | Budget | Server-side per-hour turn cap; seeded world carries browsing; audit shows everything |

## 15. Appendix

- Companion documents: `../AGENT-NATIVE-HACKATHON-BRIEF.md` (original brief —
  scope/beats/day plan), `../../REINS-FACTORY-OFFLOAD.md` (factory operating
  manual; note its §3 status is historical), and the design record
  `../../docs/superpowers/specs/2026-11-05-reins-design.md` (corrections +
  owner decisions).
- Framework docs (read 2026-11-05): /docs/key-concepts/, /docs/actions-defining/,
  /docs/actions-access-control/, /docs/actions-other-surfaces/, /docs/http-api/,
  /docs/deploy-an-app/ · repo: github.com/BuilderIO/agent-native ·
  hackathon: builder.io/hackathon · clips: clips.agent-native.com
- Assumptions recorded during synthesis: `send_followup` SMART defaults ≈
  ≤60 words / non-sensitive recipient / staleness <60 days; turn cap default
  20 agent-turns/hour/domain; `reins.techa.pro` as the host name; demo-mode
  execution records receipts without network egress; reject-requires-feedback
  is enforced by schema (feedback field required on `decision: "rejected"`).
