/**
 * applyHolding — patching the cached atlas when a prop is picked up off
 * the floor, and when one lands back on it (rpg-project#368 §4.3, R9).
 *
 * `applyReveal.ts` is the precedent and the law is the same one, run in
 * the other direction. A reveal ADDS what a member may now see; these two
 * SUBTRACT and re-add a thing everybody could already see. The patch buys
 * the frame — the prop is gone the instant the beat lands, not a round
 * trip later — and the refetch `SessionEncounterView` schedules on the
 * same event arrives afterwards with the server's own answer. GetAtlas
 * omits held props for everyone and places dropped ones at their drop
 * cell, so the refetch agrees with the patch rather than undoing it.
 *
 * # Physical state folds on the truth grain
 *
 * An object leaving the floor is not a secret (ruled 2026-09-01), so the
 * beat goes to everyone present and EVERY recipient's atlas loses the
 * prop. There is no per-recipient half to this the way there is for a
 * concealed door — which is exactly why this module is four lines of set
 * arithmetic and `applyReveal` is not.
 *
 * # Why a dropped prop needs remembering
 *
 * `Dropped` carries the member, the placement id and the cell — and NOT
 * the ref, because the id is the thing's name and the ref is not news to
 * anyone who watched it get picked up. But this client threw the prop
 * away when it applied the pick-up beat, so it no longer knows what to
 * draw. Hence `heldProp`: the caller keeps what it removed, keyed by id,
 * and hands it back on the drop. Without one the prop is still placed —
 * the cell is occupied, and the refetch fills the ref in a moment — but
 * it is placed honestly empty rather than as a guess.
 */

import { clone, create } from '@bufbuild/protobuf';
import type {
  Dropped,
  Held,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import {
  GetAtlasResponseSchema,
  type GetAtlasResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import {
  AtlasPropSchema,
  type AtlasProp,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';

/**
 * The atlas after a prop was picked up: the prop with that placement id is
 * gone, and nothing else moves.
 *
 * BY ID, NEVER BY REF. A dungeon may place two reliquaries; the id is what
 * says which one left the floor, and it is the only thing `Held` carries
 * about the prop. A beat naming an id this atlas does not hold — a prop
 * already removed, or one inside space this member has never seen —
 * removes nothing and is not an error: the refetch is the authority.
 */
export function applyHeld(
  atlas: GetAtlasResponse,
  event: Held
): GetAtlasResponse {
  if (!event.prop) return atlas;
  const next = clone(GetAtlasResponseSchema, atlas);
  next.props = next.props.filter((p) => p.id !== event.prop);
  return next;
}

/** What `applyHeld` would remove — for the caller to keep, so a later
 * drop can put the same thing back. Undefined when this atlas never held
 * it. */
export function heldProp(
  atlas: GetAtlasResponse,
  event: Held
): AtlasProp | undefined {
  if (!event.prop) return undefined;
  return atlas.props.find((p) => p.id === event.prop);
}

/**
 * The atlas after a holding landed back on the floor: the prop stands at
 * the drop cell.
 *
 * `remembered` is what this client removed when the prop was picked up,
 * if it saw that happen — its ref, its blocking answers and its authored
 * presentation, moved to the new cell. Without it the entry carries the
 * id and the cell alone, which is everything `Dropped` actually says.
 *
 * IDEMPOTENT ON THE ID: a prop with this id already standing is replaced
 * rather than duplicated, so a beat delivered twice draws one reliquary.
 */
export function applyDropped(
  atlas: GetAtlasResponse,
  event: Dropped,
  remembered?: AtlasProp
): GetAtlasResponse {
  // A drop with no cell is a beat this client cannot place. Putting the
  // prop at the origin would be a guess about where it lies, and the
  // refetch answers correctly a moment later — so nothing moves here.
  if (!event.prop || !event.at) return atlas;
  const next = clone(GetAtlasResponseSchema, atlas);
  const landed = remembered
    ? clone(AtlasPropSchema, remembered)
    : create(AtlasPropSchema, { id: event.prop });
  landed.id = event.prop;
  landed.at = { ...event.at };
  next.props = [...next.props.filter((p) => p.id !== event.prop), landed];
  return next;
}
