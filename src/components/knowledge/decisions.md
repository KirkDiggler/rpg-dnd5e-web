# Decisions — src/components

One line per entry, dated and linked. Ingest is the writer; entries arrive through its reviewed PR.
A decision reads `- <date> · <the words> · options: <the options it closed> · because: <why> · <link> · upheld: <links, or none yet>`;
a finding, friction or open line reads `- <date> · <the words> · <link>`. A finding that needs more than a line links its case file in `findings/`.
Friction names both entries and never settles them.

## Decisions

- none yet

## Findings

- 2026-10-31 · Both SessionCanvas and HexGrid derive the picking plane from visible floor centers plus a hex-radius margin, including world offsets; a finite empty-floor surface remains. A renderer-only fix misses the normal SessionCanvas route, so its real mesh raycast is the regression boundary, not a larger fixed plane. · https://github.com/KirkDiggler/rpg-dnd5e-web/blob/3d33799299c7f132479ba29c6f58a81a5f151976/knowledge/runs/2026-10-31-floor-picking-bounds.md
- 2026-11-12 · Skinned accessories use the existing entity picking proxy rather than their own raycast. A pointer event between mount and world-matrix update can cache world-positioned bounds as local bounds; the regression needs that mount-to-frame interaction, not only a settled render at several zooms. · https://github.com/KirkDiggler/rpg-dnd5e-web/blob/e00205d863b0f98706003d092a19465f66ca622a/knowledge/runs/2026-11-05-hair-attachment-visibility.md

## Friction

- none yet

## Open

- none yet
