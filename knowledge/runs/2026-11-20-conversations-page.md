# Run — 2026-11-20 — The Conversations page shows a conversation's lines once

processed: 2026-11-25T190427Z

Slice [rpg-project#1027](https://github.com/KirkDiggler/rpg-project/issues/1027) of story [rpg-project#987](https://github.com/KirkDiggler/rpg-project/issues/987). PR [rpg-dnd5e-web#1468](https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1468). Base: `rpg-dnd5e-web` `dev` at [`c78c8db0`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/c78c8db0). Engine read: `rpg-toolkit` `rulebooks/dnd5e/encounter` v0.232.1 (`d223f26a`, [rpg-toolkit#2479](https://github.com/KirkDiggler/rpg-toolkit/pull/2479) and [#2485](https://github.com/KirkDiggler/rpg-toolkit/pull/2485)). Protos: v0.1.283, unchanged; the read-back is generic statements.

## Shipped

- **Written once.** People → Conversations lists each conversation under the root `conversations:` as "N carry it · M lines". The chosen one shows:
  - **Applied to**: a chip per carrier. Remove takes out only that carrier's `use:`; Apply to… adds `- use: <id>` to a creature's, prop's or faction's options.
  - **Its lines**, in the one line form (`OptionsEditor`, given a `listKey` of `lines`). An edit is one write at `conversations.<id>.lines[k]`.
  - **Each carrier's own lines** beside the conversation's.
- **New conversation**: a name, a first carrier and the first line's words, in one write.
- **States and outcomes**, today's view of the gate, is unchanged below.
- **A carrier's `use:` everywhere.** The studio refused any file that held one. Now it loads and writes back byte for byte, and the inspector shows the entry as "Lines of `<id>` (N)" with the way to the page. Option edits, row lists, the carries check, readouts and place names pass it by. A v2 dungeon refuses it in the engine's words.

## Decided

- **The read-back says who; the draft holds the fields.** Membership comes from the read-back: the list, carriers, `use:` paths, own lines and line count. The lines' fields are read from the draft at `conversations.<id>.lines`, under the conversation the engine named. Reading strictly from the read-back would hide a line just added (its empty words do not compile), and the author could then never fill it in.
- **A new conversation is born carried and saying something.** The engine refuses one nobody uses and one with no lines. A bare one would never compile, so it would never appear in the list it is chosen from.
- **The last carrier or the last line asks, in the page.** It asks "Remove the conversation `<id>`? Nobody would carry it / It would have no lines". Yes removes the conversation and every `use:` of it in one write, and every carrier's own lines stay. No changes nothing. There is no `confirm()`.
- **Carriers change only while the read-back describes the draft.** While the check is behind the draft, the page says so and disables Remove and Apply. When the engine refused the draft, the page says that and shows the refusals in conversations and carriers' lines. A conversation removed from the draft shows as "removed from the draft", never with its old chips. The lines stay editable, because they are read from the draft.
- **Own lines are listed, not edited, here.** They belong to their carrier. Each one jumps to the carrier's inspector.
- **No rename.** A rename must rewrite every carrier's `use:` too, which deserves its own slice.
- **The page layout keeps States and outcomes mounted below.** The arrest's cell pick writes through that section's newest commit, so it stays mounted rather than becoming a list-detail panel.
- **`OptionEntry = OptionShape | OptionUseShape`.** With the union, the compiler found every typed walker of options. Tests read lines through `linesOf()`, which refuses a `use:` by name.

## Found

- `normalizeOption` on a `{use}` entry gives `{id: undefined, use}`. The YAML writer drops the `undefined`, so the file looks right while the draft holds a malformed entry. Only `toStrictEqual` sees it.
- `roomDraft`'s `validateOptions` was the only gate that refused `use:`. Every other walker took the typed list.
- The read-back's `line` statements for a conversation connect `{shared-lines, <id>, said-to}`. A carrier's own lines connect `said-to` the carrier. That edge tells the two apart without reading a path.

## Mistaken

- My first page let the last carrier or the last line be removed silently. That wrote a file the engine refuses, and the page then showed stale chips and the false sentence "not written as a list of lines". The review found it.
- My first remove-carrier tests removed only `options[0]`. A remover that ignored the index would have deleted the captain's own `guest` line, and no test noticed. The tests now remove the captain (his `use:` is at `options[1]`) and assert that his line stays.
- My refusal for a stale index said "wait for the check to catch up". That is false when the engine refused the file.
- I first took the fixtures at v0.232.0, which lacked the `vouch` line; they are now refreshed to v0.232.1.
