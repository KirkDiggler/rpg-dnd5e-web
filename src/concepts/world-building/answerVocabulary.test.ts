import { describe, expect, it } from 'vitest';
import type { AnswerWhenCondition } from './answerTableShape';
import {
  conditionPhrase,
  conditionShorthand,
  deedLabel,
  enemyBandPhrase,
  factLabel,
  heardLabel,
  triggerPhrase,
  whenPhrase,
  wordPhrase,
} from './answerVocabulary';

describe('answerVocabulary', () => {
  const both = (c: AnswerWhenCondition) => [
    conditionPhrase(c, 'I'),
    conditionPhrase(c, 'it'),
  ];

  it('says each enemy band the same for either subject', () => {
    expect(both({ enemy: 'reach' })).toEqual([
      'an enemy is in reach',
      'an enemy is in reach',
    ]);
    expect(conditionPhrase({ enemy: 'seen' }, 'it')).toBe('an enemy is seen');
    expect(conditionPhrase({ enemy: 'remembered' }, 'it')).toBe(
      'an enemy is remembered'
    );
    expect(conditionPhrase({ enemy: 'none' }, 'I')).toBe(
      'no enemy is seen or remembered'
    );
  });

  it('says a deed with its span and whose deed it is', () => {
    expect(both({ attacked: { within: 3 } })).toEqual([
      'I was attacked within 3 rounds',
      'it was attacked within 3 rounds',
    ]);
    expect(conditionPhrase({ attacked: { within: 1, on: 'ally' } }, 'it')).toBe(
      'an ally was attacked within 1 round'
    );
    expect(both({ intimidated: { within: 2, as: 'actor' } })).toEqual([
      'I intimidated within 2 rounds',
      'it intimidated within 2 rounds',
    ]);
    expect(both({ fled: { within: 2 } })).toEqual([
      'I fled within 2 rounds',
      'it fled within 2 rounds',
    ]);
    expect(conditionPhrase({ persuaded: { within: 4 } }, 'it')).toBe(
      'it was persuaded within 4 rounds'
    );
  });

  it('says a sound heard and a fact known', () => {
    expect(both({ heard: { kind: 'clang', within: 2 } })).toEqual([
      'I heard a clang within 2 rounds',
      'it heard a clang within 2 rounds',
    ]);
    expect(both({ fact: 'alarm-raised' })).toEqual([
      'I know alarm-raised',
      'it knows alarm-raised',
    ]);
  });

  it('says a not as the negative of its one condition', () => {
    expect(both({ not: { fact: 'alarm-raised' } })).toEqual([
      'I do not know alarm-raised',
      'it does not know alarm-raised',
    ]);
    expect(conditionPhrase({ not: { enemy: 'reach' } }, 'it')).toBe(
      'no enemy is in reach'
    );
    expect(conditionPhrase({ not: { attacked: { within: 3 } } }, 'it')).toBe(
      'it was not attacked within 3 rounds'
    );
    expect(
      conditionPhrase({ not: { heard: { kind: 'voice', within: 1 } } }, 'it')
    ).toBe('it did not hear a voice within 1 round');
    expect(conditionPhrase({ not: { not: { fact: 'x' } } }, 'it')).toBe(
      'it is not so that it does not know x'
    );
  });

  it('joins a list of conditions with and', () => {
    expect(
      whenPhrase([{ enemy: 'seen' }, { not: { fact: 'alarm-raised' } }], 'it')
    ).toBe('an enemy is seen and it does not know alarm-raised');
    expect(whenPhrase(undefined, 'it')).toBeUndefined();
  });

  it('says each word as a verb agreeing with the subject', () => {
    const pair = (entry: Parameters<typeof wordPhrase>[0]) => [
      wordPhrase(entry, 'I'),
      wordPhrase(entry, 'it'),
    ];
    expect(pair({ attack: 'attacker' })).toEqual([
      'attack whoever hit me',
      'attacks whoever hit it',
    ]);
    expect(pair({ attack: 'enemy' })).toEqual([
      'attack the enemy',
      'attacks the enemy',
    ]);
    expect(pair({ toward: 'sound' })).toEqual([
      'walk toward the sound',
      'walks toward the sound',
    ]);
    expect(pair({ away: 'actor' })).toEqual([
      'walk away from whoever did it',
      'walks away from whoever did it',
    ]);
    expect(pair({ hold: {} })).toEqual(['hold', 'holds']);
    expect(pair({ flee: {} })).toEqual(['flee', 'flees']);
    expect(pair({ fact: 'alarm-raised' })).toEqual([
      'raise alarm-raised',
      'raises alarm-raised',
    ]);
    expect(wordPhrase({ fact: 'feast-tonight' }, 'it', 'success')).toBe(
      'teaches the speaker feast-tonight'
    );
    expect(wordPhrase({ say: 'Out!' }, 'it')).toBeUndefined();
  });

  it('labels the editor pickers in the first person', () => {
    expect(enemyBandPhrase('reach')).toBe('an enemy is in reach');
    expect(deedLabel('attacked', {})).toBe('I was attacked');
    expect(deedLabel('attacked', { on: 'ally' })).toBe('an ally was attacked');
    expect(deedLabel('attacked', { as: 'actor' })).toBe('I attacked');
    expect(deedLabel('fled', {})).toBe('I fled');
    expect(heardLabel()).toBe('I heard a sound');
    expect(factLabel()).toBe('I know a fact');
    expect(factLabel('it')).toBe('it knows a fact');
  });

  it('keeps the file words for the compact readout', () => {
    expect(conditionShorthand({ enemy: 'reach' })).toBe('enemy reach');
    expect(conditionShorthand({ attacked: { within: 3, on: 'ally' } })).toBe(
      'an ally attacked within 3'
    );
    expect(conditionShorthand({ not: { fact: 'x' } })).toBe('not fact x');
  });

  it('heads the time trigger in prose', () => {
    expect(triggerPhrase('time')).toBe('On its time');
  });
});
