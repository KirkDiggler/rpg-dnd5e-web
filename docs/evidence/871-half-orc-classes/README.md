# #871 Half-Orc starter classes

Status: web release candidate for Journey `KirkDiggler/rpg-project#331`.

## Approved presentation

Kirk selected the native Modular Fantasy Hero candidate: **“40% olive looks like the keeper. def not monster.”**

- Head 03
- Ear 02
- Hair 08
- proportions `[1.08, 1.05, 1.08]`
- human-forward 40%-olive provider atlas
- no Goblin/monster geometry, rig, attachment, material, or animation

The Half-Orc remains visibly related to the human player roster rather than adopting the nearest monster silhouette or saturated full-olive treatment.

## Exact provider lock

Ignored runtime assets were synced from exact merged provider commit `fa908b7990de37630606b4117d4dbe08270768b8`.

- 28-model manifest: `7fd139faceafe55cad9c67add23645e68c2c228034809640f3e8bf7e44424aeb`
- complete inventory file: `51ca72cae606d0d2e37e5b58a76e28dfb8b69a03d0fb5c9d7f580334f451daef`
- complete inventory tree: `033467064325b92e60279ae5a98eea59724d781d9d6a45bb97347f380e397646`

All four Half-Orc GLBs matched their exact merged-provider hashes. The web continues to ignore `public/models/synty/`; no licensed GLB is tracked.

## Resolution contract

`classCharacterModels.ts` adds exact standing rows for Half-Orc Barbarian, Fighter, Monk, and Rogue. All use `modular-fantasy-hero-v1` and therefore the established `modular-fantasy-hero-main-hand-v1` socket.

Existing resolution remains unchanged:

1. exact standing `raceRef + classRef`;
2. class-specific standing/downed fallback;
3. `MediumHumanoid` when no class model resolves.

Tests cover normalized exact resolution, all four local-player URLs, a visible peer, downed fallback across all seven modular races, and shared socket selection.

## Normal creation and authoritative equipment

All four evidence characters were created and finalized through the ordinary web creator against lab2. No draft, character, Redis, or other storage fixture patch was used.

Each main hand was equipped through the production `dnd5e.api.v1alpha2.character.CharacterService.EquipItem` RPC:

- Barbarian — canonical full-size Greataxe
- Fighter — canonical full-size Greatsword
- Monk — canonical full-size Shortsword
- Rogue — canonical full-size Rapier

All four calls returned HTTP 200 with authoritative equipped refs. No race-specific weapon scale or storage patch was used.

The lab’s established unsupported `AuthoringService.GetDungeon` capability probe produced its expected pre-review console message during creation. Captured presentation proof windows began after session load and contained zero console errors, page errors, or unexpected request failures.

## Real-route evidence

One normal four-player party ran in **The Reference Tomb**:

- `half-orc-four-classes-close-real-route.png`
- `half-orc-four-classes-rotated-real-route.png`

Every class has an authoritative weapon capture:

- `half-orc-barbarian-greataxe-real-route.png`
- `half-orc-fighter-greatsword-real-route.png`
- `half-orc-monk-shortsword-real-route.png`
- `half-orc-rogue-rapier-real-route.png`

Across these proof windows, all four model URLs and all four canonical weapon URLs returned HTTP 200 with the exact hashes in `receipt.json`.

`half-orc-barbarian-walk-real-route.png` captures a successful two-step `SessionService.Move`; both the production request and response were observed and `Walking…` appeared. The session setup helper’s final page waiter encountered the expected combat/world-clock transition after the session had already started; the normal session persisted and each real route loaded independently.

The full web suite passes 4,279 tests with one established skip. Formatting, type checking, and lint pass; lint retains one unrelated established `useCameraControls.ts` hook-dependency warning and reports zero errors. The complete `npm run ci-check` gate also passes.

## Boundaries

No runtime recoloring, runtime modular assembly, Goblin/monster part use, selectable customization, Half-Orc downed model, portrait, renderer scaling, race-specific weapon scale, carrying-pose change, API/proto/toolkit change, or Auto Rig Pro dependency is introduced.
