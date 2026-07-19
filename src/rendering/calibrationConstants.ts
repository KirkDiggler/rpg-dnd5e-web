/**
 * Shared rendering calibration constants for the hex-grid game routes and
 * the Synty asset-integration surfaces (SyntyShowcase, SyntyRoomDemo). Both
 * families of renderer place geometry against the SAME hex grid and the
 * SAME wall height, so they must agree on these values rather than each
 * re-declaring its own copy.
 *
 * Promoted here per rpg-dnd5e-web#432's harness-parity gate (PR #470's
 * review already flagged this: "SYNTY_SCALE + the duplicated HEX_SIZE live
 * private to the showcase — when assets move to game routes, promote the
 * scale contract to a shared exported home — it becomes THE calibration
 * constant"). That trigger point is now: EncounterMap/HexGrid consuming
 * Synty pieces directly is the next slice in this wave.
 */

/**
 * Uniform scale for placed Synty assets. Synty's POLYGON packs are authored
 * in real-world meters; the game's existing OBJ characters stand ~1.5 world
 * units tall on HEX_SIZE=1 hexes. 0.75 lands Synty's ~1.84m goblin at ~1.38
 * units — verified against the game's characters and hex tile in the
 * harness's `&synty=1` showcase (rpg-dnd5e-web#469/#470). Recommended as
 * the standard for every Synty placement, not just characters.
 */
export const SYNTY_SCALE = 0.75;

/**
 * Wall height in world-space units for the game's procedural voxel walls
 * (WallBuilder / ShadedHexWall) and, since rpg-dnd5e-web#472's Synty room
 * demo, for calibrating Synty wall/door pieces to match — was independently
 * re-declared as `const WALL_HEIGHT = 0.8` in ShadedHexWall.tsx,
 * HexWall.tsx, and SyntyRoomDemo.tsx.
 */
export const WALL_HEIGHT = 0.8;
