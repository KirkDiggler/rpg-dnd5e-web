/**
 * startCamera — where the camera sits on the first frame, given the
 * dungeon's authored starting facing (rpg-project#374 design, "The walks").
 *
 * Kirk, walking the build: "we always start looking the wrong way and have
 * to spin around." The camera has always been seated at one fixed
 * isometric offset, `CAMERA_OFFSET`, whatever the dungeon — so a party
 * whose entrance faces east spent its first seconds turning around to see
 * the room it came for.
 *
 * # It is a rotation of the seat we already had, not a new one
 *
 * `CAMERA_OFFSET` is `[8, 10, 8]`: XZ of (8, 8), which in this codebase's
 * table-angle convention (`facingYaw.ts`: east is 0 at +X, south is 90 at
 * +Z) puts the camera to the south-east, LOOKING north-west. So today's
 * fixed seat is not arbitrary — it is the seat for a party facing `nw`,
 * and `startCameraOffset('nw')` returns it. Everything else is that same
 * seat swung around the target, at the same radius and the same height,
 * so the tabletop pitch Kirk calibrated is untouched and only the compass
 * bearing moves.
 *
 * The camera sits BEHIND the party relative to where they look: for a
 * facing direction `d`, the offset's XZ is `-d * radius`, which puts the
 * subject between the camera and what they are facing.
 *
 * # No facing means today, exactly
 *
 * An absent, empty or unrecognised facing returns `CAMERA_OFFSET` itself —
 * the same array, not a recomputed copy — so a dungeon that states none
 * gets a bit-identical seat rather than one that merely rounds to it.
 * `AtlasStart.facing`'s own doc comment makes this the contract: "a client
 * that finds it empty aims the camera exactly as it does today."
 *
 * # It reads the atlas and nothing else
 *
 * The facing comes from `GetAtlasResponse.start` alone. The design is
 * explicit that rpg-api reads it from the atlas mirror and never a second
 * source, and the same holds here: there is no other place in this client
 * to learn it from, and adding one later would be two answers to one
 * question.
 *
 * FACING DECIDES NOTHING ELSE. It aims the first frame. It does not gate
 * movement, sight, or the orientation of anything in the scene — the wire
 * says so in as many words, and this module touches only a camera seat.
 */
import { facingAngleDeg } from '@/components/hex-grid/facingYaw';
import { CAMERA_OFFSET } from '@/rendering/calibrationConstants';

const DEG = Math.PI / 180;

/**
 * The camera's mount-time position for a dungeon whose start states
 * `facing`, or `CAMERA_OFFSET` unchanged when it states none.
 *
 * Returns the shared `CAMERA_OFFSET` reference in the no-facing case on
 * purpose: identity is the cheapest possible proof that nothing moved.
 */
export function startCameraOffset(
  facing: string | undefined
): readonly [number, number, number] {
  if (!facing) return CAMERA_OFFSET;
  const deg = facingAngleDeg(facing);
  // An unrecognised word is the server's to refuse, not ours to
  // interpret — and a camera pointed at a guess is worse than one
  // pointed where it has always pointed.
  if (deg === undefined) return CAMERA_OFFSET;

  const [x, y, z] = CAMERA_OFFSET;
  const radius = Math.hypot(x, z);
  const radians = deg * DEG;
  // Behind the party: the subject sits between the camera and whatever
  // they are looking at.
  return [-Math.cos(radians) * radius, y, -Math.sin(radians) * radius];
}
