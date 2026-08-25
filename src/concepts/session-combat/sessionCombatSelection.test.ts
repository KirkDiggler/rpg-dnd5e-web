import { describe, expect, it } from 'vitest';
import { SESSION_COMBAT_FIXTURES } from './fixtures';
import { selectOffer, selectTarget } from './sessionCombatSelection';

const fixture = SESSION_COMBAT_FIXTURES[0];

describe('session combat server-offer selection', () => {
  it('exposes only the candidates declared by the selected offer', () => {
    const selection = selectOffer(fixture, 'attack:longsword');

    expect(selection?.offer.id).toBe('attack:longsword');
    expect(selection?.candidates.map((candidate) => candidate.id)).toEqual([
      'skeleton-guard',
      'skeleton-archer',
    ]);
  });

  it('preserves the server reason on an unavailable candidate', () => {
    const selection = selectOffer(fixture, 'attack:longsword');
    const archer = selection?.candidates.find(
      (candidate) => candidate.id === 'skeleton-archer'
    );

    expect(archer).toEqual({
      id: 'skeleton-archer',
      name: 'Skeleton Archer',
      available: false,
      reason: 'Target is outside this attack’s reach.',
    });
  });

  it('selects an available declared target and refuses unknown or unavailable targets', () => {
    const selection = selectOffer(fixture, 'attack:longsword');
    expect(selection).not.toBeNull();
    if (!selection) return;

    expect(selectTarget(selection, 'missing-member').target).toBeNull();
    expect(selectTarget(selection, 'skeleton-archer').target).toBeNull();
    expect(selectTarget(selection, 'skeleton-guard').target?.id).toBe(
      'skeleton-guard'
    );
  });
});
