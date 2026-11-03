/**
 * arrivingWalk — a walk act's cells, for `moveController`'s `stepArrived`
 * (rpg-project#630). The act stream's replacement for `arrivingStep`: v1 sent
 * one movement beat per cell; a walk act carries its whole path, so its cells
 * are fed in order and the controller paints them as one journey.
 *
 * Empty for anything that is not a walk, for a walk with no mover, and for
 * the local member's OWN walk: their route already arrived whole from their
 * Move answer, and feeding it here as well would drive the same walk twice. A
 * local member's compelled or displaced walk IS fed — no Move answer carries
 * a route somebody else decided (rpg-project#825).
 */
import {
  MoveKind as WireMoveKind,
  type Act,
  type WalkAct,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import type { CubeCoord } from '../hex-grid/hexMath';
import type { MoveKind } from '../hex-grid/moveKind';
import { positionToCube } from './positionBridge';

export interface ArrivingWalk {
  readonly member: string;
  readonly cells: readonly CubeCoord[];
  /** How the body moved — the authoritative wire fact, never inferred. */
  readonly kind: MoveKind;
}

/**
 * walkMoveKind reads a walk act's kind. A writer that does not know the kind
 * sends MOVE_KIND_UNSPECIFIED, and then the deprecated `forced` decides:
 * true is displaced, anything else own.
 */
export function walkMoveKind(walk: WalkAct): MoveKind {
  switch (walk.kind) {
    case WireMoveKind.OWN:
      return 'own';
    case WireMoveKind.COMPELLED:
      return 'compelled';
    case WireMoveKind.DISPLACED:
      return 'displaced';
    default:
      // The fallback is the one reader the deprecated mirror exists for.
      return walk.forced ? 'displaced' : 'own';
  }
}

export function arrivingWalk(
  act: Act,
  member: string
): ArrivingWalk | undefined {
  if (act.body.case !== 'walk') return undefined;
  const mover = act.body.value.mover?.id;
  const kind = walkMoveKind(act.body.value);
  if (!mover || (mover === member && kind === 'own')) return undefined;
  const cells = act.body.value.path.flatMap((step) =>
    step.cell ? [positionToCube(step.cell)] : []
  );
  if (cells.length === 0) return undefined;
  return { member: mover, cells, kind };
}
