# #884 Specialist weapon consumer evidence

This evidence binds the exact Glaive, Scimitar, and Trident consumer to merged provider and repository-backed Gallery authority.

## Exact revisions

- Web base: `a04f54649fe7163bec0a4d2e13689c0baf1123db`
- Web code/docs head: `3317484` (full hash in `receipt.json`)
- Provider merge: `00cbd7cdcc338edaa249e3707492341fe1c4a416`
- Weapon Gallery merge: `789013dc4957c1482e29927383116645c55e161e`
- Main manifest: `eb0c2fd4402c05e8ac68c9b950d9fd9f6d3784e2ec16a9e36fac06bb45eba46a`
- Off-hand manifest: `975833c55e9bf405573ebb4e911f8fb1a3fe50e680cb4718f21c6b4587feadf1`

The web tracks no licensed GLBs. Runtime assets were synced into the ignored public tree from the exact detached provider merge.

## Concept proof

The production-backed Owner Off-Hand Attachment Concept uses the shared production renderer, exact catalogs, actual class/race models, and existing rig-family sockets. It exposes no transform controls.

- `specialist-townfolk-idle.png`: four current classes × four wave states = 16 observations.
- `specialist-modular-idle.png`: seven current modular Fighter races × four wave states = 28 observations.
- `specialist-walk.png`: Human and Dwarf Fighter × four wave states = eight Walk observations.

Total: **52/52 observations**.

The four states are Glaive main, Trident main, Scimitar main, and dual Scimitars. Glaive and Trident remain empty off hand. Dual Scimitars resolve the same exact item ref independently into the main and off semantic slots.

Every exercised provider GLB returned HTTP 200 with the exact merged hash. Browser capture recorded zero console errors, zero page errors, and zero unexpected request failures. One `StreamLobby` abort occurred only when the Concept browser context closed.

## Normal-game authority proof

`authoritative-specialist-sequence.png` records eleven visible-UI stages through the repository-backed Weapon Gallery character:

1. exact empty initial state;
2. Glaive equip;
3. fresh-context Glaive restoration;
4. Glaive unequip;
5. fresh-context empty restoration;
6. dual sequence initial empty state;
7. two normal Scimitar EquipItem calls and dual presentation;
8. fresh-context dual restoration;
9. off-hand Scimitar unequip while main remains;
10. main Scimitar unequip and empty state;
11. fresh-context final restoration.

All six equipment RPCs returned HTTP 200. Dual authority displayed server-produced `1d6 slashing damage · off-hand 1d6 slashing damage`. The web did not calculate damage or legality.

Initial and final owner state match exactly:

- equipped `{}`;
- AC 12;
- HP 12/12;
- speed 30 ft;
- empty damage text.

Six `StreamLobby net::ERR_ABORTED` records are expected context-close events, one for each intentionally closed authority context. Unexpected authority errors were zero.

## Boundaries

- Owner-private equipment only; no peer projection.
- Exact item refs only; attack-shaped, unknown, Lance, and unsupported off-hand refs remain empty.
- Existing `Hand_R` and `Hand_L` sockets are unchanged.
- No item/class/race transform table.
- No API, proto, toolkit, inventory, legality, AC, damage, persistence, mounted, or animation implementation.
- Contact sheets contain no character IDs, join codes, tokens, absolute paths, licensed source paths, or embedded metadata.

— assets agent, on behalf of KirkDiggler
