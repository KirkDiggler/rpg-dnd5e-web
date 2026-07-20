import type {
  ActionEconomy,
  AvailableAction,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import {
  EconomySlot,
  EncounterMode,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    encounterEnded: false,
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

const logToggle = () => screen.getByLabelText(/combat log/i);

/** The hidden aria-live region carries the FULL announcement stream. */
const announced = () => screen.getByRole('status').textContent;
/** The visual pill — null when the state is plain your-turn (round 6). */
const pillText = () =>
  screen.queryByTestId('context-pill')?.textContent ?? null;

beforeEach(() => {
  localStorage.clear();
});

describe('EncounterDock teaching surface (#525 slice 2: pill + aria-live)', () => {
  it('announces "your turn" but shows NO pill — the verbs already say it (round 6)', () => {
    render(<EncounterDock {...baseProps()} />);
    expect(announced()).toBe('Your turn — pick an action.');
    expect(pillText()).toBeNull();
    expect(screen.getByTestId('encounter-dock-verbs')).toBeTruthy();
    expect(screen.getByText('End Turn')).toBeTruthy();
  });

  it('floats the armed guidance as a pill when an action is armed', () => {
    render(
      <EncounterDock
        {...baseProps()}
        armedActionKey="dnd5e:combat_abilities:attack"
      />
    );
    expect(pillText()).toBe(
      'Attack armed — click a target on the map. Esc or click again to cancel.'
    );
    expect(announced()).toBe(
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

  it('suppresses the action surface and stops claiming "your turn" once the encounter has ended (gate #1)', () => {
    // The encounter can end ON your turn: mode stays TURN_BASED and it's
    // still your turn, but `encounterEnded` must independently kill the
    // surface and the "your turn" lie.
    render(
      <EncounterDock
        {...baseProps()}
        encounterEnded={true}
        mode={EncounterMode.TURN_BASED}
        isMyTurn={true}
        actions={[action('attack', 'Attack')]}
      />
    );
    expect(screen.getByTestId('encounter-dock-context').textContent).toBe(
      'The encounter has ended.'
    );
    expect(screen.queryByTestId('encounter-dock-verbs')).toBeNull();
    expect(screen.queryByLabelText(/^Action: /)).toBeNull();
    expect(screen.queryByTestId('encounter-dock-movement')).toBeNull();
    expect(screen.queryByText('End Turn')).toBeNull();
  });

  it('shows a neutral connecting line for UNSPECIFIED mode, not "Exploring" (gate #3)', () => {
    render(
      <EncounterDock
        {...baseProps()}
        mode={EncounterMode.UNSPECIFIED}
        isMyTurn={false}
      />
    );
    const text = screen.getByTestId('encounter-dock-context').textContent;
    expect(text).not.toMatch(/Exploring/);
    expect(text).toBe('Connecting…');
  });

  it('does not flash armed guidance when it is no longer your turn (gate #4)', () => {
    // Handover frame: armedActionKey still set for a paint, but isMyTurn
    // already false — the strip must not say "click a target".
    render(
      <EncounterDock
        {...baseProps()}
        isMyTurn={false}
        activeEntityName="Goblin"
        armedActionKey="dnd5e:combat_abilities:attack"
      />
    );
    expect(screen.getByTestId('encounter-dock-context').textContent).toBe(
      "Goblin's turn — watch the map."
    );
  });
});

describe('EncounterDock inline verbs (round 5: inline by default)', () => {
  it('renders features as a labeled INLINE group — no drop-down (round 5)', () => {
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
    // The feature sits INLINE in its labeled group, visible immediately.
    expect(screen.getByTestId('inline-group-feature')).toBeTruthy();
    expect(screen.getByText('Flurry of Blows')).toBeTruthy();
    expect(screen.queryByTestId('encounter-dock-menu')).toBeNull();
  });

  it('dispatches onSelectAction from an inline feature verb', () => {
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
    fireEvent.click(screen.getByText('Flurry of Blows'));
    expect(props.onSelectAction).toHaveBeenCalledWith(flurry);
  });

  it('reunites the core overflow inline when the row is unmeasured or wide', () => {
    // Seven core verbs: with inline-by-default and no width pressure
    // (jsdom has no ResizeObserver, so the row stays unmeasured -> never
    // collapsed), ALL seven render inline and no trigger appears.
    const many = Array.from({ length: 7 }, (_, i) =>
      action(`core-${i}`, `Core ${i}`)
    );
    render(<EncounterDock {...baseProps()} actions={many} />);
    expect(screen.getByText('Core 0')).toBeTruthy();
    expect(screen.getByText('Core 5')).toBeTruthy();
    expect(screen.getByText('Core 6')).toBeTruthy();
    expect(screen.queryByText(/▾/)).toBeNull();
  });

  it('folds to the grouped drop-down only under genuine width pressure (measured)', () => {
    // Simulate a narrow measured row via a stubbed ResizeObserver that
    // reports 200px — the estimate for a busy kit far exceeds 2 lines.
    type ROCallback = (entries: { contentRect: { width: number } }[]) => void;
    const callbacks: ROCallback[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        cb: ROCallback;
        constructor(cb: ROCallback) {
          this.cb = cb;
          callbacks.push(cb);
        }
        observe() {}
        disconnect() {}
      }
    );
    try {
      const many = Array.from({ length: 7 }, (_, i) =>
        action(`core-${i}`, `Core ${i}`)
      );
      render(<EncounterDock {...baseProps()} actions={many} />);
      act(() => {
        callbacks.forEach((cb) => cb([{ contentRect: { width: 200 } }]));
      });
      // Collapsed: five flat cores + the "Actions" trigger for the tail.
      expect(screen.getByText('Core 4')).toBeTruthy();
      expect(screen.queryByText('Core 5')).toBeNull();
      fireEvent.click(screen.getByText('Actions ▾ 2'));
      const menu = screen.getByTestId('encounter-dock-menu');
      expect(menu.textContent).toContain('Actions');
      expect(screen.getByText('Core 5')).toBeTruthy();
      expect(screen.getByText('Core 6')).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('EncounterDock cost badges', () => {
  it('marks a verb badge spent when its pool is exhausted', () => {
    // Action pool spent (0), bonus pool available (1).
    render(
      <EncounterDock
        {...baseProps()}
        economy={economy(0, 1, 1, 30)}
        actions={[
          action('attack', 'Attack'),
          action('flurry', 'Flurry of Blows', {
            refType: 'feature',
            slot: EconomySlot.BONUS_ACTION,
          }),
        ]}
      />
    );
    // Attack (action pool, spent) → hollow badge, no `filled` class.
    const attackBadge = screen
      .getByTestId('action-dnd5e:combat_abilities:attack')
      .querySelector('.economy-pip');
    expect(attackBadge?.className).toContain('shape-action');
    expect(attackBadge?.className).not.toContain('filled');
    // Flurry (bonus pool, available, INLINE) → filled badge.
    const flurryBadge = screen
      .getByTestId('action-dnd5e:feature:flurry')
      .querySelector('.economy-pip');
    expect(flurryBadge?.className).toContain('shape-bonus');
    expect(flurryBadge?.className).toContain('filled');
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

describe('EncounterDock combat log (round 7: always on by default)', () => {
  it('renders the floating log OPEN by default and toggles it hidden', () => {
    render(<EncounterDock {...baseProps()} />);
    expect(screen.getByTestId('floating-log')).toBeTruthy();
    expect(screen.getByTestId('combat-log')).toBeTruthy();
    fireEvent.click(logToggle());
    expect(screen.queryByTestId('floating-log')).toBeNull();
    fireEvent.click(logToggle());
    expect(screen.getByTestId('floating-log')).toBeTruthy();
  });

  it('persists the hide choice and honors it on the next mount', () => {
    const first = render(<EncounterDock {...baseProps()} />);
    fireEvent.click(logToggle());
    expect(localStorage.getItem('ui.combatLog.hidden')).toBe('true');
    first.unmount();
    render(<EncounterDock {...baseProps()} />);
    expect(screen.queryByTestId('floating-log')).toBeNull();
    // Showing it again clears the preference (open is the default).
    fireEvent.click(logToggle());
    expect(localStorage.getItem('ui.combatLog.hidden')).toBeNull();
    expect(screen.getByTestId('floating-log')).toBeTruthy();
  });

  it('stays visible for spectators and in FREE_ROAM (round 7 decision)', () => {
    render(
      <EncounterDock
        {...baseProps()}
        mode={EncounterMode.FREE_ROAM}
        isMyTurn={false}
      />
    );
    expect(screen.getByTestId('floating-log')).toBeTruthy();
  });

  it('coexists with the settings popover — the log is not a popover', () => {
    render(<EncounterDock {...baseProps()} />);
    expect(screen.getByTestId('floating-log')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Combat settings'));
    expect(screen.getByTestId('encounter-dock-settings')).toBeTruthy();
    expect(screen.getByTestId('floating-log')).toBeTruthy();
  });

  it('floats as a sibling of the dock rows, never inside them (#519 clipping guard)', () => {
    render(<EncounterDock {...baseProps()} />);
    const shell = screen.getByTestId('encounter-dock-shell');
    const log = screen.getByTestId('floating-log');
    expect(shell.contains(log)).toBe(false);
    expect(log.parentElement).toBe(shell.parentElement);
  });
});
