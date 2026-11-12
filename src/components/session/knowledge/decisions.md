# Decisions — src/components/session

One line per entry, dated and linked. Ingest is the writer; entries arrive through its reviewed PR.
A decision reads `- <date> · <the words> · options: <the options it closed> · because: <why> · <link> · upheld: <links, or none yet>`;
a finding, friction or open line reads `- <date> · <the words> · <link>`. A finding that needs more than a line links its case file in `findings/`.
Friction names both entries and never settles them.

## Decisions

- none yet

## Findings

- 2026-11-04 · A footprint doorway marked crossing belongs to movement/fog, not a rendered wall gap or leaf. With a door-state map present, a missing DoorInfo entry fails closed; held direction with missing/ambiguous side information also reads as both ways. · https://github.com/KirkDiggler/rpg-dnd5e-web/blob/3d33799299c7f132479ba29c6f58a81a5f151976/knowledge/runs/2026-11-04-the-guard-holds-the-gate-s1b-web.md, https://github.com/KirkDiggler/rpg-dnd5e-web/blob/3d33799299c7f132479ba29c6f58a81a5f151976/knowledge/runs/2026-11-04-the-guard-holds-the-gate-s1c-web.md
- 2026-11-03 · The S1 planner-only benchmark reports median 198 ms for one search and 390 ms for two on a 30,276-cell open floor with an unreachable goal. A search meeting a walk-into obstruction may pay twice even for an unrelated blocked goal; these are revision-scoped measurements, not a current end-to-end latency claim. · https://github.com/KirkDiggler/rpg-dnd5e-web/blob/3d33799299c7f132479ba29c6f58a81a5f151976/knowledge/runs/2026-11-03-the-guard-holds-the-gate-s1-web.md
- 2026-11-12 · Inspection reads exact raw UTF-8 JSON, never a fallback Struct, and distinguishes a missing observation from actual zero, false or an empty string. Symbols outlive the visible row ring; unavailable older evidence remains explicit rather than becoming an unbounded second log. · https://github.com/KirkDiggler/rpg-dnd5e-web/blob/e00205d863b0f98706003d092a19465f66ca622a/knowledge/runs/2026-11-08-machine-inspection-reader.md, https://github.com/KirkDiggler/rpg-dnd5e-web/blob/e00205d863b0f98706003d092a19465f66ca622a/knowledge/runs/2026-11-09-lossless-live-inspection.md
- 2026-11-12 · Click-to-attack walks to the server-provided approach and swings only after reaching that requested cell and receiving a fresh offer in reach. A cut-short or refused walk sends no attack, and an unavailable action is not repaired by client reach arithmetic. · https://github.com/KirkDiggler/rpg-dnd5e-web/blob/e00205d863b0f98706003d092a19465f66ca622a/knowledge/runs/2026-11-05-click-a-hostile-to-attack-web.md
- 2026-11-12 · Speech presentation at a creature derives from the current notice rather than an independent timer, so dismissal removes both. A remembered body or ghost draws no speech, and the bump itself is not a duplicate speech toast. · https://github.com/KirkDiggler/rpg-dnd5e-web/blob/e00205d863b0f98706003d092a19465f66ca622a/knowledge/runs/2026-11-05-the-guard-holds-the-gate-s2-web.md
- 2026-11-12 · Canceling an addressed interaction dismisses that guard/interaction pair until a fresh offer clears the address. A manual Speak cancellation cannot immediately reopen the same hail; the panel remains driven by current offers and respects an already-armed interaction. · https://github.com/KirkDiggler/rpg-dnd5e-web/blob/e00205d863b0f98706003d092a19465f66ca622a/knowledge/runs/2026-11-11-gate-s3-hail-opens-the-panel.md
- 2026-11-12 · Ending dismissal state belongs to the keyed ending lifecycle. A passive mount reset can overwrite a Dismiss click already issued against committed DOM; an ordering regression before passive effects distinguishes this from a timer or loading delay. · https://github.com/KirkDiggler/rpg-dnd5e-web/blob/e00205d863b0f98706003d092a19465f66ca622a/knowledge/runs/2026-11-09-run-ended-dismissal.md

## Friction

- 2026-11-12 · The early held-door preview forbids occupied goal cells; the later bump contract permits walking up to a visibly blocking body and stopping before it. A pass-through body remains an invalid walk end, and a closed physical door is not opened by player path planning. · https://github.com/KirkDiggler/rpg-dnd5e-web/blob/3d33799299c7f132479ba29c6f58a81a5f151976/knowledge/runs/2026-11-03-the-guard-holds-the-gate-s1-web.md, https://github.com/KirkDiggler/rpg-dnd5e-web/blob/3d33799299c7f132479ba29c6f58a81a5f151976/knowledge/runs/2026-11-04-the-guard-holds-the-gate-s1b-web.md, https://github.com/KirkDiggler/rpg-dnd5e-web/blob/3d33799299c7f132479ba29c6f58a81a5f151976/knowledge/runs/2026-11-04-the-guard-holds-the-gate-s1c-web.md, https://github.com/KirkDiggler/rpg-toolkit/blob/1f66f3c7dc1a1d293d19cda89a7a4f1b9397613d/rulebooks/dnd5e/knowledge/runs/2026-11-05-the-guard-holds-the-gate-s2-encounter.md, https://github.com/KirkDiggler/rpg-toolkit/blob/1f66f3c7dc1a1d293d19cda89a7a4f1b9397613d/rulebooks/dnd5e/knowledge/runs/2026-11-05-the-guard-holds-the-gate-s2-session.md, https://github.com/KirkDiggler/rpg-dnd5e-web/blob/e00205d863b0f98706003d092a19465f66ca622a/knowledge/runs/2026-11-05-click-a-hostile-to-attack-web.md

## Open

- 2026-11-04 · The held-door preview ignores a heard-only holder because sightingEntities marks any currentVia without sight as remembered; the proto’s empty-current_via wording is broader. Keep that boundary explicit when aligning passage and hold previews, while the server remains authoritative at the step. · https://github.com/KirkDiggler/rpg-dnd5e-web/blob/3d33799299c7f132479ba29c6f58a81a5f151976/knowledge/runs/2026-11-04-the-guard-holds-the-gate-s1b-web.md
