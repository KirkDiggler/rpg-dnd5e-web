# Run — 2026-11-27 — Status effects S3 the form draws a status

Slice [rpg-project#1219](https://github.com/KirkDiggler/rpg-project/issues/1219) of story [rpg-project#1214](https://github.com/KirkDiggler/rpg-project/issues/1214). Base: `rpg-dnd5e-web` `dev` at [`2e09fd20`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/2e09fd20).

## Shipped

- `WordsForm` draws a status from the engine's status words: one word per list entry, narrowing `when` words that follow the change, `positive whole number`; nothing mounts it yet — [rpg-project#1219](https://github.com/KirkDiggler/rpg-project/issues/1219).

## Decided

- The choice of WHAT on an entry is labelled with each word's own label with its `{value}` mark removed, and named "What the <place> is"; the issue said "labelled the way the form labels words today" — [rpg-project#1219](https://github.com/KirkDiggler/rpg-project/issues/1219).
- A `narrows` word with no allowed inner word but a written value is drawn through the existing "also written" line, whole, not hidden — [rpg-project#1219](https://github.com/KirkDiggler/rpg-project/issues/1219).

## Found

- An entry whose key is a pick never given a value stays `{}` in the file; the pick lives only in the entry's local state and is lost if an earlier entry is removed — [rpg-project#1219](https://github.com/KirkDiggler/rpg-project/issues/1219).

## Mistaken

- none observed — [rpg-project#1219](https://github.com/KirkDiggler/rpg-project/issues/1219).
