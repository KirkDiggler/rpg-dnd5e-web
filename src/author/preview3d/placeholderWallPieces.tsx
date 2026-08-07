/**
 * placeholderWallPieces — the crude box-per-edge wall/door renderer
 * `DungeonPreview3D.tsx` used exclusively before the real-wall-assets unit
 * (rpg-project#169). Split out (unchanged behavior — a pure move, not a
 * rewrite) so the new real-Synty-piece renderer (`RealWallPieces.tsx`) can
 * import these as its own ErrorBoundary fallback: "when a wall GLB fails to
 * load/missing, fall back to the current WallBox/DoorGap (never crash,
 * never invisible)" — the placeholder tier becomes the explicit fallback
 * tier, not a competing implementation `DungeonPreview3D.tsx` would
 * otherwise have to import from two directions (a real
 * `RealWallPieces.tsx` <-> `DungeonPreview3D.tsx` cycle, since the real
 * renderer needs these as its own fallback).
 *
 * One behavioral widening over the pre-move version: both now accept an
 * optional `wallHeight` (defaulting to `WALL_HEIGHT`, so every pre-existing
 * caller renders byte-identical) — the cutaway unit's stub height applies
 * to a FALLBACK box exactly like it applies to a real GLB piece, so a
 * broken-asset wall reads as "the same wall, cruder," not as a wall that
 * ignores cutaway entirely and stands full-height next to stubbed real
 * neighbors.
 */
import { HEX_SIZE } from '@/components/hex-grid/hexMath';
import { WALL_HEIGHT } from '@/rendering/calibrationConstants';

// Solid vs. door reuses the EXACT colors the 2D board's own target-dialect
// structural overlay already uses for the same distinction
// (Board.tsx/CreationBoard.tsx: '#e8e2d8' solid, '#ffb347' door) — one
// visual language for "this is a drawn wall" across both previews, same
// principle the hole rendering already established.
const WALL_SOLID_COLOR = '#e8e2d8';
const WALL_DOOR_COLOR = '#ffb347';
const WALL_THICKNESS = 0.12;

/** `length` defaults to `HEX_SIZE` — a single edge-native `doc.walls`/
 * server-truth wall piece is always exactly one hex-edge long. A straight
 * `wallLines:` segment (`buildWallLineSegments`) is typically several
 * hexes long and passes its own real `length` instead — same box, same
 * material, genuinely variable length, so the two wall vocabularies read
 * as one architecture rather than two renderers. */
export function WallBox({
  position,
  rotationY,
  length = HEX_SIZE,
  wallHeight = WALL_HEIGHT,
}: {
  position: [number, number, number];
  rotationY: number;
  length?: number;
  wallHeight?: number;
}) {
  return (
    <mesh position={position} rotation={[0, rotationY, 0]}>
      <boxGeometry args={[length, wallHeight, WALL_THICKNESS]} />
      <meshStandardMaterial color={WALL_SOLID_COLOR} />
    </mesh>
  );
}

const DOOR_JAMB_WIDTH = HEX_SIZE * 0.22;
// Wide/tall enough to comfortably catch a click near the opening without
// competing with the floor hit-cell or an adjacent placement's own hit
// area — invisible, `FloorHitCell`'s own "transparent but interactive"
// pattern, not a new one.
const DOOR_CLICK_HIT_THICKNESS = WALL_THICKNESS * 2.5;

/** Local-space X offset (along the wall's OWN length, before rotation)
 * rotated into a world-space `{dx, dz}` pair — Three.js's standard Y-axis
 * rotation matrix (`x' = x·cos θ + z·sin θ`, `z' = -x·sin θ + z·cos θ`,
 * evaluated at local `z = 0`). Used to place the two door jambs
 * symmetrically about the wall's own midpoint without hand-deriving a new
 * rotation per caller. */
function rotateLocalXOffset(
  rotationY: number,
  localX: number
): { dx: number; dz: number } {
  return {
    dx: localX * Math.cos(rotationY),
    dz: -localX * Math.sin(rotationY),
  };
}

/** A genuine gap, not a shortened box — two solid jambs flank an OPEN,
 * walkable span; a thin lintel piece reads as a door frame without
 * blocking the opening below it. `width` defaults to `HEX_SIZE` (an
 * edge-native door's own fixed gap span) — a straight `wallLines:` door's
 * gap (`buildWallLineSegments`) passes its own real interval width
 * instead, since a corner-anchored line's clip interval through its door
 * cell isn't necessarily a full hex width. Jamb width is clamped to
 * `width / 2` so a genuinely narrow gap (a shallow clip near a cell's
 * edge) still produces two jambs meeting in the middle rather than
 * overlapping/inverting; the opening (and its lintel) shrinks to fill
 * whatever's left, never negative. */
export function DoorGap({
  position,
  rotationY,
  width = HEX_SIZE,
  wallHeight = WALL_HEIGHT,
  onSelectDoor,
}: {
  position: [number, number, number];
  rotationY: number;
  width?: number;
  wallHeight?: number;
  onSelectDoor?: () => void;
}) {
  const doorOpeningHeight = wallHeight * 0.8;
  const doorLintelHeight = wallHeight - doorOpeningHeight;
  const jambWidth = Math.min(DOOR_JAMB_WIDTH, width / 2);
  const openingWidth = Math.max(width - jambWidth * 2, 0);
  const jambOffset = width / 2 - jambWidth / 2;
  const left = rotateLocalXOffset(rotationY, jambOffset);
  const right = rotateLocalXOffset(rotationY, -jambOffset);
  return (
    <group>
      <mesh
        position={[position[0] + left.dx, position[1], position[2] + left.dz]}
        rotation={[0, rotationY, 0]}
      >
        <boxGeometry args={[jambWidth, wallHeight, WALL_THICKNESS]} />
        <meshStandardMaterial color={WALL_DOOR_COLOR} />
      </mesh>
      <mesh
        position={[position[0] + right.dx, position[1], position[2] + right.dz]}
        rotation={[0, rotationY, 0]}
      >
        <boxGeometry args={[jambWidth, wallHeight, WALL_THICKNESS]} />
        <meshStandardMaterial color={WALL_DOOR_COLOR} />
      </mesh>
      {openingWidth > 0 && (
        <mesh
          position={[
            position[0],
            doorOpeningHeight + doorLintelHeight / 2,
            position[2],
          ]}
          rotation={[0, rotationY, 0]}
        >
          <boxGeometry
            args={[openingWidth, doorLintelHeight, WALL_THICKNESS]}
          />
          <meshStandardMaterial color={WALL_DOOR_COLOR} />
        </mesh>
      )}
      {onSelectDoor && (
        <mesh
          position={position}
          rotation={[0, rotationY, 0]}
          onClick={(e) => {
            e.stopPropagation();
            onSelectDoor();
          }}
        >
          <boxGeometry args={[width, wallHeight, DOOR_CLICK_HIT_THICKNESS]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
