/**
 * arrivingWalk — a walk act's cells, for `moveController`'s `stepArrived`
 * (rpg-project#630). The act stream's replacement for `arrivingStep`: v1 sent
 * one movement beat per cell; a walk act carries its whole path, so its cells
 * are fed in order and the controller paints them as one journey.
 *
 * Empty for anything that is not a walk, for a walk with no mover, and for
 * the local member's own walk: their route already arrived whole from their
 * Move answer, and feeding it here as well would drive the same walk twice.
 */
import type { Act } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import type { CubeCoord } from '../hex-grid/hexMath';
import { positionToCube } from './positionBridge';

export interface ArrivingWalk {
  readonly member: string;
  readonly cells: readonly CubeCoord[];
}

export function arrivingWalk(
  act: Act,
  member: string
): ArrivingWalk | undefined {
  if (act.body.case !== 'walk') return undefined;
  const mover = act.body.value.mover?.id;
  if (!mover || mover === member) return undefined;
  const cells = act.body.value.path.flatMap((step) =>
    step.cell ? [positionToCube(step.cell)] : []
  );
  if (cells.length === 0) return undefined;
  return { member: mover, cells };
}
