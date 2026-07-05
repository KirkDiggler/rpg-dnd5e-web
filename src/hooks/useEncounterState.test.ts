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
import { PositionSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/room_common_pb';
import {
  CharacterDetailsSchema,
  CombatStateSchema,
  DoorInfoSchema,
  EncounterStateDataSchema,
  type EntityState,
  EntityStateSchema,
  MonsterDetailsSchema,
  RoomLayoutSchema,
  TurnStateSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import {
  DungeonState,
  EntityType,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import type {
  EncounterEnded,
  EntityDamaged,
  EntityDied,
  EntityRemoved,
  ModeChanged,
  StatusApplied,
  StatusRemoved,
  TurnStarted,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';
import {
  AvailableActionSchema,
  EconomySlot,
  EncounterMode,
  EntityType as EntityTypeV2,
  InputRequiredSchema,
  SkillCheckPromptSchema,
  TargetKind,
  TurnStateSchema as TurnStateSchemaV2,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { describe, expect, it } from 'vitest';
import { hexKey } from '../utils/hexCoord';
import {
  applyDoorOpened,
  applyEncounterEnded,
  applyEntityAppeared,
  applyEntityAppearedBatch,
  applyEntityDamaged,
  applyEntityDied,
  applyEntityDisappeared,
  applyEntityMetaFromAppeared,
  applyEntityRemoved,
  applyHexRevealed,
  applyModeChanged,
  applySnapshotToState,
  applyStatusApplied,
  applyStatusRemoved,
  applyTurnEnded,
  applyTurnStarted,
  applyTurnStateChanged,
  applyV2SnapshotTurnState,
  createEmptyEncounterState,
  mergeEntityPosition,
  mergeEntityUpdates,
  setPendingPromptReducer,
  setReactionReadyLocalReducer,
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
    rooms[roomId] = create(RoomLayoutSchema, { id: roomId });
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
    expect(state.revealedHexes).toBeInstanceOf(Set);
    expect(state.revealedHexes.size).toBe(0);
    expect(state.openDoors).toBeInstanceOf(Set);
    expect(state.openDoors.size).toBe(0);
    expect(state.entityHP).toBeInstanceOf(Map);
    expect(state.entityHP.size).toBe(0);
    expect(state.entityStatuses).toBeInstanceOf(Map);
    expect(state.entityStatuses.size).toBe(0);
    expect(state.mode).toBe(EncounterMode.UNSPECIFIED);
    expect(state.activeEntityId).toBe('');
    expect(state.round).toBe(0);
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

  it('seeds entityAC from character and monster details in snapshot entities', () => {
    const snapshot = create(EncounterStateDataSchema, {
      encounterId: 'enc-1',
      dungeonId: 'dng-1',
      dungeonState: DungeonState.ACTIVE,
      entities: {
        'char-1': create(EntityStateSchema, {
          entityId: 'char-1',
          entityType: EntityType.CHARACTER,
          details: {
            case: 'characterDetails',
            value: create(CharacterDetailsSchema, { armorClass: 15 }),
          },
        }),
        'goblin-1': create(EntityStateSchema, {
          entityId: 'goblin-1',
          entityType: EntityType.MONSTER,
          details: {
            case: 'monsterDetails',
            value: create(MonsterDetailsSchema, { armorClass: 13 }),
          },
        }),
      },
    });
    const state = applySnapshotToState(snapshot);
    expect(state.entityAC.get('char-1')).toBe(15);
    expect(state.entityAC.get('goblin-1')).toBe(13);
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

  it('extracts entityAC from character details', () => {
    const prev = applySnapshotToState(makeSnapshot({}));
    const charWithAC = create(EntityStateSchema, {
      entityId: 'char-1',
      entityType: EntityType.CHARACTER,
      details: {
        case: 'characterDetails',
        value: create(CharacterDetailsSchema, { armorClass: 15 }),
      },
    });
    const next = mergeEntityUpdates(prev, [charWithAC]);
    expect(next.entityAC.get('char-1')).toBe(15);
  });

  it('extracts entityAC from monster details', () => {
    const prev = applySnapshotToState(makeSnapshot({}));
    const monster = create(EntityStateSchema, {
      entityId: 'goblin-1',
      entityType: EntityType.MONSTER,
      details: {
        case: 'monsterDetails',
        value: create(MonsterDetailsSchema, { armorClass: 13 }),
      },
    });
    const next = mergeEntityUpdates(prev, [monster]);
    expect(next.entityAC.get('goblin-1')).toBe(13);
  });
});

describe('mergeEntityPosition', () => {
  it('updates position of an existing entity', () => {
    const snapshot = makeSnapshot({
      entities: {
        'char-1': { entityId: 'char-1', entityType: EntityType.CHARACTER },
      },
    });
    const prev = applySnapshotToState(snapshot);
    const newPos = create(PositionSchema, { x: 3, y: -1, z: -2 });

    const next = mergeEntityPosition(prev, 'char-1', newPos);

    expect(next.entities.get('char-1')?.position).toEqual(newPos);
  });

  it('preserves other fields on the updated entity', () => {
    const snapshot = makeSnapshot({});
    let prev = applySnapshotToState(snapshot);
    // Seed an entity with non-position fields populated
    const seeded = create(EntityStateSchema, {
      entityId: 'char-1',
      entityType: EntityType.CHARACTER,
      currentHitPoints: 12,
      maxHitPoints: 20,
    });
    prev = mergeEntityUpdates(prev, [seeded]);

    const newPos = create(PositionSchema, { x: 5, y: -3, z: -2 });
    const next = mergeEntityPosition(prev, 'char-1', newPos);

    const updated = next.entities.get('char-1');
    expect(updated?.position).toEqual(newPos);
    expect(updated?.currentHitPoints).toBe(12);
    expect(updated?.maxHitPoints).toBe(20);
    expect(updated?.entityType).toBe(EntityType.CHARACTER);
  });

  it('returns prev unchanged when entity is not present', () => {
    const snapshot = makeSnapshot({
      entities: {
        'char-1': { entityId: 'char-1', entityType: EntityType.CHARACTER },
      },
    });
    const prev = applySnapshotToState(snapshot);
    const newPos = create(PositionSchema, { x: 1, y: 0, z: -1 });

    const next = mergeEntityPosition(prev, 'char-missing', newPos);

    // Same reference — pure no-op when entity isn't tracked
    expect(next).toBe(prev);
  });

  it('does not mutate the previous state', () => {
    const snapshot = makeSnapshot({
      entities: {
        'char-1': { entityId: 'char-1', entityType: EntityType.CHARACTER },
      },
    });
    const prev = applySnapshotToState(snapshot);
    const originalEntity = prev.entities.get('char-1');
    const newPos = create(PositionSchema, { x: 7, y: -3, z: -4 });

    mergeEntityPosition(prev, 'char-1', newPos);

    // Original state's entity reference unchanged
    expect(prev.entities.get('char-1')).toBe(originalEntity);
  });

  it('does not affect rooms, doors, or combat fields', () => {
    const snapshot = makeSnapshot({
      encounterId: 'enc-stable',
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
    const newPos = create(PositionSchema, { x: 2, y: 1, z: -3 });

    const next = mergeEntityPosition(prev, 'char-1', newPos);

    expect(next.encounterId).toBe('enc-stable');
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

// ---------------------------------------------------------------------------
// Helper for v1alpha2 tests
// ---------------------------------------------------------------------------

function makeTestEntity(
  id: string,
  pos: { x: number; y: number; z: number }
): EntityState {
  return create(EntityStateSchema, {
    entityId: id,
    position: create(PositionSchema, { x: pos.x, y: pos.y, z: pos.z }),
  });
}

// ---------------------------------------------------------------------------
// Helpers for combat reducer tests — minimal proto-shape stubs. We don't
// build via create(...) because these are read-only test inputs and the
// reducers don't validate $typeName.
// ---------------------------------------------------------------------------

function makeDamaged(
  entityId: string,
  current: number,
  max: number,
  amount = 0
): EntityDamaged {
  return {
    entityId,
    amount,
    hpAfter: { current, max, temp: 0 },
  } as unknown as EntityDamaged;
}

function makeStatusApplied(
  entityId: string,
  module: string,
  type: string,
  id: string,
  displayName = id
): StatusApplied {
  return {
    entityId,
    status: {
      source: { module, type, id },
      displayName,
    },
  } as unknown as StatusApplied;
}

function makeStatusRemoved(
  entityId: string,
  module: string,
  type: string,
  id: string
): StatusRemoved {
  return {
    entityId,
    statusSource: { module, type, id },
  } as unknown as StatusRemoved;
}

function makeModeChanged(
  from: EncounterMode,
  to: EncounterMode,
  reason = ''
): ModeChanged {
  return { from, to, reason } as unknown as ModeChanged;
}

function makeTurnStarted(entityId: string, round: number): TurnStarted {
  return { entityId, round } as unknown as TurnStarted;
}

// ---------------------------------------------------------------------------
// v1alpha2 reducer additions
// ---------------------------------------------------------------------------

describe('v1alpha2 reducer additions', () => {
  describe('applyHexRevealed', () => {
    it('adds hexes to revealedHexes without dropping existing reveals', () => {
      const prev = createEmptyEncounterState();
      const after1 = applyHexRevealed(prev, [{ q: 0, r: 0, s: 0 }]);
      expect(after1.revealedHexes.has(hexKey({ q: 0, r: 0, s: 0 }))).toBe(true);

      const after2 = applyHexRevealed(after1, [{ q: 1, r: -1, s: 0 }]);
      expect(after2.revealedHexes.has(hexKey({ q: 0, r: 0, s: 0 }))).toBe(true);
      expect(after2.revealedHexes.has(hexKey({ q: 1, r: -1, s: 0 }))).toBe(
        true
      );
    });

    it('is idempotent on duplicate hexes', () => {
      const prev = applyHexRevealed(createEmptyEncounterState(), [
        { q: 2, r: -1, s: -1 },
      ]);
      const after = applyHexRevealed(prev, [{ q: 2, r: -1, s: -1 }]);
      expect(after.revealedHexes.size).toBe(1);
    });
  });

  describe('applyEntityAppeared', () => {
    it('adds a new entity at first-visible position with ghost cleared', () => {
      const prev = createEmptyEncounterState();
      const entity = makeTestEntity('goblin-1', { x: 3, y: -2, z: -1 });
      const after = applyEntityAppeared(prev, entity);
      const stored = after.entities.get('goblin-1');
      expect(stored).toBeDefined();
      expect(stored?.ghost).toBeFalsy();
      expect(stored?.position?.x).toBe(3);
      expect(stored?.position?.y).toBe(-2);
      expect(stored?.position?.z).toBe(-1);
    });

    it('clears the ghost flag on a previously-disappeared entity', () => {
      const entity = makeTestEntity('alice', { x: 0, y: 0, z: 0 });
      const withEntity = mergeEntityUpdates(createEmptyEncounterState(), [
        entity,
      ]);
      const ghosted = applyEntityDisappeared(withEntity, 'alice', {
        q: 1,
        r: -1,
        s: 0,
      });
      expect(ghosted.entities.get('alice')?.ghost).toBe(true);

      const reappeared = applyEntityAppeared(
        ghosted,
        makeTestEntity('alice', { x: 5, y: -3, z: -2 })
      );
      expect(reappeared.entities.get('alice')?.ghost).toBeFalsy();
    });
  });

  describe('applyEntityDisappeared', () => {
    it('keeps entity in store, sets ghost=true, updates position to last_known', () => {
      const entity = makeTestEntity('bob', { x: 0, y: 0, z: 0 });
      const prev = mergeEntityUpdates(createEmptyEncounterState(), [entity]);
      const after = applyEntityDisappeared(prev, 'bob', {
        q: 4,
        r: -2,
        s: -2,
      });
      const stored = after.entities.get('bob');
      expect(stored?.ghost).toBe(true);
      expect(stored?.position?.x).toBe(4);
      expect(stored?.position?.y).toBe(-2);
      expect(stored?.position?.z).toBe(-2);
    });

    it('is a no-op if the entity is not in state (defensive)', () => {
      const prev = createEmptyEncounterState();
      const after = applyEntityDisappeared(prev, 'unknown', {
        q: 0,
        r: 0,
        s: 0,
      });
      expect(after.entities.size).toBe(0);
      // Reference identity preserved on no-op — matches mergeEntityPosition's
      // pattern; prevents needless React re-renders if a stream loop fires
      // EntityDisappeared for an entity we never saw.
      expect(after).toBe(prev);
    });
  });

  describe('applyDoorOpened', () => {
    it('adds the door entity id to openDoors', () => {
      const prev = createEmptyEncounterState();
      const after = applyDoorOpened(prev, 'door-east');
      expect(after.openDoors.has('door-east')).toBe(true);
      expect(after.openDoors.size).toBe(1);
    });

    it('preserves previously-opened doors when a new one opens', () => {
      let state = createEmptyEncounterState();
      state = applyDoorOpened(state, 'door-east');
      state = applyDoorOpened(state, 'door-north');
      expect(state.openDoors.has('door-east')).toBe(true);
      expect(state.openDoors.has('door-north')).toBe(true);
      expect(state.openDoors.size).toBe(2);
    });

    it('is idempotent — re-opening returns the same reference (no re-render)', () => {
      const opened = applyDoorOpened(createEmptyEncounterState(), 'door-east');
      const reopened = applyDoorOpened(opened, 'door-east');
      expect(reopened).toBe(opened);
      expect(reopened.openDoors.size).toBe(1);
    });

    it('does not mutate the previous state', () => {
      const prev = createEmptyEncounterState();
      applyDoorOpened(prev, 'door-east');
      expect(prev.openDoors.size).toBe(0);
    });

    it('does not touch revealedHexes (cause/effect split)', () => {
      // The toolkit emits DoorOpened (cause) and GeometryRevealed (effect)
      // as two events. applyDoorOpened only updates door state; the hex
      // reveal flows through applyHexRevealed independently.
      let state = createEmptyEncounterState();
      state = applyHexRevealed(state, [{ q: 1, r: -1, s: 0 }]);
      const beforeOpen = state.revealedHexes;
      state = applyDoorOpened(state, 'door-east');
      expect(state.revealedHexes).toBe(beforeOpen);
      expect(state.revealedHexes.size).toBe(1);
    });
  });

  describe('applySnapshotToState — v2 delta preservation across v1 snapshots', () => {
    // Regression: v1alpha1 snapshots don't carry v2-only delta fields like
    // openDoors / revealedHexes, and v2 deltas aren't replayed on sync. The
    // main app calls applySnapshot on multiple v1 paths (LobbyView's
    // state-sync handlers), so a naive rebuild would silently wipe every
    // door we'd opened mid-session. applySnapshotToState carries these
    // fields forward when prev is for the same encounter.
    it('preserves openDoors when applying a same-encounter v1 snapshot', () => {
      // Seed: open a door via the v2 reducer
      let state = applySnapshotToState(makeSnapshot({ encounterId: 'enc-1' }));
      state = applyDoorOpened(state, 'door-1');
      state = applyDoorOpened(state, 'door-east');
      expect(state.openDoors.size).toBe(2);

      // Simulate a v1 snapshot sync for the same encounter
      const refreshed = applySnapshotToState(
        makeSnapshot({ encounterId: 'enc-1' }),
        state
      );

      expect(refreshed.openDoors.has('door-1')).toBe(true);
      expect(refreshed.openDoors.has('door-east')).toBe(true);
      expect(refreshed.openDoors.size).toBe(2);
    });

    it('preserves revealedHexes when applying a same-encounter v1 snapshot', () => {
      let state = applySnapshotToState(makeSnapshot({ encounterId: 'enc-1' }));
      state = applyHexRevealed(state, [
        { q: 1, r: -1, s: 0 },
        { q: 2, r: -2, s: 0 },
      ]);
      expect(state.revealedHexes.size).toBe(2);

      const refreshed = applySnapshotToState(
        makeSnapshot({ encounterId: 'enc-1' }),
        state
      );

      expect(refreshed.revealedHexes.size).toBe(2);
      expect(refreshed.revealedHexes.has(hexKey({ q: 1, r: -1, s: 0 }))).toBe(
        true
      );
      expect(refreshed.revealedHexes.has(hexKey({ q: 2, r: -2, s: 0 }))).toBe(
        true
      );
    });

    it('resets v2 delta state on encounter switch (different encounterId)', () => {
      // Crossing into a new encounter is a clean break — v2 deltas from the
      // prior encounter must not leak into the new one.
      let state = applySnapshotToState(makeSnapshot({ encounterId: 'enc-1' }));
      state = applyDoorOpened(state, 'door-1');
      state = applyHexRevealed(state, [{ q: 1, r: -1, s: 0 }]);
      state = applyEntityDamaged(state, makeDamaged('goblin-1', 5, 5));
      state = applyTurnStarted(state, makeTurnStarted('char-alice', 1));
      state = applyModeChanged(
        state,
        makeModeChanged(EncounterMode.FREE_ROAM, EncounterMode.TURN_BASED)
      );

      const switched = applySnapshotToState(
        makeSnapshot({ encounterId: 'enc-2' }),
        state
      );

      expect(switched.openDoors.size).toBe(0);
      expect(switched.revealedHexes.size).toBe(0);
      expect(switched.entityHP.size).toBe(0);
      expect(switched.entityStatuses.size).toBe(0);
      expect(switched.mode).toBe(EncounterMode.UNSPECIFIED);
      expect(switched.activeEntityId).toBe('');
      expect(switched.round).toBe(0);
    });

    it('starts with empty v2 delta state when prev is omitted (first snapshot)', () => {
      const state = applySnapshotToState(
        makeSnapshot({ encounterId: 'enc-1' })
      );
      expect(state.openDoors.size).toBe(0);
      expect(state.revealedHexes.size).toBe(0);
      expect(state.entityHP.size).toBe(0);
      expect(state.entityStatuses.size).toBe(0);
      expect(state.mode).toBe(EncounterMode.UNSPECIFIED);
      expect(state.activeEntityId).toBe('');
      expect(state.round).toBe(0);
    });

    it('preserves v2 combat delta state across same-encounter v1 snapshot', () => {
      // Wave 2.8: combat events (HP, status, mode, active actor, round) flow
      // only on the v2 stream; v1 snapshots don't carry them and don't
      // replay deltas. Same survival rule as openDoors / revealedHexes.
      let state = applySnapshotToState(makeSnapshot({ encounterId: 'enc-1' }));
      state = applyEntityDamaged(state, makeDamaged('goblin-1', 5, 7));
      state = applyEntityDamaged(state, makeDamaged('char-alice', 3, 14));
      state = applyStatusApplied(
        state,
        makeStatusApplied('char-alice', 'dnd5e', 'condition', 'poisoned')
      );
      state = applyModeChanged(
        state,
        makeModeChanged(EncounterMode.FREE_ROAM, EncounterMode.TURN_BASED)
      );
      state = applyTurnStarted(state, makeTurnStarted('char-alice', 2));

      const refreshed = applySnapshotToState(
        makeSnapshot({ encounterId: 'enc-1' }),
        state
      );

      expect(refreshed.entityHP.get('goblin-1')).toEqual({
        current: 5,
        max: 7,
      });
      expect(refreshed.entityHP.get('char-alice')).toEqual({
        current: 3,
        max: 14,
      });
      expect(refreshed.entityStatuses.get('char-alice')).toHaveLength(1);
      expect(refreshed.mode).toBe(EncounterMode.TURN_BASED);
      expect(refreshed.activeEntityId).toBe('char-alice');
      expect(refreshed.round).toBe(2);
    });
  });

  describe('appear/disappear sequences', () => {
    it('survives appeared → moved → disappeared → appeared cleanly', () => {
      let state = createEmptyEncounterState();
      state = applyEntityAppeared(
        state,
        makeTestEntity('mover', { x: 0, y: 0, z: 0 })
      );
      expect(state.entities.get('mover')?.ghost).toBeFalsy();

      state = mergeEntityPosition(
        state,
        'mover',
        create(PositionSchema, { x: 1, y: -1, z: 0 })
      );
      expect(state.entities.get('mover')?.position?.x).toBe(1);
      expect(state.entities.get('mover')?.position?.y).toBe(-1);
      expect(state.entities.get('mover')?.position?.z).toBe(0);

      state = applyEntityDisappeared(state, 'mover', { q: 2, r: -1, s: -1 });
      expect(state.entities.get('mover')?.ghost).toBe(true);
      expect(state.entities.get('mover')?.position?.x).toBe(2);
      expect(state.entities.get('mover')?.position?.y).toBe(-1);
      expect(state.entities.get('mover')?.position?.z).toBe(-1);

      state = applyEntityAppeared(
        state,
        makeTestEntity('mover', { x: 5, y: -3, z: -2 })
      );
      expect(state.entities.get('mover')?.ghost).toBeFalsy();
      expect(state.entities.get('mover')?.position?.x).toBe(5);
      expect(state.entities.get('mover')?.position?.y).toBe(-3);
      expect(state.entities.get('mover')?.position?.z).toBe(-2);
    });
  });
});

// ---------------------------------------------------------------------------
// Wave 2.8 combat reducers
// ---------------------------------------------------------------------------

describe('Wave 2.8 combat reducers', () => {
  describe('applyEntityDamaged', () => {
    it('sets entity HP from hp_after', () => {
      const prev = createEmptyEncounterState();
      const after = applyEntityDamaged(prev, makeDamaged('goblin-1', 2, 7, 5));
      expect(after.entityHP.get('goblin-1')).toEqual({ current: 2, max: 7 });
    });

    it('preserves HP for other entities', () => {
      let state = createEmptyEncounterState();
      state = applyEntityDamaged(state, makeDamaged('alice', 10, 14));
      state = applyEntityDamaged(state, makeDamaged('goblin-1', 0, 7, 5));
      expect(state.entityHP.get('alice')).toEqual({ current: 10, max: 14 });
      expect(state.entityHP.get('goblin-1')).toEqual({ current: 0, max: 7 });
    });

    it('overwrites HP on subsequent damage events for the same entity', () => {
      let state = createEmptyEncounterState();
      state = applyEntityDamaged(state, makeDamaged('alice', 12, 14));
      state = applyEntityDamaged(state, makeDamaged('alice', 8, 14));
      expect(state.entityHP.get('alice')).toEqual({ current: 8, max: 14 });
    });

    it('is idempotent on identical hp_after (returns same reference)', () => {
      const prev = applyEntityDamaged(
        createEmptyEncounterState(),
        makeDamaged('alice', 8, 14)
      );
      const next = applyEntityDamaged(prev, makeDamaged('alice', 8, 14));
      expect(next).toBe(prev);
    });

    it('is a no-op when hp_after is missing (defensive)', () => {
      const prev = createEmptyEncounterState();
      const event = {
        entityId: 'alice',
        amount: 3,
      } as unknown as EntityDamaged;
      const next = applyEntityDamaged(prev, event);
      expect(next).toBe(prev);
      expect(next.entityHP.size).toBe(0);
    });

    it('does not mutate the previous state', () => {
      const prev = createEmptyEncounterState();
      applyEntityDamaged(prev, makeDamaged('alice', 5, 14));
      expect(prev.entityHP.size).toBe(0);
    });

    it('does not touch entityStatuses, mode, or activeEntityId', () => {
      let prev = createEmptyEncounterState();
      prev = applyTurnStarted(prev, makeTurnStarted('alice', 3));
      prev = applyStatusApplied(
        prev,
        makeStatusApplied('alice', 'dnd5e', 'condition', 'poisoned')
      );
      const next = applyEntityDamaged(prev, makeDamaged('alice', 5, 14));
      expect(next.activeEntityId).toBe('alice');
      expect(next.round).toBe(3);
      expect(next.entityStatuses.get('alice')).toHaveLength(1);
    });
  });

  describe('applyStatusApplied', () => {
    it('appends a new condition to the entity status list', () => {
      const prev = createEmptyEncounterState();
      const after = applyStatusApplied(
        prev,
        makeStatusApplied('alice', 'dnd5e', 'condition', 'poisoned', 'Poisoned')
      );
      const list = after.entityStatuses.get('alice');
      expect(list).toHaveLength(1);
      expect(list?.[0].source.id).toBe('poisoned');
      expect(list?.[0].displayName).toBe('Poisoned');
    });

    it('replaces an existing condition with the same source ref', () => {
      let state = createEmptyEncounterState();
      state = applyStatusApplied(
        state,
        makeStatusApplied('alice', 'dnd5e', 'condition', 'poisoned', 'Old')
      );
      state = applyStatusApplied(
        state,
        makeStatusApplied(
          'alice',
          'dnd5e',
          'condition',
          'poisoned',
          'Refreshed'
        )
      );
      const list = state.entityStatuses.get('alice');
      expect(list).toHaveLength(1);
      expect(list?.[0].displayName).toBe('Refreshed');
    });

    it('stacks distinct conditions on the same entity', () => {
      let state = createEmptyEncounterState();
      state = applyStatusApplied(
        state,
        makeStatusApplied('alice', 'dnd5e', 'condition', 'poisoned')
      );
      state = applyStatusApplied(
        state,
        makeStatusApplied('alice', 'dnd5e', 'condition', 'frightened')
      );
      const list = state.entityStatuses.get('alice');
      expect(list).toHaveLength(2);
      expect(list?.map((s) => s.source.id).sort()).toEqual([
        'frightened',
        'poisoned',
      ]);
    });

    it('is a no-op when status is missing (defensive)', () => {
      const prev = createEmptyEncounterState();
      const event = { entityId: 'alice' } as unknown as StatusApplied;
      const next = applyStatusApplied(prev, event);
      expect(next).toBe(prev);
    });

    it('does not mutate the previous state', () => {
      const prev = createEmptyEncounterState();
      applyStatusApplied(
        prev,
        makeStatusApplied('alice', 'dnd5e', 'condition', 'poisoned')
      );
      expect(prev.entityStatuses.size).toBe(0);
    });

    it('captures sourceEntityId when present', () => {
      const event = {
        entityId: 'alice',
        status: {
          source: { module: 'dnd5e', type: 'condition', id: 'poisoned' },
          displayName: 'Poisoned',
        },
        sourceEntityId: 'goblin-1',
      } as unknown as StatusApplied;
      const after = applyStatusApplied(createEmptyEncounterState(), event);
      expect(after.entityStatuses.get('alice')?.[0].sourceEntityId).toBe(
        'goblin-1'
      );
    });

    it('collapses a duplicate re-delivered event to a single entry (toolkit#743 hardening)', () => {
      // Guards against the re-Dodge anomaly under investigation in
      // toolkit#743: if the same StatusApplied fires twice in a row, the
      // entity must end up with exactly one badge, not two.
      const event = makeStatusApplied(
        'alice',
        'dnd5e',
        'condition',
        'dodging',
        'Dodging'
      );
      let state = applyStatusApplied(createEmptyEncounterState(), event);
      state = applyStatusApplied(state, event);
      const list = state.entityStatuses.get('alice');
      expect(list).toHaveLength(1);
      expect(list?.[0].displayName).toBe('Dodging');
    });
  });

  describe('applyStatusRemoved', () => {
    it('removes the condition matching the source ref', () => {
      let state = applyStatusApplied(
        createEmptyEncounterState(),
        makeStatusApplied('alice', 'dnd5e', 'condition', 'poisoned')
      );
      state = applyStatusRemoved(
        state,
        makeStatusRemoved('alice', 'dnd5e', 'condition', 'poisoned')
      );
      expect(state.entityStatuses.get('alice')).toBeUndefined();
    });

    it('leaves other conditions on the same entity untouched', () => {
      let state = applyStatusApplied(
        createEmptyEncounterState(),
        makeStatusApplied('alice', 'dnd5e', 'condition', 'poisoned')
      );
      state = applyStatusApplied(
        state,
        makeStatusApplied('alice', 'dnd5e', 'condition', 'frightened')
      );
      state = applyStatusRemoved(
        state,
        makeStatusRemoved('alice', 'dnd5e', 'condition', 'poisoned')
      );
      const list = state.entityStatuses.get('alice');
      expect(list).toHaveLength(1);
      expect(list?.[0].source.id).toBe('frightened');
    });

    it('is a no-op (idempotent) when no matching entry exists', () => {
      let state = applyStatusApplied(
        createEmptyEncounterState(),
        makeStatusApplied('alice', 'dnd5e', 'condition', 'poisoned')
      );
      const before = state;
      state = applyStatusRemoved(
        state,
        makeStatusRemoved('alice', 'dnd5e', 'condition', 'frightened')
      );
      expect(state).toBe(before);
    });

    it('is a no-op when the entity has no tracked statuses', () => {
      const prev = createEmptyEncounterState();
      const next = applyStatusRemoved(
        prev,
        makeStatusRemoved('alice', 'dnd5e', 'condition', 'poisoned')
      );
      expect(next).toBe(prev);
    });

    it('is a no-op when statusSource is missing (defensive)', () => {
      const prev = createEmptyEncounterState();
      const event = { entityId: 'alice' } as unknown as StatusRemoved;
      const next = applyStatusRemoved(prev, event);
      expect(next).toBe(prev);
    });

    it('does not mutate the previous state', () => {
      const prev = applyStatusApplied(
        createEmptyEncounterState(),
        makeStatusApplied('alice', 'dnd5e', 'condition', 'poisoned')
      );
      const beforeList = prev.entityStatuses.get('alice');
      applyStatusRemoved(
        prev,
        makeStatusRemoved('alice', 'dnd5e', 'condition', 'poisoned')
      );
      expect(prev.entityStatuses.get('alice')).toBe(beforeList);
      expect(prev.entityStatuses.get('alice')).toHaveLength(1);
    });
  });

  describe('applyModeChanged', () => {
    it('updates the mode field to the new value', () => {
      const prev = createEmptyEncounterState();
      const after = applyModeChanged(
        prev,
        makeModeChanged(EncounterMode.FREE_ROAM, EncounterMode.TURN_BASED)
      );
      expect(after.mode).toBe(EncounterMode.TURN_BASED);
    });

    it('is idempotent when mode is unchanged (returns same reference)', () => {
      let state = applyModeChanged(
        createEmptyEncounterState(),
        makeModeChanged(EncounterMode.UNSPECIFIED, EncounterMode.TURN_BASED)
      );
      const before = state;
      state = applyModeChanged(
        state,
        makeModeChanged(EncounterMode.TURN_BASED, EncounterMode.TURN_BASED)
      );
      expect(state).toBe(before);
    });

    it('does not touch HP, statuses, activeEntityId, round', () => {
      let prev = createEmptyEncounterState();
      prev = applyEntityDamaged(prev, makeDamaged('alice', 8, 14));
      prev = applyStatusApplied(
        prev,
        makeStatusApplied('alice', 'dnd5e', 'condition', 'poisoned')
      );
      prev = applyTurnStarted(prev, makeTurnStarted('alice', 2));

      const next = applyModeChanged(
        prev,
        makeModeChanged(EncounterMode.TURN_BASED, EncounterMode.FREE_ROAM)
      );
      expect(next.mode).toBe(EncounterMode.FREE_ROAM);
      expect(next.entityHP.get('alice')).toEqual({ current: 8, max: 14 });
      expect(next.entityStatuses.get('alice')).toHaveLength(1);
      expect(next.activeEntityId).toBe('alice');
      expect(next.round).toBe(2);
    });

    it('does not mutate the previous state', () => {
      const prev = createEmptyEncounterState();
      applyModeChanged(
        prev,
        makeModeChanged(EncounterMode.UNSPECIFIED, EncounterMode.TURN_BASED)
      );
      expect(prev.mode).toBe(EncounterMode.UNSPECIFIED);
    });
  });

  describe('applyTurnStarted', () => {
    it('sets activeEntityId and round', () => {
      const prev = createEmptyEncounterState();
      const after = applyTurnStarted(prev, makeTurnStarted('char-alice', 1));
      expect(after.activeEntityId).toBe('char-alice');
      expect(after.round).toBe(1);
    });

    it('updates the active actor on subsequent turns', () => {
      let state = createEmptyEncounterState();
      state = applyTurnStarted(state, makeTurnStarted('char-alice', 1));
      state = applyTurnStarted(state, makeTurnStarted('goblin-1', 1));
      expect(state.activeEntityId).toBe('goblin-1');
      expect(state.round).toBe(1);
    });

    it('advances the round when the turn cycle wraps', () => {
      let state = applyTurnStarted(
        createEmptyEncounterState(),
        makeTurnStarted('char-alice', 1)
      );
      state = applyTurnStarted(state, makeTurnStarted('char-alice', 2));
      expect(state.round).toBe(2);
    });

    it('is idempotent on a same-actor / same-round event (returns same reference)', () => {
      const prev = applyTurnStarted(
        createEmptyEncounterState(),
        makeTurnStarted('char-alice', 1)
      );
      const next = applyTurnStarted(prev, makeTurnStarted('char-alice', 1));
      expect(next).toBe(prev);
    });

    it('does not touch HP, statuses, mode', () => {
      let prev = createEmptyEncounterState();
      prev = applyEntityDamaged(prev, makeDamaged('alice', 8, 14));
      prev = applyStatusApplied(
        prev,
        makeStatusApplied('alice', 'dnd5e', 'condition', 'poisoned')
      );
      prev = applyModeChanged(
        prev,
        makeModeChanged(EncounterMode.UNSPECIFIED, EncounterMode.TURN_BASED)
      );

      const next = applyTurnStarted(prev, makeTurnStarted('char-alice', 1));
      expect(next.entityHP.get('alice')).toEqual({ current: 8, max: 14 });
      expect(next.entityStatuses.get('alice')).toHaveLength(1);
      expect(next.mode).toBe(EncounterMode.TURN_BASED);
    });
  });

  describe('applyTurnEnded', () => {
    it('does not clear activeEntityId or round (TurnStarted is authoritative)', () => {
      // Per the reducer doc: clearing here would race the TurnStarted that
      // follows on the wire and cause UI flicker. TurnEnded is currently a
      // no-op on local state.
      let state = applyTurnStarted(
        createEmptyEncounterState(),
        makeTurnStarted('char-alice', 2)
      );
      const before = state;
      state = applyTurnEnded(state);
      expect(state).toBe(before);
      expect(state.activeEntityId).toBe('char-alice');
      expect(state.round).toBe(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Wave 2.8 display fixes (#397, #399)
// ---------------------------------------------------------------------------

describe('applyEntityMetaFromAppeared', () => {
  it('stores type and monsterRefId for a monster entity', () => {
    const prev = createEmptyEncounterState();
    const after = applyEntityMetaFromAppeared(
      prev,
      'goblin-1',
      EntityTypeV2.MONSTER,
      'goblin',
      undefined,
      undefined
    );
    const meta = after.entityMeta.get('goblin-1');
    expect(meta?.type).toBe(EntityTypeV2.MONSTER);
    expect(meta?.monsterRefId).toBe('goblin');
  });

  it('stores type without monsterRefId for a character entity', () => {
    const prev = createEmptyEncounterState();
    const after = applyEntityMetaFromAppeared(
      prev,
      'char-alice',
      EntityTypeV2.CHARACTER,
      undefined,
      undefined,
      undefined
    );
    const meta = after.entityMeta.get('char-alice');
    expect(meta?.type).toBe(EntityTypeV2.CHARACTER);
    expect(meta?.monsterRefId).toBeUndefined();
  });

  it('seeds entityHP when initialHP is provided', () => {
    const prev = createEmptyEncounterState();
    const after = applyEntityMetaFromAppeared(
      prev,
      'goblin-1',
      EntityTypeV2.MONSTER,
      'goblin',
      { current: 7, max: 7 },
      undefined
    );
    expect(after.entityHP.get('goblin-1')).toEqual({ current: 7, max: 7 });
  });

  it('does not touch entityHP when initialHP is undefined', () => {
    const prev = createEmptyEncounterState();
    const after = applyEntityMetaFromAppeared(
      prev,
      'goblin-1',
      EntityTypeV2.MONSTER,
      'goblin',
      undefined,
      undefined
    );
    expect(after.entityHP.size).toBe(0);
  });

  it('overwrites existing meta on re-appear (server is authoritative)', () => {
    let state = createEmptyEncounterState();
    state = applyEntityMetaFromAppeared(
      state,
      'goblin-1',
      EntityTypeV2.MONSTER,
      'goblin',
      undefined,
      undefined
    );
    state = applyEntityMetaFromAppeared(
      state,
      'goblin-1',
      EntityTypeV2.MONSTER,
      'hobgoblin',
      { current: 11, max: 11 },
      undefined
    );
    expect(state.entityMeta.get('goblin-1')?.monsterRefId).toBe('hobgoblin');
    expect(state.entityHP.get('goblin-1')).toEqual({ current: 11, max: 11 });
  });

  it('does not mutate the previous state', () => {
    const prev = createEmptyEncounterState();
    applyEntityMetaFromAppeared(
      prev,
      'goblin-1',
      EntityTypeV2.MONSTER,
      'goblin',
      { current: 5, max: 7 },
      undefined
    );
    expect(prev.entityMeta.size).toBe(0);
    expect(prev.entityHP.size).toBe(0);
  });

  it('preserves other entity meta entries', () => {
    let state = createEmptyEncounterState();
    state = applyEntityMetaFromAppeared(
      state,
      'char-alice',
      EntityTypeV2.CHARACTER,
      undefined,
      undefined,
      undefined
    );
    state = applyEntityMetaFromAppeared(
      state,
      'goblin-1',
      EntityTypeV2.MONSTER,
      'goblin',
      undefined,
      undefined
    );
    expect(state.entityMeta.size).toBe(2);
    expect(state.entityMeta.get('char-alice')?.type).toBe(
      EntityTypeV2.CHARACTER
    );
    expect(state.entityMeta.get('goblin-1')?.type).toBe(EntityTypeV2.MONSTER);
  });

  it('seeds entityAC from v2 Entity.armor_class', () => {
    const prev = createEmptyEncounterState();
    const after = applyEntityMetaFromAppeared(
      prev,
      'char-charli',
      EntityTypeV2.CHARACTER,
      undefined,
      { current: 12, max: 12 },
      15
    );
    expect(after.entityAC.get('char-charli')).toBe(15);
  });

  it('does not touch entityAC when initialAC is undefined', () => {
    const prev = createEmptyEncounterState();
    const after = applyEntityMetaFromAppeared(
      prev,
      'char-charli',
      EntityTypeV2.CHARACTER,
      undefined,
      undefined,
      undefined
    );
    expect(after.entityAC.has('char-charli')).toBe(false);
  });
});

describe('applyV2SnapshotTurnState', () => {
  it('sets initiativeOrder, activeEntityId, round, and mode from snapshot turn state', () => {
    const prev = createEmptyEncounterState();
    const after = applyV2SnapshotTurnState(
      prev,
      EncounterMode.TURN_BASED,
      create(TurnStateSchemaV2, {
        initiativeOrder: ['char-alice', 'goblin-1'],
        activeEntityId: 'char-alice',
        round: 1,
      })
    );
    expect(after.initiativeOrder).toEqual(['char-alice', 'goblin-1']);
    expect(after.activeEntityId).toBe('char-alice');
    expect(after.round).toBe(1);
    expect(after.mode).toBe(EncounterMode.TURN_BASED);
  });

  it('updates mode and clears combat fields when turnState is undefined', () => {
    // When the snapshot indicates a non-TURN_BASED mode (or TURN_BASED without
    // a turnState), combat fields are cleared to prevent stale initiative data.
    const prev = createEmptyEncounterState();
    const after = applyV2SnapshotTurnState(
      prev,
      EncounterMode.FREE_ROAM,
      undefined
    );
    expect(after.mode).toBe(EncounterMode.FREE_ROAM);
    expect(after.initiativeOrder).toEqual([]);
    expect(after.activeEntityId).toBe('');
    expect(after.round).toBe(0);
  });

  it('clears stale combat fields when transitioning out of TURN_BASED via snapshot', () => {
    // Regression guard: a prior combat session sets initiative/active/round;
    // a FREE_ROAM snapshot must clear those so the UI does not show old data.
    let state = createEmptyEncounterState();
    state = applyV2SnapshotTurnState(
      state,
      EncounterMode.TURN_BASED,
      create(TurnStateSchemaV2, {
        initiativeOrder: ['char-alice', 'goblin-1'],
        activeEntityId: 'char-alice',
        round: 2,
      })
    );
    const after = applyV2SnapshotTurnState(
      state,
      EncounterMode.FREE_ROAM,
      undefined
    );
    expect(after.mode).toBe(EncounterMode.FREE_ROAM);
    expect(after.initiativeOrder).toEqual([]);
    expect(after.activeEntityId).toBe('');
    expect(after.round).toBe(0);
  });

  it('returns same reference when mode and turnState are both unchanged (no-op)', () => {
    const prev = createEmptyEncounterState();
    // prev.mode is UNSPECIFIED and turnState is undefined — no change
    const after = applyV2SnapshotTurnState(
      prev,
      EncounterMode.UNSPECIFIED,
      undefined
    );
    expect(after).toBe(prev);
  });

  it('does not touch HP, entityStatuses, or entity map', () => {
    let prev = createEmptyEncounterState();
    prev = applyEntityDamaged(prev, makeDamaged('goblin-1', 5, 7));
    prev = applyStatusApplied(
      prev,
      makeStatusApplied('char-alice', 'dnd5e', 'condition', 'poisoned')
    );
    const after = applyV2SnapshotTurnState(
      prev,
      EncounterMode.TURN_BASED,
      create(TurnStateSchemaV2, {
        initiativeOrder: ['char-alice', 'goblin-1'],
        activeEntityId: 'char-alice',
        round: 1,
      })
    );
    expect(after.entityHP.get('goblin-1')).toEqual({ current: 5, max: 7 });
    expect(after.entityStatuses.get('char-alice')).toHaveLength(1);
  });

  it('does not mutate the previous state', () => {
    const prev = createEmptyEncounterState();
    applyV2SnapshotTurnState(
      prev,
      EncounterMode.TURN_BASED,
      create(TurnStateSchemaV2, {
        initiativeOrder: ['goblin-1'],
        activeEntityId: 'goblin-1',
        round: 1,
      })
    );
    expect(prev.initiativeOrder).toEqual([]);
    expect(prev.mode).toBe(EncounterMode.UNSPECIFIED);
  });

  // TakeAction wave (#426): the snapshot seeds the server-authored menu/economy
  // so it renders at turn start, before the first TurnStateChanged push.
  it('seeds turnState (menu + economy) from the snapshot turn state', () => {
    const prev = createEmptyEncounterState();
    const turnState = create(TurnStateSchemaV2, {
      initiativeOrder: ['char-alice'],
      activeEntityId: 'char-alice',
      round: 1,
      economy: { actionsRemaining: 1, bonusActionsRemaining: 1 },
      availableActions: [
        create(AvailableActionSchema, {
          ref: { module: 'dnd5e', type: 'combat_abilities', id: 'attack' },
          displayName: 'Attack',
          available: true,
          economySlot: EconomySlot.ACTION,
          targetKind: TargetKind.SINGLE_ENTITY,
        }),
      ],
    });
    const after = applyV2SnapshotTurnState(
      prev,
      EncounterMode.TURN_BASED,
      turnState
    );
    expect(after.turnState?.availableActions).toHaveLength(1);
    expect(after.turnState?.economy?.actionsRemaining).toBe(1);
  });

  it('clears turnState when leaving TURN_BASED', () => {
    const seeded = applyV2SnapshotTurnState(
      createEmptyEncounterState(),
      EncounterMode.TURN_BASED,
      create(TurnStateSchemaV2, {
        activeEntityId: 'char-alice',
        round: 1,
        availableActions: [],
      })
    );
    const after = applyV2SnapshotTurnState(
      seeded,
      EncounterMode.FREE_ROAM,
      undefined
    );
    expect(after.turnState).toBeNull();
  });
});

describe('applyTurnStateChanged', () => {
  it('swaps in the server-authored TurnState wholesale', () => {
    const prev = createEmptyEncounterState();
    const turnState = create(TurnStateSchemaV2, {
      activeEntityId: 'char-alice',
      round: 2,
      economy: { actionsRemaining: 0, bonusActionsRemaining: 1 },
      availableActions: [
        create(AvailableActionSchema, {
          ref: { module: 'dnd5e', type: 'combat_abilities', id: 'attack' },
          displayName: 'Attack',
          available: false,
          unavailableReason: 'no action remaining',
          economySlot: EconomySlot.ACTION,
          targetKind: TargetKind.SINGLE_ENTITY,
        }),
      ],
    });
    const after = applyTurnStateChanged(prev, turnState);
    expect(after.turnState?.economy?.actionsRemaining).toBe(0);
    expect(after.turnState?.availableActions[0]?.available).toBe(false);
    expect(after.turnState?.availableActions[0]?.unavailableReason).toBe(
      'no action remaining'
    );
  });

  it('is a no-op (returns prev) when turnState is undefined', () => {
    const prev = createEmptyEncounterState();
    expect(applyTurnStateChanged(prev, undefined)).toBe(prev);
  });

  it('does not mutate the previous state', () => {
    const prev = createEmptyEncounterState();
    applyTurnStateChanged(
      prev,
      create(TurnStateSchemaV2, { availableActions: [] })
    );
    expect(prev.turnState).toBeNull();
  });
});

describe('applyEntityAppearedBatch', () => {
  it('applies multiple entities in one call', () => {
    const prev = createEmptyEncounterState();
    const after = applyEntityAppearedBatch(prev, [
      {
        entity: makeTestEntity('char-alice', { x: 0, y: 0, z: 0 }),
        type: EntityTypeV2.CHARACTER,
        monsterRefId: undefined,
        initialHP: undefined,
        initialAC: undefined,
      },
      {
        entity: makeTestEntity('goblin-1', { x: 1, y: 0, z: -1 }),
        type: EntityTypeV2.MONSTER,
        monsterRefId: 'goblin',
        initialHP: { current: 7, max: 7 },
        initialAC: undefined,
      },
    ]);
    expect(after.entities.size).toBe(2);
    expect(after.entityMeta.get('char-alice')?.type).toBe(
      EntityTypeV2.CHARACTER
    );
    expect(after.entityMeta.get('goblin-1')?.monsterRefId).toBe('goblin');
    expect(after.entityHP.get('goblin-1')).toEqual({ current: 7, max: 7 });
    expect(after.entityHP.has('char-alice')).toBe(false);
  });

  it('is a no-op on empty array (returns same reference)', () => {
    const prev = createEmptyEncounterState();
    const after = applyEntityAppearedBatch(prev, []);
    expect(after).toBe(prev);
  });

  it('does not mutate the previous state', () => {
    const prev = createEmptyEncounterState();
    applyEntityAppearedBatch(prev, [
      {
        entity: makeTestEntity('goblin-1', { x: 1, y: 0, z: -1 }),
        type: EntityTypeV2.MONSTER,
        monsterRefId: 'goblin',
        initialHP: { current: 7, max: 7 },
        initialAC: undefined,
      },
    ]);
    expect(prev.entities.size).toBe(0);
    expect(prev.entityMeta.size).toBe(0);
    expect(prev.entityHP.size).toBe(0);
  });

  it('sets ghost=false on all batch entities', () => {
    // applyEntityAppearedBatch should clear ghost just like applyEntityAppeared
    const entity = makeTestEntity('mover', { x: 0, y: 0, z: 0 });
    let state = mergeEntityUpdates(createEmptyEncounterState(), [entity]);
    state = applyEntityDisappeared(state, 'mover', { q: 1, r: -1, s: 0 });
    expect(state.entities.get('mover')?.ghost).toBe(true);

    state = applyEntityAppearedBatch(state, [
      {
        entity: makeTestEntity('mover', { x: 5, y: 0, z: -5 }),
        type: EntityTypeV2.CHARACTER,
        monsterRefId: undefined,
        initialHP: undefined,
        initialAC: undefined,
      },
    ]);
    expect(state.entities.get('mover')?.ghost).toBeFalsy();
  });

  it('seeds entityAC from initialAC in batch entries', () => {
    const prev = createEmptyEncounterState();
    const after = applyEntityAppearedBatch(prev, [
      {
        entity: makeTestEntity('char-charli', { x: 0, y: 0, z: 0 }),
        type: EntityTypeV2.CHARACTER,
        monsterRefId: undefined,
        initialHP: { current: 12, max: 12 },
        initialAC: 15,
      },
      {
        entity: makeTestEntity('goblin-1', { x: 1, y: 0, z: -1 }),
        type: EntityTypeV2.MONSTER,
        monsterRefId: 'goblin',
        initialHP: { current: 7, max: 7 },
        initialAC: 13,
      },
    ]);
    expect(after.entityAC.get('char-charli')).toBe(15);
    expect(after.entityAC.get('goblin-1')).toBe(13);
  });
});

describe('createEmptyEncounterState — new Wave 2.8 display fields', () => {
  it('initializes entityMeta as empty Map', () => {
    const state = createEmptyEncounterState();
    expect(state.entityMeta).toBeInstanceOf(Map);
    expect(state.entityMeta.size).toBe(0);
  });

  it('initializes initiativeOrder as empty array', () => {
    const state = createEmptyEncounterState();
    expect(state.initiativeOrder).toEqual([]);
  });
});

describe('applySnapshotToState — entityMeta + initiativeOrder delta preservation', () => {
  it('preserves entityMeta across same-encounter v1 snapshot', () => {
    let state = applySnapshotToState(makeSnapshot({ encounterId: 'enc-1' }));
    state = applyEntityMetaFromAppeared(
      state,
      'goblin-1',
      EntityTypeV2.MONSTER,
      'goblin',
      { current: 7, max: 7 },
      undefined
    );

    const refreshed = applySnapshotToState(
      makeSnapshot({ encounterId: 'enc-1' }),
      state
    );

    expect(refreshed.entityMeta.get('goblin-1')?.monsterRefId).toBe('goblin');
  });

  it('preserves initiativeOrder across same-encounter v1 snapshot', () => {
    let state = applySnapshotToState(makeSnapshot({ encounterId: 'enc-1' }));
    state = applyV2SnapshotTurnState(
      state,
      EncounterMode.TURN_BASED,
      create(TurnStateSchemaV2, {
        initiativeOrder: ['char-alice', 'goblin-1'],
        activeEntityId: 'char-alice',
        round: 1,
      })
    );

    const refreshed = applySnapshotToState(
      makeSnapshot({ encounterId: 'enc-1' }),
      state
    );

    expect(refreshed.initiativeOrder).toEqual(['char-alice', 'goblin-1']);
  });

  it('resets entityMeta and initiativeOrder on encounter switch', () => {
    let state = applySnapshotToState(makeSnapshot({ encounterId: 'enc-1' }));
    state = applyEntityMetaFromAppeared(
      state,
      'goblin-1',
      EntityTypeV2.MONSTER,
      'goblin',
      undefined,
      undefined
    );
    state = applyV2SnapshotTurnState(
      state,
      EncounterMode.TURN_BASED,
      create(TurnStateSchemaV2, {
        initiativeOrder: ['char-alice', 'goblin-1'],
        activeEntityId: 'char-alice',
        round: 1,
      })
    );

    const switched = applySnapshotToState(
      makeSnapshot({ encounterId: 'enc-2' }),
      state
    );

    expect(switched.entityMeta.size).toBe(0);
    expect(switched.initiativeOrder).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Wave 2.9 pending-prompt reducer
// ---------------------------------------------------------------------------

describe('Wave 2.9 setPendingPromptReducer', () => {
  const makeSkillCheckPrompt = () =>
    create(InputRequiredSchema, {
      kind: {
        case: 'skillCheck',
        value: create(SkillCheckPromptSchema, {
          dc: 12,
          ability: 'DEX',
        }),
      },
    });

  it('starts with pendingPrompt=null in empty state', () => {
    const state = createEmptyEncounterState();
    expect(state.pendingPrompt).toBeNull();
  });

  it('sets pendingPrompt when passed a prompt', () => {
    const prompt = makeSkillCheckPrompt();
    const prev = createEmptyEncounterState();
    const next = setPendingPromptReducer(prev, prompt);
    expect(next.pendingPrompt).toBe(prompt);
  });

  it('clears pendingPrompt when passed null', () => {
    const prompt = makeSkillCheckPrompt();
    let state = createEmptyEncounterState();
    state = setPendingPromptReducer(state, prompt);
    expect(state.pendingPrompt).not.toBeNull();

    const cleared = setPendingPromptReducer(state, null);
    expect(cleared.pendingPrompt).toBeNull();
  });

  it('returns the same reference when prompt is unchanged (idempotent)', () => {
    const prompt = makeSkillCheckPrompt();
    const prev = setPendingPromptReducer(createEmptyEncounterState(), prompt);
    const next = setPendingPromptReducer(prev, prompt);
    expect(next).toBe(prev);
  });

  it('null → null also returns the same reference', () => {
    const prev = createEmptyEncounterState();
    const next = setPendingPromptReducer(prev, null);
    expect(next).toBe(prev);
  });

  it('does not mutate the previous state', () => {
    const prev = createEmptyEncounterState();
    const prompt = makeSkillCheckPrompt();
    setPendingPromptReducer(prev, prompt);
    expect(prev.pendingPrompt).toBeNull();
  });

  it('does not touch unrelated state fields (entities, mode, round)', () => {
    let state = createEmptyEncounterState();
    state = applyTurnStarted(state, {
      entityId: 'char-alice',
      round: 2,
    } as unknown as TurnStarted);
    const prompt = makeSkillCheckPrompt();
    const next = setPendingPromptReducer(state, prompt);
    expect(next.activeEntityId).toBe('char-alice');
    expect(next.round).toBe(2);
    expect(next.pendingPrompt).toBe(prompt);
  });

  it('pendingPrompt is preserved across same-encounter snapshot', () => {
    const prompt = makeSkillCheckPrompt();
    let state = createEmptyEncounterState();
    state = applySnapshotToState(makeSnapshot({ encounterId: 'enc-1' }), state);
    state = setPendingPromptReducer(state, prompt);
    expect(state.pendingPrompt).toBe(prompt);

    const refreshed = applySnapshotToState(
      makeSnapshot({ encounterId: 'enc-1' }),
      state
    );
    expect(refreshed.pendingPrompt).toBe(prompt);
  });

  it('pendingPrompt is cleared on encounter switch', () => {
    const prompt = makeSkillCheckPrompt();
    let state = createEmptyEncounterState();
    state = applySnapshotToState(makeSnapshot({ encounterId: 'enc-1' }), state);
    state = setPendingPromptReducer(state, prompt);

    const switched = applySnapshotToState(
      makeSnapshot({ encounterId: 'enc-2' }),
      state
    );
    expect(switched.pendingPrompt).toBeNull();
  });

  // ---------- Wave 2.10: death + encounter resolution -------------------------

  describe('applyEntityDied', () => {
    it('returns prev unchanged — entity stays until EntityRemoved', () => {
      const state = createEmptyEncounterState();
      const event: EntityDied = {
        entityId: 'goblin-1',
        killerEntityId: 'char-alice',
      } as unknown as EntityDied;
      const next = applyEntityDied(state, event);
      expect(next).toBe(state);
    });

    it('does not remove entity from entities map', () => {
      let state = createEmptyEncounterState();
      const entity = create(EntityStateSchema, { entityId: 'goblin-1' });
      state = applyEntityAppeared(state, entity);
      const event: EntityDied = {
        entityId: 'goblin-1',
      } as unknown as EntityDied;
      const next = applyEntityDied(state, event);
      expect(next.entities.has('goblin-1')).toBe(true);
    });
  });

  describe('applyEntityRemoved', () => {
    it('removes an existing entity from the entities map', () => {
      let state = createEmptyEncounterState();
      const entity = create(EntityStateSchema, { entityId: 'goblin-1' });
      state = applyEntityAppeared(state, entity);
      expect(state.entities.has('goblin-1')).toBe(true);

      const event: EntityRemoved = {
        entityId: 'goblin-1',
        reason: 'destroyed',
      } as unknown as EntityRemoved;
      const next = applyEntityRemoved(state, event);
      expect(next.entities.has('goblin-1')).toBe(false);
    });

    it('is idempotent — no-op if entity is already missing', () => {
      const state = createEmptyEncounterState();
      const event: EntityRemoved = {
        entityId: 'goblin-1',
        reason: 'destroyed',
      } as unknown as EntityRemoved;
      const next = applyEntityRemoved(state, event);
      // Same reference means no new object allocation — truly a no-op.
      expect(next).toBe(state);
    });

    it('does not remove other entities when one is removed', () => {
      let state = createEmptyEncounterState();
      state = applyEntityAppeared(
        state,
        create(EntityStateSchema, { entityId: 'goblin-1' })
      );
      state = applyEntityAppeared(
        state,
        create(EntityStateSchema, { entityId: 'goblin-2' })
      );
      const event: EntityRemoved = {
        entityId: 'goblin-1',
        reason: 'destroyed',
      } as unknown as EntityRemoved;
      const next = applyEntityRemoved(state, event);
      expect(next.entities.has('goblin-1')).toBe(false);
      expect(next.entities.has('goblin-2')).toBe(true);
    });
  });

  describe('applyEncounterEnded', () => {
    it('sets encounterStatus to "ended" and stores reason', () => {
      const state = createEmptyEncounterState();
      const event: EncounterEnded = {
        reason: 'all hostiles defeated',
      } as unknown as EncounterEnded;
      const next = applyEncounterEnded(state, event);
      expect(next.encounterStatus).toBe('ended');
      expect(next.encounterEndedReason).toBe('all hostiles defeated');
    });

    it('is idempotent — returns same ref when already ended with same reason', () => {
      let state = createEmptyEncounterState();
      const event: EncounterEnded = {
        reason: 'all hostiles defeated',
      } as unknown as EncounterEnded;
      state = applyEncounterEnded(state, event);
      const second = applyEncounterEnded(state, event);
      expect(second).toBe(state);
    });

    it('updates reason when it changes (re-apply with different reason)', () => {
      let state = createEmptyEncounterState();
      state = applyEncounterEnded(state, {
        reason: 'all hostiles defeated',
      } as unknown as EncounterEnded);
      const next = applyEncounterEnded(state, {
        reason: 'players fled',
      } as unknown as EncounterEnded);
      expect(next.encounterStatus).toBe('ended');
      expect(next.encounterEndedReason).toBe('players fled');
    });

    it('createEmptyEncounterState defaults encounterStatus to "active"', () => {
      const state = createEmptyEncounterState();
      expect(state.encounterStatus).toBe('active');
      expect(state.encounterEndedReason).toBe('');
    });

    it('encounterStatus is preserved on same-encounter snapshot resync', () => {
      let state = createEmptyEncounterState();
      state = applySnapshotToState(
        makeSnapshot({ encounterId: 'enc-1' }),
        state
      );
      state = applyEncounterEnded(state, {
        reason: 'all hostiles defeated',
      } as unknown as EncounterEnded);

      const resynced = applySnapshotToState(
        makeSnapshot({ encounterId: 'enc-1' }),
        state
      );
      expect(resynced.encounterStatus).toBe('ended');
      expect(resynced.encounterEndedReason).toBe('all hostiles defeated');
    });

    it('encounterStatus is reset to "active" on encounter switch', () => {
      let state = createEmptyEncounterState();
      state = applySnapshotToState(
        makeSnapshot({ encounterId: 'enc-1' }),
        state
      );
      state = applyEncounterEnded(state, {
        reason: 'all hostiles defeated',
      } as unknown as EncounterEnded);

      const switched = applySnapshotToState(
        makeSnapshot({ encounterId: 'enc-2' }),
        state
      );
      expect(switched.encounterStatus).toBe('active');
      expect(switched.encounterEndedReason).toBe('');
    });
  });

  // Wave 2.11d reaction readiness reducer
  describe('setReactionReadyLocalReducer', () => {
    it('sets a reaction to ready for a new character', () => {
      const prev = createEmptyEncounterState();
      const next = setReactionReadyLocalReducer(
        prev,
        'char-wendy',
        'dnd5e:spells:shield',
        true
      );
      expect(
        next.reactionReadiness.get('char-wendy')?.get('dnd5e:spells:shield')
      ).toBe(true);
    });

    it('unreadies a previously-readied reaction', () => {
      let state = createEmptyEncounterState();
      state = setReactionReadyLocalReducer(
        state,
        'char-wendy',
        'dnd5e:spells:shield',
        true
      );
      state = setReactionReadyLocalReducer(
        state,
        'char-wendy',
        'dnd5e:spells:shield',
        false
      );
      expect(
        state.reactionReadiness.get('char-wendy')?.get('dnd5e:spells:shield')
      ).toBe(false);
    });

    it('preserves other characters readiness when toggling one character', () => {
      let state = createEmptyEncounterState();
      state = setReactionReadyLocalReducer(
        state,
        'char-fighter',
        'dnd5e:conditions:opportunity_attack',
        true
      );
      state = setReactionReadyLocalReducer(
        state,
        'char-wendy',
        'dnd5e:spells:shield',
        true
      );

      expect(
        state.reactionReadiness
          .get('char-fighter')
          ?.get('dnd5e:conditions:opportunity_attack')
      ).toBe(true);
      expect(
        state.reactionReadiness.get('char-wendy')?.get('dnd5e:spells:shield')
      ).toBe(true);
    });

    it('preserves other reactions on the same character', () => {
      let state = createEmptyEncounterState();
      state = setReactionReadyLocalReducer(
        state,
        'char-wendy',
        'dnd5e:conditions:opportunity_attack',
        true
      );
      state = setReactionReadyLocalReducer(
        state,
        'char-wendy',
        'dnd5e:spells:shield',
        true
      );

      const wendyMap = state.reactionReadiness.get('char-wendy');
      expect(wendyMap?.get('dnd5e:conditions:opportunity_attack')).toBe(true);
      expect(wendyMap?.get('dnd5e:spells:shield')).toBe(true);
    });

    it('returns prev unchanged when value is identical (idempotent)', () => {
      let state = createEmptyEncounterState();
      state = setReactionReadyLocalReducer(
        state,
        'char-wendy',
        'dnd5e:spells:shield',
        true
      );
      const same = setReactionReadyLocalReducer(
        state,
        'char-wendy',
        'dnd5e:spells:shield',
        true
      );
      expect(same).toBe(state);
    });

    it('readiness map is preserved across same-encounter snapshots', () => {
      let state = createEmptyEncounterState();
      state = applySnapshotToState(
        makeSnapshot({ encounterId: 'enc-1' }),
        state
      );
      state = setReactionReadyLocalReducer(
        state,
        'char-wendy',
        'dnd5e:spells:shield',
        true
      );

      const resynced = applySnapshotToState(
        makeSnapshot({ encounterId: 'enc-1' }),
        state
      );
      expect(
        resynced.reactionReadiness.get('char-wendy')?.get('dnd5e:spells:shield')
      ).toBe(true);
    });

    it('readiness map is reset on encounter switch', () => {
      let state = createEmptyEncounterState();
      state = applySnapshotToState(
        makeSnapshot({ encounterId: 'enc-1' }),
        state
      );
      state = setReactionReadyLocalReducer(
        state,
        'char-wendy',
        'dnd5e:spells:shield',
        true
      );

      const switched = applySnapshotToState(
        makeSnapshot({ encounterId: 'enc-2' }),
        state
      );
      expect(switched.reactionReadiness.size).toBe(0);
    });
  });
});
