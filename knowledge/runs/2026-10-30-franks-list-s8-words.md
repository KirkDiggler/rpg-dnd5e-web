# 2026-10-30 · Frank's list S8 · The studio speaks the engine's new words

Story [rpg-project#714](https://github.com/KirkDiggler/rpg-project/issues/714), slice [rpg-project#732](https://github.com/KirkDiggler/rpg-project/issues/732), PR [rpg-dnd5e-web#1357](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1357).

## Shipped

- `dash: <selector>` with `toward`'s selectors, a cell and a route among them; the route picker offers both on it. `enemy: walk | dash | far` and `threat: none | walk | dash` as row conditions ([rpg-project#671](https://github.com/KirkDiggler/rpg-project/issues/671)).
- The `ally` selector on `toward`, `dash` and `away`; `attack: ally` is refused at the row in mind/behavior's sentence ([rpg-project#717](https://github.com/KirkDiggler/rpg-project/issues/717)).
- `fell: { who, within, on | as }` on a row's `when`, with a Who fell picker over the placed monsters ([rpg-project#716](https://github.com/KirkDiggler/rpg-project/issues/716)).
- A faction's `options`, edited in the Factions panel with the bindings' OptionsEditor; the creature panel and the Read back say a member with no lines speaks its faction's ([rpg-project#718](https://github.com/KirkDiggler/rpg-project/issues/718)).
- Endings: `when: { left: <exit> }`, bare or under `not`, with `outcome` and an optional `if`; the Endings panel authors them ([rpg-project#716](https://github.com/KirkDiggler/rpg-project/issues/716)).
- `until` as one step or a list of steps with `then`, edited as a list in the Dispositions panel ([rpg-project#717](https://github.com/KirkDiggler/rpg-project/issues/717)).
- The web's castle fixture is the toolkit's at rpg-toolkit f6e5e411. The stack's five walk sites are copied under `fixtures/stack-sites/` and all six files import, download byte-stable, and write back every key they were given.

## Decided

- Download writes the encoder's bytes, never the source's. "Byte for byte" is pinned as: the download is a fixed point, and it means the source key for key once rows are heaviest first (R12).
- A list of until steps is shown as numbered steps, each a predicate and a Then select. A list offers the fact form alone, the engine's limit. One step keeps the mapping spelling; removing down to one writes the mapping back.
- A leave ending's outcome has no "(not stated)" choice, so the form never writes the refused shape. Any other ending may state one or not, as the engine allows.
- The Endings panel fires an ending either "when a condition holds" or "when the last one leaves by an exit". "By any way out but this one" writes `not` around `left`.
- `who` on a fall is written first, as the castle spells it. A hand-written id the document does not place stays a choice of its own; whether it names a monster is the engine's at Save & Play.
- The version-2 builder keeps refusing `who` rather than dropping it, and does not read `threat`. Only the single-room studio speaks them.

## Found

- The stack's gate-walk lists its `watcher-gate` rows out of weight order, so the studio's save moves the weight-5 `fell` row first (R12). The engine rolls the same table either way.
- The castle's `room.scene.mapLabels: []` is written back as absent, the draft's law for an empty list.
- The toolkit castle's header comment still says the patrol and march rows are "Hand edit". The studio's forms write them since rpg-project#720; that comment is the toolkit's to change.
- The stack's the-mad-king and the toolkit's castle differ: the stack's loyalists turn on the king's fall, the toolkit's are hostile always. Both open and round-trip.

## Mistaken

- Prettier reformatted the five stack-site copies on their first commit, because `.prettierignore` covered `fixtures/*.yaml` and not its subdirectory. Fixed by an ignore line and a fresh copy.
- The first run of the pinned-list tests was skipped for the world-building directory, so three pins for `dash` and `ally` landed one commit late.

— cross-team agent, on behalf of KirkDiggler
