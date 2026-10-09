import { Code, ConnectError } from '@connectrpc/connect';

export interface SeatRefusal {
  /** The character the refused launch found seated elsewhere. */
  character: string;
  /** The earlier run still holding that character. */
  session: string;
}

const SEATED_PATTERN = /character "([^"]+)" is seated in session "([^"]+)"/;

/**
 * Reads the seat out of a launch refusal message. The server words it
 * `...launch: character "<id>" is seated in session "<run>": ...`
 * (rpg-api#1086). Returns null when the message does not name a seat, so the
 * caller can ask `GetSeat` instead of guessing.
 */
export function parseSeatRefusal(message: string): SeatRefusal | null {
  const match = SEATED_PATTERN.exec(message);
  if (!match) return null;
  return { character: match[1], session: match[2] };
}

/**
 * True when `err` is a `FailedPrecondition` refusal that is about a seat at
 * all (parsed or not), as opposed to any other precondition such as "not
 * everyone is ready".
 */
export function isSeatRefusal(err: unknown): boolean {
  const connectErr = ConnectError.from(err);
  return (
    connectErr.code === Code.FailedPrecondition &&
    /seated/.test(connectErr.rawMessage)
  );
}

/** The refusal's raw message, without the `[code]` prefix ConnectError adds. */
export function refusalMessage(err: unknown): string {
  return ConnectError.from(err).rawMessage;
}
