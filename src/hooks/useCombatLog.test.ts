import type {
  ActionResolved,
  AttackResolved,
  DeathSaveRolled,
  EncounterEnded,
  EntityDamaged,
  EntityDied,
  EntityMoved,
  EntityRemoved,
  EntityStabilized,
  StatusApplied,
  StatusRemoved,
  TurnEnded,
  TurnStarted,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';
import {
  EncounterMode,
  EntityType,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { EntityMovedContext } from './useCombatLog';
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

  it('records ActionResolved, DeathSaveRolled, and EntityStabilized verbatim (rpg-dnd5e-web#432 harness-parity)', () => {
    const { result } = renderHook(() => useCombatLog());
    const actionResolved = {
      actorEntityId: 'char-alice',
      actionRef: { module: 'dnd5e', type: 'action', id: 'attack' },
      targetEntityId: 'goblin-1',
      economyConsumed: {
        actions: 1,
        bonusActions: 0,
        reactions: 0,
        movement: 0,
        grantedConsumed: {},
      },
    } as unknown as ActionResolved;
    const deathSaveRolled = {
      entityId: 'char-bob',
      roll: 15,
      successes: 2,
      failures: 0,
      isCriticalFail: false,
      isCriticalSuccess: false,
      stabilized: false,
      dead: false,
      regainedConsciousness: false,
      hpRestored: 0,
    } as unknown as DeathSaveRolled;
    const entityStabilized = {
      entityId: 'char-bob',
    } as unknown as EntityStabilized;

    act(() => {
      result.current.recordActionResolved(actionResolved);
      result.current.recordDeathSaveRolled(deathSaveRolled);
      result.current.recordEntityStabilized(entityStabilized);
    });

    expect(result.current.entries).toHaveLength(3);
    expect(result.current.entries[0]).toMatchObject({
      round: 0,
      kind: 'actionResolved',
      event: actionResolved,
    });
    expect(result.current.entries[1]).toMatchObject({
      round: 0,
      kind: 'deathSaveRolled',
      event: deathSaveRolled,
    });
    expect(result.current.entries[2]).toMatchObject({
      round: 0,
      kind: 'entityStabilized',
      event: entityStabilized,
    });
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

  describe('recordEntityMoved (#738 story pass)', () => {
    const moved = (entityId: string): EntityMoved =>
      ({ entityId, from: undefined, to: undefined, actualPath: [] }) as never;

    const baseContext = (): EntityMovedContext => ({
      movingEntityType: EntityType.MONSTER,
      mode: EncounterMode.TURN_BASED,
      from: { x: 0, y: 0, z: 0 },
      to: { x: 1, y: -1, z: 0 },
      characterPositions: [],
    });

    it('produces a "closes" entry when a monster moves nearer its nearest character', () => {
      const { result } = renderHook(() => useCombatLog());

      act(() => {
        result.current.recordEntityMoved(moved('skeleton-1'), {
          ...baseContext(),
          from: { x: 0, y: 0, z: 0 },
          to: { x: 3, y: -3, z: 0 },
          characterPositions: [
            { entityId: 'char-finn', position: { x: 5, y: -5, z: 0 } },
          ],
        });
      });

      expect(result.current.entries).toHaveLength(1);
      expect(result.current.entries[0]).toMatchObject({
        kind: 'entityMoved',
        narration: { verb: 'closes', targetEntityId: 'char-finn' },
      });
    });

    it('walks past a closer healthy target to narrate closing on the farther, more urgent one (the acceptance-run gap)', () => {
      const { result } = renderHook(() => useCombatLog());

      act(() => {
        result.current.recordEntityMoved(moved('skeleton-1'), {
          ...baseContext(),
          // Skeleton starts adjacent to the healthy fighter but ends its
          // move next to the wounded one five hexes further out.
          from: { x: 0, y: 0, z: 0 },
          to: { x: 5, y: -5, z: 0 },
          characterPositions: [
            { entityId: 'char-healthy', position: { x: 1, y: -1, z: 0 } },
            { entityId: 'char-wounded', position: { x: 6, y: -6, z: 0 } },
          ],
        });
      });

      expect(result.current.entries[0]).toMatchObject({
        narration: { verb: 'closes', targetEntityId: 'char-wounded' },
      });
    });

    it('produces a "retreats" entry when a monster moves away from its nearest character', () => {
      const { result } = renderHook(() => useCombatLog());

      act(() => {
        result.current.recordEntityMoved(moved('skeleton-1'), {
          ...baseContext(),
          from: { x: 1, y: -1, z: 0 },
          to: { x: 4, y: -4, z: 0 },
          characterPositions: [
            { entityId: 'char-finn', position: { x: 0, y: 0, z: 0 } },
          ],
        });
      });

      expect(result.current.entries[0]).toMatchObject({
        narration: { verb: 'retreats' },
      });
    });

    it('degrades to a neutral "moves" entry when no prior position is known', () => {
      const { result } = renderHook(() => useCombatLog());

      act(() => {
        result.current.recordEntityMoved(moved('skeleton-1'), {
          ...baseContext(),
          from: undefined,
          characterPositions: [
            { entityId: 'char-finn', position: { x: 5, y: -5, z: 0 } },
          ],
        });
      });

      expect(result.current.entries[0]).toMatchObject({
        narration: { verb: 'moves' },
      });
    });

    it('produces no entry for a CHARACTER (player) move — noise the log deliberately omits', () => {
      const { result } = renderHook(() => useCombatLog());

      act(() => {
        result.current.recordEntityMoved(moved('char-alice'), {
          ...baseContext(),
          movingEntityType: EntityType.CHARACTER,
        });
      });

      expect(result.current.entries).toHaveLength(0);
    });

    it('produces no entry outside TURN_BASED mode — free-roam movement is silent', () => {
      const { result } = renderHook(() => useCombatLog());

      act(() => {
        result.current.recordEntityMoved(moved('skeleton-1'), {
          ...baseContext(),
          mode: EncounterMode.FREE_ROAM,
        });
      });

      expect(result.current.entries).toHaveLength(0);
    });

    it('stamps the current round like every other entry kind', () => {
      const { result } = renderHook(() => useCombatLog());

      act(() => {
        result.current.recordTurnStarted({
          entityId: 'skeleton-1',
          round: 3,
        } as unknown as TurnStarted);
        result.current.recordEntityMoved(moved('skeleton-1'), baseContext());
      });

      expect(result.current.entries[1]).toMatchObject({
        round: 3,
        kind: 'entityMoved',
      });
    });
  });
});
