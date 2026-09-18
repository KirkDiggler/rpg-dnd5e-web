import { describe, expect, it } from 'vitest';
import {
  ANSWER_TEMPER,
  ANSWER_TRIGGERS,
  ANSWER_WHEN,
  ANSWER_WORDS,
  answerWordRefusal,
  answerWordsForTrigger,
} from './answerVocabulary';
import { emitDungeon, parseDungeon } from './dungeonYaml';
import {
  REFERENCE_FRONT_ROOM_YAML,
  referenceFrontRoomDoc,
} from './fixtures/referenceFrontRoom';
import { fromOffset } from './hexOffset';

/**
 * THE TWO DIMENSIONS #1137 ADDS, each asserted against the real front-room
 * snapshot with one targeted substitution, so a rule here is a rule about the
 * dialect the engine compiles rather than about a toy document.
 *
 * The sentences are the ENGINE'S OWN (`dungeonspec/validate.go`,
 * `WhenSpec.UnmarshalYAML`, `TemperSpec.UnmarshalYAML`) — an author meets the
 * same words from the form and from the server, so a test that pinned a
 * paraphrase would let the two drift apart. Where the engine's sentence ends
 * in `(line N)` the assertion allows the number and pins the words.
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
        word: { word: 'away', selector: { word: 'actor' } },
      },
      {
        weight: 3,
        when: { kind: 'deed', deed: 'attacked', within: 3 },
        word: { word: 'attack', selector: { word: 'attacker' } },
      },
      {
        when: { kind: 'enemy', band: 'reach' },
        word: { word: 'attack', selector: { word: 'enemy' } },
      },
      {
        when: { kind: 'enemy', band: 'seen' },
        word: { word: 'toward', selector: { word: 'enemy' } },
      },
      {
        when: { kind: 'enemy', band: 'remembered' },
        word: { word: 'toward', selector: { word: 'enemy' } },
      },
      {
        when: { kind: 'enemy', band: 'none' },
        // The authored cell is AXIAL in the model, `[3,3]` in the bytes.
        word: {
          word: 'toward',
          selector: { at: fromOffset('pointy', [3, 3]) },
        },
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
    expect(goblins?.on?.[0].entries[1].word).toEqual({ word: 'flee' });
  });

  it('re-emits and re-parses the whole room byte-for-byte', () => {
    const once = emitDungeon(parseDungeon(REFERENCE_FRONT_ROOM_YAML));
    expect(emitDungeon(parseDungeon(once))).toBe(once);
  });
});

describe('a word is legal on some triggers and not others', () => {
  it('refuses `flee` on `time` with the engine’s own sentence', () => {
    // The dimension #1118 could not express. A picker built from the flat word
    // list offered this pair; the parser must refuse it in the server's words.
    const text = mutated(
      TIME_NONE,
      TIME_NONE.replace('toward: { at: [3, 3] }', 'flee: {}')
    );
    expect(() => parseDungeon(text)).toThrow(
      /`flee` answers a social verdict, and `time` is not one \(line \d+\)/
    );
  });

  it('refuses an action word on a social key with the engine’s own sentence', () => {
    expect(() =>
      parseDungeon(
        mutated(
          '{ say: "Big talk, for someone standing in my doorway." }',
          '{ say: "Big talk.", hold: {} }'
        )
      )
    ).toThrow(
      /`hold` is what a creature does with time, and `intimidate_failed` is an outcome \(line \d+\)/
    );
  });

  it('refuses a `when` under a social key, because the key IS the condition', () => {
    expect(() =>
      parseDungeon(
        mutated(
          '{ say: "Big talk, for someone standing in my doorway." }',
          '{ say: "Big talk.", when: { enemy: none } }'
        )
      )
    ).toThrow(
      /`intimidate_failed` is already the condition — a `when` under it asks when a thing that just happened happened \(line \d+\)/
    );
  });

  it('refuses every illegal pair in the engine’s words, for every trigger', () => {
    // Exhaustive over the declaration rather than over one sample: every
    // (word, trigger) the engine does not accept, and only those.
    let checked = 0;
    for (const trigger of ANSWER_TRIGGERS) {
      const legal = new Set(
        answerWordsForTrigger(trigger.key).map((w) => w.key)
      );
      for (const word of ANSWER_WORDS) {
        const refusal = answerWordRefusal(word.key, trigger.key);
        if (legal.has(word.key)) {
          expect(refusal).toBeUndefined();
          continue;
        }
        checked += 1;
        expect(refusal).toBe(
          word.legalOn === 'social'
            ? `\`${word.key}\` answers a social verdict, and \`${trigger.key}\` is not one`
            : `\`${word.key}\` is what a creature does with time, and \`${trigger.key}\` is an outcome`
        );
      }
    }
    // 2 social words x 1 time trigger + 4 time words x 4 social triggers.
    expect(checked).toBe(18);
  });
});

describe('the `when` shape', () => {
  it('refuses two conditions rather than reading them as `and`', () => {
    const text = mutated(
      TIME_NONE,
      TIME_NONE.replace(
        '{ enemy: none }',
        '{ enemy: none, fled: { within: 1 } }'
      )
    );
    expect(() => parseDungeon(text)).toThrow(
      /a `when` is one condition, and this names 2/
    );
  });

  it('refuses an enemy band outside the four', () => {
    expect(() =>
      parseDungeon(
        mutated(TIME_REACH, TIME_REACH.replace('enemy: reach', 'enemy: nearby'))
      )
    ).toThrow(
      /`enemy: nearby` is not a condition this build reads: they are reach, seen, remembered, none/
    );
  });

  it('refuses a deed the build does not hold', () => {
    expect(() =>
      parseDungeon(mutated(TIME_FLED, TIME_FLED.replace('fled:', 'fleeing:')))
    ).toThrow(
      /`fleeing` is not a deed this build holds: they are attacked, intimidated, persuaded, fled \(and `enemy`\)/
    );
  });

  it('refuses a deed with no span written', () => {
    expect(() =>
      parseDungeon(mutated(TIME_FLED, TIME_FLED.replace('{ within: 3 }', '{}')))
    ).toThrow(/`fled` names no span — write \{ within: N \}/);
  });

  it('refuses a span counted from zero', () => {
    expect(() =>
      parseDungeon(
        mutated(TIME_FLED, TIME_FLED.replace('within: 3', 'within: 0'))
      )
    ).toThrow(/a span of 0 rounds is counted from 1/);
  });

  it('carries the shape the declaration seals', () => {
    expect(ANSWER_WHEN.enemyBands).toHaveLength(4);
    expect(ANSWER_WHEN.deeds).toHaveLength(4);
  });
});

describe('selectors', () => {
  it('refuses a cell on a word that acts on a creature', () => {
    expect(() =>
      parseDungeon(
        mutated(
          TIME_FLED,
          TIME_FLED.replace('away: actor', 'away: { at: [3, 3] }')
        )
      )
    ).toThrow(
      /a cell is somewhere to walk toward, and `away` acts on a creature \(line \d+\)/
    );
  });

  it('refuses `actor` in an entry whose `when` names no deed', () => {
    expect(() =>
      parseDungeon(
        mutated(
          TIME_REACH,
          TIME_REACH.replace('attack: enemy', 'attack: actor')
        )
      )
    ).toThrow(
      /`actor` is the actor of the deed this entry's `when` names, and this entry names no deed \(line \d+\)/
    );
  });

  it('refuses a selector word outside the sealed three', () => {
    expect(() =>
      parseDungeon(
        mutated(TIME_FLED, TIME_FLED.replace('away: actor', 'away: nobody'))
      )
    ).toThrow(
      /"nobody" is not a selector this build resolves: they are enemy, attacker, actor, or \{ at: \[col, row\] \}/
    );
  });
});

describe('temper', () => {
  it('refuses a word outside the sealed three', () => {
    expect(() =>
      parseDungeon(mutated(GOBLIN_MIX, GOBLIN_MIX.replace('coward', 'brave')))
    ).toThrow(
      /"brave" is not a temperament this build ships: they are soldier, coward, aggressive/
    );
  });

  it('refuses a share that can never be dealt', () => {
    expect(() =>
      parseDungeon(
        mutated(GOBLIN_MIX, GOBLIN_MIX.replace('coward: 2', 'coward: 0'))
      )
    ).toThrow(
      /a share of 0 can never be dealt — give "coward" a share of at least 1/
    );
  });

  it('refuses a mix on a placement, where there is nobody to deal to', () => {
    expect(() =>
      parseDungeon(
        mutated(
          PLAIN_PLACEMENT,
          `${PLAIN_PLACEMENT}\n    temper: { coward: 1, soldier: 1 }`
        )
      )
    ).toThrow(
      /a placement names one creature — a temper mix belongs on the faction/
    );
  });

  it('takes a single word on a placement', () => {
    const doc = parseDungeon(
      mutated(PLAIN_PLACEMENT, `${PLAIN_PLACEMENT}\n    temper: coward`)
    );
    expect(doc.place.find((p) => p.id === 'front-goblin-2')?.temper).toBe(
      'coward'
    );
  });

  it('seals the words to the engine’s three, in the engine’s order', () => {
    expect(ANSWER_TEMPER.words).toEqual(['soldier', 'coward', 'aggressive']);
  });
});
