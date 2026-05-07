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
      // Unknown event type — toolkit/proto gap. Log + continue so the stream
      // doesn't tear down. File as an issue if seen in playtest.
      console.warn(
        '[useEncounterStream2] unknown event case:',
        (payload as { case?: string }).case
      );
  }
}
