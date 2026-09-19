import { describe, expect, it } from 'vitest';
import { validateAnswerTable } from './answerTableShape';

/** A refusal is asserted through the same path a document takes, so the
 * sentence an author meets is the one pinned here. */
const table = (on: unknown) => () => validateAnswerTable(on, 'on');

describe('answer table shape', () => {
  it('carries the shipped grammar verbatim', () => {
    const authored = {
      intimidated: [
        { weight: 70, say: 'Fine!', fact: 'goblin-cowed' },
        { weight: 30, flee: {} },
      ],
      intimidate_failed: [{ say: 'Big talk for someone in my doorway.' }],
      persuaded: [{ say: 'All right, the cellar is yours.' }],
      persuade_failed: [{ say: 'Nice try.' }],
      time: [
        { when: { enemy: 'reach' }, attack: 'enemy' },
        { when: { attacked: { within: 3 } }, attack: 'attacker', weight: 3 },
        { when: { enemy: 'none' }, toward: { at: [3, 4] } },
        { hold: {} },
        { when: { fled: { within: 3 } }, away: 'actor', weight: 5 },
        { when: { enemy: 'remembered' }, toward: 'enemy' },
        { when: { intimidated: { within: 1 } }, toward: 'actor' },
      ],
    };
    expect(validateAnswerTable(authored, 'on')).toEqual(authored);
  });

  it('refuses an unknown trigger and an unknown entry key, with a suggestion', () => {
    expect(table({ taunted: [{ say: 'hi' }] })).toThrow(
      /"taunted" is not a trigger this build rolls: they are intimidated/
    );
    expect(table({ intimidate: [{ say: 'hi' }] })).toThrow(
      /did you mean "intimidated"\?/
    );
    expect(table({ intimidated: [{ fcat: 'x', say: 'hi' }] })).toThrow(
      /did you mean "fact"\?/
    );
    expect(table({ intimidated: [{ temper: 'coward' }] })).toThrow(
      /unknown key "temper"/
    );
  });

  it('refuses an empty trigger list and an entry that does nothing', () => {
    expect(table({ time: [] })).toThrow(
      /this names a trigger and lists nothing that happens on it/
    );
    expect(table({ time: [{}] })).toThrow(
      /this entry does nothing and says nothing/
    );
  });

  it('refuses a word under a trigger it is not legal on, in the engine sentences', () => {
    expect(table({ intimidated: [{ attack: 'enemy' }] })).toThrow(
      /`attack` is what a creature does with time, and `intimidated` is an outcome/
    );
    expect(table({ time: [{ fact: 'x' }] })).toThrow(
      /`fact` answers a social verdict, and `time` is not one/
    );
    expect(
      table({ intimidated: [{ when: { enemy: 'reach' }, flee: {} }] })
    ).toThrow(
      /`intimidated` is already the condition — a `when` under it asks when a thing that just happened happened/
    );
  });

  it('refuses more than one word, a zero weight and an empty fact', () => {
    expect(table({ intimidated: [{ fact: 'x', flee: {} }] })).toThrow(
      /an entry does one thing/
    );
    expect(table({ intimidated: [{ weight: 0, say: 'hi' }] })).toThrow(
      /a weight of 0 can never be rolled/
    );
    expect(table({ intimidated: [{ fact: '' }] })).toThrow(
      /this says the world learns something and does not say what/
    );
  });

  it('refuses a malformed when and a selector the engine cannot resolve', () => {
    expect(table({ time: [{ when: { enemy: 'near' }, hold: {} }] })).toThrow(
      /`enemy: near` is not a condition this build reads/
    );
    expect(
      table({ time: [{ when: { enemy: 'reach', seen: 'x' }, hold: {} }] })
    ).toThrow(/a `when` is one condition, and this names 2/);
    expect(table({ time: [{ when: { fled: {} }, hold: {} }] })).toThrow(
      /`fled` names no span/
    );
    expect(
      table({ time: [{ when: { fled: { within: 0 } }, hold: {} }] })
    ).toThrow(/a span of 0 rounds is counted from 1/);
    expect(table({ time: [{ toward: 'nobody' }] })).toThrow(
      /"nobody" is not a selector this build resolves/
    );
    expect(table({ time: [{ attack: { at: [1, 2] } }] })).toThrow(
      /a cell is somewhere to walk toward, and `attack` acts on a creature/
    );
    expect(table({ time: [{ attack: 'actor' }] })).toThrow(
      /`actor` is the actor of the deed this entry's `when` names/
    );
    expect(
      table({ time: [{ away: 'actor', when: { attacked: { within: 2 } } }] })
    ).not.toThrow();
  });
});
