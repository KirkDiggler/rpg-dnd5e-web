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

## Two local worlds (Dev world selection)

To simulate the same player in two worlds against ONE local API, opt in
with an explicit allowlist. This is development-only; production cannot
enable it by setting the list, and real Discord credentials always use the
SDK guild instead:

```bash
VITE_DEV_WORLD_IDS=123456789012345678,223456789012345678  # canonical guild-shaped ids
VITE_DEV_WORLD_ID=123456789012345678                      # default; must be in the list
```

Start a tab in `A` and another in `B` (same player unless `?playerId=` is
set):

- `http://localhost:3001/?worldId=123456789012345678`
- `http://localhost:3001/?worldId=223456789012345678`

Each client sends the selected world as `x-rpg-guild-id` on Dev requests and
uses the same world for its identity, composition source and Server access
settings. A development-only label in the top-left corner names the live
identity (kind, player, world, credential epoch) and links to each allowed
world.

An unknown, malformed, repeated or non-allowed `?worldId=` is refused: the
client shows a refusal screen and sends no gameplay request at all — it never
falls back to the default world. Without `VITE_DEV_WORLD_IDS`, the previous
fixed `VITE_DEV_WORLD_ID` (default `test-world`) behavior is unchanged and no
client-selected world is exposed.

## Discord Activity mode

When running on `discordsays.com`, the app switches to `/.proxy` for all API calls. The Vite dev server proxies `/.proxy` to `VITE_API_HOST`. This is transparent in local dev.

## React StrictMode double-mount

In development, you will see double API calls and double stream connections. This is intentional. React StrictMode double-mounts components to detect side effects. The stream will connect, disconnect, and reconnect on mount. This does not happen in production builds.

## Build for production

```bash
npm run build
npm run preview   # Preview the production build locally
```
