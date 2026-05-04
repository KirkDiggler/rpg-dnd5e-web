---
name: running locally
description: How to run rpg-dnd5e-web against a local rpg-api
updated: 2026-05-02
---

# Running locally

## Prerequisites

- Node.js (check `.nvmrc` or `package.json` for required version)
- rpg-api running locally (see rpg-api README)

## Start dev server

```bash
cd /home/kirk/personal/rpg-dnd5e-web
npm install
npm run dev
```

By default, Vite starts on `http://localhost:5173`.

## Environment configuration

Create a `.env.local` file (not committed):

```bash
VITE_API_HOST=http://localhost:8080    # rpg-api address
VITE_DEV_PLAYER_ID=test-player        # Player ID for local dev (bypasses Discord auth)
```

The dev fallback auth scheme (`Authorization: Dev <playerId>`) requires rpg-api to recognize the `Dev` scheme. If the server rejects it, add your player ID to the server's dev allowlist.

## Discord Activity mode

When running on `discordsays.com`, the app switches to `/.proxy` for all API calls. The Vite dev server proxies `/.proxy` to `VITE_API_HOST`. This is transparent in local dev.

## React StrictMode double-mount

In development, you will see double API calls and double stream connections. This is intentional. React StrictMode double-mounts components to detect side effects. The stream will connect, disconnect, and reconnect on mount. This does not happen in production builds.

## Build for production

```bash
npm run build
npm run preview   # Preview the production build locally
```
