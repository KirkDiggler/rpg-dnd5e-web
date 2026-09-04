import { act, fireEvent, render, screen, within } from '@testing-library/react';
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
    onTelemetry,
  }: {
    events: Array<{
      type: string;
      presentationId: string;
      die?: { presetId: string; authoritativeResult: number };
    }>;
    onReleaseRequest?: (event: unknown) => void;
    onTelemetry?: (telemetry: Record<string, unknown>) => void;
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
          onClick={() => {
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
            });
            // The real tray reports the die AT REST once the throw finishes,
            // and that observation is what reveals the outcome now. This stub
            // has no motion to run, so it lands immediately — but it must
            // still report, or it would stand in for a tray that never does.
            onTelemetry?.({
              presentationToken: 1,
              requestedResult: request.die?.authoritativeResult,
              renderer: '3d',
              state: 'observed',
              exactTargetHeld: true,
            });
          }}
        >
          Release die
        </button>
      </div>
    );
  },
}));

import { SessionCombatConcept } from './SessionCombatConcept';

/** The tooltip card a button describes itself by. */
function tooltipOf(button: HTMLElement): HTMLElement {
  const id = button.getAttribute('aria-describedby');
  const tooltip = id ? document.getElementById(id) : null;
  if (!tooltip) throw new Error('button has no tooltip');
  return tooltip;
}

describe('SessionCombatConcept shared-shell checkpoint', () => {
  it('composes all stable gameplay regions through the production-owned shell', () => {
    render(<SessionCombatConcept />);

    expect(screen.getByText('Fresh turn')).toBeTruthy();
    const shell = screen.getByTestId('combat-experience-shell');
    expect(shell.parentElement?.dataset.layout).toBe('review-frame');
    expect(shell.parentElement?.className).not.toContain(
      'combatExperienceFillParent'
    );
    expect(screen.getByTestId('session-combat-initiative')).toBeTruthy();
    expect(screen.getByTestId('session-combat-map')).toBeTruthy();
    expect(screen.getByTestId('session-combat-dock')).toBeTruthy();
    expect(screen.queryByTestId('session-combat-dice-drawer')).toBeNull();
    expect(screen.queryByTestId('local-world-die-tile')).toBeNull();
    expect(screen.getByTestId('session-combat-log')).toBeTruthy();
  });

  it('reuses SessionCanvas against the full reference-tomb fixture', () => {
    render(<SessionCombatConcept />);

    const canvas = screen.getByTestId('real-session-canvas');
    expect(canvas.dataset.cellCount).toBe('224');
    expect(canvas.dataset.characterId).toBe('aldric');
  });

  it('arms an authored Attack and exposes only its provider candidates', () => {
    render(<SessionCombatConcept />);

    const longsword = screen.getByRole('button', { name: /Longsword/ });
    // Authored identity, straight from the provider — the client never maps
    // a ref to a name of its own.
    expect(longsword.dataset.attackRef).toBe('dnd5e:weapons:longsword');
    fireEvent.click(longsword);

    expect(longsword.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Choose a target')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Map target skeleton-guard' })
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Map target skeleton-archer' })
    ).toBeNull();
    expect(screen.getByText(/outside this attack’s reach/)).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'Map target skeleton-guard' })
    );
    expect(screen.getByText('Attack declared')).toBeTruthy();
    expect(screen.getByText('Roll the attack die')).toBeTruthy();
    expect(screen.getByTestId('local-world-die-tile')).toBeTruthy();
  });

  it('uses the center only for a transient fresh-turn orientation', () => {
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

  it('keeps player Story separate from the raw Debug feed', () => {
    render(<SessionCombatConcept />);

    expect(screen.getByText('Aldric turns the blow aside')).toBeTruthy();
    expect(screen.queryByText(/seq=18 clock=6/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Debug' }));
    expect(screen.getByText(/seq=18 clock=6/)).toBeTruthy();
    expect(screen.getByText(/afford clock=TURN/)).toBeTruthy();
  });

  it('truthfully labels generated wire and presentation ownership', () => {
    render(<SessionCombatConcept />);
    fireEvent.click(screen.getByRole('button', { name: 'Show contract' }));

    expect(screen.getAllByText('Session wire').length).toBeGreaterThan(0);
    expect(screen.getByText('Existing character wire')).toBeTruthy();
    expect(screen.getAllByText('Presentation only').length).toBeGreaterThan(0);
    expect(screen.getByText('declarations')).toBeTruthy();
    expect(screen.queryByText('Missing provider contract')).toBeNull();
  });

  it('renders the Dying Death Save review state through the production CombatExperience', () => {
    render(<SessionCombatConcept />);
    fireEvent.click(screen.getByRole('button', { name: 'Death Save turn' }));

    const deathSave = within(
      screen.getByTestId('session-combat-dock')
    ).getByRole('button', { name: /^Death Save/ });
    expect(
      deathSave.querySelector('[data-cost="no-turn-slot"]')
    ).not.toBeNull();
    fireEvent.click(deathSave);
    expect(screen.getByText('2 successes · 1 to stabilize')).toBeTruthy();
    expect(screen.getByText('1 failures · 2 remaining')).toBeTruthy();
    expect(screen.getAllByTestId('death-save-success-pip')).toHaveLength(2);
    expect(screen.getAllByTestId('death-save-failure-pip')).toHaveLength(1);
    expect(screen.getByText('Attack die ready')).toBeTruthy();
    expect(screen.getByTestId('local-world-die-tile')).toBeTruthy();
    expect(screen.queryByRole('list', { name: /targets/i })).toBeNull();
  });

  it('renders spent declarations with Move remaining and End Turn independent', () => {
    render(<SessionCombatConcept />);
    fireEvent.click(screen.getByRole('button', { name: 'Spent turn' }));

    expect(screen.getAllByText('10 ft')).toHaveLength(2);
    const longsword = screen.getByRole('button', { name: /Longsword/ });
    expect((longsword as HTMLButtonElement).disabled).toBe(true);
    expect(tooltipOf(longsword).textContent).toContain(
      'Action: 1 needed, 0 left.'
    );
    expect(
      (screen.getByRole('button', { name: 'End turn' }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
    expect(screen.queryByRole('button', { name: /Second Wind/ })).toBeNull();
  });

  it('renders another participant turn without viewer command controls', () => {
    render(<SessionCombatConcept />);
    fireEvent.click(screen.getByRole('button', { name: 'Spectating' }));

    expect(screen.getByText('Skeleton Archer’s turn')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Longsword/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'End turn' })).toBeNull();
    expect(screen.getByTitle('Skeleton Archer').dataset.active).toBe('true');
  });

  it('renders world time without initiative or combat declarations', () => {
    render(<SessionCombatConcept />);
    fireEvent.click(screen.getByRole('button', { name: 'Free roam' }));

    expect(screen.getByTestId('session-combat-free-roam')).toBeTruthy();
    expect(screen.getByText('Click the floor to move')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'End turn' })).toBeNull();
  });

  it('shows caught-up Story and Debug history after reconnect', () => {
    render(<SessionCombatConcept />);
    fireEvent.click(screen.getByRole('button', { name: 'Reconnected' }));

    expect(screen.getByText('Caught up')).toBeTruthy();
    expect(screen.getByText('You are caught up')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }));
    expect(screen.getByText(/catch_up from_seq=18 entries=3/)).toBeTruthy();
  });

  it('resets phase, selection, dice, turn notice, and log mode together on a scenario transition', () => {
    render(<SessionCombatConcept />);
    fireEvent.click(screen.getByRole('button', { name: /Longsword/ }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Map target skeleton-guard' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }));

    expect(screen.getByText('Attack declared')).toBeTruthy();
    expect(screen.getByTestId('local-world-die-tile')).toBeTruthy();
    expect(screen.getByText(/seq=18 clock=6/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Spent turn' }));

    expect(screen.queryByText('Attack declared')).toBeNull();
    expect(
      screen
        .getByRole('button', { name: /Longsword/ })
        .getAttribute('aria-pressed')
    ).toBe('false');
    expect(screen.queryByTestId('local-world-die-tile')).toBeNull();
    expect(screen.queryByText('Choose an action or move')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Story' }).getAttribute('aria-pressed')
    ).toBe('true');
    expect(screen.queryByText(/seq=18 clock=6/)).toBeNull();
    expect(screen.getByText('Aldric turns the blow aside')).toBeTruthy();
  });

  it('keeps the authoritative story concealed while awaiting the local die and clears the tile in the settled review state', () => {
    render(<SessionCombatConcept />);
    fireEvent.click(screen.getByRole('button', { name: /Longsword/ }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Map target skeleton-guard' })
    );

    expect(screen.getByTestId('local-world-die-tile')).toBeTruthy();
    expect(screen.queryByText('Aldric strikes Skeleton Guard')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Settled' }));
    expect(screen.getByText('Result delivered')).toBeTruthy();
    expect(screen.queryByTestId('local-world-die-tile')).toBeNull();
  });
});
