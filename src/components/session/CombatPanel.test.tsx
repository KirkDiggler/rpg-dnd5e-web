/**
 * No jest-dom matchers — this repo's vitest config has no such setup, so
 * assertions use plain DOM properties. `combatPanel.test.ts` owns the
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

const baseTurnSelection: CombatPanelSelection = {
  mode: 'turn',
  round: 2,
  participants: [
    {
      id: 'char-1',
      name: 'Aldric',
      isActive: true,
      isYou: true,
      isDowned: false,
    },
    {
      id: 'skeleton-1',
      name: 'skeleton-1',
      isActive: false,
      isYou: false,
      isDowned: false,
    },
  ],
  shapes: [
    { slot: 'action', lit: true },
    { slot: 'bonus', lit: false },
    { slot: 'reaction', lit: false },
  ],
  movement: { remainingFeet: 15, affordable: true },
  moveMaxCells: 3,
  attackTargets: [
    { id: 'skeleton-1', name: 'skeleton-1', affordable: true, whyText: null },
  ],
  noTargetInReachText: null,
  hoverLabel: null,
  endTurn: { enabled: true, reason: null },
  waitingOnName: null,
  lastBeat: null,
};

describe('CombatPanel', () => {
  it('free-roam renders the quiet pill, no round/participants/actions', () => {
    render(
      <CombatPanel
        selection={{ mode: 'free-roam' }}
        turnStartedBanner={null}
        onEndTurnClick={noop}
        endingTurn={false}
      />
    );

    expect(screen.getByTestId('turn-hud-free-roam-pill').textContent).toBe(
      'Free roam'
    );
    expect(screen.queryByTestId('combat-panel-round')).toBeNull();
    expect(screen.queryByTestId('combat-panel-end-turn-button')).toBeNull();
  });

  it('free-roam does not show an equipment entry when onOpenEquipment is not provided', () => {
    render(
      <CombatPanel
        selection={{ mode: 'free-roam' }}
        turnStartedBanner={null}
        onEndTurnClick={noop}
        endingTurn={false}
      />
    );
    expect(screen.queryByTestId('combat-panel-equipment-button')).toBeNull();
  });

  it('free-roam shows the equipment entry when onOpenEquipment IS provided, and clicking it fires the callback', () => {
    const onOpenEquipment = vi.fn();
    render(
      <CombatPanel
        selection={{ mode: 'free-roam' }}
        turnStartedBanner={null}
        onEndTurnClick={noop}
        endingTurn={false}
        onOpenEquipment={onOpenEquipment}
      />
    );
    fireEvent.click(screen.getByTestId('combat-panel-equipment-button'));
    expect(onOpenEquipment).toHaveBeenCalledTimes(1);
  });

  it('turn mode renders round, participant chips by name, shapes, movement row, and End Turn', () => {
    render(
      <CombatPanel
        selection={baseTurnSelection}
        turnStartedBanner={null}
        onEndTurnClick={noop}
        endingTurn={false}
      />
    );

    expect(screen.getByTestId('combat-panel-round').textContent).toBe(
      'Round 2'
    );
    const chips = screen.getAllByTestId('combat-panel-participant');
    expect(chips).toHaveLength(2);
    expect(chips[0]!.textContent).toContain('Aldric');
    expect(chips[0]!.textContent).toContain('(you)');
    expect(chips[1]!.textContent).toBe('skeleton-1');
    expect(
      screen.getByTestId('turn-hud-shape-action').getAttribute('data-lit')
    ).toBe('true');
    expect(screen.getByTestId('combat-panel-movement').textContent).toBe(
      'Movement: 15 ft'
    );
    expect(isDisabled(screen.getByTestId('combat-panel-end-turn-button'))).toBe(
      false
    );
    expect(screen.queryByTestId('combat-panel-waiting-on')).toBeNull();
    expect(screen.queryByTestId('combat-panel-beat-line')).toBeNull();
    // No Attack button anywhere -- Attack is a floor gesture (rpg-project#249).
    expect(screen.queryByTestId('combat-panel-attack-button')).toBeNull();
  });

  it('a downed participant renders with the downed marker', () => {
    render(
      <CombatPanel
        selection={{
          ...baseTurnSelection,
          participants: [
            {
              id: 'skeleton-1',
              name: 'skeleton-1',
              isActive: false,
              isYou: false,
              isDowned: true,
            },
          ],
        }}
        turnStartedBanner={null}
        onEndTurnClick={noop}
        endingTurn={false}
      />
    );
    const chip = screen.getByTestId('combat-panel-participant');
    expect(chip.getAttribute('data-downed')).toBe('true');
    expect(chip.textContent).toContain('downed');
  });

  it('no Move declaration on the wire yet -> no movement row at all', () => {
    render(
      <CombatPanel
        selection={{ ...baseTurnSelection, movement: null, moveMaxCells: 0 }}
        turnStartedBanner={null}
        onEndTurnClick={noop}
        endingTurn={false}
      />
    );
    expect(screen.queryByTestId('combat-panel-movement')).toBeNull();
  });

  it('an unaffordable movement row dims but still shows the real number', () => {
    render(
      <CombatPanel
        selection={{
          ...baseTurnSelection,
          movement: { remainingFeet: 0, affordable: false },
          moveMaxCells: 0,
        }}
        turnStartedBanner={null}
        onEndTurnClick={noop}
        endingTurn={false}
      />
    );
    expect(screen.getByTestId('combat-panel-movement').textContent).toBe(
      'Movement: 0 ft'
    );
  });

  it("shows the hover label when present, the waitingOn line when it's not your turn, and the beat line", () => {
    render(
      <CombatPanel
        selection={{
          ...baseTurnSelection,
          hoverLabel: 'Attack skeleton-1',
          waitingOnName: 'skeleton-1',
          endTurn: { enabled: false, reason: 'Not your turn.' },
          lastBeat: 'You hit skeleton-1 — 17 vs AC 13, 6 slashing.',
        }}
        turnStartedBanner={null}
        onEndTurnClick={noop}
        endingTurn={false}
      />
    );

    expect(screen.getByTestId('combat-panel-hover').textContent).toBe(
      'Attack skeleton-1'
    );
    expect(screen.getByTestId('combat-panel-waiting-on').textContent).toBe(
      'skeleton-1’s turn.'
    );
    expect(screen.getByTestId('combat-panel-beat-line').textContent).toBe(
      'You hit skeleton-1 — 17 vs AC 13, 6 slashing.'
    );
    expect(isDisabled(screen.getByTestId('combat-panel-end-turn-button'))).toBe(
      true
    );
    expect(screen.getByTestId('combat-panel-end-turn-button').title).toBe(
      'Not your turn.'
    );
  });

  it('falls back to noTargetInReachText when nothing is hovered and nothing is in reach', () => {
    render(
      <CombatPanel
        selection={{
          ...baseTurnSelection,
          attackTargets: [],
          hoverLabel: null,
          noTargetInReachText: 'no target in reach',
        }}
        turnStartedBanner={null}
        onEndTurnClick={noop}
        endingTurn={false}
      />
    );
    expect(screen.getByTestId('combat-panel-hover').textContent).toBe(
      'no target in reach'
    );
  });

  it('clicking End Turn calls onEndTurnClick', () => {
    const onEndTurnClick = vi.fn();
    render(
      <CombatPanel
        selection={baseTurnSelection}
        turnStartedBanner={null}
        onEndTurnClick={onEndTurnClick}
        endingTurn={false}
      />
    );
    fireEvent.click(screen.getByTestId('combat-panel-end-turn-button'));
    expect(onEndTurnClick).toHaveBeenCalledTimes(1);
  });

  it('endingTurn disables the End Turn button even when the gate says enabled', () => {
    render(
      <CombatPanel
        selection={baseTurnSelection}
        turnStartedBanner={null}
        onEndTurnClick={noop}
        endingTurn={true}
      />
    );
    expect(isDisabled(screen.getByTestId('combat-panel-end-turn-button'))).toBe(
      true
    );
  });

  it('the turn-started banner renders when present (web#533 teaching moment)', () => {
    render(
      <CombatPanel
        selection={baseTurnSelection}
        turnStartedBanner="Your turn!"
        onEndTurnClick={noop}
        endingTurn={false}
      />
    );
    expect(screen.getByTestId('combat-panel-turn-started').textContent).toBe(
      'Your turn!'
    );
  });

  it('the action hint teaches the click-to-attack/click-to-move flow on your own turn', () => {
    render(
      <CombatPanel
        selection={baseTurnSelection}
        turnStartedBanner={null}
        onEndTurnClick={noop}
        endingTurn={false}
      />
    );
    expect(screen.getByTestId('combat-panel-action-hint').textContent).toBe(
      'Click a highlighted enemy to attack, or click the floor to move.'
    );
  });

  it('the action hint drops the attack half when nothing is in reach', () => {
    render(
      <CombatPanel
        selection={{ ...baseTurnSelection, attackTargets: [] }}
        turnStartedBanner={null}
        onEndTurnClick={noop}
        endingTurn={false}
      />
    );
    expect(screen.getByTestId('combat-panel-action-hint').textContent).toBe(
      'Click the floor to move.'
    );
  });

  it('no action hint when it is not your turn (waitingOnName set)', () => {
    render(
      <CombatPanel
        selection={{ ...baseTurnSelection, waitingOnName: 'skeleton-1' }}
        turnStartedBanner={null}
        onEndTurnClick={noop}
        endingTurn={false}
      />
    );
    expect(screen.queryByTestId('combat-panel-action-hint')).toBeNull();
  });
});
