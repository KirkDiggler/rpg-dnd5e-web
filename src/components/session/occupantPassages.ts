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
 * and the web never steers the player into a body it cannot name. The planner
 * keeps it blocked on its first plan and opens it only on a second one, when
 * he is the goal or no route round exists; the server then stops the walk at
 * his cell. Both facts are the server's (passage, `Sighting.stance`); nothing
 * here computes who can see whom. A cell any other blocking body also holds
 * is never in `walkInto`.
 */
export function indexOccupantPassages(members: readonly SightedMember[]) {
  const blocked = new Set<string>();
  const passThrough = new Set<string>();
  const walkInto = new Set<string>();
  const unnamed = new Set<string>();
  let error: string | null = null;
  for (const member of members) {
    if (member.remembered) continue;
    const cell = coordToKey(member.position);
    switch (member.passage) {
      case Passage.BLOCKED:
        blocked.add(cell);
        if (member.stance === STANCE_NEUTRAL || member.stance === STANCE_ALLIED)
          walkInto.add(cell);
        else unnamed.add(cell);
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
  for (const cell of unnamed) walkInto.delete(cell);
  return { blocked, passThrough, walkInto, error };
}
