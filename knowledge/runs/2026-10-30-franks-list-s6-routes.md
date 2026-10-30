# 2026-10-30 · Frank's list S6 · the studio offers a cell and a route on toward

processed: 2026-10-30T183312Z

Slice 6 of [rpg-project#714](https://github.com/KirkDiggler/rpg-project/issues/714), issue [rpg-project#720](https://github.com/KirkDiggler/rpg-project/issues/720), PR [rpg-dnd5e-web#1354](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1354).

## Shipped

- The row form offers "An authored cell (at)" and "A route (path)" beside the selector words on `toward`, picked on the Layout: one click for a cell, clicks append waypoints for a route, Done writes it as one edit · [#1354](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1354)
- A route's waypoints are chips with a wait in rounds and a facing (offered only beside a wait), moved and removed in place; a `use:` row's `with: { path }` and a bundle parameter's route default are edited and picked the same way · [#1354](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1354)
- The engine's refusals of a table or bundle row are said at the row in the engine's own sentence, and a refusal's jump opens the table and the row (R17) · [#1354](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1354)
- The read back names a route as its loop: "walks its loop by {q: -5, r: 8} (waits 1, faces ne), {q: -5, r: 10} (waits 1, faces se) and {q: -7, r: 10}" · [#1354](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1354)
- The castle fixture's route and march rows lose their "Hand edit" marks; the castle's routes rebuilt by the form download byte for byte (`routeEdits.test.ts`) · [#1354](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1354)

## Decided

- The form does not pre-judge a route: the same cell clicked twice is appended, and the engine's retrace refusal comes back through validate-only PutDungeon. The one shape the form never writes is a facing without a wait, because the web reader itself refuses it · [#1354](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1354)
- Facing offers the dialect's eight compass words (n, ne, e, se, s, sw, w, nw), not the six the issue listed: the engine's grammar accepts eight · [grammar.go](https://github.com/KirkDiggler/rpg-toolkit/blob/61bb0381/rulebooks/dnd5e/encounter/dungeonspec/grammar.go#L816-L818)

## Found

- A pick outlives the render that armed it: the studio fences commits made through a presentation older than the current view (`guardSnapshotIntent`), so Done must write through the row's latest commit (`useLatest` in `routePicking.ts`), not the closure captured when the pick was armed · [#1354](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1354)
- The engine names a root table row `tables.<id>.on.time[i]` or `tables.<id>.time[i]` and a bundle row `bundles.<id>.rows[i]`; the walk's retrace refusal was "this route retraces itself at {q: 3, r: -12}: a patrol walks a loop — add a waypoint so no leg crosses another" · [#1354](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1354)
- The web has no `dash` word yet, so a cell and a route are offered on `toward` only; the engine also walks `dash` to a place, and that arrives with the web's v5 reader · [rpg-project#725](https://github.com/KirkDiggler/rpg-project/issues/725)
- The studio cannot import the v5 `gate-walk.yaml` ("Could not import: Unsupported single-room source envelope."), so the walk used the web's own castle fixture · [rpg-project#725](https://github.com/KirkDiggler/rpg-project/issues/725)
- A validate-only preview with a key that belongs to another member of the world stops at the key and shows no grammar refusals; the walk used a fresh key to see the engine's sentence · [#1354](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1354)

## Mistaken

- The first cut committed the pick through the closure captured at arm time; the studio refused it silently and the row kept its old word. Caught on the walk, fixed with `useLatest` before review · [#1354](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1354)
