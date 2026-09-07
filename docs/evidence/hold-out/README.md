# The hold-out — authoring evidence (rpg-project#375, waves 3a and step B)

Captured off the Concepts Lab (`?concept=dungeon-builder&authorFixture=raider-camp`)
with `tools/browser/holdout-shots.mjs` from the `game-dev` workspace, headless
Chrome, 1680×1000. No server: the Lab compiles the fixture locally.

| file | what it shows |
| --- | --- |
| `01-builder-raider-camp.png` | the whole builder on the raider-camp fixture, for context |
| `02-factions-section.png` | **Factions**: `raiders`, mind = a dropdown of the NAMED raiders (chief, scout), the member count |
| `03-dispositions-until-fact.png` | **Dispositions**: raiders ↔ party, `hostile`, with the `until` predicate editor open on `fact: saved-wiseman` |
| `04-refusal-name-a-mind.png` | a §2 refusal inline at the field it names: the mind cleared on a faction of many whose disposition waits on a fact — "name a mind, or the faction cannot learn", word for word |
| `05-refusal-party-declared.png` | a second refusal inline: a faction typed as `party` |
| `06-predicate-down-form.png` | the same predicate editor switched to the `down` form — a dropdown of the named monsters |
| `07-board-arrives-treatment.png` | step B: the letter and the three reinforcements on the board, faded with a dashed ring and the word "arrives" — authored, absent at first light |
| `08-arrives-editor-letter.png` | step B: the letter's placement panel with the arrives editor open on `round: 6` |
| `09-endings-section.png` | step B: the Endings section with an authored stance ending and, beneath it, the sugar line "hold-out ends when raiders × party is neutral" |
| `step-b-builder.png` | step B off the RUNNING stack (the local dev server on :3010, not the headless Lab): the camp with all four reserved placements at the gate, no console error, the Endings section present |

The refusals are the client's own, computed before the file is saved
(`src/author/factionRules.ts`); the compiler's path-addressed `FieldError`s
land on the same lines when the server disagrees.
