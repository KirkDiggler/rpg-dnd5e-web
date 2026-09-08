---
name: integrating provider character appearances
description: Worked example for the eight-race Bard appearance batch
updated: 2026-09-09
---

# Integrating provider character appearances

## Worked example: eight-race Bard

Private provider PR [rpg-game-assets#184](https://github.com/KirkDiggler/rpg-game-assets/pull/184) merged as `37c13c68b6cfc87ad6684351f934b4ff1fd83515`. From a clean provider checkout at that commit, run the existing Web sync without committing its licensed GLBs:

```bash
RPG_GAME_ASSETS_PATH=/path/to/rpg-game-assets \
ASSETS_SYNC_SKIP_UPDATE=1 \
npm run assets:sync
```

The consumer mapping is deliberately small: `classCharacterModels.ts` maps dwarf, elf, gnome, half-elf, halfling, half-orc, human, and tiefling plus `bard` to `/models/synty/characters/race-class/<race>-bard.glb`. These complete models use rig `modular-fantasy-hero-v1`; the existing renderer selects `Idle_Relaxed` and `Walk_Forward` from their clips. They do not receive a `customizationProfileRef`, inferred hair, or inferred outfit.

Missing or unknown races remain unresolved for the established `MediumHumanoid` fallback; never substitute Human. The provider has no Bard downed files, so unconscious/dead Bards also remain unresolved and use the existing visible tilted fallback. Body-centering belongs to future provider work in [rpg-game-assets#43](https://github.com/KirkDiggler/rpg-game-assets/issues/43#issuecomment-5586987725), not a Web translation patch.

Run the focused resolver, renderer, animation, and session tests, then the required `npm run ci-check`. Finally observe idle, walk, and downed presentation through the normal live route when WebGL and a live API are available. Unit tests are not visual proof.

Provider merge, Web integration, and the later `dev` to `main` production release are separate events.
