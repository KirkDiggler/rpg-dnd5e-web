# 2026-11-07 · Alive, not lagging S1 · The own walk continues from the stream

processed: 2026-11-12T165555Z

Story [rpg-project#879](https://github.com/KirkDiggler/rpg-project/issues/879), slice [rpg-project#890](https://github.com/KirkDiggler/rpg-project/issues/890), PR [#1399](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1399). Protos pinned at [rpg-api-protos v0.1.260](https://github.com/KirkDiggler/rpg-api-protos/releases/tag/v0.1.260), generated commit `d83fdfa5`: `MoveResponse.continues = 10`, `MoveResponse.through = 11`, `MOVEMENT_STATUS_CONTINUING = 4`. Built while the session continuation and the api runner were built in parallel.

## Shipped

- **The answer's steps start the walk at once, and the rest continues from the stream.** When a Move answers with `continues`, the member's own walk acts after `through` extend the same journey. When it does not, own walk acts stay ignored, as before — [moveController.ts](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/dev/src/components/session/moveController.ts).
- **A continuation is per-member state with one writer per Move event.** `moveDispatched` opens a hold window, `moveAnswered` replaces the continuation and replays what was held, and `moveFailed` drops it. `continuedWalk` decides each own act — [moveController.ts](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/dev/src/components/session/moveController.ts), [useMoveController.ts](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/dev/src/components/session/useMoveController.ts).
- **A continued route appends to the walk in flight.** `continueRoute` marks `continuedFrom`, and the path hook's `continueMove` appends the new cells instead of re-walking the route from its first cell. Each earlier sequence still reports painted where its own cells end — [useHexMovePath.ts](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/dev/src/components/hex-grid/useHexMovePath.ts).
- **Own acts that reach the client before the answer are held, not lost.** Those after `through` replay when the answer lands. The rest are dropped and remembered as an earlier journey's.

## Decided

- **`busy` is not held for the continuation.** It releases once the answer's own cells are painted and `GetWhere` reconciles. The server serialises verbs, so holding input on the client would make the player wait twice. A window guard stops a later painted report from releasing a newer Move — [useSessionWalk.ts](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/dev/src/components/session/useSessionWalk.ts).
- **Act ids are compared as strings.** That is the `Act.id` contract: an ordering key, compared as strings, never a counter.
- **The repeated prefix is trimmed by the longest match against the walked tail.** The first act past `through` can repeat the answer's cells, and a later segment restates its starting cell. One rule covers both.
- **A continuation binds to the first act it plays, and every replaced continuation's act is excluded.** A continuing answer with an empty `through` therefore cannot adopt the previous walk's queued acts. With an empty `through`, only the last act tag held during the Move can be its walk.

## Found

- **An act folds a segment from its first step but carries its last step's id.** A straddling segment holds answer cells under an id past `through` — toolkit `session/act.go` `actsAfter` and `act_family.go` `walkPiece`.
- **A new sequence made the path hook re-walk the route from its first cell.** Growing a route mid-walk had no append case before `continueMove`.
- **No code switches on `MovementStatus`.** `CONTINUING` needed no mapping. Only `stopReason` reaches the UI, and it is empty for a continuing answer.
- **The review's two Important findings were real.** A continuing answer with no steps adopted the previous journey's queued act, and an own act ahead of its answer was lost. Both are fixed, with tests. Nine mutants against the new guards are killed by named tests.

## Watch on the walk

- **A path that doubles back can be over-trimmed.** The longest-tail rule would drop genuine cells of a walk that revisits its own last cells. Atlas paths never revisit a cell, so a click cannot produce it today, and `where` still places the body.
- **Segments after the first start from rest.** The act cursor presents one walk at a time and waits for it to paint, so only the answer-to-first-act seam appends in flight. A long continued walk may show a one-frame stop or heading reset at later seams.
- **An empty `through` is best effort.** The session is to name the resume point even when the answer has no steps. Until then, a continuing answer with no steps relies on act exclusion.

— cross-team agent, on behalf of KirkDiggler
