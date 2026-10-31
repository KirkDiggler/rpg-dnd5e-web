# Run — 2026-10-31 — Server at scale S9 floor input bounds

Slice [rpg-project#765](https://github.com/KirkDiggler/rpg-project/issues/765) of story [rpg-project#753](https://github.com/KirkDiggler/rpg-project/issues/753). Base: `rpg-dnd5e-web` `dev` at [48f8ff52](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/48f8ff52).

## Shipped

- Prepared floor-derived click-plane geometry and regression coverage; merge and live acceptance remain pending — [slice](https://github.com/KirkDiggler/rpg-project/issues/765).

## Decided

- Derive the input plane from visible floor cells, padding the centers by a hex radius, so geometry follows actual scale and offset without changing existing floor/path validation — [scope](https://github.com/KirkDiggler/rpg-project/issues/765).
- Keep the empty loading surface finite; recalculate bounds when the visible floor changes rather than using a larger hard-coded limit — [scope](https://github.com/KirkDiggler/rpg-project/issues/765).

## Found

- The former plane stopped at world x/z ±100 even when rendered floor extended farther; automated coverage now includes a 29,450-cell offset floor and a distant single tile — [regression](https://github.com/KirkDiggler/rpg-project/issues/765).
- The focused SessionCanvas, bounds, interaction and movement suites pass 147 tests; TypeScript checking passed, but that does not demonstrate a live cross-boundary move — [acceptance checklist](https://github.com/KirkDiggler/rpg-project/issues/765).

## Mistaken

- The first cut updated only the older HexGrid renderer, while the regular client uses SessionCanvas with its own fixed plane. The operator reported the unchanged boundary; a real SessionCanvas mesh raycast then reproduced the miss before both routes adopted the helper. Live traversal remains pending — [pending acceptance](https://github.com/KirkDiggler/rpg-project/issues/765).
