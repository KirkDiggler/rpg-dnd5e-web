/**
 * startAzimuth — where the camera SITS on the first frame, given the
 * dungeon's authored starting facing (rpg-project#374 design, "The walks").
 *
 * Kirk, walking the build: "we always start looking the wrong way and have
 * to spin around." The camera has always started at one bearing whatever
 * the dungeon, so a party whose entrance faces east spent its first
 * seconds turning around to see the room it came for.
 *
 * # It seeds the hook's azimuth, and that is the only seam that works
 *
 * `useCameraControls` owns the camera. Its mount effect calls
 * `updateCamera`, which computes the seat from `azimuth.current` and
 * `distance.current` and calls `camera.position.set(...)` — so a
 * `<Canvas camera={{ position }}>` prop is overwritten before the first
 * frame is drawn and `camera.position` is never read. An earlier cut of
 * this feature set that prop and moved nothing at all; the mounted-hook
 * test beside this file is what would have caught it, and now does.
 *
 * # The camera sits BEHIND the party
 *
 * `updateCamera` places the camera at bearing `az` from the target:
 * XZ offset is `(distance·sin(polar) − focusLead)·(cos az, sin az)`. A
 * party at table angle θ (`facingYaw.ts`: east is 0 at +X, south is 90 at
 * +Z) looks along `(cos θ, sin θ)`, so the seat that puts them between the
 * camera and what they are looking at is `az = θ + 180°`.
 *
 * # Nothing else about the seat moves
 *
 * Height is `target.y + distance·cos(polar)` — no `az` in it — and the XZ
 * radius is `distance·sin(polar) − focusLead`, also free of `az`. So
 * seeding the bearing cannot change the distance, the pitch, or the
 * calibrated tabletop look; only which way round the party the camera
 * stands.
 *
 * And the historical seat is itself a facing: `azimuth` has always
 * defaulted to 45°, which is `az` for θ = −135° — a party facing `nw`. So
 * `nw` and "no facing stated" produce the same seat as each other and as
 * every dungeon before this existed.
 *
 * FACING DECIDES NOTHING ELSE. It aims the first frame and gates nothing:
 * not movement, not sight, not the orientation of anything in the scene.
 * `AtlasStart.facing` says so on the wire in as many words.
 */
import { facingAngleDeg } from '@/components/hex-grid/facingYaw';

const DEG = Math.PI / 180;

/** Where this camera has always started, and what it keeps starting at
 * when a dungeon states no facing. Mirrors `useCameraControls`'s own
 * default so the two can be compared in a test rather than trusted. */
export const DEFAULT_AZIMUTH = Math.PI / 4;

/**
 * The mount-time azimuth for a dungeon whose start states `facing`, or
 * `undefined` when it states none — which leaves the hook on its own
 * default and the camera exactly where it has always been.
 *
 * An unrecognised word yields `undefined` too: the eight names are the
 * server's to enforce, and a camera pointed at a guess is worse than one
 * pointed where it has always pointed.
 */
export function startAzimuth(facing: string | undefined): number | undefined {
  if (!facing) return undefined;
  const deg = facingAngleDeg(facing);
  if (deg === undefined) return undefined;
  return (deg + 180) * DEG;
}
