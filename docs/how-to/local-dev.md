---
name: running locally
description: web-specific dev-server details for rpg-dnd5e-web against a local rpg-api
updated: 2026-07-29
---

# Running locally

> For getting the whole stack up — redis, mongo, 5e-srd-api, envoy, and
> rpg-api itself — see `rpg-project/docs/howto/run-the-game-locally.md`.
> This doc only covers the web dev server's own env vars and dev-mode
> behavior once that stack is running.

## Prerequisites

- Node.js (check `.nvmrc` or `package.json` for required version)
- The backend stack running (see the canonical howto linked above)

## Start dev server

```bash
cd rpg-dnd5e-web
npm install
npm run dev
```

By default, Vite starts on `http://localhost:3001` (see `vite.config.ts`).

## Environment configuration

Create a `.env.local` file (not committed):

```bash
VITE_API_HOST=http://localhost:8080    # rpg-api address (envoy's gRPC-web bridge)
VITE_DEV_PLAYER_ID=test-player        # Player ID for local dev (bypasses Discord auth)
```

The dev fallback auth scheme (`Authorization: Dev <playerId>`) requires rpg-api to recognize the `Dev` scheme (`AUTH_DEV_MODE=true` — already set by the local dev compose stack). If the server rejects it, check that env var on the `rpg-api` container.

## Discord Activity mode

When running on `discordsays.com`, the app switches to `/.proxy` for all API calls. The Vite dev server proxies `/.proxy` to `VITE_API_HOST`. This is transparent in local dev.

## React StrictMode double-mount

In development, you will see double API calls and double stream connections. This is intentional. React StrictMode double-mounts components to detect side effects. The stream will connect, disconnect, and reconnect on mount. This does not happen in production builds.

## Build for production

```bash
npm run build
npm run preview   # Preview the production build locally
```
