# Decisions — src/concepts/world-building

One line per entry, dated and linked. Ingest is the writer; entries arrive through its reviewed PR.
A decision reads `- <date> · <the words> · options: <the options it closed> · because: <why> · <link> · upheld: <links, or none yet>`;
a finding, friction or open line reads `- <date> · <the words> · <link>`. A finding that needs more than a line links its case file in `findings/`.
Friction names both entries and never settles them.

## Decisions

- none yet

## Findings

- 2026-11-04 · Unknown dungeon keys travel through the draft with carryUnknownKeys and survive normalization/edit helpers; the studio’s own workspace format remains exact, and retired words, version-forbidden known words and engine-invalid values retain their refusals. State/table names such as `__proto__`, `constructor` and `toString` are authored own properties, not JavaScript prototype lookups. · https://github.com/KirkDiggler/rpg-dnd5e-web/blob/3d33799299c7f132479ba29c6f58a81a5f151976/knowledge/runs/2026-11-03-studio-states.md, https://github.com/KirkDiggler/rpg-dnd5e-web/blob/3d33799299c7f132479ba29c6f58a81a5f151976/knowledge/runs/2026-11-04-the-guard-holds-the-gate-s1c-web.md
- 2026-11-04 · Source text is keyed by a content-derived token rather than room id, persisted beside its draft and bounded to eight in-memory entries; a lost source is disclosed before canonical save. YAML list edits align stable ids or common subsequences, preserve unread data with its item, detach untouched aliases when anchors change, and refuse overlapping edits instead of emitting corrupt text. · https://github.com/KirkDiggler/rpg-dnd5e-web/blob/3d33799299c7f132479ba29c6f58a81a5f151976/knowledge/runs/2026-11-04-the-guard-holds-the-gate-s1c-web.md
- 2026-11-12 · Canonical behavior definitions and ordered bindings survive ordinary edits, local save/reload and YAML export through source preservation without a second client behavior grammar. Preserving unrelated unknown metadata is not permission for the server to execute it. · https://github.com/KirkDiggler/rpg-dnd5e-web/blob/e00205d863b0f98706003d092a19465f66ca622a/knowledge/runs/2026-11-07-behavior-source-preservation.md
- 2026-11-12 · The option grammar accepts nonempty requires lists and refuses an empty list as the compiler does. Unedited advance data remains in unknown-key carry rather than being added to modeled keys that the editor cannot preserve. · https://github.com/KirkDiggler/rpg-dnd5e-web/blob/e00205d863b0f98706003d092a19465f66ca622a/knowledge/runs/2026-11-10-gate-s2-studio-grammar.md
- 2026-11-12 · Ground edits preserve explicit paint even when it equals the base, prune it only when the region loses the cell, and retain unknown native fields. A historically named castle fixture is not evidence that the latest served source imports. · https://github.com/KirkDiggler/rpg-dnd5e-web/blob/e00205d863b0f98706003d092a19465f66ca622a/knowledge/runs/2026-11-06-courtyard-ground.md

## Friction

- none yet

## Open

- 2026-11-04 · Play-contract fields and unknown region-cell-row keys live in source text rather than the draft’s modeled fields; splicing preserves them only while that part remains unchanged. Carrying unknown keys in the draft does not establish unconditional lossless editing for these two shapes. · https://github.com/KirkDiggler/rpg-dnd5e-web/blob/3d33799299c7f132479ba29c6f58a81a5f151976/knowledge/runs/2026-11-04-the-guard-holds-the-gate-s1c-web.md
