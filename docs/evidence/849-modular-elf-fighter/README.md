# Modular Elf Fighter route evidence (#849)

This evidence folder rebinds the PR proof to the merged opaque-hair provider correction from `rpg-game-assets` provider PR #84.

## Merged provider authority

Verified through GitHub and provider Git:

- provider PR #84: [#84](https://github.com/KirkDiggler/rpg-game-assets/pull/84) `fix: keep modular Elf Fighter hair opaque (#83)`
- PR state: `MERGED`
- merge commit: `098dc9bb977199ea212a00d2742d5055a8f1a7dd`
- merge commit is an ancestor of provider `origin/main`

A detached temporary provider worktree was created at that exact merge commit, used for `npm run assets:sync`, then removed.

## Synced corrected bytes

The synced runtime files hash exactly to the approved corrected values:

- `public/models/synty/characters/race-class/manifest.json`
  - sha256 `446581a10dbdbde7c06b9c884d18c96f71852714a093e844e1bb316bc987fa94`
- `public/models/synty/characters/race-class/elf-fighter.glb`
  - sha256 `3060e6bc2712c3699c3abceb78480fd24007d628ef9c928c5bcffcd53ca7aa39`

Corrected manifest / model facts:

- combination `elf:fighter`
- model `/models/synty/characters/race-class/elf-fighter.glb`
- animations `Idle_Relaxed`, `Walk_Forward`
- socket profile `modular-fantasy-hero-main-hand-v1`
- manifest socket values deep-equal the web repo's `MODULAR_FANTASY_HERO_MAIN_HAND_SOCKET`
- glTF material default is `OPAQUE` (`alphaMode` absent)
- embedded atlas alpha extrema are `[255,255]`
- `Chr_Hair_01` present
- `Chr_Hair_38 absent`

## Fresh real-browser recapture

A fresh browser context loaded the existing reviewed player/session where available:

- player id: `modular-elf-fighter-849-live-935106`
- route: `http://127.0.0.1:3011/?playerId=modular-elf-fighter-849-live-935106`
- exact public model request `GET /models/synty/characters/race-class/elf-fighter.glb` returned `200`
- exact response sha256 `3060e6bc2712c3699c3abceb78480fd24007d628ef9c928c5bcffcd53ca7aa39`
- authoritative Greatsword model request returned `200`
- real `SessionService/Move` returned `200`
- `Walking…` was visible during the walk capture

Final screenshots for the PR evidence:

- `profile-real-route.png` — side/profile ponytail proof with opaque hair
- `front-real-route.png` — front/three-quarter live production camera
- `rotation-pop-boundary-real-route.png` — slight camera rotation at the previous pop boundary
- `greatsword-equipped-real-route.png` — authoritative `MAIN HAND Greatsword`
- `walk-real-route.png` — real walk with `Walking…`

## Browser proof window and known outside noise

Browser zero counts are scoped to the captured proof window only.

Within the captured proof window:

- model request count `1`
- console errors `0`
- page errors `0`
- unexpected request failures `0`

These appeared outside the captured proof window and were kept separate from the verdict counts:

- route-transition aborts from the old stream / `GetCharacterData` teardown
- `AuthoringService.GetDungeon` unimplemented on lab2 during the home/lobby probe
