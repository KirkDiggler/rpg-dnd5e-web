/**
 * useEncounterState - Manages unified entity state for an encounter
 *
 * Replaces fragmented state across LobbyView (monsters[], fullCharactersMap,
 * dungeonMap.entities) with a single authoritative store keyed by entity ID.
 *
 * Snapshot events replace the entire store; delta events merge by entity ID.
 *
 * Part of the unified entity state refactor (rpg-dnd5e-web feat-unified-entity-state).
 */

import type { Position } from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/room_common_pb';
import type {
  CombatState,
  DoorInfo,
  EncounterStateData,
  EntityState,
  RoomLayout,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { DungeonState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { useCallback, useState } from 'react';

/** Local representation of encounter state using JS Maps for O(1) lookups */
export interface LocalEncounterState {
  encounterId: string;
  dungeonId: string;
  /** All entities in the encounter, keyed by entity ID */
  entities: Map<string, EntityState>;
  /** All rooms in the dungeon, keyed by room ID */
  rooms: Map<string, RoomLayout>;
  currentRoomId: string;
  revealedRoomIds: string[];
  combat: CombatState | null;
  /** All doors in the dungeon, keyed by connection ID */
  doors: Map<string, DoorInfo>;
  dungeonState: DungeonState;
  roomsCleared: number;
}

/** Create an empty LocalEncounterState. Exported for testing. */
export function createEmptyEncounterState(): LocalEncounterState {
  return {
    encounterId: '',
    dungeonId: '',
    entities: new Map(),
    rooms: new Map(),
    currentRoomId: '',
    revealedRoomIds: [],
    combat: null,
    doors: new Map(),
    dungeonState: DungeonState.UNSPECIFIED,
    roomsCleared: 0,
  };
}

/**
 * Convert an EncounterStateData proto into a LocalEncounterState.
 * Proto Record<string, T> maps are converted to Map<string, T>.
 * Exported for testing.
 */
export function applySnapshotToState(
  proto: EncounterStateData
): LocalEncounterState {
  return {
    encounterId: proto.encounterId,
    dungeonId: proto.dungeonId,
    entities: new Map(Object.entries(proto.entities ?? {})),
    rooms: new Map(Object.entries(proto.rooms ?? {})),
    currentRoomId: proto.currentRoomId,
    revealedRoomIds: proto.revealedRoomIds,
    combat: proto.combat ?? null,
    doors: new Map(Object.entries(proto.doors ?? {})),
    dungeonState: proto.dungeonState,
    roomsCleared: proto.roomsCleared,
  };
}

/**
 * Merge entity delta updates into existing state without losing other entities.
 * Updates are applied by entity ID; existing entities not in the update list remain.
 * Exported for testing.
 */
export function mergeEntityUpdates(
  prev: LocalEncounterState,
  updates: EntityState[]
): LocalEncounterState {
  const newEntities = new Map(prev.entities);
  for (const entity of updates) {
    newEntities.set(entity.entityId, entity);
  }
  return { ...prev, entities: newEntities };
}

/**
 * Update only the position of an entity already present in state.
 *
 * Used as a fallback consumer for MovementCompletedEvent when the API does
 * not include a full updatedEntity but does include a path[] — we synthesize
 * the position update from path[path.length-1]. Mirrors the legacy
 * applyMonsterMovement pattern (clone-with-new-position) but writes to the
 * unified entity store.
 *
 * If the entity is not present, returns prev unchanged — we don't fabricate
 * entities from a position alone.
 *
 * Exported for testing.
 */
export function mergeEntityPosition(
  prev: LocalEncounterState,
  entityId: string,
  position: Position
): LocalEncounterState {
  const existing = prev.entities.get(entityId);
  if (!existing) return prev;
  const newEntities = new Map(prev.entities);
  newEntities.set(entityId, { ...existing, position });
  return { ...prev, entities: newEntities };
}

/**
 * Replace combat state without touching entities or other fields.
 * Exported for testing.
 */
export function updateCombatState(
  prev: LocalEncounterState,
  combat: CombatState
): LocalEncounterState {
  return { ...prev, combat };
}

export interface UseEncounterStateResult {
  state: LocalEncounterState;
  /** Replace entire state from an EncounterStateData proto (snapshot event) */
  applySnapshot: (proto: EncounterStateData) => void;
  /** Merge entity deltas by ID without losing unaffected entities (delta event) */
  applyEntityUpdates: (updates: EntityState[]) => void;
  /**
   * Update only the position of an existing entity. Used as a fallback for
   * MovementCompletedEvent when the API omits updatedEntity but sends path[].
   * No-op if the entity is not already in state.
   */
  applyEntityPositionUpdate: (entityId: string, position: Position) => void;
  /** Update combat state only (turn progression events) */
  applyCombatState: (combat: CombatState) => void;
  /** Reset to empty state (new encounter or disconnect) */
  reset: () => void;
}

/**
 * Hook to manage unified encounter entity state.
 * Single store for all entity state in an encounter.
 */
export function useEncounterState(): UseEncounterStateResult {
  const [state, setState] = useState<LocalEncounterState>(
    createEmptyEncounterState
  );

  const applySnapshot = useCallback((proto: EncounterStateData) => {
    setState(applySnapshotToState(proto));
  }, []);

  const applyEntityUpdates = useCallback((updates: EntityState[]) => {
    setState((prev) => mergeEntityUpdates(prev, updates));
  }, []);

  const applyEntityPositionUpdate = useCallback(
    (entityId: string, position: Position) => {
      setState((prev) => mergeEntityPosition(prev, entityId, position));
    },
    []
  );

  const applyCombatState = useCallback((combat: CombatState) => {
    setState((prev) => updateCombatState(prev, combat));
  }, []);

  const reset = useCallback(() => {
    setState(createEmptyEncounterState());
  }, []);

  return {
    state,
    applySnapshot,
    applyEntityUpdates,
    applyEntityPositionUpdate,
    applyCombatState,
    reset,
  };
}
