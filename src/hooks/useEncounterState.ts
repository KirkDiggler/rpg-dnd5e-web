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
import type { Position } from '@kirkdiggler/rpg-api-protos/gen/ts/api/v1alpha1/room_common_pb';
import {
  EntityStateSchema,
  type EntityState,
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
import type {
  HexRecord,
  InputRequired,
  StatusEffect,
  TurnState,
  Wall,
  Zone,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import {
  EncounterMode,
  EntityType,
  HexState,
  WallKind,
  WallSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { useCallback, useState } from 'react';
import { v2PositionToV1 } from '../api/positionConvert';
import type {
  EquippedMap,
  ItemLike,
  SlotDefLike,
} from '../components/game/equipment/equipmentTypes';
import {
  hexKey,
  protoPositionToHex,
  type CubeHexCoord,
} from '../utils/hexCoord';
import { wallKey } from './dungeonMapGeometry';

/** v1alpha2 per-entity HP, populated from EntityDamaged.hp_after. */
export interface EntityHP {
  current: number;
  max: number;
}

/**
 * v1alpha2 entity identity metadata, populated from SnapshotDelivered's
 * per-entity batch (see `applyEntityAppearedBatch`).
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
  /**
   * Entity.display_name, verbatim off the wire — every entity carries one,
   * not just characters. Optional only because callers that predate this
   * field (tests) may omit it; production call sites always pass it.
   */
  displayName?: string;
  /**
   * For CHARACTER entities: CharacterData.class_ref.id (e.g. "fighter").
   * Undefined for non-character entities or when the server hasn't set a
   * class ref.
   */
  classRefId?: string;
  /**
   * For OBSTACLE entities: ObstacleData.obstacle_ref.id. For PROP entities:
   * PropData.prop_ref.id (e.g. "barrel", "pillar") — both cases feed the
   * same reference-key namespace (rpg-dnd5e-web#528, charter #523):
   * `dnd5e:props:<propRefId>` is looked up against the prop manifest
   * (propManifest.ts) to resolve a GLB. Undefined for every other entity
   * type, or when the server hasn't set a ref yet (today's real reality —
   * no server code path populates obstacle_ref/prop_ref yet; see
   * obstaclePropKeys.ts for the fallback v1alpha1 ObstacleType signal and
   * rpg-dnd5e-web#523 for the platform hand-off this field is waiting on).
   */
  propRefId?: string;
}

/**
 * v1alpha2 character equipment/inventory display fields (rpg-dnd5e-web#571),
 * populated from CharacterData.equipped/inventory/slots/armor_class_detail/
 * main_hand_damage — the encounter snapshot hydrates this for CHARACTER
 * entities the same way it hydrates HP/AC/statuses, so the equipment
 * popover never needs a separate fetch (rpg-dnd5e-web#557 CONTRACT.md §8).
 * Also refreshed locally after a successful EquipItem/UnequipItem RPC (see
 * applyCharacterEquipment below) — those RPCs are character-scoped and
 * push no stream event, so the acting client mirrors its own response
 * (rpg-api#681 tracks live push to OTHER clients, out of scope here).
 */
export interface CharacterEquipment {
  equipped: EquippedMap;
  inventory: ItemLike[];
  slots: SlotDefLike[];
  armorClassDetail: { total: number; note: string } | undefined;
  mainHandDamage: string;
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
  /**
   * All entities, keyed by entity ID. v2 may set entity.ghost on LoS loss.
   *
   * `movePath`/`moveSeq` (rpg-dnd5e-web#542): the real hex-by-hex route from
   * the most recent genuine `EntityMoved`/`MovementCompletedEvent`, set ONLY
   * by `mergeEntityPosition` (the sole reducer `onEntityMoved` feeds) — never
   * by `applyEntityAppearedBatch` (initial placement, revive-from-ghost),
   * which replaces the whole entity record with a fresh
   * `{...entity, ghost: false}` off the wire and so naturally clears both
   * fields back to undefined. This is what lets HexEntity's movement
   * interpolation key off "a real move just happened" without a separate
   * boolean: `moveSeq` only ever advances on a genuine move, so watching it
   * change is watching for exactly that, not mount/reconciliation/ghost
   * transitions. `moveSeq` is a monotonic counter (not just "movePath
   * present") specifically so two moves to the SAME destination in a row
   * (e.g. bounced off a wall and sent back) still each count as a fresh
   * move worth animating, not a no-op React dependency.
   */
  /**
   * `facing` (rpg-dnd5e-web unit/game-fidelity Bug B): the wire's
   * `Placement.facing` (v1alpha2 types_pb.ts — an authored runtime-override
   * hex-direction index, E=0/NE=1/NW=2/W=3/SW=4/SE=5, `optional uint32` so
   * presence distinguishes "no override" from explicit E=0), carried
   * through by `applyHexRecordsMerged`/`applyEntityAppearedBatch` alongside
   * `position` since both ride the SAME `Placement` record on the wire.
   * Undefined means no authored override — the renderer keeps whatever
   * default orientation it already uses (unchanged from every pre-existing
   * caller). See `facingByEntityIdFromHexes`'s doc comment for the
   * snapshot-hydration counterpart of this same field.
   */
  entities: Map<
    string,
    EntityState & {
      ghost?: boolean;
      movePath?: Position[];
      moveSeq?: number;
      facing?: number;
    }
  >;
  /** v1alpha2-revealed hexes, keyed by stable cube coordinate. */
  revealedHexes: Map<string, HexRecord>;
  /** Compatibility projection for existing undifferentiated floor consumers. */
  revealedHexKeys: Set<string>;
  /** Server-authored dungeon-wide visual family, absent when unspecified. */
  theme: string | undefined;
  /** Server-authored zones keyed by their stable wire ID. */
  zones: Map<string, Zone>;
  /**
   * v1alpha2 revealed walls, keyed by `wallKey` (canonical, direction-
   * normalized). Sticky like `revealedHexes` — populated from the
   * snapshot's `Space.walls` and merged from `GeometryRevealed.walls`,
   * never removed. Unlike `revealedHexes` (a bare position `Set`), this
   * keeps the full `Wall` (including `kind`) since renderers need it to
   * distinguish solid/door/window segments.
   */
  walls: Map<string, Wall>;
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
   * `applyEntityAppearedBatch` from each SnapshotDelivered entity's fields.
   * Carries type and monster ref id; kept separate from the v1alpha1
   * EntityState store so neither v1 nor v2 entity shapes need to import the
   * other.
   */
  entityMeta: Map<string, EntityMeta>;
  /**
   * v1alpha2 character equipment/inventory display fields keyed by entity
   * id (rpg-dnd5e-web#571). Populated for CHARACTER entities only —
   * monsters/props/etc. never have an entry. See CharacterEquipment's doc
   * comment for the two write paths (snapshot hydration, RPC-response
   * local mirror).
   */
  characterEquipment: Map<string, CharacterEquipment>;
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
    revealedHexes: new Map(),
    revealedHexKeys: new Set(),
    theme: undefined,
    zones: new Map(),
    walls: new Map(),
    openDoors: new Set(),
    entityHP: new Map(),
    entityAC: new Map(),
    entityStatuses: new Map(),
    entityMeta: new Map(),
    characterEquipment: new Map(),
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
 * `path` (rpg-dnd5e-web#542, optional): the move's full real hex-by-hex
 * route (`EntityMoved.actualPath`/`MovementCompletedEvent.path`, converted
 * to v1 `Position`), stashed as `movePath` alongside a bumped `moveSeq` so
 * HexEntity's movement interpolation can step through it instead of
 * snapping straight to the destination. Omitted (or empty) leaves both
 * fields untouched — every pre-#542 call site keeps working unchanged, and
 * a caller that genuinely has no path (shouldn't happen for a real
 * `EntityMoved`, but defensive) degrades to the old teleport behavior
 * rather than throwing. `moveSeq` increments rather than just tracking
 * "movePath present" so two consecutive moves to the same destination
 * (e.g. bounced back by a wall) each still register as a fresh move worth
 * animating.
 *
 * Exported for testing.
 */
export function mergeEntityPosition(
  prev: LocalEncounterState,
  entityId: string,
  position: Position,
  path?: Position[]
): LocalEncounterState {
  const existing = prev.entities.get(entityId);
  if (!existing) return prev;
  const newEntities = new Map(prev.entities);
  newEntities.set(entityId, {
    ...existing,
    position,
    ...(path && path.length > 0
      ? { movePath: path, moveSeq: (existing.moveSeq ?? 0) + 1 }
      : {}),
  });
  return { ...prev, entities: newEntities };
}

/**
 * Return only hexes eligible for coordinate-keyed reveal state. The shared
 * filter keeps stream reducers and harness diagnostics consistent.
 */
export function hexesWithPosition(
  hexes: HexRecord[]
): Array<HexRecord & { position: NonNullable<HexRecord['position']> }> {
  return hexes.filter(
    (
      hex
    ): hex is HexRecord & { position: NonNullable<HexRecord['position']> } =>
      hex.position !== undefined
  );
}

/**
 * Build a position index (entityId -> the hex position that currently
 * places it) from a full hex list, honoring VISIBLE-over-REMEMBERED
 * precedence for an entity present in both (rpg-dnd5e-web#651). Shared by
 * both full-resync snapshot hydration sites (EncounterView.tsx's and
 * PlaytestHarness.tsx's `onSnapshotDelivered`) — this exact reverse-index
 * pattern was independently duplicated in both ("mirrors EncounterView.tsx"
 * read the harness's own prior comment), and both copies had the same
 * bug: iterating hexes in plain array order and letting whichever record
 * for an entity sorted last silently win, with no regard for `hex.state`.
 * Extracted here so the precedence rule can't drift out of sync between
 * them, or between them and `applyHexRecordsMerged`'s own live-merge
 * version of the same rule below.
 *
 * An entity present ONLY in REMEMBERED records (never VISIBLE in this same
 * hex list) still resolves to a position — its last-observed one. That is
 * deliberate, not a gap: HexRecord's own contract says a remembered
 * placement "resolves against the viewer's known entity set... because a
 * remembered occupant still needs something to render as," and a snapshot
 * (a reconnect resync) carries a viewer's FULL accumulated knowledge —
 * VISIBLE and REMEMBERED together — so excluding remembered-only entities
 * here would make a previously-seen-but-now-out-of-sight monster/prop
 * vanish across a reconnect instead of rendering as the frozen memory
 * rpg-dnd5e-web#650 built for. What this function guarantees is narrower
 * and is the actual bug fix: a REMEMBERED placement can never override a
 * VISIBLE one for the same entity, in either array order.
 */
export function positionByEntityIdFromHexes(
  hexes: HexRecord[]
): Map<string, NonNullable<HexRecord['position']>> {
  const positioned = hexesWithPosition(hexes);
  const positions = new Map<string, NonNullable<HexRecord['position']>>();
  const claimedByVisible = new Set<string>();
  for (const hex of positioned) {
    if (hex.state !== HexState.VISIBLE) continue;
    for (const placement of hex.contents ?? []) {
      claimedByVisible.add(placement.entityId);
      positions.set(placement.entityId, hex.position);
    }
  }
  for (const hex of positioned) {
    if (hex.state === HexState.VISIBLE) continue;
    for (const placement of hex.contents ?? []) {
      if (claimedByVisible.has(placement.entityId)) continue;
      positions.set(placement.entityId, hex.position);
    }
  }
  return positions;
}

/**
 * Sibling to `positionByEntityIdFromHexes` — resolves each entity's
 * `Placement.facing` (rpg-dnd5e-web unit/game-fidelity Bug B: "authored
 * facing must render in-game") under the exact same VISIBLE-over-REMEMBERED
 * precedence (rpg-dnd5e-web#651), for the snapshot-hydration counterpart of
 * `applyHexRecordsMerged`'s own live-merge facing wire-up above. A separate
 * pass over the same `hexes` rather than folding into
 * `positionByEntityIdFromHexes`'s established `Map<string, Position>`
 * return shape — that function's own contract (and every existing
 * caller/test asserting against it) shouldn't have to change for a field
 * most callers don't need.
 *
 * `Placement.facing` is `optional uint32` (types_pb.ts's own doc comment:
 * "Presence distinguishes absent from explicit E=0") — a placement with no
 * authored override is simply absent from the returned Map, which is
 * exactly the "keep the model's default orientation" signal callers want:
 * `.get()` on an unlisted id returns `undefined`, indistinguishable from
 * every pre-existing caller that never set a facing at all.
 */
export function facingByEntityIdFromHexes(
  hexes: HexRecord[]
): Map<string, number> {
  const positioned = hexesWithPosition(hexes);
  const facings = new Map<string, number>();
  const claimedByVisible = new Set<string>();
  for (const hex of positioned) {
    if (hex.state !== HexState.VISIBLE) continue;
    for (const placement of hex.contents ?? []) {
      claimedByVisible.add(placement.entityId);
      if (placement.facing !== undefined) {
        facings.set(placement.entityId, placement.facing);
      }
    }
  }
  for (const hex of positioned) {
    if (hex.state === HexState.VISIBLE) continue;
    for (const placement of hex.contents ?? []) {
      if (claimedByVisible.has(placement.entityId)) continue;
      if (placement.facing !== undefined) {
        facings.set(placement.entityId, placement.facing);
      }
    }
  }
  return facings;
}

/**
 * Replace region metadata from the server's snapshot. A reconnect snapshot is
 * authoritative, so omitted theme/zones/hexes clear stale local values.
 * Exported for testing.
 */
export function applySnapshotRegionState(
  prev: LocalEncounterState,
  theme: string,
  zones: Zone[],
  hexes: HexRecord[]
): LocalEncounterState {
  const revealedHexes = new Map<string, HexRecord>();
  for (const hex of hexesWithPosition(hexes)) {
    revealedHexes.set(hexKey(protoPositionToHex(hex.position)), hex);
  }
  return {
    ...prev,
    theme: theme || undefined,
    zones: new Map(zones.map((zone) => [zone.id, zone])),
    revealedHexes,
    revealedHexKeys: new Set(revealedHexes.keys()),
  };
}

/**
 * Return only wire-authored metadata for a render coordinate. Unknown zone
 * IDs and absent fields deliberately remain undefined; renderers choose their
 * existing undifferentiated fallback without client-side inference.
 */
export function regionForHex(
  state: LocalEncounterState,
  coord: CubeHexCoord
): { theme: string | undefined; zone: Zone | undefined } {
  const hex = state.revealedHexes.get(hexKey(coord));
  return {
    theme: state.theme,
    zone: hex?.zoneId ? state.zones.get(hex.zoneId) : undefined,
  };
}

/**
 * Fog-of-war knowledge state for a position (rpg-dnd5e-web#605/#609):
 * a REMEMBERED hex record renders frozen/charcoal (sceneKnowledge.ts's
 * `SceneKnowledgeState` — kept as a plain literal union here rather than
 * importing that type, so this state-layer module stays independent of the
 * render-layer one), everything else — a VISIBLE record, or no record at
 * all — renders live.
 *
 * A position with no matching hex record falls back to 'visible' rather
 * than fail-closed hiding: `applyHexRecordsMerged` only ever caches an
 * entity's position from a hex record's own `contents`, so a real entity
 * should always resolve here — this is a defensive default for a position
 * this genuinely cannot resolve (e.g. a synthetic/dev-only entity), not an
 * expected miss.
 */
export function knowledgeStateForPosition(
  revealedHexes: Map<string, HexRecord>,
  position: { x: number; y: number; z: number }
): 'visible' | 'remembered' {
  const hex = revealedHexes.get(hexKey(protoPositionToHex(position)));
  return hex?.state === HexState.REMEMBERED ? 'remembered' : 'visible';
}

/**
 * Add walls to the sticky wall map without dropping previously revealed
 * walls. Keyed by `wallKey` (direction-normalized), so a wall reported from
 * either adjacent hex collapses to one entry. A re-delivered wall with an
 * unchanged `kind` is a no-op; a changed `kind` (e.g. a door segment
 * transitioning `DOOR_CLOSED` -> `DOOR_OPEN`) overwrites the entry — the
 * wall list carries state transitions, not just first-reveal. Walls missing
 * `from`/`to` (defensive — proto fields are optional) are skipped, same
 * guard HexGrid/ShadedHexWall apply before rendering.
 * Exported for testing.
 */
export function applyWallsRevealed(
  prev: LocalEncounterState,
  walls: Wall[]
): LocalEncounterState {
  let next: Map<string, Wall> | undefined;
  for (const wall of walls) {
    if (!wall.from || !wall.to) continue;
    const key = wallKey(wall);
    const existing = (next ?? prev.walls).get(key);
    if (existing && existing.kind === wall.kind) continue;
    if (!next) next = new Map(prev.walls);
    next.set(key, wall);
  }
  return next ? { ...prev, walls: next } : prev;
}

/**
 * Merge live HexKnowledgeChanged records into revealedHexes and reconcile
 * the entity position cache (`entities`) — the merge-path counterpart to
 * applySnapshotRegionState's full replace. A snapshot is a reconnect resync
 * (omitted = gone); a live HexKnowledgeChanged is a DIFF (rpg-api-protos#197,
 * rpg-dnd5e-web#609) — omitted = untouched, never gone. Positions absent
 * from `hexes` are never consulted below: their previously-cached region
 * truth AND cached entity positions stand exactly as they were.
 *
 * For each position `hexes` DOES mention:
 *   - The record REPLACES whatever was cached there WHOLESALE, never a
 *     field-level merge — a VISIBLE record's `contents` is total (an empty
 *     list is a positive "nobody here"), and a REMEMBERED record already
 *     carries its complete frozen observation.
 *   - Every placement's `entityId` resolves against `prev.entityMeta`. Call
 *     this AFTER merging the same event's `entities` batch in via
 *     applyEntityKnowledgeBatch, so a same-message disclosure already
 *     resolves. An entityId that still doesn't resolve is dropped: fail
 *     closed, never render an undisclosed occupant (neither added to nor
 *     removed from the position cache).
 *   - VISIBLE-over-REMEMBERED precedence (rpg-dnd5e-web#651): an entity can
 *     legitimately appear in TWO records within the SAME event — the newly
 *     VISIBLE hex it just moved to, and a REMEMBERED hex that still lists
 *     it (a remembered record retains its frozen observation until
 *     something re-derives it — that's the entire point of "remembered").
 *     Resolving placements in plain array order let whichever hex happened
 *     to sort last silently win, so a stale REMEMBERED placement could
 *     revert a fresh VISIBLE position — this is what corrupted the MOVER's
 *     own cached position on nearly every move once rpg-api#732 started
 *     restating the mover's whole known set (visible + remembered) on
 *     every step: wrong position -> excluded from `visibleEntities`
 *     (rendered as a frozen memory of themselves) -> missing from
 *     `visibleTurnOrder` -> "my move did nothing until I clicked twice."
 *     Placements are now resolved in two passes instead of one: every
 *     VISIBLE placement first (always wins), then REMEMBERED placements
 *     fill in only entities no VISIBLE record claimed this event — which
 *     is exactly the legitimate "only ever seen from afar, now out of
 *     sight" case #650 needs to still resolve to a position so it renders
 *     as a memory (HexRecord's own doc comment: a remembered placement
 *     "resolves against the viewer's known entity set... because a
 *     remembered occupant still needs something to render as").
 *   - An entityId present in the OLD cached record's contents at this
 *     position but absent from the NEW one — and not re-placed at any OTHER
 *     position this SAME event (a move within one message) — is removed
 *     from the position cache. This is how a remembered occupant
 *     disappears on re-sight: there is no forget message, the arriving
 *     record simply omits them.
 *
 * Idempotent: re-delivering an identical `hexes` array (same HexRecord
 * object references) is a full no-op — every map returned unchanged.
 * Exported for testing.
 */
export function applyHexRecordsMerged(
  prev: LocalEncounterState,
  hexes: HexRecord[]
): LocalEncounterState {
  const positioned = hexesWithPosition(hexes);
  if (positioned.length === 0) return prev;

  let nextRevealedHexes: Map<string, HexRecord> | undefined;
  for (const hex of positioned) {
    const key = hexKey(protoPositionToHex(hex.position));
    if ((nextRevealedHexes ?? prev.revealedHexes).get(key) === hex) continue;
    if (!nextRevealedHexes) nextRevealedHexes = new Map(prev.revealedHexes);
    nextRevealedHexes.set(key, hex);
  }
  if (!nextRevealedHexes) return prev;

  // Guards the "moved within one event" case: an entityId placed ANYWHERE
  // in this event's own contents must not also be pruned by the vacate pass
  // below, even though it's simultaneously absent from wherever it used to
  // be cached.
  const placedThisEvent = new Set<string>();
  for (const hex of positioned) {
    for (const placement of hex.contents ?? []) {
      if (prev.entityMeta.has(placement.entityId)) {
        placedThisEvent.add(placement.entityId);
      }
    }
  }

  let nextEntities: LocalEncounterState['entities'] | undefined;
  // `facing` rides the SAME Placement record as `position` (types_pb.ts's
  // own doc comment: "facing rides HERE" — on Placement, not Entity), so it
  // is set alongside position rather than by a separate pass. The identity
  // short-circuit above now also compares `facing` — an entity that turns
  // in place (same hex, new authored facing) must still produce a state
  // update, which a position-only comparison would have swallowed.
  const setPlacement = (
    entityId: string,
    position: Position,
    facing: number | undefined
  ) => {
    const existing = (nextEntities ?? prev.entities).get(entityId);
    if (
      existing?.position?.x === position.x &&
      existing?.position?.y === position.y &&
      existing?.position?.z === position.z &&
      existing?.facing === facing
    ) {
      return;
    }
    if (!nextEntities) nextEntities = new Map(prev.entities);
    nextEntities.set(entityId, {
      ...create(EntityStateSchema, { entityId, position }),
      facing,
    });
  };

  // Pass 1: every VISIBLE placement this event. Always wins — set
  // unconditionally, regardless of what a REMEMBERED record for the same
  // entity says (processed in pass 2 below).
  const claimedByVisibleThisEvent = new Set<string>();
  for (const hex of positioned) {
    if (hex.state !== HexState.VISIBLE) continue;
    for (const placement of hex.contents ?? []) {
      if (!prev.entityMeta.has(placement.entityId)) continue; // fail closed
      claimedByVisibleThisEvent.add(placement.entityId);
      setPlacement(
        placement.entityId,
        v2PositionToV1(hex.position),
        placement.facing
      );
    }
  }
  // Pass 2: REMEMBERED placements — only for entities no VISIBLE record
  // claimed this event. A REMEMBERED record's own placement is otherwise
  // exactly as authoritative as a VISIBLE one (it's the frozen truth of
  // what this position held), it just never gets to override a fresher
  // sighting from the same event.
  for (const hex of positioned) {
    if (hex.state === HexState.VISIBLE) continue;
    for (const placement of hex.contents ?? []) {
      if (claimedByVisibleThisEvent.has(placement.entityId)) continue;
      if (!prev.entityMeta.has(placement.entityId)) continue; // fail closed
      setPlacement(
        placement.entityId,
        v2PositionToV1(hex.position),
        placement.facing
      );
    }
  }

  // Vacate pass: an entity that used to sit at a position this event
  // updates, and isn't re-placed anywhere else this event, is gone from the
  // cache. Reads only `prev.revealedHexes` (untouched by the two passes
  // above), so its own ordering relative to them doesn't matter.
  for (const hex of positioned) {
    const key = hexKey(protoPositionToHex(hex.position));
    const oldContents = prev.revealedHexes.get(key)?.contents ?? [];
    for (const oldPlacement of oldContents) {
      if (placedThisEvent.has(oldPlacement.entityId)) continue;
      if (!(nextEntities ?? prev.entities).has(oldPlacement.entityId)) {
        continue;
      }
      if (!nextEntities) nextEntities = new Map(prev.entities);
      nextEntities.delete(oldPlacement.entityId);
    }
  }

  return {
    ...prev,
    revealedHexes: nextRevealedHexes,
    revealedHexKeys: new Set(nextRevealedHexes.keys()),
    entities: nextEntities ?? prev.entities,
  };
}

/**
 * Converts one wire-shape StatusEffect into the local EntityStatus shape —
 * shared by both the live StatusApplied path (applyStatusApplied) and the
 * snapshot-hydration path below, since Entity.status_effects and
 * StatusApplied.status are both the same StatusEffect message
 * (rpg-dnd5e-web#462). sourceEntityId has no equivalent on StatusEffect (the
 * causal "who applied this" chain only exists on the live event), so
 * snapshot-hydrated entries always carry it undefined.
 */
function toEntityStatus(effect: StatusEffect): EntityStatus | undefined {
  if (!effect.source) return undefined;
  return {
    source: {
      module: effect.source.module,
      type: effect.source.type,
      id: effect.source.id,
    },
    displayName: effect.displayName,
    sourceEntityId: undefined,
  };
}

/**
 * Apply a batch of entity appearances — each carrying both the v1alpha1
 * positional stub AND v1alpha2 meta (type, monsterRefId, initialHP, initialAC) — in a
 * single state update. This is the sole entity-population path: entities
 * arrive only via SnapshotDelivered now (there is no live per-entity
 * appear/disappear event), so a single batch call per snapshot replaces what
 * used to be a per-entity loop over separate appear + meta reducers (which
 * would trigger N intermediate renders and N Map clone operations for N
 * entities anyway).
 *
 * statusEffects (rpg-dnd5e-web#462) seeds entityStatuses per entity when
 * present: SnapshotDelivered is a full resync, so each entity's status list
 * is REPLACED wholesale by its fresh statusEffects (an empty list clears any
 * stale pre-refresh entry), never merged/appended onto what was there
 * before — the same "server's word is authoritative" rule entityMeta
 * already follows. Live StatusApplied/StatusRemoved events keep mutating
 * entityStatuses incrementally afterward: snapshot seeds, stream updates,
 * one map. Omitting statusEffects entirely (existing callers) leaves
 * entityStatuses untouched, matching the pre-#462 behavior exactly.
 *
 * `facing` (rpg-dnd5e-web unit/game-fidelity Bug B) is the snapshot's own
 * `facingByEntityIdFromHexes` resolution for this entity — the caller
 * resolves it the same way it resolves `entity.position` (a one-shot
 * reverse index off the snapshot's `hexes`), passed straight through here
 * rather than re-derived. Undefined (every pre-existing caller) leaves the
 * entity's `facing` unset, matching every renderer's existing default.
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
    statusEffects?: StatusEffect[];
    displayName?: string;
    classRefId?: string;
    propRefId?: string;
    equipment?: CharacterEquipment;
    facing?: number;
  }>
): LocalEncounterState {
  if (entries.length === 0) return prev;
  const newEntities = new Map(prev.entities);
  const newMeta = new Map(prev.entityMeta);
  const newHP = new Map(prev.entityHP);
  const newAC = new Map(prev.entityAC);
  const newStatuses = new Map(prev.entityStatuses);
  const newEquipment = new Map(prev.characterEquipment);
  let hpChanged = false;
  let acChanged = false;
  let statusesChanged = false;
  let equipmentChanged = false;
  for (const {
    entity,
    type,
    monsterRefId,
    initialHP,
    initialAC,
    statusEffects,
    displayName,
    classRefId,
    propRefId,
    equipment,
    facing,
  } of entries) {
    newEntities.set(entity.entityId, { ...entity, ghost: false, facing });
    newMeta.set(entity.entityId, {
      type,
      monsterRefId,
      displayName,
      classRefId,
      propRefId,
    });
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
    if (statusEffects !== undefined) {
      const converted = statusEffects
        .map(toEntityStatus)
        .filter((s): s is EntityStatus => s !== undefined);
      if (converted.length > 0) {
        newStatuses.set(entity.entityId, converted);
      } else {
        newStatuses.delete(entity.entityId);
      }
      statusesChanged = true;
    }
    if (equipment !== undefined) {
      newEquipment.set(entity.entityId, equipment);
      equipmentChanged = true;
    }
  }
  return {
    ...prev,
    entities: newEntities,
    entityMeta: newMeta,
    entityHP: hpChanged ? newHP : prev.entityHP,
    entityAC: acChanged ? newAC : prev.entityAC,
    entityStatuses: statusesChanged ? newStatuses : prev.entityStatuses,
    characterEquipment: equipmentChanged
      ? newEquipment
      : prev.characterEquipment,
  };
}

/**
 * Wire-projected entity disclosure from a live HexKnowledgeChanged event
 * (rpg-dnd5e-web#609) — the merge-path counterpart to the position-carrying
 * entries applyEntityAppearedBatch takes from a snapshot. Deliberately no
 * `entity`/position field: HexKnowledgeChanged's Entity message carries no
 * position of its own (see the proto's own Entity doc comment — "what a
 * thing IS ... deliberately not where"); placement rides separately on each
 * HexRecord.contents entry, applied by applyHexRecordsMerged.
 */
export interface EntityKnowledgeEntry {
  entityId: string;
  type: EntityType;
  monsterRefId: string | undefined;
  initialHP: { current: number; max: number } | undefined;
  initialAC: number | undefined;
  statusEffects?: StatusEffect[];
  displayName?: string;
  classRefId?: string;
  propRefId?: string;
  equipment?: CharacterEquipment;
}

/**
 * Merge a live HexKnowledgeChanged event's `entities` batch into the known-
 * entity registry (entityMeta/entityHP/entityAC/entityStatuses/
 * characterEquipment) WITHOUT touching entity position — mirrors
 * applyEntityAppearedBatch's per-entity meta projection field-for-field, but
 * entries carry no position (see EntityKnowledgeEntry's doc comment) and are
 * upserted, never treated as a full resync: an entity absent from `entries`
 * keeps whatever entry it already had — unlike the snapshot path, this is a
 * partial disclosure, not a reconnect resync, so there is nothing to clear.
 *
 * Call this BEFORE applyHexRecordsMerged for the same event, so its
 * placement resolution sees this event's own disclosures already merged
 * into entityMeta.
 * Exported for testing.
 */
export function applyEntityKnowledgeBatch(
  prev: LocalEncounterState,
  entries: EntityKnowledgeEntry[]
): LocalEncounterState {
  if (entries.length === 0) return prev;
  const newMeta = new Map(prev.entityMeta);
  const newHP = new Map(prev.entityHP);
  const newAC = new Map(prev.entityAC);
  const newStatuses = new Map(prev.entityStatuses);
  const newEquipment = new Map(prev.characterEquipment);
  let hpChanged = false;
  let acChanged = false;
  let statusesChanged = false;
  let equipmentChanged = false;
  for (const {
    entityId,
    type,
    monsterRefId,
    initialHP,
    initialAC,
    statusEffects,
    displayName,
    classRefId,
    propRefId,
    equipment,
  } of entries) {
    newMeta.set(entityId, {
      type,
      monsterRefId,
      displayName,
      classRefId,
      propRefId,
    });
    if (initialHP !== undefined) {
      newHP.set(entityId, {
        current: initialHP.current,
        max: initialHP.max,
      });
      hpChanged = true;
    }
    if (initialAC !== undefined && initialAC !== 0) {
      newAC.set(entityId, initialAC);
      acChanged = true;
    }
    if (statusEffects !== undefined) {
      const converted = statusEffects
        .map(toEntityStatus)
        .filter((s): s is EntityStatus => s !== undefined);
      if (converted.length > 0) {
        newStatuses.set(entityId, converted);
      } else {
        newStatuses.delete(entityId);
      }
      statusesChanged = true;
    }
    if (equipment !== undefined) {
      newEquipment.set(entityId, equipment);
      equipmentChanged = true;
    }
  }
  return {
    ...prev,
    entityMeta: newMeta,
    entityHP: hpChanged ? newHP : prev.entityHP,
    entityAC: acChanged ? newAC : prev.entityAC,
    entityStatuses: statusesChanged ? newStatuses : prev.entityStatuses,
    characterEquipment: equipmentChanged
      ? newEquipment
      : prev.characterEquipment,
  };
}

/**
 * Apply v1alpha2 encounter mode + turn state from a SnapshotDelivered event.
 * Updates `mode`, `initiativeOrder`, `activeEntityId`, and `round` from the
 * snapshot without touching HP / doors / hexes (those flow only via delta
 * events) — per-entity statusEffects from the SAME snapshot are hydrated
 * separately, via applyEntityAppearedBatch (rpg-dnd5e-web#462), since they
 * arrive per-entity on `encounter.space.entities`, not on this event's own
 * top-level fields.
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
 * Mark a door as open by entity id (v1alpha2 DoorOpened.doorEntityId).
 * Idempotent — re-opening an already-open door is a no-op.
 *
 * Also flips the matching wall's own kind to DOOR_OPEN in place (matched by
 * `Wall.id === doorEntityId`, rpg-api-protos#186), so the door's rendered
 * pose (SyntyHexWall/ShadedHexWall) updates the instant DoorOpened arrives.
 * This isn't computed game logic: DoorOpened's own payload IS "this door is
 * now open" — projecting that onto the one wall segment carrying the same
 * id is the same boundary-honest event->state mapping every other reducer
 * here does. It's also load-bearing today, not just belt-and-suspenders:
 * verified against rpg-api's translate.go (translateHexRevealedEvent), the
 * live GeometryRevealed a door-open triggers only carries Hexes today —
 * `wallsToProto` runs on the full-snapshot path only, never the live-event
 * path — so without this, the door's pose would not update live at all,
 * only on the next reconnect/snapshot. If the server starts including the
 * updated wall in GeometryRevealed too, applyWallsRevealed's
 * overwrite-on-kind-change composes safely with this (both converge on the
 * same DOOR_OPEN entry; whichever arrives first wins, the second is a
 * same-kind no-op).
 *
 * Does not touch the per-hex revealedHexes map; the toolkit emits a parallel
 * GeometryRevealed event for the newly-visible cells (cause/effect split),
 * which the applyHexesRevealed reducer handles.
 * Exported for testing.
 */
export function applyDoorOpened(
  prev: LocalEncounterState,
  doorEntityId: string
): LocalEncounterState {
  const alreadyOpen = prev.openDoors.has(doorEntityId);

  let nextWalls = prev.walls;
  for (const [key, wall] of prev.walls) {
    if (wall.id !== doorEntityId || wall.kind === WallKind.DOOR_OPEN) continue;
    nextWalls = new Map(prev.walls);
    nextWalls.set(
      key,
      create(WallSchema, {
        from: wall.from,
        to: wall.to,
        kind: WallKind.DOOR_OPEN,
        id: wall.id,
      })
    );
    break; // Wall.id is unique per door
  }

  if (alreadyOpen && nextWalls === prev.walls) return prev;

  const nextOpenDoors = alreadyOpen
    ? prev.openDoors
    : new Set(prev.openDoors).add(doorEntityId);

  return { ...prev, openDoors: nextOpenDoors, walls: nextWalls };
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
 * Apply an InitiativeRolled event: sets `initiativeOrder` from the event's
 * order list.
 *
 * The toolkit's rollInitiative (inside SetMode) rolls the order but
 * publishes no dedicated roster event on the wire by default — rpg-api#644's
 * playtest follow-up synthesizes this InitiativeRolled envelope alongside
 * the normal ModeChanged translation so a mid-stream FREE_ROAM -> TURN_BASED
 * transition populates the turn-order overlay immediately, without waiting
 * for the next SnapshotDelivered (applySnapshotTurnState is otherwise the
 * only initiativeOrder source, and snapshots arrive once at connect time).
 *
 * Idempotent if the order is unchanged (returns the same reference).
 * Exported for testing.
 */
export function applyInitiativeRolled(
  prev: LocalEncounterState,
  event: InitiativeRolled
): LocalEncounterState {
  if (
    prev.initiativeOrder.length === event.order.length &&
    prev.initiativeOrder.every((id, i) => id === event.order[i])
  ) {
    return prev;
  }
  return { ...prev, initiativeOrder: event.order };
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

/**
 * Wave rpg-dnd5e-web#571 — refresh a character's equipment display fields
 * after a successful EquipItem/UnequipItem RPC. Those RPCs are character-
 * scoped and return the full recomputed CharacterData in the response but
 * push no stream event (live push to OTHER clients is rpg-api#681, out of
 * scope) — the acting client mirrors its own response locally, the same
 * "optimistic local mirror" shape setReactionReadyLocalReducer uses.
 *
 * Also refreshes `entityAC` from `equipment.armorClassDetail.total` when
 * present, so the dock's main HP/AC readout (driven by entityAC, not
 * characterEquipment) stays in sync without waiting for the next snapshot
 * — rpg-api keeps Entity.armor_class and armor_class_detail.total in sync
 * on every real snapshot, so mirroring the same total here just keeps that
 * invariant true between snapshots too.
 * Exported for testing.
 */
export function applyCharacterEquipment(
  prev: LocalEncounterState,
  entityId: string,
  equipment: CharacterEquipment
): LocalEncounterState {
  const newEquipment = new Map(prev.characterEquipment);
  newEquipment.set(entityId, equipment);

  if (equipment.armorClassDetail === undefined) {
    return { ...prev, characterEquipment: newEquipment };
  }
  const newAC = new Map(prev.entityAC);
  newAC.set(entityId, equipment.armorClassDetail.total);
  return { ...prev, characterEquipment: newEquipment, entityAC: newAC };
}

export interface UseEncounterStateResult {
  state: LocalEncounterState;
  /**
   * Update only the position of an existing entity. Used as a fallback for
   * MovementCompletedEvent when the API omits updatedEntity but sends path[].
   * No-op if the entity is not already in state.
   *
   * `path` (rpg-dnd5e-web#542, optional): the move's full real hex-by-hex
   * route — pass the whole `actualPath`/`path` array (not just its last
   * element) so HexEntity can step through it instead of teleporting. See
   * `mergeEntityPosition`'s doc comment for the full contract.
   */
  applyEntityPositionUpdate: (
    entityId: string,
    position: Position,
    path?: Position[]
  ) => void;
  /** Reset to empty state (new encounter or disconnect) */
  reset: () => void;
  // v1alpha2 additions
  /** Replace theme, zones, and revealed hexes from an authoritative snapshot. */
  applySnapshotRegionState: (
    theme: string,
    zones: Zone[],
    hexes: HexRecord[]
  ) => void;
  /** Add walls to the sticky wall map, keyed by `wallKey` (additive, idempotent) */
  applyWallsRevealed: (walls: Wall[]) => void;
  /** Mark a door entity as open; idempotent. */
  applyDoorOpened: (doorEntityId: string) => void;
  /**
   * Apply a batch of entity appearances in a single state update to avoid N
   * intermediate renders when seeding multiple entities from a snapshot.
   * Each entry carries the v1alpha1 positional stub plus v1alpha2 type/HP/AC/meta,
   * and optionally statusEffects (#462) / equipment (#571) — when present,
   * REPLACES (not merges into) that entity's entityStatuses/characterEquipment
   * entry from the snapshot's authoritative per-entity data.
   */
  applyEntityAppearedBatch: (
    entries: Array<{
      entity: EntityState;
      type: EntityType;
      monsterRefId: string | undefined;
      initialHP: { current: number; max: number } | undefined;
      initialAC: number | undefined;
      statusEffects?: StatusEffect[];
      displayName?: string;
      classRefId?: string;
      propRefId?: string;
      equipment?: CharacterEquipment;
      facing?: number;
    }>
  ) => void;
  /**
   * rpg-dnd5e-web#609 — merge a live HexKnowledgeChanged event's `entities`
   * batch into the known-entity registry WITHOUT touching position. See
   * applyEntityKnowledgeBatch's doc comment for the full contract; call
   * this BEFORE applyHexRecordsMerged for the same event.
   */
  applyEntityKnowledgeBatch: (entries: EntityKnowledgeEntry[]) => void;
  /**
   * rpg-dnd5e-web#609 — merge live HexKnowledgeChanged hex records into
   * revealedHexes and reconcile cached entity positions. The merge-path
   * counterpart to applySnapshotRegionState's full replace — see
   * applyHexRecordsMerged's doc comment for the full contract.
   */
  applyHexRecordsMerged: (hexes: HexRecord[]) => void;
  /**
   * Wave rpg-dnd5e-web#571 — refresh a character's equipment display
   * fields (and entityAC) after a successful EquipItem/UnequipItem RPC.
   * Optimistic local mirror — see applyCharacterEquipment's doc comment.
   */
  applyCharacterEquipment: (
    entityId: string,
    equipment: CharacterEquipment
  ) => void;
  /**
   * Apply v1alpha2 turn state from a SnapshotDelivered event.
   * Updates initiativeOrder, activeEntityId, round, and mode without touching
   * HP / doors (those flow only via delta events) — per-entity statusEffects
   * from the SAME snapshot are hydrated separately via
   * applyEntityAppearedBatch (#462). Also seeds the server-authored
   * menu/economy (turnState) so the menu renders at turn start before the
   * first TurnStateChanged push (TakeAction wave #426).
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
  /**
   * Set `initiativeOrder` from an InitiativeRolled event, populating the
   * turn-order overlay when combat starts mid-stream.
   */
  applyInitiativeRolled: (event: InitiativeRolled) => void;
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
    (entityId: string, position: Position, path?: Position[]) => {
      setState((prev) => mergeEntityPosition(prev, entityId, position, path));
    },
    []
  );

  const reset = useCallback(() => {
    setState(createEmptyEncounterState());
  }, []);

  const applySnapshotRegionStateCallback = useCallback(
    (theme: string, zones: Zone[], hexes: HexRecord[]) => {
      setState((prev) => applySnapshotRegionState(prev, theme, zones, hexes));
    },
    []
  );

  const applyWallsRevealedCallback = useCallback((walls: Wall[]) => {
    setState((prev) => applyWallsRevealed(prev, walls));
  }, []);

  const applyDoorOpenedCallback = useCallback((doorEntityId: string) => {
    setState((prev) => applyDoorOpened(prev, doorEntityId));
  }, []);

  const applyEntityAppearedBatchCallback = useCallback(
    (
      entries: Array<{
        entity: EntityState;
        type: EntityType;
        monsterRefId: string | undefined;
        initialHP: { current: number; max: number } | undefined;
        initialAC: number | undefined;
        statusEffects?: StatusEffect[];
        displayName?: string;
        classRefId?: string;
        propRefId?: string;
        equipment?: CharacterEquipment;
        facing?: number;
      }>
    ) => {
      setState((prev) => applyEntityAppearedBatch(prev, entries));
    },
    []
  );

  const applyEntityKnowledgeBatchCallback = useCallback(
    (entries: EntityKnowledgeEntry[]) => {
      setState((prev) => applyEntityKnowledgeBatch(prev, entries));
    },
    []
  );

  const applyHexRecordsMergedCallback = useCallback((hexes: HexRecord[]) => {
    setState((prev) => applyHexRecordsMerged(prev, hexes));
  }, []);

  const applyCharacterEquipmentCallback = useCallback(
    (entityId: string, equipment: CharacterEquipment) => {
      setState((prev) => applyCharacterEquipment(prev, entityId, equipment));
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

  const applyInitiativeRolledCallback = useCallback(
    (event: InitiativeRolled) => {
      setState((prev) => applyInitiativeRolled(prev, event));
    },
    []
  );

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
    applySnapshotRegionState: applySnapshotRegionStateCallback,
    applyWallsRevealed: applyWallsRevealedCallback,
    applyDoorOpened: applyDoorOpenedCallback,
    applyEntityAppearedBatch: applyEntityAppearedBatchCallback,
    applyEntityKnowledgeBatch: applyEntityKnowledgeBatchCallback,
    applyHexRecordsMerged: applyHexRecordsMergedCallback,
    applyCharacterEquipment: applyCharacterEquipmentCallback,
    applySnapshotTurnState: applySnapshotTurnStateCallback,
    setPendingPrompt: setPendingPromptCallback,
    setReactionReadyLocal: setReactionReadyLocalCallback,
    applyEntityDamaged: applyEntityDamagedCallback,
    applyStatusApplied: applyStatusAppliedCallback,
    applyStatusRemoved: applyStatusRemovedCallback,
    applyModeChanged: applyModeChangedCallback,
    applyInitiativeRolled: applyInitiativeRolledCallback,
    applyTurnStarted: applyTurnStartedCallback,
    applyTurnEnded: applyTurnEndedCallback,
    applyTurnStateChanged: applyTurnStateChangedCallback,
    applyEntityDied: applyEntityDiedCallback,
    applyEntityRemoved: applyEntityRemovedCallback,
    applyEncounterEnded: applyEncounterEndedCallback,
  };
}
