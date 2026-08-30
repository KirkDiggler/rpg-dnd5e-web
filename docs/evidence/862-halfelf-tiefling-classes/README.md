# #862 Half-Elf and Tiefling starter-class models

Status: web release candidate for Journey `KirkDiggler/rpg-project#327`.

## Approved identities

Kirk reviewed the Half-Elf and crimson Tiefling beside the accepted production Elf in Blender. After the lighter Tiefling facial-detail/stubble swatch was mapped to the primary crimson, the final verdict was **“looks great.”**

- Half-Elf uses moderate ears, Hair 16, and standard proportions.
- Tiefling uses pointed ears, Hair 03, curled horns, standard proportions, and the deterministic provider-side crimson atlas.
- The source has no tail; this slice intentionally does not invent one.

## Exact provider lock

The ignored runtime tree was synced from exact merged provider commit `7ac84ec04c049cd62ed66e577189b976d59f8db5`, never from an unmerged branch. The provider manifest SHA-256 is `0dc904a1212afa4d328cf8c7f0d715e269c10c7d6e899d539e426f786a390094`; the complete inventory file SHA-256 is `62c41ccd3e6810630655a7e7616767c2ca331773f2c703318d009c2d0978fc50`.

All eight files returned HTTP 200 with the exact hashes recorded in `receipt.json`. The web repository continues to ignore `public/models/synty/`; no licensed GLB is tracked here.

## Production resolution

`classCharacterModels.ts` adds exact standing rows for Half-Elf and Tiefling Barbarian, Fighter, Monk, and Rogue. Each row uses `modular-fantasy-hero-v1`, so the shared `modular-fantasy-hero-main-hand-v1` socket remains authoritative. Existing behavior is unchanged:

1. exact standing `raceRef + classRef`;
2. class-specific standing/downed fallback;
3. `MediumHumanoid` when no class model resolves.

Tests cover normalized exact resolution, all eight local-player URLs, visible Half-Elf/Tiefling peers, class-specific downed fallback, and the shared modular socket.

## Normal creation and authoritative equipment

All eight evidence characters were created and finalized through the ordinary web creator against the merged Dwarf-tool API fix. No draft or character storage patch was used. Half-Elf creation included Dwarvish plus Arcana and Persuasion race choices; all eight `FinalizeDraft` calls succeeded.

After creation, each character’s main hand was equipped through the production `dnd5e.api.v1alpha2.character.CharacterService.EquipItem` RPC:

- Barbarian — Greataxe
- Fighter — Greatsword
- Monk — Shortsword
- Rogue — Rapier

The session route then resolved those public authoritative values. Every model and weapon request returned HTTP 200 with the exact provider hash.

## Real-route evidence

Two four-player sessions ran in **The Reference Tomb**, one for each race:

- `halfelf-four-classes-close-real-route.png`
- `halfelf-four-classes-rotated-real-route.png`
- `tiefling-four-classes-close-real-route.png`
- `tiefling-four-classes-rotated-real-route.png`

Class-specific captures prove each race with all four authoritative weapons:

- `halfelf-barbarian-greataxe-real-route.png`
- `halfelf-fighter-greatsword-real-route.png`
- `halfelf-monk-shortsword-real-route.png`
- `halfelf-rogue-rapier-real-route.png`
- `tiefling-barbarian-greataxe-real-route.png`
- `tiefling-fighter-greatsword-real-route.png`
- `tiefling-monk-shortsword-real-route.png`
- `tiefling-rogue-rapier-real-route.png`

`halfelf-barbarian-walk-real-route.png` captures a real two-step `SessionService.Move`; `Walking…` was observed. The Tiefling party also visibly walked during its capture.

Across the captured proof windows there were zero console errors, page errors, or unexpected request failures. The lab’s established unsupported `AuthoringService.GetDungeon` capability probe occurred before the proof windows and is unrelated to character presentation.

The full web suite passes 4,207 tests with one established skip. Formatting, lint, type checking, production build, and the complete `npm run ci-check` gate pass.

## Boundaries

No runtime recoloring, selectable customization, runtime modular assembly, tail, race-specific downed model, portrait, renderer transform, API/proto/toolkit change, or Auto Rig Pro dependency is introduced. Existing class-specific downed models remain the fallback.
