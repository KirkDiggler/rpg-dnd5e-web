import type {
  EncounterEvent,
  EntityAppeared,
  EntityDisappeared,
  EntityMoved,
  GeometryRevealed,
  SnapshotDelivered,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';

/**
 * Per-event-type callbacks for the v1alpha2 encounter stream.
 * Mirrors the v1 hook's options shape (one optional callback per event type).
 *
 * NOTE: onSnapshotDelivered is called every time the stream opens (initial
 * connect + every reconnect). The payload's `encounter` field is empty in
 * slice 1 — DO NOT apply it as state. Treat as a stream-up sync barrier.
 */
export interface EncounterStream2Options {
  /** slice-1: encounter field is empty; treat as connect-confirm only. */
  onSnapshotDelivered?: (event: SnapshotDelivered) => void;
  onEntityMoved?: (event: EntityMoved) => void;
  onGeometryRevealed?: (event: GeometryRevealed) => void;
  onEntityAppeared?: (event: EntityAppeared) => void;
  onEntityDisappeared?: (event: EntityDisappeared) => void;
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
    default:
      // Either out-of-slice-2-scope but known to the proto (entityDamaged,
      // turnStarted, encounterEnded, etc. — the proto defines 22 event cases;
      // slice 2 handles 5) OR a genuinely unknown case from a proto version
      // mismatch. Either way: warn + continue so the stream doesn't tear down.
      // Add a case arm + callback when the feature lands in a future slice.
      // The cast strips the narrowed-to-undefined `case` so we can log it.
      console.warn(
        '[useEncounterStream2] unhandled event case:',
        (payload as { case?: string }).case
      );
  }
}
