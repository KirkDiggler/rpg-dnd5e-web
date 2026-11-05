# Decisions — src/components/session

One line per entry, dated and linked. Ingest is the writer; entries arrive through its reviewed PR.
A decision reads `- <date> · <the words> · options: <the options it closed> · because: <why> · <link> · upheld: <links, or none yet>`;
a finding, friction or open line reads `- <date> · <the words> · <link>`. A finding that needs more than a line links its case file in `findings/`.
Friction names both entries and never settles them.

## Decisions

- none yet

## Findings

- 2026-11-04 · Path preview first routes around blocking bodies and held steps, then permits a walk-into only when no route exists and the first search meets an eligible neutral/allied obstruction. The goal cannot be an occupied body cell; directional hold eligibility is per directed step, and any hostile/unknown holder barring that step refuses it. A physically shut door stays shut on both plans. · https://github.com/KirkDiggler/rpg-dnd5e-web/blob/3d33799299c7f132479ba29c6f58a81a5f151976/knowledge/runs/2026-11-03-the-guard-holds-the-gate-s1-web.md, https://github.com/KirkDiggler/rpg-dnd5e-web/blob/3d33799299c7f132479ba29c6f58a81a5f151976/knowledge/runs/2026-11-04-the-guard-holds-the-gate-s1b-web.md, https://github.com/KirkDiggler/rpg-dnd5e-web/blob/3d33799299c7f132479ba29c6f58a81a5f151976/knowledge/runs/2026-11-04-the-guard-holds-the-gate-s1c-web.md
- 2026-11-04 · A footprint doorway marked crossing belongs to movement/fog, not a rendered wall gap or leaf. With a door-state map present, a missing DoorInfo entry fails closed; held direction with missing/ambiguous side information also reads as both ways. · https://github.com/KirkDiggler/rpg-dnd5e-web/blob/3d33799299c7f132479ba29c6f58a81a5f151976/knowledge/runs/2026-11-04-the-guard-holds-the-gate-s1b-web.md, https://github.com/KirkDiggler/rpg-dnd5e-web/blob/3d33799299c7f132479ba29c6f58a81a5f151976/knowledge/runs/2026-11-04-the-guard-holds-the-gate-s1c-web.md
- 2026-11-03 · The S1 planner-only benchmark reports median 198 ms for one search and 390 ms for two on a 30,276-cell open floor with an unreachable goal. A search meeting a walk-into obstruction may pay twice even for an unrelated blocked goal; these are revision-scoped measurements, not a current end-to-end latency claim. · https://github.com/KirkDiggler/rpg-dnd5e-web/blob/3d33799299c7f132479ba29c6f58a81a5f151976/knowledge/runs/2026-11-03-the-guard-holds-the-gate-s1-web.md

## Friction

- none yet

## Open

- 2026-11-04 · The held-door preview ignores a heard-only holder because sightingEntities marks any currentVia without sight as remembered; the proto’s empty-current_via wording is broader. Keep that boundary explicit when aligning passage and hold previews, while the server remains authoritative at the step. · https://github.com/KirkDiggler/rpg-dnd5e-web/blob/3d33799299c7f132479ba29c6f58a81a5f151976/knowledge/runs/2026-11-04-the-guard-holds-the-gate-s1b-web.md
