import { describe, expect, it } from 'vitest';
import { BOARD_HEX_SIZE, cellCenter } from '../hexLayout';
import {
  canonicalCorner,
  cornerPoint,
  nearestCorner,
  type CornerRef,
} from './hexCorner';
import {
  clipSegmentToShrunkHex,
  footprintCellAtParam,
  hexCoverageFraction,
  isCellClipped,
  isValidDoorCell,
  nearestWallAngleFamily,
  projectPointToLineParam,
  projectWallLineToEdges,
  snapStraightEndpoint,
  STANDABLE_COVERAGE_THRESHOLD,
  standableFootprintKeys,
  straightWallCrossedEdges,
  straightWallFootprint,
  straightWallFootprintCoverage,
  straightWallsFootprintCoverage,
  straightWallsFootprintSet,
  WALL_ANGLE_SNAP_TOLERANCE_DEG,
  wallLineDoorCellAt,
} from './straightWallGeometry';

const GRID = { width: 20, height: 30 };

describe('straightWallFootprint — corner-anchored endpoint boundary cases', () => {
  // The whole point of corner anchoring (Kirk: "it always hangs over a
  // little"): a wallLine's endpoint is now a hex CORNER, shared by up to
  // 3 cells. These cases prove the footprint math correctly distinguishes
  // "the line's interior genuinely enters this cell" from "the line
  // merely TERMINATES at a point this cell also happens to own" — the
  // latter must never clip, or corner-anchoring wouldn't actually fix the
  // hangover it exists to fix.

  it('a wall that is EXACTLY one cell’s own edge (corner i to corner i+1) clips nothing', () => {
    // corners[0] and corners[1] of any cell are, by construction
    // (hexHalfPlanes builds edge i from corners[i]/corners[i+1]), the two
    // endpoints of one real hex edge — collinear with a true boundary,
    // the purest possible "touch, not clip" case, now expressed at the
    // corner-anchored level instead of via a hand-picked offset segment.
    const from: CornerRef = { cell: [5, 5], corner: 0 };
    const to: CornerRef = { cell: [5, 5], corner: 1 };
    expect(straightWallFootprint(from, to, GRID)).toEqual([]);
  });

  it('a wall ENDING at a corner shared with a cell does not clip that cell', () => {
    // (5,4)'s corner 5 is the SAME real vertex as (5,5)'s corner 1 and
    // (6,5)'s corner 3 (verified in hexCorner.test.ts's cornerOwners
    // coverage — three cells genuinely share this point). Corners 2 and 5
    // of a pointy-top hex are diametrically opposite (150° and 330°, 180°
    // apart), so a line between them is a full diameter of (5,4) alone —
    // it clips (5,4) itself, dead center, but its approach to the shared
    // endpoint stays entirely WITHIN (5,4)'s own hexagon the whole way,
    // so it never enters (5,5) or (6,5)'s interior even though the
    // terminal point is a corner all three cells own. This is the exact
    // case this unit exists to get right: the wall's line "ends AT" a
    // corner shared with (5,5)/(6,5), but must not clip either.
    const from: CornerRef = { cell: [5, 4], corner: 2 };
    const to: CornerRef = { cell: [5, 4], corner: 5 };
    const footprint = straightWallFootprint(from, to, GRID);
    expect(footprint).toEqual([[5, 4]]);
    expect(footprint).not.toContainEqual([5, 5]);
    expect(footprint).not.toContainEqual([6, 5]);
  });

  it('the shared-corner cells stay untouched by the movement-semantics (b) crossing check too', () => {
    const from: CornerRef = { cell: [5, 4], corner: 2 };
    const to: CornerRef = { cell: [5, 4], corner: 5 };
    // The line never reaches (5,5)/(6,5)'s shared edge with anything —
    // it terminates exactly at their mutual corner, which is a single
    // point, not a crossing of any one of their edges.
    expect(straightWallCrossedEdges(from, to, GRID)).toEqual([]);
  });

  it('a longer wall spanning several cells still clips the ones its line genuinely enters', () => {
    // A general, non-boundary-case sanity check: a multi-cell corner-
    // anchored wall behaves like the original cell-center-anchored
    // module's own "every-other-hex" finding (CONTRACT.md/TARGET-YAML.md)
    // — a line that looks like a natural single-row draw still doesn't
    // clip a contiguous run, because "same row" isn't world-horizontal on
    // this grid (hexRow's own parity correction, documented at the
    // low-level clip tests below).
    const from: CornerRef = { cell: [2, 5], corner: 0 };
    const to: CornerRef = { cell: [10, 5], corner: 3 };
    const footprint = straightWallFootprint(from, to, GRID);
    expect(footprint).toEqual([
      [4, 5],
      [6, 5],
      [8, 5],
    ]);
  });
});

describe('straightWallFootprint / straightWallCrossedEdges — door exclusion', () => {
  // TARGET-YAML.md's "Straight walls: doors" traversability semantic:
  // a door's cell is excluded from ITS OWN wallLine's footprint, as if
  // the line never clipped it — and that cell's own boundary crossings
  // then fall out of the SAME movement-semantics (b) mechanism any other
  // clear cell uses, no separate "door crossing" code needed.
  const from: CornerRef = { cell: [2, 5], corner: 0 };
  const to: CornerRef = { cell: [10, 5], corner: 3 };
  const DOOR_CELL: [number, number] = [6, 5]; // the middle footprint cell

  it('a door cell is removed from the footprint entirely', () => {
    const withoutDoor = straightWallFootprint(from, to, GRID);
    expect(withoutDoor).toContainEqual(DOOR_CELL);

    const withDoor = straightWallFootprint(from, to, GRID, [DOOR_CELL]);
    expect(withDoor).not.toContainEqual(DOOR_CELL);
    expect(withDoor).toEqual([
      [4, 5],
      [8, 5],
    ]);
  });

  it('a door cell’s own boundary crossings become blocked crossings, like any clear cell', () => {
    const crossedNoDoor = straightWallCrossedEdges(from, to, GRID);
    const doorFootprint = straightWallFootprint(from, to, GRID, [DOOR_CELL]);
    const crossedWithDoor = straightWallCrossedEdges(
      from,
      to,
      GRID,
      doorFootprint
    );
    // Opening the door surfaces exactly 4 new crossings — the door cell's
    // own edges toward its footprint-neighbor cells along the wall's
    // path (both a full step INTO the door cell and a step back OUT the
    // far side now register as real crossings, since the door cell no
    // longer counts as "already wholly blocked").
    expect(crossedWithDoor.length).toBe(crossedNoDoor.length + 4);
    const doorCellEdges = crossedWithDoor.filter(
      (e) =>
        (e.cellA[0] === DOOR_CELL[0] && e.cellA[1] === DOOR_CELL[1]) ||
        (e.cellB[0] === DOOR_CELL[0] && e.cellB[1] === DOOR_CELL[1])
    );
    expect(doorCellEdges).toHaveLength(4);
  });

  it('straightWallsFootprintSet excludes a line’s own door cells from the union', () => {
    const lines = [{ from, to, doors: [{ cell: DOOR_CELL }] }];
    const set = straightWallsFootprintSet(lines, GRID);
    expect(set.has('6,5')).toBe(false);
    expect(set.has('4,5')).toBe(true);
    expect(set.has('8,5')).toBe(true);
  });
});

describe('door placement resolution — projecting a click onto the line', () => {
  const from: CornerRef = { cell: [2, 5], corner: 0 };
  const to: CornerRef = { cell: [10, 5], corner: 3 };

  it('footprintCellAtParam maps a mid-line t to the cell whose clip interval contains it', () => {
    expect(footprintCellAtParam(from, to, GRID, 0.5)).toEqual([6, 5]);
  });

  it('wallLineDoorCellAt resolves a click point on the line to the same cell', () => {
    const a = cornerPoint(from);
    const b = cornerPoint(to);
    const midPoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    expect(wallLineDoorCellAt(from, to, GRID, midPoint)).toEqual([6, 5]);
  });

  it('projectPointToLineParam clamps to [0,1] for a click beyond either endpoint', () => {
    const a = cornerPoint(from);
    const b = cornerPoint(to);
    const beyondA = { x: a.x - 1000, y: a.y - 1000 };
    const beyondB = { x: b.x + 1000, y: b.y + 1000 };
    expect(projectPointToLineParam(a, b, beyondA)).toBe(0);
    expect(projectPointToLineParam(a, b, beyondB)).toBe(1);
  });
});

describe('isValidDoorCell — a door must reference a real (raw, door-blind) footprint cell', () => {
  const from: CornerRef = { cell: [2, 5], corner: 0 };
  const to: CornerRef = { cell: [10, 5], corner: 3 };

  it('accepts a cell the wall’s own line genuinely clips', () => {
    expect(isValidDoorCell(from, to, GRID, [6, 5])).toBe(true);
  });

  it('rejects a cell the line never clips at all', () => {
    expect(isValidDoorCell(from, to, GRID, [5, 5])).toBe(false);
  });
});

describe('corner/L continuity — two lines sharing a corner still touch with no gap', () => {
  it('both segments resolve their shared endpoint to the identical world point', () => {
    // The corner-lattice analog of the original cell-center "L corner"
    // test: two wallLines drawn from opposite sides of the SAME shared
    // vertex both anchor there exactly, no special-case join logic
    // needed — see hexCorner.ts's `sameCorner`/`canonicalCorner` for why
    // this holds even when the two lines address the vertex via
    // different (but equivalent) owner cells.
    const shared: CornerRef = { cell: [5, 5], corner: 1 };
    const sharedViaOtherOwner: CornerRef = { cell: [6, 5], corner: 3 };
    const seg1End: CornerRef = { cell: [2, 5], corner: 0 };
    const seg2End: CornerRef = { cell: [8, 2], corner: 4 };

    expect(cornerPoint(shared)).toEqual(cornerPoint(sharedViaOtherOwner));

    const fp1 = straightWallFootprint(seg1End, shared, GRID);
    const fp2 = straightWallFootprint(sharedViaOtherOwner, seg2End, GRID);
    // Both segments genuinely reach into the shared vertex's own
    // neighborhood — sanity that this is a real, non-degenerate pair of
    // walls, not just an identity check on `cornerPoint` alone.
    expect(fp1.length).toBeGreaterThan(0);
    expect(fp2.length).toBeGreaterThan(0);
  });
});

/** A unit vector (scaled by `mag`) pointed `deg` degrees from the
 * horizontal axis — the same `atan2`/degrees convention
 * `nearestWallAngleFamily`/`snapStraightEndpoint` use internally, so a
 * test can assert against an exact angle rather than a hand-picked
 * dx/dy pair. */
function vectorAtAngle(deg: number, mag = 100): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [Math.cos(rad) * mag, Math.sin(rad) * mag];
}

describe('nearestWallAngleFamily — the 3 real hex-edge orientations', () => {
  // Kirk's live feedback that prompted this: "aaahhh my line was angled
  // ever so slightly" — an unintentionally off-axis wall clipped a halo
  // of cells at their points. The fix: snap to a REAL hex-edge family
  // (30°/90°/150°, see straightWallGeometry.ts's own header comment) when
  // the raw drag is close to one, and stay free otherwise — never force
  // a family the drag wasn't actually aimed at.

  it('picks 90° (vertical) for a drag pointed straight up or down', () => {
    expect(nearestWallAngleFamily(0, -50)).toBe(90);
    expect(nearestWallAngleFamily(0, 50)).toBe(90);
  });

  it('picks 30°/150° for a drag along either diagonal hex-edge family', () => {
    const [dx30, dy30] = vectorAtAngle(30);
    expect(nearestWallAngleFamily(dx30, dy30)).toBe(30);
    const [dx150, dy150] = vectorAtAngle(150);
    expect(nearestWallAngleFamily(dx150, dy150)).toBe(150);
  });

  it('is direction-agnostic — the reverse of a family vector still matches the same family', () => {
    const [dx, dy] = vectorAtAngle(30);
    expect(nearestWallAngleFamily(-dx, -dy)).toBe(30);
  });

  it('snaps just inside the tolerance boundary', () => {
    const [dx, dy] = vectorAtAngle(90 + WALL_ANGLE_SNAP_TOLERANCE_DEG - 0.1);
    expect(nearestWallAngleFamily(dx, dy)).toBe(90);
  });

  it('does not snap just outside the tolerance boundary', () => {
    const [dx, dy] = vectorAtAngle(90 + WALL_ANGLE_SNAP_TOLERANCE_DEG + 0.1);
    expect(nearestWallAngleFamily(dx, dy)).toBeNull();
  });

  it('a horizontal drag — equidistant from 30° and 150°, both ~30° away — stays free', () => {
    // This is the module's own former "horizontal" axis, no longer a
    // default snap target (see this module's header comment for why 0°
    // matches no real hex edge at all).
    expect(nearestWallAngleFamily(50, 0)).toBeNull();
  });

  it('a zero-length vector has no defined angle and stays free', () => {
    expect(nearestWallAngleFamily(0, 0)).toBeNull();
  });
});

describe('snapStraightEndpoint — corner-lattice axis lock', () => {
  it('holds worldX steady in vertical (90°) mode, snapping to a real corner', () => {
    const fromCorner: CornerRef = { cell: [4, 4], corner: 0 };
    const fromPoint = cornerPoint(fromCorner);
    // A pointer well above and just off to the side — vertical lock
    // should still find a corner whose world X matches fromPoint's own
    // exactly (a real corner column exists here, unlike the old cell-
    // center module's coarser search, which could only match at
    // specific from/to cell pairs).
    const pointer = { x: fromPoint.x + 2, y: fromPoint.y - 80 };
    const snapped = snapStraightEndpoint(fromCorner, pointer, 90, GRID);
    expect(cornerPoint(snapped).x).toBeCloseTo(fromPoint.x, 6);
  });

  it('stays within the grid bounds', () => {
    const fromCorner: CornerRef = { cell: [0, 0], corner: 0 };
    const pointer = { x: -500, y: -500 };
    const snapped = snapStraightEndpoint(fromCorner, pointer, 90, GRID);
    expect(snapped.cell[0]).toBeGreaterThanOrEqual(0);
    expect(snapped.cell[1]).toBeGreaterThanOrEqual(0);
    expect(snapped.cell[0]).toBeLessThan(GRID.width);
    expect(snapped.cell[1]).toBeLessThan(GRID.height);
  });

  it('a null axis (the modifier-key free-angle bypass) is the literal nearest corner, unconstrained', () => {
    const fromCorner: CornerRef = { cell: [4, 4], corner: 0 };
    const fromPoint = cornerPoint(fromCorner);
    // Well off any of the 3 families relative to fromPoint — a locked
    // snap here would pull sideways toward the nearest family; axis=null
    // (what CreationBoard.tsx passes while the free-angle modifier is
    // held) must not do that.
    const pointer = { x: fromPoint.x + 40, y: fromPoint.y - 5 };
    expect(snapStraightEndpoint(fromCorner, pointer, null, GRID)).toEqual(
      nearestCorner(pointer, GRID)
    );
  });
});

// --- Low-level clip math: unchanged by corner anchoring (these operate
// on raw world-space CellPos points, never on cell/corner addressing at
// all), kept as direct evidence the underlying epsilon rule still holds
// exactly as documented. ---

describe('clipSegmentToShrunkHex — the touch-vs-clip epsilon rule directly', () => {
  it('a segment passing well inside the hex clips it', () => {
    const center = cellCenter(5, 5);
    const result = clipSegmentToShrunkHex(
      { x: center.x - 5, y: center.y },
      { x: center.x + 5, y: center.y },
      5,
      5
    );
    expect(result).not.toBeNull();
  });

  it('a segment that only touches a single corner does not clip', () => {
    const center = cellCenter(5, 5);
    const result = clipSegmentToShrunkHex(
      { x: center.x - 100, y: center.y },
      { x: center.x - 90, y: center.y },
      5,
      5
    );
    expect(result).toBeNull();
  });

  it('a segment collinear with one hex edge does not clip either adjacent cell', () => {
    const hexAt55 = cellCenter(5, 5);
    const halfFlatWidth = (BOARD_HEX_SIZE * Math.sqrt(3)) / 2;
    const a = { x: hexAt55.x + halfFlatWidth, y: hexAt55.y - 30 };
    const b = { x: hexAt55.x + halfFlatWidth, y: hexAt55.y + 30 };
    expect(isCellClipped(a, b, 5, 5)).toBe(false);
  });

  it('nudging that same segment 1 board unit INTO the hex clips it', () => {
    const hexAt55 = cellCenter(5, 5);
    const halfFlatWidth = (BOARD_HEX_SIZE * Math.sqrt(3)) / 2;
    const a = { x: hexAt55.x + halfFlatWidth - 1, y: hexAt55.y - 30 };
    const b = { x: hexAt55.x + halfFlatWidth - 1, y: hexAt55.y + 30 };
    expect(isCellClipped(a, b, 5, 5)).toBe(true);
  });
});

// rpg-project#169's "drawn walls become real" unit — wallLines->edges
// projection, the send-time seam that lets a drawn straight wall become
// wire-real `walls:` geometry. Reuses the exact fixtures the door-
// exclusion/footprint describe blocks above already established, rather
// than inventing new ones.
describe('projectWallLineToEdges', () => {
  it('a single isolated footprint cell seals all 6 of its real neighbor edges, solid, no doors', () => {
    // The same "wall ENDING at a corner" diameter fixture from above:
    // footprint is exactly [[5, 4]], well inside the 20x30 grid on every
    // side, so all 6 neighbor directions resolve to real, in-grid cells.
    const from: CornerRef = { cell: [5, 4], corner: 2 };
    const to: CornerRef = { cell: [5, 4], corner: 5 };
    const result = projectWallLineToEdges({ from, to, doors: [] }, GRID);
    expect(result.rimEdgeCount).toBe(0);
    expect(result.edges).toHaveLength(6);
    for (const edge of result.edges) {
      expect(edge.kind).toBe('solid');
      const touchesSealedCell =
        (edge.from[0] === 5 && edge.from[1] === 4) ||
        (edge.to[0] === 5 && edge.to[1] === 4);
      expect(touchesSealedCell).toBe(true);
    }
    // Every edge is a distinct cell pair — no duplicate direction landed
    // on the same neighbor twice.
    const keys = new Set(
      result.edges.map((e) => `${e.from.join(',')}|${e.to.join(',')}`)
    );
    expect(keys.size).toBe(6);
  });

  it('every real neighbor direction is either a sealed edge or a counted rim edge — never silently dropped', () => {
    // Same diameter fixture, but anchored at column 0 — some of the
    // isolated footprint cell's 6 neighbor directions fall off the
    // canvas grid entirely (no cell to pair with).
    const from: CornerRef = { cell: [0, 4], corner: 2 };
    const to: CornerRef = { cell: [0, 4], corner: 5 };
    const result = projectWallLineToEdges({ from, to, doors: [] }, GRID);
    expect(result.rimEdgeCount).toBeGreaterThan(0);
    // The 6 real neighbor directions are mutually exclusive with rim —
    // every direction contributes to exactly one of the two counts, so
    // they always sum to 6 for an isolated single-cell footprint.
    expect(result.edges.length + result.rimEdgeCount).toBe(6);
    for (const edge of result.edges) expect(edge.kind).toBe('solid');
  });

  // A genuinely VERTICAL line (this module's own header comment: "a
  // vertical line through a column of hex CENTERS instead clips every
  // hex in that column full-width") clips a CONTIGUOUS run of cells —
  // unlike the every-other-hex row fixture above, consecutive cells in
  // this run ARE real hex neighbors of each other (verified directly,
  // not assumed, while building this test), which is what a door in the
  // MIDDLE of an ordinary wall run actually needs to exercise.
  const verticalFrom: CornerRef = { cell: [5, 3], corner: 0 };
  const verticalTo: CornerRef = { cell: [5, 9], corner: 0 };
  const MID_DOOR_CELL: [number, number] = [6, 6]; // footprint is [6,4]..[6,9]

  const sameCell = (a: [number, number], b: [number, number]) =>
    a[0] === b[0] && a[1] === b[1];
  const edgeBetween = (
    edges: readonly {
      from: [number, number];
      to: [number, number];
      kind: string;
    }[],
    a: [number, number],
    b: [number, number]
  ) =>
    edges.find(
      (e) =>
        (sameCell(e.from, a) && sameCell(e.to, b)) ||
        (sameCell(e.to, a) && sameCell(e.from, b))
    );

  it('a doors: cell projects its flanking footprint-neighbor edges as kind: door, never solid and never a bare gap', () => {
    const result = projectWallLineToEdges(
      { from: verticalFrom, to: verticalTo, doors: [{ cell: MID_DOOR_CELL }] },
      GRID
    );
    // [6,6]'s own flanking footprint neighbors along the wall run are
    // [6,5] and [6,7] — both of those edges must read as a doorway.
    expect(edgeBetween(result.edges, MID_DOOR_CELL, [6, 5])?.kind).toBe('door');
    expect(edgeBetween(result.edges, MID_DOOR_CELL, [6, 7])?.kind).toBe('door');
  });

  it('a door only reverses ITS OWN line’s footprint claim — an independent mechanism-(b) grazing edge on the same cell stays solid', () => {
    // TARGET-YAML.md's own rule, verbatim: "something else... can still
    // legitimately block it independently." [6,6] is a door cell, but the
    // line's own grazing crossing toward [5,5] (mechanism (b), a
    // both-clear-cells test wholly separate from the door's flanking
    // edges above) is untouched by the door exclusion — still solid.
    const result = projectWallLineToEdges(
      { from: verticalFrom, to: verticalTo, doors: [{ cell: MID_DOOR_CELL }] },
      GRID
    );
    const graze = edgeBetween(result.edges, MID_DOOR_CELL, [5, 5]);
    expect(graze?.kind).toBe('solid');
  });

  it('mechanism (a) and (b) edges merge into one deduped set — no duplicate cell pairs', () => {
    const from: CornerRef = { cell: [2, 5], corner: 0 };
    const to: CornerRef = { cell: [10, 5], corner: 3 };
    const result = projectWallLineToEdges({ from, to, doors: [] }, GRID);
    const keys = result.edges.map(
      (e) => `${e.from.join(',')}|${e.to.join(',')}`
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('rule 5 regression guard: the wire projection is UNCHANGED by coverage — a low-coverage cell still gets sealed', () => {
    // Kirk's live-design follow-up, rule 5, verbatim: "traversability
    // relaxation does NOT change Half A's emitted walls — projected
    // walls: edges = the line's crossings, independent of cell
    // coverage." (17,20) below has coverage ~1.67% (see the
    // "hexCoverageFraction" describe block's own bench) — genuinely
    // standable under STANDABLE_COVERAGE_THRESHOLD — but the WIRE
    // projection must still seal it exactly as it would any other
    // footprint cell, since the server has no notion of coverage at all.
    const from: CornerRef = canonicalCorner({ cell: [17, 20], corner: 0 });
    const to: CornerRef = canonicalCorner({ cell: [24, 18], corner: 0 });
    const LOW_COVERAGE_CELL: [number, number] = [19, 19];
    expect(hexCoverageFraction(from, to, ...LOW_COVERAGE_CELL)).toBeLessThan(
      STANDABLE_COVERAGE_THRESHOLD
    );
    const result = projectWallLineToEdges({ from, to, doors: [] }, GRID);
    const sealedEdges = result.edges.filter(
      (e) =>
        (e.from[0] === LOW_COVERAGE_CELL[0] &&
          e.from[1] === LOW_COVERAGE_CELL[1]) ||
        (e.to[0] === LOW_COVERAGE_CELL[0] && e.to[1] === LOW_COVERAGE_CELL[1])
    );
    // Mechanism (a) seals every real neighbor direction of a footprint
    // cell regardless of how little of it the line actually clips.
    expect(sealedEdges.length).toBeGreaterThan(0);
    for (const e of sealedEdges) expect(e.kind).toBe('solid');
  });
});

// Coverage-based standability (Kirk's live-design follow-up to "drawn
// walls become real," 2026-08-07) — every fixture value here is
// independently verified by this describe block itself (not eyeballed),
// and doubles as the exact bench `STANDABLE_COVERAGE_THRESHOLD`'s own
// doc comment describes for a future real Walk-mode visual pass.
describe('hexCoverageFraction — measurement bench', () => {
  it('a corner-to-corner diagonal two apart (skipping one vertex) always cuts off exactly 1/6 of the hex, by regular-hexagon symmetry', () => {
    // Real, load-bearing reference point: the smallest "clean" symmetric
    // corner cut reachable via a same-cell corner-to-corner chord —
    // STANDABLE_COVERAGE_THRESHOLD is deliberately set below this value,
    // keeping it blocked.
    const from: CornerRef = { cell: [8, 8], corner: 0 };
    const to: CornerRef = { cell: [8, 8], corner: 2 };
    const cov = hexCoverageFraction(from, to, 8, 8);
    expect(cov).toBeCloseTo(1 / 6, 5);
  });

  it('a corner-to-opposite-corner diameter splits the hex exactly in half', () => {
    const from: CornerRef = { cell: [8, 8], corner: 0 };
    const to: CornerRef = { cell: [8, 8], corner: 3 };
    const cov = hexCoverageFraction(from, to, 8, 8);
    expect(cov).toBeCloseTo(0.5, 5);
  });

  it('the two sub-polygons a line splits a hex into always sum to the hex’s own full area', () => {
    // Verified structurally, not just for one fixture: for ANY line that
    // genuinely clips the cell, the smaller + larger fractions this
    // function's own `min(sideArea, otherSideArea)` computation implies
    // must together account for the whole hex — a convex polygon split
    // by one line partitions exactly, modulo the zero-area shared
    // boundary (this test's own justification for why `otherSideArea =
    // totalArea - sideArea` is used instead of a second clip call).
    const from: CornerRef = canonicalCorner({ cell: [17, 20], corner: 0 });
    const to: CornerRef = canonicalCorner({ cell: [24, 18], corner: 0 });
    const footprint = straightWallFootprint(from, to, GRID);
    expect(footprint.length).toBeGreaterThan(0);
    for (const [col, row] of footprint) {
      const cov = hexCoverageFraction(from, to, col, row);
      expect(cov).toBeGreaterThan(0);
      expect(cov).toBeLessThanOrEqual(0.5); // always the SMALLER side
    }
  });

  it('a real bench line produces a wide, independently-verified spread of coverage values, low to high', () => {
    // The exact two-line bench STANDABLE_COVERAGE_THRESHOLD's own doc
    // comment names as reproducible for a future Walk-mode visual pass —
    // this test is that reproducibility, executable rather than just
    // described. A wider grid than this file's own default `GRID` —
    // line B's own cells reach column 44, which `GRID`'s width: 20 would
    // clamp and silently change the footprint.
    const BENCH_GRID = { width: 50, height: 30 };
    const lineA = {
      from: canonicalCorner({ cell: [16, 21], corner: 0 }),
      to: canonicalCorner({ cell: [22, 20], corner: 0 }),
    };
    const lineB = {
      from: canonicalCorner({ cell: [37, 20], corner: 0 }),
      to: canonicalCorner({ cell: [44, 18], corner: 0 }),
    };
    const covA = straightWallFootprint(lineA.from, lineA.to, BENCH_GRID).map(
      ([c, r]) => hexCoverageFraction(lineA.from, lineA.to, c, r)
    );
    const covB = straightWallFootprint(lineB.from, lineB.to, BENCH_GRID).map(
      ([c, r]) => hexCoverageFraction(lineB.from, lineB.to, c, r)
    );
    const all = [...covA, ...covB].sort((a, b) => a - b);
    // A real spread from well under the threshold to well above it —
    // the bench actually exercises the standable/blocked boundary, not
    // just one tier. Smallest value is line B's own ~1.67% cell.
    expect(all[0]).toBeLessThan(0.02);
    expect(all[all.length - 1]).toBeGreaterThan(0.4);
    expect(all.some((c) => c < STANDABLE_COVERAGE_THRESHOLD)).toBe(true);
    expect(all.some((c) => c >= STANDABLE_COVERAGE_THRESHOLD)).toBe(true);
  });
});

describe('straightWallFootprintCoverage / straightWallsFootprintCoverage / standableFootprintKeys', () => {
  it('straightWallFootprintCoverage returns exactly the footprint cell set, each with its own coverage', () => {
    const from: CornerRef = { cell: [5, 4], corner: 2 };
    const to: CornerRef = { cell: [5, 4], corner: 5 };
    const coverage = straightWallFootprintCoverage(from, to, GRID);
    expect([...coverage.keys()]).toEqual(['5,4']);
    expect(coverage.get('5,4')).toBeGreaterThan(0);
  });

  it('a door cell is excluded from the coverage map exactly like the footprint (door exclusion happens before coverage is ever computed for it)', () => {
    const from: CornerRef = { cell: [2, 5], corner: 0 };
    const to: CornerRef = { cell: [10, 5], corner: 3 };
    const DOOR_CELL: [number, number] = [6, 5];
    const coverage = straightWallFootprintCoverage(from, to, GRID, [DOOR_CELL]);
    expect(coverage.has('6,5')).toBe(false);
    expect(coverage.has('4,5')).toBe(true);
  });

  it('straightWallsFootprintCoverage takes the MAX coverage when two lines both touch the same cell', () => {
    // Two lines authored to both clip (8,8) at different depths — the
    // shallower corner-cut (1/6) and the deep diameter (1/2). The
    // documented simplification: max wins, not a true union of areas.
    const shallow = {
      from: { cell: [8, 8], corner: 0 } as CornerRef,
      to: { cell: [8, 8], corner: 2 } as CornerRef,
    };
    const deep = {
      from: { cell: [8, 8], corner: 0 } as CornerRef,
      to: { cell: [8, 8], corner: 3 } as CornerRef,
    };
    const coverage = straightWallsFootprintCoverage([shallow, deep], GRID);
    expect(coverage.get('8,8')).toBeCloseTo(0.5, 5);
  });

  it('standableFootprintKeys filters to cells at/above the threshold, default and explicit', () => {
    const coverage = new Map<string, number>([
      ['1,1', 0.02],
      ['2,2', 0.09],
      ['3,3', 0.1],
      ['4,4', 0.5],
    ]);
    expect([...standableFootprintKeys(coverage)].sort()).toEqual([
      '3,3',
      '4,4',
    ]);
    expect([...standableFootprintKeys(coverage, 0.05)].sort()).toEqual([
      '2,2',
      '3,3',
      '4,4',
    ]);
  });
});
