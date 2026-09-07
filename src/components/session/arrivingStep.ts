/**
 * arrivingStep — reads one actor's next cell out of a movement beat.
 *
 * The wire sends one movement beat per cell (`Moved`'s own doc comment: "a
 * walk of four cells is four of these"), addressed to the whole roster with
 * the mover included. Until now the only thing this repo did with one was
 * invalidate a cache key, so `Moved.to` reached the debug log and the combat
 * story text and nothing that draws. This is the adapter that lets an
 * arriving beat feed `moveController`'s `stepArrived` instead.
 *
 * `undefined` for anything that is not a movement, and for a movement that
 * names no cell — there is nowhere to walk to, and a fabricated origin would
 * be a client-invented position.
 */
import type { Event as SessionEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import type { CubeCoord } from '../hex-grid/hexMath';
import { positionToCube } from './positionBridge';

export interface ArrivingStep {
  readonly member: string;
  readonly to: CubeCoord;
}

export function arrivingStep(event: SessionEvent): ArrivingStep | undefined {
  if (event.body.case !== 'moved') return undefined;
  const { member, to } = event.body.value;
  if (!to) return undefined;
  return { member, to: positionToCube(to) };
}
