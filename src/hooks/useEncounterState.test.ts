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
  InputRequiredSchema,
  SkillCheckPromptSchema,
  type StatusEffect,
  TargetKind,
  TurnStateSchema,
  PositionSchema as V2PositionSchema,
  type Wall,
  WallKind,
  WallSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { describe, expect, it } from 'vitest';
import { hexKey } from '../utils/hexCoord';
import { wallKey } from './dungeonMapGeometry';
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
  applyInitiativeRolled,
  applyModeChanged,
  applySnapshotTurnState,
  applyStatusApplied,
  applyStatusRemoved,
  applyTurnEnded,
  applyTurnStarted,
  applyTurnStateChanged,
  applyWallsRevealed,
  createEmptyEncounterState,
  mergeEntityPosition,
  setPendingPromptReducer,
  setReactionReadyLocalReducer,
} from './useEncounterState';

function makeTestWall(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  kind: WallKind = WallKind.SOLID
): Wall {
  return create(WallSchema, {
    from: create(V2PositionSchema, from),
    to: create(V2PositionSchema, to),
    kind,
  });
}

describe('createEmptyEncounterState', () => {
  it('returns empty state with Maps and default values', () => {
    const state = createEmptyEncounterState();

    expect(state.encounterId).toBe('');
    expect(state.dungeonId).toBe('');
    expect(state.entities).toBeInstanceOf(Map);
    expect(state.entities.size).toBe(0);
    expect(state.revealedHexes).toBeInstanceOf(Set);
    expect(state.revealedHexes.size).toBe(0);
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
    const prev = applyEntityAppeared(
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
    const prev = applyEntityAppeared(createEmptyEncounterState(), seeded);

    const newPos = create(PositionSchema, { x: 5, y: -3, z: -2 });
    const next = mergeEntityPosition(prev, 'char-1', newPos);

    const updated = next.entities.get('char-1');
    expect(updated?.position).toEqual(newPos);
    expect(updated?.currentHitPoints).toBe(12);
    expect(updated?.maxHitPoints).toBe(20);
  });

  it('returns prev unchanged when entity is not present', () => {
    const prev = applyEntityAppeared(
      createEmptyEncounterState(),
      create(EntityStateSchema, { entityId: 'char-1' })
    );
    const newPos = create(PositionSchema, { x: 1, y: 0, z: -1 });

    const next = mergeEntityPosition(prev, 'char-missing', newPos);

    // Same reference — pure no-op when entity isn't tracked
    expect(next).toBe(prev);
  });

  it('does not mutate the previous state', () => {
    const prev = applyEntityAppeared(
      createEmptyEncounterState(),
      create(EntityStateSchema, { entityId: 'char-1' })
    );
    const originalEntity = prev.entities.get('char-1');
    const newPos = create(PositionSchema, { x: 7, y: -3, z: -4 });

    mergeEntityPosition(prev, 'char-1', newPos);

    // Original state's entity reference unchanged
    expect(prev.entities.get('char-1')).toBe(originalEntity);
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
      const withEntity = applyEntityAppeared(
        createEmptyEncounterState(),
        entity
      );
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
      const prev = applyEntityAppeared(createEmptyEncounterState(), entity);
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

// ---------------------------------------------------------------------------
// Wave 2.8 display fixes (#397, #399)
// ---------------------------------------------------------------------------

describe('applyEntityMetaFromAppeared', () => {
  it('stores type and monsterRefId for a monster entity', () => {
    const prev = createEmptyEncounterState();
    const after = applyEntityMetaFromAppeared(
      prev,
      'goblin-1',
      EntityType.MONSTER,
      'goblin',
      undefined,
      undefined
    );
    const meta = after.entityMeta.get('goblin-1');
    expect(meta?.type).toBe(EntityType.MONSTER);
    expect(meta?.monsterRefId).toBe('goblin');
  });

  it('stores type without monsterRefId for a character entity', () => {
    const prev = createEmptyEncounterState();
    const after = applyEntityMetaFromAppeared(
      prev,
      'char-alice',
      EntityType.CHARACTER,
      undefined,
      undefined,
      undefined
    );
    const meta = after.entityMeta.get('char-alice');
    expect(meta?.type).toBe(EntityType.CHARACTER);
    expect(meta?.monsterRefId).toBeUndefined();
  });

  it('seeds entityHP when initialHP is provided', () => {
    const prev = createEmptyEncounterState();
    const after = applyEntityMetaFromAppeared(
      prev,
      'goblin-1',
      EntityType.MONSTER,
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
      EntityType.MONSTER,
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
      EntityType.MONSTER,
      'goblin',
      undefined,
      undefined
    );
    state = applyEntityMetaFromAppeared(
      state,
      'goblin-1',
      EntityType.MONSTER,
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
      EntityType.MONSTER,
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
      EntityType.CHARACTER,
      undefined,
      undefined,
      undefined
    );
    state = applyEntityMetaFromAppeared(
      state,
      'goblin-1',
      EntityType.MONSTER,
      'goblin',
      undefined,
      undefined
    );
    expect(state.entityMeta.size).toBe(2);
    expect(state.entityMeta.get('char-alice')?.type).toBe(EntityType.CHARACTER);
    expect(state.entityMeta.get('goblin-1')?.type).toBe(EntityType.MONSTER);
  });

  it('seeds entityAC from v2 Entity.armor_class', () => {
    const prev = createEmptyEncounterState();
    const after = applyEntityMetaFromAppeared(
      prev,
      'char-charli',
      EntityType.CHARACTER,
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
      EntityType.CHARACTER,
      undefined,
      undefined,
      undefined
    );
    expect(after.entityAC.has('char-charli')).toBe(false);
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
    // applyEntityAppearedBatch should clear ghost just like applyEntityAppeared
    const entity = makeTestEntity('mover', { x: 0, y: 0, z: 0 });
    let state = applyEntityAppeared(createEmptyEncounterState(), entity);
    state = applyEntityDisappeared(state, 'mover', { q: 1, r: -1, s: 0 });
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
