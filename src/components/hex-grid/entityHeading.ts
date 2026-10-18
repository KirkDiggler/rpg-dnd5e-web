/**
 * Which source steers a drawn entity's heading (rpg-project ideas/sneaking
 * design R13, rpg-project#582).
 *
 * THE WIRE'S FACING WINS WHEN IT IS THERE. `Seen.facing_degrees` is what this
 * viewer observed the subject facing — per-observer testimony, like the
 * position and the hands it rides beside. When present, it seeds the entity's
 * heading and is requested whenever it changes; the move path's per-leg
 * heading is NOT forwarded, because the engine already states where the
 * subject ended up facing and a client-side guess from the route would be a
 * second, disagreeing answer.
 *
 * ABSENT IS NOT NORTH. The protos doc says absent means the testimony predates
 * facing. Then the entity behaves exactly as before: seeded with the staging
 * pose (`DEFAULT_HEADING_BY_TYPE`) and turned by the move path.
 *
 * Pure, with no R3F import, so the gate is tested without a canvas — the same
 * split `facing.ts` and `useHexMovePath.ts` keep.
 */
import { DEFAULT_HEADING_BY_TYPE } from './facing';
import { degreesToYaw } from './facingYaw';

/** The world heading (radians) the wire's facing names, or `undefined` when
 * the wire stated none. A non-finite number is a producer bug, not a
 * bearing, and reads as absent rather than drawing a NaN rotation. */
export function seenHeading(
  seenFacingDegrees: number | undefined
): number | undefined {
  if (seenFacingDegrees === undefined || !Number.isFinite(seenFacingDegrees))
    return undefined;
  return degreesToYaw(seenFacingDegrees);
}

/** The heading an entity is seeded with: the wire's facing when present,
 * else the staging pose for its type. */
export function seedHeading(
  seenFacingDegrees: number | undefined,
  type: string
): number {
  return seenHeading(seenFacingDegrees) ?? DEFAULT_HEADING_BY_TYPE[type] ?? 0;
}

/** The sink `useHexMovePath` reports leg headings to: `requestHeading` only
 * when the wire states no facing, otherwise nothing — the move path's
 * heading is ignored, never raced against the wire's. */
export function movePathHeadingSink(
  seenFacingDegrees: number | undefined,
  requestHeading: (radians: number) => void
): ((radians: number) => void) | undefined {
  return seenHeading(seenFacingDegrees) === undefined
    ? requestHeading
    : undefined;
}
