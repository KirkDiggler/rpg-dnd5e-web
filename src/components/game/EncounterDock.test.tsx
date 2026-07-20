import type {
  ActionEconomy,
  AvailableAction,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import {
  EconomySlot,
  EncounterMode,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EncounterDockProps } from './EncounterDock';
import { EncounterDock } from './EncounterDock';

function economy(
  actions: number,
  bonus: number,
  reactions: number,
  movement: number
): ActionEconomy {
  return {
    actionsRemaining: actions,
    bonusActionsRemaining: bonus,
    reactionsRemaining: reactions,
    movementRemaining: movement,
  } as unknown as ActionEconomy;
}

function action(
  id: string,
  displayName: string,
  opts?: { refType?: string; slot?: EconomySlot }
): AvailableAction {
  return {
    ref: { module: 'dnd5e', type: opts?.refType ?? 'combat_abilities', id },
    displayName,
    available: true,
    unavailableReason: '',
    economySlot: opts?.slot ?? EconomySlot.ACTION,
  } as unknown as AvailableAction;
}

function baseProps(): EncounterDockProps {
  return {
    entityId: 'char-dockaudit',
    displayName: 'DockAudit',
    classRefId: undefined,
    hp: { current: 12, max: 12 },
    ac: 12,
    statuses: [],
    economy: economy(1, 1, 1, 30),
    actions: [action('attack', 'Attack')],
    mode: EncounterMode.TURN_BASED,
    isMyTurn: true,
    activeEntityName: undefined,
    actionsEnabled: true,
    actionsLoading: false,
    onSelectAction: vi.fn(),
    armedActionKey: undefined,
    reactionReadiness: undefined,
    reactionLoading: false,
    reactionDisabled: false,
    onToggleReaction: vi.fn(),
    onEndTurn: vi.fn(),
    endTurnDisabled: false,
    endTurnLoading: false,
    combatLogEntries: [],
  };
}

const logToggle = () => screen.getByLabelText(/Combat log/);

describe('EncounterDock teaching strip (#525 slice 1, #533 direction)', () => {
  it('says "your turn" with the action surface visible on your turn', () => {
    render(<EncounterDock {...baseProps()} />);
    expect(screen.getByTestId('encounter-dock-context').textContent).toBe(
      'Your turn — pick an action.'
    );
    expect(screen.getByTestId('encounter-dock-verbs')).toBeTruthy();
    expect(screen.getByText('End Turn')).toBeTruthy();
  });

  it('carries the armed guidance when an action is armed', () => {
    render(
      <EncounterDock
        {...baseProps()}
        armedActionKey="dnd5e:combat_abilities:attack"
      />
    );
    expect(screen.getByTestId('encounter-dock-context').textContent).toBe(
      'Attack armed — click a target on the map. Esc or click again to cancel.'
    );
  });

  it('shows whose turn it is to spectators instead of an economy placeholder (#458)', () => {
    render(
      <EncounterDock
        {...baseProps()}
        isMyTurn={false}
        activeEntityName="Goblin"
      />
    );
    expect(screen.getByTestId('encounter-dock-context').textContent).toBe(
      "Goblin's turn — watch the map."
    );
    // Spectators get no verbs, pips, or End Turn — the strip carries it.
    expect(screen.queryByTestId('encounter-dock-verbs')).toBeNull();
    expect(screen.queryByText('End Turn')).toBeNull();
    expect(screen.queryByLabelText(/^Action: /)).toBeNull();
  });

  it('renders the exploring message and NOTHING economy-shaped outside TURN_BASED (#516)', () => {
    render(
      <EncounterDock
        {...baseProps()}
        mode={EncounterMode.FREE_ROAM}
        isMyTurn={false}
        // Stale turnState from the last combat pocket — must not render.
        economy={economy(0, 0, 0, 5)}
      />
    );
    expect(screen.getByTestId('encounter-dock-context').textContent).toMatch(
      /^Exploring/
    );
    expect(screen.queryByTestId('encounter-dock-verbs')).toBeNull();
    expect(screen.queryByLabelText(/^Action: /)).toBeNull();
    expect(screen.queryByTestId('encounter-dock-movement')).toBeNull();
    expect(screen.queryByText('End Turn')).toBeNull();
  });
});

describe('EncounterDock verbs and grouped overflow', () => {
  it('renders core verbs flat and groups features behind the trigger', () => {
    render(
      <EncounterDock
        {...baseProps()}
        actions={[
          action('attack', 'Attack'),
          action('flurry', 'Flurry of Blows', {
            refType: 'feature',
            slot: EconomySlot.BONUS_ACTION,
          }),
        ]}
      />
    );
    expect(screen.getByText('Attack')).toBeTruthy();
    expect(screen.queryByText('Flurry of Blows')).toBeNull();
    const trigger = screen.getByText('Features ▾ 1');
    fireEvent.click(trigger);
    expect(screen.getByTestId('encounter-dock-menu')).toBeTruthy();
    expect(screen.getByText('Flurry of Blows')).toBeTruthy();
  });

  it('dispatches onSelectAction and closes the menu on a menu verb click', () => {
    const props = baseProps();
    const flurry = action('flurry', 'Flurry of Blows', {
      refType: 'feature',
      slot: EconomySlot.BONUS_ACTION,
    });
    render(
      <EncounterDock
        {...props}
        actions={[action('attack', 'Attack'), flurry]}
      />
    );
    fireEvent.click(screen.getByText('Features ▾ 1'));
    fireEvent.click(screen.getByText('Flurry of Blows'));
    expect(props.onSelectAction).toHaveBeenCalledWith(flurry);
    expect(screen.queryByTestId('encounter-dock-menu')).toBeNull();
  });
});

describe('EncounterDock settings popover (reaction relocation)', () => {
  it('keeps the ReactionReadyPanel mechanism, relocated behind the gear', () => {
    render(<EncounterDock {...baseProps()} />);
    expect(screen.queryByTestId('reaction-ready-panel')).toBeNull();
    fireEvent.click(screen.getByLabelText('Combat settings'));
    expect(screen.getByTestId('encounter-dock-settings')).toBeTruthy();
    expect(screen.getByTestId('reaction-ready-panel')).toBeTruthy();
  });

  it('is reachable outside TURN_BASED too (settings are not turn-gated)', () => {
    render(
      <EncounterDock
        {...baseProps()}
        mode={EncounterMode.FREE_ROAM}
        isMyTurn={false}
      />
    );
    fireEvent.click(screen.getByLabelText('Combat settings'));
    expect(screen.getByTestId('reaction-ready-panel')).toBeTruthy();
  });
});

describe('EncounterDock overlays (log pattern from #519/#520)', () => {
  it('does not render the log overlay by default and toggles it open/closed', () => {
    render(<EncounterDock {...baseProps()} />);
    expect(screen.queryByTestId('encounter-dock-log-overlay')).toBeNull();
    fireEvent.click(logToggle());
    expect(screen.getByTestId('encounter-dock-log-overlay')).toBeTruthy();
    fireEvent.click(logToggle());
    expect(screen.queryByTestId('encounter-dock-log-overlay')).toBeNull();
  });

  it('opens at most one floating panel at a time', () => {
    render(
      <EncounterDock
        {...baseProps()}
        actions={[
          action('attack', 'Attack'),
          action('flurry', 'Flurry of Blows', { refType: 'feature' }),
        ]}
      />
    );
    fireEvent.click(logToggle());
    expect(screen.getByTestId('encounter-dock-log-overlay')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Combat settings'));
    expect(screen.queryByTestId('encounter-dock-log-overlay')).toBeNull();
    expect(screen.getByTestId('encounter-dock-settings')).toBeTruthy();
    fireEvent.click(screen.getByText('Features ▾ 1'));
    expect(screen.queryByTestId('encounter-dock-settings')).toBeNull();
    expect(screen.getByTestId('encounter-dock-menu')).toBeTruthy();
  });

  it('places overlays as siblings of the scrolling row, not inside it', () => {
    // Regression guard for the overflow-clipping bug caught live during
    // #519 verification: an overlay inside the overflowY:auto row clips
    // to 0 visible pixels. DockShell owns this rule; assert it holds for
    // the dock's usage.
    render(<EncounterDock {...baseProps()} />);
    fireEvent.click(logToggle());
    const row = screen.getByTestId('encounter-dock-shell-row');
    const overlay = screen.getByTestId('encounter-dock-log-overlay');
    expect(row.contains(overlay)).toBe(false);
    expect(overlay.parentElement).toBe(row.parentElement);
  });
});
