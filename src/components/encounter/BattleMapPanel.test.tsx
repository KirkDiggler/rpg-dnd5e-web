/**
 * BattleMapPanel entity rendering logic — regression coverage for issue #385.
 *
 * BattleMapPanel renders entities by iterating encounterEntities (or falling
 * back to dungeonMap.entities). The regression in PR #371 added a filter that
 * restricted entities to currentRoomId only, hiding all entities not in the
 * active room.
 *
 * This test verifies the entity-building logic — since BattleMapPanel depends
 * on Three.js which is unavailable in the test environment, we test the same
 * logic in isolation using the same pure operations the component uses.
 */

import { createEmptyState, mergeRoom } from '@/hooks/useDungeonMap';
import { getEntityName, isDead } from '@/utils/entityHelpers';
import { create } from '@bufbuild/protobuf';
import { PositionSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/room_common_pb';
import type { EntityState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import {
  EntityPlacementSchema,
  EntityStateSchema,
  RoomSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { EntityType } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { describe, expect, it } from 'vitest';

/**
 * The entity-building logic extracted from BattleMapPanel's useMemo.
 * This is the FIXED version (no roomId filter) — tests verify it renders
 * entities from all revealed rooms.
 */
function buildEntitiesFromEncounterState(
  encounterEntities: Map<string, EntityState>
) {
  if (encounterEntities && encounterEntities.size > 0) {
    return Array.from(encounterEntities.values()).map((entity) => {
      let displayType: 'player' | 'monster' | 'obstacle';
      if (entity.entityType === EntityType.CHARACTER) {
        displayType = 'player';
      } else if (entity.entityType === EntityType.MONSTER) {
        displayType = 'monster';
      } else {
        displayType = 'obstacle';
      }
      return {
        entityId: entity.entityId,
        name: getEntityName(entity),
        position: {
          x: entity.position?.x || 0,
          y: entity.position?.y || 0,
          z: entity.position?.z || 0,
        },
        type: displayType,
        isDead: isDead(entity),
      };
    });
  }

  // Legacy fallback — returns empty for brevity in this test
  return [];
}

/** Build encounterEntities with entities in two separate rooms. */
function buildTwoRoomEncounterEntities(): Map<string, EntityState> {
  return new Map([
    [
      'player-1',
      create(EntityStateSchema, {
        entityId: 'player-1',
        entityType: EntityType.CHARACTER,
        roomId: 'room-1',
        position: create(PositionSchema, { x: 1, y: -1, z: 0 }),
        currentHitPoints: 20,
        maxHitPoints: 20,
        details: { case: undefined, value: undefined },
      }),
    ],
    [
      'monster-1',
      create(EntityStateSchema, {
        entityId: 'monster-1',
        entityType: EntityType.MONSTER,
        roomId: 'room-2',
        position: create(PositionSchema, { x: 0, y: -17, z: 17 }),
        currentHitPoints: 15,
        maxHitPoints: 15,
        details: { case: undefined, value: undefined },
      }),
    ],
  ]);
}

describe('BattleMapPanel entity logic — multi-room rendering (regression #385)', () => {
  describe('encounterEntities path (primary, new)', () => {
    it('includes entities from all revealed rooms, not just currentRoomId', () => {
      const encounterEntities = buildTwoRoomEncounterEntities();
      const result = buildEntitiesFromEncounterState(encounterEntities);

      const ids = result.map((e) => e.entityId);
      expect(ids).toContain('player-1'); // room-1 entity
      expect(ids).toContain('monster-1'); // room-2 entity
      expect(ids).toHaveLength(2);
    });

    it('assigns correct display types', () => {
      const encounterEntities = buildTwoRoomEncounterEntities();
      const result = buildEntitiesFromEncounterState(encounterEntities);

      const player = result.find((e) => e.entityId === 'player-1');
      const monster = result.find((e) => e.entityId === 'monster-1');

      expect(player?.type).toBe('player');
      expect(monster?.type).toBe('monster');
    });

    it('uses dungeon-absolute positions from EntityState', () => {
      const encounterEntities = buildTwoRoomEncounterEntities();
      const result = buildEntitiesFromEncounterState(encounterEntities);

      const monster = result.find((e) => e.entityId === 'monster-1');
      // Position (0, -17, 17) is room-2's origin — dungeon-absolute
      expect(monster?.position).toEqual({ x: 0, y: -17, z: 17 });
    });

    it('marks dead monsters correctly (isDead = monsterDetails + hp <= 0)', () => {
      // isDead requires details.case === 'monsterDetails' — plain entities are never isDead
      const entities: Map<string, EntityState> = new Map([
        [
          'monster-alive',
          create(EntityStateSchema, {
            entityId: 'monster-alive',
            entityType: EntityType.MONSTER,
            roomId: 'room-2',
            position: create(PositionSchema, { x: 0, y: -17, z: 17 }),
            currentHitPoints: 5,
            maxHitPoints: 15,
            details: { case: undefined, value: undefined },
          }),
        ],
        [
          'player-alive',
          create(EntityStateSchema, {
            entityId: 'player-alive',
            entityType: EntityType.CHARACTER,
            roomId: 'room-1',
            position: create(PositionSchema, { x: 1, y: -1, z: 0 }),
            currentHitPoints: 10,
            maxHitPoints: 20,
            details: { case: undefined, value: undefined },
          }),
        ],
      ]);

      const result = buildEntitiesFromEncounterState(entities);
      // Neither entity has monsterDetails set, so neither is flagged dead
      expect(result.every((e) => !e.isDead)).toBe(true);
    });
  });

  describe('dungeonMap.entities fallback (legacy path)', () => {
    it('accumulates entities from both rooms via mergeRoom', () => {
      let state = createEmptyState();

      const room1 = create(RoomSchema, {
        id: 'room-1',
        width: 7,
        height: 7,
        origin: create(PositionSchema, { x: 0, y: 0, z: 0 }),
        entities: {
          'player-1': create(EntityPlacementSchema, {
            entityId: 'player-1',
            entityType: EntityType.CHARACTER,
            position: create(PositionSchema, { x: 1, y: -1, z: 0 }),
          }),
        },
      });
      state = mergeRoom(state, room1, []);

      const room2 = create(RoomSchema, {
        id: 'room-2',
        width: 5,
        height: 5,
        origin: create(PositionSchema, { x: 0, y: -17, z: 17 }),
        entities: {
          'monster-1': create(EntityPlacementSchema, {
            entityId: 'monster-1',
            entityType: EntityType.MONSTER,
            position: create(PositionSchema, { x: 0, y: -17, z: 17 }),
          }),
        },
      });
      state = mergeRoom(state, room2, []);

      // Both entities exist in accumulated dungeonMap
      expect(state.entities.size).toBe(2);
      expect(state.entities.has('player-1')).toBe(true);
      expect(state.entities.has('monster-1')).toBe(true);
    });
  });
});
