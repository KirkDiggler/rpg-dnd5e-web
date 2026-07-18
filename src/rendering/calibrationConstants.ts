/**
 * Shared rendering calibration constants for the hex-grid game routes and
 * the Synty asset-integration surfaces. Both families of renderer place
 * geometry against the SAME hex grid and the SAME wall height, so they must
 * agree on these values rather than each re-declaring its own copy.
 *
 * Promoted here per rpg-dnd5e-web#432's harness-parity gate (also landing
 * independently as PR #476's constants-promotion slice — that PR branched
 * off origin/main separately per the wave's branching model, so this slice
 * re-adds the same file rather than depending on #476 merging first;
 * whichever lands second will need a trivial rebase).
 */

/**
 * Uniform scale for placed Synty assets. Synty's POLYGON packs are authored
 * in real-world meters; the game's existing OBJ characters stand ~1.5 world
 * units tall on HEX_SIZE=1 hexes. 0.75 lands Synty's ~1.84m goblin at ~1.38
 * units — verified against the game's characters and hex tile in the
 * harness's `&synty=1` showcase (rpg-dnd5e-web#469/#470).
 */
export const SYNTY_SCALE = 0.75;

/**
 * Wall height in world-space units for the game's procedural voxel walls
 * (WallBuilder / ShadedHexWall) and, since rpg-dnd5e-web#472's Synty room
 * demo, for calibrating Synty wall/door pieces to match.
 */
export const WALL_HEIGHT = 0.8;
