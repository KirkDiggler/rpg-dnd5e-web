# 2026-11-04 · The guard holds the gate S1b · A held door plans shut

processed: 2026-11-05T201556Z

Story [rpg-project#836](https://github.com/KirkDiggler/rpg-project/issues/836), slice [rpg-project#852](https://github.com/KirkDiggler/rpg-project/issues/852), [plan Task 15](https://github.com/KirkDiggler/rpg-project/blob/main/ideas/the-guard-holds-the-gate/plan.md#task-15-s1b-the-web-plans-a-held-opening-as-shut), requirement H6 under [ruling R5](https://github.com/KirkDiggler/rpg-project/blob/main/ideas/the-guard-holds-the-gate/design.md). Web PR [rpg-dnd5e-web#1388](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1388). Protos pinned at [rpg-api-protos v0.1.254](https://github.com/KirkDiggler/rpg-api-protos/releases/tag/v0.1.254), generated commit `ec982ff3`: `AtlasDoorway.crossing` and `Sighting.holds_door`. Built against the protos while the server tasks (encounter T11, session T12, api T14) were built in parallel.

## Shipped

- `sightingsToEntities` carries `Sighting.holds_door` verbatim as `holdsDoor` — [PR](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1388).
- `indexOccupantPassages` returns `heldDoors`, the door ids a live sighting holds, and `walkIntoHeldDoors`, the ones every holder of which is believed neutral or allied. A memory holds nothing — [occupantPassages.ts](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/564f33bb875a2b03516f3f4d65069206f3dc8afa/src/components/session/occupantPassages.ts).
- `buildAtlasPathIndex` takes both and marks every doorway of a held door, an edge door's edge or a footprint door's crossing, as a held edge. The first plan treats a held edge as shut — [atlasPath.ts](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/564f33bb875a2b03516f3f4d65069206f3dc8afa/src/components/session/atlasPath.ts).
- `findAtlasPath`'s second plan still runs only when no route round exists. It also crosses a held edge whose holders are all neutral or allied. A search refused at such an edge counts as meeting a walk-into, so the second plan can run — [atlasPath.ts](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/564f33bb875a2b03516f3f4d65069206f3dc8afa/src/components/session/atlasPath.ts).
- `segmentsToWallRuns` skips a doorway marked `crossing`: no wall cut, no gap, no leaf. Every renderer and the door targets read its `doorGaps`, so the skip covers `AtlasWalls`, the door markers in `SessionEncounterView` and the dice colliders. Fog keeps reading every doorway from the atlas — [atlasWallRuns.ts](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/564f33bb875a2b03516f3f4d65069206f3dc8afa/src/components/session/atlasWallRuns.ts).

## Decided

- **The second plan crosses a held opening when nothing goes round.** The plan's Interfaces line says so: the server stops the walk at the opening and names him, as it stops a walk into a body. The lead's brief said "shut on both plans"; the plan is the contract and was followed — [plan Task 15](https://github.com/KirkDiggler/rpg-project/blob/main/ideas/the-guard-holds-the-gate/plan.md#task-15-s1b-the-web-plans-a-held-opening-as-shut).
- **A held opening fails closed on stance, as a body does.** A door held by a body believed hostile, or one with no stance word, stays shut on both plans. A door held by a neutral and a hostile body together stays shut — [the S1 web record](2026-11-03-the-guard-holds-the-gate-s1-web.md).
- **A door shut by its own state stays shut on both plans**, held or not — [atlasPath.ts](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/564f33bb875a2b03516f3f4d65069206f3dc8afa/src/components/session/atlasPath.ts).
- **The hold lives in its own set, not in `shutDoorEdges`.** The plan's Files line says to add held edges to `shutDoorEdges`, but that set never opens on the second plan, and the Interfaces line says the second plan crosses a held door — [review](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1388).
- **A shut footprint door now plans shut.** This is new behaviour: before T11 its crossings were not doorways, so the planner never consulted its state — [design R5](https://github.com/KirkDiggler/rpg-project/blob/main/ideas/the-guard-holds-the-gate/design.md).
- **The concept tomb's doorway diagram is unchanged.** It draws the movement graph, so it shows crossings too — [atlas.ts](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/564f33bb875a2b03516f3f4d65069206f3dc8afa/src/concepts/session-tomb/atlas.ts).

## Found

- **A revealed door's doorways do not merge from the act.** `applyConcealmentRevealed` merges structural records only, and the doorways reach the atlas through the GetAtlas refresh. The test proves the act bridge keeps `crossing` and that an atlas holding those rows draws no gap. The room reveal does merge its doorways, and its test runs through `applyCellsRevealed`. The bridge's stale comment is corrected — [applyReveal.ts](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/564f33bb875a2b03516f3f4d65069206f3dc8afa/src/components/session/applyReveal.ts).
- **A footprint door must have a `DoorInfo` row.** With a door map in hand the planner refuses a doorway whose door is missing from it. If GetDoors leaves out a footprint door, its crossings plan shut. That is the server's half: T14 should pin that GetDoors lists the castle gate with its state — [review](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1388).
- **A heard-only holder's hold is ignored.** The web reads a sighting without `sight` in `currentVia` as a memory, which is stricter than the proto's "`current_via` empty". A guard the viewer only hears has his hold ignored, so the preview plans through the gate, and the server still stops the walk. Passage follows the same rule today; aligning both is a follow-up — [sightingEntities.ts](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/564f33bb875a2b03516f3f4d65069206f3dc8afa/src/components/session/sightingEntities.ts).

## Mistaken

- **The first fixture let a mutant through.** The guard was posted next to the outside route, so a search touching his cell started the second plan on its own. Removing the held-edge trigger changed nothing, and the test still passed. The fixture now posts him inside the courtyard, out of every outside search, and the mutant fails — [atlasPath.test.ts](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/564f33bb875a2b03516f3f4d65069206f3dc8afa/src/components/session/atlasPath.test.ts).
- **One test pinned collection sizes.** The held, shut and blocked edge sets were checked by count, so a wrong pair of the same count would pass. They are now checked as exact sets — [review thread](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1388).

— cross-team agent, on behalf of KirkDiggler
