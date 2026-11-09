# DEMO — Clips recording script (submission day)

> Target: ≤2:30, one take, <6 takes budget. Record at 1920×1080, browser at
> 100% zoom, dark theme if available. Live URL: `https://reins.techa.pro`
> (falls back to local dev server if the VPS is unreachable: `pnpm dev`).
> Demo account: `demo@reins.example` / `reins-demo-chase` (README).

## Pre-flight (before hitting record)

- [ ] Demo world loaded: sign in once, confirm the seeded chase-up job, 7 threads, pending review cards, audit entries are visible.
- [ ] Live app reachable; if recording locally instead, `AGENT_NATIVE_ENABLE_LOCAL_RECURRING_JOBS=1 pnpm dev`.
- [ ] Close stray tabs/notifications; bookmarks bar hidden.
- [ ] Clips recording page open, mic tested; say the honesty line once aloud as a mic check.

## Beat 1 — "Watch it work" (0:00–0:50)

On camera: start on the jobs board.

1. 0:00 — Say: "This is Reins. I delegate stakeholder chase-up to an agent — under a contract, not a chatbot." Click **Run a chase-up sweep** (or the seeded running job if faster).
2. 0:10 — Live work feed: point at the **Orchestrator plan** landing, then the **Drafter** and **Tracker chips** streaming concurrently. Say: "Two sub-agents, working in the open — full thread streams, live over SSE."
3. 0:35 — An effect proposal lands in the feed ("drafted follow-up to Priya"). Say: "Every outward effect proposes a review card. Watch — nothing sent yet."

## Beat 2 — "Steer it" (0:50–1:20)

1. 0:50 — SteerBar: type or click the chip "don't email Alex before Thursday". Say: "Mid-flight steering — this pipes into the running job's thread."
2. 1:00 — Show the confirmation + the feed's recalibrated plan (affected card updates). Say: "No restart — it adapts at the next tool boundary."
3. 1:10 — Trust dial: flip `send_followup` to ASK. Say: "Tighten trust live — the very next auto-send would now require my approval."

## Beat 3 — "It learns" (1:20–2:10)

1. 1:20 — Review Queue: open a pending card. Edit the body inline, **Edit & approve** one card (show editing works). Say: "Editable cards — I hold the reins."
2. 1:35 — Then **reject** a different draft with feedback: "never promise delivery dates in first outreach."
3. 1:45 — Learning & audit screen: the proposed rule diff card appears; click **Approve**. Say: "Feedback becomes a permanent rule — stored with the agent, reloaded every turn."
4. 1:55 — Trigger/queue the next chase (or show the next ranked draft reflecting the rule — prefer whatever is visibly fast). Say: "Next draft already respects the rule."
5. 2:05 — Audit trail: brief scroll. Say the honesty line: "**Nothing leaves this machine — every send is simulated until a human approves it.** Every action is one reviewable card with a receipt."

## Post (2:10–end)

- HUD: repo URL + "github.com/techafreshh/reins — Agent-Native hackathon 2026".

## Contingencies

- **Seed looks stale/wrong:** `pnpm seed:demo` (idempotent, fixed ids) then reload.
- **Steer doesn't visibly adapt:** use the prepared instruction chip; if the run already settled, steer a fresh job (queue-for-next-turn is the documented fallback — say "queued to the running thread" instead of "next tool boundary").
- **Turn cap trips (429):** wait the hour or record the remaining beats on a locally-run instance.
- **VPS down:** record fully on local dev; deploy URL in README still stands for judges.
