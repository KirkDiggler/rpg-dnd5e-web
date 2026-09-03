import { describe, expect, it } from 'vitest';
import {
  addWall,
  emptyDungeon,
  paintCell,
  type DungeonDoc,
} from './dungeonYaml';
import { referenceTombDoc, tombPosition } from './fixtures/referenceTomb';
import {
  latticeKey,
  latticeKind,
  latticeOf,
  positionAt,
  POSITIONS,
  type Lattice,
  type PositionRef,
} from './hexGeometry';
import { fromOffset, type Axial } from './hexOffset';
import {
  boundaryWalls,
  doorIsWindow,
  doorTargetsOf,
  wallEndKeys,
  wallRaysFrom,
} from './wallPicker';

/** A dungeon with one solid block of room, big enough that a ray from
 * the middle is trimmed by distance rather than by the floor's edge. */
function block(cols: number, rows: number): DungeonDoc {
  let doc = emptyDungeon('pointy', 'opaque');
  doc = { ...doc, regions: [{ ...doc.regions[0], cells: [] }] };
  const id = doc.regions[0].id;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      doc = paintCell(doc, id, fromOffset('pointy', [col, row]));
    }
  }
  return doc;
}

const seat = (cell: Axial, offset: [number, number]): PositionRef => ({
  cell,
  offset: offset as PositionRef['offset'],
});

const mid = () => fromOffset('pointy', [6, 6]);

describe('the picker offers exactly the design’s rays and ends', () => {
  const doc = block(14, 14);
  const centre = mid();

  // Three starts, one per kind the design names (plan §2.4's own test
  // list): a SLANTED midpoint, a FLAT-SIDE midpoint, and the CENTRE.
  // "Slanted" and "flat-side" are relative to a direction family, not
  // intrinsic — every side midpoint is the image of every other under a
  // 60° turn — so the two midpoint cases below differ in the lattice
  // parity that decides which of their rays run through centres, which
  // is the thing the picker has to get right.
  const slanted = seat(centre, [0.25, -0.375]);
  const flatSide = seat(centre, [0.5, 0]);
  const middle = seat(centre, [0, 0]);

  it('draws all twelve rays from a slanted midpoint, eight thin and four thick', () => {
    const rays = wallRaysFrom(doc, slanted);
    expect(rays).toHaveLength(12);
    expect(rays.map((r) => r.degrees).sort((a, b) => a - b)).toEqual([
      0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330,
    ]);
    // Four LINES thin and two thick through any side midpoint (F17,
    // and the same count at every one of the six by the grid's own
    // 60° symmetry) — twice as many rays, since a line is two.
    expect(rays.filter((r) => !r.thick)).toHaveLength(8);
    expect(rays.filter((r) => r.thick)).toHaveLength(4);
  });

  it('draws all twelve rays from a flat-side midpoint, eight thin and four thick', () => {
    const rays = wallRaysFrom(doc, flatSide);
    expect(rays).toHaveLength(12);
    expect(rays.filter((r) => !r.thick)).toHaveLength(8);
    expect(rays.filter((r) => r.thick)).toHaveLength(4);
    // F17 names WHICH: the two thick lines through a flat-side midpoint
    // are the ones square to it and along its own row.
    expect(
      rays
        .filter((r) => r.thick)
        .map((r) => r.degrees)
        .sort((a, b) => a - b)
    ).toEqual([0, 90, 180, 270]);
  });

  it('draws twelve THICK rays from a centre and no thin one (F15)', () => {
    const rays = wallRaysFrom(doc, middle);
    expect(rays).toHaveLength(12);
    expect(rays.every((r) => r.thick)).toBe(true);
  });

  it('never offers a thin ray an end that is a centre (A12: that is a picker defect)', () => {
    for (const start of [slanted, flatSide]) {
      for (const ray of wallRaysFrom(doc, start)) {
        if (ray.thick) continue;
        for (const end of ray.ends) {
          expect(latticeKind(end.lattice)).toBe('side');
          expect(end.sealed).toEqual([]);
        }
      }
    }
  });

  it('says what each end costs: a thick ray seals the cells its line halves, a thin one nothing', () => {
    const rays = wallRaysFrom(doc, middle);
    const east = rays.find((r) => r.degrees === 0)!;
    // Every line through a centre is thick, and the cells it seals are
    // the ones whose centres it runs through — one more per step along
    // the row's own centre line.
    expect(east.thick).toBe(true);
    expect(east.ends[0].sealed.length).toBeGreaterThan(0);
    for (let i = 1; i < east.ends.length; i += 1) {
      expect(east.ends[i].sealed.length).toBeGreaterThanOrEqual(
        east.ends[i - 1].sealed.length
      );
    }
  });

  it('trims every ray at the floor: a start on the edge is offered nothing pointing off it', () => {
    const small = block(3, 3);
    // The WEST side midpoint of the north-west cell. West is void.
    const edge = seat(fromOffset('pointy', [0, 0]), [-0.5, 0]);
    const rays = wallRaysFrom(small, edge);
    expect(rays.length).toBeGreaterThan(0);
    expect(rays.length).toBeLessThan(12);
    // Nothing runs due west, out over the void (C2). A wall that only
    // TOUCHES the floor at its start stands nowhere.
    expect(rays.map((r) => r.degrees)).not.toContain(180);
    for (const ray of rays) expect(ray.ends.length).toBeGreaterThan(0);
  });

  it('marks an end another wall already ends at, which is how a corner is closed', () => {
    // Both ends come from the picker itself: the first wall runs due
    // east from the start along its own offered ray.
    const eastRay = wallRaysFrom(doc, slanted).find((r) => r.degrees === 0)!;
    const far = eastRay.ends[2];
    const withWall = addWall(doc, slanted, far.position);
    expect(withWall.walls).toHaveLength(1);
    expect(
      wallEndKeys(withWall).has(latticeKey(latticeOf('pointy', slanted)))
    ).toBe(true);
    // From the far end, the wall's OTHER end is offered back as a join.
    const joining = wallRaysFrom(withWall, far.position)
      .flatMap((r) => r.ends)
      .filter((e) => e.joins);
    expect(joining.map((e) => latticeKey(e.lattice))).toContain(
      latticeKey(latticeOf('pointy', slanted))
    );
  });

  it('writes IDENTICAL positions on both walls of a corner (A12)', () => {
    // Wall one runs east from the shared position; wall two turns off
    // it at 60°. The second is committed with the position the PICKER
    // handed back, which is the whole of snapping (§2.7, F5).
    const east = wallRaysFrom(doc, slanted).find((r) => r.degrees === 0)!;
    let joined = addWall(doc, slanted, east.ends[2].position);
    const turn = wallRaysFrom(joined, east.ends[2].position).find(
      (r) => r.degrees === 60
    )!;
    const offered = wallRaysFrom(joined, turn.ends[1].position)
      .flatMap((r) => r.ends)
      .find((e) => e.joins && latticeKind(e.lattice) === 'side');
    expect(offered).toBeDefined();
    joined = addWall(joined, turn.ends[1].position, offered!.position);
    expect(joined.walls).toHaveLength(2);
    // The two walls carry the same END, spelled identically — not two
    // spellings of one point, and not two nearby points.
    expect(joined.walls[1].end).toEqual(east.ends[2].position);
    expect(latticeOf('pointy', joined.walls[0].end)).toEqual(
      latticeOf('pointy', joined.walls[1].end)
    );
    expect(joined.walls[0].end).toEqual(joined.walls[1].end);
  });
});

describe('doors are positions on walls (design §2.8)', () => {
  it('offers only the side midpoints the walls pass through, never a centre', () => {
    const doc = referenceTombDoc();
    const targets = doorTargetsOf(doc);
    expect(targets.length).toBeGreaterThan(0);
    for (const t of targets) expect(latticeKind(t.lattice)).toBe('side');
    // The tomb's two doors are among them, and marked taken.
    expect(targets.filter((t) => t.taken)).toHaveLength(2);
  });

  it('offers nothing on a document with no walls', () => {
    expect(doorTargetsOf(block(4, 4))).toEqual([]);
  });

  it('calls a door between two sealed cells a window rather than refusing it (F11a)', () => {
    // A thick line down a row seals every cell it halves; a door on one
    // of its side midpoints opens a crossing nobody can use. Legal —
    // sight passes the gap — and the picker labels it.
    let doc = block(9, 3);
    const row = (col: number) => fromOffset('pointy', [col, 1]);
    doc = addWall(doc, seat(row(1), [0, 0]), seat(row(7), [0, 0]));
    const target = doorTargetsOf(doc).find((t) =>
      doorIsWindow(doc, t.position)
    );
    expect(target).toBeDefined();
  });
});

describe('wall this boundary (design §2.9)', () => {
  it('offers a thin line along a room edge and a thick one beside it', () => {
    const doc = referenceTombDoc();
    const entrance = doc.regions[0];
    // A crossing straight out of the entrance's east edge.
    const inside = fromOffset('pointy', [5, 3]);
    const outside = fromOffset('pointy', [6, 3]);
    const offer = boundaryWalls(doc, [inside, outside], entrance.id);
    expect(offer).not.toBeNull();
    expect(offer!.thin.thick).toBe(false);
    expect(offer!.thin.sealed).toEqual([]);
    expect(offer!.thick.thick).toBe(true);
    // The thick line runs through the outside cells' centres, so it
    // seals out there and leaves the room's own cells whole.
    expect(offer!.thick.sealed.length).toBeGreaterThan(0);
    for (const cell of offer!.thick.sealed) {
      expect(entrance.cells.some((c) => c.q === cell.q && c.r === cell.r)).toBe(
        false
      );
    }
  });

  it('answers null for a crossing that is not that room’s boundary', () => {
    const doc = referenceTombDoc();
    const inner = fromOffset('pointy', [2, 3]);
    const alsoInner = fromOffset('pointy', [3, 3]);
    expect(
      boundaryWalls(doc, [inner, alsoInner], doc.regions[0].id)
    ).toBeNull();
  });
});

describe('the tomb’s own seam, as the picker sees it', () => {
  it('offers the seam line the fixture authored, from its own start', () => {
    const doc = referenceTombDoc();
    const start = doc.walls[0].start;
    const end = doc.walls[0].end;
    const target: Lattice = latticeOf('pointy', end);
    const offered = wallRaysFrom(doc, start, { maxEnds: 20 })
      .flatMap((r) => r.ends)
      .find((e) => latticeKey(e.lattice) === latticeKey(target));
    expect(offered).toBeDefined();
    // And it costs nothing — the seam is a thin quarter line.
    expect(offered!.sealed).toEqual([]);
    expect(positionAt('pointy', target)).toEqual(tombPosition(target));
  });
});

// The seven offsets are the picker's whole vocabulary; if this list ever
// grows, every count above is wrong and should be re-derived, not
// patched.
describe('the vocabulary', () => {
  it('is seven positions per orientation and nothing else', () => {
    expect(POSITIONS.pointy).toHaveLength(7);
    expect(POSITIONS.flat).toHaveLength(7);
  });
});
