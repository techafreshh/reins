# Reins — Factory Offload Plan (give this to your interactive build agent, with the main brief)

> Companion to `AGENT-NATIVE-HACKATHON-BRIEF.md` (the full spec — copy it into the repo as `.agents/PRDs/PRD.md`, the factory's required convention). This file covers only **what you offload to the pi-dark-factory and how**, so the unattended laps verify the right things.

## 1. The split, and why

The factory is an unattended lap loop on the VPS: one GitHub issue per tick goes through intake → plan → implement → verify (CI + **black-box runtime/holdout scenarios**) → review → squash-merge → close. Its verifier sees only HTTP surfaces, exit codes, and timings. That makes it ideal for anything whose acceptance is expressible as endpoint assertions, and blind to anything else.

**You keep (cannot be scenario-expressed):**
- **Mid-flight steering** — whether a `sendToAgentChat` message interrupts an in-flight turn or queues for next turn. Spike it on the skeleton first (half-day cap). Fallback if it queues: a control-channel table checked every step (documented shared-store idiom, same UX).
- **Skill/rule writeback** — where agent-authored skills/memory persist (`.agents/skills/` files vs Postgres rows), and whether an approved rule changes behavior **in the same running process** (the finale beat dies if it needs a restart). Fallback: write to `LEARNINGS.md`/memory rows and say "rule" in the demo copy.
- Sub-agent orchestration + live SSE thread rendering, the SteerBar, the whole Review Queue UX, policy dial UI, design pass, demo choreography, Clips recording.

**You offload (mechanical, verifiable by probes):**
- Drizzle schema + migrations: jobs, proposed effects + decisions, policies, audit events, threads/messages.
- The ~11 typed actions with `http` surfaces and typed errors (`policy_blocked`, `job_paused`, `trust_below_threshold`, `not_approved`, `stale_decision`).
- The load-bearing invariant: no code path runs `execute_approved_effect` without a `decision = approved` row and a passing policy chain.
- Append-only audit semantics (corrections are new rows, never updates/deletes).
- Seed dataset (`--demo`/`/demo` route, idempotent reseed), nightly sweep skeleton.

## 2. Before you slice: walk the skeleton yourself

1. Create the GitHub repo (e.g. `techafresh/reins`), commit the PRD (the brief) and this file.
2. `npx --yes @agent-native/core@latest create reins --standalone --template chat`, `corepack enable`, `pnpm install`, `pnpm dev` — commit this working skeleton. **The first backlog issue is the walking skeleton by contract, but the real skeleton is yours**: doing it interactively encodes the framework idioms so factory implementers build on rails you already proved.
3. Run the two spikes (§1 keep-list) against the skeleton **today**. Write the decided architecture into `docs/DECISIONS.md`. The backlog must encode what you *proved*, not what you hope — factory laps can't resolve unknowns.

## 3. Factory status and wiring (as of Nov 5)

- API `https://factory-api.techa.pro` returns **502** (repeated probes — upstream service down on the VPS). The user must restart it; until then factory work is blocked — do skeleton + spikes regardless.
- This machine has no `bin/factory-remote` client and no `~/.config/factory-remote/` (url + key). The user provisions both (key lives in a 600-mode file, **never printed**). Retry `factory-remote doctor` after they fix it.

## 4. Onboarding sequence (every mutating verb needs the user's explicit yes)

1. `factory-remote doctor` then `status` — factory alive, repo not already onboarded.
2. `factory-remote onboard techafresh/reins` — discovers branch, reserves scenario ports, writes config on the VPS. Confirm with the user: **models** (disciplined tier for implement/review, cheaper for plan; ClinePass multi-key router at `host.docker.internal:8099` with provider `clinepass-rotator` if keys are pooled), **required_checks** (CI gate names, `[]` if none), **env.mode** (`host` unless the repo ships `docker-compose.yml`).
3. Draft `runtime.json` (positive path: setup/start/probes) and `holdout.json` (adversarial: malformed input → 4xx never 500, unknown resource, boundaries) from the PRD. **Show both to the user in full before uploading.** Probe tokens: `status:N`, `json:path=value`, `body_contains:`, `body_matches:^re$`, `exit:N`, `max_ms:` — space-free values, unknown tokens fail closed.
4. `factory-remote backlog <slug> --prd-file PRD.md --max 20` — preview only. Verify it starts with the walking skeleton, then `--create` on explicit confirmation (creates real issues with `Depends on: #n`, deduped by title).
5. `factory-remote tick <slug>` — returns immediately (spends real tokens; confirm first). Check `status --repo <slug>` once after a few minutes. **No busy-polling.**

## 5. How to write factory issues

Title: `capability — observable outcome` (e.g. `decide_effect — approving a queued send executes it exactly once`). Body: files to build, framework constraints (Drizzle DSL only; never `fs`/`child_process`; typed actions; keep everything serverless-safe), and a coarse acceptance hint ("`GET /api/jobs` returns the list; invalid POST → 4xx"). **Do not paste probe expectations into issues** — that seeds the implementer against the verifier. Issue bodies and scenario contents are different documents.

## 6. Around-the-clock ops

- Fire evening ticks — laps are serial (tens of minutes each), so overnight = several links of the chain for free.
- Blocked issue: `status` row + `last_error` → `logs --tail 300` → identify the failing gate → propose a fix → `unblock <slug> <n>` after confirming with the user. Never hand-edit ledger/state files.
- `terminal ≠ good`: when a lap reports merged, confirm with `gh pr view` before calling it done. A 429 on all providers = every ClinePass key is cooling; tell the user to add one on the VPS (`~/state/clinepass.keys`), never improvise.
- If the factory stalls and the deadline looms, pull any issue back to yourself rather than waiting — interactive beats blocked.

## 7. Deadline math

Submission closes **Nov 9, 11:59 PM PT ≈ 8:59 AM WAT Nov 10**. Shape of the five days: Day 1 = skeleton + spikes + onboard/slice; Days 2–3 = your beats (steering, queue, learning loop) while factory laps chew the backlog overnight; Day 4 = design pass + integration + freeze; Day 5 = deploy, verify (`doctor`, typecheck, Vitest, live URL), record Clips, submit with ≥6h buffer.
