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
 *
 * 2.4 is the DEFAULT the real route actually renders at (rpg-project#132,
 * Kirk's verdict walking the merged wall-height/cutaway build: "the higher
 * walls look nice... we can just pan around" — camera rotation makes tall
 * uniform walls preferable to the old 0.8 knee-wall "game board" look, and
 * cutaway stubs stay OPT-IN only, never a default). The old 0.8 value and
 * the `?wallHeight=`/`?wallCutaway=1` dials this constant still feeds are
 * unchanged — this bump only changes what every caller gets with NO query
 * params at all.
 */
export const WALL_HEIGHT = 2.4;

/**
 * The game Canvas's own fixed camera position offset (HexGrid.tsx's
 * `<Canvas camera={{ position: ... }}>`), single-sourced here so the
 * wall-height cutaway prototype's near/far classification (rpg-project#132,
 * `?wallCutaway=1`) can never silently drift out of sync with the actual
 * camera — classifying a run "camera-facing" against a stale/guessed
 * direction while the real camera moved would misclassify every wall.
 */
export const CAMERA_OFFSET: readonly [number, number, number] = [8, 10, 8];

/**
 * Unit "ward" direction (world XZ only, Y dropped) — points FROM the scene
 * TOWARD the camera, derived from `CAMERA_OFFSET`'s own X/Z components.
 *
 * STILL TRUE FOR THE ROUTE THAT USES IT, and worth writing down because
 * that stopped being obvious (rpg-dnd5e-web#934). The dungeon's authored
 * start facing now seeds `useCameraControls`' azimuth — so on THAT route
 * the camera's bearing is per-dungeon and this constant would not describe
 * it. It does not have to: the cutaway is `WallRunMesh`/`wallRunAdapters`,
 * reached only from `HexGrid`/`EncounterMap` under `?wallCutaway=1`, and
 * that route seeds no azimuth, so its camera keeps the hook's historical
 * 45° — which is exactly the bearing of `CAMERA_OFFSET`'s (8, 8). The
 * session route, which does seed one, draws no cutaway at all.
 *
 * If the cutaway ever reaches a route with a per-dungeon bearing, this
 * has to become a parameter derived from the live azimuth rather than a
 * module-load constant. It is two pure functions and their callers
 * (`wallRunMeshHelpers.ts`), not a redesign — but it is not needed yet,
 * and threading it now would be a parameter nothing varies.
 * The wall-height cutaway prototype dots this against each envelope/
 * connector run's own outward `facing` vector: a positive dot means the
 * run's outward normal points roughly toward the camera (the run sits on
 * the near side of its room, the wall Synty's promo shot hides/stubs so
 * you can see in), a negative dot means it points away (the far wall the
 * promo keeps full height). See WallRunMesh's own doc comment for the
 * classification itself — this file only owns the direction, not the
 * threshold logic.
 */
export const CAMERA_WARD_XZ: Readonly<{ x: number; z: number }> = (() => {
  const [x, , z] = CAMERA_OFFSET;
  const len = Math.hypot(x, z);
  return { x: x / len, z: z / len };
})();

/**
 * Cutaway prototype's stub height (world units) for a camera-facing wall
 * run or door (rpg-project#132, `?wallCutaway=1`) — low enough to read as
 * "hidden so you can see in" while still keeping the room's own boundary
 * legible from this fixed isometric angle, unlike full removal. Shared
 * between WallRunMesh.tsx (envelope/connector runs) and
 * wallRunAdapters.connectorDoorHeights (doors on those same connectors) so
 * a door's frame/leaf always matches whichever height its own connector
 * run was classified to.
 */
export const CUTAWAY_STUB_WALL_HEIGHT = 0.3;

/**
 * Cutaway prototype's TALL height (world units) for an away-facing wall
 * run or door (rpg-project#132, `?wallCutaway=1`) — roughly 3x character
 * height, Kirk's original ask ("try ~2.4 world units"). This is the
 * DEFAULT the tall value falls back to when `?wallCutaway=1` is set with
 * no explicit `?wallHeight=` override — Kirk hit this as a papercut
 * judging the prototype live: `?wallCutaway=1` alone gave ankle-high
 * everything, because the tall value rides the SAME `wallHeight` dial
 * that (with no override at all) falls back to the ordinary
 * `WALL_HEIGHT` (0.8), producing stub=0.3/tall=0.8 — barely
 * distinguishable, nothing like the promo's "sense of size." An explicit
 * `?wallHeight=` still overrides this default when present (the dial
 * composing with cutaway remains the point) — this only fills in the
 * gap for cutaway-with-no-explicit-height.
 */
export const CUTAWAY_TALL_WALL_HEIGHT = 2.4;
