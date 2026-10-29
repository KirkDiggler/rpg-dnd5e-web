# Decisions — the repo root

One line per entry, dated and linked. Ingest is the writer; entries arrive through its reviewed PR.
A decision reads `- <date> · <the words> · options: <the options it closed> · because: <why> · <link> · upheld: <links, or none yet>`;
a finding, friction or open line reads `- <date> · <the words> · <link>`. A finding that needs more than a line links its case file in `findings/`.
Friction names both entries and never settles them.

## Decisions

- none yet

## Findings

- 2026-10-29 · a studio cast member is derived, never stored: castOf() yields one member per monster ref found in templates, scene.creaturePalette or a placement, with the first palette entry's name, look and faction as defaults stamped onto NEW placements only (R3/R4). Temper, the named table, weapons order, options, holds and arrives live on the placement's binding and are edited in the inspector's CreatureOrders, not on the cast member. An inline `on:` table on a creature is carried read-only by the operator's ruling "there should be no inline table defined on a monster anymore". scene.creaturePalette is editor metadata and never reaches play · [cast.ts](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/a98893391df560dccbc31f871e027cc1c6264608/src/concepts/world-building/cast.ts#L120-L125), [SitePolicies.tsx CreatureOrders](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/a98893391df560dccbc31f871e027cc1c6264608/src/concepts/world-building/SitePolicies.tsx#L2291), [SitePolicies.tsx inline table](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/a98893391df560dccbc31f871e027cc1c6264608/src/concepts/world-building/SitePolicies.tsx#L2400-L2425), survey [rpg-project#714](https://github.com/KirkDiggler/rpg-project/issues/714)
- 2026-10-29 · the studio carries two engine shapes in the document with no form: cells and routes on toward (`{ at: {q, r} }`, `{ path: [{q, r, wait?, facing?}] }`) show in words and are kept as written with "no picker offers one yet", so every castle patrol is marked "Hand edit"; addActions and dropActions exist only in the codecs and no .tsx references them; [rpg-project#720](https://github.com/KirkDiggler/rpg-project/issues/720) and [rpg-project#721](https://github.com/KirkDiggler/rpg-project/issues/721) are the forms · [TablesPanel.tsx](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/a98893391df560dccbc31f871e027cc1c6264608/src/concepts/world-building/TablesPanel.tsx#L30-L32), [SitePolicies.tsx](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/a98893391df560dccbc31f871e027cc1c6264608/src/concepts/world-building/SitePolicies.tsx#L1176-L1180), [monsterTemplates.ts](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/a98893391df560dccbc31f871e027cc1c6264608/src/concepts/world-building/monsterTemplates.ts#L24-L27), [roomDraft.ts](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/a98893391df560dccbc31f871e027cc1c6264608/src/concepts/world-building/roomDraft.ts#L241-L245), survey [rpg-project#714](https://github.com/KirkDiggler/rpg-project/issues/714)

## Friction

- none yet

## Open

- none yet
