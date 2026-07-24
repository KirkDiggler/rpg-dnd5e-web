import type {
  ActionResolved,
  AttackResolved,
  DeathSaveRolled,
  DoorOpened,
  EncounterEnded,
  EncounterEvent,
  EntityAppeared,
  EntityDamaged,
  EntityDied,
  EntityDisappeared,
  EntityMoved,
  EntityRemoved,
  EntityStabilized,
  GeometryRevealed,
  InitiativeRolled,
  InputRequiredDelivered,
  ModeChanged,
  SnapshotDelivered,
  StatusApplied,
  StatusRemoved,
  TurnEnded,
  TurnStarted,
  TurnStateChanged,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';

export type EncounterEventMetadata = Pick<
  EncounterEvent,
  'sequence' | 'timestamp' | 'correlationId'
>;

export type EncounterStreamHandler<T> = (
  event: T,
  metadata: EncounterEventMetadata
) => void;

/**
 * Per-event-type callbacks for the v1alpha2 encounter stream.
 * Mirrors the v1 hook's options shape (one optional callback per event type).
 *
 * NOTE: onSnapshotDelivered is called every time the stream opens (initial
 * connect + every reconnect). The payload's `encounter` field is empty in
 * slice 1 — DO NOT apply it as state. Treat as a stream-up sync barrier.
 *
 * Cause/effect split: DoorOpened (cause) carries only the door identity in
 * Wave 2.7; the actual reveal data (newly-visible hexes) flows on a parallel
 * GeometryRevealed (effect) event from the toolkit's deliberate two-phase
 * emission. Consumers should subscribe to BOTH; do not try to combine them.
 *
 * The same cause/effect split applies for combat: an action emits an umbrella
 * `ActionResolved` (what + economy cost) correlated via the envelope
 * `correlation_id` to its `AttackResolved` (roll, hit/miss/crit — fires on a
 * MISS too, the #594 fix), and any `EntityDamaged` (HP, hit only) /
 * `StatusApplied` (conditions). The live action menu + economy ride
 * `TurnStateChanged` (TakeAction wave #426).
 */
export interface EncounterStreamOptions {
  /** slice-1: encounter field is empty; treat as connect-confirm only. */
  onSnapshotDelivered?: EncounterStreamHandler<SnapshotDelivered>;
  onEntityMoved?: EncounterStreamHandler<EntityMoved>;
  onGeometryRevealed?: EncounterStreamHandler<GeometryRevealed>;
  onEntityAppeared?: EncounterStreamHandler<EntityAppeared>;
  onEntityDisappeared?: EncounterStreamHandler<EntityDisappeared>;
  /**
   * Wave 2.7: door state transitions to open. The event's revealedHexes /
   * revealedWalls / removedWalls fields are intentionally empty — the
   * geometry side flows on a separate GeometryRevealed event.
   */
  onDoorOpened?: EncounterStreamHandler<DoorOpened>;
  // Wave 2.8: combat events (TURN_BASED mode + attacks + turn cycle).
  /** Authoritative HP update; carries `hp_after` and `amount`. */
  onEntityDamaged?: EncounterStreamHandler<EntityDamaged>;
  /** Condition applied to a target; carries the StatusEffect ref + display. */
  onStatusApplied?: EncounterStreamHandler<StatusApplied>;
  /**
   * Condition cleared from a target; carries the source Ref that matches
   * an earlier StatusApplied.status.source. Consumers remove the matching
   * entry from their status list — the badge then clears automatically.
   */
  onStatusRemoved?: EncounterStreamHandler<StatusRemoved>;
  /** Encounter-mode transition (e.g. FREE_ROAM → TURN_BASED). */
  onModeChanged?: EncounterStreamHandler<ModeChanged>;
  /**
   * Full initiative roster, synthesized by the server alongside the
   * FREE_ROAM -> TURN_BASED ModeChanged translation (rpg-api#644 playtest
   * follow-up) so a mid-stream combat start populates the turn-order
   * overlay immediately, without waiting for the next SnapshotDelivered.
   */
  onInitiativeRolled?: EncounterStreamHandler<InitiativeRolled>;
  /** Active actor + round update; signals "X's turn now". */
  onTurnStarted?: EncounterStreamHandler<TurnStarted>;
  /** Active actor finished; the next TurnStarted is authoritative for who's next. */
  onTurnEnded?: EncounterStreamHandler<TurnEnded>;
  // TakeAction wave (#426): the verb-resolution + live-menu spine.
  /**
   * Umbrella beat for any action a character takes (attack, dodge, dash, …).
   * Carries the action ref + the economy it consumed. The roll/hit/miss detail
   * of an attack rides the correlated AttackResolved; damage rides the
   * correlated EntityDamaged. Web renders this as a combat-log line — server is
   * authoritative, web computes nothing.
   */
  onActionResolved?: EncounterStreamHandler<ActionResolved>;
  /**
   * Per-attack roll detail. CRUCIAL: fires on a MISS too (`hit=false`) — the
   * #594 fix. Web renders the hit OR miss in the combat log so a whiff is no
   * longer silent.
   */
  onAttackResolved?: EncounterStreamHandler<AttackResolved>;
  /**
   * The live menu/economy push (Invariant 12, no polling). Carries the
   * recomputed TurnState (economy + available_actions). The web swaps it in
   * wholesale and re-renders the action menu — it never recomputes availability
   * client-side. This is the event that drives the server-authored action menu.
   */
  onTurnStateChanged?: EncounterStreamHandler<TurnStateChanged>;
  // Wave 2.10: death + encounter resolution events.
  /**
   * Entity HP reached 0. The entity remains in the entities map until
   * EntityRemoved arrives. Useful for transient death narration in the log.
   */
  onEntityDied?: EncounterStreamHandler<EntityDied>;
  /**
   * Entity fully removed from the encounter space (after death or other removal
   * reason). The reducer removes the entity from the entities Map on receipt.
   */
  onEntityRemoved?: EncounterStreamHandler<EntityRemoved>;
  /**
   * Encounter is over. Carries a human-readable `reason` (e.g. "all hostiles
   * defeated"). The reducer sets `encounterStatus = "ended"` on receipt.
   */
  onEncounterEnded?: EncounterStreamHandler<EncounterEnded>;
  // Death-save arc (rpg-toolkit#742, wave KirkDiggler/rpg-project#75).
  /**
   * Fires on EVERY death save roll for an unconscious entity, including
   * damage-while-unconscious auto-fails (roll=0). All derived fields
   * (is_critical_fail/success, stabilized, dead, regained_consciousness,
   * hp_restored) are copied verbatim from the toolkit — never re-derived.
   */
  onDeathSaveRolled?: EncounterStreamHandler<DeathSaveRolled>;
  /**
   * Fires once when an unconscious entity accumulates 3 successful death
   * saves. Death itself still rides the existing EntityDied.
   */
  onEntityStabilized?: EncounterStreamHandler<EntityStabilized>;
  // Wave 2.11d: stream-delivered InputRequired prompts.
  /**
   * Server-pushed InputRequired payload (Wave 2.11d). Used for reaction
   * prompts whose reactor is not the caller of the action that triggered
   * them (e.g. NPC attacks player → player must decide Shield/Skip). The
   * mover/attacker's RPC response cannot carry a prompt for a different
   * player, so the server publishes this event onto the reactor's
   * per-viewer stream. Consumers wire this into the same setPendingPrompt
   * path used by Interact/TakeAction responses; the InputRequired payload
   * shape is identical, and the existing prompt modal/dispatch reuses it.
   */
  onInputRequiredDelivered?: EncounterStreamHandler<InputRequiredDelivered>;
}

/**
 * Dispatches a typed v1alpha2 EncounterEvent to the appropriate callback.
 * Pure function; no side effects beyond callback invocation + a console.warn
 * on unknown event cases (gap to file as a toolkit/proto issue).
 */
export function dispatchEncounterStreamEvent(
  event: EncounterEvent,
  options: EncounterStreamOptions
): void {
  const payload = event.event;
  const metadata: EncounterEventMetadata = {
    sequence: event.sequence,
    timestamp: event.timestamp,
    correlationId: event.correlationId,
  };
  switch (payload.case) {
    case 'snapshotDelivered':
      options.onSnapshotDelivered?.(payload.value, metadata);
      break;
    case 'entityMoved':
      options.onEntityMoved?.(payload.value, metadata);
      break;
    case 'geometryRevealed':
      options.onGeometryRevealed?.(payload.value, metadata);
      break;
    case 'entityAppeared':
      options.onEntityAppeared?.(payload.value, metadata);
      break;
    case 'entityDisappeared':
      options.onEntityDisappeared?.(payload.value, metadata);
      break;
    case 'doorOpened':
      options.onDoorOpened?.(payload.value, metadata);
      break;
    case 'entityDamaged':
      options.onEntityDamaged?.(payload.value, metadata);
      break;
    case 'statusApplied':
      options.onStatusApplied?.(payload.value, metadata);
      break;
    case 'statusRemoved':
      options.onStatusRemoved?.(payload.value, metadata);
      break;
    case 'modeChanged':
      options.onModeChanged?.(payload.value, metadata);
      break;
    case 'initiativeRolled':
      options.onInitiativeRolled?.(payload.value, metadata);
      break;
    case 'turnStarted':
      options.onTurnStarted?.(payload.value, metadata);
      break;
    case 'turnEnded':
      options.onTurnEnded?.(payload.value, metadata);
      break;
    case 'actionResolved':
      options.onActionResolved?.(payload.value, metadata);
      break;
    case 'attackResolved':
      options.onAttackResolved?.(payload.value, metadata);
      break;
    case 'turnStateChanged':
      options.onTurnStateChanged?.(payload.value, metadata);
      break;
    case 'entityDied':
      options.onEntityDied?.(payload.value, metadata);
      break;
    case 'entityRemoved':
      options.onEntityRemoved?.(payload.value, metadata);
      break;
    case 'encounterEnded':
      options.onEncounterEnded?.(payload.value, metadata);
      break;
    case 'deathSaveRolled':
      options.onDeathSaveRolled?.(payload.value, metadata);
      break;
    case 'entityStabilized':
      options.onEntityStabilized?.(payload.value, metadata);
      break;
    case 'inputRequiredDelivered':
      options.onInputRequiredDelivered?.(payload.value, metadata);
      break;
    default:
      // Either out-of-current-scope but known to the proto (entityHealed,
      // dialogue, etc. — the proto defines 30 event cases;
      // we currently handle 22) OR a genuinely unknown case from a proto
      // version mismatch. Either way: warn + continue so the stream doesn't
      // tear down. Add a case arm + callback when the feature lands.
      // The cast strips the narrowed-to-undefined `case` so we can log it.
      console.warn(
        '[useEncounterStream] unhandled event case:',
        (payload as { case?: string }).case
      );
  }
}
