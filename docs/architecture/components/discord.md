---
name: Discord Activity wiring
description: DiscordProvider, useDiscord hook, auth, sandbox constraints
updated: 2026-05-02
confidence: high — verified by reading DiscordProvider.tsx, discord/hooks.ts, discord/sdk.ts, client.ts
---

# Discord Activity wiring

`src/discord/` — Discord Embedded App SDK integration.

## Files

| File                    | Purpose                                                |
| ----------------------- | ------------------------------------------------------ |
| `sdk.ts`                | SDK initialization, stub for non-Discord environments  |
| `DiscordProvider.tsx`   | Context provider — initializes SDK, authenticates user |
| `context.ts`            | React context type definition                          |
| `hooks.ts`              | `useDiscord()` — consumes the context                  |
| `types.ts`              | Local TypeScript types for Discord user/auth           |
| `DiscordDebugPanel.tsx` | Dev-only panel showing auth state                      |

## Auth flow

1. `DiscordProvider` initializes the Discord Embedded App SDK (`@discord/embedded-app-sdk`)
2. Calls `sdk.commands.authenticate()` to get a user token
3. Token is stored (via `setDiscordToken` in `auth.ts`) and used by the gRPC auth interceptor
4. `playerId` is set to `discord.user?.id`

In development (non-Discord iframe), the SDK stub is used and auth is bypassed. `client.ts` uses the `Dev` authorization scheme with `VITE_DEV_PLAYER_ID` when no Discord token is present.

## Sandbox constraints

The app runs in a sandboxed Discord iframe at `discordsays.com`:

- All API calls must use the `/.proxy` path (enforced in `client.ts`)
- External script sources are restricted by Discord's CSP
- The Discord SDK communicates with the parent frame via `postMessage` — failure to initialize is silent in the iframe
- `window.location.hostname.includes('discordsays.com')` is the runtime detection for Discord Activity mode

## Known gap: silent production failure

`LobbyView.tsx:223-224`:

```typescript
const playerId = discord.user?.id || (isDevelopment ? 'test-player' : '');
```

If Discord auth fails in production (`discord.user` is undefined), `playerId` becomes `''`. The stream subscription and all event guards checking `event.member?.playerId === playerId` will silently produce wrong results. No error is surfaced to the player. The correct behavior would be to render an auth error state and not proceed to the encounter.

## DiscordDebugPanel

`DiscordDebugPanel.tsx` shows the current Discord auth state, user ID, and SDK version. `App.tsx` renders it behind a `showDebugPanel` state variable toggled by a button in the corner — it is hidden by default and can be shown in any environment. Not dev-only.
