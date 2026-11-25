# Run — 2026-11-21 — Room to work: wide Encounter screens, two-column line form

processed: 2026-11-25T190427Z

Issue [rpg-project#1057](https://github.com/KirkDiggler/rpg-project/issues/1057), part of [rpg-project#1037](https://github.com/KirkDiggler/rpg-project/issues/1037). Base: `rpg-dnd5e-web` `dev`. CSS only, one file.

## Shipped

- **Width.** `.es-encounter-home > *` caps at `110rem` instead of `72rem` ([#1057](https://github.com/KirkDiggler/rpg-project/issues/1057)).
- **Two columns.** `.es-line-card-form` is a size container; at 60rem or wider `.wb-option` flows in two CSS columns and the second starts at "Moves the conversation" ([#1057](https://github.com/KirkDiggler/rpg-project/issues/1057)).

## Decided

- Breakpoint, column gap and the column break were given by the issue; nothing else was chosen ([#1057](https://github.com/KirkDiggler/rpg-project/issues/1057)).

## Found

- The test environment does not lay out CSS, so the look is the lead's ([#1057](https://github.com/KirkDiggler/rpg-project/issues/1057)).
- `vitest run src/concepts/encounter-studio src/concepts/world-building` takes about 280 seconds, over the default shell timeout ([#1057](https://github.com/KirkDiggler/rpg-project/issues/1057)).

## Mistaken

- My first test run went to a background task at the 120s timeout; I stopped it and reran in the foreground ([#1057](https://github.com/KirkDiggler/rpg-project/issues/1057)).
