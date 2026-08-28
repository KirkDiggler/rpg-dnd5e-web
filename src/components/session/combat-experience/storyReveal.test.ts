import { describe, expect, it } from 'vitest';
import { holdStoryUntilSettled } from './storyReveal';
import type { CombatExperienceStoryExchange } from './types';

function entry(id: string, headline = id): CombatExperienceStoryExchange {
  return {
    id,
    eyebrow: 'Aldric',
    headline,
    detail: '',
    tone: 'neutral',
  };
}

const story = [
  entry('turn-start'),
  entry('atk-1', 'Aldric strikes Skeleton Guard'),
  entry('downed-1', 'Skeleton Guard is downed'),
];

describe('holdStoryUntilSettled', () => {
  it('reveals everything when no roll is in flight', () => {
    expect(holdStoryUntilSettled(story, undefined)).toBe(story);
  });

  it('withholds the strike AND its consequences while the die is rolling', () => {
    // Hiding the strike but leaving "Skeleton Guard is downed" underneath it
    // would spoil the roll just as completely.
    expect(holdStoryUntilSettled(story, 'atk-1').map((e) => e.id)).toEqual([
      'turn-start',
    ]);
  });

  it('lets the whole tail land together once the die settles', () => {
    expect(holdStoryUntilSettled(story, undefined).map((e) => e.id)).toEqual([
      'turn-start',
      'atk-1',
      'downed-1',
    ]);
  });

  it('reveals everything when the rolling attack has no entry yet', () => {
    // Nothing has arrived to cut at, so there is nothing after it to hide.
    expect(holdStoryUntilSettled(story, 'atk-not-here')).toBe(story);
  });

  it('holds the whole log when the strike is the first thing in it', () => {
    const fromStrike = [entry('atk-1'), entry('downed-1')];
    expect(holdStoryUntilSettled(fromStrike, 'atk-1')).toEqual([]);
  });

  it('returns the same array when nothing is held, for render stability', () => {
    expect(holdStoryUntilSettled(story, undefined)).toBe(story);
    expect(holdStoryUntilSettled([], 'atk-1')).toEqual([]);
  });
});
