# Slice 2 live verification — click-to-walk crosses a doorway, GetWhere agrees

Captured against the local stack (envoy :8080, rpg-api container, redis
:6380) via `?playerId=toolkit-sandbox-fighter`. Reproduced three times
(fresh lobby/session, redis cleared between runs) with identical results.

## A real bug found and fixed during review

The first evidence pass (screenshots `04-mid-walk`/`05-after-walk`, since
replaced) showed the character at the same position with only the
"Walking…" label differing — a fair catch. Investigating with a tight
screenshot burst plus live Three.js camera instrumentation found the
actual cause: `SessionEncounterView`'s `MOVED`-stream-event handler calls
`refetchWhere()`, which sets `useSessionWhere`'s `loading` true for the
round trip. The top-level `content` switch gated on the bare `loading`
flag, so **every such refetch unmounted `SessionCanvas`** — including the
in-progress walk animation's internal refs and the camera's frozen seed —
then remounted it once the fetch resolved ~50ms later. Since a `MOVED`
event for the local player's own move arrives almost immediately after
the `Move` RPC resolves (well before the ~2.7s client-side walk animation
finishes), this fired on *every* walk, restarting the animation from
scratch mid-flight and re-seeding the camera at whatever position had
already been jumped to.

Fixed in `SessionEncounterView.tsx`: the canvas now stays mounted once
it's been shown successfully — a background refetch (in flight, or even
one that fails and clears `wherePosition`/`atlas` to null) no longer tears
it down; the last known-good scene/position are held in refs for exactly
that case. Two new regression tests in `SessionEncounterView.test.tsx`
assert the canvas's own DOM node identity survives both cases. All
existing tests (including the "character fetch failed on the very first
load still shows the error card" case) still pass unchanged.

## Question 1 — does the model actually travel cell by cell?

Yes, confirmed both by the returned `MoveResponse.steps` and by a 12-frame
screenshot burst at 200ms intervals starting the instant of the click
(`walk-frames-01.png` through `walk-frames-12.png`, this directory).
Selected frames:

| Frame (ms after click) | What it shows |
|---|---|
| `walk-frames-02.png` (400ms) | Character still well inside the entrance chamber, clearly short of the doorway. |
| `walk-frames-04.png` (800ms) | Character at the doorway threshold. |
| `walk-frames-08.png` (1600ms) | Character through the doorway, standing in the middle chamber. |
| `walk-frames-12.png` (2400ms) | Character settled at its final resting cell. |

The model visibly progresses hex-by-hex through these frames — it does
not snap. (The earlier black frames from the pre-fix run, where the
unmount briefly dropped the whole `<Canvas>` to its WebGL clear color, are
gone in this run — zero blank/black frames across all 12.)

## Question 2 — is the camera actually following?

Yes. Verified by instrumenting the live `useCameraControls` hook (temporary,
removed before commit) to log the actual `camera.position`/`matrixWorld`
on the real Three.js camera object each frame, cross-referenced against
screenshots taken at the same instants. The camera's `target` genuinely
lerps from the entrance-chamber seed toward the destination's world
position, converging within roughly 300–500ms of the `Move` RPC resolving
— fast relative to the walk's own ~2.7s animation duration, so the camera
finishes settling on the destination well before the character arrives on
foot, then holds still while the character walks the rest of the way into
an already-framed shot. This is not a bug: it's the same `focusTarget`
pattern `HexGrid.tsx` already uses for the old route (`focusTarget` there
is likewise computed from the entity's stored/final position, not a
live-interpolated one) — slice 2 reuses that exact convention rather than
inventing a different one. The earlier "camera never moves" read was a
side effect of the remount bug above: every remount re-seeded the frozen
base target directly at the (already-jumped-to) destination, so there was
nothing left to lerp — the fix restores the intended lerp-then-settle
behavior.

A deliberately slower, continuously-interpolated follow (camera tracking
the character's live animated position for the whole walk, rather than
pre-framing the destination) would be a reasonable follow-up for a much
longer walk (e.g. clear across the full ~28-wide tomb, where 300–500ms of
lerp could leave the character off-screen at the start) — flagged here as
a design note, not implemented, since it would extend `HexGrid.tsx`'s own
established camera-follow convention rather than just reusing it, and
today's walk distances don't need it.

## Question 3 — which room is (5,3) in, and which seam is pictured?

**(5,3) is in the middle chamber** — the far side of the *first* seam from
the entrance, crossed via the doorway connection
`reference-tomb:entrance-hall` (joining (3,4) and (4,4), per the real
atlas capture also used in `atlasWallRuns.test.ts`'s fixture). Checked two
ways:

- The requested/returned path steps down to row 4 specifically at (3,4)→
  (4,4) — the only place a boundary is crossable in that seam — then back
  up to (5,3) at row 3.
- By this codebase's own chamber-membership rule (`atlasWallRuns.ts`'s
  `authoredCol`/`chamberComponents`: a doorway is a chamber SEPARATOR, not
  a merge, even though a member can walk through it): `authoredCol` of the
  start (0,3) is column 1 (inside the entrance chamber's authored columns
  0–5); `authoredCol` of (5,3) is column 6 — the first column of the
  middle chamber (authored columns 6–15, the "10 wide" chamber per
  `atlasWallRuns.test.ts`'s own doc comment).

The wall pictured in every `walk-frames-*`/`05-after-walk` screenshot is
therefore the **entrance↔middle seam** (seam 1 of 2) — the same one the
requested path's (3,4)→(4,4) step crosses.

## Full RPC trace for the walk

Local player's character id: `char_b7e78f24-6e9c-4f58-a4f3-e566ce2d8d40`.
Session: `f54016db-8613-...` (fresh per run; id differs run to run, cells/
doorways don't).

Starting `GetWhere`:

```json
{ "x": 0, "y": 3 }
```

Click at screen (1300, 780) →

```
Move({
  path: [
    { x: 1, y: 3 }, { x: 2, y: 3 }, { x: 3, y: 3 },
    { x: 3, y: 4 },   // entrance side of the doorway
    { x: 4, y: 4 },   // middle-chamber side of the doorway
    { x: 5, y: 3 }
  ]
})
```

`MoveResponse.steps` walked all 6 requested cells in full, ending at
`(5, 3)`. Once the walk animation finished (screenshot `05-after-walk`,
"Walking…" indicator gone), a fresh `GetWhere` returned:

```json
{ "x": 5, "y": 3 }
```

**Cross-check: the client's displayed resting position (the last
`MoveResponse` step) and the server's own fresh `GetWhere` answer are
identical — `(5, 3)`.**

## Unreachable/off-floor click

Screenshot `06-after-invalid-click.png`: clicked screen (50, 850) —
verified `#0a0a0a` (the route's background color) in every prior frame
regardless of where the camera's follow-target had moved. `zero` new RPC
calls were dispatched (`invalid-click-new-rpc-entries.json` is `[]`), the
character did not move, and no console page error was raised across any
of the three runs (`rpc-log-*.json` each show 0 `PAGEERROR` entries).

## What this confirms against issue #762 slice 2's done criteria

- Click a floor cell several hexes away, in another room → the character
  walks there cell by cell, driven entirely by the server's
  `MoveResponse.steps`, passing through the doorway rather than the wall.
- The client's displayed resting position, after the walk animation
  finishes, equals a fresh `GetWhere`.
- Click an unreachable/off-floor cell → nothing moves, no RPC, no crash.
- The busy ("Walking…") indicator shows for the whole RPC + animation +
  reconcile window and clears only once `GetWhere` has been re-fetched.
- The camera follows the player (verified via direct Three.js state
  instrumentation, not just screenshots) and no longer glitches on a
  background `MOVED`-triggered refetch mid-walk.
