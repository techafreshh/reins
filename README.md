# Chat

The minimal agent-native starter app — a clean, ChatGPT-style shell with chat at
the center, durable threads, standard app navigation, auth, live sync, and
actions. Start here when you want a real browser app to build on without
committing to a domain template.

**Live app: [chat.agent-native.com](https://chat.agent-native.com?utm_source=github&utm_medium=referral&utm_content=chat-readme)**

Chat is the basic agent-native app starting point. It gives you the app-agent
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
