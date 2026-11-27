# Run — 2026-11-27 — status effects S5 new and delete

Slice [rpg-project#1221](https://github.com/KirkDiggler/rpg-project/issues/1221) of story [rpg-project#1214](https://github.com/KirkDiggler/rpg-project/issues/1214). Base: `rpg-dnd5e-web` `dev` at [`e1d13e14`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/e1d13e14).

## Shipped

- New status by name and Delete status on the Status effects page, with `addStatus` / `removeStatus` session intents — [rpg-project#1221](https://github.com/KirkDiggler/rpg-project/issues/1221).
- "What it does" stays on the page, dimmed and busy, while the same status is asked again — [rpg-project#1221 comment](https://github.com/KirkDiggler/rpg-project/issues/1221).

## Decided

- `statusIdFrom` is its own function in `statusEdit.ts` with the fallback `status`, because moving `itemIdFrom` would have edited `itemEdit.ts` beyond a re-export — [rpg-project#1221](https://github.com/KirkDiggler/rpg-project/issues/1221).
- `was` carries only a said or refused answer, as the issue states; an unavailable answer is not kept across an ask — [rpg-project#1221](https://github.com/KirkDiggler/rpg-project/issues/1221).

## Found

- The site with no statuses in the integration suite is `cloak-and-ring-walk.yaml`; the served castle already has statuses — [rpg-project#1221](https://github.com/KirkDiggler/rpg-project/issues/1221).

## Mistaken

- none observed — [rpg-project#1221](https://github.com/KirkDiggler/rpg-project/issues/1221).
