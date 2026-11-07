# Run — 2026-11-07 — behavior source preservation

Part of [live adoption #866](https://github.com/KirkDiggler/rpg-project/issues/866), under [story #859](https://github.com/KirkDiggler/rpg-project/issues/859).

## Shipped

- Prepared source-preservation tests for complete canonical patrol and served-castle YAML; no runtime codec or dedicated behavior panel change was necessary — [#866](https://github.com/KirkDiggler/rpg-project/issues/866).

## Decided

- Used existing unread-field carry and ordinary region-lighting edits, then local JSON save/reload and YAML export, rather than introducing a client behavior grammar — [R7](https://github.com/KirkDiggler/rpg-project/pull/877).
- Kept unrelated unknown metadata intact in Studio while expecting the actual server to refuse unsupported source keys; preservation is not semantic permission — [source boundary](https://github.com/KirkDiggler/rpg-project/pull/877).

## Found

- Four focused tests preserve ordered definitions/bindings, changed two-to-three-item routes, explicit empty versus absent lists, and supplied false/zero/empty strings — [#866](https://github.com/KirkDiggler/rpg-project/issues/866).
- The builder's real authoring endpoint compiled all five valid Studio exports (castle: 1586 cells; patrol variants: 57), preserved saved source byte-for-byte, and returned field errors for the unrelated-metadata control — [#866](https://github.com/KirkDiggler/rpg-project/issues/866).
- A fresh browser rendered the builder-owned live game with no unexpected errors; development StrictMode cleanup still logs three expected aborted requests — [#866](https://github.com/KirkDiggler/rpg-project/issues/866).

## Mistaken

- The first visual capture ran before model loading completed; a settled fresh load and inspected screenshot, not canvas existence alone, established that the board and characters rendered — [#866](https://github.com/KirkDiggler/rpg-project/issues/866).
