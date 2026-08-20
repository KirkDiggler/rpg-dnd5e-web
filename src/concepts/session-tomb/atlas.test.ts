/**
 * atlas tests — the geometry the new wire needs, checked without a browser.
 *
 * These are deliberately about the SHAPE of the answer rather than pixel
 * values: what makes a declared boundary drawable, and what a client is forced
 * to assume because the wire does not say it.
 */

import { describe, expect, it } from 'vitest';
import {
  axialDistance,
  buildScene,
  cellKey,
  DEFAULT_LAYOUT,
  edgeBetween,
  hexCenter,
  propName,
  viewBoxOf,
  type HexLayout,
} from './atlas';
import referenceTombCells from './referenceTombCells.json';

const pos = (x: number, y: number) => ({ x, y }) as never;
const SIZE = 10;

describe('hexCenter', () => {
  it('puts the origin cell at the origin under either layout', () => {
    for (const layout of ['pointy', 'flat'] as HexLayout[]) {
      const c = hexCenter(pos(0, 0), SIZE, layout);
      expect(c.x).toBeCloseTo(0);
      expect(c.y).toBeCloseTo(0);
    }
  });

  it('places neighbours exactly one cell apart', () => {
    // Adjacent hex centres sit sqrt(3) * size apart -- twice the inradius.
    const expected = Math.sqrt(3) * SIZE;
    const a = hexCenter(pos(0, 0), SIZE, 'pointy');
    const b = hexCenter(pos(1, 0), SIZE, 'pointy');
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(expected);
  });

  /**
   * THE ORIENTATION FINDING, pinned as a test rather than left as a comment.
   *
   * GridKind carries SQUARE or HEX and nothing else, so the wire never says
   * which way the hexes point. If that made no difference to the picture the
   * omission would cost nothing -- this asserts that it does make a difference,
   * which is the whole argument for reporting it upstream.
   */
  it('draws the same cell in a different place under each layout', () => {
    const cell = pos(3, 2);
    const pointy = hexCenter(cell, SIZE, 'pointy');
    const flat = hexCenter(cell, SIZE, 'flat');
    expect(pointy).not.toEqual(flat);
    // Not a near-miss either: they disagree by more than a whole cell.
    expect(Math.hypot(pointy.x - flat.x, pointy.y - flat.y)).toBeGreaterThan(
      Math.sqrt(3) * SIZE
    );
  });
});

describe('edgeBetween', () => {
  it('returns the shared edge: perpendicular, centred, one side long', () => {
    const from = pos(0, 0);
    const to = pos(1, 0);
    const edge = edgeBetween(from, to, SIZE, 'pointy');
    expect(edge).not.toBeNull();
    const { a, b } = edge!;

    // One side long.
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(SIZE);

    // Centred on the midpoint of the two centres.
    const A = hexCenter(from, SIZE, 'pointy');
    const B = hexCenter(to, SIZE, 'pointy');
    expect((a.x + b.x) / 2).toBeCloseTo((A.x + B.x) / 2);
    expect((a.y + b.y) / 2).toBeCloseTo((A.y + B.y) / 2);

    // Perpendicular to the centre-to-centre line.
    const dot = (b.x - a.x) * (B.x - A.x) + (b.y - a.y) * (B.y - A.y);
    expect(dot).toBeCloseTo(0);
  });

  it('refuses a degenerate pair rather than drawing a wall of no length', () => {
    expect(edgeBetween(pos(2, 2), pos(2, 2), SIZE, 'pointy')).toBeNull();
  });

  /**
   * The doc on edgeBetween promises non-neighbours get null, and the
   * perpendicular-bisector construction will happily produce a segment for ANY
   * two distinct cells -- so without an explicit adjacency check the promise
   * was prose the code did not keep.
   *
   * This matters more than a missing endpoint does: a dropped wall is absent,
   * but a wall built from a non-adjacent pair is DRAWN, somewhere
   * plausible-looking and halfway across a chamber, and nothing about it looks
   * wrong.
   */
  it('refuses a non-adjacent pair instead of inventing a wall between them', () => {
    expect(edgeBetween(pos(0, 0), pos(3, 0), SIZE, 'pointy')).toBeNull();
    expect(edgeBetween(pos(0, 0), pos(2, -1), SIZE, 'flat')).toBeNull();
  });

  it('still draws every genuine neighbour', () => {
    const neighbours = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, -1],
      [-1, 1],
    ];
    for (const [dq, dr] of neighbours) {
      expect(
        edgeBetween(pos(4, 4), pos(4 + dq, 4 + dr), SIZE, 'flat')
      ).not.toBeNull();
    }
  });
});

describe('axialDistance', () => {
  it('counts a neighbour as one step in every direction', () => {
    for (const [dq, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, -1],
      [-1, 1],
    ]) {
      expect(axialDistance(pos(0, 0), pos(dq, dr))).toBe(1);
    }
  });

  it('measures in cube space, not as a plain coordinate difference', () => {
    // (1,1) is TWO steps away in cube space even though both axial components
    // differ by one -- the case a naive max(|dq|,|dr|) gets wrong.
    expect(axialDistance(pos(0, 0), pos(1, 1))).toBe(2);
    expect(axialDistance(pos(0, 0), pos(0, 0))).toBe(0);
  });
});

describe('buildScene', () => {
  const scene = (over: Record<string, unknown> = {}) =>
    buildScene(
      {
        cells: [pos(0, 0), pos(1, 0)],
        props: [],
        boundaries: [],
        doorways: [],
        ...over,
      } as never,
      SIZE,
      'pointy'
    );

  it('places every cell and keys it so a click can name it back', () => {
    const s = scene();
    expect(s.cells).toHaveLength(2);
    expect(s.cells.map((c) => c.key)).toEqual(['0,0', '1,0']);
    expect(s.cells[0].corners).toHaveLength(6);
  });

  it('carries both blocking answers through for a prop', () => {
    const s = scene({
      props: [
        {
          ref: 'dnd5e:props:coffin',
          at: pos(1, 0),
          blocksMovement: true,
          blocksLineOfSight: false,
        },
      ],
    });
    expect(s.props).toHaveLength(1);
    expect(s.props[0].name).toBe('coffin');
    expect(s.props[0].blocksMovement).toBe(true);
    expect(s.props[0].blocksLineOfSight).toBe(false);
  });

  /**
   * A wall drawn from an absent endpoint would land on (0,0), which is a real
   * cell -- the north-west corner of the first chamber. Silently walling off
   * the entrance is a worse failure than a missing wall, so these are dropped.
   */
  it('drops a boundary with a missing endpoint instead of drawing it at the origin', () => {
    const s = scene({
      boundaries: [
        {
          from: pos(0, 0),
          to: undefined,
          blocksMovement: true,
          blocksLineOfSight: true,
        },
        {
          from: pos(0, 0),
          to: pos(1, 0),
          blocksMovement: true,
          blocksLineOfSight: true,
        },
      ],
    });
    expect(s.walls).toHaveLength(1);
  });

  it('drops a boundary between cells that do not touch', () => {
    const s2 = scene({
      boundaries: [
        {
          from: pos(0, 0),
          to: pos(4, 0),
          blocksMovement: true,
          blocksLineOfSight: true,
        },
      ],
    });
    expect(s2.walls).toHaveLength(0);
  });

  it('drops a doorway with a missing endpoint for the same reason', () => {
    const s = scene({
      doorways: [
        { connection: 'broken', from: undefined, to: pos(1, 0) },
        { connection: 'real', from: pos(0, 0), to: pos(1, 0) },
      ],
    });
    expect(s.doorways).toHaveLength(1);
    expect(s.doorways[0].connection).toBe('real');
  });

  it('frames every cell in the viewBox', () => {
    const s = scene();
    const [minX, minY, w, h] = s.viewBox.split(' ').map(Number);
    for (const c of s.cells) {
      expect(c.center.x).toBeGreaterThanOrEqual(minX);
      expect(c.center.y).toBeGreaterThanOrEqual(minY);
      expect(c.center.x).toBeLessThanOrEqual(minX + w);
      expect(c.center.y).toBeLessThanOrEqual(minY + h);
    }
  });

  it('frames an empty atlas without producing a degenerate viewBox', () => {
    expect(viewBoxOf([], SIZE)).toBe('0 0 1 1');
  });
});

describe('naming', () => {
  it('takes the id segment out of a ref', () => {
    expect(propName('dnd5e:props:statue-reaper')).toBe('statue-reaper');
  });

  it('leaves something that is not a ref alone', () => {
    expect(propName('coffin')).toBe('coffin');
  });

  it('keys an absent cell as empty rather than as the origin', () => {
    expect(cellKey(undefined)).toBe('');
    expect(cellKey(pos(0, 0))).toBe('0,0');
  });
});

/**
 * The layout choice, pinned against the atlas the server actually served.
 *
 * `referenceTombCells.json` is a capture of GetAtlas from a live rpg-api with
 * RPG_SESSION_STACK_ENABLED, playing the reference tomb — real wire data, not a
 * hand-built guess, in the spirit of this repo's other real-wire fixtures.
 *
 * The tomb is three chambers in a row: 6 + 10 + 12 cells wide and 8 tall. So
 * whichever layout is right has to draw something roughly three and a half
 * times wider than it is tall. That is a property of the AUTHORED DUNGEON, not
 * of the renderer, which is what makes it a fair test of the renderer.
 */
describe('which way the hexes point', () => {
  const boundsUnder = (layout: HexLayout) => {
    const pts = (referenceTombCells.cells as { x: number; y: number }[]).map(
      (c) => hexCenter(c as never, SIZE, layout)
    );
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return {
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    };
  };

  it('serves the whole tomb: 28 columns by 8 rows', () => {
    expect(referenceTombCells.cells).toHaveLength((6 + 10 + 12) * 8);
  });

  it('draws the authored shape flat-topped', () => {
    const { w, h } = boundsUnder('flat');
    // A 28x8 chain of hexes, so comfortably wider than tall.
    expect(w / h).toBeGreaterThan(2.5);
  });

  /**
   * THE FINDING. The tomb is authored `orientation: pointy`, so reading the
   * content and believing it is the obvious thing to do -- and it draws a
   * diagonal staircase. This asserts the wrong answer is genuinely wrong rather
   * than merely different, which is what makes the missing wire field worth
   * reporting instead of shrugging at.
   */
  it('does not draw the authored shape pointy-topped, despite the authored word', () => {
    const { w, h } = boundsUnder('pointy');
    expect(w / h).toBeLessThan(2);
  });

  it('defaults to the one that measures right', () => {
    const flat = boundsUnder('flat');
    const pointy = boundsUnder('pointy');
    const better = flat.w / flat.h > pointy.w / pointy.h ? 'flat' : 'pointy';
    expect(DEFAULT_LAYOUT).toBe(better);
  });
});
