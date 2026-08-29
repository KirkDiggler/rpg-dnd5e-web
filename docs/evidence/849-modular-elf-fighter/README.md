# Modular Elf Fighter route evidence (#849)

This evidence folder proves the public Elf Fighter route against the **merged** provider authority from `rpg-game-assets` PR #81.

## Merged provider authority

Verified through GitHub and provider Git:

- provider PR: [#81](https://github.com/KirkDiggler/rpg-game-assets/pull/81) `asset: generate fixed-look modular Elf Fighter`
- PR state: `MERGED`
- merge commit: `ddf77063fcecb0a8598bc2e9333ba37bbcae1acb`
- merge commit is an ancestor of provider `origin/main`

A detached temporary provider worktree was created at that merge commit and used for `npm run assets:sync`.

## Synced merged bytes

The synced runtime files hash exactly to the approved values:

- `public/models/synty/characters/race-class/manifest.json`
  - sha256 `0bb8b1d33ae0d403d322e85c52d8df209c77f224408a888d8c02e753302ad56b`
- `public/models/synty/characters/race-class/elf-fighter.glb`
  - sha256 `53ccc878a2ed40fc9e52391b942b9afc4ccda2267a7d8cdbdf1689730832e41d`

Merged manifest facts:

- combination `elf:fighter`
- model `/models/synty/characters/race-class/elf-fighter.glb`
- animations `Idle_Relaxed`, `Walk_Forward`
- rig family `modular-fantasy-hero-v1`
- socket profile `modular-fantasy-hero-main-hand-v1`
- merged manifest socket values deep-equal the web repo's `MODULAR_FANTASY_HERO_MAIN_HAND_SOCKET` constant

These merged bytes are hash-identical to the pre-merge provider branch bytes used for the recorded live route capture, so the browser proof below remains authoritative without a second live run.

## Recorded live route capture reused for merged bytes

All browser `goto()` calls used `waitUntil: 'domcontentloaded'`, never `networkidle`.

Real route used:

1. Home
2. `Create`
3. real wizard: Elf -> Fighter -> Dueling -> martial-weapon choice `Greatsword`
4. `Play`
5. `Create lobby`
6. choose `The Reference Tomb`
7. `Ready up`
8. `Start`

Live player/character used for the recorded capture:

- player id: `modular-elf-fighter-849-live-935106`
- character: `Task849ElfGS-935106`

### Real idle / exact public model

From the recorded real session route before movement:

- `GetCharacterData` returned `200`
- exact public model request `GET /models/synty/characters/race-class/elf-fighter.glb` returned `200`
- recorded browser counts for the captured proof window only: exact model request count `1`, page errors `0`, request failures `0`, console errors `0`

Screenshot:

- `idle-real-route.png`

### Authoritative main-hand attachment

The real character flow did **not** auto-equip the selected martial weapon; it arrived as carried inventory. The authoritative attach proof therefore used the real in-session Equipment UI:

- `Equipment` -> `Greatsword — equip to Main hand`
- `EquipItem` returned `200`
- `GET /models/synty/weapons/greatsword.glb` returned `200`
- the Equipment panel then showed `MAIN HAND Greatsword`, and the rendered live model visibly carried the greatsword

Screenshot:

- `main-hand-equipped-real-route.png`

### Real walk

After equipping, a real floor click dispatched `SessionService/Move` and the route entered `Walking…` state.

- `Move` returned `200`
- mid-walk body text included `Walking…`
- post-move combat/log state recorded `MOVEMENT ... Position -1, 4.`

Screenshots:

- `walk-real-route.png`
- `walk-after-real-route.png`

## Browser noise kept separate from the captured proof window

Two known non-product blockers were observed outside the captured proof window:

- home/lobby authoring probe: `AuthoringService.GetDungeon` unimplemented on lab2
- expected route-transition abort noise from old stream/request teardown

These appeared only during bootstrap / session transition. Within the captured proof window (idle, equip, and walk capture phases), there were no new console errors, no page errors, and no request failures.
