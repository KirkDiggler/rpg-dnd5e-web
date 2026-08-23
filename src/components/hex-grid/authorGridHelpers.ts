/**
 * authorGridHelpers — pure geometry for the author-grid overlay
 * (`?authorGrid=1`): the room-local [col,row] hex labels + facing legend
 * Kirk uses to walk a room and dictate dungeon-content YAML `place:`
 * coordinates directly, instead of hand-deriving them from world hexes.
 * Protocol-agnostic and unit-testable, same split as
 * wallRuns.ts/wallRunAdapters.ts — this file only knows
 * `RegionInput`/`ConnectorDoorInput` (already reconstructed from the wire
 * by EncounterMap.tsx for wall-run computation), never the proto shapes
 * directly.
 *
 * Local [col,row] must match dungeonspec's own `LocalHex{Col,Row}`
 * EXACTLY (rpg-toolkit encounter/dungeonspec/compile.go:
 * `LocalHex{Col: at[0], Row: at[1]}`) — col is wallRuns.ts's `hexColumn`
 * (cube x) minus the region's own `minCol`; row is `hexRow` (parity-
 * corrected: `z + (x - (x&1))/2`) minus `minRow`. Reuses wallRuns.ts's
 * already-exported `hexColumn`/`hexRow`/`cubeAtColRow` rather than
 * re-deriving them; duplicates only the small min/max bounds scan
 * (wallRuns.ts's own `boundsOf` is private to that module and its doc
 * comments are all wall-run-specific — cheaper and lower-risk to keep a
 * small local copy here than to widen that heavily-documented module's
 * public surface for an unrelated caller).
 */

import {
  cubeAtColRow,
  hexColumn,
  hexRow,
  type ConnectorDoorInput,
  type RegionInput,
} from '@/hooks/wallRuns';
import {
  cubeToWorld,
  HEX_DIRECTIONS,
  type CubeCoord,
  type WorldPos,
} from './hexMath';

export interface RegionBounds {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
}

/** Mirrors wallRuns.ts's private `boundsOf` — see this file's own doc
 * comment for why this is a small intentional duplication rather than an
 * import. Exported for testing. */
export function regionBounds(
  hexes: readonly CubeCoord[]
): RegionBounds | undefined {
  if (hexes.length === 0) return undefined;
  let minCol = Infinity;
  let maxCol = -Infinity;
  let minRow = Infinity;
  let maxRow = -Infinity;
  for (const hex of hexes) {
    const col = hexColumn(hex);
    const row = hexRow(hex);
    if (col < minCol) minCol = col;
    if (col > maxCol) maxCol = col;
    if (row < minRow) minRow = row;
    if (row > maxRow) maxRow = row;
  }
  return { minCol, maxCol, minRow, maxRow };
}

/**
 * Row indices (region-local) that a connector door sits opposite, within
 * one region's own bounds — "opposite" because a door cell never belongs
 * to either region's own hex set (`regionInputsFromHexes` excludes
 * connector cells by construction), so a door can only ever border a
 * region from its immediately adjacent connector column. Mirrors the same
 * `col === bounds.minCol - 1` / `col === bounds.maxCol + 1` adjacency
 * check wallRuns.ts's own connector-siding logic already uses. Returned
 * as a Set since a wide connector can in principle carry more than one
 * door cell (stacked doors are not a real content pattern today, but nothing
 * here assumes there's exactly one).
 */
export function doorRowsForRegion(
  bounds: RegionBounds,
  doors: readonly ConnectorDoorInput[]
): Set<number> {
  const rows = new Set<number>();
  for (const door of doors) {
    const col = hexColumn(door.position);
    if (col !== bounds.minCol - 1 && col !== bounds.maxCol + 1) continue;
    rows.add(hexRow(door.position) - bounds.minRow);
  }
  return rows;
}

export interface AuthorGridLabel {
  /** Stable React key — "regionId:col,row". */
  key: string;
  world: WorldPos;
  localCol: number;
  localRow: number;
  /** True when this label's row is opposite a connector door — Kirk's
   * "unplaceable" row (doorway threshold), rendered dimmer/subtler than a
   * normal label rather than hidden, so the room's row count still reads
   * correctly at a glance. */
  isDoorRow: boolean;
}

export interface AuthorGridRoom {
  regionId: string;
  labels: AuthorGridLabel[];
  /** World position for the room-id corner label — the region's own
   * (minCol, minRow) corner, i.e. [0,0] in the room's own local space. */
  labelWorld: WorldPos;
}

/** One region's full label set, or undefined for an empty region (no
 * revealed hexes yet — shouldn't happen for a region the wire actually
 * sent, but `regionBounds` is defensive, so this stays defensive too). */
export function authorGridRoom(
  region: RegionInput,
  doors: readonly ConnectorDoorInput[],
  hexSize: number
): AuthorGridRoom | undefined {
  const bounds = regionBounds(region.hexes);
  if (!bounds) return undefined;
  const doorRows = doorRowsForRegion(bounds, doors);
  const labels: AuthorGridLabel[] = region.hexes.map((hex) => {
    const localCol = hexColumn(hex) - bounds.minCol;
    const localRow = hexRow(hex) - bounds.minRow;
    return {
      key: `${region.id}:${localCol},${localRow}`,
      world: cubeToWorld(hex, hexSize),
      localCol,
      localRow,
      isDoorRow: doorRows.has(localRow),
    };
  });
  const labelWorld = cubeToWorld(
    cubeAtColRow(bounds.minCol, bounds.minRow),
    hexSize
  );
  return { regionId: region.id, labels, labelWorld };
}

/** Every currently-revealed region's label set, skipping any region with
 * no hexes yet (see `authorGridRoom`). */
export function authorGridRooms(
  regions: readonly RegionInput[],
  doors: readonly ConnectorDoorInput[],
  hexSize: number
): AuthorGridRoom[] {
  const rooms: AuthorGridRoom[] = [];
  for (const region of regions) {
    const room = authorGridRoom(region, doors, hexSize);
    if (room) rooms.push(room);
  }
  return rooms;
}

/**
 * Facing legend: numbers hexMath.ts's existing `HEX_DIRECTIONS` order
 * 0-5 rather than inventing a new one — that array is already the
 * canonical hex-neighbor order shared with the toolkit
 * (rpg-toolkit tools/spatial/position.go's own `GetNeighbors` direction
 * slice: the identical E, NE, NW, W, SW, SE clockwise-from-east
 * sequence). Facing does nothing mechanically yet — Kirk dictates
 * "facing 3" during a room walk and it's captured as a YAML comment
 * until a real rotation field lands on `place:` entries.
 *
 * Checked rpg-api-protos, rpg-toolkit, and rpg-api for an existing
 * facing enum before defining this one: none found as of this writing
 * (`grep -rniE "facing"` across all three turns up only unrelated
 * "user-facing" / "room-facing edge" prose, never a direction enum). If
 * the in-flight fog-of-war/facing work defines one first, THIS numbering
 * is what needs to reconcile with theirs, not the other way around —
 * noted here so whoever picks that up finds the reconciliation note
 * without archaeology.
 */
export const HEX_FACING_LABELS = ['E', 'NE', 'NW', 'W', 'SW', 'SE'] as const;

export function facingDirection(index: number): CubeCoord {
  return HEX_DIRECTIONS[((index % 6) + 6) % 6]!;
}

/**
 * The Y rotation that points a model's local +X at the neighbor in
 * `facing`'s direction — the Kirk-approved reference mapping for a wire
 * `facing` (0..5, E first, counter-clockwise — `HEX_FACING_LABELS`).
 * Scale-invariant, so `cubeToWorld` is evaluated at size 1. Lived in the
 * old dungeon builder's `boardGeometry.ts`; moved here when that dialect
 * was deleted (rpg-project#256) because the GAME's prop renderer is the
 * consumer that survived.
 */
export function facingToRotationY(facing: number): number {
  const dir = facingDirection(facing);
  const world = cubeToWorld(dir, 1);
  return Math.atan2(-world.z, world.x);
}
