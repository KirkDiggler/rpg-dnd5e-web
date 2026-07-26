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
  /**
   * Unit vector (world x/z) pointing OUTWARD from the room, away from its
   * center — the same direction `buildEnvelopeSegment` already offsets
   * this run's own line along. Round-2 W3/W4 finding (Kirk's live walk:
   * "west wall is a featureless dark slab while the north wall shows
   * brick tile detail"): a tiled wall piece's detailed face is authored
   * on only ONE local-Z side, with a flat/undecorated back — and the
   * per-tile `rotationY` `tileWallSegment` computes is a pure function of
   * the run's own start->end DIRECTION, with no notion of which side is
   * "outward." On a hex grid, 'left'/'right' share one absolute
   * direction pair (both run top-to-bottom) and 'top'/'bottom' share
   * another (both run left-to-right) — so within each pair, the SAME
   * rotationY gets computed for both sides despite their outward normals
   * pointing in opposite directions. Verified exactly against the
   * reference-tomb fixture: of hall's 4 sides, exactly 2 (left, bottom)
   * end up with their detailed face pointing outward and the other 2
   * (right, top) end up facing the flat back outward — a deterministic,
   * always-reproducible 50/50 split, not a lighting artifact. This field
   * lets the renderer flip a tile's rotationY by pi when the naive
   * direction-only orientation doesn't match the room's real outward
   * side, without `wallRunMeshHelpers.tileWallSegment` (which has no
   * access to room-center context) needing to guess.
   */
  facing: WorldPos;
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
  /**
   * Unit vector (world x/z) this connector's tiled pieces should face —
   * see `EnvelopeRun.facing`'s doc comment for the underlying defect this
   * corrects. A connector separates two rooms symmetrically (unlike an
   * envelope side, it has no single "outward"), so there's no provably
   * optimal choice here; this points from the connector's own column
   * toward `regionBId`'s center (the higher-column side) — a
   * deterministic, defensible convention rather than the pre-fix
   * behavior's undocumented coin flip (whichever way the run's own
   * start->end direction happened to fall). Kirk's round-2 report was
   * specifically about room envelope walls, not connector/door-flanking
   * ones — if a connector's flat back is still visible from
   * `regionAId`'s side after this, that's a real follow-up, not
   * something this fix claims to have solved for both viewing angles at
   * once.
   */
  facing: WorldPos;
}

export interface WallRunsInput {
  regions: RegionInput[];
  doors: ConnectorDoorInput[];
  /** Hex radius, world units — defaults to the game's standard HEX_SIZE so
   * every real caller matches every other renderer without having to pass
   * it explicitly. */
  hexSize?: number;
  /**
   * Outward offset (world units) applied to TOP/BOTTOM envelope sides
   * beyond the boundary hexes' own centers — the clip-clearance dial the
   * design doc's W4 slice tunes against the largest character mesh.
   * Defaults to `sqrt(3)` hex radii (see
   * DEFAULT_ENVELOPE_OFFSET_TOP_BOTTOM_HEXES's doc — this compensates for
   * the row-staircase eating most of whatever offset is configured on
   * these two sides specifically).
   *
   * Deliberately SEPARATE from `envelopeOffsetLeftRight` (round-2 W3/W4
   * finding, Kirk's live walk: "a wall going through the door"): a single
   * offset applied uniformly to all 4 sides pushed a room's own LEFT/
   * RIGHT envelope side far enough outward to cross into the neighboring
   * connector's own column — and, at the shared reference-tomb doorRow,
   * almost exactly onto the door cell itself. The two side pairs need
   * genuinely different tuning, not just different in degree: TOP/BOTTOM
   * sides are a chord across a zigzag (`hexRow`'s odd-q staircase) that
   * "eats" a large fraction of the configured offset before it reaches
   * the actual hex footprint, while LEFT/RIGHT sides run along a pure hex
   * principal direction with NO zigzag at all — the exact same numeric
   * offset delivers its FULL value as clearance on left/right, with none
   * of the staircase's "eating" to compensate for. Reusing the
   * staircase-tuned top/bottom value there wasn't "a bit too generous",
   * it was solving a problem that side never had, at a magnitude that
   * measurably overshoots into the neighboring connector (see
   * `DEFAULT_ENVELOPE_OFFSET_LEFT_RIGHT_HEXES`'s own doc for the exact
   * numbers). Not a final art-directed value here either — W4 tunes
   * both independently against the largest character mesh.
   */
  envelopeOffsetTopBottom?: number;
  /**
   * Outward offset (world units) applied to LEFT/RIGHT envelope sides —
   * see `envelopeOffsetTopBottom`'s doc comment for why this is a
   * separate input rather than one value shared across all 4 sides.
   * Defaults to `DEFAULT_ENVELOPE_OFFSET_LEFT_RIGHT_HEXES`.
   */
  envelopeOffsetLeftRight?: number;
  /**
   * How far a run's endpoints extend past the outermost boundary hex's
   * own center, along the run's direction — reaches toward the hex's true
   * outer face/corner instead of stopping dead-center on the last hex.
   *
   * Round-2 W3/W4 finding (Kirk's live walk: "the corners still look like
   * 2 stacks of tile shaped thingers"): the dedicated corner-fitting GLBs
   * (`SM_Env_Wall_End_Coner_Outer_01` etc.) are correctly-converted tall
   * narrow corner posts, but the wall role's fit squash (~6x Y-compression
   * to reach WALL_HEIGHT) reduces their faceted brick relief to a
   * "stacked wafer" look that panel-shaped pieces don't suffer from — see
   * rpg-game-assets' env-role-map notes (post-shaped pieces don't survive
   * the wall squash; don't map them to wall roles) and this repo's
   * WallRunMesh doc comment. Rather than adopt a different GLB for that
   * slot, this default was raised (from half a hex radius) far enough
   * that two perpendicular runs' own extended ends visually overlap past
   * the true corner (`EnvelopeCorner`'s own line-intersection point) and
   * self-cover the joint — the standard modular-kit "overlap-miter"
   * cheat, picked over a small stand-in panel piece after a live
   * side-by-side comparison at the same corner. Verified this doesn't
   * reopen the door-intrusion fix from a different axis: measured the
   * extended top-left corner's perpendicular distance to its nearest
   * connector column stays deep on the safe side (~-0.39 world units) at
   * this value.
   */
  cornerExtension?: number;
}

/**
 * One room envelope corner, where two adjacent sides (e.g. 'top' and
 * 'left') should visually meet — a genuine Synty corner-piece placement
 * point (design.md/plan.md's W3 slice: "map runs to segment/corner/
 * door-frame pieces"), not a byproduct of either side's own independent
 * offset.
 *
 * Why a dedicated corner point is needed at all, rather than just reusing
 * one side's own extended/offset endpoint: `buildEnvelopeSegment` offsets
 * each side OUTWARD ALONG ITS OWN PERPENDICULAR NORMAL, independently.
 * Translating two lines outward by the same distance along their OWN
 * normals does not produce a shared endpoint unless a genuine miter point
 * is computed — each side's own extended start/end lands near the room's
 * raw corner but at a DIFFERENT world position than the other side's
 * corresponding endpoint. This is the exact defect Kirk flagged from the
 * prod screenshot ("the placeholder butt-joins visibly don't meet at room
 * corners" — the #1 visible defect, W3 kickoff).
 *
 * Correction (caught by this file's own tests, not assumed): an earlier
 * version of this computation assumed adjacent sides meet at EXACTLY 90
 * degrees, derived from "column span D is even for real room widths." That
 * derivation had an off-by-one: D = maxCol - minCol = width - 1, so an
 * EVEN room width (6/10/12, the only real ones) gives an ODD column span,
 * not even — the parity-correction term does NOT divide out cleanly for
 * odd D, and the true angle between 'left'/'right' and 'top'/'bottom'
 * varies per room (measured ~93.7 degrees for the reference-tomb "hall"
 * fixture, not 90). A closed-form formula that assumed a fixed angle would
 * have been silently wrong depending on each room's min/maxCol parity.
 *
 * The robust fix: compute the corner as the actual 2D line-line
 * intersection of the two adjacent sides' own already-built (extended +
 * offset) segments — correct for whatever the true angle happens to be,
 * with no assumption about it at all. `lineIntersection` below is the
 * general-purpose helper; a degenerate (near-parallel, det ~ 0) case —
 * not reachable for any real room shape, since 'left'/'right' and
 * 'top'/'bottom' directions are never anywhere near parallel on a hex
 * grid — falls back to the raw (un-offset) corner point rather than
 * throwing, so a pathological caller-supplied fixture degrades instead of
 * crashing.
 */
export interface EnvelopeCorner {
  regionId: string;
  corner: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
  position: WorldPos;
  /** Outward-facing rotation (radians) — points from the room's center
   * through this corner, matching classifyWallVertices' existing
   * "wall-corner-outer" rotation convention (syntyHexWallHelpers.ts) so a
   * corner piece here orients the same way the legacy per-cell corner
   * fitting already does. */
  rotationY: number;
}

export interface WallRunsResult {
  envelopeRuns: EnvelopeRun[];
  envelopeCorners: EnvelopeCorner[];
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

/**
 * 2D line-line intersection (not segment-segment — extends both lines
 * infinitely): line 1 is `{a1 + t*d1 : t in R}`, line 2 is
 * `{a2 + s*d2 : s in R}`. Used to find an envelope corner as the exact
 * point where two adjacent (already offset+extended) sides' own lines
 * meet, whatever the actual angle between them is (see EnvelopeCorner's
 * doc comment for why this replaced an earlier closed-form formula that
 * wrongly assumed a fixed 90-degree angle). Returns undefined when the
 * two directions are parallel (determinant ~0) — not reachable for any
 * real room shape's 'left'/'right' vs 'top'/'bottom' sides, but callers
 * fall back to a sane default rather than dividing by ~0.
 */
function lineIntersection(
  a1: WorldPos,
  d1: WorldPos,
  a2: WorldPos,
  d2: WorldPos
): WorldPos | undefined {
  const det = d2.x * d1.z - d1.x * d2.z;
  if (Math.abs(det) < 1e-9) return undefined;
  const dx = a2.x - a1.x;
  const dz = a2.z - a1.z;
  const t = (dx * -d2.z - -d2.x * dz) / det;
  return { x: a1.x + t * d1.x, z: a1.z + t * d1.z };
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
): WallRunSegment & { facing: WorldPos } {
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
    facing: normal,
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
 *
 * This value is for TOP/BOTTOM sides ONLY as of the round-2 W3/W4 fix
 * (see `DEFAULT_ENVELOPE_OFFSET_LEFT_RIGHT_HEXES` below for why left/
 * right sides need their own, much smaller default).
 */
const DEFAULT_ENVELOPE_OFFSET_TOP_BOTTOM_HEXES = Math.sqrt(3);

/**
 * Round-2 W3/W4 finding (Kirk's live walk: "a wall going through the
 * door"): reusing `DEFAULT_ENVELOPE_OFFSET_TOP_BOTTOM_HEXES` for LEFT/
 * RIGHT sides pushed a room's own envelope wall far enough outward to
 * cross into the neighboring connector column — measured EXACTLY against
 * the real reference-tomb fixture, not estimated: the perpendicular
 * distance from a room's raw (un-offset) left/right envelope line to the
 * door cell on its neighboring connector is a FIXED -1.5 world units
 * (verified identical at both the entrance-hall and hall-tomb
 * connectors, independent of room width — a fixed geometric invariant of
 * the "one reserved column between rooms" layout, not fixture-specific),
 * and offsetting outward by any amount ADDS DIRECTLY to that distance
 * (`perpDistance = envelopeOffset - 1.5`, an exact linear relationship,
 * also verified). The old default (`sqrt(3)` ~= 1.732) therefore
 * overshot the door line by ~0.232 world units — inside the wall's own
 * rendered thickness, exactly the "wall through the door" defect.
 *
 * Why left/right needs a genuinely SMALLER value, not just a smaller
 * fraction of the same one: a left/right envelope side runs along a pure
 * hex principal direction (verified analytically — `hexRow`'s odd-q
 * parity correction is an exact linear function of row at a FIXED
 * column, so the per-row world-space step never varies in direction).
 * There is no "staircase" for this offset to compensate for, unlike
 * top/bottom's chord-across-a-zigzag — every unit of offset here is
 * delivered as pure clearance, none of it "eaten." The hex's own
 * apothem (`sqrt(3)/2 ~= 0.866`, the center-to-flat-side distance) is
 * therefore already sufficient to clear the boundary hex's own
 * footprint on this axis, with ZERO eating-effect correction needed.
 * `1.0` hex radii gives a full hex-size unit of clearance (~0.134 more
 * than the bare apothem, a modest safety margin for the character/
 * monster clip-check W4 still calls for) while staying comfortably
 * inside the 1.5-unit ceiling before the neighboring connector/door —
 * 0.5 world units of margin before intruding on anything there.
 */
const DEFAULT_ENVELOPE_OFFSET_LEFT_RIGHT_HEXES = 1.0;

// Round-2 W3/W4 finding — see WallRunsInput.cornerExtension's own doc
// comment for the full "overlap-miter instead of a corner-fitting GLB"
// writeup. Was 0.5 (half a hex radius); doubled so adjacent runs overlap
// past the true corner rather than just reaching it.
const DEFAULT_CORNER_EXTENSION_HEXES = 1.0;

/**
 * The four envelope runs (left/right/top/bottom) AND the four envelope
 * corners for one region. Derived purely from the region's own
 * hex-membership bounding rect — never from wall/blocking data — so a
 * boss-archetype region's deliberately full-width-open doorRow
 * (rpg-toolkit#819's tactical invariant) can never punch a gap in these:
 * this function has no notion of "openness" at all, only the rectangle's
 * four corners.
 */
function envelopeGeometryForRegion(
  region: RegionInput,
  hexSize: number,
  envelopeOffsetTopBottom: number,
  envelopeOffsetLeftRight: number,
  cornerExtension: number
): { runs: EnvelopeRun[]; corners: EnvelopeCorner[] } {
  const bounds = boundsOf(region.hexes);
  if (!bounds) return { runs: [], corners: [] };
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

  // Left/right and top/bottom get their OWN offset (see
  // DEFAULT_ENVELOPE_OFFSET_LEFT_RIGHT_HEXES's doc comment for why a
  // single shared value overshot into the neighboring connector on
  // left/right specifically).
  const sides: Array<{
    side: EnvelopeSide;
    a: WorldPos;
    b: WorldPos;
    offset: number;
  }> = [
    {
      side: 'left',
      a: topLeft,
      b: bottomLeft,
      offset: envelopeOffsetLeftRight,
    },
    {
      side: 'right',
      a: topRight,
      b: bottomRight,
      offset: envelopeOffsetLeftRight,
    },
    { side: 'top', a: topLeft, b: topRight, offset: envelopeOffsetTopBottom },
    {
      side: 'bottom',
      a: bottomLeft,
      b: bottomRight,
      offset: envelopeOffsetTopBottom,
    },
  ];

  const runs = sides.map(({ side, a, b, offset }) => ({
    regionId: region.id,
    side,
    ...buildEnvelopeSegment(a, b, center, cornerExtension, offset),
  }));
  const runBySide = new Map(runs.map((run) => [run.side, run]));

  // Miter-join corners (EnvelopeCorner's own doc comment has the full
  // derivation, including the earlier flawed "assume 90 degrees" attempt
  // this replaced): each corner is the actual line-line intersection of
  // its two adjacent sides' own already-built (extended + offset) runs —
  // correct for whatever the true angle between them is, no assumption
  // needed. Falls back to the raw (un-offset) corner point in the
  // unreachable-for-real-data parallel case, rather than throwing.
  const cornerPairs: Array<{
    corner: EnvelopeCorner['corner'];
    rawPoint: WorldPos;
    sideA: EnvelopeSide;
    sideB: EnvelopeSide;
  }> = [
    { corner: 'topLeft', rawPoint: topLeft, sideA: 'left', sideB: 'top' },
    { corner: 'topRight', rawPoint: topRight, sideA: 'right', sideB: 'top' },
    {
      corner: 'bottomLeft',
      rawPoint: bottomLeft,
      sideA: 'left',
      sideB: 'bottom',
    },
    {
      corner: 'bottomRight',
      rawPoint: bottomRight,
      sideA: 'right',
      sideB: 'bottom',
    },
  ];
  const corners = cornerPairs.map(({ corner, rawPoint, sideA, sideB }) => {
    const runA = runBySide.get(sideA)!;
    const runB = runBySide.get(sideB)!;
    const dirA: WorldPos = {
      x: runA.end.x - runA.start.x,
      z: runA.end.z - runA.start.z,
    };
    const dirB: WorldPos = {
      x: runB.end.x - runB.start.x,
      z: runB.end.z - runB.start.z,
    };
    const position =
      lineIntersection(runA.start, dirA, runB.start, dirB) ?? rawPoint;
    const rotationY = Math.atan2(
      -(position.z - center.z),
      position.x - center.x
    );
    return { regionId: region.id, corner, position, rotationY };
  });

  return { runs, corners };
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
/** Average of a bounds rect's 4 corners in world space — same "center"
 * convention envelopeGeometryForRegion uses for its own room center, just
 * derived from an already-known Bounds instead of raw hex membership. */
function boundsCenter(bounds: Bounds, hexSize: number): WorldPos {
  const { minCol, maxCol, minRow, maxRow } = bounds;
  const corners = [
    cubeToWorld(cubeAtColRow(minCol, minRow), hexSize),
    cubeToWorld(cubeAtColRow(maxCol, minRow), hexSize),
    cubeToWorld(cubeAtColRow(minCol, maxRow), hexSize),
    cubeToWorld(cubeAtColRow(maxCol, maxRow), hexSize),
  ];
  return {
    x: corners.reduce((sum, c) => sum + c.x, 0) / 4,
    z: corners.reduce((sum, c) => sum + c.z, 0) / 4,
  };
}

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

  // See ConnectorRun.facing's own doc comment: a deterministic (not
  // provably optimal for both rooms) convention — point from the
  // connector column toward regionB's center, the higher-column side.
  const doorWorld = worldAt(doorRow);
  const facing = unitDirection(doorWorld, boundsCenter(boundsB, hexSize));

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
    facing,
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
  const envelopeOffsetTopBottom =
    input.envelopeOffsetTopBottom ??
    DEFAULT_ENVELOPE_OFFSET_TOP_BOTTOM_HEXES * hexSize;
  const envelopeOffsetLeftRight =
    input.envelopeOffsetLeftRight ??
    DEFAULT_ENVELOPE_OFFSET_LEFT_RIGHT_HEXES * hexSize;
  const cornerExtension =
    input.cornerExtension ?? DEFAULT_CORNER_EXTENSION_HEXES * hexSize;

  const envelopeRuns: EnvelopeRun[] = [];
  const envelopeCorners: EnvelopeCorner[] = [];
  const regionBounds = new Map<string, Bounds>();
  for (const region of input.regions) {
    const geometry = envelopeGeometryForRegion(
      region,
      hexSize,
      envelopeOffsetTopBottom,
      envelopeOffsetLeftRight,
      cornerExtension
    );
    envelopeRuns.push(...geometry.runs);
    envelopeCorners.push(...geometry.corners);
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

  return { envelopeRuns, envelopeCorners, connectorRuns };
}
