# Run — 2026-11-21 — no view switching S2 party start and creature move on both maps

Slice [rpg-project#1069](https://github.com/KirkDiggler/rpg-project/issues/1069) of story [rpg-project#1065](https://github.com/KirkDiggler/rpg-project/issues/1065). Base: `rpg-dnd5e-web` `dev` at [`7b5c8506`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/7b5c8506).

## Shipped

- "Move party start", "Place party start" and "Move creature" arm in the map view the author is in; on the Layout the next floor click places the party start or moves the creature — [rpg-project#1069](https://github.com/KirkDiggler/rpg-project/issues/1069).

## Decided

- The Layout writes through `session.commitArrange` (move) and a new session intent `placePartyStartAt` (armed party start); the 3D viewport callbacks stay fenced, per the lead's ruling — [ruling](https://github.com/KirkDiggler/rpg-project/issues/1069#issuecomment-7058331283).
- The Encounter-side Move test was rewritten to expect the Layout view last used, as the issue directs — [rpg-project#1069](https://github.com/KirkDiggler/rpg-project/issues/1069).

## Found

- `guardViewportCallback` refuses `onMoveMonster` and `onStartGesture` while the view is Layout, so the issue's first design could not work — [gap](https://github.com/KirkDiggler/rpg-project/issues/1069#issuecomment-7058322729).
- The only author-facing sentence naming 3D for these buttons was the "Move party start" help in `StudioInspector.tsx` — [rpg-project#1069](https://github.com/KirkDiggler/rpg-project/issues/1069).

## Mistaken

- Ran prettier with an unsplit zsh variable, so it formatted nothing at first; caught by the explicit rerun before commit — [rpg-project#1069](https://github.com/KirkDiggler/rpg-project/issues/1069).
