/**
 * BattleMapPanel entity rendering — regression coverage for issue #385.
 *
 * Tests the exported pure functions `buildEntitiesFromEncounterState` and
 * `buildEntitiesFromDungeonMap` that the component uses for its entity array.
 * Using the exported functions rather than a copy means a filter reintroduction
 * in the component will immediately break these tests.
 *
 * Regression: PR #371 added a `roomId === currentRoomId` filter inside the
 * (now extracted) entity-building logic, hiding entities in all non-current
 * rooms. Fixes #385.
 */

import { createEmptyState, mergeRoom } from '@/hooks/useDungeonMap';
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
import {
  buildEntitiesFromDungeonMap,
  buildEntitiesFromEncounterState,
} from './entityBuildUtils';

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

describe('buildEntitiesFromEncounterState — multi-room rendering (regression #385)', () => {
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

  it('returns empty array for empty encounterEntities map', () => {
    const result = buildEntitiesFromEncounterState(new Map());
    expect(result).toHaveLength(0);
  });
});

describe('buildEntitiesFromDungeonMap — legacy fallback path', () => {
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

    const result = buildEntitiesFromDungeonMap(state.entities, [], new Set());

    const ids = result.map((e) => e.entityId);
    expect(ids).toContain('player-1');
    expect(ids).toContain('monster-1');
    expect(ids).toHaveLength(2);
  });

  it('marks dead monsters using the deadMonsterIds set', () => {
    const entities = new Map([
      [
        'monster-dead',
        create(EntityPlacementSchema, {
          entityId: 'monster-dead',
          entityType: EntityType.MONSTER,
          position: create(PositionSchema, { x: 0, y: -17, z: 17 }),
        }),
      ],
    ]);

    const result = buildEntitiesFromDungeonMap(
      entities,
      [],
      new Set(['monster-dead'])
    );
    expect(result[0].isDead).toBe(true);
  });
});
