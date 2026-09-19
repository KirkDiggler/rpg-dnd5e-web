import { describe, expect, it } from 'vitest';
import { validateAnswerTable } from './answerTableShape';

/**
 * THE ANSWER TABLE IS CARRIED, NOT GRADED (rpg-project#481 R3).
 *
 * This file used to pin twenty refusals — unknown trigger, word under the
 * wrong trigger, unknown band, deed with no span, unresolvable selector, zero
 * weight, empty fact — each in a sentence transcribed from `dungeonspec`.
 * They are deleted. `PutDungeon{validate_only}` compiles the bytes and
 * answers at the path it owns, and a second copy of a sentence is a copy that
 * drifts (rpg-dnd5e-web#1119, #1145).
 *
 * What is asserted now is the property the rest of the document depends on:
 * whatever the author wrote comes back IDENTICAL, so the bytes that reach the
 * compiler are the bytes that were authored.
 */
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

  it('carries a trigger key and an entry key this build has never heard of', () => {
    // `taunted` is not a trigger `encounter.TableKeys` rolls and `fcat` is a
    // slip for `fact`. Both used to stop the document here; both now reach
    // the compiler, which names them at `factions[i].on.taunted` and at the
    // entry's own path.
    const authored = {
      taunted: [{ say: 'hi' }],
      intimidated: [{ fcat: 'x', say: 'hi' }, { temper: 'coward' }],
    };
    expect(validateAnswerTable(authored, 'on')).toEqual(authored);
  });

  it('carries an empty trigger list and an entry that does nothing', () => {
    expect(validateAnswerTable({ time: [] }, 'on')).toEqual({ time: [] });
    expect(validateAnswerTable({ time: [{}] }, 'on')).toEqual({ time: [{}] });
  });

  it('carries a word written under a trigger it is not legal on', () => {
    // `wordLegality` is `validate.go`'s rule and `validate.go` makes it.
    const authored = {
      intimidated: [
        { attack: 'enemy' },
        { when: { enemy: 'reach' }, flee: {} },
      ],
      time: [{ fact: 'x' }],
    };
    expect(validateAnswerTable(authored, 'on')).toEqual(authored);
  });

  it('carries two words, a zero weight and an empty fact', () => {
    const authored = {
      intimidated: [
        { fact: 'x', flee: {} },
        { weight: 0, say: 'hi' },
        { fact: '' },
      ],
    };
    expect(validateAnswerTable(authored, 'on')).toEqual(authored);
  });

  it('carries a `when` and a selector this build cannot read', () => {
    const authored = {
      time: [
        { when: { enemy: 'near' }, hold: {} },
        { when: { enemy: 'reach', seen: 'x' }, hold: {} },
        { when: { fled: {} }, hold: {} },
        { when: { fled: { within: 0 } }, hold: {} },
        { toward: 'nobody' },
        { attack: { at: [1, 2] } },
        { attack: 'actor' },
        { away: 'actor', when: { attacked: { within: 2 } } },
      ],
    };
    expect(validateAnswerTable(authored, 'on')).toEqual(authored);
  });

  it('refuses only what it has nowhere to put', () => {
    // The one refusal left: this document type stores the block as a mapping,
    // so a scalar or a list has no home in the decoded document. That is
    // "can't hold it", not "won't play".
    expect(table('intimidated')).toThrow(
      /on: expected a map of trigger to entries/
    );
    expect(table([{ intimidated: [] }])).toThrow(
      /on: expected a map of trigger to entries/
    );
  });
});
