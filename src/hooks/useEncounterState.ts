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

import { create } from '@bufbuild/protobuf';
import {
  PositionSchema,
  type Position,
} from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/room_common_pb';
import type {
  CombatState,
  DoorInfo,
  EncounterStateData,
  EntityState,
  RoomLayout,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { DungeonState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { useCallback, useState } from 'react';
import { hexKey, type CubeHexCoord } from '../utils/hexCoord';

/** Local representation of encounter state using JS Maps for O(1) lookups */
export interface LocalEncounterState {
  encounterId: string;
  dungeonId: string;
  /** All entities, keyed by entity ID. v2 may set entity.ghost on LoS loss. */
  entities: Map<string, EntityState & { ghost?: boolean }>;
  /** All rooms in the dungeon, keyed by room ID */
  rooms: Map<string, RoomLayout>;
  currentRoomId: string;
  revealedRoomIds: string[];
  /** v1alpha2-revealed hexes (per-hex granularity). UI renders revealed if either revealedHexes covers it OR the room is in revealedRoomIds. */
  revealedHexes: Set<string>;
  combat: CombatState | null;
  /** All doors in the dungeon, keyed by connection ID (v1alpha1 snapshot data). */
  doors: Map<string, DoorInfo>;
  /**
   * v1alpha2 open-door entity IDs. Populated by `applyDoorOpened` from the
   * DoorOpened event. Keyed by the proto's `door_entity_id` (distinct from
   * the v1alpha1 connectionId in `doors`). Renderers consult this set to
   * decide whether to draw a door's wall as a passage.
   */
  openDoors: Set<string>;
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
    revealedHexes: new Set(),
    combat: null,
    doors: new Map(),
    openDoors: new Set(),
    dungeonState: DungeonState.UNSPECIFIED,
    roomsCleared: 0,
  };
}

/**
 * Convert an EncounterStateData proto into a LocalEncounterState.
 * Proto Record<string, T> maps are converted to Map<string, T>.
 *
 * v2-only delta state preservation: `applySnapshot` is called on v1alpha1
 * sync events (LobbyView wires it onto multiple v1 paths). v1 snapshots do
 * NOT carry v2 deltas like `openDoors` or `revealedHexes` — those flow only
 * via the v2 StreamEncounter (DoorOpened, GeometryRevealed) and are not
 * replayed on reconnect or v1 state-sync events. If we rebuilt the whole
 * state on every snapshot we'd silently wipe every v2 door we'd opened in
 * the session.
 *
 * Mitigation: when `prev` is provided AND the snapshot is for the SAME
 * encounter (same encounterId), carry forward v2-only fields (`openDoors`,
 * `revealedHexes`). On encounter switch (different encounterId) we reset.
 *
 * Exported for testing.
 */
export function applySnapshotToState(
  proto: EncounterStateData,
  prev?: LocalEncounterState
): LocalEncounterState {
  // Same-encounter snapshot: preserve v2-only delta state. Different
  // encounter (or no prev): start fresh — v2 deltas don't apply.
  const sameEncounter =
    prev !== undefined && prev.encounterId === proto.encounterId;

  return {
    encounterId: proto.encounterId,
    dungeonId: proto.dungeonId,
    entities: new Map(Object.entries(proto.entities ?? {})),
    rooms: new Map(Object.entries(proto.rooms ?? {})),
    currentRoomId: proto.currentRoomId,
    revealedRoomIds: proto.revealedRoomIds,
    // v2 reveals come back via the stream's GeometryRevealed deltas; preserve
    // across same-encounter v1 snapshots (deltas aren't replayed on sync).
    revealedHexes: sameEncounter ? prev.revealedHexes : new Set(),
    combat: proto.combat ?? null,
    doors: new Map(Object.entries(proto.doors ?? {})),
    // v2 door state comes back via the stream's DoorOpened deltas; preserve
    // across same-encounter v1 snapshots (deltas aren't replayed on sync).
    openDoors: sameEncounter ? prev.openDoors : new Set(),
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
 * Add hexes to the per-hex reveal set without dropping previously revealed hexes.
 * Uses hexKey() for stable 'q,r,s' string keys. Idempotent — re-adding an
 * already-revealed hex is a no-op (Set semantics).
 * Exported for testing.
 */
export function applyHexRevealed(
  prev: LocalEncounterState,
  hexes: CubeHexCoord[]
): LocalEncounterState {
  const next = new Set(prev.revealedHexes);
  for (const h of hexes) {
    next.add(hexKey(h));
  }
  return { ...prev, revealedHexes: next };
}

/**
 * Add or revive an entity in the store at its first-visible position.
 * Clears the ghost flag unconditionally — the entity is now visible.
 * Overwrites any prior entry with the same entityId (e.g. a ghosted entity
 * that just re-entered the player's line of sight).
 * Exported for testing.
 */
export function applyEntityAppeared(
  prev: LocalEncounterState,
  entity: EntityState
): LocalEncounterState {
  const newEntities = new Map(prev.entities);
  newEntities.set(entity.entityId, { ...entity, ghost: false });
  return { ...prev, entities: newEntities };
}

/**
 * Mark an entity as ghosted (no longer visible) and update its position to
 * the last known hex. Renders ghosts at the last place the player saw them.
 * No-op if the entity is not currently tracked (defensive guard).
 * Exported for testing.
 */
export function applyEntityDisappeared(
  prev: LocalEncounterState,
  entityId: string,
  lastKnown: CubeHexCoord
): LocalEncounterState {
  const existing = prev.entities.get(entityId);
  if (!existing) return prev;
  const newEntities = new Map(prev.entities);
  newEntities.set(entityId, {
    ...existing,
    ghost: true,
    position: create(PositionSchema, {
      x: lastKnown.q,
      y: lastKnown.r,
      z: lastKnown.s,
    }),
  });
  return { ...prev, entities: newEntities };
}

/**
 * Mark a door as open by entity id (v1alpha2 DoorOpened.doorEntityId).
 * Idempotent — re-opening an already-open door is a no-op (Set semantics).
 * Does not touch the per-hex revealedHexes set; the toolkit emits a parallel
 * GeometryRevealed event for the newly-visible cells (cause/effect split),
 * which the existing applyHexRevealed reducer handles.
 * Exported for testing.
 */
export function applyDoorOpened(
  prev: LocalEncounterState,
  doorEntityId: string
): LocalEncounterState {
  if (prev.openDoors.has(doorEntityId)) return prev;
  const next = new Set(prev.openDoors);
  next.add(doorEntityId);
  return { ...prev, openDoors: next };
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
  // v1alpha2 additions
  /** Add hexes to the per-hex reveal set (additive, idempotent) */
  applyHexRevealed: (hexes: CubeHexCoord[]) => void;
  /** Add or revive an entity at its first-visible position, clearing ghost */
  applyEntityAppeared: (entity: EntityState) => void;
  /** Mark entity as ghosted at last known position; no-op if not tracked */
  applyEntityDisappeared: (entityId: string, lastKnown: CubeHexCoord) => void;
  /** Mark a door entity as open; idempotent. */
  applyDoorOpened: (doorEntityId: string) => void;
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
    // Pass `prev` so v2-only delta state (openDoors, revealedHexes) survives
    // a v1alpha1 snapshot for the same encounter. v1 snapshots don't carry
    // these fields and v2 deltas aren't replayed on sync, so without this
    // any v1 state-sync mid-session would silently wipe opened doors.
    setState((prev) => applySnapshotToState(proto, prev));
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

  const applyHexRevealedCallback = useCallback((hexes: CubeHexCoord[]) => {
    setState((prev) => applyHexRevealed(prev, hexes));
  }, []);

  const applyEntityAppearedCallback = useCallback((entity: EntityState) => {
    setState((prev) => applyEntityAppeared(prev, entity));
  }, []);

  const applyEntityDisappearedCallback = useCallback(
    (entityId: string, lastKnown: CubeHexCoord) => {
      setState((prev) => applyEntityDisappeared(prev, entityId, lastKnown));
    },
    []
  );

  const applyDoorOpenedCallback = useCallback((doorEntityId: string) => {
    setState((prev) => applyDoorOpened(prev, doorEntityId));
  }, []);

  return {
    state,
    applySnapshot,
    applyEntityUpdates,
    applyEntityPositionUpdate,
    applyCombatState,
    reset,
    applyHexRevealed: applyHexRevealedCallback,
    applyEntityAppeared: applyEntityAppearedCallback,
    applyEntityDisappeared: applyEntityDisappearedCallback,
    applyDoorOpened: applyDoorOpenedCallback,
  };
}
