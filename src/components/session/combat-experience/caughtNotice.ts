import type { CaughtMember } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { UnresolvedReason } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';

/**
 * caughtNotice turns the members an area cast reached and could not resolve
 * against into one line a player can read, or null when there were none.
 *
 * THE POINT IS THAT IT SAYS SOMETHING. The engine already knows a shopkeeper
 * was standing in the blast and that nothing in this build models what that
 * does to them. Reporting no targets and staying silent would make that
 * indistinguishable from casting into an empty room — a missing capability
 * wearing the appearance of a spell that missed.
 *
 * Names the members rather than counting them: "1 creature was unaffected"
 * tells a player nothing they can act on, and the whole value here is being
 * able to point at the merchant.
 */
export function caughtNotice(caught: readonly CaughtMember[]): string | null {
  if (caught.length === 0) return null;
  const names = caught.map((member) => member.member).join(', ');
  const reason = caught.every(
    (member) => member.reason === UnresolvedReason.NO_SHEET
  )
    ? 'nothing here models what that does to them yet'
    : 'the engine could not resolve against them';
  return `Caught in the area: ${names} — ${reason}.`;
}
