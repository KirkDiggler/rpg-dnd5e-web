/**
 * No jest-dom matchers — this repo's vitest config has no such setup
 * (`vite.config.ts`'s `test` block, per `YamlPane.test.tsx`'s own note),
 * so assertions use plain DOM properties. `combatPanel.test.ts` owns the
 * enabled/disabled/lit LOGIC exhaustively; this file just checks the
 * component draws a `CombatPanelSelection` correctly.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CombatPanelSelection } from './combatPanel';
import { CombatPanel } from './CombatPanel';

function isDisabled(el: HTMLElement): boolean {
  return (el as HTMLButtonElement).disabled;
}

const noop = () => {};

describe('CombatPanel', () => {
  it('free-roam renders the quiet pill, no round/order/actions', () => {
    render(
      <CombatPanel
        selection={{ mode: 'free-roam' }}
        onAttackClick={noop}
        onEndTurnClick={noop}
        attacking={false}
        endingTurn={false}
      />
    );

    expect(screen.getByTestId('turn-hud-free-roam-pill').textContent).toBe(
      'Free roam'
    );
    expect(screen.queryByTestId('combat-panel-round')).toBeNull();
    expect(screen.queryByTestId('combat-panel-attack-button')).toBeNull();
  });

  it('turn mode renders round, order chips, shapes, declarations, target line, and both buttons', () => {
    const selection: CombatPanelSelection = {
      mode: 'turn',
      round: 2,
      order: [
        { id: 'char-1', isActive: true, isYou: true },
        { id: 'skeleton-1', isActive: false, isYou: false },
      ],
      shapes: [
        { slot: 'action', lit: true },
        { slot: 'bonus', lit: false },
        { slot: 'reaction', lit: false },
      ],
      declarations: [
        { verb: 1, slot: 2, affordable: true, shortfall: '' } as never,
      ],
      attack: { enabled: false, reason: 'Pick a target.' },
      endTurn: { enabled: true, reason: null },
      targeting: true,
      selectedTargetId: null,
      waitingOn: null,
      lastBeat: null,
    };

    render(
      <CombatPanel
        selection={selection}
        onAttackClick={noop}
        onEndTurnClick={noop}
        attacking={false}
        endingTurn={false}
      />
    );

    expect(screen.getByTestId('combat-panel-round').textContent).toBe(
      'Round 2'
    );
    const chips = screen.getAllByTestId('combat-panel-order-chip');
    expect(chips).toHaveLength(2);
    expect(chips[0]!.textContent).toContain('char-1');
    expect(chips[0]!.textContent).toContain('(you)');
    expect(
      screen.getByTestId('turn-hud-shape-action').getAttribute('data-lit')
    ).toBe('true');
    expect(screen.getByTestId('turn-hud-declaration-row').textContent).toBe(
      'Attack — ready'
    );
    expect(screen.getByTestId('combat-panel-target').textContent).toBe(
      'No target selected'
    );
    expect(isDisabled(screen.getByTestId('combat-panel-attack-button'))).toBe(
      true
    );
    expect(screen.getByTestId('combat-panel-attack-button').title).toBe(
      'Pick a target.'
    );
    expect(isDisabled(screen.getByTestId('combat-panel-end-turn-button'))).toBe(
      false
    );
    expect(screen.queryByTestId('combat-panel-waiting-on')).toBeNull();
    expect(screen.queryByTestId('combat-panel-beat-line')).toBeNull();
  });

  it('shows "Target: X", the waitingOn line, and the beat line when present', () => {
    const selection: CombatPanelSelection = {
      mode: 'turn',
      round: 1,
      order: [{ id: 'skeleton-1', isActive: true, isYou: false }],
      shapes: [
        { slot: 'action', lit: false },
        { slot: 'bonus', lit: false },
        { slot: 'reaction', lit: false },
      ],
      declarations: [],
      attack: { enabled: false, reason: 'Not your turn.' },
      endTurn: { enabled: false, reason: 'Not your turn.' },
      targeting: false,
      selectedTargetId: 'skeleton-1',
      waitingOn: 'skeleton-1',
      lastBeat: 'You hit skeleton-1: 17 vs AC 13 for 6',
    };

    render(
      <CombatPanel
        selection={selection}
        onAttackClick={noop}
        onEndTurnClick={noop}
        attacking={false}
        endingTurn={false}
      />
    );

    expect(screen.getByTestId('combat-panel-target').textContent).toBe(
      'Target: skeleton-1'
    );
    expect(screen.getByTestId('combat-panel-waiting-on').textContent).toBe(
      'Waiting on skeleton-1.'
    );
    expect(screen.getByTestId('combat-panel-beat-line').textContent).toBe(
      'You hit skeleton-1: 17 vs AC 13 for 6'
    );
  });

  it('clicking Attack/End Turn calls the respective handler', () => {
    const onAttackClick = vi.fn();
    const onEndTurnClick = vi.fn();
    const selection: CombatPanelSelection = {
      mode: 'turn',
      round: 1,
      order: [{ id: 'char-1', isActive: true, isYou: true }],
      shapes: [
        { slot: 'action', lit: true },
        { slot: 'bonus', lit: false },
        { slot: 'reaction', lit: false },
      ],
      declarations: [],
      attack: { enabled: true, reason: null },
      endTurn: { enabled: true, reason: null },
      targeting: true,
      selectedTargetId: 'skeleton-1',
      waitingOn: null,
      lastBeat: null,
    };

    render(
      <CombatPanel
        selection={selection}
        onAttackClick={onAttackClick}
        onEndTurnClick={onEndTurnClick}
        attacking={false}
        endingTurn={false}
      />
    );

    fireEvent.click(screen.getByTestId('combat-panel-attack-button'));
    fireEvent.click(screen.getByTestId('combat-panel-end-turn-button'));

    expect(onAttackClick).toHaveBeenCalledTimes(1);
    expect(onEndTurnClick).toHaveBeenCalledTimes(1);
  });

  it('attacking/endingTurn disable their own button even when the gate says enabled', () => {
    const selection: CombatPanelSelection = {
      mode: 'turn',
      round: 1,
      order: [{ id: 'char-1', isActive: true, isYou: true }],
      shapes: [
        { slot: 'action', lit: true },
        { slot: 'bonus', lit: false },
        { slot: 'reaction', lit: false },
      ],
      declarations: [],
      attack: { enabled: true, reason: null },
      endTurn: { enabled: true, reason: null },
      targeting: true,
      selectedTargetId: 'skeleton-1',
      waitingOn: null,
      lastBeat: null,
    };

    render(
      <CombatPanel
        selection={selection}
        onAttackClick={noop}
        onEndTurnClick={noop}
        attacking={true}
        endingTurn={true}
      />
    );

    expect(isDisabled(screen.getByTestId('combat-panel-attack-button'))).toBe(
      true
    );
    expect(isDisabled(screen.getByTestId('combat-panel-end-turn-button'))).toBe(
      true
    );
  });
});
