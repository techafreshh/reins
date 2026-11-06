# Reins

The minimal agent-native starter app — a clean, ChatGPT-style shell with chat at
the center, durable threads, standard app navigation, auth, live sync, and
actions. Start here when you want a real browser app to build on without
committing to a domain template.

**Live app: [chat.agent-native.com](https://chat.agent-native.com?utm_source=github&utm_medium=referral&utm_content=chat-readme)**

Reins is the basic agent-native app starting point. It gives you the app-agent
loop wired end to end and one example action, so you can add your own UI, data,
and actions on top.

## Features

- ChatGPT-style shell with a threads list and durable chat history.
- Auth, live sync, and application state wired out of the box.
- The action surface the agent and UI share, plus one example action to copy.
- A minimal, brandable base for any domain app.

## Develop locally

Scaffold your own copy and run it:

```bash
npx --yes @agent-native/core@latest create my-app --standalone --template chat
cd my-app
corepack enable
pnpm install
pnpm dev
```

Full docs: [agent-native.com/docs/template-chat](https://agent-native.com/docs/template-chat?utm_source=github&utm_medium=referral&utm_content=chat-readme).

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
- `GET /` → `200` HTML placeholder containing `Reins skeleton live` (skeleton v0.1.0) with links to `/home` and `/chat`.

No external services are required (`docker-compose.yml` is an intentionally
empty-services stub; local state is file-backed PGlite).

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
- `ANTHROPIC_API_KEY` — funds the VPS agent turns behind the per-hour
  turn cap (20 turns/hour/source; the 21st gets 429).
- `PORT=3000` — the port compose publishes.

Before first boot, against the compose Postgres:

```bash
pnpm migrate:production
pnpm seed:demo
```

Then `docker compose up -d --build`.

Reverse-proxy SSE note: the live job feed streams over
`/_agent-native/events`. Disable buffering for that path or live streams
degrade to polling. For nginx:

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
