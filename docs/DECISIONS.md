# Reins — Architecture Decisions (Day 1 spikes, 2026-11-05)

> Source of truth: @agent-native/core **0.224.0** source (shallow clone of
> BuilderIO/agent-native, matching the scaffold's dependency). File paths
> below are repo-relative. Outcome: **all five unknowns from the design doc's
> spike ledger (§8) resolved on documented first-choice paths** — no fallbacks
> needed. Design doc §8 remains historically useful; where it lists
> fallbacks, those now apply only if implementation surprises us.

## D1 — Mid-flight steering: real mid-turn injection exists (no custom control channel)

- `sendToAgentChat` (packages/core/src/client/agent-chat.ts:1419) posts to the
  host chat runtime; while a run is in flight the client adapter raises
  `AgentKitRunSlotBusyError` and persists the message into a **durable queue
  inside the thread's `threadData` JSON** (`chat_threads` table; type
  `QueuedMessage` with `delivery?: "steering" | "after_reply"`,
  packages/core/src/chat-threads/store.ts:2031).
- The **steering path** is first-class: `steerQueuedMessage` /
  `SteerQueuedInput` (packages/agentkit/src/protocol/index.ts:1299, 1163) —
  `deliverInActiveRun: true` writes a `delivery: "steering"` row that the
  running loop claims at its next tool boundary (`claimSteeredQueuedMessages`,
  chat-threads/store.ts:3197; delivered into the next model request as user
  text, production-agent.ts:7701, called at 11697). Never aborts the run.
- `interruptActiveRun: true` is the opt-in abort (safe-boundary abort then
  resubmit, agent-chat-plugin.ts:9623 `finishInterrupt`).
- **Decision:** SteerBar → `steer_job` action → persist + steer with
  `deliverInActiveRun: true`. The design doc's "control-channel table checked
  per step" fallback is unnecessary — the framework's thread queue IS that
  idiom. If run is already settling, rows flip to `after_reply` automatically.

## D2 — Nightly sweep: documented dev API, real on the VPS

- `packages/scheduling` is unrelated (calendar domain). Automations live at
  packages/core: storage is a Markdown resource `jobs/<name>.md` with YAML
  frontmatter (packages/core/src/jobs/frontmatter.ts:15), written by
  `resourcePut(owner, "jobs/nightly-sweep.md", ...)`
  (packages/core/src/resources/store.ts:2032, `@agent-native/core/resources`)
  — documented verbatim in packages/core/docs/content/recurring-jobs.mdx:144.
- Trigger: 60-second in-process scheduler on long-lived Node/Docker hosts
  (agent-chat-plugin.ts:10840) — **our VPS target supports this natively**.
  Runs through the standard agent loop with full tools (`runBackgroundAutomation`).
- Local PGlite dev: scheduler is off by default; enable with
  `AGENT_NATIVE_ENABLE_LOCAL_RECURRING_JOBS=1`. Instant demo execution:
  `queueAutomationRunNow` (jobs/run-now.ts:198) — "Run now works on localhost".
- **Decision:** a seeds plugin (pattern:
  templates/factory/server/plugins/factory-scheduler-job.ts) resourcePuts
  `jobs/nightly-sweep.md` (cron evening, `runAs: creator`) plus demo sub-agent
  profiles; scenario/demo uses Run-now; README carries the env-var note.

## D3 — Learning writeback: Postgres `resources` + next-turn reload (same process)

- Per-user agent resources live in the `resources` table as file-like rows
  `(owner, path)` (packages/core/src/resources/store.ts:1174): `LEARNINGS.md`,
  `AGENTS.md`, `memory/`, `skills/<name>/SKILL.md`, `agents/<name>.md` (custom
  sub-agents), `jobs/`. Template seeds `learnings.md`/`learnings.defaults.md`
  into shared `LEARNINGS.md` ("once per database").
- **The agent writes via framework tools**: `resources` tool
  (`action: "write"`, script-entries.ts:440) and `save-memory`
  (script-entries.ts:597). `LEARNINGS.md`-path writes default to `shared`
  scope (store.ts:377) and carry per-write `needsApproval`
  (`allowPersistentApproval: false`) — the framework itself gates shared
  writes per-episode.
- **Reload semantics: the system prompt is rebuilt from Postgres on every
  turn** (`loadResourcesForPrompt`, server/agent-chat/prompt-resources.ts:1864;
  shared LEARNINGS.md read at 2090). Nothing to invalidate.
- **Decision (finale beat):** reject-with-feedback → ` propose_learning`
  creates the SkillDiffCard → `resolve_learning` (approve) → a server-side
  write via `resourcePut` to the rules file → **the very next draft turn
  re-reads it in-process**. No restart, no file writes at runtime (runtime
  file mode is dev-restricted anyway, store.ts:976).

## D4 — Sub-agents: the `agent-teams` tool is the spawn API

- Model-called framework tool `agent-teams` (actions spawn/status/
  read-result/send/list; browser-team-tools.ts:549; mounted into every prod
  chat run, agent-chat-plugin.ts:5002). "Own thread" = a real `chat_threads`
  row + durable queued run (agent-teams.ts:1857).
- Chips for free: `agent_task` SSE events (agent-teams.ts:1930) → client maps
  to `kind: "sub-agent"` items (client/chat/runtime.ts:4761) rendered inline
  by toolkit's `AgentTaskCard` (live preview + open-thread).
- Custom profiles (Drafter/Tracker) are `agents/<name>.md` resources;
  spawn's `agent: "<name>"` argument selects one and uses its `model`
  (resources/agents.ts:53).
- **Decision:** Drafter + Tracker as custom agent profiles, spawned by the
  orchestrator via `agent-teams` during `create_job`/run. Beat 1's two
  streaming chips come from the built-in path — no custom thread plumbing.
  Design doc's single-agent fallback will not be needed.

## D5 — `needsApproval` second lock: durable, 1h TTL, no edit-and-approve

- Pending approvals are rows in `agent_tool_approvals` (owner+thread+turn+
  tool+revision+HMAC'd key+args-hash; agent/tool-approval-store.ts), **1-hour
  TTL** (tool-approval-store.ts:33), purged after 24h. Consumption is
  server-authoritative; the Approve/Deny card lives in persisted thread
  history and survives reload (toolkit `AgentApprovalCard`).
- **Edit-and-approve is impossible** by design (approval key + args-hash
  double-bind; edited args → different key → 422). Confirms the design:
  editing goes through the custom Review Queue only.
- MCP/A2A/CLI have their own durable approval stores
  (`mcp_action_approvals` review page, `a2a_approvals` routes); unproven HTTP
  callers get 409 `approval_required`.
- **Decision:** keep the hybrid. `execute_approved_effect` keeps
  `needsApproval: true` + `allowPersistentApproval: false` (no "always
  allow" caching on the one destructive launcher); the custom Review Queue is
  the product surface; document the 1-hour TTL in the README.

## D6 — Orchestrator fan-out uses tracked rows, not live `agent-teams` spawns

- Beat 1 needs a per-job live feed: one orchestrator log plus two agent
  cards (Drafter, Tracker) streaming over the framework's
  `/_agent-native/events` SSE. The issue explicitly allows a fallback of one
  agent with two tracked thread rows when spawn is unavailable, and the
  scenario probes run unattended without provider keys — LLM latency and
  flakiness cannot meet the 5s/10s acceptance budgets, and every acceptance
  check is satisfiable with DB-visible rows plus SSE frames.
- **Decision:** deterministic in-process orchestration over the existing
  `messages`/`audit_events` tables (`server/lib/loops/orchestrator.ts`
  `ensureFanout` + `groupFeedForJob`): a running job converges to one
  `orchestrator` log row plus one `drafter` and one `tracker` row
  (`threadId: ""`, sequential `seq`, `auditEvents` kind `fanout`); reruns
  insert nothing. New agent cards are plain `messages` rows written by
  `assign_task` (kind `assign`) and read back by `get_job_feed`.
- Liveness comes from the framework transport, not a custom socket:
  `recordChange({ source: "jobs", type: "change", key: jobId })` heartbeat
  every 2s while any job is `running` (`server/lib/loops/heartbeat.ts`,
  started by `server/plugins/job-feed.ts`), because framework SSE does not
  replay history on connect; `changeResource` (`{ resourceType: "job",
  resourceId }`) on the job actions marks the shareable resource each write
  changes so collaborators invalidate. No new tables, no migrations, no
  custom app-owned SSE endpoint, no manual `EventSource` clients.
- Revisit real `agent-teams` spawns only if a later beat needs model output.

## Net effect on the plan

- Spike ledger: 5/5 lands on first-choice documented paths; the design doc's
  fallbacks demote to contingency notes.
- New Phase-2 additions revealed by the source: seed plugin for
  `jobs/nightly-sweep.md` + `agents/drafter.md` + `agents/tracker.md`
  profiles; "Run now" for demo choreography;
  `AGENT_NATIVE_ENABLE_LOCAL_RECURRING_JOBS=1` for local runs.
- No change to the action surface, invariant, or scenario plan.
