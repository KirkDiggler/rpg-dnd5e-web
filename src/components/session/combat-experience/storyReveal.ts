/**
 * storyReveal — keeps the log from narrating a roll that has not landed.
 *
 * `selectVisibleStory` goes visible when the die is THROWN (see
 * `useDiceSettleGate.ts` for why release is not landing), so the strike, its
 * damage, and the "X is downed" that follows all appeared in the log while the
 * d20 was still tumbling — Kirk, 2026-08-28: "the damage and downed is showing
 * in the combat log before the roll has finished".
 *
 * # Why a suffix, and not just the attack's own line
 *
 * Everything the story adds after a strike is a CONSEQUENCE of it: the damage
 * sits on the strike's own entry, and the downed line is the next event along.
 * Hiding the strike while leaving "Skeleton Guard is downed" underneath it
 * would spoil the roll just as completely, and read as a bug besides. So the
 * whole tail from the unsettled attack onward waits together, and lands
 * together when the die does.
 *
 * # No id parsing
 *
 * The boundary is found by locating the attack's own entry in an already
 * ordered list and slicing there. Story ids are opaque to this module — it
 * compares them, and never takes them apart to recover a sequence number.
 */
import type { CombatExperienceStoryExchange } from './types';

/**
 * The story with any still-rolling attack, and everything after it, withheld.
 *
 * Returns the SAME array when nothing is held, so a settled log adds no
 * referential churn to the render.
 *
 * `unsettledAttackId` absent means nothing is in flight — reveal everything.
 * An id that is not in the story yet also reveals everything: the entry has
 * not arrived, so there is no boundary to cut at and nothing after it to hide.
 */
export function holdStoryUntilSettled(
  story: readonly CombatExperienceStoryExchange[],
  unsettledAttackId: string | undefined
): readonly CombatExperienceStoryExchange[] {
  if (!unsettledAttackId) return story;
  const boundary = story.findIndex((entry) => entry.id === unsettledAttackId);
  if (boundary < 0) return story;
  return story.slice(0, boundary);
}
