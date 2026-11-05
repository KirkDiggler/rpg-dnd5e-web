# 2026-11-02 · When things fire S1 · The web animates by kind

processed: 2026-11-05T201556Z

Story [rpg-project#825](https://github.com/KirkDiggler/rpg-project/issues/825), slice [rpg-project#828](https://github.com/KirkDiggler/rpg-project/issues/828), design R1 B. Web PR [rpg-dnd5e-web#1383](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1383), on protos v0.1.253 ([rpg-api-protos#415](https://github.com/KirkDiggler/rpg-api-protos/pull/415)) and api [rpg-api#1181](https://github.com/KirkDiggler/rpg-api/pull/1181).

## Shipped

- `MoveKind = 'own' | 'compelled' | 'displaced'` in `hex-grid/moveKind.ts`. `ArrivingWalk.kind`, `Movement.kind` and `HexEntity`'s `moveKind` replace `forced` ([#1383](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1383)).
- `walkMoveKind` reads the wire. `MOVE_KIND_UNSPECIFIED` falls back to the deprecated `forced`: true is displaced, else own.
- Displaced slides with no walk cycle and no turn (`WalkAnimationGate.displaced`). Own and compelled walk.
- A local member's walk is fed whenever its kind is not own. No Move answer carries a compelled or displaced route.

## Decided

- An own route calls `beginRoute` with two arguments, as before. Only a non-own route passes its kind.

## Found

- `useCombatStoryPacing.ts` also keyed the local member's walk on `forced`, so it now reads `walkMoveKind`. Without that, a viewer's compelled walk would be fed but never paced.
- `ClassCharacterModel` needed no change. It already takes `isDisplaced`.

## Mistaken

- The lint-staged `eslint --fix` removed an unused `eslint-disable` directive and left a whitespace-only line, which failed `prettier --check` on the first head. The line was deleted.

— cross-team agent, on behalf of KirkDiggler
