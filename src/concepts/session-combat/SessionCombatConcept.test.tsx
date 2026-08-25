import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../components/session/SessionCanvas', () => ({
  SessionCanvas: ({
    scene,
    characterId,
    attackableTargets = [],
    onEntityClick,
  }: {
    scene: { floorTiles: Map<string, unknown> };
    characterId: string;
    attackableTargets?: string[];
    onEntityClick?: (targetId: string) => void;
  }) => (
    <div
      data-testid="real-session-canvas"
      data-cell-count={scene.floorTiles.size}
      data-character-id={characterId}
    >
      {attackableTargets.map((targetId) => (
        <button
          key={targetId}
          type="button"
          onClick={() => onEntityClick?.(targetId)}
        >
          Map target {targetId}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('../../components/ui/dice/DiceTrayPresentation', () => ({
  DiceTrayPresentation: ({
    events,
    onReleaseRequest,
  }: {
    events: Array<{
      type: string;
      presentationId: string;
      die?: { presetId: string; authoritativeResult: number };
    }>;
    onReleaseRequest?: (event: unknown) => void;
  }) => {
    const request = events.find(
      (event) => event.type === 'dice-presentation-requested'
    );
    if (!request?.die) return null;
    return (
      <div
        data-testid="real-dice-presentation"
        data-result={request.die.authoritativeResult}
      >
        <button
          type="button"
          onClick={() =>
            onReleaseRequest?.({
              schemaVersion: 1,
              type: 'dice-presentation-released',
              eventId: `${request.presentationId}:release`,
              presentationId: request.presentationId,
              release: {
                schemaVersion: 2,
                presentationId: request.presentationId,
                presetId: request.die?.presetId,
                throwProfile: {
                  schemaVersion: 1,
                  releasePosition: [0.5, 0.5],
                  releaseDirection: [0, 0],
                  releaseSpeed: 0,
                  shakeEnergy: 0,
                  spinBias: 0,
                  motionSeed: 19,
                },
              },
            })
          }
        >
          Release die
        </button>
      </div>
    );
  },
}));

import { SessionCombatConcept } from './SessionCombatConcept';

describe('SessionCombatConcept structure checkpoint', () => {
  it('composes the five stable gameplay regions around the fresh-turn fixture', () => {
    render(<SessionCombatConcept />);

    expect(screen.getByText('Fresh turn')).toBeTruthy();
    expect(screen.getByTestId('session-combat-initiative')).toBeTruthy();
    expect(screen.getByTestId('session-combat-map')).toBeTruthy();
    expect(screen.getByTestId('session-combat-dock')).toBeTruthy();
    expect(screen.getByTestId('session-combat-dice-drawer')).toBeTruthy();
    expect(screen.getByTestId('session-combat-log')).toBeTruthy();
  });

  it('renders the real session canvas against the full reference-tomb fixture', () => {
    render(<SessionCombatConcept />);

    const canvas = screen.getByTestId('real-session-canvas');
    expect(canvas.dataset.cellCount).toBe('224');
    expect(canvas.dataset.characterId).toBe('aldric');
  });

  it('arms a server offer, exposes only its affordable map targets, and waits for the roll after targeting', () => {
    render(<SessionCombatConcept />);

    const longsword = screen.getByRole('button', { name: /Longsword/ });
    fireEvent.click(longsword);

    expect(longsword.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Choose a target')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Map target skeleton-guard' })
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Map target skeleton-archer' })
    ).toBeNull();
    expect(
      screen.getByText(/Target is outside this attack’s reach\./)
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'Map target skeleton-guard' })
    );

    expect(screen.getByText('Attack declared')).toBeTruthy();
    expect(screen.getByText('Roll in the dice drawer')).toBeTruthy();
    expect(screen.getByText('Roll your carved iron d20')).toBeTruthy();
  });

  it('keeps an unavailable action disabled with the server-authored reason', () => {
    render(<SessionCombatConcept />);

    const actionSurge = screen.getByRole('button', { name: /Action Surge/ });
    expect((actionSurge as HTMLButtonElement).disabled).toBe(true);
    expect(actionSurge.getAttribute('title')).toBe(
      'No uses remaining until a short rest.'
    );
  });

  it('uses the center only for a transient turn-start orientation', () => {
    vi.useFakeTimers();
    try {
      render(<SessionCombatConcept />);
      expect(screen.getByText('Choose an action or move')).toBeTruthy();

      act(() => vi.advanceTimersByTime(2200));

      expect(screen.queryByText('Choose an action or move')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps player Story separate from the exhaustive raw Debug feed', () => {
    render(<SessionCombatConcept />);

    expect(screen.getByText('Aldric turns the blow aside')).toBeTruthy();
    expect(screen.queryByText(/seq=18 clock=6/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Debug' }));
    expect(screen.getByText(/seq=18 clock=6/)).toBeTruthy();
    expect(screen.getByText(/afford clock=TURN/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Story' }));
    expect(screen.getByText('Aldric turns the blow aside')).toBeTruthy();
  });

  it('shows current and provisional field ownership in the concept-only contract inspector', () => {
    render(<SessionCombatConcept />);

    fireEvent.click(screen.getByRole('button', { name: 'Show contract' }));

    expect(screen.getAllByText('Session wire').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText('Missing provider contract').length
    ).toBeGreaterThan(0);
    expect(screen.getByText('offers')).toBeTruthy();
    expect(screen.getByText('participants')).toBeTruthy();
  });

  it('renders spent economy from server-authored facts without hiding remaining options', () => {
    render(<SessionCombatConcept />);

    fireEvent.click(screen.getByRole('button', { name: 'Spent turn' }));

    expect(screen.queryByText('Choose an action or move')).toBeNull();
    expect(screen.getByText('10 ft')).toBeTruthy();
    expect(screen.getByTitle('Action spent')).toBeTruthy();
    const longsword = screen.getByRole('button', { name: /Longsword/ });
    expect((longsword as HTMLButtonElement).disabled).toBe(true);
    expect(longsword.getAttribute('title')).toBe('Action: 1 needed, 0 left.');
    expect(
      (screen.getByRole('button', { name: /Second Wind/ }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
  });

  it('renders another participant turn without viewer command controls', () => {
    render(<SessionCombatConcept />);

    fireEvent.click(screen.getByRole('button', { name: 'Spectating' }));

    expect(screen.getByText('Skeleton Archer’s turn')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Longsword/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'End turn' })).toBeNull();
    expect(
      screen.getByTitle('Skeleton Archer').getAttribute('data-active')
    ).toBe('true');
  });

  it('renders free roam without initiative, economy, or combat commands', () => {
    render(<SessionCombatConcept />);

    fireEvent.click(screen.getByRole('button', { name: 'Free roam' }));

    expect(screen.getByTestId('session-combat-free-roam')).toBeTruthy();
    expect(screen.getByText('Click the floor to move')).toBeTruthy();
    expect(screen.queryByLabelText('Turn resources')).toBeNull();
    expect(screen.queryByRole('button', { name: 'End turn' })).toBeNull();
  });

  it('shows caught-up stream state and preserves restored Story and Debug history', () => {
    render(<SessionCombatConcept />);

    fireEvent.click(screen.getByRole('button', { name: 'Reconnected' }));

    expect(screen.queryByText('Choose an action or move')).toBeNull();
    expect(screen.getByText('Caught up')).toBeTruthy();
    expect(screen.getByText('You are caught up')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }));
    expect(screen.getByText(/catch_up from_seq=18 entries=3/)).toBeTruthy();
  });

  it('expands the real dice presentation and reveals the result story only after release delivery', () => {
    render(<SessionCombatConcept />);
    fireEvent.click(screen.getByRole('button', { name: /Longsword/ }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Map target skeleton-guard' })
    );

    const presentation = screen.getByTestId('real-dice-presentation');
    expect(presentation.dataset.result).toBe('12');
    expect(screen.queryByText('Aldric strikes Skeleton Guard')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Release die' }));

    expect(screen.getByText('Aldric strikes Skeleton Guard')).toBeTruthy();
  });
});
