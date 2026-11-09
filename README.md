<div align="center">

# Reins

**Run agents, hold the reins.**

Delegating work to an agent should feel like handing it to a careful
employee, not like handing over the keys. Reins runs one concrete workload —
stakeholder chase-up over quiet email threads — under an auditable contract:
the agent works in the open, nothing reaches the outside world without a
human decision, trust is a dial you can turn mid-flight, and every correction
you make becomes a rule the agent keeps.

[![CI](https://github.com/techafreshh/reins/actions/workflows/ci.yml/badge.svg)](https://github.com/techafreshh/reins/actions/workflows/ci.yml)
&nbsp;
[Live demo](https://reins.techa.pro) ·
[Demo script](docs/DEMO.md)

</div>

| Live feed — watching the agent work | Review queue — every send waits here |
| --- | --- |
| ![Live feed](docs/screenshots/live-feed.png) | ![Review queue](docs/screenshots/review-queue.png) |

> [!IMPORTANT]
> Email is **simulated by design**: the outbox records receipts locally and
> nothing leaves the machine. Real connectors ship after the hackathon.

## The contract

1. **The agent proposes; only a human disposes.** Every external effect
   follows one path: `propose_effect` → review card → human decision →
   `execute_approved_effect`. The invariant is enforced server-side, not on
   the honor system.
2. **State is data.** Jobs, threads, policies, decisions, and learnings are
   SQL rows the UI streams over SSE — no sync code anywhere.
3. **Trust is programmable.** Each capability runs at `ASK`, `SMART`, or
   `AUTO`; a global kill switch stops everything. Every policy change is an
   audited event.
4. **Corrections compound.** Rejecting a draft with feedback yields a rule
   proposal; approving it updates the agent's very next draft.
5. **One action, every surface.** The same `defineAction` capabilities power
   the UI, the agent's tools, the HTTP API, the CLI
   (`pnpm action create-job --template=chase-up`), and MCP (`/mcp`).

## How it works

An agent-native Nitro app: the agent server and the React UI share
Drizzle/Postgres state (PGlite in dev).

| Path | What lives there |
| --- | --- |
| `actions/` | The typed capability surface (Zod in/out, declared errors) |
| `server/lib/policy.ts` | Trust engine: per-capability levels, kill switch |
| `server/lib/loops/` | Orchestrator + Drafter + Tracker heartbeat |
| `server/db/schema.ts` | Jobs, threads, effects, decisions, policies, audit, learnings |
| `app/routes/` | Jobs board, live feed, review queue, trust, learnings, audit |
| `tests/` | Policy gate, lifecycle, execute-invariant, review queue, seeding |

Mid-flight steering uses the framework's durable steering queue: instructions
land in the running job's thread and are consumed at the next tool boundary —
no restart, no interrupt.

## Quickstart

```bash
corepack enable
cp .env.example .env
pnpm install
pnpm dev                     # http://localhost:8080
```

Probe surfaces:

- `GET /api/health` → `{"status":"ok","skeleton":true}`
- `GET /` → `302` to `/home` (signed-out visitors continue to the shared sign-in)
- Sign in, then `pnpm seed:demo` creates the chased-up world (7 threads,
  staleness 3–70 days, one missed date, one sensitive contact).

> [!TIP]
> Any provider key funds the agent — `ANTHROPIC_API_KEY`,
> `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, …
> The runtime uses the first one it finds.

## Demo

A narrated walkthrough (≤2:30) covers the three beats — watch it work, steer
it mid-flight, watch it learn. The recording plan and beat script live in
[`docs/DEMO.md`](docs/DEMO.md). Sign in on the live URL with:

```
demo@reins.example / reins-demo-chase
```

## Deploy (VPS)

```bash
# .env: BETTER_AUTH_SECRET (required), one provider key, DATABASE_URL
docker compose -f docker-compose.yml -f compose.prod.yaml up -d --build
```

- `compose.prod.yaml` attaches the app to the shared gateway network as
  `reins` — no host ports; an edge reverse proxy fronts `reins:3000`.
- Schema migrations apply automatically at boot. Seed the demo world once:

  ```bash
  docker compose -f docker-compose.yml -f compose.prod.yaml up -d postgres
  docker run --rm --network reins_default -v "$PWD":/src -w /src \
    -e DATABASE_URL=postgresql://reins:reins@postgres:5432/reins \
    node:24-slim sh -c "corepack enable && pnpm install --frozen-lockfile && pnpm seed:demo"
  ```

- The live job feed streams SSE over `/_agent-native/events` — disable your
  proxy's buffering for that path. With Caddy:

  ```caddy
  reins.example.com {
      reverse_proxy reins:3000 {
          flush_interval -1
      }
  }
  ```

Guardrails on a public deployment: the per-hour agent-turn cap (20
turns/hour/source, the 21st gets a 429) bounds spend behind the published
demo credentials, and the execute invariant bounds what any session can
actually do to the world.

## Verification

Every PR runs the `verify` gate (typecheck + tests), and the same set runs
locally:

```bash
pnpm typecheck
pnpm test
pnpm agent-native:doctor
pnpm actions:audit
pnpm guard:external-result-contract
```

## Real vs not yet

| Real today | Not yet |
| --- | --- |
| Jobs lifecycle (planning → running → awaiting_review → complete) | Real email send/receive (Gmail, IMAP, OAuth) |
| Mid-flight steering without interrupting the run | Multi-tenant auth and orgs |
| Human review queue (approve / edit & approve / reject with feedback) | A2A federation |
| Trust dial + kill switch with audit | Plugin marketplaces, a second workload |
| Learning loop: rejection feedback → rule → next draft | |

Simulated outbox — receipts without network egress; every simulated send is
recorded in the audit trail.
