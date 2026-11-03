import { Passage } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { coordToKey } from '../hex-grid/hexMath';
import type { SightedMember } from './sightingEntities';
import { STANCE_HOSTILE } from './stanceRing';

/**
 * Fold only provider answers. A permissive occupant cannot open a blocking cell.
 *
 * `walkInto` (rpg-project#841, P1) is the part of `blocked` a walk may still
 * be planned INTO: a seen body whose passage is BLOCKED and whose believed
 * stance is not hostile, such as a guard posted in a crossing. The planner
 * keeps it blocked on its first plan and opens it only on a second one, when
 * he is the goal or no route round exists; the server then stops the walk at
 * his cell. Both facts are the server's (passage, `Sighting.stance`); nothing
 * here computes who can see whom. A cell any body believed hostile blocks is
 * never in `walkInto`.
 */
export function indexOccupantPassages(members: readonly SightedMember[]) {
  const blocked = new Set<string>();
  const passThrough = new Set<string>();
  const walkInto = new Set<string>();
  const hostile = new Set<string>();
  let error: string | null = null;
  for (const member of members) {
    if (member.remembered) continue;
    const cell = coordToKey(member.position);
    switch (member.passage) {
      case Passage.BLOCKED:
        blocked.add(cell);
        if (member.stance === STANCE_HOSTILE) hostile.add(cell);
        else walkInto.add(cell);
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
  for (const cell of hostile) walkInto.delete(cell);
  return { blocked, passThrough, walkInto, error };
}
