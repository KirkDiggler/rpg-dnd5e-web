/**
 * downedReveal — holds a monster on its feet until the attack that felled it
 * has actually been rolled on screen.
 *
 * # The bug this exists for
 *
 * Standing is server truth, delivered by `GetView` and projected verbatim by
 * `sightingEntities.ts`. Events reach the authoritative reducer and the query
 * invalidation funnel the moment they arrive — `useCombatStoryPacing`'s own
 * doc comment says so — and only the STORY projection is paced. Nothing paced
 * the MAP. So the killing blow's DOWNED landed in a refetch while the
 * player's d20 was still tumbling: the skeleton hit the floor, and then the
 * dice explained why. The reveal ran backwards.
 *
 * # What this does, and what it refuses to do
 *
 * This delays a fact; it never invents or contradicts one. A held subject
 * renders at its PREVIOUS standing for a beat longer, and the server's answer
 * arrives intact the instant the roll resolves. In particular this never
 * marks anyone downed — the "never a client-side HP-reaches-zero guess" law in
 * `SightedMember.standing`'s doc comment is untouched, because the only edit
 * this module can make is in the other direction.
 *
 * # Why it cannot stick
 *
 * The held set comes from `selectUnresolvedAttackTargets`, which is empty
 * except while the local player's own live attack awaits its dice release.
 * Monster attacks and catch-up records settle `'auto'` and are never held.
 * If a dice release were somehow lost, the affected monster would render
 * standing while the log already reported its death — visible and wrong, but
 * bounded to that one subject and cleared by the next view that resolves it.
 */
import { Standing } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type { SightedMember } from './sightingEntities';

/**
 * Re-stands any entity whose downing attack has not been revealed yet.
 *
 * Returns the SAME array when nothing is held, so the common case adds no
 * referential churn to the memo that feeds the canvas.
 */
export function holdDownedReveal(
  entities: readonly SightedMember[],
  unresolvedTargets: ReadonlySet<string>
): readonly SightedMember[] {
  if (unresolvedTargets.size === 0) return entities;

  let changed = false;
  const held = entities.map((entity) => {
    if (
      entity.standing !== Standing.DOWNED ||
      !unresolvedTargets.has(entity.subject)
    ) {
      return entity;
    }
    changed = true;
    return { ...entity, standing: Standing.UP };
  });

  return changed ? held : entities;
}
