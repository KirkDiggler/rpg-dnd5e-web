/**
 * formatMoveError — turns a caught `sessionClient.move` rejection into the
 * text `useSessionWalk` stores as `moveError` (rendered verbatim by
 * `SessionEncounterView`). One special case: the server refuses a `Move`
 * while the member is mid-fight with `session.ErrInBubble` (rpg-toolkit
 * `rulebooks/dnd5e/session/errors.go`, wire text "member is in a fight"),
 * translated to gRPC `FailedPrecondition` by rpg-api's `statusError` table
 * (`internal/handlers/dnd5e/session/v1alpha1/errors.go`) — that one gets a
 * player-facing rewrite instead of the raw sentinel text.
 *
 * NOT every `FailedPrecondition` is the fight lock. rpg-api's own
 * translation table buckets EIGHT distinct SDK sentinels under that one
 * gRPC code (ErrInBubble, ErrNotInFight, ErrClosed, ErrNotACharacter,
 * ErrBadAttack, ErrDowned, ErrLocked, ErrCannotAfford) — matching on the
 * code alone would relabel "member is downed" or "encounter closed" as
 * "movement is locked" too. This checks the code AND the exact sentinel
 * text (`ConnectError.rawMessage`, which carries the server's `err.Error()`
 * unprefixed) before rewriting anything else, every other case (including
 * every sibling FailedPrecondition sentinel) passes its own message
 * through unchanged.
 *
 * Parses this string in exactly one place — nowhere else in this codebase
 * matches against it — so a future rename of the sentinel's wire text only
 * needs updating here.
 */
import { Code, ConnectError } from '@connectrpc/connect';

/** session.ErrInBubble's exact wire text (rpg-toolkit
 * rulebooks/dnd5e/session/errors.go) — a static sentinel, never formatted
 * with request-specific data, so an exact/contains match is safe and
 * won't false-positive on ErrNotInFight's "member is NOT in a fight". */
const FIGHT_LOCK_SENTINEL_TEXT = 'member is in a fight';

const FIGHT_LOCK_MESSAGE = 'In a fight — movement is locked.';

export function formatMoveError(err: unknown): string {
  const connectErr = ConnectError.from(err);
  if (
    connectErr.code === Code.FailedPrecondition &&
    connectErr.rawMessage.includes(FIGHT_LOCK_SENTINEL_TEXT)
  ) {
    return FIGHT_LOCK_MESSAGE;
  }
  return err instanceof Error ? err.message : 'Move RPC failed';
}
