# Run — 2026-11-27 — status effects S2 the engine says a status back

Slice [rpg-project#1217](https://github.com/KirkDiggler/rpg-project/issues/1217) of story [rpg-project#1214](https://github.com/KirkDiggler/rpg-project/issues/1214). Base: `rpg-dnd5e-web` `dev` at [`2e09fd20`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/2e09fd20).

## Shipped

- The selected status shows `What it does` from `AuthoringService.SayStatus` above "As written": the sentence, the parts, each refusal with its path, or one line when the engine cannot be asked — [rpg-project#1217](https://github.com/KirkDiggler/rpg-project/issues/1217).

## Decided

- The hook derives `idle` and `loading` from the ask's key (id plus the JSON of `written`) rather than resetting state in an effect, so a previous status's sentence never shows for a frame — [rpg-project#1217](https://github.com/KirkDiggler/rpg-project/issues/1217).
- `StudioStatuses` takes `enabled` (default false) and an optional `client` so the page tests drive a fake engine — [rpg-project#1217](https://github.com/KirkDiggler/rpg-project/issues/1217).

## Found

- The pinned protos are v0.1.292; the issue says v0.1.291, and both carry `SayStatus` — [rpg-project#1217](https://github.com/KirkDiggler/rpg-project/issues/1217).

## Mistaken

- The first stale-answer test flushed two microtasks, fewer than the hook's promise chain, so the mutant that kept stale answers survived; it now waits a timer tick and the mutant fails — [rpg-project#1217](https://github.com/KirkDiggler/rpg-project/issues/1217).
