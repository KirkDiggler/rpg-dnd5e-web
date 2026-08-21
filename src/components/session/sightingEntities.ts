/**
 * sightingEntities — turns `GetViewResponse.sightings` into what
 * `SessionScene` needs to draw one `HexEntity` per other member the local
 * player currently perceives (rpg-dnd5e-web#762 slice 3).
 *
 * Two rules straight from `Sighting`'s own wire doc comment
 * (types_pb.ts), both enforced here rather than left for the render layer
 * to remember:
 *
 *   - `seen` unset means no position is known for this subject at all —
 *     never guessed, never drawn (`sightingsToEntities` simply omits it).
 *   - `currentVia` empty means the observer holds a MEMORY, not a live
 *     sighting — still drawn, but flagged `remembered` so the caller can
 *     feed `HexEntity.knowledgeState="remembered"`, the same frozen/
 *     crypt-colored treatment `sceneKnowledge.ts` already gives a
 *     out-of-LoS memory elsewhere in this codebase (not a new visual
 *     language).
 *
 * `payload` is never read here — position comes ONLY from `seen.position`,
 * per the review brief's "NEVER decode; render only from seen" rule.
 */
import type { Sighting } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type { CubeCoord } from '../hex-grid/hexMath';
import { positionToCube } from './positionBridge';

export interface SightedMember {
  /** The wire subject id, e.g. "skeleton-1" — also this entity's React
   * key and `HexEntity.entityId`. */
  subject: string;
  /** The toolkit monster ref id derived from `subject` (strips the
   * trailing `-<ordinal>`) — feeds `resolveMonsterModelUrl` via
   * `HexEntity.monsterRefId`. */
  monsterRefId: string;
  position: CubeCoord;
  /** True when `currentVia` was empty — a held memory, not a live
   * sighting. Feeds `HexEntity.knowledgeState="remembered"`. */
  remembered: boolean;
}

/** Strips a subject id's trailing `-<ordinal>` (e.g. "skeleton-1" ->
 * "skeleton", "skeleton-captain-9" -> "skeleton-captain") to recover the
 * toolkit monster ref id `resolveMonsterModelUrl` keys on. A subject with
 * no trailing ordinal (unexpected, defensive only) is returned unchanged
 * rather than mangled. */
export function monsterRefIdFromSubject(subject: string): string {
  return subject.replace(/-\d+$/, '');
}

/**
 * `sightings` is `GetViewResponse.sightings`, as-is. `ownMember` is the
 * local player's own member/character id — GetView's own doc comment says
 * it already skips the observer's self, so this filter is defensive
 * belt-and-suspenders (a future member shape or a server edge case),
 * never the primary mechanism.
 */
export function sightingsToEntities(
  sightings: Sighting[],
  ownMember: string
): SightedMember[] {
  const entities: SightedMember[] = [];
  for (const sighting of sightings) {
    if (sighting.subject === ownMember) continue;
    if (!sighting.seen?.position) continue;
    entities.push({
      subject: sighting.subject,
      monsterRefId: monsterRefIdFromSubject(sighting.subject),
      position: positionToCube(sighting.seen.position),
      remembered: sighting.currentVia.length === 0,
    });
  }
  return entities;
}
