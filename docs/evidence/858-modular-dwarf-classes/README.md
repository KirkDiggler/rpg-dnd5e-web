# #858 modular Dwarf class models

Status: **production-presentation route verified** against merged provider PR #90.

## Provider authority

The ignored runtime tree was synced from exact merged provider commit `3c779ebc13409e2169ef2143644495aad66f8f2f` through a detached provider worktree. The generated eight-combination race/class manifest SHA-256 is `ba804119ea38b0a6d39acd4a00ab331633ee06eb4d33fe309a7d7d49defe2741`.

| Public combination | Model SHA-256 |
|---|---|
| `dwarf:barbarian` | `9420770680b3efcca3443a50803bb1bf9fd9ca4e4f03d125961ab52652742b8c` |
| `dwarf:fighter` | `e2ccabd29b471fad0732fb1a728ec13627e71a4cb747c1366ed56a06dc7cafa5` |
| `dwarf:monk` | `397e13577ceb793e676d50e218d661f8fa9b7eb0e8cc6c5716f4b9574aceece7` |
| `dwarf:rogue` | `a189b0836af26106f6745157a01bcf79c0c52ca76a192d35ed75178489a9742e` |

All four entries use `modular-fantasy-hero-v1`, baked proportions `[1.08, 0.78, 1.08]`, `Idle_Relaxed`, `Walk_Forward`, and `modular-fantasy-hero-main-hand-v1`. Synced GLBs and the provider manifest remain ignored and untracked.

## Real session route

Four isolated characters joined one Reference Tomb session:

- `D858 Dwarf Barbarian`
- `D858 Dwarf Fighter`
- `D858 Dwarf Monk`
- `D858 Dwarf Rogue`

Fresh browser contexts observed HTTP `200` and exact response hashes for all four Dwarf GLBs. They rendered together from public roster identity. The Barbarian completed a real two-step `SessionService.Move`; `Walking…` and both movement story entries were observed.

Authoritative character state supplied one carried weapon per class:

- Barbarian — Greataxe
- Fighter — Greatsword
- Monk — Shortsword
- Rogue — Rapier

Fresh owner contexts observed HTTP `200` and exact hashes for all four weapon GLBs. Each rendered through the existing modular rig-family socket; no Dwarf-specific transform or renderer path was added.

## Isolated fixture limitation

### Dwarf tool choice

The current lab API's `UpdateRace` handler accepts Dwarf `CHOICE_CATEGORY_TOOLS` input but does not map it into toolkit `RaceChoices.Tools`. Consequently a normal Dwarf draft remains 80% complete even after selecting Smith's Tools. For this visual verification only, each isolated draft received the exact toolkit-native `dwarf-tool-proficiency` / `smiths-tools` choice before `FinalizeDraft`. No API code was changed in this web slice.

### Main-hand state

The session entered combat before the equipment modal could be used. The isolated characters' authoritative `equipment_slots.main_hand` values were therefore seeded directly in character storage. The screenshots and HTTP receipts prove the ordinary public-state model/weapon presentation path, not the equipment mutation UI.

These fixture steps are explicit so model-presentation evidence is not misrepresented as proof that Dwarf character creation currently works end to end.

## Captures

- `four-dwarf-classes-close-real-route.png` — all four Dwarf class silhouettes together with the Barbarian Greataxe.
- `four-dwarf-classes-rotated-real-route.png` — the same party after a production-camera rotation.
- `dwarf-barbarian-walk-real-route.png` — real `Walking…` and movement story proof.
- `dwarf-barbarian-greataxe-real-route.png`
- `dwarf-fighter-greatsword-real-route.png`
- `dwarf-monk-shortsword-real-route.png`
- `dwarf-rogue-rapier-real-route.png`

The zero error counts in `receipt.json` apply to the captured proof window after session and model responses settled. The lab image's known unimplemented authoring-gate probe occurred before that window.

## Fallback scope

Automated tests preserve exact standing resolution, class-specific Townfolk downed fallback, class fallback for unavailable combinations, `MediumHumanoid` recovery, local public identity, visible-peer public identity, and the one modular rig-family socket. No API, proto, toolkit, renderer, runtime assembly, customization, Dwarf downed model, or portrait change is included.
