# #846 Wave D weapon evidence

Status: **ready for review**.

This directory proves the four Wave D additions—Light Crossbow, Longbow,
Javelin, and Rapier—through the actual shared renderer and production resolver,
then separately proves owned Light Crossbow state through the real sandbox
Fighter session route.

## Provider and code binding

- Provider: `KirkDiggler/rpg-game-assets`
- Provider commit: `cf3bd0bd325d9440a6d28f1d39601845bdfbcdde`
- Synced manifest: `public/models/synty/weapons/manifest.json`
- Manifest SHA-256:
  `030ddd69117aed1b124f69320bc2def039d45eba0b7840644974108aaf117795`
- Web code HEAD:
  `e4a3521b575c80c40f12853e202a56bfa447ca3b`

The exact synced bytes were verified before browser capture:

| Exact ref | Browser path | SHA-256 |
| --- | --- | --- |
| `dnd5e:item:light-crossbow` | `/models/synty/weapons/light-crossbow.glb` | `84ee7b3798bf56c39afe9772caa48d9f1c82ff1684f22d2d30d1d328b6a10712` |
| `dnd5e:item:longbow` | `/models/synty/weapons/longbow.glb` | `42eb8ea762adec72803415ac11d7917c45df2a76855c3adcb0054741d8e5485e` |
| `dnd5e:item:javelin` | `/models/synty/weapons/javelin.glb` | `2b0a7ba06a56c581cb5817bfb5c1be3bf9a70c6aba64cb91c234b921bf6a9c14` |
| `dnd5e:item:rapier` | `/models/synty/weapons/rapier.glb` | `3318941a7dcfcd37256a289d234529da6279976e286734ba10b2dd41dee6c96f` |

Licensed GLBs remain ignored runtime inputs and are not committed here.

## Four-class renderer evidence

[`wave-d-four-class-contact-sheet.png`](wave-d-four-class-contact-sheet.png)
contains Fighter, Barbarian, Monk, and Rogue × all four additions in Idle and
Full orbit. Every one of the 16 isolated Playwright captures:

- entered through the production-backed `?concept=weapon-attachment` deep link;
- resolved the exact `dnd5e:item:*` ref through the production catalog;
- reported attachment status `attached` on the shared `Hand_R` socket;
- received the exact GLB with HTTP 200 and matching SHA-256; and
- produced zero console errors, page errors, or unexpected request failures.

This matrix is visual fixture compatibility evidence. It does **not** invent
inventory authority for Barbarian, Monk, Rogue, or any peer.

[`wave-d-fighter-walk-contact-sheet.png`](wave-d-fighter-walk-contact-sheet.png)
shows the same four exact outputs on the Fighter in Walk with full-body/orbit
framing. It proves rigid attachment during Walk only—not combat/bow animation,
finger posing, projectile behavior, or second-hand contact.

## Authoritative owner sequence

[`authoritative-light-crossbow-contact-sheet.png`](authoritative-light-crossbow-contact-sheet.png)
records the real owner route against the local API/Envoy stack. The sandbox
owner UI identified the acting character as a Fighter and exposed an enabled,
owned `dnd5e:item:light-crossbow` inventory row. No other-class inventory or
peer equipment was queried or inferred.

1. `GetCharacterData` HTTP 200 presented the exact observed initial
   `main_hand` `dnd5e:item:warhammer`, with Shield in `off_hand` and Chain Mail
   equipped.
2. `EquipItem` POST HTTP 200 returned the complete replacement
   `CharacterData`; Light Crossbow appeared immediately in the renderer and
   owner equipment UI. Its exact GLB returned HTTP 200.
3. A fresh browser context recovered the owner seat, called `GetCharacterData`
   HTTP 200, and restored Light Crossbow.
4. `UnequipItem` POST HTTP 200 returned the complete replacement
   `CharacterData`; the renderer and main-hand slot became unarmed immediately.
5. Another fresh context called `GetCharacterData` HTTP 200 and remained
   unarmed.
6. Restoration used the exact observed owner items: `EquipItem` HTTP 200 for
   Warhammer, then `EquipItem` HTTP 200 for the Shield displaced by the
   two-handed Light Crossbow. Final main hand, off hand, armor, and AC match the
   observed initial presentation exactly.

All relevant owner RPC and asset responses were HTTP 200. Final captured stages
had zero console errors, page errors, and unexpected request failures. Each of
the 20 isolated Concept contexts and three authoritative contexts intentionally
closed its seat-recovery `StreamLobby` after the first authoritative snapshot:
that POST first returned HTTP 200 and then ended as `net::ERR_ABORTED`. The 23
expected one-snapshot terminations are recorded separately in `receipt.json`;
they are not session request failures.

## Contact-sheet hashes

| Sheet | Dimensions | SHA-256 |
| --- | --- | --- |
| `wave-d-four-class-contact-sheet.png` | 2098 × 1984 | `5e49b73d93756cc5c13a89254a3df2febae22f79a55d3d53c0a0313da32a3214` |
| `wave-d-fighter-walk-contact-sheet.png` | 2098 × 598 | `b66b0aa847fd3733634ba2fcc9dfed5030698c67e191d835df537b0aab92eb07` |
| `authoritative-light-crossbow-contact-sheet.png` | 1914 × 2304 | `ca765dac986d381bda5c727849409da95bb957bd1f74c11168c32beeac445804` |

`receipt.json` contains all 16 idle observations, four Walk observations,
authoritative methods/statuses/states, expected transport termination record,
error totals, and the exact sheet hashes.

## Verification

```sh
npm run build -- --mode development
npm run test:run -- \
  src/components/hex-grid/mainHandWeapons.test.ts \
  src/concepts/weapon-attachment/weaponAttachmentExperiment.test.ts \
  src/concepts/weapon-attachment/WeaponAttachmentConcept.test.tsx
```

The browser evidence used Playwright with the actual Chromium renderer and the
production build compiled in Vite development mode, served on branch port
`3024` so the Concept route remained available.

## Scope

Acting-owner main-hand presentation only. Peer equipment, invented inventory
for the other three classes, off-hand presentation beyond restoring the exact
owner state, combat/bow animations, projectiles, second-hand contact, and
finger posing remain outside this evidence.
