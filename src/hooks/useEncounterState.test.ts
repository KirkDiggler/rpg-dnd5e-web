/**
 * Tests for useEncounterState pure state logic
 *
 * Tests the pure functions that power encounter state management. Trimmed
 * in slice 3 (rpg-dnd5e-web #447) alongside the source file: the deleted
 * v1alpha1 snapshot-replace functions (applySnapshotToState,
 * mergeEntityUpdates, updateCombatState) and the "v2 delta survives a v1
 * snapshot" regression coverage they existed for are gone along with
 * LobbyView, their only caller.
 *
 * Part of the unified entity state refactor (rpg-dnd5e-web feat-unified-entity-state).
 */

import { create } from '@bufbuild/protobuf';
import { PositionSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/room_common_pb';
import {
  type EntityState,
  EntityStateSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import type {
  EncounterEnded,
  EntityDamaged,
  EntityDied,
  EntityRemoved,
  InitiativeRolled,
  ModeChanged,
  StatusApplied,
  StatusRemoved,
  TurnStarted,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';
import {
  AvailableActionSchema,
  EconomySlot,
  EncounterMode,
  EntityType,
  HexRecordSchema,
  HexState,
  InputRequiredSchema,
  PlacementSchema,
  SkillCheckPromptSchema,
  type StatusEffect,
  TargetKind,
  TurnStateSchema,
  PositionSchema as V2PositionSchema,
  type Wall,
  WallKind,
  WallSchema,
  ZoneSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { describe, expect, it } from 'vitest';
import { wallKey } from './dungeonMapGeometry';
import type {
  CharacterEquipment,
  EntityKnowledgeEntry,
  LocalEncounterState,
} from './useEncounterState';
import {
  applyCharacterEquipment,
  applyDoorOpened,
  applyEncounterEnded,
  applyEntityAppearedBatch,
  applyEntityDamaged,
  applyEntityDied,
  applyEntityKnowledgeBatch,
  applyEntityRemoved,
  applyHexRecordsMerged,
  applyInitiativeRolled,
  applyModeChanged,
  applySnapshotRegionState,
  applySnapshotTurnState,
  applyStatusApplied,
  applyStatusRemoved,
  applyTurnEnded,
  applyTurnStarted,
  applyTurnStateChanged,
  applyWallsRevealed,
  createEmptyEncounterState,
  facingByEntityIdFromHexes,
  hexesWithPosition,
  knowledgeStateForPosition,
  mergeEntityPosition,
  positionByEntityIdFromHexes,
  regionForHex,
  setPendingPromptReducer,
  setReactionReadyLocalReducer,
} from './useEncounterState';

/** Minimal CharacterEquipment fixture for equipment reducer tests
 * (rpg-dnd5e-web#571). */
function testEquipment(
  overrides?: Partial<CharacterEquipment>
): CharacterEquipment {
  return {
    equipped: {
      main_hand: { module: 'dnd5e', type: 'item', id: 'longsword' },
    },
    inventory: [
      {
        ref: { module: 'dnd5e', type: 'item', id: 'longsword' },
        name: 'Longsword',
        statLine: '1d8 slashing',
        iconKey: '',
        kind: 'weapon',
        slotKeys: ['main_hand', 'off_hand'],
        quantity: 1,
      },
    ],
    slots: [
      { key: 'main_hand', displayLabel: 'Main hand', accepts: ['weapon'] },
    ],
    armorClassDetail: { total: 16, note: '16 chain mail' },
    mainHandDamage: '1d8 slashing',
    ...overrides,
  };
}

function makeTestWall(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  kind: WallKind = WallKind.SOLID,
  id?: string
): Wall {
  return create(WallSchema, {
    from: create(V2PositionSchema, from),
    to: create(V2PositionSchema, to),
    kind,
    id,
  });
}

function makeTestHex(
  position: { x: number; y: number; z: number },
  zoneId = ''
) {
  return create(HexRecordSchema, {
    position: create(V2PositionSchema, position),
    zoneId,
  });
}

function makeTestZone(id: string, archetype = '') {
  return create(ZoneSchema, { id, name: id, archetype });
}

/**
 * Test-only scaffolding: seed a single entity into state the same way
 * `applyEntityAppearedBatch` does in production (the sole entity-population
 * path now that entities arrive only via SnapshotDelivered — there is no
 * live per-entity appear event). Mirrors the old `applyEntityAppeared`
 * singular reducer's "add/revive entity, clear ghost flag" semantics for
 * tests that just need an entity in state before exercising something else.
 */
function seedEntity(
  prev: LocalEncounterState,
  entity: EntityState
): LocalEncounterState {
  return applyEntityAppearedBatch(prev, [
    {
      entity,
      type: EntityType.UNSPECIFIED,
      monsterRefId: undefined,
      initialHP: undefined,
      initialAC: undefined,
    },
  ]);
}

describe('createEmptyEncounterState', () => {
  it('returns empty state with Maps and default values', () => {
    const state = createEmptyEncounterState();

    expect(state.encounterId).toBe('');
    expect(state.dungeonId).toBe('');
    expect(state.entities).toBeInstanceOf(Map);
    expect(state.entities.size).toBe(0);
    expect(state.revealedHexes).toBeInstanceOf(Map);
    expect(state.revealedHexes.size).toBe(0);
    expect(state.revealedHexKeys).toBeInstanceOf(Set);
    expect(state.revealedHexKeys.size).toBe(0);
    expect(state.walls).toBeInstanceOf(Map);
    expect(state.walls.size).toBe(0);
    expect(state.openDoors).toBeInstanceOf(Set);
    expect(state.openDoors.size).toBe(0);
    expect(state.entityHP).toBeInstanceOf(Map);
    expect(state.entityHP.size).toBe(0);
    expect(state.entityStatuses).toBeInstanceOf(Map);
    expect(state.entityStatuses.size).toBe(0);
    expect(state.mode).toBe(EncounterMode.UNSPECIFIED);
    expect(state.activeEntityId).toBe('');
    expect(state.round).toBe(0);
  });
});

describe('mergeEntityPosition', () => {
  it('updates position of an existing entity', () => {
    const prev = seedEntity(
      createEmptyEncounterState(),
      create(EntityStateSchema, { entityId: 'char-1' })
    );
    const newPos = create(PositionSchema, { x: 3, y: -1, z: -2 });

    const next = mergeEntityPosition(prev, 'char-1', newPos);

    expect(next.entities.get('char-1')?.position).toEqual(newPos);
  });

  it('preserves other fields on the updated entity', () => {
    // Seed an entity with non-position fields populated
    const seeded = create(EntityStateSchema, {
      entityId: 'char-1',
      currentHitPoints: 12,
      maxHitPoints: 20,
    });
    const prev = seedEntity(createEmptyEncounterState(), seeded);

    const newPos = create(PositionSchema, { x: 5, y: -3, z: -2 });
    const next = mergeEntityPosition(prev, 'char-1', newPos);

    const updated = next.entities.get('char-1');
    expect(updated?.position).toEqual(newPos);
    expect(updated?.currentHitPoints).toBe(12);
    expect(updated?.maxHitPoints).toBe(20);
  });

  it('returns prev unchanged when entity is not present', () => {
    const prev = seedEntity(
      createEmptyEncounterState(),
      create(EntityStateSchema, { entityId: 'char-1' })
    );
    const newPos = create(PositionSchema, { x: 1, y: 0, z: -1 });

    const next = mergeEntityPosition(prev, 'char-missing', newPos);

    // Same reference — pure no-op when entity isn't tracked
    expect(next).toBe(prev);
  });

  it('does not mutate the previous state', () => {
    const prev = seedEntity(
      createEmptyEncounterState(),
      create(EntityStateSchema, { entityId: 'char-1' })
    );
    const originalEntity = prev.entities.get('char-1');
    const newPos = create(PositionSchema, { x: 7, y: -3, z: -4 });

    mergeEntityPosition(prev, 'char-1', newPos);

    // Original state's entity reference unchanged
    expect(prev.entities.get('char-1')).toBe(originalEntity);
  });

  // rpg-dnd5e-web#542: movePath/moveSeq drive HexEntity's walk-clip
  // interpolation — mergeEntityPosition is the ONLY reducer that sets them
  // (see the field's doc comment on LocalEncounterState.entities).
  describe('path (rpg-dnd5e-web#542)', () => {
    it('stashes the path as movePath and bumps moveSeq from undefined to 1', () => {
      const prev = seedEntity(
        createEmptyEncounterState(),
        create(EntityStateSchema, { entityId: 'char-1' })
      );
      const path = [
        create(PositionSchema, { x: 0, y: 0, z: 0 }),
        create(PositionSchema, { x: 1, y: -1, z: 0 }),
      ];

      const next = mergeEntityPosition(prev, 'char-1', path[1], path);

      const updated = next.entities.get('char-1');
      expect(updated?.movePath).toEqual(path);
      expect(updated?.moveSeq).toBe(1);
    });

    it('increments moveSeq on each subsequent genuine move', () => {
      const prev = seedEntity(
        createEmptyEncounterState(),
        create(EntityStateSchema, { entityId: 'char-1' })
      );
      const posA = create(PositionSchema, { x: 1, y: -1, z: 0 });
      const posB = create(PositionSchema, { x: 2, y: -2, z: 0 });

      const afterFirst = mergeEntityPosition(prev, 'char-1', posA, [posA]);
      const afterSecond = mergeEntityPosition(afterFirst, 'char-1', posB, [
        posA,
        posB,
      ]);

      expect(afterFirst.entities.get('char-1')?.moveSeq).toBe(1);
      expect(afterSecond.entities.get('char-1')?.moveSeq).toBe(2);
    });

    it('bumps moveSeq again for a same-destination move (e.g. bounced off a wall)', () => {
      const prev = seedEntity(
        createEmptyEncounterState(),
        create(EntityStateSchema, { entityId: 'char-1' })
      );
      const pos = create(PositionSchema, { x: 1, y: -1, z: 0 });

      const afterFirst = mergeEntityPosition(prev, 'char-1', pos, [pos]);
      const afterSecond = mergeEntityPosition(afterFirst, 'char-1', pos, [pos]);

      expect(afterSecond.entities.get('char-1')?.moveSeq).toBe(2);
    });

    it('leaves movePath/moveSeq untouched when path is omitted (pre-#542 call sites)', () => {
      const prev = seedEntity(
        createEmptyEncounterState(),
        create(EntityStateSchema, { entityId: 'char-1' })
      );
      const newPos = create(PositionSchema, { x: 3, y: -1, z: -2 });

      const next = mergeEntityPosition(prev, 'char-1', newPos);

      const updated = next.entities.get('char-1');
      expect(updated?.position).toEqual(newPos);
      expect(updated?.movePath).toBeUndefined();
      expect(updated?.moveSeq).toBeUndefined();
    });

    it('leaves movePath/moveSeq untouched when path is an empty array', () => {
      const prev = seedEntity(
        createEmptyEncounterState(),
        create(EntityStateSchema, { entityId: 'char-1' })
      );
      const newPos = create(PositionSchema, { x: 3, y: -1, z: -2 });

      const next = mergeEntityPosition(prev, 'char-1', newPos, []);

      const updated = next.entities.get('char-1');
      expect(updated?.movePath).toBeUndefined();
      expect(updated?.moveSeq).toBeUndefined();
    });
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

// Snapshot-side StatusEffect stub — same {source, displayName} shape
// StatusApplied.status carries, since Entity.status_effects and
// StatusApplied.status are both the StatusEffect message (rpg-dnd5e-web#462).
function makeStatusEffect(
  module: string,
  type: string,
  id: string,
  displayName = id
): StatusEffect {
  return {
    source: { module, type, id },
    displayName,
  } as unknown as StatusEffect;
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

function makeInitiativeRolled(order: string[]): InitiativeRolled {
  return { order } as unknown as InitiativeRolled;
}

// ---------------------------------------------------------------------------
// v1alpha2 reducer additions
// ---------------------------------------------------------------------------

describe('v1alpha2 reducer additions', () => {
  describe('region identity', () => {
    it('replaces snapshot region truth and looks up a hex zone by coordinate', () => {
      const entrance = makeTestZone('entrance', 'entrance');
      const chamber = makeTestZone('chamber', 'chamber');
      const entranceHex = makeTestHex({ x: 0, y: 0, z: 0 }, 'entrance');
      const chamberHex = makeTestHex({ x: 1, y: -1, z: 0 }, 'chamber');
      const before = createEmptyEncounterState();
      const snapshot = applySnapshotRegionState(
        before,
        'crypt',
        [entrance, chamber],
        [entranceHex, chamberHex]
      );

      expect(snapshot.theme).toBe('crypt');
      expect(snapshot.zones.get('entrance')).toBe(entrance);
      expect(snapshot.revealedHexes.get('1,-1,0')).toBe(chamberHex);
      expect(regionForHex(snapshot, { q: 1, r: -1, s: 0 })).toEqual({
        theme: 'crypt',
        zone: chamber,
      });
      expect(before.zones.size).toBe(0);
      expect(before.revealedHexes.size).toBe(0);
    });

    it('replaces prior region truth wholesale on a second snapshot (reconnect)', () => {
      const entrance = makeTestZone('entrance', 'entrance');
      const chamber = makeTestZone('chamber', 'chamber');
      const entranceHex = makeTestHex({ x: 0, y: 0, z: 0 }, 'entrance');
      const chamberHex = makeTestHex({ x: 1, y: -1, z: 0 }, 'chamber');
      const first = applySnapshotRegionState(
        createEmptyEncounterState(),
        'crypt',
        [entrance, chamber],
        [entranceHex, chamberHex]
      );

      const second = applySnapshotRegionState(
        first,
        'cave',
        [chamber],
        [chamberHex]
      );

      expect(second.theme).toBe('cave');
      expect(second.zones.has('entrance')).toBe(false);
      expect(second.revealedHexes.has('0,0,0')).toBe(false);
      expect(second.revealedHexes.get('1,-1,0')).toBe(chamberHex);
      // The first snapshot's own result is untouched by the second call.
      expect(first.theme).toBe('crypt');
      expect(first.revealedHexes.has('0,0,0')).toBe(true);
    });

    it('returns only server metadata for missing and unknown zone data', () => {
      const unknown = makeTestZone('unknown', 'scrying-room');
      const unknownHex = makeTestHex({ x: 2, y: -1, z: -1 }, 'unknown');
      const unzonedHex = makeTestHex({ x: 3, y: -2, z: -1 });
      const state = applySnapshotRegionState(
        createEmptyEncounterState(),
        '',
        [unknown],
        [unknownHex, unzonedHex]
      );

      expect(regionForHex(state, { q: 2, r: -1, s: -1 })).toEqual({
        theme: undefined,
        zone: unknown,
      });
      expect(regionForHex(state, { q: 3, r: -2, s: -1 })).toEqual({
        theme: undefined,
        zone: undefined,
      });
      expect(regionForHex(state, { q: 99, r: -99, s: 0 })).toEqual({
        theme: undefined,
        zone: undefined,
      });
    });
  });

  describe('hexesWithPosition', () => {
    it('filters malformed hexes before they reach reveal merges or harness logs', () => {
      const positioned = makeTestHex({ x: 0, y: 0, z: 0 }, 'entrance');
      const malformed = create(HexRecordSchema, { zoneId: 'chamber' });

      expect(hexesWithPosition([positioned, malformed])).toEqual([positioned]);
    });
  });

  describe('applyWallsRevealed', () => {
    it('adds walls to the sticky map without dropping existing ones', () => {
      const wallA = makeTestWall({ x: 0, y: 0, z: 0 }, { x: 1, y: -1, z: 0 });
      const wallB = makeTestWall(
        { x: 2, y: -1, z: -1 },
        { x: 3, y: -2, z: -1 }
      );

      const after1 = applyWallsRevealed(createEmptyEncounterState(), [wallA]);
      expect(after1.walls.get(wallKey(wallA))).toEqual(wallA);

      const after2 = applyWallsRevealed(after1, [wallB]);
      expect(after2.walls.get(wallKey(wallA))).toEqual(wallA);
      expect(after2.walls.get(wallKey(wallB))).toEqual(wallB);
      expect(after2.walls.size).toBe(2);
    });

    it('is idempotent (same reference) on a re-delivered wall with unchanged kind', () => {
      const wall = makeTestWall({ x: 0, y: 0, z: 0 }, { x: 1, y: -1, z: 0 });
      const prev = applyWallsRevealed(createEmptyEncounterState(), [wall]);
      const after = applyWallsRevealed(prev, [wall]);
      expect(after).toBe(prev);
    });

    it('overwrites an entry whose kind changed (door open/close transitions)', () => {
      const closed = makeTestWall(
        { x: 0, y: 0, z: 0 },
        { x: 1, y: -1, z: 0 },
        WallKind.DOOR_CLOSED
      );
      const opened = makeTestWall(
        { x: 0, y: 0, z: 0 },
        { x: 1, y: -1, z: 0 },
        WallKind.DOOR_OPEN
      );

      const prev = applyWallsRevealed(createEmptyEncounterState(), [closed]);
      const after = applyWallsRevealed(prev, [opened]);
      expect(after).not.toBe(prev);
      expect(after.walls.get(wallKey(closed))?.kind).toBe(WallKind.DOOR_OPEN);
      expect(after.walls.size).toBe(1);
    });

    it('collapses a wall reported in either direction to the same key', () => {
      const forward = makeTestWall({ x: 0, y: 0, z: 0 }, { x: 1, y: -1, z: 0 });
      const reverse = makeTestWall({ x: 1, y: -1, z: 0 }, { x: 0, y: 0, z: 0 });

      const after = applyWallsRevealed(createEmptyEncounterState(), [
        forward,
        reverse,
      ]);
      expect(after.walls.size).toBe(1);
    });

    it('skips walls missing from/to (defensive)', () => {
      const malformed = create(WallSchema, { kind: WallKind.SOLID });
      const after = applyWallsRevealed(createEmptyEncounterState(), [
        malformed,
      ]);
      expect(after.walls.size).toBe(0);
    });

    it('is a no-op on an empty walls array', () => {
      const prev = createEmptyEncounterState();
      const after = applyWallsRevealed(prev, []);
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

    it('does not touch revealedHexes', () => {
      let state = applySnapshotRegionState(
        createEmptyEncounterState(),
        '',
        [],
        [makeTestHex({ x: 1, y: -1, z: 0 })]
      );
      const beforeOpen = state.revealedHexes;
      state = applyDoorOpened(state, 'door-east');
      expect(state.revealedHexes).toBe(beforeOpen);
      expect(state.revealedHexes.size).toBe(1);
    });

    it('flips the matching wall (Wall.id === doorEntityId) from DOOR_CLOSED to DOOR_OPEN', () => {
      // rpg-dnd5e-web#526: this is what makes the door's rendered pose
      // update live — verified against rpg-api's translate.go that the
      // live GeometryRevealed a door-open triggers carries no Walls today
      // (wallsToProto is snapshot-only), so this reducer is the only live
      // path to the pose flip until the next reconnect/snapshot.
      const closed = makeTestWall(
        { x: 0, y: 0, z: 0 },
        { x: 1, y: -1, z: 0 },
        WallKind.DOOR_CLOSED,
        'door-east'
      );
      const prev = applyWallsRevealed(createEmptyEncounterState(), [closed]);

      const after = applyDoorOpened(prev, 'door-east');

      expect(after.walls.get(wallKey(closed))?.kind).toBe(WallKind.DOOR_OPEN);
      expect(after.walls.get(wallKey(closed))?.id).toBe('door-east');
      expect(after.openDoors.has('door-east')).toBe(true);
    });

    it('leaves unrelated walls untouched when flipping the matching door', () => {
      const door = makeTestWall(
        { x: 0, y: 0, z: 0 },
        { x: 1, y: -1, z: 0 },
        WallKind.DOOR_CLOSED,
        'door-east'
      );
      const solid = makeTestWall({ x: 5, y: -5, z: 0 }, { x: 5, y: -5, z: 0 });
      const prev = applyWallsRevealed(createEmptyEncounterState(), [
        door,
        solid,
      ]);

      const after = applyDoorOpened(prev, 'door-east');

      expect(after.walls.get(wallKey(solid))).toBe(solid);
      expect(after.walls.size).toBe(2);
    });

    it('is a no-op wall-wise when no wall carries a matching id (unknown/not-yet-revealed door)', () => {
      const solid = makeTestWall({ x: 5, y: -5, z: 0 }, { x: 5, y: -5, z: 0 });
      const prev = applyWallsRevealed(createEmptyEncounterState(), [solid]);

      const after = applyDoorOpened(prev, 'door-not-in-walls-yet');

      expect(after.walls).toBe(prev.walls);
      expect(after.openDoors.has('door-not-in-walls-yet')).toBe(true);
    });

    it('is idempotent wall-wise: re-opening an already-DOOR_OPEN wall does not create a new walls Map', () => {
      const open = makeTestWall(
        { x: 0, y: 0, z: 0 },
        { x: 1, y: -1, z: 0 },
        WallKind.DOOR_OPEN,
        'door-east'
      );
      let state = applyWallsRevealed(createEmptyEncounterState(), [open]);
      state = applyDoorOpened(state, 'door-east'); // marks openDoors

      const beforeWalls = state.walls;
      const after = applyDoorOpened(state, 'door-east');

      expect(after.walls).toBe(beforeWalls);
      expect(after).toBe(state); // fully idempotent — same top-level reference
    });
  });

  describe('live hex knowledge merge (rpg-dnd5e-web#609)', () => {
    /** Seed a known entity's identity WITHOUT a position — mirrors what
     * applyEntityKnowledgeBatch does for a live HexKnowledgeChanged's own
     * `entities` batch, ahead of placement resolution. */
    function seedKnownEntity(
      prev: LocalEncounterState,
      entityId: string,
      overrides?: Partial<EntityKnowledgeEntry>
    ): LocalEncounterState {
      return applyEntityKnowledgeBatch(prev, [
        {
          entityId,
          type: EntityType.MONSTER,
          monsterRefId: 'goblin',
          initialHP: undefined,
          initialAC: undefined,
          ...overrides,
        },
      ]);
    }

    function makePlacement(entityId: string, facing = 0) {
      return create(PlacementSchema, { entityId, facing });
    }

    function makeHexRecord(
      position: { x: number; y: number; z: number },
      state: HexState,
      contents: ReturnType<typeof makePlacement>[] = [],
      edges: Wall[] = []
    ) {
      return create(HexRecordSchema, {
        position: create(V2PositionSchema, position),
        state,
        contents,
        edges,
      });
    }

    describe('applyEntityKnowledgeBatch', () => {
      it('merges entity meta without creating a position cache entry', () => {
        const state = seedKnownEntity(createEmptyEncounterState(), 'goblin-1');
        expect(state.entityMeta.get('goblin-1')?.monsterRefId).toBe('goblin');
        expect(state.entities.has('goblin-1')).toBe(false);
      });

      it('upserts by id — a batch mentioning one entity leaves others untouched', () => {
        let state = seedKnownEntity(createEmptyEncounterState(), 'goblin-1');
        state = seedKnownEntity(state, 'goblin-2');
        expect(state.entityMeta.get('goblin-1')?.monsterRefId).toBe('goblin');
        expect(state.entityMeta.get('goblin-2')?.monsterRefId).toBe('goblin');
        expect(state.entityMeta.size).toBe(2);
      });

      it('is a no-op on an empty batch (same reference)', () => {
        const state = createEmptyEncounterState();
        expect(applyEntityKnowledgeBatch(state, [])).toBe(state);
      });
    });

    describe('applyHexRecordsMerged', () => {
      it('adds new hexes without requiring a prior snapshot', () => {
        const hex = makeHexRecord({ x: 0, y: 0, z: 0 }, HexState.VISIBLE);
        const after = applyHexRecordsMerged(createEmptyEncounterState(), [hex]);
        expect(after.revealedHexes.get('0,0,0')).toBe(hex);
      });

      it('does NOT clear hexes the event does not mention', () => {
        const entrance = makeTestHex({ x: 0, y: 0, z: 0 }, 'entrance');
        const chamber = makeTestHex({ x: 1, y: -1, z: 0 }, 'chamber');
        const seeded = applySnapshotRegionState(
          createEmptyEncounterState(),
          'crypt',
          [],
          [entrance, chamber]
        );
        const newHex = makeHexRecord({ x: 5, y: -3, z: -2 }, HexState.VISIBLE);

        const after = applyHexRecordsMerged(seeded, [newHex]);

        expect(after.revealedHexes.get('0,0,0')).toBe(entrance);
        expect(after.revealedHexes.get('1,-1,0')).toBe(chamber);
        expect(after.revealedHexes.get('5,-3,-2')).toBe(newHex);
        expect(after.revealedHexes.size).toBe(3);
      });

      it('resolves a placement against a known entity and caches its position', () => {
        let state = seedKnownEntity(createEmptyEncounterState(), 'goblin-1');
        const hex = makeHexRecord({ x: 2, y: -1, z: -1 }, HexState.VISIBLE, [
          makePlacement('goblin-1'),
        ]);

        state = applyHexRecordsMerged(state, [hex]);

        expect(state.entities.get('goblin-1')?.position).toEqual(
          create(PositionSchema, { x: 2, y: -1, z: -1 })
        );
      });

      it('drops a placement whose entityId is not in the known entity set (fail closed)', () => {
        const hex = makeHexRecord({ x: 2, y: -1, z: -1 }, HexState.VISIBLE, [
          makePlacement('undisclosed-trap'),
        ]);

        const state = applyHexRecordsMerged(createEmptyEncounterState(), [hex]);

        expect(state.entities.has('undisclosed-trap')).toBe(false);
        // The hex record itself is still stored verbatim — the drop only
        // withholds rendering (the entities position cache), matching the
        // existing SnapshotDelivered precedent (EncounterView.tsx already
        // stores a hex's raw contents wholesale while separately filtering
        // which placements get a position-cache entry).
        expect(state.revealedHexes.get('2,-1,-1')).toBe(hex);
      });

      it('re-sight with contents: [] removes a remembered occupant', () => {
        let state = seedKnownEntity(createEmptyEncounterState(), 'goblin-1');
        const seen = makeHexRecord({ x: 0, y: 0, z: 0 }, HexState.VISIBLE, [
          makePlacement('goblin-1'),
        ]);
        state = applyHexRecordsMerged(state, [seen]);
        expect(state.entities.has('goblin-1')).toBe(true);

        const emptied = makeHexRecord(
          { x: 0, y: 0, z: 0 },
          HexState.VISIBLE,
          []
        );
        state = applyHexRecordsMerged(state, [emptied]);

        expect(state.entities.has('goblin-1')).toBe(false);
        expect(state.revealedHexes.get('0,0,0')).toBe(emptied);
      });

      it('does not delete a vacated placement that moved to another hex in the SAME event', () => {
        let state = seedKnownEntity(createEmptyEncounterState(), 'goblin-1');
        const origin = makeHexRecord({ x: 0, y: 0, z: 0 }, HexState.VISIBLE, [
          makePlacement('goblin-1'),
        ]);
        state = applyHexRecordsMerged(state, [origin]);

        const vacated = makeHexRecord(
          { x: 0, y: 0, z: 0 },
          HexState.VISIBLE,
          []
        );
        const arrived = makeHexRecord({ x: 1, y: -1, z: 0 }, HexState.VISIBLE, [
          makePlacement('goblin-1'),
        ]);
        state = applyHexRecordsMerged(state, [vacated, arrived]);

        expect(state.entities.get('goblin-1')?.position).toEqual(
          create(PositionSchema, { x: 1, y: -1, z: 0 })
        );
      });

      it('an empty event changes nothing (same reference)', () => {
        const state = createEmptyEncounterState();
        expect(applyHexRecordsMerged(state, [])).toBe(state);
      });

      it('is idempotent — applying the same event twice leaves state identical', () => {
        const seeded = seedKnownEntity(createEmptyEncounterState(), 'goblin-1');
        const hex = makeHexRecord({ x: 0, y: 0, z: 0 }, HexState.VISIBLE, [
          makePlacement('goblin-1'),
        ]);

        const first = applyHexRecordsMerged(seeded, [hex]);
        const second = applyHexRecordsMerged(first, [hex]);

        expect(second.revealedHexes).toBe(first.revealedHexes);
        expect(second.entities).toBe(first.entities);
        expect(second).toEqual(first);
      });

      it('walls arrive via edges: flattening hex.edges feeds applyWallsRevealed', () => {
        const wall = makeTestWall({ x: 0, y: 0, z: 0 }, { x: 1, y: -1, z: 0 });
        const hex = makeHexRecord(
          { x: 0, y: 0, z: 0 },
          HexState.VISIBLE,
          [],
          [wall]
        );

        let state = applyHexRecordsMerged(createEmptyEncounterState(), [hex]);
        state = applyWallsRevealed(state, hex.edges);

        expect(state.walls.get(wallKey(wall))).toBe(wall);
      });

      describe('VISIBLE-over-REMEMBERED position precedence (rpg-dnd5e-web#651)', () => {
        // rpg-api#732 started restating a mover's WHOLE known set (visible +
        // remembered) on every move, so an entity — very often the mover
        // themselves — can legitimately appear in a fresh VISIBLE record
        // AND a stale REMEMBERED record within the exact same event. The
        // old single-pass loop resolved placements in plain array order, so
        // whichever record happened to sort last silently won; these tests
        // pin that a VISIBLE placement always wins, regardless of order.
        it('resolves to the VISIBLE position when the REMEMBERED record for the same entity sorts LAST', () => {
          let state = seedKnownEntity(createEmptyEncounterState(), 'goblin-1');
          const visible = makeHexRecord(
            { x: 1, y: -1, z: 0 },
            HexState.VISIBLE,
            [makePlacement('goblin-1')]
          );
          const remembered = makeHexRecord(
            { x: 0, y: 0, z: 0 },
            HexState.REMEMBERED,
            [makePlacement('goblin-1')]
          );

          state = applyHexRecordsMerged(state, [visible, remembered]);

          expect(state.entities.get('goblin-1')?.position).toEqual(
            create(PositionSchema, { x: 1, y: -1, z: 0 })
          );
        });

        it('resolves to the VISIBLE position when the REMEMBERED record for the same entity sorts FIRST', () => {
          let state = seedKnownEntity(createEmptyEncounterState(), 'goblin-1');
          const remembered = makeHexRecord(
            { x: 0, y: 0, z: 0 },
            HexState.REMEMBERED,
            [makePlacement('goblin-1')]
          );
          const visible = makeHexRecord(
            { x: 1, y: -1, z: 0 },
            HexState.VISIBLE,
            [makePlacement('goblin-1')]
          );

          state = applyHexRecordsMerged(state, [remembered, visible]);

          expect(state.entities.get('goblin-1')?.position).toEqual(
            create(PositionSchema, { x: 1, y: -1, z: 0 })
          );
        });

        it('still resolves a position for an entity present ONLY in a REMEMBERED record this event — its frozen last-observed hex, so it renders as a memory (rpg-dnd5e-web#650) rather than vanishing', () => {
          let state = seedKnownEntity(createEmptyEncounterState(), 'goblin-1');
          const remembered = makeHexRecord(
            { x: 3, y: -2, z: -1 },
            HexState.REMEMBERED,
            [makePlacement('goblin-1')]
          );

          state = applyHexRecordsMerged(state, [remembered]);

          expect(state.entities.get('goblin-1')?.position).toEqual(
            create(PositionSchema, { x: 3, y: -2, z: -1 })
          );
        });

        it('a move sequence (visible A, then remembered A + visible B in the next event) leaves the entity at B, not A', () => {
          let state = seedKnownEntity(createEmptyEncounterState(), 'goblin-1');
          const atA = makeHexRecord({ x: 0, y: 0, z: 0 }, HexState.VISIBLE, [
            makePlacement('goblin-1'),
          ]);
          state = applyHexRecordsMerged(state, [atA]);
          expect(state.entities.get('goblin-1')?.position).toEqual(
            create(PositionSchema, { x: 0, y: 0, z: 0 })
          );

          // The mover walks from A to B: A demotes to REMEMBERED (still
          // listing goblin-1's old placement, per HexRecord's own "frozen
          // observation" contract) and B becomes newly VISIBLE with
          // goblin-1 now placed there — both arrive in the SAME event, as
          // rpg-api#732's full restatement does on every move.
          const rememberedA = makeHexRecord(
            { x: 0, y: 0, z: 0 },
            HexState.REMEMBERED,
            [makePlacement('goblin-1')]
          );
          const visibleB = makeHexRecord(
            { x: 1, y: -1, z: 0 },
            HexState.VISIBLE,
            [makePlacement('goblin-1')]
          );
          state = applyHexRecordsMerged(state, [rememberedA, visibleB]);

          expect(state.entities.get('goblin-1')?.position).toEqual(
            create(PositionSchema, { x: 1, y: -1, z: 0 })
          );
        });
      });

      describe('facing propagation (rpg-dnd5e-web unit/game-fidelity Bug B)', () => {
        // Placement.facing rides the SAME record as position (types_pb.ts's
        // own doc comment: "facing rides HERE... on Placement, not
        // Entity") — these pin that applyHexRecordsMerged actually carries
        // it through instead of silently dropping it the way the pre-fix
        // `setPosition` helper did.
        it('carries an authored facing through to the cached entity state', () => {
          let state = seedKnownEntity(createEmptyEncounterState(), 'goblin-1');
          const hex = makeHexRecord({ x: 2, y: -1, z: -1 }, HexState.VISIBLE, [
            makePlacement('goblin-1', 3),
          ]);

          state = applyHexRecordsMerged(state, [hex]);

          expect(state.entities.get('goblin-1')?.facing).toBe(3);
        });

        it('leaves facing undefined for a placement carrying no authored override', () => {
          let state = seedKnownEntity(createEmptyEncounterState(), 'goblin-1');
          const hex = makeHexRecord({ x: 2, y: -1, z: -1 }, HexState.VISIBLE, [
            create(PlacementSchema, { entityId: 'goblin-1' }),
          ]);

          state = applyHexRecordsMerged(state, [hex]);

          expect(state.entities.get('goblin-1')?.facing).toBeUndefined();
        });

        it('a facing-only change at the SAME hex (turning in place) still produces a state update', () => {
          let state = seedKnownEntity(createEmptyEncounterState(), 'goblin-1');
          const facingEast = makeHexRecord(
            { x: 0, y: 0, z: 0 },
            HexState.VISIBLE,
            [makePlacement('goblin-1', 0)]
          );
          state = applyHexRecordsMerged(state, [facingEast]);
          expect(state.entities.get('goblin-1')?.facing).toBe(0);

          const facingNorthwest = makeHexRecord(
            { x: 0, y: 0, z: 0 },
            HexState.VISIBLE,
            [makePlacement('goblin-1', 2)]
          );
          const after = applyHexRecordsMerged(state, [facingNorthwest]);

          expect(after.entities).not.toBe(state.entities);
          expect(after.entities.get('goblin-1')?.facing).toBe(2);
        });

        it('is idempotent on facing too — re-applying the same event twice leaves state identical', () => {
          const seeded = seedKnownEntity(
            createEmptyEncounterState(),
            'goblin-1'
          );
          const hex = makeHexRecord({ x: 0, y: 0, z: 0 }, HexState.VISIBLE, [
            makePlacement('goblin-1', 4),
          ]);

          const first = applyHexRecordsMerged(seeded, [hex]);
          const second = applyHexRecordsMerged(first, [hex]);

          expect(second.entities).toBe(first.entities);
        });
      });
    });

    describe('positionByEntityIdFromHexes (rpg-dnd5e-web#651)', () => {
      // The full-resync snapshot-hydration counterpart to
      // applyHexRecordsMerged's VISIBLE-over-REMEMBERED precedence above —
      // same rule, same bug shape, shared by EncounterView.tsx and
      // PlaytestHarness.tsx's onSnapshotDelivered instead of each keeping
      // its own (previously identical, previously broken) copy.
      it('resolves to the VISIBLE position when the REMEMBERED record for the same entity sorts LAST', () => {
        const visible = makeHexRecord({ x: 1, y: -1, z: 0 }, HexState.VISIBLE, [
          makePlacement('goblin-1'),
        ]);
        const remembered = makeHexRecord(
          { x: 0, y: 0, z: 0 },
          HexState.REMEMBERED,
          [makePlacement('goblin-1')]
        );

        const positions = positionByEntityIdFromHexes([visible, remembered]);

        expect(positions.get('goblin-1')).toEqual(
          create(V2PositionSchema, { x: 1, y: -1, z: 0 })
        );
      });

      it('resolves to the VISIBLE position when the REMEMBERED record for the same entity sorts FIRST', () => {
        const remembered = makeHexRecord(
          { x: 0, y: 0, z: 0 },
          HexState.REMEMBERED,
          [makePlacement('goblin-1')]
        );
        const visible = makeHexRecord({ x: 1, y: -1, z: 0 }, HexState.VISIBLE, [
          makePlacement('goblin-1'),
        ]);

        const positions = positionByEntityIdFromHexes([remembered, visible]);

        expect(positions.get('goblin-1')).toEqual(
          create(V2PositionSchema, { x: 1, y: -1, z: 0 })
        );
      });

      it('still resolves a position for an entity present ONLY in a REMEMBERED record — its frozen last-observed hex, so a reconnect still renders it as a memory (rpg-dnd5e-web#650) instead of dropping it', () => {
        const remembered = makeHexRecord(
          { x: 3, y: -2, z: -1 },
          HexState.REMEMBERED,
          [makePlacement('goblin-1')]
        );

        const positions = positionByEntityIdFromHexes([remembered]);

        expect(positions.get('goblin-1')).toEqual(
          create(V2PositionSchema, { x: 3, y: -2, z: -1 })
        );
      });

      it('a move sequence (visible A / remembered A + visible B, all in one hex list) resolves to B, not A', () => {
        const rememberedA = makeHexRecord(
          { x: 0, y: 0, z: 0 },
          HexState.REMEMBERED,
          [makePlacement('goblin-1')]
        );
        const visibleB = makeHexRecord(
          { x: 1, y: -1, z: 0 },
          HexState.VISIBLE,
          [makePlacement('goblin-1')]
        );

        const positions = positionByEntityIdFromHexes([rememberedA, visibleB]);

        expect(positions.get('goblin-1')).toEqual(
          create(V2PositionSchema, { x: 1, y: -1, z: 0 })
        );
      });

      it('ignores contents on a hex with no position (defensive)', () => {
        const positionless = create(HexRecordSchema, {
          state: HexState.VISIBLE,
          contents: [create(PlacementSchema, { entityId: 'goblin-1' })],
        });

        const positions = positionByEntityIdFromHexes([positionless]);

        expect(positions.has('goblin-1')).toBe(false);
      });
    });

    describe('facingByEntityIdFromHexes (rpg-dnd5e-web unit/game-fidelity Bug B)', () => {
      // Snapshot-hydration sibling of the applyHexRecordsMerged facing
      // coverage above — same VISIBLE-over-REMEMBERED precedence
      // (rpg-dnd5e-web#651), resolving Placement.facing instead of
      // Placement's implicit hex position.
      it('resolves an authored facing for a VISIBLE placement', () => {
        const visible = makeHexRecord({ x: 1, y: -1, z: 0 }, HexState.VISIBLE, [
          makePlacement('statue-1', 5),
        ]);

        const facings = facingByEntityIdFromHexes([visible]);

        expect(facings.get('statue-1')).toBe(5);
      });

      it('omits an entity whose placement carries no authored facing', () => {
        const visible = makeHexRecord({ x: 1, y: -1, z: 0 }, HexState.VISIBLE, [
          create(PlacementSchema, { entityId: 'statue-1' }),
        ]);

        const facings = facingByEntityIdFromHexes([visible]);

        expect(facings.has('statue-1')).toBe(false);
      });

      it('resolves to the VISIBLE facing when a REMEMBERED record for the same entity also carries one', () => {
        const visible = makeHexRecord({ x: 1, y: -1, z: 0 }, HexState.VISIBLE, [
          makePlacement('goblin-1', 1),
        ]);
        const remembered = makeHexRecord(
          { x: 0, y: 0, z: 0 },
          HexState.REMEMBERED,
          [makePlacement('goblin-1', 4)]
        );

        const facings = facingByEntityIdFromHexes([remembered, visible]);

        expect(facings.get('goblin-1')).toBe(1);
      });

      it('still resolves a facing for an entity present ONLY in a REMEMBERED record', () => {
        const remembered = makeHexRecord(
          { x: 3, y: -2, z: -1 },
          HexState.REMEMBERED,
          [makePlacement('goblin-1', 2)]
        );

        const facings = facingByEntityIdFromHexes([remembered]);

        expect(facings.get('goblin-1')).toBe(2);
      });
    });

    describe('knowledgeStateForPosition (rpg-dnd5e-web#605/#609)', () => {
      it("returns 'remembered' for a position whose hex record is HEX_STATE_REMEMBERED", () => {
        const hex = makeHexRecord({ x: 1, y: -1, z: 0 }, HexState.REMEMBERED);
        const revealedHexes = new Map([['1,-1,0', hex]]);

        expect(
          knowledgeStateForPosition(revealedHexes, { x: 1, y: -1, z: 0 })
        ).toBe('remembered');
      });

      it("returns 'visible' for a position whose hex record is HEX_STATE_VISIBLE", () => {
        const hex = makeHexRecord({ x: 0, y: 0, z: 0 }, HexState.VISIBLE);
        const revealedHexes = new Map([['0,0,0', hex]]);

        expect(
          knowledgeStateForPosition(revealedHexes, { x: 0, y: 0, z: 0 })
        ).toBe('visible');
      });

      it("falls back to 'visible' for a position with no hex record at all", () => {
        expect(
          knowledgeStateForPosition(new Map(), { x: 9, y: -9, z: 0 })
        ).toBe('visible');
      });
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

  describe('applyInitiativeRolled', () => {
    it('sets initiativeOrder from the event order list', () => {
      const prev = createEmptyEncounterState();
      const after = applyInitiativeRolled(
        prev,
        makeInitiativeRolled(['char-alice', 'goblin-1', 'char-bob'])
      );
      expect(after.initiativeOrder).toEqual([
        'char-alice',
        'goblin-1',
        'char-bob',
      ]);
    });

    it('populates the turn-order overlay when combat starts mid-stream (no prior snapshot)', () => {
      // Regression for #454: a FREE_ROAM -> TURN_BASED transition mid-stream
      // must populate initiativeOrder without waiting for the next
      // SnapshotDelivered.
      const prev = createEmptyEncounterState();
      expect(prev.initiativeOrder).toEqual([]);
      const after = applyInitiativeRolled(
        prev,
        makeInitiativeRolled(['char-alice', 'goblin-1'])
      );
      expect(after.initiativeOrder).toEqual(['char-alice', 'goblin-1']);
    });

    it('is idempotent when the order is unchanged (returns same reference)', () => {
      const prev = applyInitiativeRolled(
        createEmptyEncounterState(),
        makeInitiativeRolled(['char-alice', 'goblin-1'])
      );
      const next = applyInitiativeRolled(
        prev,
        makeInitiativeRolled(['char-alice', 'goblin-1'])
      );
      expect(next).toBe(prev);
    });

    it('updates when the order changes (re-roll includes a new entity)', () => {
      const prev = applyInitiativeRolled(
        createEmptyEncounterState(),
        makeInitiativeRolled(['char-alice', 'goblin-1'])
      );
      const next = applyInitiativeRolled(
        prev,
        makeInitiativeRolled(['char-alice', 'goblin-1', 'goblin-2'])
      );
      expect(next.initiativeOrder).toEqual([
        'char-alice',
        'goblin-1',
        'goblin-2',
      ]);
    });

    it('does not touch mode, activeEntityId, round', () => {
      let prev = createEmptyEncounterState();
      prev = applyModeChanged(
        prev,
        makeModeChanged(EncounterMode.FREE_ROAM, EncounterMode.TURN_BASED)
      );
      prev = applyTurnStarted(prev, makeTurnStarted('char-alice', 1));

      const next = applyInitiativeRolled(
        prev,
        makeInitiativeRolled(['char-alice', 'goblin-1'])
      );
      expect(next.mode).toBe(EncounterMode.TURN_BASED);
      expect(next.activeEntityId).toBe('char-alice');
      expect(next.round).toBe(1);
    });

    it('does not mutate the previous state', () => {
      const prev = createEmptyEncounterState();
      applyInitiativeRolled(
        prev,
        makeInitiativeRolled(['char-alice', 'goblin-1'])
      );
      expect(prev.initiativeOrder).toEqual([]);
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

describe('applySnapshotTurnState', () => {
  it('sets initiativeOrder, activeEntityId, round, and mode from snapshot turn state', () => {
    const prev = createEmptyEncounterState();
    const after = applySnapshotTurnState(
      prev,
      EncounterMode.TURN_BASED,
      create(TurnStateSchema, {
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
    const after = applySnapshotTurnState(
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
    state = applySnapshotTurnState(
      state,
      EncounterMode.TURN_BASED,
      create(TurnStateSchema, {
        initiativeOrder: ['char-alice', 'goblin-1'],
        activeEntityId: 'char-alice',
        round: 2,
      })
    );
    const after = applySnapshotTurnState(
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
    const after = applySnapshotTurnState(
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
    const after = applySnapshotTurnState(
      prev,
      EncounterMode.TURN_BASED,
      create(TurnStateSchema, {
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
    applySnapshotTurnState(
      prev,
      EncounterMode.TURN_BASED,
      create(TurnStateSchema, {
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
    const turnState = create(TurnStateSchema, {
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
    const after = applySnapshotTurnState(
      prev,
      EncounterMode.TURN_BASED,
      turnState
    );
    expect(after.turnState?.availableActions).toHaveLength(1);
    expect(after.turnState?.economy?.actionsRemaining).toBe(1);
  });

  it('clears turnState when leaving TURN_BASED', () => {
    const seeded = applySnapshotTurnState(
      createEmptyEncounterState(),
      EncounterMode.TURN_BASED,
      create(TurnStateSchema, {
        activeEntityId: 'char-alice',
        round: 1,
        availableActions: [],
      })
    );
    const after = applySnapshotTurnState(
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
    const turnState = create(TurnStateSchema, {
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
      create(TurnStateSchema, { availableActions: [] })
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
        type: EntityType.CHARACTER,
        monsterRefId: undefined,
        initialHP: undefined,
        initialAC: undefined,
      },
      {
        entity: makeTestEntity('goblin-1', { x: 1, y: 0, z: -1 }),
        type: EntityType.MONSTER,
        monsterRefId: 'goblin',
        initialHP: { current: 7, max: 7 },
        initialAC: undefined,
      },
    ]);
    expect(after.entities.size).toBe(2);
    expect(after.entityMeta.get('char-alice')?.type).toBe(EntityType.CHARACTER);
    expect(after.entityMeta.get('goblin-1')?.monsterRefId).toBe('goblin');
    expect(after.entityHP.get('goblin-1')).toEqual({ current: 7, max: 7 });
    expect(after.entityHP.has('char-alice')).toBe(false);
  });

  it('clears movePath/moveSeq on re-appear (rpg-dnd5e-web#542) — mount/revive must not replay the walk clip', () => {
    // Entity had a real move (movePath/moveSeq set) before going ghost/
    // reappearing — applyEntityAppearedBatch replaces the whole record with
    // a fresh wire EntityState, so a revive must NOT carry the stale move
    // forward (that would make HexEntity's useHexMovePath think a brand
    // new move just started on every reconnect/LoS-reappear).
    const withMove = mergeEntityPosition(
      applyEntityAppearedBatch(createEmptyEncounterState(), [
        {
          entity: makeTestEntity('char-alice', { x: 0, y: 0, z: 0 }),
          type: EntityType.CHARACTER,
          monsterRefId: undefined,
          initialHP: undefined,
          initialAC: undefined,
        },
      ]),
      'char-alice',
      create(PositionSchema, { x: 1, y: -1, z: 0 }),
      [create(PositionSchema, { x: 1, y: -1, z: 0 })]
    );
    expect(withMove.entities.get('char-alice')?.moveSeq).toBe(1);

    const revived = applyEntityAppearedBatch(withMove, [
      {
        entity: makeTestEntity('char-alice', { x: 1, y: -1, z: 0 }),
        type: EntityType.CHARACTER,
        monsterRefId: undefined,
        initialHP: undefined,
        initialAC: undefined,
      },
    ]);

    const revivedEntity = revived.entities.get('char-alice');
    expect(revivedEntity?.movePath).toBeUndefined();
    expect(revivedEntity?.moveSeq).toBeUndefined();
  });

  it('stores displayName and classRefId per entity (rpg-dnd5e-web#491)', () => {
    const prev = createEmptyEncounterState();
    const after = applyEntityAppearedBatch(prev, [
      {
        entity: makeTestEntity('char-alice', { x: 0, y: 0, z: 0 }),
        type: EntityType.CHARACTER,
        monsterRefId: undefined,
        initialHP: undefined,
        initialAC: undefined,
        displayName: 'Alice',
        classRefId: 'rogue',
      },
      {
        entity: makeTestEntity('goblin-1', { x: 1, y: 0, z: -1 }),
        type: EntityType.MONSTER,
        monsterRefId: 'goblin',
        initialHP: undefined,
        initialAC: undefined,
        displayName: 'Goblin',
      },
    ]);
    expect(after.entityMeta.get('char-alice')).toMatchObject({
      displayName: 'Alice',
      classRefId: 'rogue',
    });
    expect(after.entityMeta.get('goblin-1')).toMatchObject({
      displayName: 'Goblin',
      classRefId: undefined,
    });
  });

  it('stores propRefId per entity (rpg-dnd5e-web#528)', () => {
    const prev = createEmptyEncounterState();
    const after = applyEntityAppearedBatch(prev, [
      {
        entity: makeTestEntity('obstacle-1', { x: 2, y: 0, z: -2 }),
        type: EntityType.OBSTACLE,
        monsterRefId: undefined,
        initialHP: undefined,
        initialAC: undefined,
        displayName: 'Barrel',
        propRefId: 'barrel',
      },
    ]);
    expect(after.entityMeta.get('obstacle-1')?.propRefId).toBe('barrel');
  });

  it('stores facing per entity (rpg-dnd5e-web unit/game-fidelity Bug B)', () => {
    const prev = createEmptyEncounterState();
    const after = applyEntityAppearedBatch(prev, [
      {
        entity: makeTestEntity('statue-1', { x: 2, y: 0, z: -2 }),
        type: EntityType.OBSTACLE,
        monsterRefId: undefined,
        initialHP: undefined,
        initialAC: undefined,
        displayName: 'Statue',
        propRefId: 'statue',
        facing: 4,
      },
      {
        entity: makeTestEntity('bookcase-1', { x: 3, y: 0, z: -3 }),
        type: EntityType.OBSTACLE,
        monsterRefId: undefined,
        initialHP: undefined,
        initialAC: undefined,
        displayName: 'Bookcase',
        propRefId: 'bookcase',
      },
    ]);
    expect(after.entities.get('statue-1')?.facing).toBe(4);
    expect(after.entities.get('bookcase-1')?.facing).toBeUndefined();
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
        type: EntityType.MONSTER,
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
    // applyEntityAppearedBatch clears ghost on revive — there is no longer a
    // live disappear event, so the ghost precondition is built directly here.
    const entity = makeTestEntity('mover', { x: 0, y: 0, z: 0 });
    let state = seedEntity(createEmptyEncounterState(), entity);
    const ghostedEntities = new Map(state.entities);
    ghostedEntities.set('mover', {
      ...state.entities.get('mover')!,
      ghost: true,
      position: create(PositionSchema, { x: 1, y: -1, z: 0 }),
    });
    state = { ...state, entities: ghostedEntities };
    expect(state.entities.get('mover')?.ghost).toBe(true);

    state = applyEntityAppearedBatch(state, [
      {
        entity: makeTestEntity('mover', { x: 5, y: 0, z: -5 }),
        type: EntityType.CHARACTER,
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
        type: EntityType.CHARACTER,
        monsterRefId: undefined,
        initialHP: { current: 12, max: 12 },
        initialAC: 15,
      },
      {
        entity: makeTestEntity('goblin-1', { x: 1, y: 0, z: -1 }),
        type: EntityType.MONSTER,
        monsterRefId: 'goblin',
        initialHP: { current: 7, max: 7 },
        initialAC: 13,
      },
    ]);
    expect(after.entityAC.get('char-charli')).toBe(15);
    expect(after.entityAC.get('goblin-1')).toBe(13);
  });

  // rpg-dnd5e-web#571: equipment/inventory ride the same CharacterData the
  // encounter snapshot already hydrates (rpg-api#682) — no separate fetch.
  describe('snapshot equipment hydration (#571)', () => {
    it('seeds characterEquipment from equipment carried on a batch entry', () => {
      const prev = createEmptyEncounterState();
      const equipment = testEquipment();
      const after = applyEntityAppearedBatch(prev, [
        {
          entity: makeTestEntity('char-aldric', { x: 0, y: 0, z: 0 }),
          type: EntityType.CHARACTER,
          monsterRefId: undefined,
          initialHP: undefined,
          initialAC: undefined,
          equipment,
        },
      ]);
      expect(after.characterEquipment.get('char-aldric')).toBe(equipment);
    });

    it('does not seed characterEquipment for entries without equipment (e.g. monsters)', () => {
      const prev = createEmptyEncounterState();
      const after = applyEntityAppearedBatch(prev, [
        {
          entity: makeTestEntity('goblin-1', { x: 1, y: 0, z: -1 }),
          type: EntityType.MONSTER,
          monsterRefId: 'goblin',
          initialHP: { current: 7, max: 7 },
          initialAC: 13,
        },
      ]);
      expect(after.characterEquipment.size).toBe(0);
    });

    it('preserves other characters equipment entries across a later batch', () => {
      let state = applyEntityAppearedBatch(createEmptyEncounterState(), [
        {
          entity: makeTestEntity('char-aldric', { x: 0, y: 0, z: 0 }),
          type: EntityType.CHARACTER,
          monsterRefId: undefined,
          initialHP: undefined,
          initialAC: undefined,
          equipment: testEquipment(),
        },
      ]);
      state = applyEntityAppearedBatch(state, [
        {
          entity: makeTestEntity('goblin-1', { x: 1, y: 0, z: -1 }),
          type: EntityType.MONSTER,
          monsterRefId: 'goblin',
          initialHP: { current: 7, max: 7 },
          initialAC: 13,
        },
      ]);
      expect(state.characterEquipment.has('char-aldric')).toBe(true);
    });
  });

  // rpg-dnd5e-web#462: condition badges never survived a reconnect because
  // the snapshot handler never read entity.status_effects — entityStatuses
  // was only ever populated by the live onStatusApplied handler, which
  // doesn't replay for conditions that were already active before connect.
  describe('snapshot status hydration (#462)', () => {
    it('seeds entityStatuses from statusEffects carried on a batch entry', () => {
      const prev = createEmptyEncounterState();
      const after = applyEntityAppearedBatch(prev, [
        {
          entity: makeTestEntity('char-bob', { x: 0, y: 0, z: 0 }),
          type: EntityType.CHARACTER,
          monsterRefId: undefined,
          initialHP: undefined,
          initialAC: undefined,
          statusEffects: [
            makeStatusEffect('dnd5e', 'conditions', 'raging', 'Raging'),
          ],
        },
      ]);
      const list = after.entityStatuses.get('char-bob');
      expect(list).toHaveLength(1);
      expect(list?.[0].source.id).toBe('raging');
      expect(list?.[0].displayName).toBe('Raging');
    });

    it('replaces (not merges into) a stale pre-refresh status list for the same entity', () => {
      let state = applyStatusApplied(
        createEmptyEncounterState(),
        makeStatusApplied(
          'char-bob',
          'dnd5e',
          'conditions',
          'poisoned',
          'Poisoned'
        )
      );
      expect(state.entityStatuses.get('char-bob')).toHaveLength(1);

      // A fresh snapshot after reconnect says char-bob is now only raging —
      // poisoned must not survive alongside it.
      state = applyEntityAppearedBatch(state, [
        {
          entity: makeTestEntity('char-bob', { x: 0, y: 0, z: 0 }),
          type: EntityType.CHARACTER,
          monsterRefId: undefined,
          initialHP: undefined,
          initialAC: undefined,
          statusEffects: [
            makeStatusEffect('dnd5e', 'conditions', 'raging', 'Raging'),
          ],
        },
      ]);
      const list = state.entityStatuses.get('char-bob');
      expect(list).toHaveLength(1);
      expect(list?.[0].source.id).toBe('raging');
    });

    it('clears a stale status entry when the fresh snapshot carries no statusEffects for that entity', () => {
      let state = applyStatusApplied(
        createEmptyEncounterState(),
        makeStatusApplied('char-bob', 'dnd5e', 'conditions', 'raging', 'Raging')
      );
      expect(state.entityStatuses.get('char-bob')).toHaveLength(1);

      state = applyEntityAppearedBatch(state, [
        {
          entity: makeTestEntity('char-bob', { x: 0, y: 0, z: 0 }),
          type: EntityType.CHARACTER,
          monsterRefId: undefined,
          initialHP: undefined,
          initialAC: undefined,
          statusEffects: [],
        },
      ]);
      expect(state.entityStatuses.has('char-bob')).toBe(false);
    });

    it('supports multiple stacked statusEffects on one entity', () => {
      const prev = createEmptyEncounterState();
      const after = applyEntityAppearedBatch(prev, [
        {
          entity: makeTestEntity('char-bob', { x: 0, y: 0, z: 0 }),
          type: EntityType.CHARACTER,
          monsterRefId: undefined,
          initialHP: undefined,
          initialAC: undefined,
          statusEffects: [
            makeStatusEffect('dnd5e', 'conditions', 'raging', 'Raging'),
            makeStatusEffect('dnd5e', 'conditions', 'poisoned', 'Poisoned'),
          ],
        },
      ]);
      const list = after.entityStatuses.get('char-bob');
      expect(list?.map((s) => s.source.id).sort()).toEqual([
        'poisoned',
        'raging',
      ]);
    });

    it('is a no-op for entityStatuses when the entry omits statusEffects entirely (existing callers unaffected)', () => {
      const prev = createEmptyEncounterState();
      const after = applyEntityAppearedBatch(prev, [
        {
          entity: makeTestEntity('char-bob', { x: 0, y: 0, z: 0 }),
          type: EntityType.CHARACTER,
          monsterRefId: undefined,
          initialHP: undefined,
          initialAC: undefined,
        },
      ]);
      expect(after.entityStatuses.size).toBe(0);
    });
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
      state = seedEntity(state, entity);
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
      state = seedEntity(state, entity);
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
      state = seedEntity(
        state,
        create(EntityStateSchema, { entityId: 'goblin-1' })
      );
      state = seedEntity(
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
  });
});

// rpg-dnd5e-web#571: EquipItem/UnequipItem are character-scoped RPCs that
// return the full recomputed CharacterData but push no stream event (live
// push to OTHER clients is rpg-api#681) — the acting client mirrors its own
// response locally, the same "optimistic local mirror" shape
// setReactionReadyLocalReducer uses above.
describe('applyCharacterEquipment', () => {
  it('stores the equipment for the given entity', () => {
    const prev = createEmptyEncounterState();
    const equipment = testEquipment();
    const after = applyCharacterEquipment(prev, 'char-aldric', equipment);
    expect(after.characterEquipment.get('char-aldric')).toBe(equipment);
  });

  it('refreshes entityAC from armorClassDetail.total so the dock stays in sync', () => {
    const prev = createEmptyEncounterState();
    const after = applyCharacterEquipment(
      prev,
      'char-aldric',
      testEquipment({ armorClassDetail: { total: 16, note: '16 chain mail' } })
    );
    expect(after.entityAC.get('char-aldric')).toBe(16);
  });

  it('leaves entityAC untouched when armorClassDetail is undefined', () => {
    let prev = createEmptyEncounterState();
    prev = applyEntityAppearedBatch(prev, [
      {
        entity: makeTestEntity('char-aldric', { x: 0, y: 0, z: 0 }),
        type: EntityType.CHARACTER,
        monsterRefId: undefined,
        initialHP: undefined,
        initialAC: 18,
      },
    ]);
    const after = applyCharacterEquipment(
      prev,
      'char-aldric',
      testEquipment({ armorClassDetail: undefined })
    );
    expect(after.entityAC.get('char-aldric')).toBe(18);
  });

  it('preserves other characters equipment entries', () => {
    let state = applyCharacterEquipment(
      createEmptyEncounterState(),
      'char-aldric',
      testEquipment()
    );
    state = applyCharacterEquipment(
      state,
      'char-remy',
      testEquipment({ mainHandDamage: '1d4 piercing' })
    );
    expect(state.characterEquipment.get('char-aldric')?.mainHandDamage).toBe(
      '1d8 slashing'
    );
    expect(state.characterEquipment.get('char-remy')?.mainHandDamage).toBe(
      '1d4 piercing'
    );
  });

  it('does not mutate the previous state', () => {
    const prev = createEmptyEncounterState();
    applyCharacterEquipment(prev, 'char-aldric', testEquipment());
    expect(prev.characterEquipment.size).toBe(0);
    expect(prev.entityAC.size).toBe(0);
  });
});
