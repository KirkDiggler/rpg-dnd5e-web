/**
 * The tray opens itself when a roll is wanted and the player can put it away
 * again (Kirk, 2026-08-28). `semanticFallback` keeps these renders off WebGL —
 * the collapse behaviour is the subject here, not the 3D die.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DiceDrawer } from './DiceDrawer';
import type { CombatExperiencePhase } from './types';

function renderDrawer(phase: CombatExperiencePhase = 'settled') {
  return render(
    <DiceDrawer
      phase={phase}
      events={[]}
      rollerName="Aldric"
      semanticFallback
      witnessRole="roller"
      onReleaseRequest={vi.fn()}
      onSemanticReleaseRequest={vi.fn()}
    />
  );
}

const drawer = () => screen.getByTestId('session-combat-dice-drawer');
const toggle = () => screen.getByTestId('session-combat-dice-drawer-toggle');

describe('collapsing the dice tray', () => {
  it('opens itself when there is a die worth showing', () => {
    renderDrawer();
    expect(drawer().dataset.visibility).toBeUndefined();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });

  it('puts the tray away when the player asks', () => {
    renderDrawer();
    fireEvent.click(toggle());

    expect(drawer().dataset.visibility).toBe('collapsed');
    expect(screen.getByText('Tray hidden · open it to roll')).toBeTruthy();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('brings it back when the player asks again', () => {
    renderDrawer();
    fireEvent.click(toggle());
    fireEvent.click(toggle());

    expect(drawer().dataset.visibility).toBeUndefined();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });

  it('reopens when the turn starts waiting on this player to roll', () => {
    // Collapsed is a preference, not a way to get stuck: the roll is the one
    // thing the tray is a control for.
    const { rerender } = renderDrawer('settled');
    fireEvent.click(toggle());
    expect(drawer().dataset.visibility).toBe('collapsed');

    rerender(
      <DiceDrawer
        phase="awaiting-roll"
        events={[]}
        rollerName="Aldric"
        semanticFallback
        witnessRole="roller"
        onReleaseRequest={vi.fn()}
        onSemanticReleaseRequest={vi.fn()}
      />
    );

    expect(drawer().dataset.visibility).toBeUndefined();
  });

  it('leaves a spectator’s choice alone when a roll starts', () => {
    const spectator = (phase: CombatExperiencePhase) => (
      <DiceDrawer
        phase={phase}
        events={[]}
        rollerName="Mira"
        semanticFallback
        witnessRole="spectator"
      />
    );
    const { rerender } = render(spectator('settled'));
    fireEvent.click(toggle());
    expect(drawer().dataset.visibility).toBe('collapsed');

    rerender(spectator('awaiting-roll'));
    expect(drawer().dataset.visibility).toBe('collapsed');
  });

  it('offers no control when there is nothing behind it to open', () => {
    renderDrawer('fresh');
    expect(drawer().dataset.visibility).toBe('idle');
    expect(
      screen.queryByTestId('session-combat-dice-drawer-toggle')
    ).toBeNull();
    expect(
      screen.getByText('Ready when an action calls for a roll')
    ).toBeTruthy();
  });
});
