# Run — 2026-11-21 — A selected creature lists the conversations it carries

Issue [rpg-project#1059](https://github.com/KirkDiggler/rpg-project/issues/1059), slice 6 of [rpg-project#1037](https://github.com/KirkDiggler/rpg-project/issues/1037). Base: `rpg-dnd5e-web` `dev`. Tests ran on Node v22.16.0.

## Shipped

- **Context member.** `SharedLinesInForm` gains an optional `carriedBy(kind, id)`; `NO_SHARED_LINES` leaves it undefined ([#1059](https://github.com/KirkDiggler/rpg-project/issues/1059)).
- **From the read-back.** `sharedLinesInForm` computes the conversations once and answers `carriedBy` from each conversation's `carriers`, in the engine's order, with `linePaths.length` as the line count ([#1059](https://github.com/KirkDiggler/rpg-project/issues/1059)).
- **The list.** New `CarriedConversations` renders a "Conversations" section of buttons, one per conversation, under the creature's read-back in the Inspector; plain text where no page opens ([#1059](https://github.com/KirkDiggler/rpg-project/issues/1059)).
- **Style.** One CSS block at the end of `encounterStudio.css` ([#1059](https://github.com/KirkDiggler/rpg-project/issues/1059)).

## Decided

- The creature's display name for the section's aria-label is `selectionName(arrange, session)`, already imported in `StudioInspector.tsx`, so no prop was threaded ([#1059](https://github.com/KirkDiggler/rpg-project/issues/1059)).

## Found

- The Inspector is not a literal child of the provider's JSX: `surface` (which holds `<StudioInspector`) is built first and then wrapped as `{surface}` inside the provider, so F5 holds by wrapping ([#1059](https://github.com/KirkDiggler/rpg-project/issues/1059)).

## Mistaken

- The worktree had no `node_modules`; `npm ci` fixed it before the first run ([#1059](https://github.com/KirkDiggler/rpg-project/issues/1059)).
