/**
 * holdingAffordances — which bodies the viewer may loot and which props
 * they may pick up, from what this member can already see
 * (rpg-project#368 §4.2/§4.3).
 *
 * # The client computes ONE thing, and it is not a rule
 *
 * Adjacency, and nothing else. Whether a body is worth looting, whether a
 * prop can be picked up at all, whether the fight's turn clock forbids it
 * right now — every one of those is the rule half's, refused by name at
 * the seam. This module answers only "is that thing next to me", because
 * an affordance has to be drawn somewhere and a button on a thing three
 * rooms away is not an offer.
 *
 * # Loot is offered on EVERY downed body
 *
 * Design P3, and the single most load-bearing line in this file: a body
 * with nothing to give transfers nothing, and the affordance must not say
 * which one carries intel. There is deliberately no filter here for
 * "carries something", no ordering that puts the captain first, and
 * nothing on the wire that would let one be written — `Sighting` says a
 * subject is down and says no more. The same law as search: the answer
 * never leaks the question.
 *
 * # A holdable prop is not knowable from the wire
 *
 * `AtlasProp` carries no `takeable`/`holdable` flag, on purpose — the
 * authored fact stays in the dungeon file and the refusal stays at the
 * rule half. So the offer here is every adjacent prop THE AUTHOR NAMED:
 * an id is the only thing the pick-up verb can target (`TakeRequest.target`
 * is a placement id), and it is required of a holdable prop by the
 * compiler ("a thing that can be picked up has to be nameable"). A pillar
 * the author happened to name refuses by name when tried, which is what
 * design §4.3 says a visible prop does. That is one wasted click, not a
 * leak: an unnamed prop was never targetable and a named one was already
 * public.
 */

import { hexDistance, type CubeCoord } from '@/components/hex-grid/hexMath';
import type { GetAtlasResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { Standing } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { positionToCube } from './positionBridge';
import type { SightedMember } from './sightingEntities';

/** Adjacent means ONE CELL, and the member's own cell counts — the seam's
 * `range: 0` is "adjacent" and a body can fall where you stand. Named once
 * so both offers mean the same thing by the same number. */
export const ADJACENT = 1;

/** One body the viewer may loot. */
export interface LootTarget {
  /** The wire subject id — what `LootRequest.target` carries. */
  subject: string;
  /** `Sighting.name`, for the button. */
  name: string;
}

/** One prop the viewer may pick up. */
export interface HoldTarget {
  /** The placement id — what the pick-up request targets, and the only
   * name a prop has on this wire. */
  id: string;
  /** The prop's ref, for the button's label. */
  ref: string;
}

/**
 * Every downed member the viewer perceives within one cell — in the order
 * the sightings arrived, which is not an order this module chooses.
 *
 * `remembered` sightings are INCLUDED: a body the viewer saw fall and can
 * no longer see is still a body they can reach, and excluding it would
 * make the offer a statement about line of sight, which is a rule. If the
 * memory is stale the seam refuses; nothing is decided here.
 */
export function lootTargets(
  sighted: readonly SightedMember[],
  at: CubeCoord | null
): LootTarget[] {
  if (!at) return [];
  return sighted
    .filter(
      (s) =>
        s.standing === Standing.DOWNED &&
        hexDistance(s.position, at) <= ADJACENT
    )
    .map((s) => ({ subject: s.subject, name: s.name }));
}

/**
 * Every named prop within one cell of the viewer. A prop the author left
 * unnamed is absent: there is no id to send, so there is no offer to make.
 */
export function holdTargets(
  atlas: GetAtlasResponse | null,
  at: CubeCoord | null
): HoldTarget[] {
  if (!atlas || !at) return [];
  const targets: HoldTarget[] = [];
  for (const prop of atlas.props) {
    if (!prop.id || !prop.at) continue;
    if (hexDistance(positionToCube(prop.at), at) > ADJACENT) continue;
    targets.push({ id: prop.id, ref: prop.ref });
  }
  return targets;
}

/** A prop ref as a button label — its last segment, spaced. The author's
 * own vocabulary, never a lookup table this client would have to keep in
 * step with the content. */
export function propLabel(target: HoldTarget): string {
  const words = (target.ref.split(':').pop() ?? '').replace(/[-_]+/g, ' ');
  return words || target.id.replace(/[-_]+/g, ' ');
}
