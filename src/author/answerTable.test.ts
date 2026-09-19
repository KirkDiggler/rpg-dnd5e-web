import { describe, expect, it } from 'vitest';
import {
  ANSWER_TEMPER,
  ANSWER_TRIGGER_KEYS,
  ANSWER_WHEN,
  ANSWER_WORDS,
  ANSWER_WORD_KEYS,
  answerWordsForTrigger,
  suggestKey,
  type AnswerWordSpec,
} from './answerVocabulary';
import { emitDungeon, parseDungeon } from './dungeonYaml';
import { REFERENCE_FRONT_ROOM_YAML } from './fixtures/referenceFrontRoom';

/**
 * These cases are driven against the REAL front-room file with one targeted
 * substitution each, rather than against a hand-built toy dungeon. The
 * fixture is the server's file at a pinned sha, so a rule asserted here is
 * asserted about the dialect the engine actually compiles — and the guard
 * below means upstream drift fails loudly instead of quietly testing nothing.
 *
 * ANCHOR ON A WHOLE AUTHORED LINE, never a fragment. This file's own
 * commentary quotes its own keys (`# … until: { fact: goblin-cowed } …`)
 * and the file is read top to bottom, so a fragment like
 * `fact: goblin-cowed` is replaced INSIDE A COMMENT first and the entry
 * under test never changes — which reads as "the parser accepted it".
 *
 * THE TABLE MOVED TO THE FACTION (rpg-project#466). `on:` is inherited by
 * every placement in a faction now, so the goblins' table — and its `temper`
 * mix — live under `factions[0]`, and the bandits carry a `time` table on each
 * placement. The anchors below follow it.
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

/** The 70/30 threat's first entry, whole. Unique in the file — the comment
 * above it merely mentions `goblin-cowed`, so this cannot collide. */
const ENTRY_FACT =
  '- { weight: 70, say: "Fine! FINE. The cellar door is behind the barrels. Just don\'t.", fact: goblin-cowed }';
/** The failed-intimidation entry: no weight, one line, no word. */
const ENTRY_SAY_ONLY =
  '{ say: "Big talk, for someone standing in my doorway." }';
/** One `time` row of a bandit's table — the only `time` table in the file, so
 * this is how a `time` word is authored in a mutant. */
const ENTRY_TIME =
  '- { when: { enemy: none },             toward: { at: [3, 3] } }';

/** Rewrite the factual entry with one field's text swapped. */
function entryWith(from: string, to: string): string {
  return mutated(ENTRY_FACT, ENTRY_FACT.replace(from, to));
}

/** An entry offering one declared word, written the way its own shape says. */
function authoredWord(word: AnswerWordSpec): string {
  if (word.value === 'string') return `{ ${word.key}: some-id }`;
  if (word.value === 'selector') return `{ ${word.key}: enemy }`;
  return `{ ${word.key}: {} }`;
}

describe('a typo is carried to the compiler, not refused at the door', () => {
  // These four cases used to assert that the BUILDER refused a typo, in a
  // sentence transcribed from `dungeonspec`. rpg-project#481 R3 moved the
  // verdict to `PutDungeon{validate_only}`: a slip reaches the compiler in
  // the bytes and comes back named at its own path, which is the one place
  // the sentence cannot drift from the thing enforcing it.
  //
  // `suggestKey` survives as a PALETTE's courtesy and is asserted below.

  it('opens a file whose trigger key is a slip, and writes the slip back', () => {
    const text = mutated('      intimidated:', '      intimidatedd:');
    const bytes = emitDungeon(parseDungeon(text));
    expect(bytes).toContain('intimidatedd:');
    expect(bytes).not.toContain('      intimidated:\n');
    expect(emitDungeon(parseDungeon(bytes))).toBe(bytes);
  });

  it('opens a file whose entry key is a transposition, and keeps the key', () => {
    const bytes = emitDungeon(parseDungeon(entryWith('fact:', 'fcat:')));
    expect(bytes).toContain('fcat: goblin-cowed');
    expect(emitDungeon(parseDungeon(bytes))).toBe(bytes);
  });

  it('opens a file whose entry key resembles nothing at all', () => {
    const bytes = emitDungeon(parseDungeon(entryWith('fact:', 'wibble:')));
    expect(bytes).toContain('wibble: goblin-cowed');
  });
});

describe('the vocabulary declaration is the single source', () => {
  it('accepts every word the declaration offers, on a trigger it is legal on', () => {
    // If the parser were listing words itself, adding one to the
    // declaration would not reach it. This is the test that would notice.
    //
    // EACH WORD GOES UNDER A TRIGGER OF ITS OWN GROUP: `flee` on `time` is
    // exactly the combination #1137 exists to refuse, so offering every word
    // to one trigger would test the wrong thing.
    for (const word of ANSWER_WORDS) {
      const [anchor, authored] =
        word.legalOn === 'time'
          ? [ENTRY_TIME, `- ${authoredWord(word)}`]
          : [ENTRY_SAY_ONLY, authoredWord(word)];
      expect(() => parseDungeon(mutated(anchor, authored))).not.toThrow();
    }
  });

  it('reads exactly the triggers the declaration seals', () => {
    // Bidirectional, so neither side can drift. The goblins' inherited table
    // is the four social keys; the bandits' is `time`; between them the file
    // exercises every declared trigger and the declaration offers nothing the
    // file does not carry.
    const doc = parseDungeon(REFERENCE_FRONT_ROOM_YAML);
    const authored = new Set(
      doc.factions
        .flatMap((f) => f.on?.map((t) => t.trigger) ?? [])
        .concat(doc.place.flatMap((p) => p.on?.map((t) => t.trigger) ?? []))
    );
    expect([...authored].sort()).toEqual([...ANSWER_TRIGGER_KEYS].sort());
    expect(doc.factions[0].on?.map((t) => t.trigger)).toEqual([
      'intimidated',
      'intimidate_failed',
      'persuaded',
      'persuade_failed',
    ]);
  });

  it('seals the triggers to the five the engine reads', () => {
    // Not decoration: the count and the order are the engine's
    // (`encounter.TableKeys`), and `time` shipped with rpg-project#466.
    expect(ANSWER_TRIGGER_KEYS).toEqual([
      'intimidated',
      'intimidate_failed',
      'persuaded',
      'persuade_failed',
      'time',
    ]);
    expect(ANSWER_WORD_KEYS).toEqual([
      'fact',
      'flee',
      'hold',
      'attack',
      'toward',
      'away',
    ]);
  });

  it('offers only the words a trigger is legal on', () => {
    // THE DIMENSION #1118 COULD NOT EXPRESS. A picker built from the flat word
    // list would offer `flee` on `time`; a picker built from this does not.
    expect(answerWordsForTrigger('intimidated').map((w) => w.key)).toEqual([
      'fact',
      'flee',
    ]);
    expect(answerWordsForTrigger('time').map((w) => w.key)).toEqual([
      'hold',
      'attack',
      'toward',
      'away',
    ]);
    // A trigger this build does not roll offers nothing at all.
    expect(answerWordsForTrigger('attacked')).toEqual([]);
  });

  it('carries the `when` shape as its own dimension', () => {
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
    expect(ANSWER_WHEN.minimumWithin).toBe(1);
    // `when` is a `time` word: a social key IS the condition.
    expect(ANSWER_WHEN.legalOn).toBe('time');
  });

  it('seals the three temperaments in the engine’s own order', () => {
    expect(ANSWER_TEMPER.words).toEqual(['soldier', 'coward', 'aggressive']);
    expect(ANSWER_TEMPER.minimumShare).toBe(1);
  });

  it('suggests the nearest name, case-insensitively', () => {
    expect(suggestKey('FLEE', ANSWER_WORD_KEYS)).toBe('flee');
    expect(suggestKey('fac', ANSWER_WORD_KEYS)).toBe('fact');
    expect(suggestKey('fcat', ANSWER_WORD_KEYS)).toBe('fact');
    expect(suggestKey('nothing-like-it', ANSWER_WORD_KEYS)).toBeUndefined();
  });
});

describe('the entry rules are `answerEntry`’s, and the file still opens', () => {
  // "An entry does one thing", "an entry with no word must still say
  // something" and "a weight below 1 can never be rolled" are
  // `dungeonspec/validate.go`'s rules. They were enforced here as well, in
  // the engine's own sentences — two copies of one rule, and the copy is
  // what drifts. Each case now asserts the file opens and the author's own
  // bytes reach the compiler.

  it('carries two words in one entry, both of them', () => {
    const text = mutated(ENTRY_FACT, ENTRY_FACT.replace(' }', ', flee: {} }'));
    const bytes = emitDungeon(parseDungeon(text));
    expect(bytes).toContain('fact: goblin-cowed, flee: {}');
    expect(emitDungeon(parseDungeon(bytes))).toBe(bytes);
  });

  it('carries an entry with no word and nothing to say', () => {
    const bytes = emitDungeon(
      parseDungeon(mutated(ENTRY_SAY_ONLY, '{ weight: 5 }'))
    );
    expect(bytes).toContain('- { weight: 5 }');
    expect(emitDungeon(parseDungeon(bytes))).toBe(bytes);
  });

  it('carries a weight below one, because omitted IS one', () => {
    const bytes = emitDungeon(
      parseDungeon(entryWith('weight: 70', 'weight: 0'))
    );
    expect(bytes).toContain('weight: 0');
    expect(emitDungeon(parseDungeon(bytes))).toBe(bytes);
  });

  it('carries a fractional weight as written', () => {
    const bytes = emitDungeon(
      parseDungeon(entryWith('weight: 70', 'weight: 1.5'))
    );
    expect(bytes).toContain('weight: 1.5');
    expect(emitDungeon(parseDungeon(bytes))).toBe(bytes);
  });
});

describe('an authored weight is kept exactly as authored', () => {
  it('does not collapse a written 1 into an omitted key', () => {
    // The engine keeps `weight` a pointer precisely so an absent key and a
    // written `1` are different bytes. Collapsing them here would rewrite
    // the author's file on save without saying so.
    const doc = parseDungeon(entryWith('weight: 70', 'weight: 1'));
    expect(emitDungeon(doc)).toContain('weight: 1');
  });

  it('leaves an absent weight absent', () => {
    // The failed-intimidation entry authored no weight, and writing one
    // back would be a silent edit to the author's odds.
    const doc = parseDungeon(REFERENCE_FRONT_ROOM_YAML);
    const failed = doc.factions[0].on?.find(
      (t) => t.trigger === 'intimidate_failed'
    );
    expect(failed?.entries[0].weight).toBeUndefined();
    expect(emitDungeon(doc)).toContain(ENTRY_SAY_ONLY);
  });
});
