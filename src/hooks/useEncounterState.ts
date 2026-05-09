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
import type {
  EntityDamaged,
  ModeChanged,
  StatusApplied,
  TurnStarted,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';
import {
  EncounterMode,
  EntityType,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { useCallback, useState } from 'react';
import { hexKey, type CubeHexCoord } from '../utils/hexCoord';

/** v1alpha2 per-entity HP, populated from EntityDamaged.hp_after. */
export interface EntityHP {
  current: number;
  max: number;
}

/**
 * v1alpha2 entity identity metadata, populated from EntityAppeared.entity.
 * Carries type and monster ref id so the harness can label entity rows without
 * storing the full v1alpha2 Entity proto alongside the v1alpha1 EntityState.
 */
export interface EntityMeta {
  /** v1alpha2 EntityType discriminator (CHARACTER, MONSTER, etc.). */
  type: EntityType;
  /**
   * For MONSTER entities: the monster_ref id (e.g. "goblin").
   * Undefined for non-monster entities.
   */
  monsterRefId?: string;
}

/** v1alpha2 condition tag, populated from StatusApplied.status. */
export interface EntityStatus {
  /** {module, type:"condition", id:"poisoned"} — the condition's source ref. */
  source: { module: string; type: string; id: string };
  /** Display label from the proto's StatusEffect.display_name (may be empty). */
  displayName: string;
  /** Source entity that applied the condition (may be undefined). */
  sourceEntityId?: string;
}

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
  /**
   * v1alpha2 per-entity hit points keyed by entity id. Populated by
   * `applyEntityDamaged` from EntityDamaged.hp_after. Authoritative HP for
   * combat rendering — server-emitted, never client-computed.
   */
  entityHP: Map<string, EntityHP>;
  /**
   * v1alpha2 active conditions per entity, keyed by entity id. Populated by
   * `applyStatusApplied`. Conditions with the same `source` ref replace each
   * other; multiple distinct conditions stack.
   */
  entityStatuses: Map<string, EntityStatus[]>;
  /**
   * v1alpha2 entity identity metadata keyed by entity id. Populated by
   * `applyEntityAppearedV2` from EntityAppeared.entity fields. Carries type
   * and monster ref id; kept separate from the v1alpha1 EntityState store so
   * neither v1 nor v2 entity shapes need to import the other.
   */
  entityMeta: Map<string, EntityMeta>;
  /**
   * v1alpha2 initiative order — the ordered list of entity ids for the current
   * round. Populated from SnapshotDelivered.encounter.turnState.initiativeOrder.
   * Empty array when not in TURN_BASED mode or when no snapshot has arrived.
   */
  initiativeOrder: string[];
  /**
   * v1alpha2 encounter mode. UNSPECIFIED until ModeChanged or a snapshot
   * sets it. Combat controls in the harness gate on this being TURN_BASED.
   */
  mode: EncounterMode;
  /**
   * v1alpha2 active actor's entity id (whose turn it is). Empty string when
   * not in TURN_BASED. Set by TurnStarted; not cleared by TurnEnded — the
   * next TurnStarted overwrites it. The harness's "is it my turn?" check
   * compares this to the local player's character id.
   */
  activeEntityId: string;
  /**
   * v1alpha2 turn-based round number. Set by TurnStarted; persists between
   * turns of the same round.
   */
  round: number;
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
    entityHP: new Map(),
    entityStatuses: new Map(),
    entityMeta: new Map(),
    initiativeOrder: [],
    mode: EncounterMode.UNSPECIFIED,
    activeEntityId: '',
    round: 0,
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
 * NOT carry v2 deltas like `openDoors`, `revealedHexes`, `entityHP`,
 * `entityStatuses`, `mode`, `activeEntityId`, or `round` — those flow only
 * via the v2 StreamEncounter (DoorOpened, GeometryRevealed, EntityDamaged,
 * StatusApplied, ModeChanged, TurnStarted, TurnEnded) and are not replayed
 * on reconnect or v1 state-sync events. If we rebuilt the whole state on
 * every snapshot we'd silently wipe every v2 delta we'd accumulated in the
 * session.
 *
 * Mitigation: when `prev` is provided AND the snapshot is for the SAME
 * encounter (same encounterId), carry forward all v2-only fields. On
 * encounter switch (different encounterId) we reset.
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
    // v2 combat state (HP, statuses, mode, active actor, round) flow only via
    // EntityDamaged / StatusApplied / ModeChanged / TurnStarted events;
    // preserve across same-encounter v1 snapshots (deltas aren't replayed).
    entityHP: sameEncounter ? prev.entityHP : new Map(),
    entityStatuses: sameEncounter ? prev.entityStatuses : new Map(),
    // v2 entity identity metadata (type, monster ref) flows only via
    // EntityAppeared — not replayed on v1 snapshots. Preserve across same-encounter syncs.
    entityMeta: sameEncounter ? prev.entityMeta : new Map(),
    // Initiative order comes from SnapshotDelivered.encounter.turnState; the
    // v1 snapshot path doesn't carry it. Preserve on same-encounter syncs.
    initiativeOrder: sameEncounter ? prev.initiativeOrder : [],
    mode: sameEncounter ? prev.mode : EncounterMode.UNSPECIFIED,
    activeEntityId: sameEncounter ? prev.activeEntityId : '',
    round: sameEncounter ? prev.round : 0,
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
 * Record v1alpha2 entity identity metadata from an EntityAppeared event.
 *
 * Stores type and (for monsters) monsterRef.id in `entityMeta` so the harness
 * can render a type column and monster identifier without storing the full
 * v1alpha2 Entity proto. Also seeds `entityHP` if the entity carries initial
 * HP — this populates HP in the entities table before any damage events land,
 * fixing the issue where snapshot-seeded monsters showed no HP until first hit.
 *
 * Idempotent on a same-entity / same-meta re-appear: the meta entry is always
 * overwritten (the server's word is authoritative). Exported for testing.
 */
export function applyEntityMetaFromAppeared(
  prev: LocalEncounterState,
  entityId: string,
  type: EntityType,
  monsterRefId: string | undefined,
  initialHP: { current: number; max: number } | undefined
): LocalEncounterState {
  const newMeta = new Map(prev.entityMeta);
  newMeta.set(entityId, { type, monsterRefId });

  // Seed HP only when the entity carries initial HP and we don't already have
  // a server-authoritative damage event for it (damage events are more recent).
  // We always overwrite here — EntityAppeared is the entity's birth event;
  // if the snapshot carries HP it supersedes any prior value.
  if (initialHP !== undefined) {
    const newHP = new Map(prev.entityHP);
    newHP.set(entityId, { current: initialHP.current, max: initialHP.max });
    return { ...prev, entityMeta: newMeta, entityHP: newHP };
  }

  return { ...prev, entityMeta: newMeta };
}

/**
 * Apply initiative order from a v1alpha2 snapshot's TurnState. Called when
 * onSnapshotDelivered carries a non-empty encounter.turnState. Updates
 * `initiativeOrder`, `activeEntityId`, `round`, and `mode` from the snapshot
 * without touching any other delta state (HP, statuses, doors, hexes).
 *
 * If `turnState` is undefined (encounter not yet in TURN_BASED mode), returns
 * prev unchanged. Exported for testing.
 */
export function applyV2SnapshotTurnState(
  prev: LocalEncounterState,
  encounterMode: EncounterMode,
  turnState:
    | { initiativeOrder: string[]; activeEntityId: string; round: number }
    | undefined
): LocalEncounterState {
  const modeChanged = prev.mode !== encounterMode;
  if (turnState === undefined) {
    // No turn state — only update mode if it changed.
    if (!modeChanged) return prev;
    return { ...prev, mode: encounterMode };
  }
  return {
    ...prev,
    mode: encounterMode,
    initiativeOrder: turnState.initiativeOrder,
    activeEntityId: turnState.activeEntityId,
    round: turnState.round,
  };
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
 * Apply an EntityDamaged event: writes the target's HP from `hp_after`.
 *
 * The server is authoritative — `event.amount` is informational; we do NOT
 * subtract it from a client-cached value. Always read `hp_after.{current,max}`
 * directly. Per #393's "no business logic in the web" rule, hit/miss/damage
 * resolution happens server-side and the wire-shape carries the resulting HP.
 *
 * If `hp_after` is missing (defensive — proto field is optional), the entry
 * is left untouched. Idempotent on identical hp_after values: returns the
 * same reference to skip a re-render.
 * Exported for testing.
 */
export function applyEntityDamaged(
  prev: LocalEncounterState,
  event: EntityDamaged
): LocalEncounterState {
  if (!event.hpAfter) return prev;
  const next: EntityHP = {
    current: event.hpAfter.current,
    max: event.hpAfter.max,
  };
  const existing = prev.entityHP.get(event.entityId);
  if (
    existing !== undefined &&
    existing.current === next.current &&
    existing.max === next.max
  ) {
    return prev;
  }
  const newHP = new Map(prev.entityHP);
  newHP.set(event.entityId, next);
  return { ...prev, entityHP: newHP };
}

/**
 * Apply a StatusApplied event: appends the condition to the target's status
 * list. Conditions sharing the same source ref ({module,type,id}) replace
 * each other (re-applying a condition extends/refreshes it server-side; the
 * client just mirrors the latest authoritative entry). Distinct conditions
 * stack.
 *
 * If `status` is missing (defensive — proto field is optional), the call is
 * a no-op. Exported for testing.
 */
export function applyStatusApplied(
  prev: LocalEncounterState,
  event: StatusApplied
): LocalEncounterState {
  const status = event.status;
  if (!status || !status.source) return prev;
  const sourceRef = {
    module: status.source.module,
    type: status.source.type,
    id: status.source.id,
  };
  const newStatus: EntityStatus = {
    source: sourceRef,
    displayName: status.displayName,
    sourceEntityId: event.sourceEntityId,
  };

  const existingList = prev.entityStatuses.get(event.entityId) ?? [];
  // Replace any prior entry with the same source ref; otherwise append.
  const filtered = existingList.filter(
    (s) =>
      !(
        s.source.module === sourceRef.module &&
        s.source.type === sourceRef.type &&
        s.source.id === sourceRef.id
      )
  );
  const nextList = [...filtered, newStatus];

  const newStatuses = new Map(prev.entityStatuses);
  newStatuses.set(event.entityId, nextList);
  return { ...prev, entityStatuses: newStatuses };
}

/**
 * Apply a ModeChanged event: updates the encounter's mode field.
 *
 * Idempotent if the mode is unchanged (returns the same reference).
 * Exported for testing.
 */
export function applyModeChanged(
  prev: LocalEncounterState,
  event: ModeChanged
): LocalEncounterState {
  if (prev.mode === event.to) return prev;
  return { ...prev, mode: event.to };
}

/**
 * Apply a TurnStarted event: updates `activeEntityId` and `round`.
 *
 * Idempotent on a same-actor / same-round event (returns the same reference).
 * Exported for testing.
 */
export function applyTurnStarted(
  prev: LocalEncounterState,
  event: TurnStarted
): LocalEncounterState {
  if (prev.activeEntityId === event.entityId && prev.round === event.round) {
    return prev;
  }
  return {
    ...prev,
    activeEntityId: event.entityId,
    round: event.round,
  };
}

/**
 * Apply a TurnEnded event. The next TurnStarted is the authoritative source
 * for the new active actor and round, so we do NOT clear `activeEntityId`
 * here — clearing it would race the TurnStarted that follows on the wire and
 * cause the harness to flicker through "(none)" between turns. This reducer
 * is currently a no-op on local state and exists for symmetry with the wire
 * event; future consumers (per-turn UI cleanup, animations) hook in here
 * without changing the dispatcher contract.
 *
 * Exported for testing.
 */
export function applyTurnEnded(prev: LocalEncounterState): LocalEncounterState {
  return prev;
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
  /**
   * Store v1alpha2 entity identity metadata from EntityAppeared.entity.
   * Also seeds entityHP from entity.hp when the entity carries initial HP.
   * Call after applyEntityAppeared so the v1alpha1 stub and v2 meta are both stored.
   */
  applyEntityMeta: (
    entityId: string,
    type: EntityType,
    monsterRefId: string | undefined,
    initialHP: { current: number; max: number } | undefined
  ) => void;
  /**
   * Apply v1alpha2 turn state from a SnapshotDelivered event.
   * Updates initiativeOrder, activeEntityId, round, and mode without touching
   * HP / statuses / doors (those flow only via delta events).
   */
  applyV2SnapshotTurnState: (
    encounterMode: EncounterMode,
    turnState:
      | { initiativeOrder: string[]; activeEntityId: string; round: number }
      | undefined
  ) => void;
  // v1alpha2 combat (Wave 2.8)
  /** Update an entity's HP from an EntityDamaged event's hp_after field. */
  applyEntityDamaged: (event: EntityDamaged) => void;
  /** Append (or replace by source ref) a status effect on an entity. */
  applyStatusApplied: (event: StatusApplied) => void;
  /** Update encounter mode from a ModeChanged event. */
  applyModeChanged: (event: ModeChanged) => void;
  /** Set active actor + round from a TurnStarted event. */
  applyTurnStarted: (event: TurnStarted) => void;
  /** Hook for TurnEnded (currently no-op; reserved for future per-turn UI). */
  applyTurnEnded: () => void;
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

  const applyEntityMetaCallback = useCallback(
    (
      entityId: string,
      type: EntityType,
      monsterRefId: string | undefined,
      initialHP: { current: number; max: number } | undefined
    ) => {
      setState((prev) =>
        applyEntityMetaFromAppeared(
          prev,
          entityId,
          type,
          monsterRefId,
          initialHP
        )
      );
    },
    []
  );

  const applyV2SnapshotTurnStateCallback = useCallback(
    (
      encounterMode: EncounterMode,
      turnState:
        | { initiativeOrder: string[]; activeEntityId: string; round: number }
        | undefined
    ) => {
      setState((prev) =>
        applyV2SnapshotTurnState(prev, encounterMode, turnState)
      );
    },
    []
  );

  const applyEntityDamagedCallback = useCallback((event: EntityDamaged) => {
    setState((prev) => applyEntityDamaged(prev, event));
  }, []);

  const applyStatusAppliedCallback = useCallback((event: StatusApplied) => {
    setState((prev) => applyStatusApplied(prev, event));
  }, []);

  const applyModeChangedCallback = useCallback((event: ModeChanged) => {
    setState((prev) => applyModeChanged(prev, event));
  }, []);

  const applyTurnStartedCallback = useCallback((event: TurnStarted) => {
    setState((prev) => applyTurnStarted(prev, event));
  }, []);

  const applyTurnEndedCallback = useCallback(() => {
    setState((prev) => applyTurnEnded(prev));
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
    applyEntityMeta: applyEntityMetaCallback,
    applyV2SnapshotTurnState: applyV2SnapshotTurnStateCallback,
    applyEntityDamaged: applyEntityDamagedCallback,
    applyStatusApplied: applyStatusAppliedCallback,
    applyModeChanged: applyModeChangedCallback,
    applyTurnStarted: applyTurnStartedCallback,
    applyTurnEnded: applyTurnEndedCallback,
  };
}
