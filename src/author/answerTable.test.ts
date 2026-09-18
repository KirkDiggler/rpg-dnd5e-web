import { describe, expect, it } from 'vitest';
import {
  ANSWER_TRIGGER_KEYS,
  ANSWER_WORDS,
  ANSWER_WORD_KEYS,
  suggestKey,
} from './answerVocabulary';
import { emitDungeon, parseDungeon } from './dungeonYaml';
import { REFERENCE_FRONT_ROOM_YAML } from './fixtures/referenceFrontRoom';

/**
 * These cases are driven against the REAL front-room file with one targeted
 * substitution each, rather than against a hand-built toy dungeon. The
 * fixture is what the server ships, so a rule asserted here is asserted
 * about the dialect the engine actually compiles — and the guard below
 * means upstream drift fails loudly instead of quietly testing nothing.
 *
 * ANCHOR ON A WHOLE AUTHORED LINE, never a fragment. This file's own
 * commentary quotes its own keys (`# … until: { fact: goblin-cowed } …`)
 * and the file is read top to bottom, so a fragment like
 * `fact: goblin-cowed` is replaced INSIDE A COMMENT first and the entry
 * under test never changes — which reads as "the parser accepted it".
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

/** Rewrite the factual entry with one field's text swapped. */
function entryWith(from: string, to: string): string {
  return mutated(ENTRY_FACT, ENTRY_FACT.replace(from, to));
}

describe('a typo is answered with what the author meant', () => {
  it('names the trigger a slip was reaching for', () => {
    expect(() =>
      parseDungeon(mutated('      intimidated:', '      intimidatedd:'))
    ).toThrow(/unknown trigger "intimidatedd" — did you mean "intimidated"\?/);
  });

  it('names the word a transposition was reaching for', () => {
    // Plain Levenshtein scores a transposition 2; this one costs 1, which
    // is the whole reason the distance is Damerau.
    expect(() => parseDungeon(entryWith('fact:', 'fcat:'))).toThrow(
      /unknown key "fcat" — did you mean "fact"\?/
    );
  });

  it('says nothing extra when nothing is close', () => {
    // A suggestion is a courtesy, never a guess: a key nothing resembles
    // gets the plain refusal.
    expect(() => parseDungeon(entryWith('fact:', 'wibble:'))).toThrow(
      /unknown key "wibble"$/
    );
  });

  it('still refuses — a suggestion is not an acceptance', () => {
    expect(() => parseDungeon(entryWith('fact:', 'fcat:'))).toThrow();
  });
});

describe('the vocabulary declaration is the single source', () => {
  it('accepts every word the declaration offers', () => {
    // If the parser were listing words itself, adding one to the
    // declaration would not reach it. This is the test that would notice.
    for (const word of ANSWER_WORDS) {
      const authored =
        word.value === 'string'
          ? `{ ${word.key}: some-id }`
          : `{ ${word.key}: {} }`;
      expect(() =>
        parseDungeon(mutated(ENTRY_SAY_ONLY, authored))
      ).not.toThrow();
    }
  });

  it('reads exactly the triggers the declaration seals', () => {
    // Bidirectional, so neither side can drift: the file uses every
    // declared trigger, and the declaration offers nothing the file does
    // not exercise. Adding `time` to the declaration alone fails here.
    const doc = parseDungeon(REFERENCE_FRONT_ROOM_YAML);
    expect(doc.place[0].on?.map((t) => t.trigger)).toEqual([
      ...ANSWER_TRIGGER_KEYS,
    ]);
  });

  it('seals the triggers to the four the engine reads', () => {
    // Not decoration: the count is the engine's (`encounter.AnswerKeys`),
    // and `time` belongs to rpg-project#465's wave, not this one.
    expect(ANSWER_TRIGGER_KEYS).toEqual([
      'intimidated',
      'intimidate_failed',
      'persuaded',
      'persuade_failed',
    ]);
    expect(ANSWER_WORD_KEYS).toEqual(['fact', 'flee']);
  });

  it('suggests the nearest name, case-insensitively', () => {
    expect(suggestKey('FLEE', ANSWER_WORD_KEYS)).toBe('flee');
    expect(suggestKey('fac', ANSWER_WORD_KEYS)).toBe('fact');
    expect(suggestKey('fcat', ANSWER_WORD_KEYS)).toBe('fact');
    expect(suggestKey('nothing-like-it', ANSWER_WORD_KEYS)).toBeUndefined();
  });
});

describe('an entry does one thing, and says something', () => {
  it('refuses two words in one entry', () => {
    // Two words would make the author guess an ordering the engine does
    // not promise. Want two things? The engine wants two entries.
    expect(() =>
      parseDungeon(
        mutated(ENTRY_FACT, ENTRY_FACT.replace(' }', ', flee: {} }'))
      )
    ).toThrow(/an entry does one thing — found fact and flee/);
  });

  it('refuses an entry with no word and nothing to say', () => {
    expect(() =>
      parseDungeon(mutated(ENTRY_SAY_ONLY, '{ weight: 5 }'))
    ).toThrow(/an entry with no word must carry a line to say/);
  });

  it('refuses a weight below one, because omitted IS one', () => {
    expect(() => parseDungeon(entryWith('weight: 70', 'weight: 0'))).toThrow(
      /must be at least 1/
    );
  });

  it('refuses a fractional weight', () => {
    expect(() => parseDungeon(entryWith('weight: 70', 'weight: 1.5'))).toThrow(
      /expected a whole number/
    );
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
    const failed = doc.place[0].on?.find(
      (t) => t.trigger === 'intimidate_failed'
    );
    expect(failed?.entries[0].weight).toBeUndefined();
    expect(emitDungeon(doc)).toContain(ENTRY_SAY_ONLY);
  });
});
