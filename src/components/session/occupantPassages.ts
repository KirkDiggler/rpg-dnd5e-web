import { Passage } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { coordToKey } from '../hex-grid/hexMath';
import type { SightedMember } from './sightingEntities';

/** Fold only provider answers. A permissive occupant cannot open a blocking cell. */
export function indexOccupantPassages(members: readonly SightedMember[]) {
  const blocked = new Set<string>();
  const passThrough = new Set<string>();
  let error: string | null = null;
  for (const member of members) {
    if (member.remembered) continue;
    const cell = coordToKey(member.position);
    switch (member.passage) {
      case Passage.BLOCKED:
        blocked.add(cell);
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
  return { blocked, passThrough, error };
}
