/**
 * wallRuns — W1 of the dungeon-walls redesign (rpg-project#133 design.md /
 * plan.md's W1 slice): derives straight envelope/connector wall RUNS in
 * world coordinates from a room's actual hex membership, replacing the
 * per-cell zig-zag boundary-wall rendering this design supersedes (W2
 * wires these runs into the renderer; this module is pure geometry).
 *
 * Pure and protocol-agnostic on purpose — takes plain CubeCoord data, not
 * the wire `Wall`/`Hex`/`Zone` proto shapes, so it's unit-testable without
 * touching @bufbuild/protobuf and reusable if a caller's region/door data
 * ever comes from somewhere other than the encounter stream. W2 is
 * responsible for building `RegionInput[]`/`ConnectorDoorInput[]` from the
 * real wire shapes: group `Space.hexes` by `zoneId` for regions, and read
 * `Kind = DOOR_*` `Wall.from`/`Wall.id` entries for doors.
 *
 * Wire-data facts this module encodes (rpg-toolkit#848 findings comment,
 * cross-checked against rpg-api's real
 * TestStartEncounter_ContentBackedKey_ReferenceTomb ground truth — the
 * live-authored reference-tomb dungeon, not a hand-derived guess — see
 * this file's own tests):
 *
 * - A room's hex set has no width/offset field on the wire at all — the
 *   bounding rect must be derived from the actual hex membership (min/max
 *   over the region's own Hexes), never assumed from Space dimensions.
 * - Regions sit side by side along the CUBE X axis (the toolkit's
 *   "column" is exactly cube x — `col := x`, tools/spatial/position.go),
 *   separated by a reserved one-column gap that belongs to no region:
 *   the connector.
 * - The toolkit's ROW axis is NOT the cube Z coordinate directly — it's
 *   parity-corrected per column (`row := z + (x - (x&1))/2`, the inverse
 *   of `z := row - (col - (col&1))/2`). Two hexes in the "same row" at
 *   different columns generally have different z. Grouping hexes by row
 *   (needed for the top/bottom envelope sides and for locating a door
 *   within a connector's row range) MUST use this formula — never assume
 *   row===z or same-row column-adjacency. That's the exact trap
 *   rpg-toolkit#848's findings flagged, and the reason real hex-neighbor
 *   math (not hand-rolled row/col stepping) governs every adjacency
 *   decision this codebase makes elsewhere.
 * - A door's own cell sits ON the connector column (its cube x IS the
 *   connector's column) — confirmed directly against the toolkit
 *   generator (`doorX := starts[i] + r.Width`, door position
 *   `{doorX, doorRow}`). No adjacency walk is needed to find which column
 *   a door's connector sits on, and no reliance on wire ORDER of
 *   Zones/Doors either — doors are sorted by id for deterministic wire
 *   output, not by position, so which two regions a door joins is found
 *   purely geometrically (see connectorRegionsForDoor).
 * - A region's hex membership (`RegionInput.hexes`) is the per-viewer
 *   REVEALED subset, not the true room (rpg-api projects `Space.hexes`
 *   from `snap.RevealedHexes`, sight-range-gated per player — unlike the
 *   `Walls` list, which is whole-room and unconditional from wave 1).
 *   ACCEPTED v1 consequence (gate review finding 2, rpg-dnd5e-web#603):
 *   under partial reveal, an envelope run is drawn around the currently-
 *   revealed blob, not the room's final extent — it tracks the reveal
 *   frontier and moves outward as exploration proceeds, rather than
 *   snapping straight to the room's true boundary. This is a fog-of-war
 *   visual, not a bug, and it's why `connectorRunForDoor`'s row range
 *   (`coveredRows`) is documented as a lower bound, never the connector's
 *   true extent — see that field's own doc for the structural guarantee
 *   this constrains callers to (wallRunAdapters.legacyRenderWalls' safety
 *   net).
 */

import {
  cubeToWorld,
  HEX_SIZE,
  type CubeCoord,
  type WorldPos,
} from '@/components/hex-grid/hexMath';

/** One region's stable id and the set of hex cells the wire currently
 * reports as belonging to it (Space.hexes filtered by zoneId === region
 * id) — exactly `RegionData.Hexes` reconstructed client-side, since the
 * wire never sends a region's width/height/offset directly. */
export interface RegionInput {
  id: string;
  hexes: CubeCoord[];
}

/** One connector door's own cell — the `from` position of a
 * `Kind = DOOR_*` wall entry. Only the position matters to this module;
 * open/locked visual state is a rendering concern, not a run-computation
 * one. */
export interface ConnectorDoorInput {
  /** Wall.id, when present — carried through onto the resulting
   * ConnectorRun so callers can key a door frame back to its click
   * surface without a second lookup. */
  id?: string;
  position: CubeCoord;
}

/**
 * Logical side labels keyed off column/row extremity (minCol/maxCol ->
 * left/right, minRow/maxRow -> top/bottom) — NOT screen-space directions.
 * A fixed column, read row by row, traces a straight line along one of
 * the hex grid's six principal directions in world space (verified: it's
 * always the same direction, since every same-column row step is the
 * identical cube delta), but that direction is generally diagonal, not
 * screen-vertical. Callers that need actual screen orientation should
 * derive it from the run's own `start`/`end` world coordinates, not from
 * this label.
 */
export type EnvelopeSide = 'left' | 'right' | 'top' | 'bottom';

export interface WallRunSegment {
  start: WorldPos;
  end: WorldPos;
}

/** One straight wall run along a single side of a room's outer envelope. */
export interface EnvelopeRun extends WallRunSegment {
  regionId: string;
  side: EnvelopeSide;
}

/** One connector's wall run(s), split around its door gap. A connector
 * whose door sits strictly between its two row-range ends produces two
 * segments (above and below the door); one flush against a row-range end
 * produces one. Never zero for a real dungeon connector (height >= 4 and
 * doorRow strictly interior is a toolkit-enforced invariant), but the
 * shape stays a plain array rather than a fixed tuple so a degenerate
 * caller-supplied fixture doesn't need to lie about it. */
export interface ConnectorRun {
  doorId?: string;
  regionAId: string;
  regionBId: string;
  segments: WallRunSegment[];
  /**
   * The row range (inclusive) these segments were derived to cover — the
   * union of both paired regions' CURRENTLY KNOWN row bounds at
   * computation time (see connectorRunForDoor's doc for why union, not
   * intersection). Region hex membership is per-viewer reveal-gated
   * (rpg-api's `Space.hexes` is built from sight-range-gated
   * `RevealedHexes`, not the true room), so this range can be a strict
   * subset of the connector's true row extent under partial reveal —
   * gate review finding 1 (rpg-dnd5e-web#603). A connector-flanking wall
   * entry whose own row falls OUTSIDE `[minRow, maxRow]` is NOT covered
   * by these segments even though a ConnectorRun exists for its column:
   * callers needing the invisible-wall guarantee to hold by construction
   * (wallRunAdapters.legacyRenderWalls' structural safety net) must check
   * per-cell against this range, never assume "a run exists" implies
   * "every flanking cell at this column is covered."
   */
  coveredRows: { minRow: number; maxRow: number };
}

export interface WallRunsInput {
  regions: RegionInput[];
  doors: ConnectorDoorInput[];
  /** Hex radius, world units — defaults to the game's standard HEX_SIZE so
   * every real caller matches every other renderer without having to pass
   * it explicitly. */
  hexSize?: number;
  /** Outward offset (world units) applied to envelope runs beyond the
   * boundary hexes' own centers — the clip-clearance dial the design
   * doc's W4 slice tunes against the largest character mesh. Defaults to
   * `sqrt(3)` hex radii (see DEFAULT_ENVELOPE_OFFSET_HEXES's doc — this is
   * what actually clears the outermost floor tiles' own footprint, not
   * just their centers), a reasonable starting placeholder for W2/W3's
   * geometry, not a final art-directed value. */
  envelopeOffset?: number;
  /** How far a run's endpoints extend past the outermost boundary hex's
   * own center, along the run's direction — reaches toward the hex's true
   * outer face/corner instead of stopping dead-center on the last hex.
   * Defaults to half a hex radius. */
  cornerExtension?: number;
}

export interface WallRunsResult {
  envelopeRuns: EnvelopeRun[];
  connectorRuns: ConnectorRun[];
}

/**
 * The toolkit's "column" is exactly the cube X coordinate (rpg-toolkit
 * tools/spatial/position.go's `col := x` — verified against real compiled
 * reference-tomb data, see this file's tests). No conversion needed.
 * Exported for callers building region/door input from real hex data.
 */
export function hexColumn(hex: CubeCoord): number {
  return hex.x;
}

/**
 * The toolkit's "row" is NOT cube Z — it's parity-corrected per column
 * (rpg-toolkit tools/spatial/position.go's
 * `ToOffsetCoordinateWithOrientation`, pointy-top/odd-q branch:
 * `row := z + (x - (x&1))/2`). Two hexes at the same z but different x
 * columns are generally NOT in the same row; two hexes in the same row
 * but different columns generally do NOT share z. `Math.trunc` (not
 * `Math.floor`) matches Go's truncating integer division exactly — only
 * matters for negative x, which dungeon-generator coordinates never
 * produce (columns start at 0 and only increase), kept for correctness
 * rather than because real data exercises it.
 */
export function hexRow(hex: CubeCoord): number {
  return hex.z + Math.trunc((hex.x - (hex.x & 1)) / 2);
}

/**
 * Inverse of hexColumn/hexRow: the cube coordinate at a given
 * (column, row) — mirrors tools/spatial/position.go's
 * `OffsetCoordinateToCubeWithOrientation` pointy-top branch exactly
 * (`x := col; z := row - (col - (col&1))/2; y := -x-z`). Used to find the
 * cube coordinate of a room's geometric corners/row-boundaries even when
 * no actual hex was ever revealed exactly there — the corner is a
 * geometric anchor derived from the region's own bounding rect, not a
 * membership check.
 */
export function cubeAtColRow(col: number, row: number): CubeCoord {
  const x = col;
  const z = row - Math.trunc((col - (col & 1)) / 2);
  const y = -x - z;
  return { x, y, z };
}

interface Bounds {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
}

function boundsOf(hexes: CubeCoord[]): Bounds | undefined {
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

function distance(a: WorldPos, b: WorldPos): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/** Unit direction from a to b; {0,0} for coincident points (a degenerate
 * single-hex-tall/wide region) — callers get a zero-length extension,
 * never NaN. */
function unitDirection(a: WorldPos, b: WorldPos): WorldPos {
  const len = distance(a, b);
  if (len === 0) return { x: 0, z: 0 };
  return { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
}

/** One of the two perpendiculars to `dir`, whichever points away from
 * `center` at the run's midpoint `mid` — "outward" for an envelope side. */
function outwardNormal(
  dir: WorldPos,
  center: WorldPos,
  mid: WorldPos
): WorldPos {
  const perp: WorldPos = { x: -dir.z, z: dir.x };
  const toMid: WorldPos = { x: mid.x - center.x, z: mid.z - center.z };
  const dot = perp.x * toMid.x + perp.z * toMid.z;
  return dot >= 0 ? perp : { x: -perp.x, z: -perp.z };
}

/** Extend + offset a raw corner-to-corner line into its final envelope
 * run: push both ends outward along the run's own direction by
 * `cornerExtension` (reach toward the true corner, not the last hex's
 * center), then translate the whole segment along the outward normal by
 * `envelopeOffset` (the clip-clearance dial). */
function buildEnvelopeSegment(
  rawStart: WorldPos,
  rawEnd: WorldPos,
  roomCenter: WorldPos,
  cornerExtension: number,
  envelopeOffset: number
): WallRunSegment {
  const dir = unitDirection(rawStart, rawEnd);
  const extendedStart: WorldPos = {
    x: rawStart.x - dir.x * cornerExtension,
    z: rawStart.z - dir.z * cornerExtension,
  };
  const extendedEnd: WorldPos = {
    x: rawEnd.x + dir.x * cornerExtension,
    z: rawEnd.z + dir.z * cornerExtension,
  };
  const mid: WorldPos = {
    x: (extendedStart.x + extendedEnd.x) / 2,
    z: (extendedStart.z + extendedEnd.z) / 2,
  };
  const normal = outwardNormal(dir, roomCenter, mid);
  const offset: WorldPos = {
    x: normal.x * envelopeOffset,
    z: normal.z * envelopeOffset,
  };
  return {
    start: { x: extendedStart.x + offset.x, z: extendedStart.z + offset.z },
    end: { x: extendedEnd.x + offset.x, z: extendedEnd.z + offset.z },
  };
}

/**
 * Gate review finding 3 (rpg-dnd5e-web#603): under odd-q + pointy-top, a
 * constant-row line is a staircase in world space, so the straight chord
 * this module draws across it consumes 0.69-0.87 of whatever offset is
 * configured (measured against the reference-tomb-shaped fixture's
 * entrance/hall/tomb widths and the boss-room fixture). At the previous
 * default (one hex radius), worst-case clearance from the outermost
 * floor hex CENTERS to the top/bottom run was negative (-0.13 to -0.31) —
 * the envelope still enclosed every hex center, but up to ~0.73 world
 * units of the outermost floor tiles' own footprint sat outside the wall
 * line, since a hex extends ~0.866 from its center to its flat side.
 * `sqrt(3)` (~1.73) is what actually clears the tile footprint on the
 * top/bottom sides. Still a placeholder for W2/W3's placeholder-box
 * geometry, not final art direction — W4's clip-check slice (design.md)
 * is where this gets tuned against the largest real character/monster
 * mesh and locked for good.
 */
const DEFAULT_ENVELOPE_OFFSET_HEXES = Math.sqrt(3);
const DEFAULT_CORNER_EXTENSION_HEXES = 0.5;

/**
 * The four envelope runs (left/right/top/bottom) for one region. Derived
 * purely from the region's own hex-membership bounding rect — never from
 * wall/blocking data — so a boss-archetype region's deliberately
 * full-width-open doorRow (rpg-toolkit#819's tactical invariant) can never
 * punch a gap in these: this function has no notion of "openness" at all,
 * only the rectangle's four corners.
 */
function envelopeRunsForRegion(
  region: RegionInput,
  hexSize: number,
  envelopeOffset: number,
  cornerExtension: number
): EnvelopeRun[] {
  const bounds = boundsOf(region.hexes);
  if (!bounds) return [];
  const { minCol, maxCol, minRow, maxRow } = bounds;

  const cornerWorld = (col: number, row: number): WorldPos =>
    cubeToWorld(cubeAtColRow(col, row), hexSize);

  const topLeft = cornerWorld(minCol, minRow);
  const topRight = cornerWorld(maxCol, minRow);
  const bottomLeft = cornerWorld(minCol, maxRow);
  const bottomRight = cornerWorld(maxCol, maxRow);

  const center: WorldPos = {
    x: (topLeft.x + topRight.x + bottomLeft.x + bottomRight.x) / 4,
    z: (topLeft.z + topRight.z + bottomLeft.z + bottomRight.z) / 4,
  };

  const sides: Array<{ side: EnvelopeSide; a: WorldPos; b: WorldPos }> = [
    { side: 'left', a: topLeft, b: bottomLeft },
    { side: 'right', a: topRight, b: bottomRight },
    { side: 'top', a: topLeft, b: topRight },
    { side: 'bottom', a: bottomLeft, b: bottomRight },
  ];

  return sides.map(({ side, a, b }) => ({
    regionId: region.id,
    side,
    ...buildEnvelopeSegment(a, b, center, cornerExtension, envelopeOffset),
  }));
}

/**
 * Find the two regions a door's connector column sits between — purely
 * geometric (the door's own column vs. each region's own min/max column),
 * with zero dependence on wire ordering of Zones/Doors (rpg-toolkit#848
 * findings: doors are sorted by id for deterministic wire output, NOT by
 * position — never assume declaration/array order reflects physical
 * adjacency). Returns undefined if no such pair exists (a door with no
 * region revealed on one or both sides — malformed data, a non-dungeon
 * encounter's stray door, or simply too early in exploration — is
 * skipped by the caller rather than crashing).
 *
 * NEAREST region on each side, not exact `doorCol±1` adjacency (gate
 * review finding 1, rpg-dnd5e-web#603): a region's hex membership is the
 * per-viewer REVEALED subset, not the true room (rpg-api's `Space.hexes`
 * is sight-range-gated `RevealedHexes`, never the whole room at once) —
 * so the column immediately beside the connector can easily be
 * unexplored while columns further into the same region already are.
 * Requiring exact adjacency dropped the connector (and, since
 * `legacyRenderWalls` already excludes every connector wall entry on the
 * promise a run covers it, rendered nothing at all) for the entire
 * span of exploration between "door revealed" and "the near column
 * specifically revealed." Taking the CLOSEST region whose bounds lie
 * entirely on each side (`maxCol < doorCol` / `minCol > doorCol`) instead
 * needs only SOME of that region revealed, at any column — correct
 * even with multiple regions further down the chain (a 3+ room dungeon
 * has other regions whose columns also satisfy `> doorCol` on the far
 * side; picking the smallest such `minCol` is exactly "nearest," so it's
 * never confused with a region two connectors away).
 */
function connectorRegionsForDoor(
  door: ConnectorDoorInput,
  regionBounds: Map<string, Bounds>
): { regionAId: string; regionBId: string } | undefined {
  const doorCol = hexColumn(door.position);
  let regionAId: string | undefined;
  let regionAMaxCol = -Infinity;
  let regionBId: string | undefined;
  let regionBMinCol = Infinity;
  for (const [id, bounds] of regionBounds) {
    if (bounds.maxCol < doorCol && bounds.maxCol > regionAMaxCol) {
      regionAId = id;
      regionAMaxCol = bounds.maxCol;
    }
    if (bounds.minCol > doorCol && bounds.minCol < regionBMinCol) {
      regionBId = id;
      regionBMinCol = bounds.minCol;
    }
  }
  if (!regionAId || !regionBId) return undefined;
  return { regionAId, regionBId };
}

/**
 * `coveredRows` is the UNION of both paired regions' currently-known row
 * bounds, not the intersection (gate review finding 4, rpg-dnd5e-web#603):
 * real dungeons share one `Height` across every region in the chain
 * (`DungeonParams.Height`), so under full reveal both sides agree on the
 * true row extent regardless of which is taken — the choice only matters
 * under PARTIAL reveal, where union tracks whichever side has explored
 * further (matching the envelope's own frontier-tracking behavior,
 * accepted v1 fog per design), while intersection would shrink the run
 * below what's already confirmed safe on the more-explored side. A
 * hypothetical caller with genuinely mismatched-height neighbors would
 * see the run extend past the shorter region into empty space — latent
 * today since this module has no such caller, but real given the
 * type's own protocol-agnostic, reusable framing.
 */
function connectorRunForDoor(
  door: ConnectorDoorInput,
  regionAId: string,
  regionBId: string,
  regionBounds: Map<string, Bounds>,
  hexSize: number,
  cornerExtension: number
): ConnectorRun {
  const boundsA = regionBounds.get(regionAId)!;
  const boundsB = regionBounds.get(regionBId)!;
  const minRow = Math.min(boundsA.minRow, boundsB.minRow);
  const maxRow = Math.max(boundsA.maxRow, boundsB.maxRow);
  const col = hexColumn(door.position);
  const doorRow = hexRow(door.position);

  const worldAt = (row: number): WorldPos =>
    cubeToWorld(cubeAtColRow(col, row), hexSize);

  const segments: WallRunSegment[] = [];

  if (doorRow > minRow) {
    const rawStart = worldAt(minRow);
    const rawEnd = worldAt(doorRow - 1);
    const dir = unitDirection(rawStart, rawEnd);
    segments.push({
      start: {
        x: rawStart.x - dir.x * cornerExtension,
        z: rawStart.z - dir.z * cornerExtension,
      },
      end: rawEnd,
    });
  }
  if (doorRow < maxRow) {
    const rawStart = worldAt(doorRow + 1);
    const rawEnd = worldAt(maxRow);
    const dir = unitDirection(rawStart, rawEnd);
    segments.push({
      start: rawStart,
      end: {
        x: rawEnd.x + dir.x * cornerExtension,
        z: rawEnd.z + dir.z * cornerExtension,
      },
    });
  }

  return {
    doorId: door.id,
    regionAId,
    regionBId,
    segments,
    coveredRows: { minRow, maxRow },
  };
}

/**
 * Compute every envelope run (one per side per region) and connector run
 * (one per door, split around its door gap) for the current set of known
 * regions/doors. Pure: the same input always produces the same output, no
 * randomness, no wire types.
 */
export function computeWallRuns(input: WallRunsInput): WallRunsResult {
  const hexSize = input.hexSize ?? HEX_SIZE;
  const envelopeOffset =
    input.envelopeOffset ?? DEFAULT_ENVELOPE_OFFSET_HEXES * hexSize;
  const cornerExtension =
    input.cornerExtension ?? DEFAULT_CORNER_EXTENSION_HEXES * hexSize;

  const envelopeRuns: EnvelopeRun[] = [];
  const regionBounds = new Map<string, Bounds>();
  for (const region of input.regions) {
    envelopeRuns.push(
      ...envelopeRunsForRegion(region, hexSize, envelopeOffset, cornerExtension)
    );
    const bounds = boundsOf(region.hexes);
    if (bounds) regionBounds.set(region.id, bounds);
  }

  const connectorRuns: ConnectorRun[] = [];
  for (const door of input.doors) {
    const pair = connectorRegionsForDoor(door, regionBounds);
    if (!pair) continue;
    connectorRuns.push(
      connectorRunForDoor(
        door,
        pair.regionAId,
        pair.regionBId,
        regionBounds,
        hexSize,
        cornerExtension
      )
    );
  }

  return { envelopeRuns, connectorRuns };
}
