# The hold-out — authoring evidence (rpg-project#375, wave 3a)

Captured off the Concepts Lab (`?concept=dungeon-builder&authorFixture=goblin-camp`)
with `tools/browser/holdout-shots.mjs` from the `game-dev` workspace, headless
Chrome, 1680×1000. No server: the Lab compiles the fixture locally.

| file | what it shows |
| --- | --- |
| `01-builder-goblin-camp.png` | the whole builder on the goblin-camp fixture, for context |
| `02-factions-section.png` | **Factions**: `goblins`, mind = a dropdown of the NAMED goblins (chief, scout), the member count |
| `03-dispositions-until-fact.png` | **Dispositions**: goblins ↔ party, `hostile`, with the `until` predicate editor open on `fact: saved-wiseman` |
| `04-refusal-name-a-mind.png` | a §2 refusal inline at the field it names: the mind cleared on a faction of many whose disposition waits on a fact — "name a mind, or the faction cannot learn", word for word |
| `05-refusal-party-declared.png` | a second refusal inline: a faction typed as `party` |
| `06-predicate-down-form.png` | the same predicate editor switched to the `down` form — a dropdown of the named monsters |

The refusals are the client's own, computed before the file is saved
(`src/author/factionRules.ts`); the compiler's path-addressed `FieldError`s
land on the same lines when the server disagrees.
