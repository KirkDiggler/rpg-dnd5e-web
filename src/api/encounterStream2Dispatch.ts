import type {
  DoorOpened,
  EncounterEvent,
  EntityAppeared,
  EntityDamaged,
  EntityDisappeared,
  EntityMoved,
  GeometryRevealed,
  ModeChanged,
  SnapshotDelivered,
  StatusApplied,
  TurnEnded,
  TurnStarted,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';

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
 * The same cause/effect split applies in Wave 2.8 for combat: the toolkit
 * emits its `AttackResolvedEvent` (cause/narration) but the rpg-api translator
 * drops it on the wire (no proto event for cause-only attacks); HP changes
 * arrive as `EntityDamaged` (effect) and conditions as `StatusApplied` (effect).
 */
export interface EncounterStream2Options {
  /** slice-1: encounter field is empty; treat as connect-confirm only. */
  onSnapshotDelivered?: (event: SnapshotDelivered) => void;
  onEntityMoved?: (event: EntityMoved) => void;
  onGeometryRevealed?: (event: GeometryRevealed) => void;
  onEntityAppeared?: (event: EntityAppeared) => void;
  onEntityDisappeared?: (event: EntityDisappeared) => void;
  /**
   * Wave 2.7: door state transitions to open. The event's revealedHexes /
   * revealedWalls / removedWalls fields are intentionally empty — the
   * geometry side flows on a separate GeometryRevealed event.
   */
  onDoorOpened?: (event: DoorOpened) => void;
  // Wave 2.8: combat events (TURN_BASED mode + attacks + turn cycle).
  /** Authoritative HP update; carries `hp_after` and `amount`. */
  onEntityDamaged?: (event: EntityDamaged) => void;
  /** Condition applied to a target; carries the StatusEffect ref + display. */
  onStatusApplied?: (event: StatusApplied) => void;
  /** Encounter-mode transition (e.g. FREE_ROAM → TURN_BASED). */
  onModeChanged?: (event: ModeChanged) => void;
  /** Active actor + round update; signals "X's turn now". */
  onTurnStarted?: (event: TurnStarted) => void;
  /** Active actor finished; the next TurnStarted is authoritative for who's next. */
  onTurnEnded?: (event: TurnEnded) => void;
}

/**
 * Dispatches a typed v1alpha2 EncounterEvent to the appropriate callback.
 * Pure function; no side effects beyond callback invocation + a console.warn
 * on unknown event cases (gap to file as a toolkit/proto issue).
 */
export function dispatchEncounterStream2Event(
  event: EncounterEvent,
  options: EncounterStream2Options
): void {
  const payload = event.event;
  switch (payload.case) {
    case 'snapshotDelivered':
      options.onSnapshotDelivered?.(payload.value);
      break;
    case 'entityMoved':
      options.onEntityMoved?.(payload.value);
      break;
    case 'geometryRevealed':
      options.onGeometryRevealed?.(payload.value);
      break;
    case 'entityAppeared':
      options.onEntityAppeared?.(payload.value);
      break;
    case 'entityDisappeared':
      options.onEntityDisappeared?.(payload.value);
      break;
    case 'doorOpened':
      options.onDoorOpened?.(payload.value);
      break;
    case 'entityDamaged':
      options.onEntityDamaged?.(payload.value);
      break;
    case 'statusApplied':
      options.onStatusApplied?.(payload.value);
      break;
    case 'modeChanged':
      options.onModeChanged?.(payload.value);
      break;
    case 'turnStarted':
      options.onTurnStarted?.(payload.value);
      break;
    case 'turnEnded':
      options.onTurnEnded?.(payload.value);
      break;
    default:
      // Either out-of-current-scope but known to the proto (entityHealed,
      // encounterEnded, dialogue, etc. — the proto defines 20+ event cases;
      // we currently handle 11) OR a genuinely unknown case from a proto
      // version mismatch. Either way: warn + continue so the stream doesn't
      // tear down. Add a case arm + callback when the feature lands.
      // The cast strips the narrowed-to-undefined `case` so we can log it.
      console.warn(
        '[useEncounterStream2] unhandled event case:',
        (payload as { case?: string }).case
      );
  }
}
