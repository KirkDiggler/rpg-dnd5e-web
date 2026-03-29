/**
 * Tests for useEncounterState pure state logic
 *
 * Tests the pure functions that power encounter state management:
 * createEmptyEncounterState, applySnapshotToState, mergeEntityUpdates,
 * and updateCombatState.
 *
 * Part of the unified entity state refactor (rpg-dnd5e-web feat-unified-entity-state).
 */

import { create } from '@bufbuild/protobuf';
import {
  CombatStateSchema,
  DoorInfoSchema,
  EncounterStateDataSchema,
  EntityStateSchema,
  RoomLayoutSchema,
  TurnStateSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import {
  DungeonState,
  EntityType,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { describe, expect, it } from 'vitest';
import {
  applySnapshotToState,
  createEmptyEncounterState,
  mergeEntityUpdates,
  updateCombatState,
} from './useEncounterState';

/** Helper to build a minimal EncounterStateData proto */
function makeSnapshot(opts: {
  encounterId?: string;
  dungeonId?: string;
  entities?: Record<string, { entityId: string; entityType: EntityType }>;
  rooms?: string[];
  currentRoomId?: string;
  revealedRoomIds?: string[];
  dungeonState?: DungeonState;
  roomsCleared?: number;
  doors?: string[];
}) {
  const entities: Record<
    string,
    ReturnType<typeof create<typeof EntityStateSchema>>
  > = {};
  for (const [key, e] of Object.entries(opts.entities ?? {})) {
    entities[key] = create(EntityStateSchema, {
      entityId: e.entityId,
      entityType: e.entityType,
    });
  }

  const rooms: Record<
    string,
    ReturnType<typeof create<typeof RoomLayoutSchema>>
  > = {};
  for (const roomId of opts.rooms ?? []) {
    rooms[roomId] = create(RoomLayoutSchema, { roomId });
  }

  const doors: Record<
    string,
    ReturnType<typeof create<typeof DoorInfoSchema>>
  > = {};
  for (const connectionId of opts.doors ?? []) {
    doors[connectionId] = create(DoorInfoSchema, { connectionId });
  }

  return create(EncounterStateDataSchema, {
    encounterId: opts.encounterId ?? 'enc-1',
    dungeonId: opts.dungeonId ?? 'dng-1',
    entities,
    rooms,
    currentRoomId: opts.currentRoomId ?? '',
    revealedRoomIds: opts.revealedRoomIds ?? [],
    dungeonState: opts.dungeonState ?? DungeonState.UNSPECIFIED,
    roomsCleared: opts.roomsCleared ?? 0,
    doors,
  });
}

describe('createEmptyEncounterState', () => {
  it('returns empty state with Maps and default values', () => {
    const state = createEmptyEncounterState();

    expect(state.encounterId).toBe('');
    expect(state.dungeonId).toBe('');
    expect(state.entities).toBeInstanceOf(Map);
    expect(state.entities.size).toBe(0);
    expect(state.rooms).toBeInstanceOf(Map);
    expect(state.rooms.size).toBe(0);
    expect(state.doors).toBeInstanceOf(Map);
    expect(state.doors.size).toBe(0);
    expect(state.revealedRoomIds).toEqual([]);
    expect(state.combat).toBeNull();
    expect(state.currentRoomId).toBe('');
    expect(state.roomsCleared).toBe(0);
    expect(state.dungeonState).toBe(DungeonState.UNSPECIFIED);
  });
});

describe('applySnapshotToState', () => {
  it('converts all proto fields into LocalEncounterState', () => {
    const snapshot = makeSnapshot({
      encounterId: 'enc-42',
      dungeonId: 'dng-99',
      entities: {
        'char-1': { entityId: 'char-1', entityType: EntityType.CHARACTER },
        'mob-1': { entityId: 'mob-1', entityType: EntityType.MONSTER },
      },
      rooms: ['room-1', 'room-2'],
      currentRoomId: 'room-2',
      revealedRoomIds: ['room-1', 'room-2'],
      dungeonState: DungeonState.ACTIVE,
      roomsCleared: 3,
      doors: ['conn-a', 'conn-b'],
    });

    const state = applySnapshotToState(snapshot);

    expect(state.encounterId).toBe('enc-42');
    expect(state.dungeonId).toBe('dng-99');
    expect(state.entities.size).toBe(2);
    expect(state.entities.has('char-1')).toBe(true);
    expect(state.entities.has('mob-1')).toBe(true);
    expect(state.rooms.size).toBe(2);
    expect(state.rooms.has('room-1')).toBe(true);
    expect(state.rooms.has('room-2')).toBe(true);
    expect(state.currentRoomId).toBe('room-2');
    expect(state.revealedRoomIds).toEqual(['room-1', 'room-2']);
    expect(state.dungeonState).toBe(DungeonState.ACTIVE);
    expect(state.roomsCleared).toBe(3);
    expect(state.doors.size).toBe(2);
    expect(state.doors.has('conn-a')).toBe(true);
    expect(state.doors.has('conn-b')).toBe(true);
  });

  it('converts proto record maps to JS Maps', () => {
    const snapshot = makeSnapshot({
      entities: {
        'char-1': { entityId: 'char-1', entityType: EntityType.CHARACTER },
      },
    });

    const state = applySnapshotToState(snapshot);

    expect(state.entities).toBeInstanceOf(Map);
    expect(state.rooms).toBeInstanceOf(Map);
    expect(state.doors).toBeInstanceOf(Map);
  });

  it('sets combat to null when snapshot has no combat', () => {
    const snapshot = makeSnapshot({});
    const state = applySnapshotToState(snapshot);
    expect(state.combat).toBeNull();
  });

  it('sets combat from snapshot when present', () => {
    const combatState = create(CombatStateSchema, {
      currentTurn: create(TurnStateSchema, { entityId: 'char-1' }),
      round: 2,
    });

    const snapshot = create(EncounterStateDataSchema, {
      encounterId: 'enc-1',
      dungeonId: 'dng-1',
      combat: combatState,
      dungeonState: DungeonState.ACTIVE,
    });

    const state = applySnapshotToState(snapshot);

    expect(state.combat).not.toBeNull();
    expect(state.combat?.currentTurn?.entityId).toBe('char-1');
    expect(state.combat?.round).toBe(2);
  });

  it('handles empty entities/rooms/doors records gracefully', () => {
    const snapshot = makeSnapshot({});
    const state = applySnapshotToState(snapshot);

    expect(state.entities.size).toBe(0);
    expect(state.rooms.size).toBe(0);
    expect(state.doors.size).toBe(0);
  });

  it('produces independent state from previous calls (no shared references)', () => {
    const snapshot1 = makeSnapshot({
      encounterId: 'enc-1',
      entities: {
        'char-1': { entityId: 'char-1', entityType: EntityType.CHARACTER },
      },
    });

    const snapshot2 = makeSnapshot({
      encounterId: 'enc-2',
      entities: {
        'char-2': { entityId: 'char-2', entityType: EntityType.CHARACTER },
      },
    });

    const state1 = applySnapshotToState(snapshot1);
    const state2 = applySnapshotToState(snapshot2);

    expect(state1.encounterId).toBe('enc-1');
    expect(state2.encounterId).toBe('enc-2');
    expect(state1.entities.has('char-1')).toBe(true);
    expect(state2.entities.has('char-2')).toBe(true);
    expect(state1.entities.has('char-2')).toBe(false);
  });
});

describe('mergeEntityUpdates', () => {
  it('merges updates into existing entities without losing others', () => {
    const snapshot = makeSnapshot({
      entities: {
        'char-1': { entityId: 'char-1', entityType: EntityType.CHARACTER },
        'mob-1': { entityId: 'mob-1', entityType: EntityType.MONSTER },
      },
    });
    const prev = applySnapshotToState(snapshot);

    const updatedChar = create(EntityStateSchema, {
      entityId: 'char-1',
      entityType: EntityType.CHARACTER,
      currentHitPoints: 15,
      maxHitPoints: 20,
    });

    const next = mergeEntityUpdates(prev, [updatedChar]);

    expect(next.entities.size).toBe(2);
    expect(next.entities.get('char-1')?.currentHitPoints).toBe(15);
    expect(next.entities.has('mob-1')).toBe(true);
  });

  it('adds new entity not in previous state', () => {
    const snapshot = makeSnapshot({
      entities: {
        'char-1': { entityId: 'char-1', entityType: EntityType.CHARACTER },
      },
    });
    const prev = applySnapshotToState(snapshot);

    const newMob = create(EntityStateSchema, {
      entityId: 'mob-new',
      entityType: EntityType.MONSTER,
    });

    const next = mergeEntityUpdates(prev, [newMob]);

    expect(next.entities.size).toBe(2);
    expect(next.entities.has('mob-new')).toBe(true);
  });

  it('handles multiple updates in one call', () => {
    const snapshot = makeSnapshot({
      entities: {
        'char-1': { entityId: 'char-1', entityType: EntityType.CHARACTER },
        'char-2': { entityId: 'char-2', entityType: EntityType.CHARACTER },
      },
    });
    const prev = applySnapshotToState(snapshot);

    const updates = [
      create(EntityStateSchema, {
        entityId: 'char-1',
        entityType: EntityType.CHARACTER,
        currentHitPoints: 10,
      }),
      create(EntityStateSchema, {
        entityId: 'char-2',
        entityType: EntityType.CHARACTER,
        currentHitPoints: 5,
      }),
    ];

    const next = mergeEntityUpdates(prev, updates);

    expect(next.entities.get('char-1')?.currentHitPoints).toBe(10);
    expect(next.entities.get('char-2')?.currentHitPoints).toBe(5);
  });

  it('does not mutate the previous state', () => {
    const snapshot = makeSnapshot({
      entities: {
        'char-1': { entityId: 'char-1', entityType: EntityType.CHARACTER },
      },
    });
    const prev = applySnapshotToState(snapshot);

    const updated = create(EntityStateSchema, {
      entityId: 'char-1',
      entityType: EntityType.CHARACTER,
      currentHitPoints: 8,
    });

    mergeEntityUpdates(prev, [updated]);

    // Original state unchanged
    expect(prev.entities.get('char-1')?.currentHitPoints).toBe(0);
  });

  it('does not affect rooms, doors, or scalar fields', () => {
    const snapshot = makeSnapshot({
      encounterId: 'enc-stable',
      dungeonId: 'dng-stable',
      entities: {
        'char-1': { entityId: 'char-1', entityType: EntityType.CHARACTER },
      },
      rooms: ['room-1'],
      doors: ['conn-1'],
      currentRoomId: 'room-1',
      revealedRoomIds: ['room-1'],
      roomsCleared: 2,
    });
    const prev = applySnapshotToState(snapshot);

    const next = mergeEntityUpdates(prev, [
      create(EntityStateSchema, {
        entityId: 'char-1',
        entityType: EntityType.CHARACTER,
        currentHitPoints: 8,
      }),
    ]);

    expect(next.encounterId).toBe('enc-stable');
    expect(next.dungeonId).toBe('dng-stable');
    expect(next.rooms.size).toBe(1);
    expect(next.doors.size).toBe(1);
    expect(next.currentRoomId).toBe('room-1');
    expect(next.revealedRoomIds).toEqual(['room-1']);
    expect(next.roomsCleared).toBe(2);
  });
});

describe('updateCombatState', () => {
  it('updates combat field without touching entities', () => {
    const snapshot = makeSnapshot({
      entities: {
        'char-1': { entityId: 'char-1', entityType: EntityType.CHARACTER },
      },
    });
    const prev = applySnapshotToState(snapshot);

    const combat = create(CombatStateSchema, {
      currentTurn: create(TurnStateSchema, { entityId: 'char-1' }),
      round: 1,
    });

    const next = updateCombatState(prev, combat);

    expect(next.combat?.currentTurn?.entityId).toBe('char-1');
    expect(next.combat?.round).toBe(1);
    expect(next.entities.size).toBe(1);
  });

  it('replaces previous combat state', () => {
    const prev = applySnapshotToState(makeSnapshot({}));

    const withCombat1 = updateCombatState(
      prev,
      create(CombatStateSchema, {
        currentTurn: create(TurnStateSchema, { entityId: 'char-1' }),
        round: 1,
      })
    );

    const withCombat2 = updateCombatState(
      withCombat1,
      create(CombatStateSchema, {
        currentTurn: create(TurnStateSchema, { entityId: 'mob-1' }),
        round: 2,
      })
    );

    expect(withCombat2.combat?.currentTurn?.entityId).toBe('mob-1');
    expect(withCombat2.combat?.round).toBe(2);
  });

  it('does not mutate previous state', () => {
    const prev = applySnapshotToState(makeSnapshot({}));
    expect(prev.combat).toBeNull();

    updateCombatState(
      prev,
      create(CombatStateSchema, {
        currentTurn: create(TurnStateSchema, { entityId: 'char-1' }),
        round: 1,
      })
    );

    // Original still null
    expect(prev.combat).toBeNull();
  });

  it('preserves all other fields', () => {
    const snapshot = makeSnapshot({
      encounterId: 'enc-99',
      dungeonId: 'dng-88',
      rooms: ['room-1'],
      doors: ['conn-1'],
      currentRoomId: 'room-1',
      revealedRoomIds: ['room-1'],
      roomsCleared: 5,
      dungeonState: DungeonState.ACTIVE,
    });
    const prev = applySnapshotToState(snapshot);

    const next = updateCombatState(
      prev,
      create(CombatStateSchema, { round: 3 })
    );

    expect(next.encounterId).toBe('enc-99');
    expect(next.dungeonId).toBe('dng-88');
    expect(next.rooms.size).toBe(1);
    expect(next.doors.size).toBe(1);
    expect(next.currentRoomId).toBe('room-1');
    expect(next.revealedRoomIds).toEqual(['room-1']);
    expect(next.roomsCleared).toBe(5);
    expect(next.dungeonState).toBe(DungeonState.ACTIVE);
  });
});
