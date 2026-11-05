# Reins — Build Brief

> **Hand this file to your coding agent as-is.** Everything needed to build the entry is in this document; context from the hackathon listing and framework docs is summarized here so no external conversation is required.

---

## 1. What we're building (and why)

**Reins** — *run agents, hold the reins.* Delegate real work to an agent under an auditable contract: watch it work, steer it mid-flight, approve what it did, dial trust up or down, and it learns from every correction.

**Entry for the Builder.io Agent-Native Hackathon** (https://www.builder.io/hackathon).

| Fact | Value |
|---|---|
| Deadline | **Nov 9, 2026, 11:59 PM PT** (~8:59 AM WAT Nov 10 — submit ≥6h early) |
| Winners announced | Nov 13, 2026 |
| Total prize | $10,000 (grand $5,000) |
| Judging | Usefulness & Execution **40%** · Creativity & Design **20%** · Innovation **20%** · Cleverness & Use of Agent-Native **20%** |
| Must use | The **Agent-Native framework** (`@agent-native/core`) — hardcoded requirement |
| Must submit | Working app + **public Clips demo** (https://clips.agent-native.com/) + form at builder.io/hackathon/submit |
| Registration | None required; solo entry |

**Product thesis (one sentence, memorize):** * Delegate work with a contract, not a chatbot — the agent does the job in the background, humans review and approve external effects, trust is a programmable dial, and every correction permanently upgrades the agent.*

**The workload (deliberately narrow):** stakeholder **chase-up coordination** — the agent works a set of email threads that have gone quiet: it drafts follow-ups, proposes nudges/sends, tracks promised dates, and ends each job with a status roundup. That's the whole product surface. One workload, done at product quality.

---

## 2. Hard technical constraints

- **Framework:** Agent-Native (`@agent-native/core`), open source — https://github.com/BuilderIO/agent-native, docs at https://www.agent-native.com/docs/ (read `/docs/key-concepts/` and `/docs/actions-defining/` **before writing code**).
- **Toolchain:** Node 22.22+, pnpm (`corepack enable`), TypeScript, React, Drizzle ORM. Dev environment is **Windows (Git Bash)**.
- **Scaffold command** (use the chat template, standalone):
  ```bash
  npx --yes @agent-native/core@latest create reins --standalone --template chat
  cd reins
  corepack enable
  pnpm install
  pnpm dev
  ```
  (If npx hits peer-dep errors: `npx clear-npx-cache` and retry.)
- **Data:** PGlite embedded locally; Drizzle DSL only (no raw SQL except additive migrations). **Never use Node-specific APIs** (`fs`, `child_process`) in app code — serverless-safe only. Keep all state in SQL.
- **LLM:** plug in via `.env` — an Anthropic or OpenAI key (or the Builder.io hosted option if simplest). Never hardcode keys; never commit `.env`. There will be an `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` provided in the environment.
- **Verify early with 2 risky features** (see §7 Day 1): mid-flight steering and the skill-writeback loop. If either proves impossible with documented APIs, degrade gracefully and note it — do not spend more than half a day on either.
- **Do not invent framework APIs.** Only use what the docs pages list. When a documented capability's exact export path is unknown, check the docs'/repo's source before guessing.

---

## 3. The three demo beats (build backward from these)

The submission demo is a **recorded 2-minute Clips video**. These three beats must exist and be visually obvious on screen. Write `docs/DEMO.md` capturing this script early.

1. **"Watch it work" (0:00–0:50):** Launch a job ("chase the 6 threads that went quiet"). Screen shows a live work feed: orchestrator plans, **two sub-agent threads stream simultaneously**, actions land in a live feed over SSE.
2. **"Steer it" (0:50–1:20):** Mid-flight, the reporter yanks the wheel — "skip anyone over 60 days stale, don't email Alex before Thursday." The running job visibly adapts (steer bar → confirmation → feed shows recalibrated plan). Also: tighten the trust dial live — next auto-actions that would have run now require approval.
3. **"It learns" (1:20–2:00):** Reject a draft **with feedback** ("never promise delivery dates in first outreach"). The agent proposes a skill/rule update as a **diff card**. Approve it. The next draft reflects the new rule. Close on the audit trail: every agent effect is one reviewable card with a receipt.

---

## 4. Feature scope — build exactly this

### 4.1 Core surfaces (5 screens max)

1. **Jobs board** — create a job from a template ("Chase-up sweep"), see active/past jobs, each job's state machine: `planning → running → awaiting_review → complete` (states as data, agent-updated).
2. **Live work feed (per job)** — orchestrator log + sub-agent thread streams, rendered as chips/cards, live via SSE (`useDbSync` / `/_agent-native/events`). Also hosts the **SteerBar** (input + quick-steer chips like "widen scope", "budget: 3 emails max").
3. **Review Queue ← hero screen** — every external effect the agent proposes lands as a **card** rendered from the action's Zod schema: to/subject/body fully editable inline. Three decisions: `Approve`, `Edit & approve`, `Reject with feedback`. Batch-approve for low-risk categories. Rejections require feedback text (that's what feeds the learning loop).
4. **Trust/Policy panel** — per-capability policies, e.g.:
   - `label_or_tag`: auto-approve (always)
   - `draft_reply`: auto-draft, require approval to send (always)
   - `send_followup:` approval required UNLESS policy says under-N-words + low-risk sender tier auto-runs
   - `kill_switch`: pause all agent activity
   Rendered as toggles + a "trust level" stepper per capability. Changes are themselves audited events. **Policies are typed actions the server enforces in the action `run` — not UI decoration.**
5. **Learning & audit** — pending skill/rule prophecies (diff cards: current SKILL.md/`LEARNINGS.md` excerpt → proposed addition), approve/reject; plus an append-only audit log of every agent effect, decision, and policy change.

### 4.2 Actions (~10–12 total, all `defineAction` + Zod, each is agent tool + UI hook + CLI + MCP)

- `create_job`, `list_jobs`, `get_job_state`
- `assign_task` (orchestrator → sub-agent), threads belong to sub-agents
- `steer_job` (mid-flight instruction; appends to job's steering channel)
- `propose_effect` (the ONLY path by which the agent can affect the outside — creates a queued review card; returns `pending_review`)
- `decide_effect` (approve / edit+approve / reject+feedback — human/GUI/`uiOnly`)
- `execute_approved_effect` (runs the real action — e.g., marks thread messaged; in demo mode just records it)
- `get_policy` / `update_policy` (trust dial; update_policy is a `uiOnly` action)
- `propose_learning` (reject-feedback → skill/rule diff proposal), `resolve_learning` (approve/reject, `uiOnly`)
- `digest_completed_job` (the roundup synthesis)

**Invariant to enforce server-side:** `execute_approved_effect` only runs for rows whose `decision = approved` and whose policy chain passed. No code path lets the agent call it directly. Typed errors: `policy_blocked`, `job_paused`, `trust_below_threshold`, `not_approved`, `stale_decision`.

### 4.3 Demo seed data (`--demo` flag or `/demo` route)

6–8 fully synthetic stakeholder threads with realistic bodies, names, staleness (3–70 days), one promised-then-missed date, one sensitive contact to exclude tactfully. No OAuth, no network. Must be idempotent (re-seedable wipes demo state). Real Gmail/IMAP is **out of scope** — the seeded world is honest, and the pitch says "connector ships post-hackathon."

### 4.4 Framework idioms to deliberately showcase (this is the 20% "Cleverness" axis)

| Framework feature | Where it's load-bearing |
|---|---|
| `defineAction` one action = every surface | All of §4.2; the same `propose_effect` renders as a queue card AND is the agent's tool |
| Sub-agents with own threads | Drafter + Tracker sub-agents per job, chips in the work feed |
| Live sync (SSE + `useDbSync`) | Work feed + queue updates stream; agent writes → UI updates with **zero sync code** |
| `sendToAgentChat` | Steering channel pipes into the running job's thread |
| Scheduled jobs | Nightly sweep: auto-open a chase-up job for threads gone quiet (show it in the demo as "yesterday's sweep found 6") |
| AGENTS.md + skills + per-user memory (Postgres) | Orchestrator instructions; the learning loop's writeback target (`LEARNINGS.md` / skill file) |
| Approvals as actions | The Review Queue *is* this idiom, elevated to the product |
| MCP export | Framing line: "Reins is also an MCP server — your running jobs are steerable from Claude Desktop" |
| CLI surface | `pnpm action create-job --template=chase-up` in the demo for one beat |
| A2A, Better Auth multi-tenant | **Explicitly out of scope** (nice-to-have only if everything else is done and verified) |

---

## 5. Quality bar (match or beat the visible competition)

A visible entry (Shop Ledger) shipped: server-enforced invariants, typed errors, append-only ledger, 19 tests, Playwright checks, deployed on Vercel, honest "verified vs not" docs. Match that discipline:

- **Append-only audit log** (events, decisions); corrections are new events, never deletes/updates.
- **Server-side policy enforcement** in action `run` + typed errors (see §4.2).
- **Vitest** tests for: policy gate, state machine transitions, decision idempotency, seed determinism.
- `agent-native:doctor` + typecheck clean.
- **Deploy a live instance** (Vercel via Nitro). Cron (evening sweep) only if trivially cheap — Vercel Cron + `CRON_SECRET` pattern.
- Every documented feature works — anything unfinished goes in an honest "Not yet verified" table in the README.

## 6. Design direction (the 20% Creativity axis lives here)

Calm "control tower" aesthetic. Dark or light — pick one and commit. One accent color. Big readable type. The Review Queue is the hero: cards should feel like signing off boarding passes — legible, tactile, one obvious primary action. Component inventory: `JobCard`, `ThreadStream`, `SteerBar`, `QueueCard` (Zod-rendered editable form), `PolicyDial`, `SkillDiffCard`, `AuditTrail`. No gradient soup, no emoji rain, no dashboard-of-dashboards. Mobile: acceptable, not priority.

## 7. Build plan (5 days from Nov 5; deadline night = Nov 9)

- **Day 1 — Scaffold + de-risk.** `create` command, repo init, `.env` wired. Build the thin actions + schema + seed data. **Prove steering works and prove the skill-writeback loop works** (even ugly). Write `docs/DEMO.md` beats. Commit checkpoints per feature.
- **Day 2 — The loop.** Orchestrator + 2 sub-agents + live feed + `steer_job` + job state machine. Nightly sweep scheduled.
- **Day 3 — The contract.** Review queue UI (full CRUD on cards), `decide_effect`, policy actions + server enforcement + typed errors, trust dial UI.
- **Day 4 — The brain + polish.** Learning loop finale (propose→approve→behavior change), digest synthesis, design pass, Vitest suite, audit log hardening.
- **Day 5 — Ship.** Deploy live, `doctor` + full verification, record Clips (multiple takes, script in `docs/DEMO.md`), fill submit form fields (repo URL, Clips URL, solo team, description), **submit before 11:59 PM PT**.

## 8. Out of scope (do not build these)

Real email connections (Gmail/IMAP) · multi-tenant auth/orgs · A2A federation · voice/STT · mobile-specific UI · more than one job workload · plugin marketplaces. If every in-scope item is verified and days remain, the only sanctioned stretch goals are: (a) one consumed external MCP server, (b) A2A endpooint.

## 9. Acceptance checklist (verify before submitting)

- [ ] `pnpm dev` boots clean on Windows; seed demo world loads
- [ ] Beats 1–3 of §3 each demonstrable on screen, end to end
- [ ] Policy gate blocks an actual attempt (show the typed error in logs)
- [ ] Learning loop: reject→propose→approve→behavior-changes, recorded
- [ ] Sub-agent threads stream live; steering is received mid-flight and adapts
- [ ] Append-only audit trail; no destructive datapaths for agent-created records
- [ ] Typecheck + `agent-native:doctor` + Vitest green; honest README ("Real vs not yet")
- [ ] Live deployed URL reachable
- [ ] Clips demo recorded (public), ≤2:30
- [ ] Submit form at builder.io/hackathon/submit filled; **submitted with ≥6h buffer**

## 10. Key links

- Hackathon: https://www.builder.io/hackathon · Rules: /hackathon/rules · Submit: /hackathon/submit
- Framework docs: https://www.agent-native.com/docs/ (Getting started / What is / Key concepts / Actions / Deploy)
- Framework repo: https://github.com/BuilderIO/agent-native
- Clips: https://clips.agent-native.com/
- Timezone: build in WAT (UTC+1); all hackathon deadlines are PT.
