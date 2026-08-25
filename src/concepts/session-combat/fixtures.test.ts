import { describe, expect, it } from 'vitest';
import { SESSION_COMBAT_FIXTURES } from './fixtures';

describe('session combat review fixtures', () => {
  it('provides the complete hard-state matrix', () => {
    expect(SESSION_COMBAT_FIXTURES.map((fixture) => fixture.id)).toEqual([
      'fresh-turn',
      'spent-turn',
      'spectating',
      'free-roam',
      'reconnected',
    ]);
  });

  it('makes spent economy and every refusal server-authored', () => {
    const spent = SESSION_COMBAT_FIXTURES.find(
      (fixture) => fixture.id === 'spent-turn'
    );

    expect(spent).toMatchObject({
      mode: 'turn',
      isViewerTurn: true,
      economy: { action: false, bonus: true, reaction: true },
      viewer: { movementRemainingFeet: 10 },
    });
    expect(
      spent?.offers.find((offer) => offer.id === 'attack:longsword')
    ).toMatchObject({
      available: false,
      unavailableReason: 'Action: 1 needed, 0 left.',
    });
  });

  it('represents another participant turn without viewer commands', () => {
    const spectating = SESSION_COMBAT_FIXTURES.find(
      (fixture) => fixture.id === 'spectating'
    );

    expect(spectating).toMatchObject({
      mode: 'turn',
      isViewerTurn: false,
      activeParticipantName: 'Skeleton Archer',
      economy: null,
      offers: [],
    });
  });

  it('represents free roam without turn economy or combat actions', () => {
    const freeRoam = SESSION_COMBAT_FIXTURES.find(
      (fixture) => fixture.id === 'free-roam'
    );

    expect(freeRoam).toMatchObject({
      mode: 'free-roam',
      isViewerTurn: false,
      activeParticipantName: null,
      economy: null,
      offers: [],
    });
  });

  it('retains ordered Story and exhaustive Debug facts after catch-up', () => {
    const reconnected = SESSION_COMBAT_FIXTURES.find(
      (fixture) => fixture.id === 'reconnected'
    );

    expect(reconnected).toMatchObject({ streamState: 'caught-up' });
    expect(reconnected?.story.map((entry) => entry.id)).toEqual([
      'round-1-guard',
      'round-1-mira',
      'round-2-turn',
      'catch-up-restored',
    ]);
    expect(reconnected?.debug.at(-1)).toContain(
      'catch_up from_seq=18 entries=3'
    );
  });
});
