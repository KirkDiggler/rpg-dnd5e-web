// @vitest-environment node
/**
 * atlasPath tests — the edge-aware graph search a click builds a
 * `MoveRequest.path` from. Checked against small hand-built fixtures for
 * the specific rules (`ADJACENCY IS NOT PERMISSION`, doorway punch-through,
 * prop blocking) and against the real 224-cell reference-tomb fixture
 * (same shape `atlasWallRuns.test.ts` uses) for an end-to-end route
 * crossing a real doorway.
 */
import { create } from '@bufbuild/protobuf';
import type { DoorInfo } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  DoorState,
  MemberKind,
  Passage,
  PositionSchema,
  SightingSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import referenceTombCells from '../../concepts/session-tomb/referenceTombCells.json';
import { coordToKey } from '../hex-grid/hexMath';
import {
  buildAtlasPathIndex,
  edgePassable,
  findAtlasApproach,
  findAtlasPath,
  INTERACTION_REACH,
  stepKey,
} from './atlasPath';
import { indexOccupantPassages } from './occupantPassages';
import { positionToCube } from './positionBridge';
import { sightingsToEntities } from './sightingEntities';

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

describe('door state gates the doorway (rpg-project#268)', () => {
  /** The doorway-on-a-boundary shape the real tomb authors: the seam
   * blocks, the doorway punches through — and now the DOOR decides. */
  function gatedAtlas() {
    return {
      cells: [pos(0, 0), pos(1, 0)],
      boundaries: [
        {
          from: pos(0, 0),
          to: pos(1, 0),
          blocksMovement: true,
          blocksLineOfSight: true,
        },
      ],
      doorways: [{ connection: 'gate', from: pos(0, 0), to: pos(1, 0) }],
      props: [],
    } as never;
  }

  const doorsWith = (state: DoorState): ReadonlyMap<string, DoorInfo> =>
    new Map([['gate', { door: 'gate', state } as DoorInfo]]);

  it('no live door state known — every doorway stays crossable (the pre-doors behavior every caller without the map gets)', () => {
    const index = buildAtlasPathIndex(gatedAtlas());
    expect(
      edgePassable(index, positionToCube(pos(0, 0)), positionToCube(pos(1, 0)))
    ).toBe(true);
  });

  it('an OPEN door is crossable', () => {
    const index = buildAtlasPathIndex(gatedAtlas(), doorsWith(DoorState.OPEN));
    expect(
      edgePassable(index, positionToCube(pos(0, 0)), positionToCube(pos(1, 0)))
    ).toBe(true);
  });

  it('a CLOSED door refuses the edge — the preview matches the server, and the remedy is OpenDoor, not new coordinates', () => {
    const index = buildAtlasPathIndex(
      gatedAtlas(),
      doorsWith(DoorState.CLOSED)
    );
    expect(
      edgePassable(index, positionToCube(pos(0, 0)), positionToCube(pos(1, 0)))
    ).toBe(false);
  });

  it('a LOCKED door refuses the edge too', () => {
    const index = buildAtlasPathIndex(
      gatedAtlas(),
      doorsWith(DoorState.LOCKED)
    );
    expect(
      edgePassable(index, positionToCube(pos(0, 0)), positionToCube(pos(1, 0)))
    ).toBe(false);
  });

  it('a map WITHOUT an entry for the door refuses too — the leaf draws shut for the same unknown, and the preview must match it', () => {
    const index = buildAtlasPathIndex(
      gatedAtlas(),
      new Map() as ReadonlyMap<string, DoorInfo>
    );
    expect(
      edgePassable(index, positionToCube(pos(0, 0)), positionToCube(pos(1, 0)))
    ).toBe(false);
  });

  it('a shut door never leaks into blockedEdges — reopening is a doors-map change, not an atlas change', () => {
    const index = buildAtlasPathIndex(
      gatedAtlas(),
      doorsWith(DoorState.CLOSED)
    );
    expect(index.shutDoorEdges.size).toBe(1);
    expect(index.blockedEdges.size).toBe(0);
  });
});

describe('live member occupancy blocks the destination cell (pathing preview follow-up, PR #920)', () => {
  it('a cell with no occupied set at all stays enterable — the pre-occupancy behavior', () => {
    const index = buildAtlasPathIndex(openPairAtlas());
    expect(
      edgePassable(index, positionToCube(pos(0, 0)), positionToCube(pos(1, 0)))
    ).toBe(true);
  });

  it('a cell occupied by a live other member (e.g. a placed world NPC) refuses the edge, same as a movement-blocking prop', () => {
    const index = buildAtlasPathIndex(
      openPairAtlas(),
      undefined,
      new Set([coordToKey(positionToCube(pos(1, 0)))])
    );
    expect(
      edgePassable(index, positionToCube(pos(0, 0)), positionToCube(pos(1, 0)))
    ).toBe(false);
  });

  it('occupancy never leaks into blockedCells — it is live data, not construction truth, the same distinction shutDoorEdges already draws', () => {
    const index = buildAtlasPathIndex(
      openPairAtlas(),
      undefined,
      new Set([coordToKey(positionToCube(pos(1, 0)))])
    );
    expect(index.occupiedCells.size).toBe(1);
    expect(index.blockedCells.size).toBe(0);
  });

  it('findAtlasPath routes AROUND an occupied cell rather than refusing the whole route, when an unoccupied detour exists', () => {
    // (0,0) start and (2,-1) goal share exactly two common neighbors —
    // (1,0) and (1,-1) — the classic hex rhombus detour shape. Occupying
    // (1,0) must push the route onto (1,-1), not fail the whole search.
    const atlas = {
      cells: [pos(0, 0), pos(1, 0), pos(1, -1), pos(2, -1)],
      boundaries: [],
      doorways: [],
      props: [],
    } as never;
    const index = buildAtlasPathIndex(
      atlas,
      undefined,
      new Set([coordToKey(positionToCube(pos(1, 0)))])
    );
    const path = findAtlasPath(
      index,
      positionToCube(pos(0, 0)),
      positionToCube(pos(2, -1))
    );
    const keys = path.map((c) => coordToKey(c));
    expect(keys).toContain(coordToKey(positionToCube(pos(1, -1))));
    expect(keys).not.toContain(coordToKey(positionToCube(pos(1, 0))));
  });
});

describe('walking into a posted body (rpg-project#841)', () => {
  const key = (x: number, y: number) => coordToKey(positionToCube(pos(x, y)));
  const keysOf = (path: ReturnType<typeof findAtlasPath>) =>
    path.map((c) => coordToKey(c));

  /** The hex rhombus: (0,0) and (2,-1) share two neighbours, (1,0) and
   * (1,-1), so a body on (1,0) leaves an equal detour through (1,-1). */
  const rhombus = {
    cells: [pos(0, 0), pos(1, 0), pos(1, -1), pos(2, -1)],
    boundaries: [],
    doorways: [],
    props: [],
  } as never;

  /** A one-cell corridor (q, 0) for q = 0..2: nothing round the middle. */
  const corridor = {
    cells: [pos(0, 0), pos(1, 0), pos(2, 0)],
    boundaries: [],
    doorways: [],
    props: [],
  } as never;

  it('an open room with an equal detour goes round a non-hostile blocking body: no bump', () => {
    const him = new Set([key(1, 0)]);
    const index = buildAtlasPathIndex(rhombus, undefined, him, undefined, him);
    const path = keysOf(
      findAtlasPath(
        index,
        positionToCube(pos(0, 0)),
        positionToCube(pos(2, -1))
      )
    );
    expect(path).toEqual([key(0, 0), key(1, -1), key(2, -1)]);
    expect(path).not.toContain(key(1, 0));
  });

  it('a one-cell corridor he fills is planned through him: the server stops the walk at his cell', () => {
    const him = new Set([key(1, 0)]);
    const index = buildAtlasPathIndex(corridor, undefined, him, undefined, him);
    expect(
      keysOf(
        findAtlasPath(
          index,
          positionToCube(pos(0, 0)),
          positionToCube(pos(2, 0))
        )
      )
    ).toEqual([key(0, 0), key(1, 0), key(2, 0)]);
  });

  it('his cell as the goal has no plan: a click on a body is the approach, so hover and click agree', () => {
    const him = new Set([key(1, 0)]);
    for (const atlas of [rhombus, corridor]) {
      const index = buildAtlasPathIndex(atlas, undefined, him, undefined, him);
      expect(
        findAtlasPath(
          index,
          positionToCube(pos(0, 0)),
          positionToCube(pos(1, 0))
        )
      ).toEqual([]);
    }
  });

  it('a hostile blocking body is never planned through: not as the goal, not as the only way', () => {
    const hostile = new Set([key(1, 0)]);
    const index = buildAtlasPathIndex(corridor, undefined, hostile);
    expect(
      findAtlasPath(index, positionToCube(pos(0, 0)), positionToCube(pos(2, 0)))
    ).toEqual([]);
    expect(
      findAtlasPath(index, positionToCube(pos(0, 0)), positionToCube(pos(1, 0)))
    ).toEqual([]);
  });

  it('the second plan walks into him only: another blocking body and a shut door stay shut', () => {
    // Corridor 0..3; he stands on 1, a hostile body on 2. Going through him
    // still meets the hostile one, so there is no plan at all.
    const atlas = {
      cells: [pos(0, 0), pos(1, 0), pos(2, 0), pos(3, 0)],
      boundaries: [],
      doorways: [],
      props: [],
    } as never;
    const index = buildAtlasPathIndex(
      atlas,
      undefined,
      new Set([key(1, 0), key(2, 0)]),
      undefined,
      new Set([key(1, 0)])
    );
    expect(
      findAtlasPath(index, positionToCube(pos(0, 0)), positionToCube(pos(3, 0)))
    ).toEqual([]);

    const gated = buildAtlasPathIndex(
      {
        cells: [pos(0, 0), pos(1, 0), pos(2, 0)],
        boundaries: [
          {
            from: pos(1, 0),
            to: pos(2, 0),
            blocksMovement: true,
            blocksLineOfSight: true,
          },
        ],
        doorways: [{ from: pos(1, 0), to: pos(2, 0), connection: 'gate' }],
        props: [],
      } as never,
      new Map([['gate', { state: DoorState.CLOSED } as DoorInfo]]),
      new Set([key(1, 0)]),
      undefined,
      new Set([key(1, 0)])
    );
    expect(
      findAtlasPath(gated, positionToCube(pos(0, 0)), positionToCube(pos(2, 0)))
    ).toEqual([]);
  });

  it('the castle gate: beneath the gate, him on it, the door open, the courtyard is planned through him; shut, nothing is', () => {
    // (0,0) the gatehouse, (1,0) beneath the gate where he is posted, (2,0)
    // the courtyard past the gate door. The door is the only crossing.
    const gate = (state: DoorState) =>
      buildAtlasPathIndex(
        {
          cells: [pos(0, 0), pos(1, 0), pos(2, 0)],
          boundaries: [
            {
              from: pos(1, 0),
              to: pos(2, 0),
              blocksMovement: true,
              blocksLineOfSight: true,
            },
          ],
          doorways: [{ from: pos(1, 0), to: pos(2, 0), connection: 'gate' }],
          props: [],
        } as never,
        new Map([['gate', { state } as DoorInfo]]),
        new Set([key(1, 0)]),
        undefined,
        new Set([key(1, 0)])
      );
    const courtyard = (state: DoorState) =>
      keysOf(
        findAtlasPath(
          gate(state),
          positionToCube(pos(0, 0)),
          positionToCube(pos(2, 0))
        )
      );
    expect(courtyard(DoorState.OPEN)).toEqual([
      key(0, 0),
      key(1, 0),
      key(2, 0),
    ]);
    expect(courtyard(DoorState.CLOSED)).toEqual([]);
    // His cell stays the approach, door open or not.
    expect(
      findAtlasPath(
        gate(DoorState.OPEN),
        positionToCube(pos(0, 0)),
        positionToCube(pos(1, 0))
      )
    ).toEqual([]);
  });

  it('a walk-into cell outside the blocked set opens nothing: only a seen blocking body is walked into', () => {
    const index = buildAtlasPathIndex(
      rhombus,
      undefined,
      undefined,
      undefined,
      new Set([key(1, 0)])
    );
    expect(index.walkIntoCells.size).toBe(0);
  });
});

describe('findAtlasApproach (rpg-project#753 R4)', () => {
  /** A straight corridor (q, 0) for q = 0..length-1: each cell hex-adjacent
   * to the next, hex distance |dq|. */
  function corridor(length: number) {
    return {
      cells: Array.from({ length }, (_, q) => pos(q, 0)),
      boundaries: [],
      doorways: [],
      props: [],
    };
  }
  const at = (q: number) => positionToCube(pos(q, 0));
  const qs = (path: { x: number }[]) => path.map((cell) => cell.x);

  it('walks toward a far target and stops at the FIRST cell within reach', () => {
    // The cook stands at q=9; her cell is occupied, so a plain path to it
    // does not exist at all.
    const index = buildAtlasPathIndex(
      corridor(10),
      undefined,
      new Set([coordToKey(at(9))])
    );
    expect(findAtlasPath(index, at(0), at(9))).toEqual([]);

    const path = findAtlasApproach(index, at(0), at(9), INTERACTION_REACH);

    expect(qs(path)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(INTERACTION_REACH).toBe(3);
  });

  it('is nothing to walk when the target is already within reach', () => {
    const index = buildAtlasPathIndex(corridor(10));
    expect(findAtlasApproach(index, at(6), at(9), 3)).toEqual([]);
  });

  it('never stops on a pass-through cell; it goes on to the next one in reach', () => {
    const index = buildAtlasPathIndex(
      corridor(10),
      undefined,
      undefined,
      new Set([coordToKey(at(6))])
    );
    expect(qs(findAtlasApproach(index, at(0), at(9), 3))).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it('goes as far toward the target as the known floor allows when no cell in reach is reachable', () => {
    // Known floor ends at q=4; the target sits at q=9, beyond it.
    const index = buildAtlasPathIndex(corridor(5));
    expect(qs(findAtlasApproach(index, at(0), at(9), 3))).toEqual([
      0, 1, 2, 3, 4,
    ]);
  });

  it('is nothing to walk when no reachable cell is any closer', () => {
    const index = buildAtlasPathIndex(corridor(1));
    expect(findAtlasApproach(index, at(0), at(9), 3)).toEqual([]);
  });
});

describe('a held opening plans shut (rpg-project#852, R5)', () => {
  const key = (x: number, y: number) => coordToKey(positionToCube(pos(x, y)));
  const keysOf = (path: ReturnType<typeof findAtlasPath>) =>
    path.map((c) => coordToKey(c));

  /** The castle gate in small. Row r=0 is outside, row r=1 the courtyard,
   * and a wall blocks every step between them. The gate is a FOOTPRINT
   * door: its two crossings, (0,0)-(0,1) and (1,0)-(1,1), arrive as
   * doorways marked `crossing`, with no edge door's edges. The postern at
   * (3,0)-(3,1) is an edge door, the way round. The guard is posted at
   * (1,2), inside the courtyard and off every route, so only his hold can
   * bar it, never his body; and no search from outside ever meets his
   * cell, so only the held opening can start the second plan. */
  const cells = [
    ...[0, 1, 2, 3].flatMap((q) => [pos(q, 0), pos(q, 1)]),
    pos(1, 2),
  ];
  const wall = [
    [pos(0, 0), pos(0, 1)],
    [pos(1, 0), pos(0, 1)],
    [pos(1, 0), pos(1, 1)],
    [pos(2, 0), pos(1, 1)],
    [pos(2, 0), pos(2, 1)],
    [pos(3, 0), pos(2, 1)],
    [pos(3, 0), pos(3, 1)],
  ].map(([from, to]) => ({
    from,
    to,
    blocksMovement: true,
    blocksLineOfSight: true,
  }));
  const castle = {
    cells,
    boundaries: wall,
    doorways: [
      { connection: 'gate', from: pos(0, 0), to: pos(0, 1), crossing: true },
      { connection: 'gate', from: pos(1, 0), to: pos(1, 1), crossing: true },
      { connection: 'postern', from: pos(3, 0), to: pos(3, 1) },
    ],
    props: [],
  } as never;

  const doors = (gate: DoorState, postern: DoorState) =>
    new Map<string, DoorInfo>([
      ['gate', { door: 'gate', state: gate } as DoorInfo],
      ['postern', { door: 'postern', state: postern } as DoorInfo],
    ]);

  /** The guard as the server sends him: a live sighting (or a memory) at
   * his post, his believed stance, and the door his post holds. */
  function guard(holdsDoor: string, stance = 'neutral', remembered = false) {
    return create(SightingSchema, {
      subject: 'gate-1',
      kind: MemberKind.MONSTER,
      passage: Passage.BLOCKED,
      stance,
      holdsDoor,
      currentVia: remembered ? [] : ['sight'],
      seen: { position: create(PositionSchema, { x: 1, y: 2 }) },
    });
  }

  /** The index exactly as the view builds it from its sightings. */
  function plan(
    sightings: ReturnType<typeof guard>[],
    gate: DoorState,
    postern: DoorState
  ) {
    const occupancy = indexOccupantPassages(
      sightingsToEntities(sightings, 'walker')
    );
    const index = buildAtlasPathIndex(
      castle,
      doors(gate, postern),
      occupancy.blocked,
      occupancy.passThrough,
      occupancy.walkInto,
      occupancy.holds
    );
    return (from: [number, number], to: [number, number]) =>
      keysOf(
        findAtlasPath(
          index,
          positionToCube(pos(...from)),
          positionToCube(pos(...to))
        )
      );
  }

  const ROUND = [
    key(0, 0),
    key(1, 0),
    key(2, 0),
    key(3, 0),
    key(3, 1),
    key(2, 1),
    key(1, 1),
    key(0, 1),
  ];

  it('unheld and open, the gate is crossed straight through either crossing', () => {
    const go = plan([guard('')], DoorState.OPEN, DoorState.OPEN);
    expect(go([0, 0], [0, 1])).toEqual([key(0, 0), key(0, 1)]);
    expect(go([1, 0], [1, 1])).toEqual([key(1, 0), key(1, 1)]);
  });

  it('a shut footprint door is planned shut: NEW, its crossings were never doorways before', () => {
    expect(
      plan([guard('')], DoorState.CLOSED, DoorState.OPEN)([0, 0], [0, 1])
    ).toEqual(ROUND);
    expect(
      plan([guard('')], DoorState.CLOSED, DoorState.CLOSED)([0, 0], [0, 1])
    ).toEqual([]);
  });

  it('held and open, a way round exists: neither crossing is planned through', () => {
    const go = plan([guard('gate')], DoorState.OPEN, DoorState.OPEN);
    expect(go([0, 0], [0, 1])).toEqual(ROUND);
    const fromTheOtherCell = go([1, 0], [1, 1]);
    expect(fromTheOtherCell[0]).toBe(key(1, 0));
    expect(fromTheOtherCell).toContain(key(3, 0));
    expect(fromTheOtherCell).toContain(key(3, 1));
  });

  it('held with no way round, the second plan crosses the opening: the server stops the walk there by his name', () => {
    expect(
      plan([guard('gate')], DoorState.OPEN, DoorState.CLOSED)([0, 0], [0, 1])
    ).toEqual([key(0, 0), key(0, 1)]);
  });

  it('held by a body believed hostile, or with no stance word, the opening stays shut on both plans', () => {
    for (const stance of ['hostile', '']) {
      expect(
        plan(
          [guard('gate', stance)],
          DoorState.OPEN,
          DoorState.CLOSED
        )([0, 0], [0, 1])
      ).toEqual([]);
    }
  });

  it('a door shut by its own state stays shut on the second plan, held or not', () => {
    expect(
      plan([guard('gate')], DoorState.CLOSED, DoorState.CLOSED)([0, 0], [0, 1])
    ).toEqual([]);
  });

  it('the hold clears on the next build: the sighting drops holdsDoor and the opening plans again', () => {
    expect(
      plan([guard('gate')], DoorState.OPEN, DoorState.OPEN)([0, 0], [0, 1])
    ).toEqual(ROUND);
    expect(
      plan([guard('')], DoorState.OPEN, DoorState.OPEN)([0, 0], [0, 1])
    ).toEqual([key(0, 0), key(0, 1)]);
  });

  it('a remembered sighting holds nothing', () => {
    expect(
      plan(
        [guard('gate', 'neutral', true)],
        DoorState.OPEN,
        DoorState.OPEN
      )([0, 0], [0, 1])
    ).toEqual([key(0, 0), key(0, 1)]);
  });

  it('an edge door is held the same way: the held postern sends the walk through the open gate', () => {
    const go = plan([guard('postern')], DoorState.OPEN, DoorState.OPEN);
    const path = go([3, 0], [3, 1]);
    expect(path[0]).toBe(key(3, 0));
    expect(path.at(-1)).toBe(key(3, 1));
    // It crosses at the gate, never the postern pair.
    const steps = path.slice(1).map((k, i) => `${path[i]}>${k}`);
    expect(steps).not.toContain(`${key(3, 0)}>${key(3, 1)}`);
  });

  it('a door held by a neutral post and a hostile one is never crossed', () => {
    expect(
      plan(
        [
          guard('gate', 'neutral'),
          create(SightingSchema, {
            subject: 'gate-2',
            kind: MemberKind.MONSTER,
            passage: Passage.BLOCKED,
            stance: 'hostile',
            holdsDoor: 'gate',
            currentVia: ['sight'],
            seen: { position: create(PositionSchema, { x: 2, y: 0 }) },
          }),
        ],
        DoorState.OPEN,
        DoorState.CLOSED
      )([0, 0], [0, 1])
    ).toEqual([]);
  });

  it('held door edges stay out of blockedEdges and shutDoorEdges: a hold is a body’s fact, not the door’s state', () => {
    const occupancy = indexOccupantPassages(
      sightingsToEntities([guard('gate')], 'walker')
    );
    const index = buildAtlasPathIndex(
      castle,
      doors(DoorState.OPEN, DoorState.OPEN),
      occupancy.blocked,
      occupancy.passThrough,
      occupancy.walkInto,
      occupancy.holds
    );
    // The pair key `atlasPath.ts` builds: an unordered pair of cell keys.
    const pair = (a: never, b: never) =>
      [coordToKey(positionToCube(a)), coordToKey(positionToCube(b))]
        .sort()
        .join('|');
    const step = (a: never, b: never) =>
      stepKey(positionToCube(a), positionToCube(b));
    const gatePairs = [pair(pos(0, 0), pos(0, 1)), pair(pos(1, 0), pos(1, 1))];
    const doorwayPairs = [...gatePairs, pair(pos(3, 0), pos(3, 1))];
    // Held edges are DIRECTED steps (rpg-project#857): a hold with no side
    // cells, as this guard's, is held both ways on each crossing.
    expect(index.heldDoorEdges).toEqual(
      new Set([
        step(pos(0, 0), pos(0, 1)),
        step(pos(0, 1), pos(0, 0)),
        step(pos(1, 0), pos(1, 1)),
        step(pos(1, 1), pos(1, 0)),
      ])
    );
    expect(index.walkIntoHeldEdges).toEqual(index.heldDoorEdges);
    expect(index.shutDoorEdges).toEqual(new Set());
    expect(index.blockedEdges).toEqual(
      new Set(
        wall
          .map((w) => pair(w.from, w.to))
          .filter((k) => !doorwayPairs.includes(k))
      )
    );
  });
});

describe('a one-way hold plans shut only in the barred direction (rpg-project#857, R6)', () => {
  const key = (x: number, y: number) => coordToKey(positionToCube(pos(x, y)));
  const keysOf = (path: ReturnType<typeof findAtlasPath>) =>
    path.map((c) => coordToKey(c));
  const step = (a: [number, number], b: [number, number]) =>
    stepKey(positionToCube(pos(...a)), positionToCube(pos(...b)));

  /** The castle gate in small, as #852's fixture: row r=0 is outside (the
   * post's side, the gatehouse), row r=1 and (1,2) the courtyard, a wall
   * between the rows. The gate is a footprint door with two crossings,
   * (0,0)-(0,1) and (1,0)-(1,1); the postern (3,0)-(3,1) is the way round,
   * shut unless a test opens it. One more wall cuts (0,1) off from the rest
   * of the courtyard, so the only walk from (0,1) to (1,1) leaves through
   * one crossing and comes back in through the other: the opening twice. */
  const cells = [
    ...[0, 1, 2, 3].flatMap((q) => [pos(q, 0), pos(q, 1)]),
    pos(1, 2),
  ];
  const wall = [
    [pos(0, 0), pos(0, 1)],
    [pos(1, 0), pos(0, 1)],
    [pos(1, 0), pos(1, 1)],
    [pos(2, 0), pos(1, 1)],
    [pos(2, 0), pos(2, 1)],
    [pos(3, 0), pos(2, 1)],
    [pos(3, 0), pos(3, 1)],
    [pos(0, 1), pos(1, 1)],
  ].map(([from, to]) => ({
    from,
    to,
    blocksMovement: true,
    blocksLineOfSight: true,
  }));
  const castle = {
    cells,
    boundaries: wall,
    doorways: [
      { connection: 'gate', from: pos(0, 0), to: pos(0, 1), crossing: true },
      { connection: 'gate', from: pos(1, 0), to: pos(1, 1), crossing: true },
      { connection: 'postern', from: pos(3, 0), to: pos(3, 1) },
    ],
    props: [],
  } as never;

  /** The posted guard as the server sends him: live (or a memory), his
   * believed stance, the gate, its direction, and the gatehouse-side cells
   * of its two crossings unless a test sends none. */
  function guard({
    against = 'both',
    stance = 'hostile',
    side = [pos(0, 0), pos(1, 0)] as never[],
    remembered = false,
    subject = 'gate-1',
  } = {}) {
    return create(SightingSchema, {
      subject,
      kind: MemberKind.MONSTER,
      passage: Passage.BLOCKED,
      stance,
      holdsDoor: 'gate',
      holdsAgainst: against,
      holdsSide: side.map((at: { x: number; y: number }) =>
        create(PositionSchema, at)
      ),
      currentVia: remembered ? [] : ['sight'],
      seen: { position: create(PositionSchema, { x: 1, y: 2 }) },
    });
  }

  function build(
    sightings: ReturnType<typeof guard>[],
    postern = DoorState.CLOSED
  ) {
    const occupancy = indexOccupantPassages(
      sightingsToEntities(sightings, 'walker')
    );
    return buildAtlasPathIndex(
      castle,
      new Map<string, DoorInfo>([
        ['gate', { door: 'gate', state: DoorState.OPEN } as DoorInfo],
        ['postern', { door: 'postern', state: postern } as DoorInfo],
      ]),
      occupancy.blocked,
      occupancy.passThrough,
      occupancy.walkInto,
      occupancy.holds
    );
  }

  function plan(
    sightings: ReturnType<typeof guard>[],
    postern = DoorState.CLOSED
  ) {
    const index = build(sightings, postern);
    return (from: [number, number], to: [number, number]) =>
      keysOf(
        findAtlasPath(
          index,
          positionToCube(pos(...from)),
          positionToCube(pos(...to))
        )
      );
  }

  const IN = step([0, 0], [0, 1]);
  const IN_2 = step([1, 0], [1, 1]);
  const OUT = step([0, 1], [0, 0]);
  const OUT_2 = step([1, 1], [1, 0]);

  it('an entering post holds only the steps from its side: the arrivals', () => {
    const index = build([guard({ against: 'entering' })]);
    expect(index.heldDoorEdges).toEqual(new Set([IN, IN_2]));
    expect(index.walkIntoHeldEdges).toEqual(new Set());
  });

  it('an entering post lets a path leave through the gate and bars one coming in, from any distance', () => {
    const go = plan([guard({ against: 'entering' })]);
    expect(go([0, 1], [0, 0])).toEqual([key(0, 1), key(0, 0)]);
    expect(go([1, 1], [3, 0])).toEqual([
      key(1, 1),
      key(1, 0),
      key(2, 0),
      key(3, 0),
    ]);
    expect(go([0, 0], [0, 1])).toEqual([]);
    expect(go([3, 0], [2, 1])).toEqual([]);
  });

  it('an entering post with a way round sends the arrival round, never through the gate', () => {
    const path = plan([guard({ against: 'entering' })], DoorState.OPEN)(
      [0, 0],
      [2, 1]
    );
    expect(path.at(-1)).toBe(key(2, 1));
    const steps = path.slice(1).map((k, i) => `${path[i]}>${k}`);
    expect(steps).toContain(`${key(3, 0)}>${key(3, 1)}`);
    expect(steps).not.toContain(IN);
    expect(steps).not.toContain(IN_2);
  });

  it('a leaving post is the reverse: the arrival walks in, the leaver is barred', () => {
    const index = build([guard({ against: 'leaving' })]);
    expect(index.heldDoorEdges).toEqual(new Set([OUT, OUT_2]));
    const go = plan([guard({ against: 'leaving' })]);
    expect(go([0, 0], [0, 1])).toEqual([key(0, 0), key(0, 1)]);
    expect(go([3, 0], [2, 1])).toEqual([
      key(3, 0),
      key(2, 0),
      key(1, 0),
      key(1, 1),
      key(2, 1),
    ]);
    expect(go([0, 1], [0, 0])).toEqual([]);
    expect(go([2, 1], [3, 0])).toEqual([]);
  });

  it('both, and an empty direction, bar each way', () => {
    for (const against of ['both', '']) {
      expect(build([guard({ against })]).heldDoorEdges).toEqual(
        new Set([IN, IN_2, OUT, OUT_2])
      );
      const go = plan([guard({ against })]);
      expect(go([0, 0], [0, 1])).toEqual([]);
      expect(go([0, 1], [0, 0])).toEqual([]);
    }
  });

  it('a direction this client does not know bars each way: fail closed', () => {
    expect(build([guard({ against: 'sideways' })]).heldDoorEdges).toEqual(
      new Set([IN, IN_2, OUT, OUT_2])
    );
  });

  it('a path that crosses a one-way opening twice is barred on the barred leg only', () => {
    // From (0,1) to (1,1) the only walk leaves by one crossing and comes back
    // in by the other. Each leg alone: entering lets the leaving leg through
    // and bars the coming-in leg; leaving the reverse. So the whole walk is
    // barred either way, at the leg its post bars.
    const entering = plan([guard({ against: 'entering' })]);
    expect(entering([0, 1], [1, 0])).toEqual([key(0, 1), key(0, 0), key(1, 0)]);
    expect(entering([1, 0], [1, 1])).toEqual([]);
    expect(entering([0, 1], [1, 1])).toEqual([]);
    const leaving = plan([guard({ against: 'leaving' })]);
    expect(leaving([0, 1], [1, 0])).toEqual([]);
    expect(leaving([0, 0], [1, 1])).toEqual([key(0, 0), key(1, 0), key(1, 1)]);
    expect(leaving([0, 1], [1, 1])).toEqual([]);
  });

  it('the second plan crosses the barred leg only when every holder is neutral or allied and nothing goes round', () => {
    expect(
      plan([guard({ against: 'entering', stance: 'neutral' })])([0, 1], [1, 1])
    ).toEqual([key(0, 1), key(0, 0), key(1, 0), key(1, 1)]);
    // A way round: the first plan takes it, never the held leg.
    const round = plan(
      [guard({ against: 'entering', stance: 'neutral' })],
      DoorState.OPEN
    )([0, 0], [2, 1]);
    const steps = round.slice(1).map((k, i) => `${round[i]}>${k}`);
    expect(steps).toContain(`${key(3, 0)}>${key(3, 1)}`);
    expect(steps).not.toContain(IN);
    expect(steps).not.toContain(IN_2);
  });

  it('holders differ by direction: a hostile entering post and a neutral leaving one', () => {
    const index = build([
      guard({ against: 'entering', stance: 'hostile' }),
      guard({ against: 'leaving', stance: 'neutral', subject: 'gate-2' }),
    ]);
    expect(index.heldDoorEdges).toEqual(new Set([IN, IN_2, OUT, OUT_2]));
    expect(index.walkIntoHeldEdges).toEqual(new Set([OUT, OUT_2]));
  });

  it('a hold with no side cells, from a server before rpg-project#857, is held both ways on every crossing', () => {
    expect(
      build([guard({ against: 'entering', side: [] })]).heldDoorEdges
    ).toEqual(new Set([IN, IN_2, OUT, OUT_2]));
  });

  it('a crossing the side cells do not orient is held both ways', () => {
    // Only (0,0) is sent: the (1,0)-(1,1) crossing has neither cell.
    expect(
      build([guard({ against: 'entering', side: [pos(0, 0)] })]).heldDoorEdges
    ).toEqual(new Set([IN, IN_2, OUT_2]));
    // Both cells of a crossing sent: that crossing is held both ways.
    expect(
      build([
        guard({ against: 'entering', side: [pos(0, 0), pos(0, 1), pos(1, 0)] }),
      ]).heldDoorEdges
    ).toEqual(new Set([IN, OUT, IN_2]));
  });

  it('a remembered sighting holds nothing in either direction', () => {
    const index = build([guard({ against: 'entering', remembered: true })]);
    expect(index.heldDoorEdges).toEqual(new Set());
    expect(
      plan([guard({ against: 'entering', remembered: true })])([0, 0], [0, 1])
    ).toEqual([key(0, 0), key(0, 1)]);
  });
});
