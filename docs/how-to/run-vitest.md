---
name: running vitest
description: How to run the test suite, understand coverage, and add new tests
updated: 2026-05-02
---

# Running vitest

## Run all tests

```bash
cd /home/kirk/personal/rpg-dnd5e-web
npm test
```

Tests run in ~1.5s (14 test files, 298 tests as of 2026-05-02).

## Run a single file

```bash
npm test -- src/hooks/useDungeonMap.test.ts
npm test -- src/utils/hexUtils.test.ts
```

## Watch mode

```bash
npm test -- --watch
```

## Verbose output

```bash
npm test -- --reporter=verbose
```

## Current test coverage

| Area                                             | Tests | Notes                                       |
| ------------------------------------------------ | ----- | ------------------------------------------- |
| `hexUtils.test.ts`                               | ~30   | BFS, A\*, cube coordinate math              |
| `useMovementRange.test.ts`                       | 22    | Movement range, boundary edges, pathfinding |
| `useDungeonMap.test.ts`                          | 20    | Room accumulation, wall dedup, entity merge |
| `useEncounterState.test.ts`                      | ~10   | Snapshot/delta                              |
| `characterMerge.test.ts`                         | —     | Character merge                             |
| `monsterTurnUtils.test.ts`                       | —     | Monster turn formatting                     |
| `entityHelpers.test.ts`                          | —     | Entity helper utilities                     |
| `featureConditionMapping.test.ts`                | —     | Feature→condition map                       |
| `conditionIcons.test.ts`, `featureIcons.test.ts` | —     | Icon mapping                                |
| `diceCalculations.test.ts`                       | —     | Dice math                                   |
| `conditionData.test.ts`, `featureData.test.ts`   | —     | Type guard tests                            |
| `useHexInteraction.test.ts`                      | —     | Hex pointer events                          |

**Not tested:** `useEncounterStream`, `LobbyView`, `BattleMapPanel`, `CombatPanel`, any gRPC hooks.

## Adding new tests

The `encounterStateTransforms.test.ts` on branch `test/room-reveal-transforms` (PR #378) is the best template. It shows:

- Testing pure functions with no React context required
- Building minimal proto fixtures using `create()` from `@bufbuild/protobuf`
- Structuring `describe` blocks by function name

For hooks that need a React context, use `renderHook` from `@testing-library/react`. For components, React Testing Library would work but no examples exist in the codebase yet.

## CI check (mandatory before push)

```bash
npm run ci-check
```

This runs: format check, lint, typecheck, build, and tests. All must pass. Never use `--no-verify`.
