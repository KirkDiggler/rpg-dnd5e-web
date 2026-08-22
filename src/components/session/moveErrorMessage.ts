/**
 * formatMoveError — turns a caught `sessionClient.move` rejection into the
 * text `useSessionWalk` stores as `moveError` (rendered verbatim by
 * `SessionEncounterView` as a status line — rpg-project#249's own "the two
 * Move refusals render as status lines").
 *
 * ONE special case, a FailedPrecondition sentinel rewritten to a
 * player-facing line instead of raw text:
 *
 *  - `session.ErrNotYourTurn` (rpg-toolkit
 *    `rulebooks/dnd5e/session/errors.go`, wire text "not your turn") —
 *    toolkit#1169's turn-clock refusal: on the turn clock, only the
 *    active member may walk. It is NOT permanent — it flips off the
 *    moment the turn order cycles back to this member.
 *
 * The OLD blanket fight lock (`session.ErrInBubble`, "member is in a
 * fight") is gone from this module — toolkit#1169 replaced it, and
 * rpg-api#801 removed the old encounter stack it belonged to entirely.
 * Nothing on the current stack sends it, so rewriting it here would be a
 * stopgap for a sentinel that can no longer arrive (rpg-project#249 §6:
 * "we should not build anything to cover a gap that will be thrown away
 * later" applies just as much to keeping one around after the gap has
 * already closed).
 *
 * The OTHER Move refusal this feature adds — `session.ErrCannotAfford`'s
 * own wording, "movement: 20 ft needed, 15 ft left" — already reads
 * player-friendly unmodified, so it passes through this function
 * untouched, same as every other rejection.
 *
 * NOT every `FailedPrecondition` is the turn-lock case. rpg-api's own
 * translation table buckets several distinct SDK sentinels under that one
 * gRPC code (ErrNotYourTurn, ErrNotInFight, ErrClosed, ErrNotACharacter,
 * ErrBadAttack, ErrDowned, ErrLocked, ErrCannotAfford) — matching on the
 * code alone would relabel "member is downed" or "movement: 20 ft needed,
 * 15 ft left" as "movement is locked" too. This checks the code AND the
 * exact sentinel text (`ConnectError.rawMessage`, which carries the
 * server's `err.Error()` unprefixed) before rewriting anything; every
 * other case passes its own message through unchanged.
 *
 * Parses this string in exactly one place — nowhere else in this
 * codebase matches against it — so a future rename of the sentinel's wire
 * text only needs updating here. `isNotYourTurnError` is that one place,
 * exported separately from `formatMoveError` so the move indicator and
 * `useSessionWalk`'s own turn-lock state can ask "is this the turn-lock
 * refusal" as a boolean without re-deriving the same match a second time.
 */
import { Code, ConnectError } from '@connectrpc/connect';

/** session.ErrNotYourTurn's exact wire text (rpg-toolkit
 * rulebooks/dnd5e/session/errors.go) — toolkit#1169's turn-clock refusal
 * on Move specifically. */
const NOT_YOUR_TURN_SENTINEL_TEXT = 'not your turn';

const NOT_YOUR_TURN_MESSAGE = 'Not your turn — movement is locked.';

/** True exactly when `err` is the not-your-turn refusal (FailedPrecondition
 * + the ErrNotYourTurn wire text, toolkit#1169). */
export function isNotYourTurnError(err: unknown): boolean {
  const connectErr = ConnectError.from(err);
  return (
    connectErr.code === Code.FailedPrecondition &&
    connectErr.rawMessage.includes(NOT_YOUR_TURN_SENTINEL_TEXT)
  );
}

export function formatMoveError(err: unknown): string {
  if (isNotYourTurnError(err)) {
    return NOT_YOUR_TURN_MESSAGE;
  }
  return err instanceof Error ? err.message : 'Move RPC failed';
}
