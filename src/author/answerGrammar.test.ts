import { describe, expect, it } from 'vitest';
import {
  ANSWER_TEMPER,
  ANSWER_TRIGGER_KEYS,
  ANSWER_WHEN,
  ANSWER_WORD_KEYS,
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

/**
 * THE ENGINE'S OWN LEGALITY MATRIX, HAND-TRANSCRIBED — NEVER DERIVED FROM THE
 * DECLARATION.
 *
 * This table and `answerVocabulary.ts` are TWO INDEPENDENT COPIES of the same
 * Go, and that is the point: the test below asserts they agree, so an edit to
 * either one goes red instead of the two quietly agreeing with each other.
 *
 * THE FIRST VERSION OF THAT TEST DID NOT DO THIS (review round 1, Important).
 * It derived its "legal" set from `answerWordsForTrigger` and its expected
 * sentence from `word.legalOn`, so it only proved the refusal function agreed
 * with the declaration. A mutation swapping `flee` and `hold` between the two
 * applicability groups passed it — `checked === 18`, zero failures — while
 * inverting the engine's actual rule. Only literals written here, from the Go
 * and not from the declaration, pin membership.
 *
 * Read at rpg-toolkit `origin/main`, `rulebooks/dnd5e/encounter` v0.90.0
 * (`f672c888`; identical to `origin/main`):
 *
 *   - the five trigger keys and their order — `encounter/table.go:154-193`
 *     (`AnswerIntimidated` … `AnswerPersuadeFailed`, `AnswerTime`, `TableKeys`);
 *   - the word grouping and the two refusal sentences —
 *     `dungeonspec/validate.go:1501-1518` (`wordLegality`'s
 *     `case "fact", "flee"` and its `default`; the case names the word, the
 *     `v.fail` string is the sentence);
 *   - the sealed word set — `dungeonspec/spec.go:905-1010` (`AnswerSpec`).
 *
 * Trigger -> the words the ENGINE accepts under it.
 */
const ENGINE_WORD_LEGALITY: Readonly<Record<string, readonly string[]>> = {
  intimidated: ['fact', 'flee'],
  intimidate_failed: ['fact', 'flee'],
  persuaded: ['fact', 'flee'],
  persuade_failed: ['fact', 'flee'],
  time: ['hold', 'attack', 'toward', 'away'],
};

/** The words `wordLegality`'s `case "fact", "flee"` names — the branch that
 * decides WHICH of the two sentences an illegal pair gets. Written here for
 * the same reason the matrix is: reading it from the declaration would put the
 * expectation back inside the thing under test. */
const ENGINE_SOCIAL_WORDS: readonly string[] = ['fact', 'flee'];

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

  it('matches the ENGINE’s legality matrix, transcribed independently', () => {
    // EVERY expectation below comes from `ENGINE_WORD_LEGALITY`, and nothing
    // in it is read from the declaration or from `word.legalOn`. A mutation
    // that swaps two words between the applicability groups changes this
    // table's *content* and fails here — which the version this replaced did
    // not do.

    // The declaration's grouping must equal the hand transcription...
    for (const [trigger, words] of Object.entries(ENGINE_WORD_LEGALITY)) {
      expect(answerWordsForTrigger(trigger).map((w) => w.key)).toEqual(words);
    }
    // ...its trigger seal must be exactly the transcription's keys...
    expect([...ANSWER_TRIGGER_KEYS].sort()).toEqual(
      Object.keys(ENGINE_WORD_LEGALITY).sort()
    );
    // ...and its word seal must be exactly the words the transcription names.
    const transcribedWords = [
      ...new Set(Object.values(ENGINE_WORD_LEGALITY).flat()),
    ];
    expect([...ANSWER_WORD_KEYS].sort()).toEqual(transcribedWords.sort());

    // Exhaustive over the transcription: every (word, trigger) the ENGINE
    // does not accept, and only those, in the engine's own two sentences.
    let checked = 0;
    for (const [trigger, words] of Object.entries(ENGINE_WORD_LEGALITY)) {
      const legal = new Set(words);
      for (const word of transcribedWords) {
        const refusal = answerWordRefusal(word, trigger);
        if (legal.has(word)) {
          expect(refusal).toBeUndefined();
          continue;
        }
        checked += 1;
        // WHICH sentence comes from the TRANSCRIPTION's membership — the Go's
        // `case "fact", "flee"` — never from the declaration's `legalOn`.
        expect(refusal).toBe(
          ENGINE_SOCIAL_WORDS.includes(word)
            ? `\`${word}\` answers a social verdict, and \`${trigger}\` is not one`
            : `\`${word}\` is what a creature does with time, and \`${trigger}\` is an outcome`
        );
      }
    }
    // 2 social words x 1 time trigger + 4 time words x 4 social triggers.
    expect(checked).toBe(18);
  });

  it('refuses a scalar or sequence body on a word that carries nothing', () => {
    // MEASURED AGAINST THE REAL DECODER (review round 1, finding 2):
    // `FleeSpec`/`HoldSpec` are structs, so the Go refuses `flee: 5`,
    // `hold: 5` and `hold: [1]` at boot. The web used to read all three as
    // the bare word.
    expect(() =>
      parseDungeon(
        mutated(
          '- { weight: 70, say: "Fine! FINE. The cellar door is behind the barrels. Just don\'t.", fact: goblin-cowed }',
          '- { say: "Boss! BOSS!", flee: 5 }'
        )
      )
    ).toThrow(/flee takes a mapping — write `flee: \{\}`/);
    expect(() =>
      parseDungeon(
        mutated(TIME_FLED, TIME_FLED.replace('away: actor', 'hold: [1]'))
      )
    ).toThrow(/hold takes a mapping — write `hold: \{\}`/);
  });

  it('accepts a mapping body with keys in it, exactly as the Go does', () => {
    // THE OTHER DIRECTION MATTERS MORE. The engine's custom unmarshaler never
    // runs `KnownFields` inside `FleeSpec`, so `flee: { x: 1 }` decodes clean
    // there — measured. Refusing it here would be the web refusing a file the
    // server reads, the failure this whole issue exists to undo.
    expect(() =>
      parseDungeon(
        mutated(
          '- { weight: 70, say: "Fine! FINE. The cellar door is behind the barrels. Just don\'t.", fact: goblin-cowed }',
          '- { say: "Boss! BOSS!", flee: { x: 1 } }'
        )
      )
    ).not.toThrow();
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

  it('refuses a non-scalar band exactly as the raw node reads it', () => {
    // `yaml.Node.Value` is empty for a sequence, so `enemy: [1, 2]` reaches
    // `unknownEnemyBandRefusal("")` in the Go — ``` `enemy: ` is not a
    // condition this build reads ``` (review round 1, finding 3).
    expect(() =>
      parseDungeon(
        mutated(TIME_REACH, TIME_REACH.replace('enemy: reach', 'enemy: [1, 2]'))
      )
    ).toThrow(
      /`enemy: ` is not a condition this build reads: they are reach, seen, remembered, none/
    );
  });

  /**
   * A SCOPE ON A DEED, AND THE SILENT DROP THAT USED TO BE HERE
   * (rpg-dnd5e-web#1199).
   *
   * This reader read `within` off a deed's body and threw the REST of the body
   * away — so `{ fled: { within: 3, on: ally } }` was accepted, dropped, and
   * emitted back as `{ fled: { within: 3 } }`, a condition about the creature
   * ITSELF. The author's meaning changed and nothing said so: exactly the
   * silent-rewrite class the strict reader exists to stop (#1118).
   *
   * So the first case below is the regression: a scope must survive the round
   * trip. The rest are `WhenSpec.scopeOf`'s own sentences.
   */
  describe('a deed scope', () => {
    /** The `fled` row with its body replaced, so the mutation is one authored
     * line and the fixture's commentary cannot satisfy it by accident. */
    const body = (to: string): string =>
      mutated(
        TIME_FLED,
        TIME_FLED.replace('{ fled: { within: 3 } }', `{ fled: ${to} }`)
      );

    it('round-trips `on: ally` instead of dropping it', () => {
      const emitted = emitDungeon(
        parseDungeon(body('{ within: 3, on: ally }'))
      );
      expect(emitted).toContain('{ fled: { within: 3, on: ally } }');
    });

    it('round-trips `as: actor` instead of dropping it', () => {
      const emitted = emitDungeon(
        parseDungeon(body('{ within: 3, as: actor }'))
      );
      expect(emitted).toContain('{ fled: { within: 3, as: actor } }');
    });

    it('leaves a condition about the creature itself byte-unchanged', () => {
      // Omitting the field IS "the creature itself", so no third word is
      // written for it — a scopeless row round-trips exactly as it arrived.
      // (`on:` alone also names the TABLE's own block key, so this asserts the
      // deed body, not the document.)
      const emitted = emitDungeon(parseDungeon(REFERENCE_FRONT_ROOM_YAML));
      expect(emitted).toContain('{ fled: { within: 3 } }');
      expect(emitted).not.toMatch(/within: 3, (on|as):/);
    });

    it('refuses both spellings at once', () => {
      expect(() =>
        parseDungeon(body('{ within: 3, on: ally, as: actor }'))
      ).toThrow(
        /`fled` names both `on: ally` and `as: actor`, and a condition asks one thing/
      );
    });

    it('refuses a scope word this build does not read, by name', () => {
      expect(() => parseDungeon(body('{ within: 3, on: self }'))).toThrow(
        /`on: self` is not a scope this build reads: they are ally, actor \(and omitting it means the creature itself\)/
      );
      expect(() => parseDungeon(body('{ within: 3, as: enemy }'))).toThrow(
        /`as: enemy` is not a scope this build reads: they are ally, actor/
      );
    });

    it('refuses an unknown body key rather than dropping it', () => {
      // `no: ally` is the typo this guards: dropped, the row would read the
      // SELF wound and fire for the wrong one.
      expect(() => parseDungeon(body('{ within: 3, no: ally }'))).toThrow(
        /field no not found in type dungeonspec\.withinSpec/
      );
    });
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

  it('reads a non-word scalar as a word, the way the raw node does', () => {
    // The engine's `TemperSpec.UnmarshalYAML` sees a scalar node and refuses
    // it with `%q is not a temperament…`, so `temper: 5` reports `"5"` —
    // not the mix-or-word shape sentence (review round 1, finding 3).
    expect(() => parseDungeon(mutated(GOBLIN_MIX, 'temper: 5'))).toThrow(
      /"5" is not a temperament this build ships: they are soldier, coward, aggressive/
    );
  });
});
