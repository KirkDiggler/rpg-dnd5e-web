/**
 * useEncounterState - Manages unified entity state for an encounter
 *
 * Single authoritative store for entity/turn/prompt state, keyed by entity
 * ID and populated exclusively from the v1alpha2 StreamEncounter's delta
 * events. Trimmed in slice 3 (rpg-dnd5e-web #447) to drop the v1alpha1
 * snapshot-replace path (`applySnapshot`/`applyEntityUpdates`/
 * `applyCombatState`, plus the `rooms`/`currentRoomId`/`revealedRoomIds`/
 * `combat`/`doors`/`dungeonState`/`roomsCleared` fields they populated) that
 * only LobbyView drove; every field/reducer left here is exercised by
 * EncounterView and/or the playtest harness.
 *
 * Part of the unified entity state refactor (rpg-dnd5e-web feat-unified-entity-state).
 */

import { create } from '@bufbuild/protobuf';
import {
  PositionSchema,
  type Position,
} from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/room_common_pb';
import type { EntityState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
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
import type {
  InputRequired,
  TurnState,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
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
  /** v1alpha2-revealed hexes (per-hex granularity). */
  revealedHexes: Set<string>;
  /**
   * v1alpha2 open-door entity IDs. Populated by `applyDoorOpened` from the
   * DoorOpened event, keyed by the proto's `door_entity_id`. Renderers
   * consult this set to decide whether to draw a door's wall as a passage.
   */
  openDoors: Set<string>;
  /**
   * v1alpha2 per-entity hit points keyed by entity id. Populated by
   * `applyEntityDamaged` from EntityDamaged.hp_after. Authoritative HP for
   * combat rendering — server-emitted, never client-computed.
   */
  entityHP: Map<string, EntityHP>;
  /**
   * Per-entity armor class keyed by entity id. Populated by
   * `applyEntityAppearedBatch`/`applyEntityMetaFromAppeared` from the
   * entity's initial AC. Absent for entities that have not yet appeared.
   */
  entityAC: Map<string, number>;
  /**
   * v1alpha2 active conditions per entity, keyed by entity id. Populated by
   * `applyStatusApplied`. Conditions with the same `source` ref replace each
   * other; multiple distinct conditions stack.
   */
  entityStatuses: Map<string, EntityStatus[]>;
  /**
   * v1alpha2 entity identity metadata keyed by entity id. Populated by
   * `applyEntityMetaFromAppeared` (reducer) / `applyEntityMeta` (hook callback)
   * from EntityAppeared.entity fields. Carries type and monster ref id; kept
   * separate from the v1alpha1 EntityState store so neither v1 nor v2 entity
   * shapes need to import the other.
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
  /**
   * TakeAction wave (#426): the server-authored live turn state — economy
   * (actions / bonus / reaction / movement remaining) + the available_actions
   * menu. Pushed wholesale on the stream via TurnStateChanged (Invariant 12, no
   * polling); the active actor's snapshot also seeds it. NULL until the first
   * TurnStateChanged / snapshot carrying it arrives.
   *
   * The web renders this verbatim — it groups available_actions by economy_slot,
   * disables entries where available=false (showing unavailable_reason), and
   * raises the targeting prompt per target_kind. NO availability / legality /
   * cost is computed client-side; the server's verdict is the only source.
   */
  turnState: TurnState | null;
  /**
   * v1alpha2 pending prompt from Interact or TakeAction response. Callers set
   * this explicitly via `setPendingPrompt(response.inputRequired)` after an RPC
   * returns with inputRequired set, and clear it via `setPendingPrompt(null)`
   * after SubmitCheck resolves. Never auto-set inside hooks — keeps hooks pure.
   */
  pendingPrompt: InputRequired | null;
  /**
   * v1alpha2 encounter lifecycle status. "active" until EncounterEnded arrives,
   * then "ended". The UI uses this to render the encounter-ended banner and
   * disable courtesy-UX buttons (the server rejects requests anyway once ended).
   */
  encounterStatus: 'active' | 'ended';
  /**
   * Human-readable reason from the EncounterEnded event (e.g. "all hostiles
   * defeated"). Empty string until EncounterEnded arrives.
   */
  encounterEndedReason: string;
  /**
   * Wave 2.11d reaction readiness per character.
   *
   * Map<entityId, Map<reactionRef, ready>>. Mirrors the server-side
   * encounter Data.ReactionReadiness shape.
   *
   * Tri-state semantics for the inner value:
   *   - `true`  → server confirmed (or optimistic client wrote) that the
   *               reaction is ready
   *   - `false` → server confirmed (or optimistic client wrote) that the
   *               reaction is unready
   *   - missing entry (Map.get returns undefined) → state is UNKNOWN. The
   *               UI MUST NOT display a unready/ready boolean for these;
   *               render the "unknown" affordance and let the player's
   *               first toggle resolve it.
   *
   * Populated exclusively by setReactionReadyLocal — the caller invokes it
   * after a successful SetReactionReady RPC (which returns an empty response)
   * to reflect the new readiness state in the panel without waiting for the
   * next stream snapshot.
   *
   * Per #410: snapshots do not carry reaction_readiness today (proto gap
   * filed as rpg-api-protos#158 — the encounter SDK seeds OA default-on at
   * AddPlayer for melee combatants but that state never crosses the wire).
   * Until the proto extension lands the panel cannot know server-seeded
   * defaults and must display "unknown" for any entry the user hasn't
   * explicitly toggled this session — the previous default-to-false behavior
   * misrepresented server-seeded OA as unready and made the first click
   * send `ready=true` to a server that already considered it ready.
   *
   * The reaction ref key matches the canonical core.Ref string format:
   * "dnd5e:conditions:opportunity_attack", "dnd5e:spells:shield", etc.
   *
   * UI consumes via reactionReadiness.get(entityId)?.get(refStr) — DO NOT
   * fall back to `false` for `undefined`; that is the unknown signal.
   */
  reactionReadiness: Map<string, Map<string, boolean>>;
}

/** Create an empty LocalEncounterState. Exported for testing. */
export function createEmptyEncounterState(): LocalEncounterState {
  return {
    encounterId: '',
    dungeonId: '',
    entities: new Map(),
    revealedHexes: new Set(),
    openDoors: new Set(),
    entityHP: new Map(),
    entityAC: new Map(),
    entityStatuses: new Map(),
    entityMeta: new Map(),
    initiativeOrder: [],
    mode: EncounterMode.UNSPECIFIED,
    activeEntityId: '',
    round: 0,
    turnState: null,
    pendingPrompt: null,
    encounterStatus: 'active',
    encounterEndedReason: '',
    reactionReadiness: new Map(),
  };
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
 * Apply a batch of entity appearances — each carrying both the v1alpha1
 * positional stub AND v1alpha2 meta (type, monsterRefId, initialHP, initialAC) — in a
 * single state update. Use this instead of calling applyEntityAppeared +
 * applyEntityMeta per entity in a loop (which triggers N intermediate renders
 * and N Map clone operations for N entities).
 *
 * Exported for testing.
 */
export function applyEntityAppearedBatch(
  prev: LocalEncounterState,
  entries: Array<{
    entity: EntityState;
    type: EntityType;
    monsterRefId: string | undefined;
    initialHP: { current: number; max: number } | undefined;
    initialAC: number | undefined;
  }>
): LocalEncounterState {
  if (entries.length === 0) return prev;
  const newEntities = new Map(prev.entities);
  const newMeta = new Map(prev.entityMeta);
  const newHP = new Map(prev.entityHP);
  const newAC = new Map(prev.entityAC);
  let hpChanged = false;
  let acChanged = false;
  for (const { entity, type, monsterRefId, initialHP, initialAC } of entries) {
    newEntities.set(entity.entityId, { ...entity, ghost: false });
    newMeta.set(entity.entityId, { type, monsterRefId });
    if (initialHP !== undefined) {
      newHP.set(entity.entityId, {
        current: initialHP.current,
        max: initialHP.max,
      });
      hpChanged = true;
    }
    if (initialAC !== undefined && initialAC !== 0) {
      newAC.set(entity.entityId, initialAC);
      acChanged = true;
    }
  }
  return {
    ...prev,
    entities: newEntities,
    entityMeta: newMeta,
    entityHP: hpChanged ? newHP : prev.entityHP,
    entityAC: acChanged ? newAC : prev.entityAC,
  };
}

/**
 * Record v1alpha2 entity identity metadata from an EntityAppeared event.
 *
 * Stores type and (for monsters) monsterRef.id in `entityMeta` so the harness
 * can render a type column and monster identifier without storing the full
 * v1alpha2 Entity proto. Also seeds `entityHP` and `entityAC` when the entity
 * carries those values — this populates HP/AC in the entities table before any
 * damage events land.
 *
 * Idempotent on a same-entity / same-meta re-appear: the meta entry is always
 * overwritten (the server's word is authoritative). Exported for testing.
 */
export function applyEntityMetaFromAppeared(
  prev: LocalEncounterState,
  entityId: string,
  type: EntityType,
  monsterRefId: string | undefined,
  initialHP: { current: number; max: number } | undefined,
  initialAC: number | undefined
): LocalEncounterState {
  const newMeta = new Map(prev.entityMeta);
  newMeta.set(entityId, { type, monsterRefId });

  const hasHP = initialHP !== undefined;
  const hasAC = initialAC !== undefined && initialAC !== 0;

  if (hasHP || hasAC) {
    const newHP = hasHP ? new Map(prev.entityHP) : prev.entityHP;
    if (hasHP) {
      newHP.set(entityId, { current: initialHP!.current, max: initialHP!.max });
    }
    const newAC = hasAC ? new Map(prev.entityAC) : prev.entityAC;
    if (hasAC) {
      newAC.set(entityId, initialAC!);
    }
    return { ...prev, entityMeta: newMeta, entityHP: newHP, entityAC: newAC };
  }

  return { ...prev, entityMeta: newMeta };
}

/**
 * Apply v1alpha2 encounter mode + turn state from a SnapshotDelivered event.
 * Updates `mode`, `initiativeOrder`, `activeEntityId`, and `round` from the
 * snapshot without touching HP / statuses / doors / hexes (those flow only
 * via delta events).
 *
 * When `turnState` is undefined OR `encounterMode` is not TURN_BASED,
 * initiative-order fields are cleared to prevent stale combat data from
 * showing in the UI after an encounter exits TURN_BASED mode. Exported for testing.
 */
export function applySnapshotTurnState(
  prev: LocalEncounterState,
  encounterMode: EncounterMode,
  turnState: TurnState | undefined
): LocalEncounterState {
  const modeChanged = prev.mode !== encounterMode;
  const inTurnBased = encounterMode === EncounterMode.TURN_BASED;

  // When not in TURN_BASED (or turnState absent), clear combat fields so the UI
  // does not show stale initiative data from a prior combat. Return prev unchanged
  // only if there is truly nothing to update (avoids a spurious React re-render).
  if (!inTurnBased || turnState === undefined) {
    const nothingChanged =
      !modeChanged &&
      prev.initiativeOrder.length === 0 &&
      prev.activeEntityId === '' &&
      prev.round === 0 &&
      prev.turnState === null;
    if (nothingChanged) return prev;
    return {
      ...prev,
      mode: encounterMode,
      initiativeOrder: [],
      activeEntityId: '',
      round: 0,
      // Clear the menu/economy too when leaving TURN_BASED — a stale menu from a
      // prior combat must not linger.
      turnState: null,
    };
  }
  return {
    ...prev,
    mode: encounterMode,
    initiativeOrder: turnState.initiativeOrder,
    activeEntityId: turnState.activeEntityId,
    round: turnState.round,
    // TakeAction wave (#426): seed the server-authored menu/economy from the
    // snapshot so the menu renders at turn start, before the first
    // TurnStateChanged push. Stored verbatim; web computes nothing.
    turnState,
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
 * Apply a StatusRemoved event: removes the condition matching `statusSource`
 * (module/type/id) from the target's status list. Rendering reads directly
 * from `entityStatuses`, so removing the entry here clears the badge
 * automatically — no separate UI-side bookkeeping needed.
 *
 * No-op (returns prev unchanged) when `statusSource` is missing (defensive —
 * proto field is optional), when the entity has no tracked statuses, or when
 * no entry matches the source ref (idempotent: a re-delivered or
 * out-of-order StatusRemoved is harmless). Exported for testing.
 */
export function applyStatusRemoved(
  prev: LocalEncounterState,
  event: StatusRemoved
): LocalEncounterState {
  const source = event.statusSource;
  if (!source) return prev;

  const existingList = prev.entityStatuses.get(event.entityId);
  if (!existingList) return prev;

  const filtered = existingList.filter(
    (s) =>
      !(
        s.source.module === source.module &&
        s.source.type === source.type &&
        s.source.id === source.id
      )
  );
  if (filtered.length === existingList.length) return prev;

  const newStatuses = new Map(prev.entityStatuses);
  if (filtered.length === 0) {
    newStatuses.delete(event.entityId);
  } else {
    newStatuses.set(event.entityId, filtered);
  }
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
 * Apply a TurnStateChanged event (TakeAction wave #426): swaps in the
 * server-authored TurnState (economy + available_actions menu) wholesale.
 *
 * The toolkit computes it, rpg-api projects it field-for-field, the web renders
 * it. No availability is recomputed client-side. If `turnState` is missing
 * (defensive — proto field is optional) the call is a no-op so a malformed wire
 * frame doesn't blank out the menu the player is acting from.
 * Exported for testing.
 */
export function applyTurnStateChanged(
  prev: LocalEncounterState,
  turnState: TurnState | undefined
): LocalEncounterState {
  if (!turnState) return prev;
  return { ...prev, turnState };
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
 * Apply an EntityDied event. The entity stays in the entities map (it is
 * still rendered) until EntityRemoved arrives. This reducer is intentionally
 * minimal — it returns prev unchanged so any caller that only wants a log
 * line can skip mutating state. Exported for testing.
 */
export function applyEntityDied(
  prev: LocalEncounterState,
  event: EntityDied
): LocalEncounterState {
  // No state mutation: entity remains rendered until EntityRemoved.
  // UI log narration ("alice killed goblin-1") is the caller's responsibility.
  // The event parameter is part of the reducer contract; callers may inspect
  // event.entityId / event.killerEntityId for log narration without mutating state.
  void event;
  return prev;
}

/**
 * Remove an entity from the entities map after death or another removal reason.
 * Idempotent — if the entity is already missing (e.g. late-joining client that
 * received a snapshot after the removal), returns prev unchanged.
 * Exported for testing.
 */
export function applyEntityRemoved(
  prev: LocalEncounterState,
  event: EntityRemoved
): LocalEncounterState {
  if (!prev.entities.has(event.entityId)) return prev;
  const newEntities = new Map(prev.entities);
  newEntities.delete(event.entityId);
  return { ...prev, entities: newEntities };
}

/**
 * Mark the encounter as ended and record the reason from the EncounterEnded
 * event. Idempotent — re-applying an already-ended event with the same reason
 * returns the same reference.
 * Exported for testing.
 */
export function applyEncounterEnded(
  prev: LocalEncounterState,
  event: EncounterEnded
): LocalEncounterState {
  if (
    prev.encounterStatus === 'ended' &&
    prev.encounterEndedReason === event.reason
  ) {
    return prev;
  }
  return {
    ...prev,
    encounterStatus: 'ended',
    encounterEndedReason: event.reason,
  };
}

/**
 * Set or clear the pending prompt. Pass `null` to dismiss after SubmitCheck
 * resolves; pass the InputRequired proto from an Interact/TakeAction response
 * to surface it. Callers drive this explicitly — the hook never auto-sets it.
 * Exported for testing.
 */
export function setPendingPromptReducer(
  prev: LocalEncounterState,
  prompt: InputRequired | null
): LocalEncounterState {
  if (prev.pendingPrompt === prompt) return prev;
  return { ...prev, pendingPrompt: prompt };
}

/**
 * Wave 2.11d — set or clear a reaction's readiness for a single character.
 *
 * Callers invoke this after a successful SetReactionReady RPC to reflect the
 * new readiness state in the UI without waiting for the next stream snapshot
 * (server is source of truth; this is an optimistic mirror). The ready-
 * reactions panel reads from state.reactionReadiness directly.
 *
 * Idempotent: setting a value identical to the current returns prev unchanged.
 * Exported for testing.
 */
export function setReactionReadyLocalReducer(
  prev: LocalEncounterState,
  entityId: string,
  reactionRef: string,
  ready: boolean
): LocalEncounterState {
  const charMap = prev.reactionReadiness.get(entityId);
  if (charMap?.get(reactionRef) === ready) return prev;

  const next = new Map(prev.reactionReadiness);
  const nextCharMap = new Map(charMap ?? []);
  nextCharMap.set(reactionRef, ready);
  next.set(entityId, nextCharMap);
  return { ...prev, reactionReadiness: next };
}

export interface UseEncounterStateResult {
  state: LocalEncounterState;
  /**
   * Update only the position of an existing entity. Used as a fallback for
   * MovementCompletedEvent when the API omits updatedEntity but sends path[].
   * No-op if the entity is not already in state.
   */
  applyEntityPositionUpdate: (entityId: string, position: Position) => void;
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
   * Also seeds entityHP from entity.hp and entityAC from entity.armor_class.
   * Call after applyEntityAppeared so the v1alpha1 stub and v2 meta are both stored.
   */
  applyEntityMeta: (
    entityId: string,
    type: EntityType,
    monsterRefId: string | undefined,
    initialHP: { current: number; max: number } | undefined,
    initialAC: number | undefined
  ) => void;
  /**
   * Apply a batch of entity appearances in a single state update to avoid N
   * intermediate renders when seeding multiple entities from a snapshot.
   * Each entry carries the v1alpha1 positional stub plus v1alpha2 type/HP/AC/meta.
   */
  applyEntityAppearedBatch: (
    entries: Array<{
      entity: EntityState;
      type: EntityType;
      monsterRefId: string | undefined;
      initialHP: { current: number; max: number } | undefined;
      initialAC: number | undefined;
    }>
  ) => void;
  /**
   * Apply v1alpha2 turn state from a SnapshotDelivered event.
   * Updates initiativeOrder, activeEntityId, round, and mode without touching
   * HP / statuses / doors (those flow only via delta events). Also seeds the
   * server-authored menu/economy (turnState) so the menu renders at turn start
   * before the first TurnStateChanged push (TakeAction wave #426).
   */
  applySnapshotTurnState: (
    encounterMode: EncounterMode,
    turnState: TurnState | undefined
  ) => void;
  // v1alpha2 prompts (Wave 2.9)
  /**
   * Set or clear the pending InputRequired prompt. Pass the proto from an
   * Interact/TakeAction response to display the prompt; pass null to dismiss it
   * after SubmitCheck resolves. Never called automatically inside hooks.
   */
  setPendingPrompt: (prompt: InputRequired | null) => void;
  // v1alpha2 reactions (Wave 2.11d)
  /**
   * Set a reaction's readiness for one character. Called by the harness
   * after a successful SetReactionReady RPC to reflect the new state in
   * the ready-reactions panel without waiting for the next stream snapshot.
   * Server is source of truth — this is an optimistic local mirror.
   */
  setReactionReadyLocal: (
    entityId: string,
    reactionRef: string,
    ready: boolean
  ) => void;
  // v1alpha2 combat (Wave 2.8)
  /** Update an entity's HP from an EntityDamaged event's hp_after field. */
  applyEntityDamaged: (event: EntityDamaged) => void;
  /** Append (or replace by source ref) a status effect on an entity. */
  applyStatusApplied: (event: StatusApplied) => void;
  /** Remove a status effect matching the event's source ref from an entity. */
  applyStatusRemoved: (event: StatusRemoved) => void;
  /** Update encounter mode from a ModeChanged event. */
  applyModeChanged: (event: ModeChanged) => void;
  /** Set active actor + round from a TurnStarted event. */
  applyTurnStarted: (event: TurnStarted) => void;
  /** Hook for TurnEnded (currently no-op; reserved for future per-turn UI). */
  applyTurnEnded: () => void;
  /**
   * TakeAction wave (#426): swap in the server-authored TurnState (economy +
   * available_actions menu) from a TurnStateChanged event. No-op if undefined.
   */
  applyTurnStateChanged: (turnState: TurnState | undefined) => void;
  // v1alpha2 death + resolution (Wave 2.10)
  /**
   * No-op state reducer for EntityDied — entity stays rendered until
   * EntityRemoved. Log narration is the caller's responsibility.
   */
  applyEntityDied: (event: EntityDied) => void;
  /**
   * Remove an entity from the entities map. Idempotent — no-op if already
   * missing (handles snapshot-after-removal for late-joining clients).
   */
  applyEntityRemoved: (event: EntityRemoved) => void;
  /**
   * Set encounterStatus = "ended" and store the reason for UI display.
   * Idempotent — no-op if already ended with the same reason.
   */
  applyEncounterEnded: (event: EncounterEnded) => void;
}

/**
 * Hook to manage unified encounter entity state.
 * Single store for all entity state in an encounter.
 */
export function useEncounterState(): UseEncounterStateResult {
  const [state, setState] = useState<LocalEncounterState>(
    createEmptyEncounterState
  );

  const applyEntityPositionUpdate = useCallback(
    (entityId: string, position: Position) => {
      setState((prev) => mergeEntityPosition(prev, entityId, position));
    },
    []
  );

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
      initialHP: { current: number; max: number } | undefined,
      initialAC: number | undefined
    ) => {
      setState((prev) =>
        applyEntityMetaFromAppeared(
          prev,
          entityId,
          type,
          monsterRefId,
          initialHP,
          initialAC
        )
      );
    },
    []
  );

  const applyEntityAppearedBatchCallback = useCallback(
    (
      entries: Array<{
        entity: EntityState;
        type: EntityType;
        monsterRefId: string | undefined;
        initialHP: { current: number; max: number } | undefined;
        initialAC: number | undefined;
      }>
    ) => {
      setState((prev) => applyEntityAppearedBatch(prev, entries));
    },
    []
  );

  const applySnapshotTurnStateCallback = useCallback(
    (encounterMode: EncounterMode, turnState: TurnState | undefined) => {
      setState((prev) =>
        applySnapshotTurnState(prev, encounterMode, turnState)
      );
    },
    []
  );

  const applyTurnStateChangedCallback = useCallback(
    (turnState: TurnState | undefined) => {
      setState((prev) => applyTurnStateChanged(prev, turnState));
    },
    []
  );

  const setPendingPromptCallback = useCallback(
    (prompt: InputRequired | null) => {
      setState((prev) => setPendingPromptReducer(prev, prompt));
    },
    []
  );

  const setReactionReadyLocalCallback = useCallback(
    (entityId: string, reactionRef: string, ready: boolean) => {
      setState((prev) =>
        setReactionReadyLocalReducer(prev, entityId, reactionRef, ready)
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

  const applyStatusRemovedCallback = useCallback((event: StatusRemoved) => {
    setState((prev) => applyStatusRemoved(prev, event));
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

  const applyEntityDiedCallback = useCallback((event: EntityDied) => {
    setState((prev) => applyEntityDied(prev, event));
  }, []);

  const applyEntityRemovedCallback = useCallback((event: EntityRemoved) => {
    setState((prev) => applyEntityRemoved(prev, event));
  }, []);

  const applyEncounterEndedCallback = useCallback((event: EncounterEnded) => {
    setState((prev) => applyEncounterEnded(prev, event));
  }, []);

  return {
    state,
    applyEntityPositionUpdate,
    reset,
    applyHexRevealed: applyHexRevealedCallback,
    applyEntityAppeared: applyEntityAppearedCallback,
    applyEntityDisappeared: applyEntityDisappearedCallback,
    applyDoorOpened: applyDoorOpenedCallback,
    applyEntityMeta: applyEntityMetaCallback,
    applyEntityAppearedBatch: applyEntityAppearedBatchCallback,
    applySnapshotTurnState: applySnapshotTurnStateCallback,
    setPendingPrompt: setPendingPromptCallback,
    setReactionReadyLocal: setReactionReadyLocalCallback,
    applyEntityDamaged: applyEntityDamagedCallback,
    applyStatusApplied: applyStatusAppliedCallback,
    applyStatusRemoved: applyStatusRemovedCallback,
    applyModeChanged: applyModeChangedCallback,
    applyTurnStarted: applyTurnStartedCallback,
    applyTurnEnded: applyTurnEndedCallback,
    applyTurnStateChanged: applyTurnStateChangedCallback,
    applyEntityDied: applyEntityDiedCallback,
    applyEntityRemoved: applyEntityRemovedCallback,
    applyEncounterEnded: applyEncounterEndedCallback,
  };
}
