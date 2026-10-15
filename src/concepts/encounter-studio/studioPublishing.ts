/**
 * The studio's reading of the publishing hook for Save and Play (S6): why
 * the control cannot run, which refusals describe the current bytes, and
 * what the header's status says. Pure functions over the hook's result.
 */
import type { AuthoringGateState } from '@/author/useAuthoringGate';
import type { useRoomPublishing } from '../world-building/useRoomPublishing';

export type StudioPublishing = ReturnType<typeof useRoomPublishing>;

export interface StudioPublishGate {
  state: AuthoringGateState;
  retry(): void;
}

export const GATE_OFF_SENTENCE =
  'The server is not accepting authored encounters.';
export const UNREACHABLE_SENTENCE = 'The server could not be reached.';
export const PROBING_SENTENCE = 'Checking whether the server accepts saves…';
export const NO_CHARACTER_SENTENCE = 'Pick a character on Home to play.';

/** Why the server save cannot run, or null when it can. */
export function serverUnavailableReason(
  gate: AuthoringGateState
): string | null {
  switch (gate) {
    case 'live':
      return null;
    case 'gate-off':
      return GATE_OFF_SENTENCE;
    case 'unreachable':
      return UNREACHABLE_SENTENCE;
    case 'probing':
      return PROBING_SENTENCE;
  }
}

/** Why Save and Play cannot run, or null when it can (R18): the server
 * first, then the character. */
export function playUnavailableReason(
  gate: AuthoringGateState,
  characterId: string | null
): string | null {
  return (
    serverUnavailableReason(gate) ??
    (characterId === null ? NO_CHARACTER_SENTENCE : null)
  );
}

/** The server's own sentence when it refused the KEY, not the file: the
 * registry's grammar and its key-line match travel as InvalidArgument
 * transport errors (`key must match [a-z0-9-]+`, `key does not match the
 * file's own key line`), the world store's refusals of a key that is a
 * reference or another member's travel as PermissionDenied (R20, S7-Q2),
 * and a field error with an empty path naming the key is read the same way
 * (R16). Null when no key refusal is current. */
export function keyRefusalOf(publishing: StudioPublishing): string | null {
  const fromTransport = (text: string | null | undefined): string | null => {
    const match =
      /InvalidArgument: (key\b.*)$/.exec(text ?? '') ??
      /PermissionDenied: (that key (?:is a reference|belongs to another member of this world).*)$/.exec(
        text ?? ''
      );
    return match ? match[1]! : null;
  };
  const field = [...publishing.preview.errors, ...publishing.saver.errors].find(
    (error) => error.path === '' && /^key\b/.test(error.message)
  );
  return (
    fromTransport(publishing.error) ??
    (publishing.saver.status === 'error'
      ? fromTransport(publishing.saver.message)
      : null) ??
    (publishing.preview.status === 'unreachable'
      ? fromTransport(publishing.preview.message)
      : null) ??
    field?.message ??
    null
  );
}

/** The refusals that describe the current bytes: the last save's when it
 * submitted exactly these bytes, else the live preview's while the server
 * accepts authoring. A key refusal is shown at the key field instead. */
export function currentRefusals(
  publishing: StudioPublishing,
  gate: AuthoringGateState
): StudioPublishing['preview']['errors'] {
  const { saver, preview, yaml } = publishing;
  const errors =
    saver.status === 'invalid' && saver.submittedYaml === yaml
      ? saver.errors
      : gate === 'live' && preview.status === 'errors'
        ? preview.errors
        : [];
  return errors.filter(
    (error) => !(error.path === '' && /^key\b/.test(error.message))
  );
}

/** "Saved as {key}" only for the save of exactly the current key, room and
 * bytes, so no stale success presents as current. */
export function savedCurrent(
  publishing: StudioPublishing,
  roomId: string
): string | null {
  const { saver, savedFor, key, yaml, busy } = publishing;
  return !busy &&
    saver.status === 'saved' &&
    savedFor !== null &&
    savedFor.key === key.trim() &&
    savedFor.roomId === roomId &&
    savedFor.yaml === yaml
    ? savedFor.key
    : null;
}

/** The header's status beside Save & Play: the seam the transaction is on,
 * the key it saved, or nothing. */
export function publishStatusText(
  publishing: StudioPublishing,
  roomId: string
): string {
  if (publishing.busy)
    switch (publishing.phase) {
      case 'checking-key':
        return 'Checking key…';
      case 'saving':
        return 'Saving…';
      case 'launching':
        return 'Starting…';
      default:
        return '';
    }
  const saved = savedCurrent(publishing, roomId);
  return saved ? `Saved as ${saved}` : '';
}
