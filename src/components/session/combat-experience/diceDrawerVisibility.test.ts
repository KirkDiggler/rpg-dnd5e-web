import { describe, expect, it } from 'vitest';
import {
  diceDrawerVisibility,
  hasSomethingToShow,
  shouldReopenForRoll,
} from './diceDrawerVisibility';

describe('diceDrawerVisibility', () => {
  it('is idle when the fight is not asking for a roll', () => {
    expect(diceDrawerVisibility('fresh', false)).toBe('idle');
    // Even a player who collapsed it sees the idle pill, not a "reopen" one:
    // there is nothing behind it to open.
    expect(diceDrawerVisibility('fresh', true)).toBe('idle');
  });

  it('opens itself for every phase that has a die worth showing', () => {
    for (const phase of [
      'awaiting-roll',
      'released-waiting-event',
      'settled',
    ] as const) {
      expect(diceDrawerVisibility(phase, false)).toBe('expanded');
      expect(hasSomethingToShow(phase)).toBe(true);
    }
  });

  it('stays out of the way once the player closes it', () => {
    expect(diceDrawerVisibility('settled', true)).toBe('collapsed');
    expect(diceDrawerVisibility('awaiting-roll', true)).toBe('collapsed');
  });
});

describe('shouldReopenForRoll', () => {
  it('reopens when the turn starts waiting on the roller', () => {
    expect(shouldReopenForRoll('settled', 'awaiting-roll', 'roller')).toBe(
      true
    );
    expect(shouldReopenForRoll(undefined, 'awaiting-roll', 'roller')).toBe(
      true
    );
  });

  it('does not re-fight the player on every render of the same phase', () => {
    // Only the EDGE into awaiting-roll reopens. Without this, collapsing
    // during your own roll would spring straight back open.
    expect(
      shouldReopenForRoll('awaiting-roll', 'awaiting-roll', 'roller')
    ).toBe(false);
  });

  it('leaves a spectator’s choice alone', () => {
    // Nothing for them to do in there, so nothing justifies overruling them.
    expect(shouldReopenForRoll('settled', 'awaiting-roll', 'spectator')).toBe(
      false
    );
  });

  it('does not reopen for phases that are not a demand to roll', () => {
    expect(shouldReopenForRoll('awaiting-roll', 'settled', 'roller')).toBe(
      false
    );
    expect(
      shouldReopenForRoll('settled', 'released-waiting-event', 'roller')
    ).toBe(false);
    expect(shouldReopenForRoll('settled', 'fresh', 'roller')).toBe(false);
  });
});
