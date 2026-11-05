# 2026-11-03 · The guard holds the gate S1 · The web walks into him

processed: 2026-11-05T201556Z

Story [rpg-project#836](https://github.com/KirkDiggler/rpg-project/issues/836), slice [rpg-project#841](https://github.com/KirkDiggler/rpg-project/issues/841), plan Task 4, requirement P1. Web PR [rpg-dnd5e-web#1385](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1385). No protos change. It relies on the server refusing a step at a blocking body with a stop reason, which exists today.

## Shipped

- `indexOccupantPassages` returns `walkInto`: the seen cells whose passage is `BLOCKED` and whose `Sighting.stance` is `neutral` or `allied`.
- `buildAtlasPathIndex` takes it as `walkIntoCells`, kept to a subset of the occupied cells.
- `findAtlasPath` plans round every blocking body first, as before. A second plan walks into a `walkInto` body only when the first finds no route, the goal is not a body's cell, and the first search was refused an edge into a `walkInto` cell.
- The server stops the walk at his cell and the walk shows its stop reason through the existing `stopReason` path.

## Decided

- **The second plan fails closed on stance.** Only `neutral` or `allied` is walked into. A body believed hostile, or one with no stance word from the server, stays blocked on both plans. The second plan is an exception, and the web never steers the player into a body it cannot name.
- **Allied counts as walk-into.** A blocking ally in the only way gets the same bump as a neutral guard.
- **A shared cell is refused.** A cell a neutral body shares with a hostile or unnamed blocking body is never walked into.
- **His cell as the goal has no plan.** A click on a body's cell stays the approach gesture (`findAtlasApproach`, reach 3), an operator choice this slice keeps. The design's first wording also let the goal leg plan into him. Then the hover previewed a path into him that the click never sent, so the goal leg was dropped and P1's wording is amended in the rpg-project Task 5 PR. The walk-into gesture is clicking past him when he fills the only way.
- **The approach walk is unchanged.**

## Found

- **An unreachable hover can now cost two full searches.** On a 30,276-cell open floor, the search for an unreachable goal took a median of 198 ms with one search and 390 ms with two, timed in vitest on the planner alone. The second search runs only when the first was refused an edge into a walk-into cell, so a site with no posted body, or a search that never reaches him, still costs one. A search that does reach him, such as a hover on a walled-off cell anywhere in the gate's component, pays twice. The single-search cost itself comes from `searchAtlas`'s linear scan of the open set. Both are filed against rpg-project#841 as findings, not fixed here.

- **On the castle, the walk into `gate-1` comes after the gate door opens.** His post is the cell beneath the gate, and the only way on from it is the gate door. While the door is shut, a click on the courtyard plans nothing. The party opens the door from beside the crossing, the walk skill's step 5 (rpg-project#843). Then the courtyard is reachable only through him, and the second plan walks into him. A test models the open and the shut door. No planner change was needed.

## Mistaken

- The first head planned into his cell as the goal. The hover drew a path into him, but a click on his cell runs the approach, so the preview promised a walk that was never sent. Review caught it.
- In zsh a `$T` holding two test paths is one word, so a first round of mutant runs ran no test files. The mutants were rerun with literal paths.

— cross-team agent, on behalf of KirkDiggler
