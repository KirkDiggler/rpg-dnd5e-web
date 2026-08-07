/**
 * Pure helpers for `RealWallPieces.tsx` — split out per this codebase's own
 * convention (`wallRunMeshHelpers.ts`/`syntyHexWallHelpers.ts` vs.
 * `WallRunMesh.tsx`/`SyntyHexWall.tsx`: pure geometry stays independent of
 * GLB loading and react-three-fiber so it's directly unit-testable). No
 * Three.js/R3F import here, matching `playCameraRig.ts`'s identical split.
 *
 * Real-wall-assets unit (rpg-project#169): mounts the game's own Synty
 * wall/door GLBs in place of `WallBox`/`DoorGap`'s procedural boxes. Two
 * genuinely new geometry problems this concept's own data model didn't
 * need an answer for while walls were symmetric boxes, both solved here:
 *
 * 1. **Which way should an asymmetric piece face?** (`resolveWallPieceFacing`)
 *    — the same "featureless dark slab" defect `wallRunMeshHelpers.
 *    facingCorrectedRotationY`'s own doc comment describes for the game's
 *    room-envelope runs, but THIS concept has no room-envelope/`facing`
 *    concept of its own (`doc.walls`/`doc.wallLines` are freeform authored
 *    edges/lines, not room sides with a computed outward normal) — so
 *    there's no `EnvelopeRun.facing` to borrow. Derived here instead by
 *    sampling which side of the piece is actually walkable floor.
 * 2. **When should a wall stub down for cutaway?** (`facingCutawayHeight`)
 *    — the game's own `wallRunMeshHelpers.effectiveWallHeight` dots a run's
 *    facing against `calibrationConstants.CAMERA_WARD_XZ`, a FIXED
 *    direction that's only valid because `HexGrid.tsx`'s camera sits at a
 *    fixed isometric offset. This concept's Orbit/Play cameras are free to
 *    move, so cutaway here dots against a LIVE camera-ward vector
 *    (`CameraWardTracker` in `RealWallPieces.tsx` supplies it) instead of a
 *    module constant — same dot-product shape, different (live, not
 *    static) right-hand side.
 */
import {
  coordToKey,
  cubeRound,
  HEX_SIZE,
  worldToCube,
  type WorldPos,
} from '@/components/hex-grid/hexMath';
import type { ConnectorDoc } from '../dungeonYaml';

/** Local-Z ("front") world direction for a Y rotation — the SAME
 * frontX/frontZ convention `wallRunMeshHelpers.facingCorrectedRotationY`
 * derives inline (Three's standard Y-axis rotation applied to local
 * +Z = (0,0,1): `frontX = sin(rotationY)`, `frontZ = cos(rotationY)`),
 * pulled out here since both this file's `resolveWallPieceFacing` and
 * `RealWallPieces.tsx`'s per-piece rendering need the identical vector. */
export function frontDirection(rotationY: number): WorldPos {
  return { x: Math.sin(rotationY), z: Math.cos(rotationY) };
}

// Just past the wall's own thickness (WALL_THICKNESS = 0.12) and safely
// inside whichever neighboring cell the probe lands in — close enough that
// a probe on a genuinely open cell always resolves TO that cell (not some
// third cell further along), far enough that it clears the wall's own
// footprint. 0.55 of a hex radius comfortably satisfies both for every
// wall shape this file places pieces on (single-edge and multi-edge runs
// alike — the probe is always perpendicular to the wall's own length, so
// run length never enters into it).
const FACING_PROBE_DISTANCE = HEX_SIZE * 0.55;

/** Nearest hex cell's key (`floorTiles`/`wallLineFootprint`'s own
 * `${x},${y},${z}` cube-coordinate format — `coordToKey`'s format exactly)
 * for a world XZ point. */
function worldPointCellKey(x: number, z: number): string {
  return coordToKey(cubeRound(worldToCube({ x, z }, HEX_SIZE)));
}

/**
 * Which way should THIS wall/door piece's detailed face point? Probes both
 * perpendicular directions from the piece's own midpoint (`rotationY`'s
 * `frontDirection` and its reverse) against `isOpenCell` — the caller's own
 * "this cell is where a player can actually stand and look at this wall"
 * predicate (edge-native walls: real floor tile membership;
 * `wallLines:` runs: real floor tile membership MINUS the run's own
 * footprint, since a footprint cell has a floor tile but isn't traversable
 * — see `buildWallLineFootprint`'s own doc comment). Returns whichever
 * probe direction resolves to an open cell; if BOTH or NEITHER do
 * (interior wall between two rooms, or a wall authored with no floor tile
 * on either side at all), falls back to the un-corrected front direction —
 * a defensible, deterministic default, same shape as
 * `ConnectorRun.facing`'s own "no provably optimal choice" precedent in
 * `wallRuns.ts` for a wall with no single preferred side.
 *
 * Deliberately world-space, not cell-adjacency — this concept's two wall
 * shapes (edge-native `{from, to}` cell pairs, and corner-anchored
 * `wallLines:` runs with no cell-pair of their own at all) don't share a
 * single "the two adjacent cells" representation, but they DO share a
 * midpoint + rotationY once rendered, so probing world-space geometry
 * (rather than, say, taking `wall.from`/`wall.to` directly) is the one
 * approach that works unmodified for both callers in `RealWallPieces.tsx`.
 */
export function resolveWallPieceFacing(
  midX: number,
  midZ: number,
  rotationY: number,
  isOpenCell: (cellKey: string) => boolean
): WorldPos {
  const front = frontDirection(rotationY);
  const aheadKey = worldPointCellKey(
    midX + front.x * FACING_PROBE_DISTANCE,
    midZ + front.z * FACING_PROBE_DISTANCE
  );
  const behindKey = worldPointCellKey(
    midX - front.x * FACING_PROBE_DISTANCE,
    midZ - front.z * FACING_PROBE_DISTANCE
  );
  const aheadOpen = isOpenCell(aheadKey);
  const behindOpen = isOpenCell(behindKey);
  if (behindOpen && !aheadOpen) return { x: -front.x, z: -front.z };
  return front;
}

/**
 * Cutaway classification for a wall/door piece, keyed off a LIVE
 * camera-ward vector rather than the game's fixed `CAMERA_WARD_XZ` (see
 * this file's own header doc comment for why a fixed direction doesn't
 * apply to a free Orbit/Play camera). `facing` here is
 * `resolveWallPieceFacing`'s own return value — which points TOWARD the
 * walkable/open side (see that function's doc comment), the OPPOSITE
 * convention from the game's `EnvelopeRun.facing` (points AWAY from the
 * room, outward). `wallRunMeshHelpers.effectiveWallHeight`'s own rule is
 * "outward-facing dot camera-ward > 0 => stub" (the wall's outward side
 * faces the camera, so it sits between the camera and the room's
 * interior); substituting `facing = -outward` flips the comparison
 * algebraically to "inward-facing dot camera-ward < 0 => stub" — verified
 * by direct substitution, not a re-derivation from scratch, so this stays
 * the SAME rule the game uses, just applied to this file's own
 * opposite-sign facing vector.
 *
 * `cameraWard: null` (camera-ward not yet measured, or cutaway disabled)
 * always returns `tallHeight` — matches `effectiveWallHeight`'s own "no
 * facing at all defaults tall" fallback.
 */
export function facingCutawayHeight(
  facing: WorldPos,
  cameraWard: WorldPos | null,
  cutawayEnabled: boolean,
  tallHeight: number,
  stubHeight: number
): number {
  if (!cutawayEnabled || !cameraWard) return tallHeight;
  const dot = facing.x * cameraWard.x + facing.z * cameraWard.z;
  return dot < 0 ? stubHeight : tallHeight;
}

/**
 * A server-truth door's locked state, read off `doc.connectors` (the ONLY
 * place `locked:` is authorable today — `WallDoc`/`WallLineDoorDoc` have no
 * `locked` field, see `dungeonYaml.ts`'s own `ConnectorDoc`/`WallLineDoorDoc`
 * doc comments) via the SAME `connectorIndex` `edgesAdapter.ts`'s
 * `connectorIndexForDoorId` already resolves for `onSelectConnector`
 * wiring — no second doorId→connector lookup invented here.
 * `connectorIndex: null` (no server-truth correlation — an authored
 * `doc.walls`/`wallLines` door, or a doorId that doesn't resolve) means
 * "can't know," not "unlocked": returns `false`, the same as a genuinely
 * unlocked door, since this concept's UI has no way to represent "unknown"
 * lock state and an authored door has never been lockable to begin with.
 */
export function resolveDoorLocked(
  connectors: readonly ConnectorDoc[],
  connectorIndex: number | null
): boolean {
  if (connectorIndex === null) return false;
  return connectors[connectorIndex]?.locked != null;
}
