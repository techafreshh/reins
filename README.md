# Reins

**Run agents, hold the reins.** Reins delegates stakeholder chase-up work to
an agent under an auditable contract: two sub-agents (Drafter, Tracker) work
quiet email threads in the open, every outward effect stops at an editable
review card that only a human decision can execute, trust is a per-capability
dial enforced server-side, mid-flight steering redirects a running job, and
every rejected correction permanently upgrades the agent. Every effect,
decision, and policy change lands in an append-only audit trail.

Built on [Agent-Native](https://github.com/BuilderIO/agent-native) for the
Builder.io Agent-Native hackathon (November 2026). One workload — chase-up
coordination — done end to end. Email is simulated by design (demo seed data;
**nothing leaves this machine**; real connectors are post-hackathon).

**Live app:** `https://reins.techa.pro` — sign in with the demo account below
to see the seeded world.

## The three beats

1. **Watch it work** — launch a chase-up job from the jobs board; the live
   feed streams the Orchestrator's plan plus Drafter and Tracker threads as
   chips over SSE as they happen.
2. **Steer it** — the SteerBar pipes into the *running* job's thread at the
   next tool boundary ("skip anyone over 60 days stale; don't email Alex
   before Thursday"); the plan visibly recalibrates. Tighten the trust dial
   live — the next auto-action that would have run now requires approval.
3. **It learns** — reject a draft **with feedback**; the agent proposes a rule
   as a diff card; approving it writes to the agent's Postgres-resident
   learnings, and the *very next draft* reflects the rule (reloaded every
   turn, same process).

The same ~13 `defineAction` capabilities power the UI, the agent's tools, the
HTTP API, the CLI (`pnpm action create-job --template=chase-up`), and MCP
(`/mcp` — your running jobs are steerable from any MCP client).


## CI verification gate

Every PR runs the `verify` job (`.github/workflows/ci.yml`): `pnpm typecheck`
plus `pnpm test`. Branch protection must require the `verify` check, so a red
`verify` blocks merge.

```bash
pnpm typecheck
pnpm test
```

## Walking skeleton

Minimal runnable baseline: a health endpoint plus a placeholder jobs page.

Prerequisites: Node 22 (`engines` requires >=22.22) and pnpm via corepack.

```bash
corepack enable
cp .env.example .env
pnpm install
pnpm dev
```

Dev server: `http://localhost:8080/` (default `agent-native dev` port).

Probe surfaces:

- `GET /api/health` → `200` with exactly `{"status":"ok","skeleton":true}`.
- `GET /` → `302` to `/home` (the Get started page); signed-out visitors
  continue through the workspace guard to the shared sign-in.

No external services are required for local dev (`docker-compose.yml` defines the
production VPS deploy: app + postgres; local state is file-backed PGlite).

## Demo account

A shared demo account is available on the deployed VPS:

- Email: `demo@reins.example`
- Password: `reins-demo-chase`

The owner creates this demo account once via the app sign-up page after the
first deploy (Better Auth users are never seeded from scripts or migrations).
Sign in with it to walk the seeded world: the chase-up job, its Drafter and
Tracker cards, and the review queue.

## Real vs not yet

Real today:

- Jobs lifecycle (planning → running → awaiting_review → complete) with a
  seeded demo world (`pnpm seed:demo`).
- Mid-flight steering from `running` without interrupting the run.
- Human review queue (approve / edit-approve / reject with feedback).
- Trust dial (per-capability levels plus global kill switch) with audit.
- Simulated execution receipts for approved effects.

Not yet:

- Real email sending or receiving.
- Multi-tenant auth / orgs.
- A2A federation.

Simulated outbox — nothing leaves this machine.

## Deploy checklist (VPS)

Required env vars (see `.env.example`):

- `DATABASE_URL` — Postgres connection string (compose sets this for `app`).
- `BETTER_AUTH_SECRET` — stable random secret; compose requires it
  (`${BETTER_AUTH_SECRET:?required}`).
- `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` — funds the VPS agent turns
  behind the per-hour turn cap (20 turns/hour/source; the 21st gets 429).
  The runtime uses the first provider key it finds (anthropic, openai,
  openrouter, google, groq, mistral, cohere).
- `PORT=3000` — the port the app serves on.

Deploy app + postgres (the prod override joins the shared Caddy gateway
network as alias `reins`; no host ports are published):

```bash
docker compose -f docker-compose.yml -f compose.prod.yaml up -d --build
```

Schema migrations apply automatically at app boot. Before the first visit,
create the seeded demo world against the compose Postgres (first bring up
postgres, or run this after `--build` when postgres is healthy):

```bash
docker compose -f docker-compose.yml -f compose.prod.yaml up -d postgres
docker run --rm --network reins_default -v "$PWD":/src -w /src \
  -e DATABASE_URL=postgresql://reins:reins@postgres:5432/reins \
  node:24-slim sh -c "corepack enable && pnpm install --frozen-lockfile && pnpm seed:demo"
```

`pnpm migrate:production` / `pnpm seed:demo` also work from a checkout with
dependencies installed — point `DATABASE_URL` at the compose Postgres.

Then create the demo account once via the app sign-up page (Better Auth
users are never seeded from scripts or migrations).

Reverse-proxy SSE note: the live job feed streams over
`/_agent-native/events`. Disable buffering for that path or live streams
degrade to polling. For Caddy:

```caddy
reins.techa.pro {
    reverse_proxy reins:3000 {
        flush_interval -1
    }
}
```

For nginx:

```nginx
location /_agent-native/events {
  proxy_buffering off;
  proxy_set_header X-Accel-Buffering no;
  proxy_pass http://app:3000;
}
```

TLS terminates at the owner's reverse proxy.

## Clips demo (≤2:30)

Record a walkthrough of at most 2 minutes 30 seconds: sign in with the demo
account, run the chase-up job, steer it mid-flight, approve one effect in the
review queue. Honesty line, spoken on camera: "nothing leaves this machine —
every send is simulated until a human approves it."
