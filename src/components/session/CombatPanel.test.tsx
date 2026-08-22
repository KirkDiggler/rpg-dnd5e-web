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
        onPickTargetClick={noop}
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

  it('turn mode renders round, order chips, shapes, movement row, declarations, target line, and both buttons', () => {
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
      movement: { remainingFeet: 15, affordable: true },
      moveMaxCells: 3,
      attack: { kind: 'pick-target', enabled: true },
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
        onPickTargetClick={noop}
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
    expect(screen.getByTestId('combat-panel-movement').textContent).toBe(
      'Movement: 15 ft'
    );
    expect(screen.getByTestId('turn-hud-declaration-row').textContent).toBe(
      'Attack — ready'
    );
    expect(screen.getByTestId('combat-panel-target').textContent).toBe(
      'No target selected'
    );
    // kind: 'pick-target' relabels the same button — enabled, no title.
    expect(isDisabled(screen.getByTestId('combat-panel-attack-button'))).toBe(
      false
    );
    expect(screen.getByTestId('combat-panel-attack-button').textContent).toBe(
      'Pick a target'
    );
    expect(isDisabled(screen.getByTestId('combat-panel-end-turn-button'))).toBe(
      false
    );
    expect(screen.queryByTestId('combat-panel-waiting-on')).toBeNull();
    expect(screen.queryByTestId('combat-panel-beat-line')).toBeNull();
  });

  it('no Move declaration on the wire yet -> no movement row at all', () => {
    const selection: CombatPanelSelection = {
      mode: 'turn',
      round: 1,
      order: [{ id: 'char-1', isActive: true, isYou: true }],
      shapes: [
        { slot: 'action', lit: false },
        { slot: 'bonus', lit: false },
        { slot: 'reaction', lit: false },
      ],
      declarations: [],
      movement: null,
      moveMaxCells: 0,
      attack: { kind: 'pick-target', enabled: true },
      endTurn: { enabled: true, reason: null },
      targeting: false,
      selectedTargetId: null,
      waitingOn: null,
      lastBeat: null,
    };

    render(
      <CombatPanel
        selection={selection}
        onAttackClick={noop}
        onPickTargetClick={noop}
        onEndTurnClick={noop}
        attacking={false}
        endingTurn={false}
      />
    );

    expect(screen.queryByTestId('combat-panel-movement')).toBeNull();
  });

  it('an unaffordable movement row dims but still shows the real number', () => {
    const selection: CombatPanelSelection = {
      mode: 'turn',
      round: 1,
      order: [{ id: 'char-1', isActive: true, isYou: true }],
      shapes: [
        { slot: 'action', lit: false },
        { slot: 'bonus', lit: false },
        { slot: 'reaction', lit: false },
      ],
      declarations: [],
      movement: { remainingFeet: 0, affordable: false },
      moveMaxCells: 0,
      attack: { kind: 'pick-target', enabled: true },
      endTurn: { enabled: true, reason: null },
      targeting: false,
      selectedTargetId: null,
      waitingOn: null,
      lastBeat: null,
    };

    render(
      <CombatPanel
        selection={selection}
        onAttackClick={noop}
        onPickTargetClick={noop}
        onEndTurnClick={noop}
        attacking={false}
        endingTurn={false}
      />
    );

    const row = screen.getByTestId('combat-panel-movement');
    expect(row.textContent).toBe('Movement: 0 ft');
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
      movement: null,
      moveMaxCells: 0,
      attack: { kind: 'attack', enabled: false, reason: 'Not your turn.' },
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
        onPickTargetClick={noop}
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
    // kind: 'attack', disabled -> the label stays "Attack", not "Pick a target".
    expect(screen.getByTestId('combat-panel-attack-button').textContent).toBe(
      'Attack'
    );
    expect(screen.getByTestId('combat-panel-attack-button').title).toBe(
      'Not your turn.'
    );
  });

  it("clicking the Attack button in 'pick-target' state calls onPickTargetClick, not onAttackClick", () => {
    const onAttackClick = vi.fn();
    const onPickTargetClick = vi.fn();
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
      movement: null,
      moveMaxCells: 0,
      attack: { kind: 'pick-target', enabled: true },
      endTurn: { enabled: true, reason: null },
      targeting: true,
      selectedTargetId: null,
      waitingOn: null,
      lastBeat: null,
    };

    render(
      <CombatPanel
        selection={selection}
        onAttackClick={onAttackClick}
        onPickTargetClick={onPickTargetClick}
        onEndTurnClick={noop}
        attacking={false}
        endingTurn={false}
      />
    );

    fireEvent.click(screen.getByTestId('combat-panel-attack-button'));

    expect(onPickTargetClick).toHaveBeenCalledTimes(1);
    expect(onAttackClick).not.toHaveBeenCalled();
  });

  it("clicking the Attack button in 'attack' state calls onAttackClick, not onPickTargetClick", () => {
    const onAttackClick = vi.fn();
    const onPickTargetClick = vi.fn();
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
      movement: null,
      moveMaxCells: 0,
      attack: { kind: 'attack', enabled: true, reason: null },
      endTurn: { enabled: true, reason: null },
      targeting: false,
      selectedTargetId: 'skeleton-1',
      waitingOn: null,
      lastBeat: null,
    };

    render(
      <CombatPanel
        selection={selection}
        onAttackClick={onAttackClick}
        onPickTargetClick={onPickTargetClick}
        onEndTurnClick={onEndTurnClick}
        attacking={false}
        endingTurn={false}
      />
    );

    fireEvent.click(screen.getByTestId('combat-panel-attack-button'));
    fireEvent.click(screen.getByTestId('combat-panel-end-turn-button'));

    expect(onAttackClick).toHaveBeenCalledTimes(1);
    expect(onPickTargetClick).not.toHaveBeenCalled();
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
      movement: null,
      moveMaxCells: 0,
      attack: { kind: 'attack', enabled: true, reason: null },
      endTurn: { enabled: true, reason: null },
      targeting: false,
      selectedTargetId: 'skeleton-1',
      waitingOn: null,
      lastBeat: null,
    };

    render(
      <CombatPanel
        selection={selection}
        onAttackClick={noop}
        onPickTargetClick={noop}
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
