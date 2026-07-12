---
name: useEncounterStream
description: The only real-time event delivery path — v1alpha2 StreamEncounter, load-bearing for every game route and the playtest harness
updated: 2026-07-12
confidence: high — verified by reading useEncounterStream.ts and encounterStreamDispatch.ts in full
---

# useEncounterStream

`src/api/useEncounterStream.ts` (renamed from `useEncounterStream2` in
slice 3, rpg-dnd5e-web#447 — the v1alpha1 `useEncounterStream` it used to
coexist with is deleted, so this is now the only hook with the name).
Subscribes to the v1alpha2 `StreamEncounter` gRPC server-streaming RPC via
Connect RPC (`encounterClient` in `src/api/client.ts`). This is the single
real-time event delivery path for both `EncounterView` (the live game) and
`PlaytestHarness` (the permanent verification surface) — they share this
one hook, which is what makes MCP playtest verification a proof of the
game path.

## Lifecycle

```
1. encounterId set               → open stream, state='connecting'
2. First message MUST be SnapshotDelivered → state='connected', dispatch fires
3. Subsequent events              → dispatched via dispatchEncounterStreamEvent
4. Stream end / error             → state='disconnected' → exponential backoff reconnect
```

Unlike the deleted v1alpha1 hook, there is no separate load-then-stream
sync step (no `GetEncounterState` snapshot RPC, no event buffer). The
stream's own first message — `SnapshotDelivered` — is the sync barrier.

## Reconnect

Exponential backoff via the shared `RECONNECT_CONFIG` in
`streamReconnect.ts` (1s initial, 2x multiplier, 30s cap, 10 max
attempts — ~5 minute total window). `useLobbyStream` shares the same
config, single source of truth for both stream hooks.

## Mount-churn resilience (#442)

A mount can tear its effect down and set it back up again in quick
succession (React StrictMode's dev double-invoke is the common trigger,
but any deps-driven re-run shapes the same race). Each `connect()`
attempt is tagged with a `generationRef` value at the moment it starts;
every side effect it performs (state updates, scheduling a reconnect,
touching the shared refs) is gated on still being the current generation.
"Was this abort mine" is decided from the attempt's own locally captured
`AbortController`, never the shared ref — this is what keeps a stale
attempt's belated rejection from silently no-op'ing a live connection
_or_ re-arming its own zombie reconnect that clobbers it.

## Event dispatch

`dispatchEncounterStreamEvent` (`src/api/encounterStreamDispatch.ts`) is a
pure switch over `event.event.case` — one optional callback per event
type in `EncounterStreamOptions`. It handles reveals (`GeometryRevealed`),
entity appear/disappear/damage/status, door state, mode/turn changes, the
TakeAction-wave `TurnStateChanged` menu push, death/removal/encounter-end,
and stream-delivered prompts. `useEncounterState`'s reducers are the
typical callback targets — see [use-encounter-state.md](use-encounter-state.md).

## No tests on the hook itself

`useEncounterStream.ts` has no direct vitest coverage of the live gRPC
loop (mocking an `AsyncIterable` stream end-to-end is high-effort for
marginal value over MCP playtest verification, which exercises the real
path). `encounterStreamDispatch.ts`'s pure dispatch switch is tested
directly (`encounterStreamDispatch.test.ts`), and `fakeEncounterStream.ts`
provides a test double other suites (`EncounterView.test.tsx`,
`PlaytestHarness.test.tsx`) use to drive component-level assertions
without a real stream.
