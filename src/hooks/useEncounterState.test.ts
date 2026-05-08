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
  CombatStateSchema,
  DoorInfoSchema,
  EncounterStateDataSchema,
  type EntityState,
  EntityStateSchema,
  RoomLayoutSchema,
  TurnStateSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import {
  DungeonState,
  EntityType,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { describe, expect, it } from 'vitest';
import { hexKey } from '../utils/hexCoord';
import {
  applyDoorOpened,
  applyEntityAppeared,
  applyEntityDisappeared,
  applyHexRevealed,
  applySnapshotToState,
  createEmptyEncounterState,
  mergeEntityPosition,
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

      const switched = applySnapshotToState(
        makeSnapshot({ encounterId: 'enc-2' }),
        state
      );

      expect(switched.openDoors.size).toBe(0);
      expect(switched.revealedHexes.size).toBe(0);
    });

    it('starts with empty v2 delta state when prev is omitted (first snapshot)', () => {
      const state = applySnapshotToState(
        makeSnapshot({ encounterId: 'enc-1' })
      );
      expect(state.openDoors.size).toBe(0);
      expect(state.revealedHexes.size).toBe(0);
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
