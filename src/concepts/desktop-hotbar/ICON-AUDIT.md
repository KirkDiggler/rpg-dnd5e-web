# INTERFACE icon coverage — local prototype survey

Related: [web#1225](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1225).
This is an inventory finding, not an approved game-wide icon vocabulary.

## What is actually available

Surveyed the five distinct `INTERFACE*.zip` archives in `~/Downloads`; duplicate downloads containing `(1)` were excluded. Counts below include PNGs ending `_Clean.png` in icon folders, excluding Core/input-device icons. Stroke, underlay and other rendering variants are not additional choices.

| Pack                | Clean icon files | Main coverage                                                                               |
| ------------------- | ---------------: | ------------------------------------------------------------------------------------------- |
| Fantasy Warrior HUD |              210 | 99 weapons, 37 status, 31 inventory, 21 map, 16 stats, 6 elements                           |
| Dark Fantasy HUD    |              244 | 84 weapons, 60 status, 48 inventory, 26 map, 20 stats, 6 elements                           |
| Fantasy Menus       |               32 | 24 menus, 8 settings                                                                        |
| Dark Fantasy Menus  |               63 | 31 decorative glyphs (eyes, hands, sigils, skulls, spell motifs etc.), 24 menus, 8 settings |
| Fantasy Screens     |               62 | 44 inventory, 7 menus, 6 character, 5 playback                                              |
| **Total**           |          **611** | **Files, not 611 distinct gameplay meanings**                                               |

A secondary pixel check cropped each clean file's alpha to its bounding box, resized it to 64×64 with Pillow's default resampling, and hashed those alpha bytes. It found **457 distinct normalized masks** among the 611 files. This removes exact normalized duplicates, not all stylistic/semantic duplicates: two differently drawn shields are still both shields. That count must not become a claim that we have 457 uniquely recognizable actions.

The contact sheets are private/local evidence (`/tmp/hotbar-pack-survey.png`, `/tmp/hotbar-icon-survey.png`, `/tmp/hotbar-alt-icons.png`); no licensed imagery is committed.

## Coverage assessment

- **Weapons, equipment, navigation and broad status families:** plentiful choices for this prototype.
- **Elemental and broad magical families:** usable building blocks (fire, ice, air, earth, eyes, minds, skulls, hearts, crosses, runes). They are not a complete spell illustration library.
- **Related spells:** need deliberate selection. A curse glyph for Bane is a proposal, not a canonical mapping. Several healing/protection icons differ only by an enclosing shape; inspect them at the current 22px glyph size.
- **Dodge:** no dedicated Dodge/Evade/Agility glyph was found by filename or in the inspected stat/status sets. The hood is explicitly `Status_Stealthy_01`. The density pass substituted a **Do** placeholder after interpreting the operator's comment as rejecting the silhouette; the operator clarified that a differently colored hood was the intended experiment. The current preview restores it in **gold** for Dodge, versus **blue** for the Stealth sample. Whether that distinction reads well remains a walkthrough question, not a settled game-wide icon rule.
- **Full D&D spell/ability coverage:** unproven. We have enough raw material for dozens of differentiated prototype slots, but not evidence of a correct, distinct glyph for every eventual action. A production catalog needs explicit mappings and a named missing-art list, not an automatic nearest-looking fallback.

## Color experiment

The preview now tints each clean glyph's alpha using its existing explicit visual hint: gold, green, blue or violet. These are experimental visual families, not inferred schools, damage types, resource rules or legality. The same source supplies the small button and larger tooltip glyph. Color reinforces shape; the tooltip name and accessible name remain authoritative. Unavailable state still has an × and dashed border rather than relying on tint.

The **36 icons (layout only)** scenario combines the existing 11 visible cleric-style offers with 25 clearly labeled artificial samples. It includes **Layout sample 25 — Stealth** in blue and Dodge in gold; both use the hood silhouette per the operator's requested comparison. This tests density and glyph recognition, not a real cleric loadout or spell implementation.

## Promotion boundary

The licensed PNGs remain in ignored local `public/models/synty/interface-preview/`. The chosen subset is identified by the fixture metadata; additional clean glyphs in the local folder support inspection only. Canonical selection/promotion belongs in private rpg-game-assets after the visual direction is accepted. No source PNGs, archives or contact sheets go into the public web repository.
