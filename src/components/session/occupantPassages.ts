import { Passage } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { coordToKey } from '../hex-grid/hexMath';
import type { DoorHold } from './atlasPath';
import { positionToCube } from './positionBridge';
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
 * `holds` (rpg-project#852 R5, rpg-project#857 R6) are the holds a live
 * sighting's `holdsDoor` names, one per holder: a posted body bars that
 * door's opening against the viewer, open or shut. Each carries the
 * server's direction (`holdsAgainst`) and the post's side cells
 * (`holdsSide`), so the planner shuts each crossing only in the barred
 * direction. A memory holds nothing live and is skipped like every other
 * memory. The server decides the hold, its direction and whom it bars; the
 * web reads what it is sent. `walkInto` on a hold is the same fail-closed
 * rule as the cell's: the holder is believed neutral or allied, so the
 * second plan may still cross the opening his way and the server stops the
 * walk there by his name.
 */
export function indexOccupantPassages(members: readonly SightedMember[]) {
  const blocked = new Set<string>();
  const passThrough = new Set<string>();
  const walkInto = new Set<string>();
  const refused = new Set<string>();
  const holds: DoorHold[] = [];
  let error: string | null = null;
  for (const member of members) {
    if (member.remembered) continue;
    const cell = coordToKey(member.position);
    if (member.holdsDoor) {
      holds.push({
        door: member.holdsDoor,
        against: member.holdsAgainst ?? '',
        side: new Set(
          (member.holdsSide ?? []).map((at) => coordToKey(positionToCube(at)))
        ),
        walkInto:
          member.stance === STANCE_NEUTRAL || member.stance === STANCE_ALLIED,
      });
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
  return {
    blocked,
    passThrough,
    walkInto,
    holds,
    error,
  };
}
