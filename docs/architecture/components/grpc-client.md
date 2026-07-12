---
name: gRPC client layer
description: Connect RPC transport, interceptors, and the encounter/lobby action-hook wrappers
updated: 2026-07-12
confidence: high — verified by reading client.ts and the current src/api/*.ts hook files in full
---

# gRPC client layer

## client.ts

`src/api/client.ts` creates four Connect RPC clients backed by a shared gRPC-Web transport:

- `encounterClient` — v1alpha2 `EncounterService` (the live game loop)
- `lobbyClient` — v1alpha1 `LobbyService` (party assembly)
- `characterClient` — `CharacterService`
- `diceClient` — `DiceService`

The old v1alpha1 `EncounterService`'s request/response lobby/combat RPC
client (also named `encounterClient` before slice 3, rpg-dnd5e-web#447)
and its wrapper hooks (`encounterHooks.ts`, `lobbyHooks.ts`) were deleted
along with `LobbyView.tsx`, their only real caller — see
[lobby-view.md](lobby-view.md).

### Transport / Discord proxy

```typescript
const isDiscordActivity = window.location.hostname.includes('discordsays.com');
const API_HOST = isDiscordActivity
  ? '/.proxy'
  : import.meta.env.VITE_API_HOST || window.location.origin;
```

All requests go through `/.proxy` when running in the Discord Activity iframe. Vite dev server proxies `/.proxy` to the local rpg-api. This must stay in sync with the Vite config.

### Auth interceptor

Adds `Authorization: Discord <token>` for production Discord sessions, or `Authorization: Dev <playerId>` for local development (recognized by the server). If neither condition applies, no auth header is added — the request will fail authorization on the server.

### Logging interceptor

Emits emoji-prefixed `console.log` calls in development mode for every request/response and every error. Useful during local development but needs to be stripped or leveled before a polished demo.

## Encounter action hooks (v1alpha2)

One file per RPC, each a thin wrapper returning `{ data/action-fn, loading, error }` and calling `encounterClient` directly. Renamed off their `V2` suffix in slice 3 (the v1alpha1 hooks of the same base name they used to coexist with are deleted):

- `useMoveEntity`, `useEndTurn`, `useInteract`, `useTakeAction`, `useSubmitCheck`, `useActivateFeature`
- `useSetReactionReady` (Wave 2.11d)

Each has direct vitest coverage (`*.test.ts` alongside the hook).

## Lobby hooks (v1alpha1 lobby package)

`useCreateLobby`, `useJoinLobby`, `useSetLobbyReady`, `useStartLobbyEncounter` wrap the `LobbyService` unary RPCs; `useLobbyStream` + `lobbyStreamDispatch.ts` mirror `useEncounterStream`'s pattern for `StreamLobby` (snapshot-then-deltas, shared reconnect config, no envelope — the lobby has no causation chain to reassemble). See [game-view.md](game-view.md#lobbyflow--party-assembly).

## Other hook files (untouched by the game-screen rebuild)

`characterHooks.ts`, `diceHooks.ts`, `equipmentHooks.ts`, `hooks.ts` — character CRUD, dice rolling, equipment, and draft hooks for the character creation/sheet subsystem. Not in scope for the encounter/lobby rebuild.

## No tests on client.ts itself

The transport/interceptor setup in `client.ts` has no direct test coverage. Error paths (network failure, auth rejection, invalid state) are exercised manually and via the action hooks' own tests, not `client.ts` in isolation.
