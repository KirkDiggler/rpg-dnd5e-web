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
 *
 *   TWO-TIER EXCEPTION (gate review finding, rpg-dnd5e-web#626, now
 *   load-bearing rather than incidental): the above is the FULL picture
 *   only for a region's ROW extent when it has no validated connector, or
 *   whose peer across a connector hasn't revealed further either.
 *   `widenRegionBoundsAlongConnectors` (this file) widens a connector-
 *   participating region's row bounds to match its peer's proven extent
 *   the moment ANY region in the chain reveals it — correct, because
 *   every region shares one `DungeonParams.Height`, so the widened value
 *   is always the SAME true extent this region would show once fully
 *   explored anyway, never wrong geometry — but it means row extent can
 *   snap early for a connected region while an ISOLATED region (or one
 *   whose peer is equally behind) still tracks its own frontier exactly
 *   as described above. Column extent is NEVER widened this way (see
 *   `widenRegionBoundsAlongConnectors`' own doc comment for why — room
 *   widths genuinely differ, unlike the shared Height assumption).
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
   * UNUSED (accepted for backward API compatibility only — no current
   * caller reads it, and computeWallRuns never consults this field).
   *
   * Originally: how far a CONNECTOR run's own near/far endpoint extended
   * past its boundary hex's own center, a flat half-hex-radius reach.
   * Superseded by the connector-single-wall follow-up (rpg-project#132):
   * once a suppressed envelope side stops closing a room corner via the
   * overlap-miter cheat (see `WallRunMesh`'s own doc comment), the
   * CONNECTOR run's endpoint has to become the other half of that joint
   * instead — which means it must reach the SAME exact envelope-corner
   * intersection point `EnvelopeCorner` already computes (offset outward
   * by up to `envelopeOffsetTopBottom`, often much farther than this flat
   * constant ever reached — the exact defect Kirk's live walk caught:
   * "a corner went missing... roughly a hex of open gap"). Connector run
   * endpoints now use that same exact-intersection-plus-margin approach
   * (`envelopeCornerOverlapMargin`), the same transition envelope runs
   * themselves already went through — see that field's own doc comment.
   */
  cornerExtension?: number;
  /**
   * How far PAST the exact envelope-corner intersection
   * (`EnvelopeCorner`'s own line-intersection point) each of a room's 4
   * envelope runs extends, so two perpendicular runs visually overlap
   * and self-cover the joint — the standard modular-kit "overlap-miter"
   * cheat.
   *
   * Round-2 W3/W4 finding (Kirk's live walk: "the corners still look
   * like 2 stacks of tile shaped thingers", then later: "trim the
   * corner overshoot" once a flat-distance approach was tried first):
   * the dedicated corner-fitting GLBs (`SM_Env_Wall_End_Coner_Outer_01`
   * etc.) are correctly-converted tall narrow corner posts, but the
   * wall role's fit squash (~6x Y-compression to reach WALL_HEIGHT)
   * reduces their faceted brick relief to a "stacked wafer" look that
   * panel-shaped pieces don't suffer from — verdict recorded in
   * rpg-game-assets' env-role-map fittings notes (PR #33, merged:
   * post-shaped pieces don't survive the wall squash; don't map them to
   * wall roles) and this repo's WallRunMesh doc comment. This is
   * PERMANENT, not interim — no re-conversion of this family is coming.
   *
   * First attempt (superseded): a single flat additive distance applied
   * to EVERY run endpoint uniformly (like the old `cornerExtension`
   * everywhere), tuned by eye at one corner. This overshot visibly at a
   * DIFFERENT corner (Kirk: "bottom-right of the entrance") because a
   * flat distance is geometrically wrong — how far a given endpoint
   * actually is from ITS OWN corner (`EnvelopeCorner.position`, computed
   * via genuine line-intersection) varies per corner/room (rooms' actual
   * corner angles measure ~93.7 degrees, not a clean 90 — see
   * EnvelopeCorner's own doc comment), so a flat distance is exactly
   * right for at most one corner and wrong (too short or too long) for
   * every other one.
   *
   * The fix: each envelope run's endpoint now extends by EXACTLY the
   * distance to its own corner's true intersection point (computed from
   * the offset-only, zero-extension lines first — `EnvelopeCorner`'s
   * position doesn't depend on extension at all, since a line's
   * direction/position is unaffected by how far along it a segment's
   * endpoint reaches), and `envelopeCornerOverlapMargin` is ONLY the
   * small amount ADDED on top of that exact reach — no longer a
   * from-scratch distance estimate. This margin exists because reaching
   * the corner exactly makes both runs' CENTERLINES cross there, but
   * each run's own rendered THICKNESS still needs to reach a little past
   * that crossing point for the OTHER run's footprint to fully enclose
   * this run's end-cap (otherwise a sliver of the end-cap peeks out
   * unenclosed) — so the needed margin is on the order of half the
   * wall piece's own rendered depth, not a fraction of a hex radius.
   * Defaults to `DEFAULT_ENVELOPE_CORNER_OVERLAP_MARGIN` (~half of
   * `SM_Env_Wall_Half_01`'s rendered thickness, ~0.327 world units at
   * this game's SYNTY_SCALE). A caller wanting zero risk of any
   * poke-through at all can pass 0 here — the exact-reach component
   * alone still closes the joint to a hairline seam, never a gap.
   */
  envelopeCornerOverlapMargin?: number;
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
 * run: push each end outward along the run's own direction by its own
 * (independent — see envelopeGeometryForRegion's own doc comment for why
 * `startExtension`/`endExtension` generally differ) extension distance,
 * then translate the whole segment along the outward normal by
 * `envelopeOffset` (the clip-clearance dial). */
function buildEnvelopeSegment(
  rawStart: WorldPos,
  rawEnd: WorldPos,
  roomCenter: WorldPos,
  startExtension: number,
  endExtension: number,
  envelopeOffset: number
): WallRunSegment & { facing: WorldPos } {
  const dir = unitDirection(rawStart, rawEnd);
  const extendedStart: WorldPos = {
    x: rawStart.x - dir.x * startExtension,
    z: rawStart.z - dir.z * startExtension,
  };
  const extendedEnd: WorldPos = {
    x: rawEnd.x + dir.x * endExtension,
    z: rawEnd.z + dir.z * endExtension,
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

/**
 * See WallRunsInput.envelopeCornerOverlapMargin's own doc comment for
 * the full derivation. ~Half of `SM_Env_Wall_Half_01`'s rendered
 * thickness at this game's SYNTY_SCALE (0.4357 raw depth * 0.75 = 0.327
 * world units; half of that is 0.1635, rounded to 0.16) — enough for the
 * OTHER run's own footprint to enclose this run's end-cap once both
 * runs reach their shared corner exactly, without adding enough extra
 * distance to poke visibly past it. NOT scaled by hexSize (unlike every
 * other geometry constant in this file) — it's derived from rendered
 * wall THICKNESS, which has nothing to do with hex size.
 */
const DEFAULT_ENVELOPE_CORNER_OVERLAP_MARGIN = 0.16;

/**
 * The four envelope runs (left/right/top/bottom) AND the four envelope
 * corners for one region. Derived purely from `bounds` — never from
 * wall/blocking data — so a boss-archetype region's deliberately
 * full-width-open doorRow (rpg-toolkit#819's tactical invariant) can
 * never punch a gap in these: this function has no notion of "openness"
 * at all, only the rectangle's four corners. `bounds` is the CALLER's
 * concern, not this function's — see `widenRegionBoundsAlongConnectors`'
 * own doc comment for why it's the region's own reveal-gated hex bounds
 * WIDENED (row extent only) to match any validated connector's shared
 * extent, not simply `boundsOf(region.hexes)` — this function only cares
 * that it received the RIGHT rectangle, not where it came from.
 *
 * `connectorFacing` (rpg-project#132 connector-single-wall follow-up to
 * #615/#617's envelope-offset fix — the door-wall audit found 3
 * independently-correct wall systems crowding the same frame, ~0.5 world
 * units apart): when a side sits against a reserved connector column, that
 * side's own EnvelopeRun is SUPPRESSED entirely — the connector's own
 * ConnectorRun (or, before the far room resolves, the fallback-segment
 * safety net in wallRunAdapters.ts) becomes the ONLY wall between the two
 * rooms, the classic one-wall-one-door read. A suppressed side still needs
 * a real line for corner math, though: the room's adjacent top/bottom run
 * used to terminate against THIS side's own line, and must now terminate
 * against the CONNECTOR's line instead so its corner still closes with no
 * gap (same exact-intersection approach as every other corner — see
 * `EnvelopeCorner`'s own doc comment). `lineForSide` below is what supplies
 * that stand-in line; it's used ONLY for corner-intersection math, never
 * emitted as a run of its own.
 */
function envelopeGeometryForRegion(
  region: RegionInput,
  bounds: Bounds | undefined,
  hexSize: number,
  envelopeOffsetTopBottom: number,
  envelopeOffsetLeftRight: number,
  envelopeCornerOverlapMargin: number,
  connectorFacing: { left?: number; right?: number }
): { runs: EnvelopeRun[]; corners: EnvelopeCorner[] } {
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
  // left/right specifically). `cornerAtStart`/`cornerAtEnd` record which
  // of the 4 corners each endpoint (`a`/`b`) belongs to — needed below to
  // look up that corner's own exact position once it's computed.
  const sides: Array<{
    side: EnvelopeSide;
    a: WorldPos;
    b: WorldPos;
    offset: number;
    cornerAtStart: EnvelopeCorner['corner'];
    cornerAtEnd: EnvelopeCorner['corner'];
  }> = [
    {
      side: 'left',
      a: topLeft,
      b: bottomLeft,
      offset: envelopeOffsetLeftRight,
      cornerAtStart: 'topLeft',
      cornerAtEnd: 'bottomLeft',
    },
    {
      side: 'right',
      a: topRight,
      b: bottomRight,
      offset: envelopeOffsetLeftRight,
      cornerAtStart: 'topRight',
      cornerAtEnd: 'bottomRight',
    },
    {
      side: 'top',
      a: topLeft,
      b: topRight,
      offset: envelopeOffsetTopBottom,
      cornerAtStart: 'topLeft',
      cornerAtEnd: 'topRight',
    },
    {
      side: 'bottom',
      a: bottomLeft,
      b: bottomRight,
      offset: envelopeOffsetTopBottom,
      cornerAtStart: 'bottomLeft',
      cornerAtEnd: 'bottomRight',
    },
  ];

  // Pass 1: offset-only (zero extension) lines, purely to derive each
  // corner's EXACT position via line-intersection. A line's direction
  // and position don't depend on how far along it a segment's endpoint
  // reaches, so these corner positions are identical to what pass 2
  // below would compute even after real extension is applied — this
  // pass exists only so pass 2 can know, in advance, exactly how far
  // each endpoint needs to reach.
  const zeroExtRuns = sides.map(({ side, a, b, offset }) => ({
    side,
    ...buildEnvelopeSegment(a, b, center, 0, 0, offset),
  }));
  const zeroExtBySide = new Map(zeroExtRuns.map((run) => [run.side, run]));

  const isSuppressed = (side: EnvelopeSide): boolean =>
    (side === 'left' && connectorFacing.left !== undefined) ||
    (side === 'right' && connectorFacing.right !== undefined);

  // The line a suppressed side's own corner(s) should intersect against
  // instead of its own (unrendered) envelope line: a fixed-column line at
  // the connector's own column. Any two distinct rows at a fixed column
  // define the identical infinite line (this file's own doc comment on
  // `EnvelopeSide` — a constant column traces one straight world-space
  // direction regardless of which rows are used), so minRow/maxRow here
  // are arbitrary anchors, not a claim about the connector's own extent.
  const lineForSide = (
    side: EnvelopeSide
  ): { start: WorldPos; end: WorldPos } => {
    const col =
      side === 'left'
        ? connectorFacing.left
        : side === 'right'
          ? connectorFacing.right
          : undefined;
    if (col !== undefined) {
      return { start: cornerWorld(col, minRow), end: cornerWorld(col, maxRow) };
    }
    return zeroExtBySide.get(side)!;
  };

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
  const cornerPositions = new Map<EnvelopeCorner['corner'], WorldPos>();
  for (const { corner, rawPoint, sideA, sideB } of cornerPairs) {
    const runA = lineForSide(sideA);
    const runB = lineForSide(sideB);
    const dirA: WorldPos = {
      x: runA.end.x - runA.start.x,
      z: runA.end.z - runA.start.z,
    };
    const dirB: WorldPos = {
      x: runB.end.x - runB.start.x,
      z: runB.end.z - runB.start.z,
    };
    cornerPositions.set(
      corner,
      lineIntersection(runA.start, dirA, runB.start, dirB) ?? rawPoint
    );
  }

  // Pass 2: real runs. Each endpoint extends by the EXACT distance to
  // its own corner's true position (a genuine per-corner measurement,
  // not an assumed flat distance — see envelopeCornerOverlapMargin's own
  // doc comment for why a flat distance visibly overshot at some corners
  // while barely reaching others), plus the small overlap margin. A
  // connector-facing side (see `connectorFacing`'s own doc comment on this
  // function) is filtered out here — its line only existed to give the
  // adjacent top/bottom run something exact to terminate against; it never
  // becomes a run of its own.
  const runs = sides
    .filter(({ side }) => !isSuppressed(side))
    .map(({ side, a, b, offset, cornerAtStart, cornerAtEnd }) => {
      const zeroExt = zeroExtBySide.get(side)!;
      const startExtension =
        distance(zeroExt.start, cornerPositions.get(cornerAtStart)!) +
        envelopeCornerOverlapMargin;
      const endExtension =
        distance(zeroExt.end, cornerPositions.get(cornerAtEnd)!) +
        envelopeCornerOverlapMargin;
      return {
        regionId: region.id,
        side,
        ...buildEnvelopeSegment(
          a,
          b,
          center,
          startExtension,
          endExtension,
          offset
        ),
      };
    });

  const corners = cornerPairs.map(({ corner }) => {
    const position = cornerPositions.get(corner)!;
    const rotationY = Math.atan2(
      -(position.z - center.z),
      position.x - center.x
    );
    return { regionId: region.id, corner, position, rotationY };
  });

  return { runs, corners };
}

/**
 * Which of a region's own left/right sides sit IMMEDIATELY against a
 * connector column that should become that side's SOLE wall (option-(b),
 * rpg-project#132 connector-single-wall follow-up to #615/#617's
 * envelope-offset fix) — using ONLY this region's own bounds plus the
 * full door-column list. Deliberately NOT `connectorRegionsForDoor`'s
 * two-sided pair resolution below: that needs BOTH neighboring regions'
 * bounds known, which fails for as long as the far side of a connector
 * stays unrevealed. Doors are whole-dungeon and unconditional from wave 1
 * (`connectorDoorInputsFromWalls` builds them from the Walls list, never
 * from per-viewer region hex membership — this file's own header doc),
 * so a region's OWN nearest door on each side resolves correctly
 * regardless of whether the far region has been revealed at all — the
 * property needed for suppression (and therefore the fallback-segment
 * safety net becoming the visible wall) to be correct in BOTH reveal
 * states, not only once a connector's pair fully resolves.
 *
 * ADJACENCY REQUIRED (gate review finding, rpg-dnd5e-web#626 — "the
 * mirror image of #603's fix, not another instance of it"): a door
 * column only counts when it sits EXACTLY one past this region's own
 * CURRENT bounds (`col === bounds.maxCol + 1` / `col === bounds.minCol -
 * 1`), not merely "the nearest one in that direction at any distance."
 * The pre-fix version suppressed whenever ANY door lay beyond bounds,
 * regardless of how far — under partial reveal a region's own edge is
 * usually nowhere near that connector, so the suppressed side removed
 * the room's only wall there while the connector run meant to replace it
 * (which needs the FAR side revealed too) frequently didn't exist yet.
 * Two live reproductions on the reference-tomb shape (entrance 6@0, hall
 * 10@7, tomb 12@18): hall revealed cols 7-10 with tomb dark suppressed
 * hall's right side with ZERO connector run behind it (open frontier);
 * hall revealed cols 10-12 only (touching neither door) suppressed BOTH
 * sides with zero runs anywhere (room open on both sides). Reconciling:
 * reveal-independence is the right goal for PAIRING (`connectorRegionsForDoor`)
 * since the connector genuinely exists either way, but it's exactly the
 * wrong goal for SUPPRESSION, which is a claim about THIS region's own
 * edge — true only once that edge has actually reached the connector.
 *
 * Trade-off, chosen deliberately over the alternative (suppress only
 * once a real ConnectorRun/fallback replacement is confirmed covering
 * this boundary): that stronger form would need wire-derived fallback
 * knowledge this module never receives (`computeWallRuns` is
 * protocol-agnostic by design — see this file's own header doc), so it
 * isn't achievable purely from `RegionInput`/`ConnectorDoorInput`
 * geometry the way this adjacency gate is. The adjacency gate's own cost
 * is a BRIEF, transient double-wall: while this region's OWN edge hasn't
 * yet revealed all the way to the connector column, suppression stays
 * OFF (correctly — this region's own envelope wall still renders), but
 * if the FAR side has ALREADY revealed enough to resolve a real
 * ConnectorRun (or a fallback already exists) by that point, that run
 * renders too — briefly, this region's own unsuppressed wall and the
 * connector's wall both stand near the same boundary, the SAME "two
 * systems 0.5 units apart" cosmetic defect #621 addressed, until this
 * region's own reveal catches up to adjacency and suppression takes
 * over. Still never an open gap either way — a strictly better failure
 * mode than the one this fixes: at least one wall of some kind always
 * stands, literally never zero.
 *
 * "Nearest" is now moot for the adjacent case (at most one door column
 * can be adjacent to a given side), but the loop still finds whichever
 * door (if any) satisfies the adjacency check per side, keeping the same
 * shape as the 3+ room chain convention `connectorRegionsForDoor` uses.
 */
function nearestConnectorColumns(
  bounds: Bounds,
  doorColumns: number[]
): { left?: number; right?: number } {
  let left: number | undefined;
  let right: number | undefined;
  for (const col of doorColumns) {
    if (col === bounds.maxCol + 1) {
      right = col;
    }
    if (col === bounds.minCol - 1) {
      left = col;
    }
  }
  return { left, right };
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
 * Widen each region's OWN row extent (never column extent — see below) to
 * at least the shared union row bounds of every connector it participates
 * in, using RAW (reveal-gated, `boundsOf(region.hexes)`) bounds. Real
 * dungeons share ONE fixed `Height` across every region in a chain
 * (`DungeonParams.Height` — this file's own established assumption,
 * already used to justify `connectorRunForDoor`'s union-not-intersection
 * `coveredRows` choice below), so once ANY region along a connector has
 * revealed the TRUE row extent (an entrance room fully explored from
 * spawn, say), every region it connects to structurally shares that SAME
 * extent even before it has revealed enough of its OWN hexes to know it
 * directly.
 *
 * Without this, a region's OWN top/bottom envelope run (the room's cross
 * wall, running along the COLUMN axis at a FIXED row) sits at that
 * region's own current reveal frontier — correct "v1 fog" behavior for an
 * isolated room, but WRONG at a validated connector: the connector's own
 * far reach already established the TRUE row via the peer region, so the
 * unwidened region's cross-wall stalls at its own stale, too-early
 * frontier — a real physical gap between where it sits and where the
 * connector's reach (and the peer's TRUE corner) actually meet. Root
 * cause of Kirk's live-walk regression on look-lab's gallery<->staged
 * connector ("wall gone for a couple hexes left of it [the door], right
 * run offset"): measured directly against that regression's real captured
 * wire data (rpg-project#132 follow-up) — staged's own unwidened "bottom"
 * run sat ~0.88 world units from the connector's validated far reach,
 * roughly 4x every other corner-match's established ~0.06-0.24 tolerance
 * elsewhere in this file. Widening staged's row bounds to match the
 * connector's shared extent (0.88 unit gap closes to the same small
 * tolerance every other corner already has) is the fix.
 *
 * Column extent is NEVER widened this way: different rooms in a chain have
 * genuinely different declared widths (dungeonspec YAML — a 20-wide
 * entrance beside a 10-wide chamber, say), so there is no "same Width"
 * assumption to borrow the way Height is shared; a region's own
 * minCol/maxCol always stays exactly its own reveal-gated value.
 *
 * TWO-TIER FOG CONTRACT (gate review finding, rpg-dnd5e-web#626): this
 * function means connector-participating regions' row extent can SNAP to
 * the true value the moment a validated peer proves it, while a region
 * with no connector at all (or one whose peer hasn't revealed further
 * either) still tracks its own reveal frontier exactly as documented at
 * the top of this file. That divergence is real and load-bearing, not
 * merely incidental fog imprecision — a region's own row bounds can jump
 * by double digits of world units the instant a connector resolves (a
 * hall revealed at a single row, entrance fully known, moved its own
 * cross-wall 10.41 units in one measured case) — but it's never WRONG
 * geometry: `DungeonParams.Height` is uniform across every region in a
 * chain (this doc's own opening paragraph), so the widened value is
 * always the SAME true extent the region would show once fully explored
 * anyway, just revealed earlier via the peer's own proof. This
 * assumption would stop holding if per-region heights ever land in
 * dungeonspec (unlike width, which already varies per region and is
 * correctly EXCLUDED from widening above) — flagging that as the one
 * condition that would need this reconsidered.
 *
 * PROPAGATION (gate review finding): a fixed-point pass — repeat over
 * every door, reading pairs and their bounds from the IN-PROGRESS
 * `widened` map (not `rawBounds`), until a full pass changes nothing.
 * Reading from `widened` lets a later door's widening see an EARLIER
 * door's already-widened result within the SAME pass; repeating until
 * stable is what makes a 3+ room chain converge correctly regardless of
 * `doors`' own array order (a single pass over `rawBounds`, the
 * PRE-fix version, only propagated one hop per call, and did so only
 * when `doors` happened to be ordered outward-to-inward — its own claim
 * that "every render re-derives bounds from scratch anyway" made that
 * seem safe, but re-deriving from scratch each render doesn't help
 * PROPAGATION distance within one call; what actually saved a 3+ room
 * chain pre-fix was the player's own advance revealing the intermediate
 * region directly, a different and weaker guarantee than the one that
 * was written down). Bounded at `rawBounds.size` iterations — a real
 * dungeon's connector graph is a simple chain/tree (never cyclic), so
 * widening can propagate at most one hop per region in the chain; this
 * is a safety bound against a malformed/cyclic input, not expected to
 * bind for any dungeon this codebase authors.
 */
function widenRegionBoundsAlongConnectors(
  rawBounds: Map<string, Bounds>,
  doors: ConnectorDoorInput[]
): Map<string, Bounds> {
  const widened = new Map(rawBounds);
  for (let pass = 0; pass < rawBounds.size; pass++) {
    let changed = false;
    for (const door of doors) {
      // connectorRegionsForDoor only compares COLUMN bounds, which
      // widening never touches (see above) — reading pairs from
      // `widened` instead of `rawBounds` is therefore identical for
      // pairing itself, while letting the ROW values used just below
      // benefit from any widening an earlier door in this SAME pass
      // already applied.
      const pair = connectorRegionsForDoor(door, widened);
      if (!pair) continue;
      const a = widened.get(pair.regionAId)!;
      const b = widened.get(pair.regionBId)!;
      const minRow = Math.min(a.minRow, b.minRow);
      const maxRow = Math.max(a.maxRow, b.maxRow);
      for (const id of [pair.regionAId, pair.regionBId]) {
        const current = widened.get(id)!;
        const nextMinRow = Math.min(current.minRow, minRow);
        const nextMaxRow = Math.max(current.maxRow, maxRow);
        if (nextMinRow !== current.minRow || nextMaxRow !== current.maxRow) {
          changed = true;
          widened.set(id, {
            ...current,
            minRow: nextMinRow,
            maxRow: nextMaxRow,
          });
        }
      }
    }
    if (!changed) break;
  }
  return widened;
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

/**
 * How far past `point` (along `dir`, unsigned) the farthest of the given
 * (already-filtered-to-meaningful, see call site) neighboring rooms' own
 * envelope corners reaches — the exact-intersection distance a connector
 * run's near/far endpoint must match to visually overlap the relevant
 * room(s) 'top'/'bottom' run(s) at that boundary (Kirk's live walk on the
 * connector-single-wall prototype: "a corner went missing... roughly a hex
 * of open gap"). Root cause: this connector endpoint used to only need to
 * reach a HEX's own outer face (`cornerExtension`, ~0.5 hex radii) because
 * the room's own now-suppressed side used to close the joint via the
 * overlap-miter cheat (WallRunMesh's own doc comment — no dedicated corner
 * GLB, two perpendicular runs physically overlapping is what "closes" a
 * corner). With that side suppressed, the connector run IS the joint's
 * other half now, and the true corner (envelope's own exact line-
 * intersection against THIS connector's column, offset outward by up to
 * `envelopeOffsetTopBottom` — over an order of magnitude more than the old
 * flat 0.5 reach) can sit far past where the flat constant ever reached,
 * opening exactly the gap reported.
 *
 * Takes the max across `candidates` (usually both neighboring rooms'
 * corners, when their independently-offset 'top'/'bottom' lines cross this
 * connector's column at very slightly different points — reaching the
 * farther guarantees the nearer is covered too) — but the CALLER is
 * responsible for excluding a room's corner entirely when that room's own
 * bounds don't actually reach this boundary (asymmetric partial-reveal
 * regression, Kirk's live walk on lab-b<->lab-vault: a room's own envelope
 * corner tracks ITS OWN reveal frontier, a value unrelated to this
 * boundary when that room hasn't revealed this far yet — see
 * `connectorRunForDoor`'s own call-site comment for the full reasoning).
 */
function distancePastPoint(point: WorldPos, candidates: WorldPos[]): number {
  return Math.max(...candidates.map((c) => distance(point, c)));
}

function connectorRunForDoor(
  door: ConnectorDoorInput,
  regionAId: string,
  regionBId: string,
  regionBounds: Map<string, Bounds>,
  hexSize: number,
  envelopeCornerOverlapMargin: number,
  regionACorners: Map<EnvelopeCorner['corner'], WorldPos>,
  regionBCorners: Map<EnvelopeCorner['corner'], WorldPos>
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

  // regionA sits on the LOWER-column side of this connector (always —
  // connectorRegionsForDoor's own convention), so its relevant corners are
  // 'topRight'/'bottomRight'; regionB's are 'topLeft'/'bottomLeft'.
  //
  // A region's own corner is only a MEANINGFUL reach target for a given end
  // when that region's own bounds actually reach the SAME row `coveredRows`
  // claims for that end (regression found on the asymmetric lab-b<->
  // lab-vault connector, Kirk's live walk: wall mostly vanished around the
  // door once the run took over from the fallback). `coveredRows` is the
  // UNION of both regions' bounds, so under asymmetric partial reveal one
  // region can be fully known (its own bounds already sit at the true
  // boundary) while the other has only revealed a frontier far short of it
  // — that region's own envelope corner is positioned at ITS OWN frontier,
  // a value entirely unrelated to the boundary this end is reaching for,
  // not a slightly-different-but-comparable measurement of the SAME
  // physical corner the way it is when both regions are equally revealed.
  // Blindly taking the max across both (the original fix) let that
  // unrelated, reveal-frontier-dependent distance dominate the extension,
  // producing wildly wrong reach (verified: a partial vault reveal moved
  // the near endpoint by >1 world unit from the correct fully-revealed
  // position, entirely as a side effect of the OTHER region's exploration
  // state). Excluding a region whose bounds don't reach this boundary
  // restores exactly one well-defined target — the one whose own row
  // extent is actually valid for this end — same as before under
  // symmetric reveal (both regions typically match here, see the
  // corner-termination tests), correct under asymmetric partial reveal too.
  // At least one region always qualifies (min/max's own definition
  // guarantees it), so the candidate list is never empty.
  if (doorRow > minRow) {
    const rawStart = worldAt(minRow);
    const rawEnd = worldAt(doorRow - 1);
    const dir = unitDirection(rawStart, rawEnd);
    const nearTargets: WorldPos[] = [];
    if (boundsA.minRow === minRow)
      nearTargets.push(regionACorners.get('topRight')!);
    if (boundsB.minRow === minRow)
      nearTargets.push(regionBCorners.get('topLeft')!);
    const nearExtension =
      distancePastPoint(rawStart, nearTargets) + envelopeCornerOverlapMargin;
    segments.push({
      start: {
        x: rawStart.x - dir.x * nearExtension,
        z: rawStart.z - dir.z * nearExtension,
      },
      end: rawEnd,
    });
  }
  if (doorRow < maxRow) {
    const rawStart = worldAt(doorRow + 1);
    const rawEnd = worldAt(maxRow);
    const dir = unitDirection(rawStart, rawEnd);
    const farTargets: WorldPos[] = [];
    if (boundsA.maxRow === maxRow)
      farTargets.push(regionACorners.get('bottomRight')!);
    if (boundsB.maxRow === maxRow)
      farTargets.push(regionBCorners.get('bottomLeft')!);
    const farExtension =
      distancePastPoint(rawEnd, farTargets) + envelopeCornerOverlapMargin;
    segments.push({
      start: rawStart,
      end: {
        x: rawEnd.x + dir.x * farExtension,
        z: rawEnd.z + dir.z * farExtension,
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
  const envelopeCornerOverlapMargin =
    input.envelopeCornerOverlapMargin ?? DEFAULT_ENVELOPE_CORNER_OVERLAP_MARGIN;

  const doorColumns = input.doors.map((door) => hexColumn(door.position));

  // Raw (reveal-gated) bounds first, then widened along every validated
  // connector (see widenRegionBoundsAlongConnectors' own doc comment) —
  // envelope geometry below uses the WIDENED bounds throughout, so a
  // region's own cross-wall no longer stalls at its own stale frontier
  // once a connector has already established the true row extent via its
  // peer.
  const rawRegionBounds = new Map<string, Bounds>();
  for (const region of input.regions) {
    const bounds = boundsOf(region.hexes);
    if (bounds) rawRegionBounds.set(region.id, bounds);
  }
  const regionBounds = widenRegionBoundsAlongConnectors(
    rawRegionBounds,
    input.doors
  );

  const envelopeRuns: EnvelopeRun[] = [];
  const envelopeCorners: EnvelopeCorner[] = [];
  const cornersByRegion = new Map<
    string,
    Map<EnvelopeCorner['corner'], WorldPos>
  >();
  for (const region of input.regions) {
    const bounds = regionBounds.get(region.id);
    const connectorFacing = bounds
      ? nearestConnectorColumns(bounds, doorColumns)
      : {};
    const geometry = envelopeGeometryForRegion(
      region,
      bounds,
      hexSize,
      envelopeOffsetTopBottom,
      envelopeOffsetLeftRight,
      envelopeCornerOverlapMargin,
      connectorFacing
    );
    envelopeRuns.push(...geometry.runs);
    envelopeCorners.push(...geometry.corners);
    cornersByRegion.set(
      region.id,
      new Map(geometry.corners.map((c) => [c.corner, c.position]))
    );
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
        envelopeCornerOverlapMargin,
        cornersByRegion.get(pair.regionAId)!,
        cornersByRegion.get(pair.regionBId)!
      )
    );
  }

  return { envelopeRuns, envelopeCorners, connectorRuns };
}
