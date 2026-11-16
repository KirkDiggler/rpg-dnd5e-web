# Run — 2026-11-17 — studio today S9 forms (D): a door's fact and a post

Slice [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975) of story [rpg-project#966](https://github.com/KirkDiggler/rpg-project/issues/966), PR D of four, stacked on PR C (branch `studio-forms-outcomes`). Shapes read from rpg-toolkit `origin/main` [`bb5806f7`](https://github.com/KirkDiggler/rpg-toolkit/commit/bb5806f7) `dungeonspec`:

- `single_room.go`: `RoomMonsterBinding.Posts`, `RoomDoorBinding.Opened`
- `states.go`: `HoldsSpec`, `PassSpec`
- `behaviors.go`: a binding's posts lowered — each state resolved, the door a door of the site, `against` both, entering or leaving, each cell floor
- `grammar.go`: `doorOpened`

## Shipped

- **Door fact.** A door's "Fact when it opens" in its inspector, beside its state and lock. Writes `opened: { fact }`; empty removes it — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).
- **Posts as forms.** A creature's posts are now forms: Door (the site's doors), Against (Both ways / Entering / Leaving) and Held from (a count of cells, with Pick on map using the `cells` pick from PR C), beside the pass it already edited. The read-out "Holds <door>, <against>" is gone — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).
- **Adding and removing posts.** A post is added on a state of the creature's behaviour not yet posted, and removed. A creature that runs no behaviour, or whose behaviour's states the file does not write, is told so — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).
- **Pick on map from the inspector.** It now works from the Build inspector, and returns to it when done. Before, it was offered only from Encounter sections, which it returned to — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).

## Decided

- **What the form prevents by construction:**
  - an `opened` with no fact: emptying the field removes the key;
  - a post on a state the behaviour does not have, or on a terminal state: states are offered from the behaviour's `recipe.states`, terminals left out;
  - a post naming no door, or one the site lacks: doors are offered from the site's wall openings, and a new post starts on the first;
  - an `against` other than both, entering or leaving: it is a select.

  — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).

- **Which behaviour supplies the states.** It is the one that supplies the creature's state: its own `behaviorState` binding, else its first, else its faction's. Its `recipe.states` are read straight from the file — names the document holds, no rule of the studio's — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).
- **Empty "Held from" means the creature's own cell.** An empty pick removes `at` and reads "its own cell", as the decoder says (`HoldsSpec`: "No `at` means the cell the creature is placed at") — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).
- **A faction's posts stay file-only.** The decoder allows them, but the studio offers factions no behaviour, and the castle has none — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).

## Found

- **Posts already round-tripped.** `posts` and `opened` were carried as unknown keys, so the form only reads and writes them in place — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).

## Mistaken

- **The no-behaviour note printed the placement id.** The studio never shows that id as text (`StudioInspector.test` › "never prints the placement id"), so the note now reads "This creature runs no behaviour…" — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).
