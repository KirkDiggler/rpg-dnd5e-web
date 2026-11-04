# 2026-11-04 · The guard holds the gate S1b · A held door plans shut

Story [rpg-project#836](https://github.com/KirkDiggler/rpg-project/issues/836), slice [rpg-project#852](https://github.com/KirkDiggler/rpg-project/issues/852), plan Task 15, requirement H6 under ruling R5. Protos pinned at rpg-api-protos v0.1.254, generated commit `ec982ff3`: `AtlasDoorway.crossing` and `Sighting.holds_door`. Built against the protos while the server tasks (encounter T11, session T12, api T14) were built in parallel.

## Shipped

- `sightingsToEntities` carries `Sighting.holds_door` verbatim as `holdsDoor`.
- `indexOccupantPassages` returns `heldDoors`, the door ids a live sighting holds, and `walkIntoHeldDoors`, the ones every holder of which is believed neutral or allied. A memory holds nothing.
- `buildAtlasPathIndex` takes both and marks every doorway of a held door, an edge door's edge or a footprint door's crossing, as a held edge. The first plan treats a held edge as shut.
- `findAtlasPath`'s second plan, which still runs only when no route round exists, also crosses a held edge whose holders are all neutral or allied. A search refused at such an edge now counts as meeting a walk-into, so the second plan can run.
- `segmentsToWallRuns` skips a doorway marked `crossing`: no wall cut, no gap, no leaf. Every renderer and the door targets read its `doorGaps`, so the skip covers `AtlasWalls`, the door markers in `SessionEncounterView` and the dice colliders. Fog keeps reading every doorway from the atlas.

## Decided

- **The second plan crosses a held opening when nothing goes round.** Plan Task 15 says so: the server stops the walk at the opening and names him, as it stops a walk into a body. The lead's brief said "shut on both plans"; the plan is the contract and was followed.
- **A held opening fails closed on stance, as a body does.** A door held by a body believed hostile, or one with no stance word, stays shut on both plans. A door held by a neutral and a hostile body together stays shut.
- **A door shut by its own state stays shut on both plans**, held or not.
- **A shut footprint door now plans shut.** This is new behaviour: before T11 its crossings were not doorways, so the planner never consulted its state.
- **The concept tomb's doorway diagram is unchanged.** It draws the movement graph, so it shows crossings too.

## Found

- **A revealed door's doorways do not merge from the act.** `applyConcealmentRevealed` merges structural records only; the doorways reach the atlas through the GetAtlas refresh. The test proves the act bridge keeps `crossing` and that an atlas holding those rows draws no gap. The room reveal does merge its doorways, and its test runs through `applyCellsRevealed`.
- **A footprint door must have a `DoorInfo` row.** With a door map in hand the planner refuses a doorway whose door is missing from it. If GetDoors leaves out a footprint door, its crossings plan shut. That is the server's half, under T11 and T14.
- **A first mutant survived.** With the guard posted next to the outside route, his own cell started the second plan, so removing the held-edge trigger changed nothing. The fixture now posts him inside the courtyard, and the mutant fails.

— cross-team agent, on behalf of KirkDiggler
