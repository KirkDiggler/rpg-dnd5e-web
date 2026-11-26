# Run — 2026-11-26 — The vendor popover on the renamed contract

The third leg of the R2 wave ([rpg-project#1155](https://github.com/KirkDiggler/rpg-project/pull/1155#issuecomment-7186155785)): the contract's leg is [rpg-api-protos#457](https://github.com/KirkDiggler/rpg-api-protos/pull/457), the api's is [rpg-api#1292](https://github.com/KirkDiggler/rpg-api/pull/1292).

## Shipped

- The pin at `v0.1.292`, the lock resolving to `430c294`; six reads in the vendor popover and fifteen fixtures on the new key — [https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1493](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1493).

## Decided

- Only the contract's key moves: `activeVendor.descriptor` and the gesture's `descriptor` are the web's own names and stay — [https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1493](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1493).
- The fixtures move with the reads although no type check asks them to: a fake response that keeps the old key passes `tsc` and fails the user — [https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1493](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1493).
- The PR states its order of deploy against the api's leg, because with Connect JSON the key follows the name — [https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1493](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1493).

## Found

- On the new pin and before the fix: `tsc` names six reads and nothing else; thirteen vendor tests fail at runtime — [https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1493](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1493).
- The package is consumed as the tag's tarball from GitHub and is not on the public npm registry; its types sit under `gen/ts/` inside the package — [proto-updates](https://github.com/KirkDiggler/rpg-dnd5e-web/blob/dev/docs/how-to/proto-updates.md).
- A longer key takes two one-line object literals past Prettier's width; the gate's first stage is format, and it names the files — [https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1493](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1493).

## Mistaken

- The gate's summary was read through a filter that hid which stage had failed; the log was read again for the failure itself — [https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1493](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1493).
