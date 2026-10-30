/**
 * The row words the engine learned that the studio did not speak
 * (rpg-project#732): `dash: <selector>`, `enemy: walk | dash | far` and
 * `threat: none | walk | dash` (rpg-project#671), the `ally` selector
 * (rpg-project#717) and the `fell` deed with `who` (rpg-project#716).
 *
 * Every refusal is the engine's sentence, word for word, at rpg-toolkit
 * f6e5e411 (`dungeonspec/spec.go` `WhenSpec.UnmarshalYAML`, `mind/behavior`
 * v0.17.0 `When.Validate` and `Selector.validate`).
 */
import { describe, expect, it } from 'vitest';
import { validateAnswerTable } from './answerTableShape';
import { conditionShorthand, whenPhrase, wordPhrase } from './answerVocabulary';
import { entryText } from './entryText';
import { wordTakesCell, wordTakesRoute } from './routeEdits';

const table = (on: unknown) => () => validateAnswerTable(on, 'on');

describe('dash and the move words (rpg-project#671)', () => {
  it('reads the castle dasher bundle and the careful dasher verbatim', () => {
    const authored = {
      time: [
        { when: { enemy: 'reach' }, attack: 'enemy' },
        { when: { enemy: 'walk' }, toward: 'enemy' },
        { when: { enemy: 'dash' }, toward: 'enemy' },
        { when: { enemy: 'far' }, dash: 'enemy' },
        { when: [{ enemy: 'dash' }, { threat: 'none' }], dash: 'enemy' },
        { when: { not: { threat: 'walk' } }, dash: 'attacker' },
      ],
    };
    expect(validateAnswerTable(authored, 'on')).toEqual(authored);
  });

  it('takes a cell and a route on dash, as on toward', () => {
    const authored = {
      time: [
        { dash: { at: { q: 1, r: -2 } } },
        {
          dash: {
            path: [
              { q: 0, r: 0 },
              { q: 2, r: 0, wait: 1 },
            ],
          },
        },
      ],
    };
    expect(validateAnswerTable(authored, 'on')).toEqual(authored);
    expect(wordTakesCell('dash')).toBe(true);
    expect(wordTakesRoute('dash')).toBe(true);
    expect(wordTakesCell('away')).toBe(false);
  });

  it('refuses a cell and a route on away in the engine’s sentences', () => {
    expect(table({ time: [{ away: { at: { q: 1, r: 1 } } }] })).toThrow(
      'on.time[0].away: a cell is somewhere to walk toward, and `away` acts on a creature'
    );
    expect(table({ time: [{ away: { path: [{ q: 1, r: 1 }] } }] })).toThrow(
      'on.time[0]: `away` cannot take a `path`: a route is walked, and only `toward` and `dash` walk one'
    );
  });

  it('refuses dash beside another word, and a group carrying dash', () => {
    expect(table({ time: [{ dash: 'enemy', toward: 'enemy' }] })).toThrow(
      'an entry does one thing: `toward` and `dash` in the same entry is 2'
    );
  });

  it('refuses an enemy word and a threat word outside the sealed lists', () => {
    expect(table({ time: [{ when: { enemy: 'sprint' }, hold: {} }] })).toThrow(
      '`enemy: sprint` is not a condition this build reads: they are reach, seen, remembered, lost, none, walk, dash, far'
    );
    expect(table({ time: [{ when: { threat: 'run' }, hold: {} }] })).toThrow(
      'on.time[0].when: `threat: run` is not a threat this build reads: they are none, walk, dash (who else could reach where this row lands: nobody, a walker, or only a dasher)'
    );
  });

  it('says each in words, for the editor and the Read back', () => {
    expect(whenPhrase({ enemy: 'walk' }, 'it')).toBe('an enemy is a walk away');
    expect(whenPhrase({ enemy: 'dash' }, 'it')).toBe(
      'an enemy is only a dash away'
    );
    expect(whenPhrase({ enemy: 'far' }, 'it')).toBe(
      'an enemy is beyond a dash'
    );
    expect(whenPhrase([{ enemy: 'dash' }, { threat: 'none' }], 'it')).toBe(
      'an enemy is only a dash away and nobody else could reach where it lands'
    );
    expect(whenPhrase({ not: { threat: 'walk' } }, 'I')).toBe(
      'no walking foe could reach where I land'
    );
    expect(wordPhrase({ dash: 'enemy' }, 'it')).toBe('dashes toward the enemy');
    expect(wordPhrase({ dash: { at: { q: 1, r: -2 } } }, 'it')).toBe(
      'dashes to {q: 1, r: -2}'
    );
    expect(conditionShorthand({ threat: 'dash' })).toBe('threat dash');
    expect(entryText({ when: { enemy: 'far' }, dash: 'enemy' }, 'time')).toBe(
      'when enemy far · weight 1 · dash enemy'
    );
  });
});

describe('the ally selector (rpg-project#717)', () => {
  it('reads ally on toward, dash and away', () => {
    const authored = {
      time: [
        { when: { enemy: 'none' }, toward: 'ally' },
        { dash: 'ally' },
        { away: 'ally' },
      ],
    };
    expect(validateAnswerTable(authored, 'on')).toEqual(authored);
  });

  it('refuses ally on attack at the row, in mind/behavior’s sentence', () => {
    expect(table({ time: [{ attack: 'ally' }] })).toThrow(
      'on.time[0]: `attack` cannot take `ally`: a mind is never handed an ally to strike, only one to walk toward or away from'
    );
  });

  it('lists ally among the words the engine resolves', () => {
    expect(table({ time: [{ toward: 'friend' }] })).toThrow(
      '"friend" is not a selector this build resolves: they are enemy, attacker, actor, sound, ally, or { at: { q, r } }, or { path: [{ q, r }, …] }'
    );
  });

  it('says it in words', () => {
    expect(wordPhrase({ when: { enemy: 'none' }, toward: 'ally' }, 'it')).toBe(
      'walks toward the nearest ally'
    );
    expect(wordPhrase({ away: 'ally' }, 'I')).toBe(
      'walk away from the nearest ally'
    );
  });
});

describe('the fell deed and its who (rpg-project#716)', () => {
  it('reads the castle knight’s row, its body in the file’s order', () => {
    const authored = {
      time: [
        {
          when: { fell: { who: 'king', within: 3, on: 'ally' } },
          away: 'enemy',
          weight: 3,
        },
        { when: { fell: { within: 2 } }, toward: 'actor' },
        { when: { attacked: { on: 'ally', within: 2 } }, attack: 'attacker' },
      ],
    };
    const read = validateAnswerTable(authored, 'on');
    expect(read).toEqual(authored);
    expect(JSON.stringify(read.time[0]!.when)).toBe(
      '{"fell":{"who":"king","within":3,"on":"ally"}}'
    );
    expect(JSON.stringify(read.time[2]!.when)).toBe(
      '{"attacked":{"on":"ally","within":2}}'
    );
  });

  it('refuses who on another deed, and a who naming nobody, in the engine’s sentences', () => {
    expect(
      table({
        time: [{ when: { attacked: { who: 'king', within: 2 } }, hold: {} }],
      })
    ).toThrow(
      'on.time[0].when: `who` names the one who fell, and only `fell` takes it; `attacked` does not'
    );
    expect(
      table({ time: [{ when: { fell: { who: '', within: 2 } }, hold: {} }] })
    ).toThrow(
      'on.time[0].when: `fell: { who }` names nobody: write the id of the monster placement whose fall this waits on'
    );
  });

  it('lists fell among the deeds a build holds', () => {
    expect(
      table({ time: [{ when: { died: { within: 2 } }, hold: {} }] })
    ).toThrow(
      '`died` is not a deed this build holds: they are attacked, intimidated, persuaded, fled, fell (and `enemy`, `heard`, `fact`, `threat`, `not`)'
    );
  });

  it('says it in words', () => {
    expect(
      whenPhrase({ fell: { who: 'king', within: 3, on: 'ally' } }, 'it')
    ).toBe('king, an ally, fell within 3 rounds');
    expect(whenPhrase({ fell: { within: 2, on: 'ally' } }, 'it')).toBe(
      'an ally fell within 2 rounds'
    );
    expect(whenPhrase({ fell: { within: 1, as: 'actor' } }, 'it')).toBe(
      'it felled someone within 1 round'
    );
    expect(
      whenPhrase(
        { not: { fell: { who: 'king', within: 3, on: 'ally' } } },
        'it'
      )
    ).toBe('king, an ally, did not fall within 3 rounds');
    expect(
      conditionShorthand({ fell: { who: 'king', within: 3, on: 'ally' } })
    ).toBe('an ally fell within 3 (king)');
  });
});
