# Run — 2026-11-17 — studio today S15 reveal, jumps and places (S16 list piece follows)

Slices [rpg-project#983](https://github.com/KirkDiggler/rpg-project/issues/983) and [rpg-project#984](https://github.com/KirkDiggler/rpg-project/issues/984) of story [rpg-project#966](https://github.com/KirkDiggler/rpg-project/issues/966). Base: `rpg-dnd5e-web` `dev` at [`9cd199b5`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/9cd199b5). This PR carries the reveal contract, the jumps and the place names (A + C); the list-and-detail piece (B, #984) follows in its own PR on top.

## Shipped

- One reveal contract (`useReveal.ts`, `reveal.tsx`): an item registers under a key `{kind, id, part?}`; a reveal opens what hides it, scrolls it within its own scroll container, focuses it when it can, and marks it briefly — [rpg-project#983](https://github.com/KirkDiggler/rpg-project/issues/983).
- Every studio jump resolves through the one path map to a reveal key (`revealKey.ts`), so it lands on the line, row, post, faction, record, secret, ending, conversation, bundle, behaviour or join it names — [rpg-project#983](https://github.com/KirkDiggler/rpg-project/issues/983).
- `placeName(path, document)` names a place in the file in words; every visible path is now words with the raw path as its title — [rpg-project#983](https://github.com/KirkDiggler/rpg-project/issues/983).

## Decided

- A key's `part` is the rest of the file path after the thing (`options[1].failure[0].recognize`), so items register by the same path the engine and the server write and a jump's key always agrees with an item's — [rpg-project#983](https://github.com/KirkDiggler/rpg-project/issues/983).
- An unclaimed key waits 700 ms, then settles on the nearest registered ancestor — the same thing with a shorter part, then the thing — and marks nothing when none is registered — [rpg-project#983](https://github.com/KirkDiggler/rpg-project/issues/983).
- The scroll is the container's own (`scrollTo` on the nearest `overflow: auto|scroll` ancestor); only an item with no such ancestor uses `scrollIntoView({block: 'nearest'})` — [rpg-project#983](https://github.com/KirkDiggler/rpg-project/issues/983).
- A statement's place inside the selection itself (its line, its row) is now a link too, because it reveals that place in the form below; while stale the place is text, as before — [rpg-project#983](https://github.com/KirkDiggler/rpg-project/issues/983).
- A jump to a creature or prop centres the Layout on it at the current zoom; it does not test whether the thing was already in view, because the Layout surface exposes no visible-bounds query to the workspace — [rpg-project#983](https://github.com/KirkDiggler/rpg-project/issues/983).
- The work is split: reveal, jumps and place names here; the list-and-detail piece in the next PR on top, so each is reviewable — [lead's brief](https://github.com/KirkDiggler/rpg-project/issues/983).

## Found

- Rows already carried their file path (`at`) for refusals (`useRowRefusalsAt`); registering that path made every table, bundle and option row a reveal target with no new identity — [rpg-project#983](https://github.com/KirkDiggler/rpg-project/issues/983).

## Mistaken

- The first cut exported hooks and components from one file, which the fast-refresh lint refuses; the providers moved to `reveal.tsx` and the hooks to `useReveal.ts` before the PR — [rpg-project#983](https://github.com/KirkDiggler/rpg-project/issues/983).
