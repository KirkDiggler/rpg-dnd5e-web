# Live verification: snapshot statusEffects hydration (#462)

Driven via Chrome DevTools MCP against a real `rpg-api` server (`main`,
already carrying rpg-api#655's Entity.status_effects projection — verified
independently in the wave's closing playtest, see
`rpg-api/playtest-evidence-reconnect/bug-badge-never-hydrates.txt`) and this
branch's web build (`char-bob`, a devseed-fixture Barbarian with the Rage
feature).

## Sequence

1. `?playerId=bob` resumed straight into bob's already-running encounter via
   `GetMyActiveLobby` (rpg-dnd5e-web#444/#461) — confirmed via
   `grpcurl GetMyActiveLobby` returning `lobbyStatus: LOBBY_STATUS_STARTED`
   with the live `encounterId`.
2. Used `devseed --inject-combat --encounter-id <id>` to flip the encounter
   to `TURN_BASED` or (goblins were already present from an earlier run in
   this session).
3. Activated Rage via a direct `ActivateFeature` gRPC call
   (`feature_ref: {module: dnd5e, type: features, id: rage}`).
4. **I viewed this frame** (screenshot taken, not saved — visually
   identical in layout to the saved frame below): the live view showed
   `🔥 Raging` in the header immediately, via the existing `onStatusApplied`
   live-event path (pre-existing, unaffected by this fix) — combat log:
   `R0 🔥 char-bob is Raging (from char-bob)`.
5. **Reloaded the browser tab** (`navigate_page`, `type: reload` — a real
   full page reload, fresh `StreamEncounter` connection).
6. **I viewed this frame**: `🔥 Raging` badge present immediately after
   reload — mode correctly resynced to `TURN_BASED`, round 1, initiative
   order shown, `active: char-bob`. No live `StatusApplied` event could
   have produced this on a fresh connection; it can only have come from
   the snapshot.
7. Took a `Dodge` action (bonus economy untouched, action economy spent) to
   match the evidence file's exact original repro shape (two conditions
   active at once): header updated to `🔥 Raging, 🏃 Dodging`.
8. **Reloaded again.**
9. **I viewed this frame** (`docs/evidence/badge-hydration-survives-refresh-462.png`):
   both badges — `🔥 Raging, 🏃 Dodging` — present after the second reload,
   action economy correctly showing `Action: 0` (spent) alongside the
   restored badges, proving multi-condition snapshot hydration (not just a
   single-condition happy path) and that the fix survives a SECOND
   reconnect on top of the first, not just a one-shot fluke.
10. Confirmed via the network panel on the final reload: request sequence
    was `GetMyActiveLobby` → `StreamEncounter` only — no `ActivateFeature`
    or `TakeAction` calls on this page load, ruling out any possibility the
    badges came from a live re-execution rather than the snapshot.
11. Cross-checked the raw wire directly with `grpcurl GetEncounter` against
    the running server (bypassing the web client entirely, same technique
    the original bug report used): char-bob's `statusEffects` on the
    server correctly lists both `raging` and `dodging` — server-side
    correctness (rpg-api#655) was never in question; this closes the loop
    on the client-side consumer that was missing.

## Screenshot

`badge-hydration-survives-refresh-462.png` — both condition badges visible
immediately after a second full page reload, sourced entirely from the
snapshot. I viewed this frame directly.

## Secondary edge from the issue: DurationRounds display difference

The issue's verify section asks whether a reconnected badge differs from a
live one in duration display. It does not, in either direction: the local
`EntityStatus` type (`src/hooks/useEncounterState.ts`) never carried a
`durationRounds` field at all, even on the live `applyStatusApplied` path —
`formatStatusBadges` only ever reads `source.id` for the icon/label. So
there is no visible difference between a live-applied and a
snapshot-hydrated badge; duration was never rendered by either path. Not a
regression introduced by this fix — the same true before and after.
