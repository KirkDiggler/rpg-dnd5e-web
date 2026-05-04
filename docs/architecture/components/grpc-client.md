---
name: gRPC client layer
description: Connect RPC transport, interceptors, and encounter hook wrappers
updated: 2026-05-02
confidence: high — verified by reading client.ts (86 lines) and encounterHooks.ts (437 lines)
---

# gRPC client layer

## client.ts

`src/api/client.ts` — **86 lines.**

Creates three Connect RPC clients backed by a shared gRPC-Web transport:

- `encounterClient` — `EncounterService`
- `characterClient` — `CharacterService`
- `diceClient` — `DiceService`

### Transport / Discord proxy

`client.ts:11-14`:

```typescript
const isDiscordActivity = window.location.hostname.includes('discordsays.com');
const API_HOST = isDiscordActivity
  ? '/.proxy'
  : import.meta.env.VITE_API_HOST || window.location.origin;
```

All requests go through `/.proxy` when running in the Discord Activity iframe. Vite dev server proxies `/.proxy` to the local rpg-api. This must stay in sync with the Vite config.

### Auth interceptor

`client.ts:24-38`. Adds `Authorization: Discord <token>` for production Discord sessions, or `Authorization: Dev <playerId>` for local development (recognized by the server). If neither condition applies, no auth header is added — the request will fail authorization on the server.

### Logging interceptor

`client.ts:41-70`. Emits emoji-prefixed `console.log` calls in development mode for every request/response and every error. Useful during local development but needs to be stripped or leveled before a polished demo.

## encounterHooks.ts

`src/api/encounterHooks.ts` — **437 lines.**

Wrapper hooks for every `EncounterService` RPC. Each hook follows a consistent pattern:

- Returns `{ data, loading, error }`
- Uses `useState` for state, `useCallback` for the action function
- Calls the `encounterClient` directly

Hooks:

- `useCreateEncounter`, `useJoinEncounter`, `useSetReady`, `useStartCombat`, `useLeaveEncounter`
- `useMoveCharacter`, `useResolveAttack`, `useEndTurn`
- `useActivateFeature`, `useActivateCombatAbility`, `useExecuteAction`
- `useOpenDoor`
- `useGetEncounterState`

The `loading` boolean returned from action hooks threads through `LobbyView` as props to prevent double-submission. With `LobbyView` at 2,345 lines, tracking which loading state belongs to which button is error-prone.

## No tests

Zero tests for the hook wrappers. Error paths (network failure, auth rejection, invalid state) are tested manually only.
