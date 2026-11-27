# Run — 2026-11-27 — Status effects S4 change a status in a form

Slice [rpg-project#1220](https://github.com/KirkDiggler/rpg-project/issues/1220) of story [rpg-project#1214](https://github.com/KirkDiggler/rpg-project/issues/1214). Base: `rpg-dnd5e-web` `dev` at [`784d5597`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/784d5597).

## Shipped

- The selected status on the Status effects page has a Change form drawn from the engine's status words, written as each change is made (one undoable step each), with the engine's refusals at `statuses.<id>` shown on it — [rpg-project#1220](https://github.com/KirkDiggler/rpg-project/issues/1220).
- Three fixes in "What it does": no leading colon for an empty path, no bare heading for an empty answer, a test that one part is not repeated as a list — [rpg-project#1220](https://github.com/KirkDiggler/rpg-project/issues/1220).

## Decided

- The "no words" and "not a block" sentences are copies of the Items wording with "status" for "item", held in `StudioStatuses.tsx` and not imported, as the issue said — [rpg-project#1220](https://github.com/KirkDiggler/rpg-project/issues/1220).
- `setStatus` also throws when the status's block is not an object, not only when `statuses` is not a mapping or the id is absent; the issue listed all three refusals — [rpg-project#1220](https://github.com/KirkDiggler/rpg-project/issues/1220).

## Found

- Nothing in section 3 differed from the code at base — [rpg-project#1220](https://github.com/KirkDiggler/rpg-project/issues/1220).
- No test reached the Items intent `commitCustomItem` with a throwing edit; the status test reaches `commitStatus` by wrapping the real page to keep the props it was given — [rpg-project#1220](https://github.com/KirkDiggler/rpg-project/issues/1220).

## Mistaken

- none observed — [rpg-project#1220](https://github.com/KirkDiggler/rpg-project/issues/1220).
