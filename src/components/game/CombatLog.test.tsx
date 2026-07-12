import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CombatLogEntry } from '../../hooks/useCombatLog';
import { CombatLog } from './CombatLog';

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
    const line = screen.getByTestId('combat-log-entry-attack');
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
    expect(screen.getByTestId('combat-log-entry-attack').textContent).toContain(
      'MISS'
    );
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
    const line = screen.getByTestId('combat-log-entry-damage');
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
      screen.getByTestId('combat-log-entry-statusApplied').textContent
    ).toContain('goblin-1');
    expect(
      screen.getByTestId('combat-log-entry-statusRemoved').textContent
    ).toContain('goblin-1');
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
      screen.getByTestId('combat-log-entry-turnStarted').textContent
    ).toContain("char-alice's turn");
    expect(screen.getByTestId('combat-log-entry-died').textContent).toContain(
      'goblin-1 dies by char-alice'
    );
    expect(
      screen.getByTestId('combat-log-entry-removed').textContent
    ).toContain('destroyed');
    expect(
      screen.getByTestId('combat-log-entry-encounterEnded').textContent
    ).toContain('all hostiles defeated');
  });
});
