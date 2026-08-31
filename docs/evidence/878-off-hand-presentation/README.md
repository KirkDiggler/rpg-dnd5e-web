# Owner-authoritative off-hand presentation evidence

Issue: [rpg-dnd5e-web#878](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/878)

Journey: [rpg-project#334](https://github.com/KirkDiggler/rpg-project/issues/334)

Status: **ready for review**.

## Exact binding

- Web code/docs HEAD: `472dde5725d657bb2930cad5a772eeb447d8f68c`
- Provider merge: `rpg-game-assets@71dff14f57afe41ff320dee15081123ec1daddc2`
- Provider manifest SHA-256: `bdfbf2484ab15fd0d054222f16f127922e8a6ea0aea2e5ce430bb97aaeb8c790`
- Weapon Gallery API merge: `9254f85d66793dff276386cb240840b634c70f12`
- Chrome 151.0.7922.169 / Playwright 1.61.1

The ignored runtime assets were synced from the exact detached provider merge. Web tracks zero licensed GLBs.

## Production-backed Concept

Exact HTTP 200/hash-verified observations:

- 4 Human/Townfolk classes × 3 equipment states in Idle: **12**
- 7 modular Fighter races × 3 states in Idle: **21**
- Human and Elf Fighter × 3 states in Walk: **6**
- Total: **39/39**

States:

1. Shield only
2. Longsword + Shield
3. Shortsword + Dagger

The race-switch remount regression is covered: changing resolved model URLs remounts `ClassCharacterModel`, so each rig receives its own animation mixer and reviewed socket family rather than retaining a stale prior model action. Fixture resolution is memoized by state, so status-only rerenders do not detach/reattach assets. Semantic slot prefixes keep same-ref main/off sibling keys unique and guarantee simultaneous cleanup.

Concept errors: zero console errors, zero page errors, zero request failures.

Evidence:

- `off-hand-townfolk-contact-sheet.png`
- `off-hand-modular-contact-sheet.png`
- `off-hand-walk-contact-sheet.png`

## Normal-game authority

The reusable Weapon Gallery is a normal repository-backed Fighter fixture with 27 unique promoted weapons plus its non-weapon class equipment. No Redis, response, fixture, or client-state patch was used.

Initial state:

- equipped `{}`
- AC 12
- HP 12/12
- speed 30 ft
- empty main-hand damage

Shield sequence through visible Equipment UI:

1. Equip Shield → EquipItem HTTP 200, immediate Shield render, AC 14.
2. Fresh browser context → Shield and AC 14 restored through authoritative character data.
3. Unequip Shield → UnequipItem HTTP 200, immediate removal, AC 12.
4. Fresh context → empty off hand and AC 12 restored.

Two-weapon sequence:

1. Equip Shortsword → EquipItem HTTP 200 into main hand.
2. Equip Dagger → EquipItem HTTP 200; existing server authority places it in off hand.
3. Server-composed damage: `1d6 piercing damage · off-hand 1d4 piercing damage`.
4. Fresh context → both exact assets restored.
5. Unequip off hand → HTTP 200.
6. Unequip main hand → HTTP 200.
7. Fresh context → exact initial state restored.

Final state exactly equals initial state: `{}`, AC 12, HP 12/12, speed 30 ft, empty main-hand damage.

`authoritative-off-hand-contact-sheet.png` preserves all ten stages.

Six expected `StreamLobby` request aborts occurred only when Playwright intentionally closed contexts. They are recorded separately. Unexpected authority errors: zero.

## Exact provider bytes

- Shield `8d25301a563da849b78523612b736cdf306d3437ee0d2771ca6ec7d0d2f714e1`
- Dagger `e02ea36a0f0e1dfdb288503733b11a66f5bd0e1320b3e2f8f710e925cbccba41`
- Shortsword `ee5f39b67f7d77df01a9425c5a2a371603eff83138d236ba5049033a7dc4ce9b`
- Handaxe `1b8d8facdbc786b12808a980c08cefe4f86580612ff64f0ee0a45b7a30c171de`
- Sickle `82f6d5c99f276e3eaf45f30dd54bfd087545969749a0ad80bd14c942071462e4`

Dagger and Shortsword reuse canonical weapon paths. Shield, Handaxe, and Sickle use provider-baked off-hand bytes. The browser owns no item correction matrix.

## Boundaries verified

- Acting owner only; peers receive no equipment projection.
- Main and off hands mount independently under `Hand_R` and `Hand_L`.
- Main-hand exact mapping and behavior remain unchanged.
- Unsupported/attack-shaped off-hand refs render empty.
- Legacy guessed OBJ Shield is not an authoritative class-GLB fallback.
- No API, proto, toolkit, equipment, AC, damage, persistence, inventory, or fixture implementation change.
- PNGs and receipt contain no absolute paths, tokens, private IDs, Redis addresses, or licensed source paths.

`receipt.json` binds browser/provider identities, observations, authority transitions, expected abort accounting, exact restoration, and media byte/decoded hashes.

— assets agent, on behalf of KirkDiggler
