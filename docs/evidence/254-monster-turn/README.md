# Live gate — the monster's driven turn (rpg-project#254)

**Date:** 2026-08-23. **Environment:** rpg-api PR #817 (session v0.21.9),
healthy on :50051 via envoy on :8080, reseeded, lobby cleared for
`toolkit-sandbox-fighter`; web from this worktree (`feat/254-monster-turn`,
43472a8) on `:3003`. Driven headlessly via a persistent CDP-attached
`google-chrome --headless=new` and a React-fiber walk for movement/attack
clicks (`SessionCanvas.onHexClick`/`onEntityClick`, same technique this
repo's own dev notes use — skips only the raycast, everything downstream
is real).

## What ran, in order

1. **Lobby → Ready → Start** (`01-lobby-character-select.png`,
   `02-lobby-created.png`). The known, pre-existing `ListDungeons
   unimplemented` gap surfaced again (rpg-project#131) — Start still works
   past it, same as every prior evidence pass on this route.
2. **Free roam in the tomb** (`03-free-roam-tomb.png`) — the large diamond
   chamber, `toolkit-sandbox-fighter` standing near the entrance.
3. **Walked the entrance corridor.** The corridor is the straight
   cube-coordinate line `z=3` running from the start cell outward; cube
   distance 11 from start is exactly where team-lead's own note said the
   fight would form under 120ft sight, confirmed live: at distance 13 the
   walk triggered `FightStarted` mid-path and the server capped the
   player's remaining move for the turn.
4. **Fight begins, Round 1** (`04-fight-begins-round1.png`) — "A fight
   begins: You, skeleton-1, skeleton-2." Two skeletons sighted at once;
   `skeleton-2` sits behind a wall with no line of sight (see design
   rpg-project#252 §5's own fixture) and never moves for the rest of the
   walk.
5. **End Turn → skeleton-1's driven turn, paced** — this is the PR's own
   deliverable, confirmed beat-for-beat:
   - `05-skeleton-turn-announced.png` — "Skeleton's turn." (the queue's
     `announce` step, before any of its beats are consumed).
   - `06-skeleton-misses-adjacent.png` — "Skeleton misses you — 13 vs AC
     14." The skeleton is ALREADY standing adjacent to the player in this
     frame — its six `moved` beats (confirmed server-side, see the story
     log below: seq12-17, one cell per beat) each refetched `GetView` as
     the queue processed them, landing the entity exactly where the
     server said before its `struck`/`missed` beat rendered.
   - `07-round2-hud-flipped-to-player.png` — `skeleton-2`'s own turn
     closes with "Skeleton does nothing." (no line of sight — the design's
     own fixture case, reproduced live), then the panel flips: Round 2,
     "Toolkit Sandbox Fighter (you)" active, `skeleton-1` highlighted as
     an in-reach Attack target.
6. **Player's own attack, for a same-format comparison**
   (`08-player-attack-same-beat-format.png`) — "You hit Skeleton — 22 vs
   AC 13, 8 bludgeoning." Same `formatBeat` the monster's own line uses;
   confirms rpg-project#254's "HUD" bullet (a monster's struck/missed
   reads exactly like the player's own) end to end, live.

**This satisfies the brief's four asks in full**: the skeleton's turn
announced, the per-cell moved beats landing it adjacent, its struck/missed
line, and the HUD flipping back to the player — all captured live against
the real backend, all matching the unit/integration test suite's own
expectations exactly.

## A real anomaly found in rounds 2+ — reported, not fixed here

Continuing the walk past Round 2 (player attacks again, End Turn again)
surfaced two more things, both server-side:

**1. Skeleton-1's OWN subsequent hits go undisplayed.** The story log
(`story-log-decoded.txt`, read straight from redis —
`session-enc:v1alpha1:aa648551-...`) proves the server correctly recorded
and addressed to the player TWO more `struck` events for skeleton-1 in
rounds 2 and 3 (seq23: 7 piercing damage; seq27: 3 piercing damage — both
`audience` include the player's own character id). Live, the panel never
showed either — it went straight from "Skeleton's turn." to "Skeleton does
nothing." both times (`09-round4-anomaly-skeleton1-not-narrated.png` is
the resting state after one such round: skeleton-1 still alive, adjacent,
attackable, HP down to 5/13 from the player's own hit — consistent with
having taken damage, contradicting "does nothing").

I do not believe this is a client bug in this PR. Reproduced the EXACT
event sequence from the story log (`struck(skeleton-1→char)` then
`turnEnded(skeleton-1→skeleton-2)` then `turnEnded(skeleton-2→char)`,
fed straight into `SessionEncounterView` through the same mocked-stream
harness `SessionEncounterView.test.tsx` already uses) in an isolated test,
twice — once cold, once preceded by a full round 1 plus a self
attack+End Turn exactly like the live walk — and BOTH times the panel
narrated correctly: "skeleton-1's turn." → "skeleton-1 hits you — 21 vs AC
14, 7 piercing." → "skeleton-2's turn." → "skeleton-2 does nothing." Given
the same client code handles the identical event shape correctly in
isolation, the discrepancy has to be in what actually reached the stream
live — most likely the server not emitting (or not flushing) the
already-logged `struck` event to THIS client's `StreamEvents` connection,
not a client-side pacing/ordering bug. (These reproduction tests were
throwaway diagnostics, not committed — the shipped test suite already
covers the correct-input case via `SessionEncounterView.test.tsx`'s own
"driven turn narrates moved x N then a swing" test.)

**2. A later `EndTurn` failed outright with a server-side internal
error**, caught live via the browser console:

```
ConnectError: [internal] endturn: end turn "char_62a835de-...":
drive monster turns "skeleton-1": end: end turn: clock is idle
```

This is `SessionService.EndTurn` itself returning `Internal` — the
player's own turn never advanced (Turn stayed on Round 4, active still the
player) because the server's internal call to end skeleton-1's OWN driven
turn hit an idle-clock state partway through the drive loop. Client-side
this degrades safely (the existing catch-and-reconcile in `useCombatPanel
.endTurn` swallows it and the panel just re-syncs to whatever the server
answers), but the player's End Turn silently did nothing that click.

Both are backend issues (session/toolkit turn-driving), out of this PR's
scope and not fixed here — reported to team-lead per the walk brief so
they can be filed against the right repo with this evidence.

## Files

- `01`–`09`: the screenshots above, in walk order.
- `story-log-decoded.txt`: the full decoded event log from redis for this
  encounter (`aa648551-60ed-4edd-b520-feee34665f52`), seq 1 through 29 —
  the hard evidence behind the anomaly above.
