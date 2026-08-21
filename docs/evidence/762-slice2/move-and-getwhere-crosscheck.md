# Slice 2 live verification — click-to-walk crosses a doorway, GetWhere agrees

Captured against the local stack (envoy :8080, rpg-api container, redis
:6380) via `?playerId=toolkit-sandbox-fighter`, screenshots 00–06 in this
directory. Raw console RPC logs (`🔵 Request:` / `🟢 Response:` from
`client.ts`'s `loggingInterceptor`) were captured during the run but are
not committed (multi-MB, mostly repeated 224-cell atlas dumps); the
relevant entries are excerpted below.

## Walk 1 — several hexes away, across the first doorway

Local player's character id: `char_b7e78f24-6e9c-4f58-a4f3-e566ce2d8d40`.
Session: `b7c8c5bd-30d9-4d20-92fb-e894e93adcce`.

Starting `GetWhere` (after `StartEncounter`, screenshot `03`):

```json
{ "x": 0, "y": 3 }
```

Click at screen (1300, 780) → `useSessionWalk.walkTo` ran `findAtlasPath`
and dispatched:

```
Move({
  session: "b7c8c5bd-...",
  member:  "char_b7e78f24-...",
  path: [
    { x: 1, y: 3 },
    { x: 2, y: 3 },
    { x: 3, y: 3 },
    { x: 3, y: 4 },   // <- entrance side of the doorway
    { x: 4, y: 4 },   // <- middle-chamber side of the doorway
    { x: 5, y: 3 }
  ]
})
```

The requested route steps DOWN a row to (3,4)/(4,4) specifically to use
the declared doorway (`reference-tomb:entrance-hall`, connecting exactly
those two cells — see `atlasWallRuns.test.ts`'s fixture) rather than
cutting straight across row 3, where the seam boundary blocks movement.
This is `atlasPath.ts`'s A* doing its job: the direct (x,3)→(x+1,3) hop at
the seam is not passable, and the doorway is the only crossing.

`MoveResponse` (screenshots `04` mid-walk / `05` after, "Walking…"
indicator visible in `04` and gone by `05`):

```json
{
  "steps": [
    { "seq": "6",  "position": { "x": 1, "y": 3 } },
    { "seq": "7",  "position": { "x": 2, "y": 3 } },
    { "seq": "8",  "position": { "x": 3, "y": 3 } },
    { "seq": "9",  "position": { "x": 3, "y": 4 } },
    { "seq": "10", "position": { "x": 4, "y": 4 } },
    { "seq": "11", "position": { "x": 5, "y": 3 } }
  ]
}
```

All 6 requested cells were walked (a full, unrefused walk). Once
`HexEntity`'s animation finished painting those steps,
`onWalkAnimationComplete` fired and `useSessionWalk` awaited a fresh
`GetWhere` before releasing `busy` (the "Walking…" text clearing in
screenshot `05`):

```json
{ "x": 5, "y": 3 }
```

**Cross-check: the client's displayed position (last `MoveResponse` step)
and the server's own `GetWhere` answer are identical — `(5, 3)`.**

Re-run twice (fresh lobby/session each time, redis cleared between runs)
with identical results both times.

## Walk 2 — unreachable/off-floor click

Screenshot `06`: clicked screen (50, 850) — verified `#0a0a0a` (the
route's background color) in every prior frame regardless of where the
camera's continuous player-follow had moved the framing, i.e.
guaranteed off the floor mask. `useHexInteraction`'s own floor-membership
gate (`isValidHex`) rejects the raycast before `onHexClick`/`walkTo` is
even called — zero new RPC calls were dispatched (checked against the
full console log), the character did not move, and no console page error
was raised.

## What this confirms against issue #762 slice 2's done criteria

- Click a floor cell several hexes away, in another room → the character
  walks there, driven entirely by the server's `MoveResponse.steps` (not
  the client's own guess), passing through the doorway rather than the
  wall.
- The client's displayed resting position, after the walk animation
  finishes, equals a fresh `GetWhere`.
- Click an unreachable/off-floor cell → nothing moves, no RPC, no crash.
- The busy ("Walking…") indicator shows for the whole RPC + animation +
  reconcile window and clears only once `GetWhere` has been re-fetched.
- The camera follows the player continuously through the walk (visible
  across screenshots `03`→`06`, unlike slice 1's frozen camera).
