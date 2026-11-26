# Run — 2026-11-27 — Status effects S6 a line's row gives a status

Slice [rpg-project#1222](https://github.com/KirkDiggler/rpg-project/issues/1222) of story [rpg-project#1214](https://github.com/KirkDiggler/rpg-project/issues/1214). Base: `rpg-dnd5e-web` `dev` at [`784d5597`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/784d5597).

## Shipped

- A line's row can give a status effect (Status, To, Rounds), and a row that already gives one shows it instead of "Nothing" — [rpg-project#1222](https://github.com/KirkDiggler/rpg-project/issues/1222).

## Decided

- The receivers read "The speaker", "The speaker’s party in sight", "The one spoken to", the voice of a give's About; a prop is offered only the speaker — [rpg-project#1222](https://github.com/KirkDiggler/rpg-project/issues/1222).
- A value written outside what is offered (a status id, a receiver) is shown as its own option and kept on every edit — [rpg-project#1222](https://github.com/KirkDiggler/rpg-project/issues/1222).

## Found

- The prop-line test in `rowGrantsRoundTrip.test.tsx` pinned the offered grants as `['', 'tells', 'relocate']`; the issue offers the status to props too, so that one assertion now lists `apply_status` — [rpg-project#1222](https://github.com/KirkDiggler/rpg-project/issues/1222).

## Mistaken

- none observed — [rpg-project#1222](https://github.com/KirkDiggler/rpg-project/issues/1222).
