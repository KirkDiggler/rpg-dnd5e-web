# Run — 2026-11-17 — studio today S9 forms (A): a row's grant and a loudness

Slice [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975) of story [rpg-project#966](https://github.com/KirkDiggler/rpg-project/issues/966), PR A of four. Base: `rpg-dnd5e-web` `dev` at [`1b64a356`](https://github.com/KirkDiggler/rpg-dnd5e-web/commit/1b64a356). Shapes read from rpg-toolkit `origin/main` [`bb5806f7`](https://github.com/KirkDiggler/rpg-toolkit/commit/bb5806f7) `dungeonspec` (`spec.go` `AnswerSpec`, `OptionSpec`, `RecognizeSpec`, `RelocateSpec`; `grammar.go` `rowRecognize`, `rowPassage`, `loudness`, `answerEntry`; `interactions.go` `recognitionOf`).

## Shipped

- A line's success or failure row offers **Grants**: Nothing, Recognition, Record or Relocation. It writes `recognize: {topic, holder: spoken_to, about, heard_by?}`, `tells: <record>` or `relocate: {to, words, rounds?}` — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).
- `RelocationFields` is one piece (region, words, rounds) for a row's `relocate`, built to be reused for a conversation's `jail` and `arrest` in PR C (R33) — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).
- **Loudness** on a line said, on any row, and, as "at least", on a heard voice. Speak is written as nothing — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).
- `SiteNamesContext` offers the site's records, regions and topics to a form, provided once at the document root — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).

## Decided

- The form prevents what the engine refuses (`grammar.go`):
  - one grant per row: one select, and choosing one takes the others away;
  - no Recognition on a prop's line;
  - no Grants on a table or bundle row: only an option's verdict rows pass `grants`;
  - "Also held by the conversation's carriers who witness it" only on a line that advances or requires a conversation;
  - no loudness on a line done;
  - a heard loudness only on a voice: changing the sound drops it.

  — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).

- A recognition's holder is the one word the engine takes (`spoken_to`). It is shown as a disabled field reading "The one spoken to", written by the form, not offered as a choice — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).
- A new grant starts from what the site defines: its first topic, record or region. A relocation's words start empty, and the engine's refusal shows at the row until they are written — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).
- A new `loudness` is placed right after `say`, where the castle writes it; an existing one keeps its place — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).

## Found

- The castle already carries every one of these keys. They were round-tripped as unknown keys (`carryUnknownKeys`), so the form only had to read and write them in place; no decoder change was needed — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).
- No "edit in the file" note covered these words, so there was none to remove — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).

## Mistaken

- `TablesPanel.test` pinned a heard loudness surviving a change from voice to clang. The engine refuses that file ("write `kind: voice` or omit the loudness"), so the test now asserts that the loudness goes with the voice — [rpg-project#975](https://github.com/KirkDiggler/rpg-project/issues/975).
