import { Passage } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { coordToKey } from '../hex-grid/hexMath';
import type { SightedMember } from './sightingEntities';
import { STANCE_ALLIED, STANCE_NEUTRAL } from './stanceRing';

/**
 * Fold only provider answers. A permissive occupant cannot open a blocking cell.
 *
 * `walkInto` (rpg-project#841, P1) is the part of `blocked` a walk may still
 * be planned INTO: a seen body whose passage is BLOCKED and whose believed
 * stance is neutral or allied, such as a guard posted in a crossing. It
 * fails closed: a body believed hostile, or one the server gives no stance
 * word for, stays blocked on both plans. The second plan is an exception,
 * and the web never steers the player into a body it cannot name. The
 * planner keeps it blocked on its first plan and opens it only on a second
 * one, when no route round exists and his cell is not the goal; the server
 * then stops the walk at his cell. Both facts are the server's (passage, `Sighting.stance`); nothing
 * here computes who can see whom. A cell any other blocking body also holds
 * is never in `walkInto`.
 *
 * `heldDoors` (rpg-project#852, R5) are the door ids a live sighting's
 * `holdsDoor` names: a posted body bars that door's opening against the
 * viewer, open or shut, so the planner plans its doorways shut. A memory
 * holds nothing live and is skipped like every other memory. The server
 * decides the hold and whom it bars; the web reads the id it is sent.
 * `walkIntoHeldDoors` is the part of `heldDoors` the second plan may still
 * cross, by the same fail-closed rule as `walkInto`: every body holding the
 * door is believed neutral or allied. The server then stops the walk at the
 * opening and names him.
 */
export function indexOccupantPassages(members: readonly SightedMember[]) {
  const blocked = new Set<string>();
  const passThrough = new Set<string>();
  const walkInto = new Set<string>();
  const refused = new Set<string>();
  const heldDoors = new Set<string>();
  const refusedHolds = new Set<string>();
  let error: string | null = null;
  for (const member of members) {
    if (member.remembered) continue;
    const cell = coordToKey(member.position);
    if (member.holdsDoor) {
      heldDoors.add(member.holdsDoor);
      if (member.stance !== STANCE_NEUTRAL && member.stance !== STANCE_ALLIED)
        refusedHolds.add(member.holdsDoor);
    }
    switch (member.passage) {
      case Passage.BLOCKED:
        blocked.add(cell);
        if (member.stance === STANCE_NEUTRAL || member.stance === STANCE_ALLIED)
          walkInto.add(cell);
        else refused.add(cell);
        break;
      case Passage.PASS_THROUGH:
        passThrough.add(cell);
        break;
      case Passage.STANDABLE:
        break;
      default:
        error =
          'Movement permissions are unavailable. Refresh the encounter to retry.';
    }
  }
  for (const cell of refused) walkInto.delete(cell);
  const walkIntoHeldDoors = new Set(
    [...heldDoors].filter((door) => !refusedHolds.has(door))
  );
  return {
    blocked,
    passThrough,
    walkInto,
    heldDoors,
    walkIntoHeldDoors,
    error,
  };
}
