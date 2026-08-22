/**
 * formatMoveError — turns a caught `sessionClient.move` rejection into the
 * text `useSessionWalk` stores as `moveError` (rendered verbatim by
 * `SessionEncounterView`). Two special cases, both FailedPrecondition
 * sentinels rewritten to a player-facing line instead of raw text:
 *
 *  - `session.ErrInBubble` (rpg-toolkit `rulebooks/dnd5e/session/errors.go`,
 *    wire text "member is in a fight") — the OLD blanket fight lock, from
 *    session/v0.21.x. Kept here for back-compat; a server on toolkit#1169
 *    (session/v0.22+) never sends it for Move anymore (see the next case),
 *    so this branch is expected to go dormant once every environment is on
 *    the new build, not to be deleted speculatively ahead of that.
 *  - `session.ErrNotYourTurn` (same file, wire text "not your turn") —
 *    toolkit#1169's REPLACEMENT for the blanket lock: on the turn clock,
 *    only the active member may walk; every non-active member in the fight
 *    is refused this, and it is NOT permanent the way the old lock read —
 *    it flips off the moment the turn order cycles back to this member
 *    (`useSessionWalk`'s own doc comment on `fightLocked`'s clearing rule).
 *
 * NOT every `FailedPrecondition` is one of these two. rpg-api's own
 * translation table buckets EIGHT+ distinct SDK sentinels under that one
 * gRPC code (ErrInBubble, ErrNotYourTurn, ErrNotInFight, ErrClosed,
 * ErrNotACharacter, ErrBadAttack, ErrDowned, ErrLocked, ErrCannotAfford) —
 * matching on the code alone would relabel "member is downed" or "not
 * enough movement" (ErrCannotAfford's own "movement: 20 ft needed, 15 ft
 * left", which already reads player-friendly unmodified) as "movement is
 * locked" too. This checks the code AND the exact sentinel text
 * (`ConnectError.rawMessage`, which carries the server's `err.Error()`
 * unprefixed) before rewriting anything, every other case (including every
 * sibling FailedPrecondition sentinel) passes its own message through
 * unchanged.
 *
 * Parses these strings in exactly one place — nowhere else in this
 * codebase matches against them — so a future rename of either sentinel's
 * wire text only needs updating here. `isFightLockError`/
 * `isNotYourTurnError` are that one place, exported separately from
 * `formatMoveError` (slice 4 / toolkit#1169, rpg-dnd5e-web#762) so the
 * move indicator and `useSessionWalk`'s own `fightLocked` state can ask
 * "is this one of the turn-lock refusals" as a boolean without re-deriving
 * the same code+text match against the RPC rejection a second time.
 */
import { Code, ConnectError } from '@connectrpc/connect';

/** session.ErrInBubble's exact wire text (rpg-toolkit
 * rulebooks/dnd5e/session/errors.go) — a static sentinel, never formatted
 * with request-specific data, so an exact/contains match is safe and
 * won't false-positive on ErrNotInFight's "member is NOT in a fight". */
const FIGHT_LOCK_SENTINEL_TEXT = 'member is in a fight';

/** session.ErrNotYourTurn's exact wire text (same file) — toolkit#1169's
 * replacement for the blanket fight lock on Move specifically. */
const NOT_YOUR_TURN_SENTINEL_TEXT = 'not your turn';

const FIGHT_LOCK_MESSAGE = 'In a fight — movement is locked.';
const NOT_YOUR_TURN_MESSAGE = 'Not your turn — movement is locked.';

/** True exactly when `err` is the OLD blanket fight-lock refusal
 * (FailedPrecondition + the ErrInBubble wire text) — see this module's
 * own doc comment for why the code alone isn't enough, and why this is
 * expected to stop matching anything once every server is on the new
 * build. */
export function isFightLockError(err: unknown): boolean {
  const connectErr = ConnectError.from(err);
  return (
    connectErr.code === Code.FailedPrecondition &&
    connectErr.rawMessage.includes(FIGHT_LOCK_SENTINEL_TEXT)
  );
}

/** True exactly when `err` is the NEW not-your-turn refusal
 * (FailedPrecondition + the ErrNotYourTurn wire text, toolkit#1169). */
export function isNotYourTurnError(err: unknown): boolean {
  const connectErr = ConnectError.from(err);
  return (
    connectErr.code === Code.FailedPrecondition &&
    connectErr.rawMessage.includes(NOT_YOUR_TURN_SENTINEL_TEXT)
  );
}

export function formatMoveError(err: unknown): string {
  if (isFightLockError(err)) {
    return FIGHT_LOCK_MESSAGE;
  }
  if (isNotYourTurnError(err)) {
    return NOT_YOUR_TURN_MESSAGE;
  }
  return err instanceof Error ? err.message : 'Move RPC failed';
}
