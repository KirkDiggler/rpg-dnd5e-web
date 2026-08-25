import { describe, expect, it } from 'vitest';
import {
  appendSessionCombatDiceEvent,
  createSessionCombatDiceRequest,
  createSessionCombatNeutralRelease,
} from './diceFixture';

describe('session combat dice presentation fixture', () => {
  it('keeps the authoritative d20 result on the request', () => {
    const [request] = createSessionCombatDiceRequest('attack-19', 17);

    expect(request.die.authoritativeResult).toBe(17);
    expect(request.die.presetId).toBe('dice.original.carved.d20');
  });

  it('appends only the first compatible release', () => {
    const initial = createSessionCombatDiceRequest('attack-19', 17);
    const release = createSessionCombatNeutralRelease(initial);
    const once = appendSessionCombatDiceEvent(initial, release);
    const twice = appendSessionCombatDiceEvent(once, release);

    expect(once).toHaveLength(2);
    expect(twice).toBe(once);
  });

  it('never carries or changes outcome authority through the release profile', () => {
    const initial = createSessionCombatDiceRequest('attack-19', 17);
    const release = createSessionCombatNeutralRelease(initial);
    const appended = appendSessionCombatDiceEvent(initial, release);

    expect(initial[0].die.authoritativeResult).toBe(17);
    expect(appended[0].type).toBe('dice-presentation-requested');
    if (appended[0].type !== 'dice-presentation-requested') {
      throw new Error('request must remain first');
    }
    expect(appended[0].die.authoritativeResult).toBe(17);
    expect(JSON.stringify(release)).not.toContain('authoritativeResult');
  });
});
