import { facingToYaw } from '@/components/hex-grid/facingYaw';
import type { RoomStartingCell } from './roomDraft';

/**
 * The Y rotation a studio creature marker's model is mounted at: the
 * creature's authored starting `facing` composed with the asset's own
 * forward-axis correction.
 *
 * ONE FUNCTION FOR THE WORD, the same one the game uses. `facingToYaw` is the
 * single place a compass word becomes an angle (`facingYaw.ts`), and for a
 * +Z-forward rig it lands on exactly the heading the game's character facing
 * produces for that direction (`facing.ts`'s `headingFromDelta`, which every
 * measured creature rig family satisfies). So a creature authored facing `e`
 * stands the way the game turns a creature that walks east.
 *
 * Absent facing is the asset's own orientation, not a missing answer
 * (`RoomStartingCell.facing`'s doc comment): `facingToYaw('')` is 0, so only
 * the forward offset applies, exactly the marker's pre-facing rendering.
 */
export function roomMonsterMarkerYaw(
  startingCell: RoomStartingCell,
  forwardOffset: number = 0
): number {
  return facingToYaw(startingCell.facing ?? '') + forwardOffset;
}
