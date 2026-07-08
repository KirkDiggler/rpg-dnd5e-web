import type {
  EncounterStarted,
  HostChanged,
  LobbyEvent,
  LobbySnapshot,
  MemberConnectionChanged,
  MemberJoined,
  MemberLeft,
  MemberReady,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/events_pb';

/**
 * Per-event-type callbacks for the lobby stream. Mirrors
 * encounterStream2Dispatch's shape — one optional callback per oneof case.
 *
 * Unlike EncounterEvent, LobbyEvent carries no envelope (sequence,
 * timestamp, correlation_id) — the lobby has no causation chains to
 * reassemble and the stream is short-lived, ending the moment
 * encounter_started fires (lobby-surface.md's LobbyEvent doc comment).
 */
export interface LobbyStreamOptions {
  /** Always the first event delivered on a new StreamLobby subscription. */
  onSnapshot?: (event: LobbySnapshot) => void;
  onMemberJoined?: (event: MemberJoined) => void;
  onMemberLeft?: (event: MemberLeft) => void;
  onMemberReady?: (event: MemberReady) => void;
  /**
   * Presence, not membership: a dropped StreamLobby subscription flips
   * is_connected false but keeps the seat. Only memberLeft removes a member.
   */
  onMemberConnectionChanged?: (event: MemberConnectionChanged) => void;
  /** Host role migrated (host left) to the oldest remaining member. */
  onHostChanged?: (event: HostChanged) => void;
  /**
   * Terminal event — WAITING -> STARTED. No further LobbyEvent follows on
   * this stream; consumers drop the lobby stream and subscribe
   * StreamEncounter(encounter_id) instead.
   */
  onEncounterStarted?: (event: EncounterStarted) => void;
}

/**
 * Dispatches a typed LobbyEvent to the appropriate callback. Pure function;
 * no side effects beyond callback invocation + a console.warn on an unknown
 * event case (gap to file as a proto version mismatch).
 */
export function dispatchLobbyStreamEvent(
  event: LobbyEvent,
  options: LobbyStreamOptions
): void {
  const payload = event.event;
  switch (payload.case) {
    case 'snapshot':
      options.onSnapshot?.(payload.value);
      break;
    case 'memberJoined':
      options.onMemberJoined?.(payload.value);
      break;
    case 'memberLeft':
      options.onMemberLeft?.(payload.value);
      break;
    case 'memberReady':
      options.onMemberReady?.(payload.value);
      break;
    case 'memberConnectionChanged':
      options.onMemberConnectionChanged?.(payload.value);
      break;
    case 'hostChanged':
      options.onHostChanged?.(payload.value);
      break;
    case 'encounterStarted':
      options.onEncounterStarted?.(payload.value);
      break;
    default:
      console.warn(
        '[useLobbyStream] unhandled event case:',
        (payload as { case?: string }).case
      );
  }
}
