import { describe, expect, it } from 'vitest';
import {
  ANSWER_TEMPER,
  ANSWER_TRIGGER_KEYS,
  ANSWER_WHEN,
  ANSWER_WORD_KEYS,
  answerWordsForTrigger,
} from './answerVocabulary';
import { emitDungeon, parseDungeon } from './dungeonYaml';
import {
  REFERENCE_FRONT_ROOM_YAML,
  referenceFrontRoomDoc,
} from './fixtures/referenceFrontRoom';
import { fromOffset } from './hexOffset';

/**
 * THE ENGINE'S GRADE IS THE VERDICT (rpg-project#481 R3).
 *
 * This file used to pin twenty refusals: a word under the wrong trigger, a
 * band outside the four, a deed with no span, a selector outside the sealed
 * three, a temperament this build does not ship. Each asserted that the WEB
 * refused a file, in a sentence transcribed from `dungeonspec`. Every one of
 * those is deleted, because the assertion behind them was the wrong one: the
 * web's job is not to decide whether a file plays.
 *
 * WHAT IS ASSERTED INSTEAD. Each of the same mutations is applied to the real
 * front-room snapshot, and the file must:
 *
 *   1. open — no refusal, no exception, the canvas gets a document;
 *   2. survive — the value the author wrote is in the bytes the codec emits,
 *      unchanged, so the compiler grades what was written and not a repair;
 *   3. settle — `emit(parse(bytes))` is byte-identical to `bytes`, so a
 *      carried value is not a value that shifts every time the file is saved.
 *
 * That is what "carries the value through verbatim" has to mean to be worth
 * anything: a mutation that round-trips proves the file reached the engine.
 *
 * The declarations in `answerVocabulary.ts` are still asserted here, as the
 * OFFERS they now are — a palette's list, not a gate.
 */
function mutated(from: string, to: string): string {
  if (!REFERENCE_FRONT_ROOM_YAML.includes(from)) {
    throw new Error(
      `the front-room fixture no longer contains ${JSON.stringify(from)} — ` +
        'reconcile this test with the file rather than dropping the case'
    );
  }
  return REFERENCE_FRONT_ROOM_YAML.replace(from, to);
}

/**
 * Apply one mutation to the snapshot and assert all three properties. Returns
 * the emitted bytes so a caller can look at anything else it cares about.
 *
 * `carried` is the exact text the emitter must produce for the mutated value.
 * Asserting on the BYTES rather than on the parsed model is deliberate: the
 * bytes are what `PutDungeon` grades, and a model that held a value but wrote
 * something else back would pass a model assertion and still lose the file.
 */
function carries(from: string, to: string, carried: string): string {
  const doc = parseDungeon(mutated(from, to));
  const bytes = emitDungeon(doc);
  expect(bytes).toContain(carried);
  expect(emitDungeon(parseDungeon(bytes))).toBe(bytes);
  return bytes;
}

/** The `time` table's rows, whole, so each anchor is an authored line and not
 * a fragment the file's commentary also carries. They appear twice (both
 * bandits author the same table); `replace` takes the first. */
const TIME_FLED =
  '- { when: { fled: { within: 3 } },     away: actor,      weight: 3 }';
const TIME_REACH = '- { when: { enemy: reach },            attack: enemy }';
const TIME_NONE =
  '- { when: { enemy: none },             toward: { at: [3, 3] } }';
/** The goblins' mix, on their faction. */
const GOBLIN_MIX = 'temper: { coward: 2, soldier: 1, aggressive: 1 }';
/** A plain placement, for the placement-vs-faction temper rule. */
const PLAIN_PLACEMENT = '    at: [4, 1]';
/** One authored social entry, for the entry-level mutations. */
const COWED_ENTRY =
  '- { weight: 70, say: "Fine! FINE. The cellar door is behind the barrels. Just don\'t.", fact: goblin-cowed }';

describe('the front room snapshot carries the shipped grammar', () => {
  it('reads a placement `time` table whole — conditions, words, selectors', () => {
    const doc = referenceFrontRoomDoc();
    const bandit = doc.place.find((p) => p.id === 'bandit-1');
    const table = bandit?.on;
    expect(table?.map((t) => t.trigger)).toEqual(['time']);
    expect(table?.[0].entries).toEqual([
      {
        weight: 3,
        when: { kind: 'deed', deed: 'fled', within: 3 },
        words: [{ word: 'away', selector: { word: 'actor' } }],
      },
      {
        weight: 3,
        when: { kind: 'deed', deed: 'attacked', within: 3 },
        words: [{ word: 'attack', selector: { word: 'attacker' } }],
      },
      {
        when: { kind: 'enemy', band: 'reach' },
        words: [{ word: 'attack', selector: { word: 'enemy' } }],
      },
      {
        when: { kind: 'enemy', band: 'seen' },
        words: [{ word: 'toward', selector: { word: 'enemy' } }],
      },
      {
        when: { kind: 'enemy', band: 'remembered' },
        words: [{ word: 'toward', selector: { word: 'enemy' } }],
      },
      {
        when: { kind: 'enemy', band: 'none' },
        // The authored cell is AXIAL in the model, `[3,3]` in the bytes.
        words: [
          { word: 'toward', selector: { at: fromOffset('pointy', [3, 3]) } },
        ],
      },
    ]);
  });

  it('round-trips the authored cell back to its own [col,row]', () => {
    // The model is axial; the bytes are the file's `[col,row]` pair in the
    // emitter's own compact spelling, exactly like every other cell.
    const bytes = emitDungeon(referenceFrontRoomDoc());
    expect(bytes).toContain('toward: { at: [3,3] }');
  });

  it('reads both factions’ temper mixes, in the author’s own order', () => {
    const doc = referenceFrontRoomDoc();
    const goblins = doc.factions.find((f) => f.id === 'goblins');
    const bandits = doc.factions.find((f) => f.id === 'bandits');
    expect(goblins?.temper).toEqual({
      mix: [
        { word: 'coward', share: 2 },
        { word: 'soldier', share: 1 },
        { word: 'aggressive', share: 1 },
      ],
    });
    expect(bandits?.temper).toEqual({
      mix: [
        { word: 'coward', share: 1 },
        { word: 'soldier', share: 2 },
        { word: 'aggressive', share: 1 },
      ],
    });
  });

  it('reads the goblins’ table off the faction, with the four social keys', () => {
    const goblins = referenceFrontRoomDoc().factions.find(
      (f) => f.id === 'goblins'
    );
    expect(goblins?.on?.map((t) => t.trigger)).toEqual([
      'intimidated',
      'intimidate_failed',
      'persuaded',
      'persuade_failed',
    ]);
    expect(goblins?.on?.[0].entries[1].words).toEqual([{ word: 'flee' }]);
  });

  it('re-emits and re-parses the whole room byte-for-byte', () => {
    const once = emitDungeon(parseDungeon(REFERENCE_FRONT_ROOM_YAML));
    expect(emitDungeon(parseDungeon(once))).toBe(once);
  });
});

describe('the word-to-trigger rule is the engine’s, and the file still opens', () => {
  it('carries `flee` written on `time`', () => {
    // The pair the engine refuses (`validate.go` `wordLegality`). The builder
    // has no opinion: it writes the word back where the author put it and the
    // compiler answers at `place[i].on.time[j].flee`.
    carries(
      TIME_NONE,
      TIME_NONE.replace('toward: { at: [3, 3] }', 'flee: {}'),
      'flee: {}'
    );
  });

  it('carries an action word written on a social key', () => {
    carries(
      '{ say: "Big talk, for someone standing in my doorway." }',
      '{ say: "Big talk.", hold: {} }',
      'hold: {}'
    );
  });

  it('carries a `when` written under a social key', () => {
    carries(
      '{ say: "Big talk, for someone standing in my doorway." }',
      '{ say: "Big talk.", when: { enemy: none } }',
      'when: { enemy: none }'
    );
  });

  it('carries a body the word’s declared shape does not fit', () => {
    // `FleeSpec`/`HoldSpec` are structs, so the Go refuses `flee: 5` and
    // `hold: [1]` at boot — with a sentence naming the YAML tag, which this
    // codec could never reproduce faithfully. It writes the body back instead.
    carries(COWED_ENTRY, '- { say: "Boss! BOSS!", flee: 5 }', 'flee: 5');
    carries(
      TIME_FLED,
      TIME_FLED.replace('away: actor', 'hold: [1]'),
      'hold: [1]'
    );
  });

  it('carries a mapping body with keys in it, exactly as the Go reads it', () => {
    // The engine's custom unmarshaler never runs `KnownFields` inside
    // `FleeSpec`, so `flee: { x: 1 }` decodes clean there.
    carries(
      COWED_ENTRY,
      '- { say: "Boss! BOSS!", flee: { x: 1 } }',
      'flee: { x: 1 }'
    );
  });
});

describe('a `when` this build has no reader for still reaches the compiler', () => {
  it('carries two conditions in one `when`, rather than guessing at `and`', () => {
    carries(
      TIME_NONE,
      TIME_NONE.replace(
        '{ enemy: none }',
        '{ enemy: none, fled: { within: 1 } }'
      ),
      'when: { enemy: none, fled: { within: 1 } }'
    );
  });

  it('carries an enemy band outside the four', () => {
    carries(
      TIME_REACH,
      TIME_REACH.replace('enemy: reach', 'enemy: nearby'),
      'when: { enemy: nearby }'
    );
  });

  it('carries a deed this build does not hold', () => {
    carries(
      TIME_FLED,
      TIME_FLED.replace('fled:', 'fleeing:'),
      'when: { fleeing: { within: 3 } }'
    );
  });

  it('carries a deed with no span written', () => {
    carries(
      TIME_FLED,
      TIME_FLED.replace('{ within: 3 }', '{}'),
      'when: { fled: {} }'
    );
  });

  it('carries a span counted from zero', () => {
    carries(
      TIME_FLED,
      TIME_FLED.replace('within: 3', 'within: 0'),
      'when: { fled: { within: 0 } }'
    );
  });

  it('carries a non-scalar band as the sequence it is', () => {
    // The Go reads `yaml.Node.Value`, which is empty for a sequence — a
    // detail of ITS decoder, and not one the web has to reproduce now that it
    // does not author the refusal. The bytes go back as written.
    carries(
      TIME_REACH,
      TIME_REACH.replace('enemy: reach', 'enemy: [1, 2]'),
      'when: { enemy: [1, 2] }'
    );
  });
});

describe('selectors', () => {
  it('carries a cell on a word that acts on a creature', () => {
    carries(
      TIME_FLED,
      TIME_FLED.replace('away: actor', 'away: { at: [3, 3] }'),
      // The cell is a shape the model DOES hold, so it takes the emitter's
      // own compact spelling, exactly as `toward`'s does. Which word a cell
      // is legal on is `entrySelector`'s question, asked of the compiler.
      'away: { at: [3,3] }'
    );
  });

  it('carries `actor` in an entry whose `when` names no deed', () => {
    carries(
      TIME_REACH,
      TIME_REACH.replace('attack: enemy', 'attack: actor'),
      'attack: actor'
    );
  });

  it('carries a selector word outside the sealed three', () => {
    carries(
      TIME_FLED,
      TIME_FLED.replace('away: actor', 'away: nobody'),
      'away: nobody'
    );
  });
});

describe('temper', () => {
  it('carries a word outside the sealed three', () => {
    // rpg-dnd5e-web#1145, in the version-2 dialect: the refusal that stopped
    // a file the engine takes.
    carries(
      GOBLIN_MIX,
      GOBLIN_MIX.replace('coward', 'brave'),
      'temper: { brave: 2, soldier: 1, aggressive: 1 }'
    );
  });

  it('carries a share that can never be dealt', () => {
    carries(
      GOBLIN_MIX,
      GOBLIN_MIX.replace('coward: 2', 'coward: 0'),
      'temper: { coward: 0, soldier: 1, aggressive: 1 }'
    );
  });

  it('carries a mix on a placement, where the engine wants a word', () => {
    carries(
      PLAIN_PLACEMENT,
      `${PLAIN_PLACEMENT}\n    temper: { coward: 1, soldier: 1 }`,
      'temper: { coward: 1, soldier: 1 }'
    );
  });

  it('takes a single word on a placement', () => {
    const doc = parseDungeon(
      mutated(PLAIN_PLACEMENT, `${PLAIN_PLACEMENT}\n    temper: coward`)
    );
    expect(doc.place.find((p) => p.id === 'front-goblin-2')?.temper).toEqual({
      word: 'coward',
    });
  });

  it('writes a non-string scalar back as the author typed it', () => {
    // `temper: 5` and `temper: "5"` are different bytes. The engine reads a
    // scalar node either way; the codec must not pick one for the author.
    carries(GOBLIN_MIX, 'temper: 5', 'temper: 5');
  });
});

describe('an unknown key travels to the compiler', () => {
  it('carries a misspelled faction key at its own path', () => {
    // The design doc's own probe (rpg-project#481): `tempre` on a faction
    // used to stop the file at the door with the builder's guess. It now
    // reaches the compiler, which answers `factions[0].tempre: field tempre
    // not found in type dungeonspec.FactionSpec`.
    const bytes = carries(GOBLIN_MIX, 'tempre: coward', 'tempre: coward');
    expect(bytes).not.toContain('temper: { coward: 2');
  });

  it('carries a trigger key this build does not roll', () => {
    carries(
      '    intimidated:',
      '    intimdate_failed:',
      '    intimdate_failed:'
    );
  });

  it('carries an entry key nobody designed', () => {
    carries(
      COWED_ENTRY,
      COWED_ENTRY.replace('fact: goblin-cowed', 'fcat: goblin-cowed'),
      'fcat: goblin-cowed'
    );
  });

  it('carries a placement key from a newer engine', () => {
    carries(
      PLAIN_PLACEMENT,
      `${PLAIN_PLACEMENT}\n    patrols: [[1, 1], [2, 2]]`,
      'patrols: [[1, 1], [2, 2]]'
    );
  });

  it('carries the deleted `knows:` field instead of refusing it by name', () => {
    // rpg-project#372 R1 removed `knows`; the codec used to refuse it in the
    // compiler's own sentence. That sentence is the compiler's to say.
    carries(
      PLAIN_PLACEMENT,
      `${PLAIN_PLACEMENT}\n    knows: cellar-door`,
      'knows: cellar-door'
    );
  });
});

describe('the declarations are offers', () => {
  it('lists the five triggers and the six words a palette shows', () => {
    // READ FROM THE ENGINE at `rulebooks/dnd5e/encounter` v0.90.0:
    // `encounter/table.go` (`TableKeys`) and `dungeonspec/spec.go`
    // (`AnswerSpec`). Written out here rather than derived from the
    // declaration, so an edit to either side goes red.
    expect([...ANSWER_TRIGGER_KEYS]).toEqual([
      'intimidated',
      'intimidate_failed',
      'persuaded',
      'persuade_failed',
      'time',
    ]);
    expect([...ANSWER_WORD_KEYS]).toEqual([
      'fact',
      'flee',
      'hold',
      'attack',
      'toward',
      'away',
    ]);
  });

  it('offers only the words a trigger takes, so a picker never builds a bad pair', () => {
    // `dungeonspec/validate.go` `wordLegality`: `fact`/`flee` answer a social
    // verdict, the four action words are what a creature does with time. This
    // is what a PICKER shows — nothing refuses a file against it.
    const engineLegality: Readonly<Record<string, readonly string[]>> = {
      intimidated: ['fact', 'flee'],
      intimidate_failed: ['fact', 'flee'],
      persuaded: ['fact', 'flee'],
      persuade_failed: ['fact', 'flee'],
      time: ['hold', 'attack', 'toward', 'away'],
    };
    for (const [trigger, words] of Object.entries(engineLegality)) {
      expect(answerWordsForTrigger(trigger).map((w) => w.key)).toEqual(words);
    }
    // A trigger the declaration has not learned offers nothing, rather than
    // offering everything.
    expect(answerWordsForTrigger('taunted')).toEqual([]);
  });

  it('carries the `when` shape and the three temperaments a panel lists', () => {
    expect(ANSWER_WHEN.enemyBands).toEqual([
      'reach',
      'seen',
      'remembered',
      'none',
    ]);
    expect(ANSWER_WHEN.deeds).toEqual([
      'attacked',
      'intimidated',
      'persuaded',
      'fled',
    ]);
    expect(ANSWER_TEMPER.words).toEqual(['soldier', 'coward', 'aggressive']);
  });
});
