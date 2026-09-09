// @vitest-environment node
/**
 * What the player is told when the run is over (rpg-dnd5e-web#999).
 *
 * Kirk: "a toast we won or we lost is sufficient."
 */
import { describe, expect, it } from 'vitest';
import { endingDetail, runEndedHeadline, runOutcome } from './runEnding';

describe('the two endings that decide a run', () => {
  it('calls the boss going down a win, and the party going down a loss', () => {
    expect(runOutcome('boss-down')).toBe('won');
    expect(runOutcome('party_defeated')).toBe('lost');
    expect(runEndedHeadline('boss-down')).toBe('You won');
    expect(runEndedHeadline('party_defeated')).toBe('You lost');
  });

  it('names the party falling, which the old table never did', () => {
    // `party_defeated` had no row before #999, so a wipe read "The run has
    // ended." — the vaguest sentence for the sharpest moment.
    expect(endingDetail('party_defeated')).toBe('The party fell.');
  });

  it('refuses to call an undecided ending a loss', () => {
    // WITHDRAWING IS NOT LOSING. `ending` is an open string, so a client that
    // treated "not a win" as a loss would mislabel every ending the rulebook
    // grows next, sight unseen.
    for (const ending of ['withdrawn', 'abandoned', 'negotiated', '']) {
      expect(runOutcome(ending)).toBeUndefined();
      expect(runEndedHeadline(ending)).toBe('The run has ended');
    }
  });

  it('keeps the sentences the endings already had', () => {
    expect(endingDetail('boss-down')).toBe('The tomb is cleared.');
    expect(endingDetail('withdrawn')).toBe('The party withdrew.');
    expect(endingDetail('abandoned')).toBe('The run was abandoned.');
    expect(endingDetail('something-new')).toBe(
      'The encounter is over — the outcome is recorded.'
    );
  });
});
