# Run — 2026-11-27 — Items not-a-mapping notice and spacing

Slice [rpg-project#1218](https://github.com/KirkDiggler/rpg-project/issues/1218) of story [rpg-project#1185](https://github.com/KirkDiggler/rpg-project/issues/1185). Base: `rpg-dnd5e-web` `dev` at [`25cd3078`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/25cd3078).

## Shipped

- The Items page shows a `customItems` that is not a mapping as written, and its empty sentence no longer says the site has none; the item form's tick spacing, label size and the Equipped row's spacing are fixed in CSS — [rpg-project#1218](https://github.com/KirkDiggler/rpg-project/issues/1218).

## Decided

- The notice and empty sentence mirror the Status effects page (PR 1495, not yet on `dev`), with "items" for "statuses", as the issue's Path says — [rpg-project#1218](https://github.com/KirkDiggler/rpg-project/issues/1218).
- Every label of the form reads at the group legend's size (`--es-text-label`), at any depth; the issue named the symptom, not the size — [rpg-project#1218](https://github.com/KirkDiggler/rpg-project/issues/1218).

## Found

- The cause of the label size: `.wb-panel label > span` (0.65rem) shrinks a top-level label's words while a box-first label in a group stays at the inherited 14px — [rpg-project#1218](https://github.com/KirkDiggler/rpg-project/issues/1218).
- The detail headings already have `margin-top: 1.1rem` from `.es-items .es-threads-thread h3` (#1492); a static replica of the page computes 17.6px above each, so no CSS was added for it — [rpg-project#1218](https://github.com/KirkDiggler/rpg-project/issues/1218).

## Mistaken

- none observed — [rpg-project#1218](https://github.com/KirkDiggler/rpg-project/issues/1218).
