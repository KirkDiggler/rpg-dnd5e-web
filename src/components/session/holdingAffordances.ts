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
 * # Hold is offered where the wire says holdable, and never guessed
 *
 * `AtlasProp.holdable` is the author's own flag, carried verbatim, and its
 * doc comment is explicit that a client offers Hold ONLY where it is true
 * and never infers the verb from the presence of an id: ids exist for
 * anything a scenario binds to, so guessing would put a Hold button on the
 * altar as readily as on the reliquary. Two independent facts, asked
 * separately.
 *
 * It is safe to ask because holding is structure on the truth grain — a
 * holdable thing LOOKS holdable, and every member who can see the cell
 * sees the same thing. Nothing is concealed by it, and a prop inside space
 * this member cannot see is absent from the atlas entirely.
 *
 * Offering is still not permission: Hold refuses out of range, already
 * held, or out of turn. This decides what a button is drawn on, never what
 * the server allows.
 *
 * # Leave is offered everywhere
 *
 * `GetAtlasResponse.exits` says where the ways out ARE, and its own doc
 * comment says what that is for: "FOR DRAWING THE WAY OUT, NOT FOR GATING
 * IT." R9 requires a departure from the vault to be possible — that is the
 * departure that drops the artifact where the carrier stood — so a client
 * that only offered Leave on these cells would make R9 unreachable.
 * `exitAt` therefore answers only "which way out am I standing on", for
 * the button to say so.
 */

import { hexDistance, type CubeCoord } from '@/components/hex-grid/hexMath';
import type { GetAtlasResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import type { AtlasExit } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
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
  // `?? []`, for `atlasToScene3D`'s own documented reason: a server or a
  // client-side schema older than the field hands back a message with it
  // entirely ABSENT, not empty, and a bare read is then `undefined`. An
  // atlas that says nothing about props offers nothing, which is the same
  // answer an atlas with no props gives.
  for (const prop of atlas.props ?? []) {
    // BOTH FACTS, ASKED SEPARATELY. `holdable` is the author's answer to
    // "can this be picked up"; the id is the only name the verb can send.
    // A holdable prop always has one (the compiler refuses one without),
    // so an id-less holdable prop is a producer defect — skipped rather
    // than sent as an empty target.
    if (!prop.holdable) continue;
    if (!prop.id || !prop.at) continue;
    if (hexDistance(positionToCube(prop.at), at) > ADJACENT) continue;
    targets.push({ id: prop.id, ref: prop.ref });
  }
  return targets;
}

/**
 * The authored way out the member is standing on, if any — for the Leave
 * button to name it. NEVER a gate: Leave is offered wherever they stand
 * (see this module's header, and `AtlasExit`'s own doc comment).
 */
export function exitAt(
  atlas: GetAtlasResponse | null,
  at: CubeCoord | null
): AtlasExit | undefined {
  if (!atlas || !at) return undefined;
  // `?? []` for `holdTargets`'s reason, and this one is not hypothetical:
  // every dungeon authored before slice 2 declares no way out, and an
  // atlas from a server older than the field carries none at all. Both
  // mean the same thing — the member is standing on no authored exit —
  // and neither is an error.
  return (atlas.exits ?? []).find(
    (exit) => exit.at && hexDistance(positionToCube(exit.at), at) === 0
  );
}

/** A prop ref as a button label — its last segment, spaced. The author's
 * own vocabulary, never a lookup table this client would have to keep in
 * step with the content. */
export function propLabel(target: HoldTarget): string {
  const words = (target.ref.split(':').pop() ?? '').replace(/[-_]+/g, ' ');
  return words || target.id.replace(/[-_]+/g, ' ');
}
