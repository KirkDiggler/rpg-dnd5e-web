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
import type { CharacterEquipment } from '../../hooks/useEncounterState';
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

function unavailable(a: AvailableAction, reason: string): AvailableAction {
  return {
    ...a,
    available: false,
    unavailableReason: reason,
  } as AvailableAction;
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
    // rpg-dnd5e-web#571: undefined by default (no equipment data) — tests
    // exercising the chip/popover pass their own equipment fixture (see
    // the "equipment chip + popover" describe block below).
    equipment: undefined,
    onEquipIntent: vi.fn(),
    equipLoading: false,
  };
}

/** Minimal CharacterEquipment fixture for the equipment chip/popover tests. */
function equipmentFixture(): CharacterEquipment {
  return {
    equipped: {
      main_hand: { module: 'dnd5e', type: 'item', id: 'longsword' },
      off_hand: { module: 'dnd5e', type: 'item', id: 'shield' },
    },
    inventory: [
      {
        ref: { module: 'dnd5e', type: 'item', id: 'longsword' },
        name: 'Longsword',
        statLine: '1d8 slashing · versatile',
        iconKey: '',
        kind: 'weapon',
        slotKeys: ['main_hand', 'off_hand'],
      },
      {
        ref: { module: 'dnd5e', type: 'item', id: 'shield' },
        name: 'Shield',
        statLine: '+2 AC',
        iconKey: '',
        kind: 'shield',
        slotKeys: ['off_hand'],
      },
      {
        ref: { module: 'dnd5e', type: 'item', id: 'greatsword' },
        name: 'Greatsword',
        statLine: '2d6 slashing · two-handed',
        iconKey: '',
        kind: 'weapon',
        slotKeys: ['main_hand'],
      },
    ],
    slots: [
      { key: 'main_hand', displayLabel: 'Main hand', accepts: ['weapon'] },
      {
        key: 'off_hand',
        displayLabel: 'Off hand',
        accepts: ['weapon', 'shield'],
      },
      { key: 'armor', displayLabel: 'Armor', accepts: ['armor'] },
    ],
    armorClassDetail: { total: 18, note: '16 chain mail + 2 shield' },
    mainHandDamage: '1d8 slashing',
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
    expect(announced()).toBe("Goblin's turn — watch the map.");
    expect(pillText()).toBe("Goblin's turn — watch the map.");
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
    expect(announced()).toMatch(/^Exploring/);
    expect(pillText()).toMatch(/^Exploring/);
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
    expect(announced()).toBe('The encounter has ended.');
    expect(pillText()).toBe('The encounter has ended.');
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
    const text = announced();
    expect(text).not.toMatch(/Exploring/);
    expect(text).toBe('Connecting…');
    expect(pillText()).toBe('Connecting…');
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
    expect(announced()).toBe("Goblin's turn — watch the map.");
  });

  it('guides End Turn when the server disables every verb and no movement remains (#545)', () => {
    // api#637's real live shape: the server sends available=false on every
    // verb (the SAME signal that disables the buttons). The strip must stop
    // saying "pick an action" — nothing is clickable.
    render(
      <EncounterDock
        {...baseProps()}
        economy={economy(0, 0, 0, 0)}
        actions={[
          unavailable(action('attack', 'Attack'), 'no action remaining'),
          unavailable(
            action('rage', 'Rage', { slot: EconomySlot.BONUS_ACTION }),
            'no bonus action remaining'
          ),
        ]}
      />
    );
    expect(announced()).toBe('Nothing left to do — End Turn.');
    expect(pillText()).toBe('Nothing left to do — End Turn.');
  });

  it('prefers the still-can-move variant when movement remains (#545)', () => {
    render(
      <EncounterDock
        {...baseProps()}
        economy={economy(0, 0, 0, 15)}
        actions={[
          unavailable(action('attack', 'Attack'), 'no action remaining'),
        ]}
      />
    );
    expect(announced()).toBe('You can still move — or End Turn.');
    expect(pillText()).toBe('You can still move — or End Turn.');
  });

  it('never contradicts an enabled button: an available verb with a zero pool keeps "pick an action" (#552 gate)', () => {
    // verbCost's pool state is badge language, not usability — a server-
    // available verb renders ENABLED even when its mapped pool reads 0, so
    // the strip must not claim "Nothing left" over a clickable button. The
    // strip and VerbButton share one signal: server `available`.
    render(
      <EncounterDock
        {...baseProps()}
        economy={economy(0, 0, 0, 0)}
        actions={[action('attack', 'Attack')]}
      />
    );
    expect(announced()).toBe('Your turn — pick an action.');
    expect(pillText()).toBeNull();
  });

  it('keeps "pick an action" while anything is affordable — a spent action pool with a live bonus verb is not "nothing left" (#545)', () => {
    render(
      <EncounterDock
        {...baseProps()}
        economy={economy(0, 1, 1, 0)}
        actions={[
          action('attack', 'Attack'),
          action('rage', 'Rage', { slot: EconomySlot.BONUS_ACTION }),
        ]}
      />
    );
    expect(announced()).toBe('Your turn — pick an action.');
    expect(pillText()).toBeNull();
  });

  it('treats an empty menu as the loading window, never "nothing left" (#545)', () => {
    render(<EncounterDock {...baseProps()} actions={[]} economy={null} />);
    expect(announced()).toBe('Your turn — pick an action.');
    expect(pillText()).toBeNull();
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
    expect(screen.getByTestId('inline-group-Features')).toBeTruthy();
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

  it('re-observes the row on spectate-first entry — the callback ref attaches when Row 2 appears (#556 gate)', () => {
    // Mount while SPECTATING (no verb row), then the turn arrives: the
    // observer must attach to the NEW node and collapse must engage. A
    // ref+effect version never re-attached — the gate's blocker A.
    type ROCallback = (entries: { contentRect: { width: number } }[]) => void;
    const observed: unknown[] = [];
    const callbacks: ROCallback[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        cb: ROCallback;
        constructor(cb: ROCallback) {
          this.cb = cb;
          callbacks.push(cb);
        }
        observe(el: unknown) {
          observed.push(el);
        }
        disconnect() {}
      }
    );
    try {
      const many = Array.from({ length: 7 }, (_, i) =>
        action(`core-${i}`, `Core ${i}`)
      );
      const view = render(
        <EncounterDock
          {...baseProps()}
          actions={many}
          isMyTurn={false}
          activeEntityName="Goblin"
        />
      );
      // Spectating: no row, nothing observed yet.
      expect(screen.queryByTestId('encounter-dock-verbs')).toBeNull();
      expect(observed.length).toBe(0);
      // The turn arrives — Row 2 mounts and the callback ref attaches.
      view.rerender(<EncounterDock {...baseProps()} actions={many} />);
      expect(screen.getByTestId('encounter-dock-verbs')).toBeTruthy();
      expect(observed.length).toBe(1);
      // The measurement drives the collapse on the freshly-observed node.
      act(() => {
        callbacks.forEach((cb) => cb([{ contentRect: { width: 200 } }]));
      });
      expect(screen.queryByText('Core 5')).toBeNull();
      expect(screen.getByText('Actions ▾ 2')).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('clears a stale open menu when the layout returns to inline (Copilot on #556)', () => {
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
      // Collapse, open the menu.
      act(() => {
        callbacks.forEach((cb) => cb([{ contentRect: { width: 200 } }]));
      });
      fireEvent.click(screen.getByText('Actions ▾ 2'));
      expect(screen.getByTestId('encounter-dock-menu')).toBeTruthy();
      // Widen back to inline: the trigger vanishes AND the state clears —
      // a later re-collapse must not surprise-reopen the panel.
      act(() => {
        callbacks.forEach((cb) => cb([{ contentRect: { width: 4000 } }]));
      });
      expect(screen.queryByTestId('encounter-dock-menu')).toBeNull();
      act(() => {
        callbacks.forEach((cb) => cb([{ contentRect: { width: 200 } }]));
      });
      expect(screen.queryByTestId('encounter-dock-menu')).toBeNull();
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

describe('EncounterDock equipment chip + popover (rpg-dnd5e-web#571)', () => {
  it('hides the chip entirely when the entity carries no equipment data', () => {
    render(<EncounterDock {...baseProps()} equipment={undefined} />);
    expect(screen.queryByLabelText(/equipment/i)).toBeNull();
  });

  it('opens the popover from the chip, showing slots/inventory/AC/damage', () => {
    render(<EncounterDock {...baseProps()} equipment={equipmentFixture()} />);
    fireEvent.click(screen.getByLabelText('Open equipment'));
    expect(screen.getByTestId('equipment-popover')).toBeTruthy();
    expect(screen.getByTestId('equipment-slots')).toBeTruthy();
    expect(screen.getByTestId('inventory-light')).toBeTruthy();
    expect(screen.getByText(/18/)).toBeTruthy();
    expect(screen.getByText(/16 chain mail \+ 2 shield/)).toBeTruthy();
    // Greatsword is carried (not in `equipped`), so it renders in the
    // inventory list — proves the popover is fed from the real equipment
    // prop, not a stale/fixture default.
    expect(screen.getByTestId('inv-greatsword')).toBeTruthy();
  });

  it('is reachable outside TURN_BASED and off-turn — equip is never turn-gated', () => {
    render(
      <EncounterDock
        {...baseProps()}
        equipment={equipmentFixture()}
        mode={EncounterMode.FREE_ROAM}
        isMyTurn={false}
      />
    );
    fireEvent.click(screen.getByLabelText('Open equipment'));
    expect(screen.getByTestId('equipment-popover')).toBeTruthy();
  });

  it('forwards an unequip click as an EquipIntent via onEquipIntent', () => {
    const onEquipIntent = vi.fn();
    render(
      <EncounterDock
        {...baseProps()}
        equipment={equipmentFixture()}
        onEquipIntent={onEquipIntent}
      />
    );
    fireEvent.click(screen.getByLabelText('Open equipment'));
    fireEvent.click(screen.getByTestId('equip-socket-off_hand'));
    expect(onEquipIntent).toHaveBeenCalledWith({
      kind: 'UnequipItem',
      slotKey: 'off_hand',
    });
  });

  it('one-panel policy: opening equipment yields the floating log, which restores on close', () => {
    render(<EncounterDock {...baseProps()} equipment={equipmentFixture()} />);
    expect(screen.getByTestId('floating-log')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Open equipment'));
    expect(screen.queryByTestId('floating-log')).toBeNull();
    expect(screen.getByTestId('equipment-popover')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Close equipment'));
    expect(screen.getByTestId('floating-log')).toBeTruthy();
  });
});
