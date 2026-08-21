/**
 * atlasPath tests — the edge-aware graph search a click builds a
 * `MoveRequest.path` from. Checked against small hand-built fixtures for
 * the specific rules (`ADJACENCY IS NOT PERMISSION`, doorway punch-through,
 * prop blocking) and against the real 224-cell reference-tomb fixture
 * (same shape `atlasWallRuns.test.ts` uses) for an end-to-end route
 * crossing a real doorway.
 */
import { describe, expect, it } from 'vitest';
import referenceTombCells from '../../concepts/session-tomb/referenceTombCells.json';
import { buildAtlasPathIndex, edgePassable, findAtlasPath } from './atlasPath';
import { positionToCube } from './positionBridge';

const pos = (x: number, y: number) => ({ x, y }) as never;

/** A minimal 2x1 strip: two adjacent floor cells, no boundaries/doorways/
 * props — the "open floor" baseline every other fixture below modifies. */
function openPairAtlas() {
  return {
    cells: [pos(0, 0), pos(1, 0)],
    boundaries: [],
    doorways: [],
    props: [],
  };
}

describe('buildAtlasPathIndex + edgePassable', () => {
  it('two floor cells with no declared boundary are open floor — passable', () => {
    const index = buildAtlasPathIndex(openPairAtlas());
    expect(
      edgePassable(index, positionToCube(pos(0, 0)), positionToCube(pos(1, 0)))
    ).toBe(true);
  });

  it('a movement-blocking boundary with no doorway makes the edge impassable', () => {
    const index = buildAtlasPathIndex({
      cells: [pos(0, 0), pos(1, 0)],
      boundaries: [
        {
          from: pos(0, 0),
          to: pos(1, 0),
          blocksMovement: true,
          blocksLineOfSight: true,
        },
      ],
      doorways: [],
      props: [],
    } as never);
    expect(
      edgePassable(index, positionToCube(pos(0, 0)), positionToCube(pos(1, 0)))
    ).toBe(false);
  });

  it('a boundary that does not block movement (sight-only) leaves the edge open', () => {
    const index = buildAtlasPathIndex({
      cells: [pos(0, 0), pos(1, 0)],
      boundaries: [
        {
          from: pos(0, 0),
          to: pos(1, 0),
          blocksMovement: false,
          blocksLineOfSight: true,
        },
      ],
      doorways: [],
      props: [],
    } as never);
    expect(
      edgePassable(index, positionToCube(pos(0, 0)), positionToCube(pos(1, 0)))
    ).toBe(true);
  });

  it('a doorway punches through a movement-blocking boundary on the same pair', () => {
    const index = buildAtlasPathIndex({
      cells: [pos(0, 0), pos(1, 0)],
      boundaries: [
        {
          from: pos(0, 0),
          to: pos(1, 0),
          blocksMovement: true,
          blocksLineOfSight: true,
        },
      ],
      doorways: [{ connection: 'a-b', from: pos(0, 0), to: pos(1, 0) }],
      props: [],
    } as never);
    expect(
      edgePassable(index, positionToCube(pos(0, 0)), positionToCube(pos(1, 0)))
    ).toBe(true);
  });

  it('a movement-blocking prop closes the destination cell even with no boundary at all', () => {
    const index = buildAtlasPathIndex({
      cells: [pos(0, 0), pos(1, 0)],
      boundaries: [],
      doorways: [],
      props: [
        {
          ref: 'sarcophagus',
          at: pos(1, 0),
          blocksMovement: true,
          blocksLineOfSight: false,
        },
      ],
    } as never);
    expect(
      edgePassable(index, positionToCube(pos(0, 0)), positionToCube(pos(1, 0)))
    ).toBe(false);
  });

  it('a prop that does not block movement leaves the cell enterable', () => {
    const index = buildAtlasPathIndex({
      cells: [pos(0, 0), pos(1, 0)],
      boundaries: [],
      doorways: [],
      props: [
        {
          ref: 'bones',
          at: pos(1, 0),
          blocksMovement: false,
          blocksLineOfSight: false,
        },
      ],
    } as never);
    expect(
      edgePassable(index, positionToCube(pos(0, 0)), positionToCube(pos(1, 0)))
    ).toBe(true);
  });

  it('an edge where either endpoint is off the floor mask is never passable', () => {
    const index = buildAtlasPathIndex(openPairAtlas());
    expect(
      edgePassable(index, positionToCube(pos(0, 0)), positionToCube(pos(5, 5)))
    ).toBe(false);
  });
});

describe('findAtlasPath — small fixtures', () => {
  it('returns [] when start equals goal (already there)', () => {
    const index = buildAtlasPathIndex(openPairAtlas());
    const start = positionToCube(pos(0, 0));
    expect(findAtlasPath(index, start, start)).toEqual([]);
  });

  it('returns [] when the goal is off the floor mask', () => {
    const index = buildAtlasPathIndex(openPairAtlas());
    expect(
      findAtlasPath(index, positionToCube(pos(0, 0)), positionToCube(pos(9, 9)))
    ).toEqual([]);
  });

  it('finds the direct hop across open floor, including both endpoints', () => {
    const index = buildAtlasPathIndex(openPairAtlas());
    const path = findAtlasPath(
      index,
      positionToCube(pos(0, 0)),
      positionToCube(pos(1, 0))
    );
    expect(path).toEqual([
      positionToCube(pos(0, 0)),
      positionToCube(pos(1, 0)),
    ]);
  });

  it('returns [] when the only route is blocked and no doorway exists (two isolated cells)', () => {
    const index = buildAtlasPathIndex({
      cells: [pos(0, 0), pos(1, 0)],
      boundaries: [
        {
          from: pos(0, 0),
          to: pos(1, 0),
          blocksMovement: true,
          blocksLineOfSight: true,
        },
      ],
      doorways: [],
      props: [],
    } as never);
    expect(
      findAtlasPath(index, positionToCube(pos(0, 0)), positionToCube(pos(1, 0)))
    ).toEqual([]);
  });

  it('routes through the one doorway crossing, not any of the blocked seam edges', () => {
    // Two 2-cell chambers, axial columns 0 and 1: A = {(0,0),(0,1)},
    // B = {(1,0),(1,1)}. In axial adjacency (0,1) and (1,0) are ALSO
    // neighbors (the hex "staircase"), so isolating the chambers means
    // blocking every cross-column pair, not just the same-row ones:
    // (0,0)-(1,0), (0,1)-(1,1), and (0,1)-(1,0). Only (0,0)-(1,0) is a
    // doorway. The only legal route from (0,1) to (1,1) is therefore
    // (0,1) -> (0,0) [open floor, same chamber] -> (1,0) [the doorway]
    // -> (1,1) [open floor, same chamber] — never the direct, shorter,
    // BLOCKED (0,1)-(1,1) or (0,1)-(1,0) hops.
    const index = buildAtlasPathIndex({
      cells: [pos(0, 0), pos(1, 0), pos(0, 1), pos(1, 1)],
      boundaries: [
        {
          from: pos(0, 0),
          to: pos(1, 0),
          blocksMovement: true,
          blocksLineOfSight: true,
        },
        {
          from: pos(0, 1),
          to: pos(1, 1),
          blocksMovement: true,
          blocksLineOfSight: true,
        },
        {
          from: pos(0, 1),
          to: pos(1, 0),
          blocksMovement: true,
          blocksLineOfSight: true,
        },
      ],
      doorways: [{ connection: 'd', from: pos(0, 0), to: pos(1, 0) }],
      props: [],
    } as never);

    const start = positionToCube(pos(0, 1));
    const goal = positionToCube(pos(1, 1));
    const path = findAtlasPath(index, start, goal);

    expect(path.length).toBeGreaterThan(0);
    for (let i = 0; i < path.length - 1; i++) {
      expect(edgePassable(index, path[i]!, path[i + 1]!)).toBe(true);
    }
    const keys = path.map((c) => `${c.x},${c.y},${c.z}`);
    const doorCell = positionToCube(pos(1, 0));
    expect(keys).toContain(`${doorCell.x},${doorCell.y},${doorCell.z}`);
  });

  it('a movement-blocking prop makes a cell impassable to route through, even mid-path', () => {
    // A 1x3 open strip with a blocking prop on the middle cell — no path.
    const index = buildAtlasPathIndex({
      cells: [pos(0, 0), pos(1, 0), pos(2, -1)],
      boundaries: [],
      doorways: [],
      props: [
        {
          ref: 'pillar',
          at: pos(1, 0),
          blocksMovement: true,
          blocksLineOfSight: false,
        },
      ],
    } as never);
    expect(
      findAtlasPath(
        index,
        positionToCube(pos(0, 0)),
        positionToCube(pos(2, -1))
      )
    ).toEqual([]);
  });
});

/** The real reference-tomb atlas shape, reused verbatim from
 * `atlasWallRuns.test.ts`'s own fixture — three chambers in a row (6/10/12
 * wide, 8 tall), two interior seams, two doorways at (3,4)<->(4,4) and
 * (13,4)<->(14,4). Real wire data captured live via GetAtlas, not a
 * hand-built guess (see that file's own doc comment for provenance). */
function realReferenceTombAtlas() {
  const seam1 = [
    [2, 6, 3, 6],
    [2, 7, 3, 6],
    [2, 7, 3, 7],
    [3, 5, 3, 6],
    [3, 5, 4, 4],
    [3, 5, 4, 5],
    [4, 2, 5, 2],
    [4, 3, 4, 4],
    [4, 3, 5, 2],
    [4, 3, 5, 3],
    [5, 0, 6, 0],
    [5, 1, 5, 2],
    [5, 1, 6, 0],
    [5, 1, 6, 1],
  ];
  const seam2 = [
    [12, 6, 13, 6],
    [12, 7, 13, 6],
    [12, 7, 13, 7],
    [13, 5, 13, 6],
    [13, 5, 14, 4],
    [13, 5, 14, 5],
    [14, 2, 15, 2],
    [14, 3, 14, 4],
    [14, 3, 15, 2],
    [14, 3, 15, 3],
    [15, 0, 16, 0],
    [15, 1, 15, 2],
    [15, 1, 16, 0],
    [15, 1, 16, 1],
  ];
  const boundaries = [...seam1, ...seam2].map(([fx, fy, tx, ty]) => ({
    from: pos(fx, fy),
    to: pos(tx, ty),
    blocksMovement: true,
    blocksLineOfSight: true,
  }));
  const doorways = [
    {
      connection: 'reference-tomb:entrance-hall',
      from: pos(3, 4),
      to: pos(4, 4),
    },
    {
      connection: 'reference-tomb:hall-tomb',
      from: pos(13, 4),
      to: pos(14, 4),
    },
  ];
  return {
    cells: referenceTombCells.cells as { x: number; y: number }[] as never,
    boundaries: boundaries as never,
    doorways: doorways as never,
    props: [] as never,
  };
}

describe('findAtlasPath — the real reference tomb', () => {
  const index = buildAtlasPathIndex(realReferenceTombAtlas());

  it('walks from the entrance chamber into the middle chamber through its doorway, not through the seam wall', () => {
    // Both cells are real floor cells of the reference tomb, one on each
    // side of seam 1. A correct path must cross exactly at (3,4)->(4,4).
    const start = positionToCube(pos(0, 4));
    const goal = positionToCube(pos(6, 4));
    const path = findAtlasPath(index, start, goal);
    expect(path.length).toBeGreaterThan(0);

    // Every consecutive pair in the path must be a passable edge — this
    // is the load-bearing assertion: a path that "cut the corner" through
    // a blocked seam edge would fail here even if its endpoints looked
    // plausible.
    for (let i = 0; i < path.length - 1; i++) {
      expect(edgePassable(index, path[i]!, path[i + 1]!)).toBe(true);
    }

    const doorFrom = positionToCube(pos(3, 4));
    const doorTo = positionToCube(pos(4, 4));
    const crossesDoor = path.some(
      (c, i) =>
        i < path.length - 1 &&
        ((c.x === doorFrom.x &&
          c.y === doorFrom.y &&
          c.z === doorFrom.z &&
          path[i + 1]!.x === doorTo.x &&
          path[i + 1]!.y === doorTo.y &&
          path[i + 1]!.z === doorTo.z) ||
          (c.x === doorTo.x &&
            c.y === doorTo.y &&
            c.z === doorTo.z &&
            path[i + 1]!.x === doorFrom.x &&
            path[i + 1]!.y === doorFrom.y &&
            path[i + 1]!.z === doorFrom.z))
    );
    expect(crossesDoor).toBe(true);
  });

  it('a farther chamber (crossing both doorways) still finds a route, several hexes long', () => {
    const start = positionToCube(pos(0, 4));
    const goal = positionToCube(pos(20, 4));
    const path = findAtlasPath(index, start, goal);
    expect(path.length).toBeGreaterThan(10);
    for (let i = 0; i < path.length - 1; i++) {
      expect(edgePassable(index, path[i]!, path[i + 1]!)).toBe(true);
    }
  });
});
