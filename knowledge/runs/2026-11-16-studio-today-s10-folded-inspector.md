# Run — 2026-11-16 — studio today S10 folded inspector

processed: 2026-11-25T190427Z

Slice [rpg-project#978](https://github.com/KirkDiggler/rpg-project/issues/978) of story [rpg-project#966](https://github.com/KirkDiggler/rpg-project/issues/966). Base: `rpg-dnd5e-web` `dev` at [`70c53abb`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/70c53abb).

## Shipped

- The inspector's read-back shows the engine's folded entries for the selection by default, each opening to the full statements it stands for; protos pinned at `v0.1.280` — [rpg-project#978](https://github.com/KirkDiggler/rpg-project/issues/978).
- A Folded / Full switch, remembered per viewer in `localStorage`; Full is the merged view; no `folded` on the wire falls back to Full — [rpg-project#978](https://github.com/KirkDiggler/rpg-project/issues/978).

## Decided

- An entry is shown for the selection when one of its own `paths` is the selection's own (every statement of the matching full section set at that path is a selected statement); otherwise its entries are tried; the shallowest match is shown whole. This is because a folded entry carries no subject and paths collide across subjects: 135 of the castle's 479 paths are set by statements about more than one thing (the grate's relocate rows are also the paths of the joins they make) — [rpg-project#978](https://github.com/KirkDiggler/rpg-project/issues/978).
- Only the folded section with the same title as a full section that holds a selected statement is searched, because `Folded()` folds each full section into the folded one of the same title — [rpg-project#978](https://github.com/KirkDiggler/rpg-project/issues/978).
- An opened entry shows only the selected statements set at its own paths, because a path can be shared with other things (keep-1, keep-2 and the Mad King all speak `factions[1].options`) and the inspector speaks of the selection — [review](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1438#pullrequestreview-5912930474).
- `base` is not rendered: opened statements already show their whole path as the Full view does, and `base` is a display hint for the engine's text writer — [rpg-project#978](https://github.com/KirkDiggler/rpg-project/issues/978).
- A selected statement behind no shown entry is listed under "Said in full only" rather than dropped — [rpg-project#978](https://github.com/KirkDiggler/rpg-project/issues/978).

## Found

- The engine folds the captain's `troupe`, `come-quietly` and `never-alive` lines into one entry, "Guard Captain (captain) has the same 3 lines as Guard (gate-1): …". The entry carries the captain's own paths; the troupe line with its requirements entry is said under gate-1 only — [rpg-project#978](https://github.com/KirkDiggler/rpg-project/issues/978).
- The engine says a line's requirements in one entry ("Offered while: the speaker knows the fact `feast-tonight` and `front-gate` is in `fresh` or `warned-guest`."), not one entry per requirement — [rpg-project#978](https://github.com/KirkDiggler/rpg-project/issues/978).
- On the castle at toolkit `main` cdc616bd, the captain has 75 statements in full (48 his own, 27 of `captain-policy`), said in 44 folded entries; every one is reachable, and none falls to "said in full only". The same holds for gate-1, gate-2, the grate, the altar, the cook, the pedlar, prisoner-1 and the ledger — [rpg-project#978](https://github.com/KirkDiggler/rpg-project/issues/978).
- `cmd/readback -json` prints the statements without `folded`; the fixture came from a throwaway main that marshals `rb.Folded()` beside the read-back — [rpg-project#978](https://github.com/KirkDiggler/rpg-project/issues/978).

## Mistaken

- The first head opened an entry to every statement at its paths, so keep-1's "No lines of its own" opened to keep-2's and the king's sentences; the trimmed fixture held no shared entry, so no test saw it. Review found it on the untrimmed castle; the fixture now carries the three knights' and king's entries and a test fails without the fix — [review](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1438#pullrequestreview-5912930474).
