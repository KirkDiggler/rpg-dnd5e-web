import type {
  AttackResolved,
  EncounterEnded,
  EntityDamaged,
  EntityDied,
  EntityRemoved,
  StatusApplied,
  StatusRemoved,
  TurnEnded,
  TurnStarted,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useCombatLog } from './useCombatLog';

describe('useCombatLog', () => {
  it('starts with an empty entries list', () => {
    const { result } = renderHook(() => useCombatLog());
    expect(result.current.entries).toEqual([]);
  });

  it('records an AttackResolved event verbatim under round 0 before any TurnStarted', () => {
    const { result } = renderHook(() => useCombatLog());
    const event = {
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
    } as unknown as AttackResolved;

    act(() => result.current.recordAttackResolved(event));

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]).toMatchObject({
      round: 0,
      kind: 'attack',
      event,
    });
  });

  it('stamps subsequent entries with the round from the most recent TurnStarted', () => {
    const { result } = renderHook(() => useCombatLog());
    const turnStarted = {
      entityId: 'char-alice',
      round: 2,
    } as unknown as TurnStarted;
    const damaged = {
      entityId: 'goblin-1',
      amount: 5,
      hpAfter: { current: 2, max: 7 },
      damageBreakdown: [],
    } as unknown as EntityDamaged;

    act(() => {
      result.current.recordTurnStarted(turnStarted);
      result.current.recordEntityDamaged(damaged);
    });

    expect(result.current.entries).toHaveLength(2);
    expect(result.current.entries[0]).toMatchObject({
      round: 2,
      kind: 'turnStarted',
    });
    expect(result.current.entries[1]).toMatchObject({
      round: 2,
      kind: 'damage',
      event: damaged,
    });
  });

  it('records status applied/removed, turn ended, died, removed, and encounter ended verbatim', () => {
    const { result } = renderHook(() => useCombatLog());
    const statusApplied = {
      entityId: 'goblin-1',
      status: { source: { module: 'dnd5e', type: 'condition', id: 'prone' } },
    } as unknown as StatusApplied;
    const statusRemoved = {
      entityId: 'goblin-1',
      statusSource: { module: 'dnd5e', type: 'condition', id: 'prone' },
    } as unknown as StatusRemoved;
    const turnEnded = { entityId: 'char-alice' } as unknown as TurnEnded;
    const died = {
      entityId: 'goblin-1',
      killerEntityId: 'char-alice',
    } as unknown as EntityDied;
    const removed = {
      entityId: 'goblin-1',
      reason: 'destroyed',
    } as unknown as EntityRemoved;
    const encounterEnded = {
      reason: 'all hostiles defeated',
    } as unknown as EncounterEnded;

    act(() => {
      result.current.recordStatusApplied(statusApplied);
      result.current.recordStatusRemoved(statusRemoved);
      result.current.recordTurnEnded(turnEnded);
      result.current.recordEntityDied(died);
      result.current.recordEntityRemoved(removed);
      result.current.recordEncounterEnded(encounterEnded);
    });

    const kinds = result.current.entries.map((e) => e.kind);
    expect(kinds).toEqual([
      'statusApplied',
      'statusRemoved',
      'turnEnded',
      'died',
      'removed',
      'encounterEnded',
    ]);
  });

  it('assigns stable, monotonically increasing ids independent of array position', () => {
    const { result } = renderHook(() => useCombatLog());
    const died = { entityId: 'x' } as unknown as EntityDied;

    act(() => {
      result.current.recordEntityDied(died);
      result.current.recordEntityDied(died);
      result.current.recordEntityDied(died);
    });

    const ids = result.current.entries.map((e) => e.id);
    expect(ids).toEqual([0, 1, 2]);
  });

  it('caps retained entries, dropping the oldest first', () => {
    const { result } = renderHook(() => useCombatLog());
    const died = { entityId: 'x' } as unknown as EntityDied;

    act(() => {
      for (let i = 0; i < 105; i++) {
        result.current.recordEntityDied(died);
      }
    });

    expect(result.current.entries).toHaveLength(100);
    // Oldest 5 (ids 0-4) dropped; entries[0] is id 5.
    expect(result.current.entries[0]?.id).toBe(5);
    expect(result.current.entries[result.current.entries.length - 1]?.id).toBe(
      104
    );
  });
});
