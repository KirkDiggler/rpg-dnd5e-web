import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CombatLogEntry } from '../../hooks/useCombatLog';
import type { MovementNarration } from '../../utils/combatFormat';
import { CombatLog } from './CombatLog';
import { isScrolledAwayFromBottom } from './combatLogScroll';

describe('CombatLog', () => {
  it('renders the empty state when there are no entries', () => {
    render(<CombatLog entries={[]} />);
    expect(screen.getByTestId('combat-log').textContent).toContain(
      "hasn't started yet"
    );
  });

  it('renders an AttackResolved HIT verbatim (roll, bonus, AC, entity ids)', () => {
    const entries: CombatLogEntry[] = [
      {
        id: 0,
        round: 1,
        kind: 'attack',
        event: {
          attackerEntityId: 'char-alice',
          targetEntityId: 'goblin-1',
          hit: true,
          critical: false,
          attackRoll: 15,
          attackBonus: 5,
          targetAc: 14,
          hasAdvantage: false,
          hasDisadvantage: false,
          advantageSources: [],
          disadvantageSources: [],
        } as never,
      },
    ];
    render(<CombatLog entries={entries} />);
    const line = screen.getByTestId('combat-log-entry-attack-0');
    expect(line.textContent).toContain('char-alice');
    expect(line.textContent).toContain('goblin-1');
    expect(line.textContent).toContain('HIT');
    expect(line.textContent).toContain('15+5');
    expect(line.textContent).toContain('AC 14');
    expect(line.textContent).toContain('R1');
  });

  it('renders an AttackResolved MISS (the #594 fix — a whiff is never silent)', () => {
    const entries: CombatLogEntry[] = [
      {
        id: 0,
        round: 1,
        kind: 'attack',
        event: {
          attackerEntityId: 'char-alice',
          targetEntityId: 'goblin-1',
          hit: false,
          critical: false,
          attackRoll: 3,
          attackBonus: 5,
          targetAc: 14,
          hasAdvantage: false,
          hasDisadvantage: false,
          advantageSources: [],
          disadvantageSources: [],
        } as never,
      },
    ];
    render(<CombatLog entries={entries} />);
    expect(
      screen.getByTestId('combat-log-entry-attack-0').textContent
    ).toContain('MISS');
  });

  it('renders EntityDamaged with the damage breakdown refs and hp_after verbatim', () => {
    const entries: CombatLogEntry[] = [
      {
        id: 0,
        round: 1,
        kind: 'damage',
        event: {
          entityId: 'goblin-1',
          amount: 8,
          damageType: { module: 'dnd5e', type: 'damage', id: 'slashing' },
          hpAfter: { current: 2, max: 7 },
          damageBreakdown: [
            { source: 'weapon', amount: 6, isCritical: false },
            {
              source: 'dnd5e:conditions:sneak_attack',
              amount: 2,
              isCritical: false,
            },
          ],
        } as never,
      },
    ];
    render(<CombatLog entries={entries} />);
    const line = screen.getByTestId('combat-log-entry-damage-0');
    expect(line.textContent).toContain('goblin-1');
    expect(line.textContent).toContain('8');
    expect(line.textContent).toContain('slashing');
    expect(line.textContent).toContain('hp 2/7');
    expect(line.textContent).toContain('weapon:6');
    expect(line.textContent).toContain('dnd5e:conditions:sneak_attack:2');
  });

  it('renders StatusApplied and StatusRemoved via the shared condition display lookup', () => {
    const entries: CombatLogEntry[] = [
      {
        id: 0,
        round: 1,
        kind: 'statusApplied',
        event: {
          entityId: 'goblin-1',
          status: {
            source: { module: 'dnd5e', type: 'condition', id: 'prone' },
            displayName: '',
          },
          sourceEntityId: 'char-alice',
        } as never,
      },
      {
        id: 1,
        round: 1,
        kind: 'statusRemoved',
        event: {
          entityId: 'goblin-1',
          statusSource: { module: 'dnd5e', type: 'condition', id: 'prone' },
        } as never,
      },
    ];
    render(<CombatLog entries={entries} />);
    expect(
      screen.getByTestId('combat-log-entry-statusApplied-0').textContent
    ).toContain('goblin-1');
    expect(
      screen.getByTestId('combat-log-entry-statusRemoved-1').textContent
    ).toContain('goblin-1');
  });

  it('gives each entry a unique testid even when multiple share a kind (regression: getByTestId must not throw on repeat damage lines)', () => {
    const damaged = (id: number): CombatLogEntry => ({
      id,
      round: 1,
      kind: 'damage',
      event: {
        entityId: 'goblin-1',
        amount: 3,
        hpAfter: { current: 4, max: 7 },
        damageBreakdown: [],
      } as never,
    });
    const entries: CombatLogEntry[] = [damaged(0), damaged(1)];
    render(<CombatLog entries={entries} />);
    expect(screen.getByTestId('combat-log-entry-damage-0')).toBeTruthy();
    expect(screen.getByTestId('combat-log-entry-damage-1')).toBeTruthy();
  });

  it('renders ActionResolved verbatim (actor, ref, target)', () => {
    const entries: CombatLogEntry[] = [
      {
        id: 0,
        round: 1,
        kind: 'actionResolved',
        event: {
          actorEntityId: 'char-alice',
          actionRef: { module: 'dnd5e', type: 'action', id: 'attack' },
          targetEntityId: 'goblin-1',
        } as never,
      },
    ];
    render(<CombatLog entries={entries} />);
    const line = screen.getByTestId('combat-log-entry-actionResolved-0');
    expect(line.textContent).toContain('char-alice');
    expect(line.textContent).toContain('dnd5e:action:attack');
    expect(line.textContent).toContain('goblin-1');
  });

  it('renders the lowest-hp target_rationale in D&D voice (Monster AI slice 1, #733)', () => {
    const entries: CombatLogEntry[] = [
      {
        id: 0,
        round: 1,
        kind: 'actionResolved',
        event: {
          actorEntityId: 'skeleton-1',
          actionRef: { module: 'dnd5e', type: 'action', id: 'attack' },
          targetEntityId: 'char-alice',
        } as never,
        targetRationale: 'dnd5e:targeting:lowest-hp',
      },
    ];
    render(<CombatLog entries={entries} />);
    expect(
      screen.getByTestId('combat-log-entry-actionResolved-0').textContent
    ).toContain('turns on the most wounded');
  });

  it('renders the lowest-ac target_rationale in D&D voice', () => {
    const entries: CombatLogEntry[] = [
      {
        id: 0,
        round: 1,
        kind: 'actionResolved',
        event: {
          actorEntityId: 'skeleton-1',
          actionRef: { module: 'dnd5e', type: 'action', id: 'attack' },
          targetEntityId: 'char-alice',
        } as never,
        targetRationale: 'dnd5e:targeting:lowest-ac',
      },
    ];
    render(<CombatLog entries={entries} />);
    expect(
      screen.getByTestId('combat-log-entry-actionResolved-0').textContent
    ).toContain('picks out the least armored');
  });

  it("renders today's line unchanged for closest/unknown/absent target_rationale (regression — keeps log noise low)", () => {
    const baseEvent = {
      actorEntityId: 'skeleton-1',
      actionRef: { module: 'dnd5e', type: 'action', id: 'attack' },
      targetEntityId: 'char-alice',
    };
    const entries: CombatLogEntry[] = [
      { id: 0, round: 1, kind: 'actionResolved', event: baseEvent as never },
      {
        id: 1,
        round: 1,
        kind: 'actionResolved',
        event: baseEvent as never,
        targetRationale: 'dnd5e:targeting:closest',
      },
      {
        id: 2,
        round: 1,
        kind: 'actionResolved',
        event: baseEvent as never,
        targetRationale: 'dnd5e:targeting:some-future-ref',
      },
    ];
    render(<CombatLog entries={entries} />);
    for (const id of [0, 1, 2]) {
      const line = screen.getByTestId(`combat-log-entry-actionResolved-${id}`);
      expect(line.textContent).toContain(
        'skeleton-1 dnd5e:action:attack → char-alice'
      );
      expect(line.textContent).not.toContain('—');
    }
  });

  it('renders a DeathSaveRolled roll with its derived flags verbatim (rpg-dnd5e-web#432 harness-parity)', () => {
    const entries: CombatLogEntry[] = [
      {
        id: 0,
        round: 3,
        kind: 'deathSaveRolled',
        event: {
          entityId: 'char-bob',
          roll: 20,
          successes: 2,
          failures: 0,
          isCriticalFail: false,
          isCriticalSuccess: true,
          stabilized: false,
          dead: false,
          regainedConsciousness: true,
          hpRestored: 1,
        } as never,
      },
    ];
    render(<CombatLog entries={entries} />);
    const line = screen.getByTestId('combat-log-entry-deathSaveRolled-0');
    expect(line.textContent).toContain('char-bob');
    expect(line.textContent).toContain('roll 20');
    expect(line.textContent).toContain('2S/0F');
    expect(line.textContent).toContain('nat-20');
    expect(line.textContent).toContain('regained consciousness');
    expect(line.textContent).toContain('+1hp');
  });

  it('renders a DEAD DeathSaveRolled roll and an EntityStabilized line', () => {
    const entries: CombatLogEntry[] = [
      {
        id: 0,
        round: 4,
        kind: 'deathSaveRolled',
        event: {
          entityId: 'char-bob',
          roll: 1,
          successes: 1,
          failures: 3,
          isCriticalFail: true,
          isCriticalSuccess: false,
          stabilized: false,
          dead: true,
          regainedConsciousness: false,
          hpRestored: 0,
        } as never,
      },
      {
        id: 1,
        round: 4,
        kind: 'entityStabilized',
        event: { entityId: 'char-carol' } as never,
      },
    ];
    render(<CombatLog entries={entries} />);
    expect(
      screen.getByTestId('combat-log-entry-deathSaveRolled-0').textContent
    ).toContain('DEAD');
    expect(
      screen.getByTestId('combat-log-entry-entityStabilized-1').textContent
    ).toContain('char-carol');
  });

  it('renders TurnStarted, EntityDied/EntityRemoved, and EncounterEnded verbatim', () => {
    const entries: CombatLogEntry[] = [
      {
        id: 0,
        round: 2,
        kind: 'turnStarted',
        event: { entityId: 'char-alice', round: 2 } as never,
      },
      {
        id: 1,
        round: 2,
        kind: 'died',
        event: { entityId: 'goblin-1', killerEntityId: 'char-alice' } as never,
      },
      {
        id: 2,
        round: 2,
        kind: 'removed',
        event: { entityId: 'goblin-1', reason: 'destroyed' } as never,
      },
      {
        id: 3,
        round: 2,
        kind: 'encounterEnded',
        event: { reason: 'all hostiles defeated' } as never,
      },
    ];
    render(<CombatLog entries={entries} />);
    expect(
      screen.getByTestId('combat-log-entry-turnStarted-0').textContent
    ).toContain("char-alice's turn");
    expect(screen.getByTestId('combat-log-entry-died-1').textContent).toContain(
      'goblin-1 dies by char-alice'
    );
    expect(
      screen.getByTestId('combat-log-entry-removed-2').textContent
    ).toContain('destroyed');
    expect(
      screen.getByTestId('combat-log-entry-encounterEnded-3').textContent
    ).toContain('all hostiles defeated');
  });

  describe('entityMoved narration (#738)', () => {
    const movedEntry = (narration: MovementNarration): CombatLogEntry => ({
      id: 0,
      round: 1,
      kind: 'entityMoved',
      event: { entityId: 'skeleton-1' } as never,
      narration,
    });

    it('renders a "closes" line naming the target, in-fiction voice, no coordinates', () => {
      const entries: CombatLogEntry[] = [
        movedEntry({ verb: 'closes', targetEntityId: 'char-finn' }),
      ];
      render(<CombatLog entries={entries} />);
      const text = screen.getByTestId(
        'combat-log-entry-entityMoved-0'
      ).textContent;
      expect(text).toContain('skeleton-1');
      expect(text).toContain('closes on char-finn');
      expect(text).not.toMatch(/\d+,\s*-?\d+,\s*-?\d+/); // no raw coordinates
    });

    it('renders a "retreats" line with no named target', () => {
      const entries: CombatLogEntry[] = [movedEntry({ verb: 'retreats' })];
      render(<CombatLog entries={entries} />);
      expect(
        screen.getByTestId('combat-log-entry-entityMoved-0').textContent
      ).toContain('skeleton-1 retreats');
    });

    it('renders a neutral "moves" line when direction could not be derived', () => {
      const entries: CombatLogEntry[] = [movedEntry({ verb: 'moves' })];
      render(<CombatLog entries={entries} />);
      expect(
        screen.getByTestId('combat-log-entry-entityMoved-0').textContent
      ).toContain('skeleton-1 moves');
    });
  });

  describe('scroll behavior (#738)', () => {
    it('isScrolledAwayFromBottom is false when at the bottom (within the pin threshold)', () => {
      // scrollHeight - scrollTop - clientHeight = 0
      expect(isScrolledAwayFromBottom(180, 200, 20)).toBe(false);
      // Within slack (10px < default 24px threshold).
      expect(isScrolledAwayFromBottom(170, 200, 20)).toBe(false);
    });

    it('isScrolledAwayFromBottom is true once scrolled up past the threshold', () => {
      expect(isScrolledAwayFromBottom(50, 200, 20)).toBe(true);
    });

    function damaged(id: number): CombatLogEntry {
      return {
        id,
        round: 1,
        kind: 'damage',
        event: {
          entityId: 'goblin-1',
          amount: 1,
          hpAfter: { current: 5, max: 7 },
          damageBreakdown: [],
        } as never,
      };
    }

    it('auto-follows to the bottom on mount and as entries stream in while pinned', () => {
      const { rerender } = render(<CombatLog entries={[damaged(0)]} />);
      const scrollEl = screen.getByTestId(
        'combat-log-scroll'
      ) as HTMLDivElement;
      // jsdom never lays out scrollHeight, so simulate a real value.
      Object.defineProperty(scrollEl, 'scrollHeight', {
        value: 500,
        configurable: true,
      });
      rerender(<CombatLog entries={[damaged(0), damaged(1)]} />);
      expect(scrollEl.scrollTop).toBe(500);
    });

    it('pauses auto-follow once the user scrolls up, and shows a jump-to-latest affordance', () => {
      const { rerender } = render(<CombatLog entries={[damaged(0)]} />);
      const scrollEl = screen.getByTestId(
        'combat-log-scroll'
      ) as HTMLDivElement;
      Object.defineProperty(scrollEl, 'scrollHeight', {
        value: 500,
        configurable: true,
      });
      Object.defineProperty(scrollEl, 'clientHeight', {
        value: 100,
        configurable: true,
      });
      // User scrolls up, well past the pin threshold.
      scrollEl.scrollTop = 50;
      fireEvent.scroll(scrollEl);

      expect(screen.getByTestId('combat-log-jump-to-latest')).toBeTruthy();

      // A new entry arrives — auto-follow must NOT yank the reader back down.
      scrollEl.scrollTop = 50;
      rerender(<CombatLog entries={[damaged(0), damaged(1)]} />);
      expect(scrollEl.scrollTop).toBe(50);
    });

    it('resumes auto-follow and hides the affordance after jumping to latest', () => {
      render(<CombatLog entries={[damaged(0)]} />);
      const scrollEl = screen.getByTestId(
        'combat-log-scroll'
      ) as HTMLDivElement;
      Object.defineProperty(scrollEl, 'scrollHeight', {
        value: 500,
        configurable: true,
      });
      Object.defineProperty(scrollEl, 'clientHeight', {
        value: 100,
        configurable: true,
      });
      scrollEl.scrollTop = 50;
      fireEvent.scroll(scrollEl);
      expect(screen.getByTestId('combat-log-jump-to-latest')).toBeTruthy();

      fireEvent.click(screen.getByTestId('combat-log-jump-to-latest'));

      expect(scrollEl.scrollTop).toBe(500);
      expect(screen.queryByTestId('combat-log-jump-to-latest')).toBeNull();
    });

    it('does not show the jump-to-latest affordance on an empty log', () => {
      render(<CombatLog entries={[]} />);
      expect(screen.queryByTestId('combat-log-jump-to-latest')).toBeNull();
    });
  });
});
