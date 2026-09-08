---
name: integrating provider character appearances
description: Repeatable private-provider to Web workflow, worked through the eight-race Bard batch
updated: 2026-09-08
---

# Integrating provider character appearances

Use this sequence when approved character GLBs have merged in the private asset provider and the Web needs to select them. Provider publication, Web integration, and production release are separate events.

## Worked example: eight-race Bard

The authoritative batch is private provider PR [rpg-game-assets#184](https://github.com/KirkDiggler/rpg-game-assets/pull/184), merged as `37c13c68b6cfc87ad6684351f934b4ff1fd83515`. Its handoff is [`evidence/182-bard-appearances/consumer-handoff.md`](https://github.com/KirkDiggler/rpg-game-assets/blob/37c13c68b6cfc87ad6684351f934b4ff1fd83515/evidence/182-bard-appearances/consumer-handoff.md).

That handoff supplies eight exact `dnd5e:classes:bard` race pairs under `harness/models/synty/characters/race-class/`, rig `modular-fantasy-hero-v1` (63 joints), and clips `Idle_Relaxed` then `Walk_Forward`. The Tiefling's `02-a-tiefling-crimson` palette is an accepted authored variation, not a recoloring task.

### 1. Verify and sync the merged provider

Use a clean checkout at the merged authority. Never copy `.blend` files or commit the licensed GLBs to this public repository.

```bash
git -C /path/to/rpg-game-assets status --short
git -C /path/to/rpg-game-assets rev-parse HEAD
# expected for this example: 37c13c68b6cfc87ad6684351f934b4ff1fd83515

cd /path/to/rpg-dnd5e-web
RPG_GAME_ASSETS_PATH=/path/to/rpg-game-assets \
ASSETS_SYNC_SKIP_UPDATE=1 \
npm run assets:sync
```

`assets:sync` verifies an exact clean provider, mirrors the approved Synty and custom-dice runtime roots into gitignored `public/models/`, and generates both tracked authorities before it mutates either runtime mirror:

- `scripts/generateCharacterCustomizationCatalog.ts` keeps the existing eight-race × four-starter-class customization profiles current.
- `scripts/generateBardAppearanceCatalog.ts` independently projects only the eight additive Bard manifest rows into `src/generated/bardAppearanceCatalog.ts`.

For a generator-only diagnosis, run the same owned Bard generator directly:

```bash
./node_modules/.bin/tsx scripts/generateBardAppearanceCatalog.ts \
  --provider-root /path/to/rpg-game-assets \
  --output src/generated/bardAppearanceCatalog.ts
```

Do not add Bard to `CustomizationStarterClass`. These complete Bard GLBs are basic supplied appearances, not automatic participants in hair/outfit customization.

### 2. Map the appearance without redesigning selection

`src/components/hex-grid/classCharacterModels.ts` resolves the exact race and class pair. For Bard it reads `BARD_APPEARANCE_CATALOG`, returns the race-specific URL and modular rig family only while standing, and never substitutes a different race or class.

`src/components/hex-grid/HexEntity.tsx` is the production selection caller. It passes the chosen URL to `ClassCharacterModel`, uses the resolved rig family for existing attachment sockets, and applies hair/outfit only when a real customization profile ref exists. `src/components/hex-grid/ClassCharacterModel.tsx` loads the GLB and selects `Idle_Relaxed` while stationary and `Walk_Forward` during the existing server-authored movement presentation.

Missing race/class refs, unknown refs, load errors, and unsupported appearances retain the established `MediumHumanoid` fallback.

### 3. Decide downed presentation explicitly

Every new appearance delivery must provide either:

1. a supported paired downed asset and mapping, or
2. an explicitly approved temporary fallback.

The Bard batch has no `*-bard-downed.glb` siblings. For unconscious/dead player presentation, the existing `isDowned` signal therefore skips standing Bard resolution and leaves the visible `MediumHumanoid` fallback in place. Do not form or request a Bard downed URL.

The later provider calibration belongs to [rpg-game-assets#43](https://github.com/KirkDiggler/rpg-game-assets/issues/43), including [the Bard decision](https://github.com/KirkDiggler/rpg-game-assets/issues/43#issuecomment-5586987725): a prone body must be centered horizontally over its occupied hex while preserving token origin and grounding. Do not anchor the feet at hex center while the body extends into a neighbor, and do not add a Web-only translation patch.

### 4. Test the resolver and real renderer path

```bash
RPG_GAME_ASSETS_PATH=/path/to/rpg-game-assets \
RPG_REQUIRE_SYNCED_BARD_ASSETS=1 \
npx vitest run \
  scripts/generateBardAppearanceCatalog.test.ts \
  scripts/bardAppearancePublication.test.ts \
  scripts/sync-game-assets.test.ts \
  src/components/hex-grid/classCharacterModels.test.ts \
  src/components/hex-grid/ClassCharacterModel.animation.test.tsx \
  src/components/session/SessionCanvas.test.tsx
```

These checks bind all eight URLs and hashes, the exact idle/walk names, the modular rig path, the normal `SessionScene -> HexEntity -> ClassCharacterModel` mount, and the visible downed fallback with no broken Bard-down URL. Existing Fighter/starter-class tests remain the non-Bard regression guard. Run the repository's required `npm run ci-check` once before opening the PR.

### 5. See it through the normal route

Follow [running locally](local-dev.md) with an isolated named stack and unused ports. Through the ordinary character/lobby flow, select or create a server-backed Bard of the race being checked, enter the normal session route, then:

1. confirm the race-specific Bard body is visible while idle;
2. make a normal server-approved move and confirm it changes to `Walk_Forward` without changing appearance;
3. when the server supplies the player's downed state, confirm the visible fallback remains on the owning hex and no `*-bard-downed.glb` request appears in the network log.

Do not edit a shared playtest character or force HP/state in the browser. Unit and R3F renderer tests are not a claim that this live route was observed; record any unavailable API character/state or WebGL limitation precisely.

### 6. Land and release as separate steps

Merging the asset provider does not update Web. A Web PR for the generated pin, resolver, tests, and documentation must merge to `dev`. That integration still is not a production deployment: the later `dev` to `main` release and deployment process remains separate. Never report provider merge or Web asset sync as proof that production shipped.

The approved Bard batch is already authored and reviewed. This consumer workflow does not repeat Blender imports, measurements, visual approval, or palette normalization.
