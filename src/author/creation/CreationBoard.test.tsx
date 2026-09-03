/**
 * The board's tools act through the document; these drive the SVG with
 * pointer events and assert on the document the callbacks produce.
 */
import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addWalls,
  emptyDungeon,
  eraseCell,
  paintCell,
  placeAt,
  toggleWall,
  wallEdges,
  wallRoom,
  type DungeonDoc,
} from '../dungeonYaml';
import {
  axialKey,
  edgeKey,
  fromOffset,
  toOffset,
  type Edge,
} from '../hexOffset';
import { ENVELOPE_STROKE, WALL_STROKE } from '../markerStyle';
import { boardWallScene } from './boardWallRuns';
import { cellCenter, growBounds, neededBounds } from './canvasGeometry';
import {
  BOARD_HEX_SIZE,
  BOARD_SCALE,
  CreationBoard,
  type CreationBoardProps,
} from './CreationBoard';
import { cornerPoint, sameCorner, type CornerRef } from './hexCorner';
import { chainEndpoints, runVertices, tautPath } from './wallGesture';

const p = (c: number, r: number) => fromOffset('pointy', [c, r]);
const EMPTY_REGION_IDS: ReadonlySet<string> = new Set();

function mount(doc: DungeonDoc, overrides: Partial<CreationBoardProps> = {}) {
  const calls: { paint: string[]; erase: string[]; edges: Edge[] } = {
    paint: [],
    erase: [],
    edges: [],
  };
  const utils = render(
    <CreationBoard
      doc={doc}
      tool="region"
      selection={{ kind: 'dungeon' }}
      activeRegionId="region-1"
      errorTargets={[]}
      concealedRegionIds={EMPTY_REGION_IDS}
      onPaintRoom={() => {}}
      onPaint={(c) => calls.paint.push(axialKey(c))}
      onErase={(c) => calls.erase.push(axialKey(c))}
      onEdgeClick={(e) => calls.edges.push(e)}
      onWallDraw={() => {}}
      onWallErase={() => {}}
      onWallReshape={() => {}}
      onDoorDraw={() => {}}
      onCellClick={() => {}}
      onSelect={() => {}}
      {...overrides}
    />
  );
  return { ...utils, calls };
}

const cellEl = (container: HTMLElement, c: number, r: number) =>
  container.querySelector(`[data-cell="${axialKey(p(c, r))}"]`)!;

describe('CreationBoard', () => {
  it('the region brush paints on pointer down and while dragging; shift erases', () => {
    const { container, calls } = mount(emptyDungeon());
    fireEvent.pointerDown(cellEl(container, 1, 1), { button: 0 });
    fireEvent.pointerEnter(cellEl(container, 2, 1));
    fireEvent.pointerUp(container.querySelector('svg')!);
    fireEvent.pointerEnter(cellEl(container, 3, 1)); // not painting any more
    expect(calls.paint).toEqual([axialKey(p(1, 1)), axialKey(p(2, 1))]);

    fireEvent.pointerDown(cellEl(container, 1, 1), {
      button: 0,
      shiftKey: true,
    });
    expect(calls.erase).toEqual([axialKey(p(1, 1))]);
  });

  it('the region brush never paints a cell into two regions (document rule)', () => {
    let doc = emptyDungeon();
    doc = {
      ...doc,
      regions: [...doc.regions, { ...doc.regions[0], id: 'two', name: 'Two' }],
    };
    doc = paintCell(doc, 'region-1', p(1, 1));
    doc = paintCell(doc, 'two', p(1, 1));
    expect(doc.regions.map((r) => r.cells.length)).toEqual([0, 1]);
  });

  it('the wall tool on a void cell never reports an edge', () => {
    const { container, calls } = mount(emptyDungeon(), { tool: 'wall' });
    fireEvent.pointerDown(cellEl(container, 1, 1), { button: 0 });
    fireEvent.pointerUp(container.querySelector('svg')!);
    expect(calls.edges).toHaveLength(0);
  });

  it('the wall tool reports an edge from a floor cell to one of its six neighbours', () => {
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(1, 1));
    doc = paintCell(doc, 'region-1', p(2, 1));
    const { container, calls } = mount(doc, { tool: 'wall' });
    // Press + release without moving: the drag-capable wall tool still
    // commits today's single-edge toggle, on release (#804).
    fireEvent.pointerDown(cellEl(container, 1, 1), { button: 0 });
    fireEvent.pointerUp(container.querySelector('svg')!);
    expect(calls.edges).toHaveLength(1);
    const [a, b] = calls.edges[0];
    expect(axialKey(a)).toBe(axialKey(p(1, 1)));
    // jsdom has no layout, so the pointer lands at the SVG origin; the
    // reported neighbour is still one of the six, never a far cell.
    expect(
      Math.abs(a.q - b.q) +
        Math.abs(a.r - b.r) +
        Math.abs(a.q + a.r - b.q - b.r)
    ).toBe(2);
    // and the DOCUMENT rule: a non-adjacent pair is a no-op
    expect(toggleWall(doc, [p(1, 1), p(5, 5)])).toBe(doc);
  });

  it('draws a declared wall as a straight RUN and a door in its gap — the picture 3D will render (#800)', () => {
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(1, 1));
    doc = paintCell(doc, 'region-1', p(2, 1));
    doc = paintCell(doc, 'region-1', p(3, 1));
    doc = toggleWall(doc, [p(1, 1), p(2, 1)]);
    doc = { ...doc, doors: [{ id: 'd', edges: [[p(2, 1), p(3, 1)]] }] };
    const { container } = mount(doc, {
      tool: 'select',
      errorTargets: [{ kind: 'cell', cell: p(3, 1) }],
    });
    // The wall and door render as run geometry, not literal hex edges…
    expect(container.querySelectorAll('[data-run]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-door-run]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-edge^="w:"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-edge^="d:"]')).toHaveLength(0);
    // …and cell errors still highlight in red, as before.
    expect(cellEl(container, 3, 1).getAttribute('stroke')).toBe('#ff3b30');
    expect(cellEl(container, 2, 1).getAttribute('stroke')).not.toBe('#ff3b30');
  });

  it('an EDGE error stays a literal red hex edge on top of the runs — edge-scoped truth (#800)', () => {
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(1, 1));
    doc = paintCell(doc, 'region-1', p(2, 1));
    doc = toggleWall(doc, [p(1, 1), p(2, 1)]);
    const { container } = mount(doc, {
      errorTargets: [{ kind: 'edge', edge: [p(1, 1), p(2, 1)] }],
    });
    // The run still draws, and the literal error edge draws over it.
    expect(container.querySelectorAll('[data-run]')).toHaveLength(1);
    const literal = container.querySelectorAll('[data-edge^="w:"]');
    expect(literal).toHaveLength(1);
    expect(literal[0].getAttribute('stroke')).toBe('#ff3b30');
  });

  it('a flat-top document keeps the literal edge drawing — 3D refuses flat-top, so literal IS the honest picture (#763)', () => {
    const f = (c: number, r: number) => fromOffset('flat', [c, r]);
    let doc = emptyDungeon('flat');
    doc = paintCell(doc, 'region-1', f(1, 1));
    doc = paintCell(doc, 'region-1', f(2, 1));
    doc = toggleWall(doc, [f(1, 1), f(2, 1)]);
    const { container } = mount(doc);
    expect(container.querySelectorAll('[data-run]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-edge^="w:"]')).toHaveLength(1);
  });
});

describe('CreationBoard viewport (Kirk walk 2026-08-23: no jumping at the edges)', () => {
  it('painting a cell at the left/top edge grows the grid without moving what is on screen', () => {
    // Start with a floor at the far left of the starter grid, then paint
    // one cell further left — the extent must grow leftwards, and the
    // scroll position must move by exactly the origin shift so a fixed
    // cell keeps its on-screen position.
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(0, 0));
    const { container, rerender } = mount(doc);
    const viewport = container.querySelector(
      '[data-testid="creation-viewport"]'
    ) as HTMLDivElement;
    const svg = container.querySelector('svg')!;
    const originOf = () => svg.getAttribute('viewBox')!.split(' ').map(Number);
    const [x0, y0] = originOf();
    // jsdom gives no layout; the initial centring lands on a clamped 0.
    const sx0 = viewport.scrollLeft;
    const sy0 = viewport.scrollTop;
    const anchor = cellEl(container, 0, 0);
    const anchorPoints = anchor.getAttribute('points');

    doc = paintCell(doc, 'region-1', p(-4, -4)); // beyond the margin: extent must grow
    rerender(
      <CreationBoard
        doc={doc}
        tool="region"
        selection={{ kind: 'dungeon' }}
        activeRegionId="region-1"
        errorTargets={[]}
        concealedRegionIds={EMPTY_REGION_IDS}
        onPaintRoom={() => {}}
        onPaint={() => {}}
        onErase={() => {}}
        onEdgeClick={() => {}}
        onWallDraw={() => {}}
        onWallErase={() => {}}
        onWallReshape={() => {}}
        onDoorDraw={() => {}}
        onCellClick={() => {}}
        onSelect={() => {}}
      />
    );
    const [x1, y1] = originOf();
    expect(x1).toBeLessThan(x0);
    expect(y1).toBeLessThan(y0);
    // the anchor cell's own geometry is unchanged (absolute user space) …
    expect(cellEl(container, 0, 0).getAttribute('points')).toBe(anchorPoints);
    // … and the scroll moved by exactly the origin shift (× scale), so the
    // screen position (user x − viewBox x) × scale − scrollLeft is constant.
    // jsdom clamps scroll to 0 because nothing has size, so assert the
    // intended delta through the compensation arithmetic instead.
    const dx = (x0 - x1) * BOARD_SCALE;
    const dy = (y0 - y1) * BOARD_SCALE;
    expect(dx).toBeGreaterThan(0);
    expect(dy).toBeGreaterThan(0);
    expect(viewport.scrollLeft).toBe(
      Math.max(0, sx0 + dx) === sx0 + dx ? sx0 + dx : 0
    );
    expect(viewport.scrollTop).toBe(
      Math.max(0, sy0 + dy) === sy0 + dy ? sy0 + dy : 0
    );
  });

  it('erasing at the edge never shrinks the grid (bounds only grow)', () => {
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(20, 0));
    const { container, rerender } = mount(doc);
    const before = container.querySelectorAll('[data-cell]').length;
    doc = eraseCell(doc, p(20, 0));
    rerender(
      <CreationBoard
        doc={doc}
        tool="region"
        selection={{ kind: 'dungeon' }}
        activeRegionId="region-1"
        errorTargets={[]}
        concealedRegionIds={EMPTY_REGION_IDS}
        onPaintRoom={() => {}}
        onPaint={() => {}}
        onErase={() => {}}
        onEdgeClick={() => {}}
        onWallDraw={() => {}}
        onWallErase={() => {}}
        onWallReshape={() => {}}
        onDoorDraw={() => {}}
        onCellClick={() => {}}
        onSelect={() => {}}
      />
    );
    expect(container.querySelectorAll('[data-cell]').length).toBe(before);
  });

  it('growBounds is monotonic and neededBounds keeps the margin', () => {
    const a = neededBounds([p(0, 0)], 'pointy');
    expect(a).toEqual({ minC: -4, maxC: 13, minR: -4, maxR: 8 });
    const grown = growBounds(a, neededBounds([p(30, 0)], 'pointy'));
    expect(grown.maxC).toBe(34);
    expect(grown.minC).toBe(-4);
    expect(growBounds(grown, a)).toBe(grown);
  });

  it('a placement offset moves its marker within the hex; facing draws a tick, unfaced does not', () => {
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(1, 1));
    doc = paintCell(doc, 'region-1', p(2, 1));
    doc = placeAt(doc, { ref: 'dnd5e:props:pillar', at: p(1, 1) });
    doc = placeAt(doc, { ref: 'dnd5e:props:brazier', at: p(2, 1) });
    doc = {
      ...doc,
      place: [
        {
          ...doc.place[0],
          facing: 'ne',
          offset: [0.2, -0.1] as [number, number],
        },
        doc.place[1],
      ],
    };
    const { container } = mount(doc);

    const cell = cellCenter(p(1, 1), BOARD_HEX_SIZE, 'pointy');
    const circle = container.querySelector(
      '[data-placement="0"] circle'
    ) as SVGCircleElement;
    expect(Number(circle.getAttribute('cx'))).toBeCloseTo(
      cell.x + 0.2 * BOARD_HEX_SIZE,
      6
    );
    expect(Number(circle.getAttribute('cy'))).toBeCloseTo(
      cell.y + -0.1 * BOARD_HEX_SIZE,
      6
    );
    expect(container.querySelector('[data-facing-tick="0"]')).not.toBeNull();

    // The un-offset, un-faced brazier sits exactly at its cell center and
    // draws no tick.
    const brazierCell = cellCenter(p(2, 1), BOARD_HEX_SIZE, 'pointy');
    const brazierCircle = container.querySelector(
      '[data-placement="1"] circle'
    ) as SVGCircleElement;
    expect(Number(brazierCircle.getAttribute('cx'))).toBeCloseTo(
      brazierCell.x,
      6
    );
    expect(Number(brazierCircle.getAttribute('cy'))).toBeCloseTo(
      brazierCell.y,
      6
    );
    expect(container.querySelector('[data-facing-tick="1"]')).toBeNull();
  });
});

describe('wall gesture affordances (#804)', () => {
  function walledDoc() {
    let doc = emptyDungeon();
    for (const [c, r] of [
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
    ] as const) {
      doc = paintCell(doc, 'region-1', p(c, r));
    }
    return addWalls(doc, [[p(1, 1), p(2, 1)]]);
  }

  it('selecting a wall shows a handle at each chain endpoint — manipulation rides selection', () => {
    const doc = walledDoc();
    const { container } = mount(doc, {
      tool: 'select',
      selection: { kind: 'wall', edges: wallEdges(doc) },
    });
    // One single-edge run: two endpoint vertices, each with exactly one
    // incident run, visible the moment the wall is selected.
    const handles = container.querySelectorAll('[data-run-vertex]');
    expect(handles).toHaveLength(2);
    handles.forEach((h) => expect(h.getAttribute('data-run-vertex')).toBe('1'));
  });

  it('the wall tool draws — it shows no handles (continuing a wall presses at its end)', () => {
    const { container } = mount(walledDoc(), { tool: 'wall' });
    expect(container.querySelectorAll('[data-run-vertex]')).toHaveLength(0);
  });

  it('an unselected board shows no handles under the select tool', () => {
    const { container } = mount(walledDoc(), { tool: 'select' });
    expect(container.querySelectorAll('[data-run-vertex]')).toHaveLength(0);
  });

  it('a wall selection highlights the run whose edges it holds', () => {
    const doc = walledDoc();
    const { container } = mount(doc, {
      tool: 'select',
      selection: { kind: 'wall', edges: wallEdges(doc) },
    });
    const selected = container.querySelectorAll('[data-run][data-selected]');
    expect(selected).toHaveLength(1);
  });
});

/**
 * Press–move–release integration (#804, Copilot review on PR #808):
 * the pure module pins the derivation; these pin the PLUMBING — that a
 * DOM drag reaches onWallDraw/onWallErase/onDoorDraw/onWallReshape
 * with the exact taut chain. jsdom has no SVG layout, so `svgPoint`'s
 * CTM path is enabled with a scoped identity polyfill: `getScreenCTM`
 * returns an identity whose inverse maps client coords straight to SVG
 * user space, and events carry SVG coordinates in clientX/clientY.
 */
describe('gesture plumbing — press, drag, release (#804)', () => {
  const S = BOARD_HEX_SIZE;
  const ref = (c: number, r: number, corner: number): CornerRef => ({
    cell: p(c, r),
    corner,
  });
  const pt = (r: CornerRef) => cornerPoint(r, S, 'pointy');
  const keys = (edges: readonly Edge[]) => edges.map(edgeKey);

  beforeEach(() => {
    vi.stubGlobal(
      'DOMPoint',
      class {
        x: number;
        y: number;
        constructor(x = 0, y = 0) {
          this.x = x;
          this.y = y;
        }
        matrixTransform() {
          return { x: this.x, y: this.y };
        }
      }
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function floorDoc() {
    let doc = emptyDungeon();
    for (const [c, r] of [
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
    ] as const) {
      doc = paintCell(doc, 'region-1', p(c, r));
    }
    return doc;
  }

  function enableSvgCtm(container: HTMLElement) {
    const svg = container.querySelector('svg')!;
    (svg as unknown as { getScreenCTM: () => unknown }).getScreenCTM = () => ({
      inverse: () => ({}),
    });
    return svg;
  }

  const at = (point: { x: number; y: number }) => ({
    button: 0,
    clientX: point.x,
    clientY: point.y,
  });

  // A = top of the col1|2 seam's row-1 edge, B = bottom of its row-2
  // edge — the expected chain is the module's own tautPath, pinned
  // exactly in wallGesture.test.ts.
  const A = ref(1, 1, 0); // (√3·2, 1)·size
  const B = ref(2, 2, 3); // (√3·1.5, 3.5)·size
  const expectedChain = () => tautPath(A, B, S, 'pointy');

  it('a wall drag commits the derived chain through onWallDraw', () => {
    const onWallDraw = vi.fn();
    const { container } = mount(floorDoc(), { tool: 'wall', onWallDraw });
    const svg = enableSvgCtm(container);
    fireEvent.pointerDown(cellEl(container, 1, 1), at(pt(A)));
    fireEvent.pointerMove(cellEl(container, 2, 2), at(pt(B)));
    fireEvent.pointerUp(svg);
    expect(onWallDraw).toHaveBeenCalledTimes(1);
    expect(keys(onWallDraw.mock.calls[0][0])).toEqual(keys(expectedChain()));
    expect(expectedChain().length).toBeGreaterThan(0);
  });

  it('a shift-drag erases along the same derived path through onWallErase', () => {
    const onWallErase = vi.fn();
    const doc = addWalls(floorDoc(), expectedChain());
    const { container } = mount(doc, { tool: 'wall', onWallErase });
    const svg = enableSvgCtm(container);
    fireEvent.pointerDown(cellEl(container, 1, 1), {
      ...at(pt(A)),
      shiftKey: true,
    });
    fireEvent.pointerMove(cellEl(container, 2, 2), at(pt(B)));
    fireEvent.pointerUp(svg);
    expect(onWallErase).toHaveBeenCalledTimes(1);
    expect(keys(onWallErase.mock.calls[0][0])).toEqual(keys(expectedChain()));
  });

  it('a door drag commits ONE chain through onDoorDraw', () => {
    const onDoorDraw = vi.fn();
    const { container } = mount(floorDoc(), { tool: 'door', onDoorDraw });
    const svg = enableSvgCtm(container);
    fireEvent.pointerDown(cellEl(container, 1, 1), at(pt(A)));
    fireEvent.pointerMove(cellEl(container, 2, 2), at(pt(B)));
    fireEvent.pointerUp(svg);
    expect(onDoorDraw).toHaveBeenCalledTimes(1);
    expect(keys(onDoorDraw.mock.calls[0][0])).toEqual(keys(expectedChain()));
  });

  it('grabbing a selected wall’s handle re-derives the chain through onWallReshape', () => {
    const onWallReshape = vi.fn();
    const wall: Edge[] = [[p(1, 1), p(2, 1)]];
    const doc = addWalls(floorDoc(), wall);
    const { container } = mount(doc, {
      tool: 'select',
      selection: { kind: 'wall', edges: wallEdges(doc) },
      onWallReshape,
    });
    const svg = enableSvgCtm(container);
    // The handle sits at the RENDERED endpoint; grab the bottom one.
    const vertices = runVertices(boardWallScene(doc, S)!.runs, S, 'pointy');
    const bottom = vertices.reduce((acc, v) =>
      v.point.y > acc.point.y ? v : acc
    );
    const target = ref(1, 1, 2); // (√3·1.5, 2.5)·size
    fireEvent.pointerDown(cellEl(container, 1, 1), at(bottom.point));
    fireEvent.pointerMove(cellEl(container, 1, 1), at(pt(target)));
    fireEvent.pointerUp(svg);
    expect(onWallReshape).toHaveBeenCalledTimes(1);
    const [oldChains, newChains] = onWallReshape.mock.calls[0];
    expect(oldChains.map(keys)).toEqual([keys(wall)]);
    const far = vertices.find((v) => v !== bottom)!;
    expect(newChains.map(keys)).toEqual([
      keys(tautPath(far.ref, target, S, 'pointy')),
    ]);
  });

  it('a canceled pointer drops the gesture without committing', () => {
    const onWallDraw = vi.fn();
    const { container } = mount(floorDoc(), { tool: 'wall', onWallDraw });
    const svg = enableSvgCtm(container);
    fireEvent.pointerDown(cellEl(container, 1, 1), at(pt(A)));
    fireEvent.pointerMove(cellEl(container, 2, 2), at(pt(B)));
    fireEvent.pointerCancel(svg);
    fireEvent.pointerUp(svg); // a later unrelated release commits nothing
    expect(onWallDraw).not.toHaveBeenCalled();
  });
});

/**
 * Kirk's round-2 walk finding ("I cannot get that upper right corner to
 * snap in", again): verified NOT reproducible through the board's real
 * pointer path at this head — these two scenarios pin the whole chain
 * end-to-end (press snapping, move snapping, commit, and the rendered
 * join), so a future preview/commit path that bypassed the magnetism
 * would fail here, not on a walk.
 */
describe('one wall at a time (rpg-dnd5e-web#902)', () => {
  it('a click with the wall tool reports ONE edge, not the run under it', () => {
    // Kirk's flow: draw two rooms, then "select a wall and delete it and only
    // it" to open a doorway. A press that does not travel is a single-edge
    // toggle; a run-wide erase would need a drag.
    let doc = emptyDungeon();
    for (let c = 0; c <= 3; c += 1) {
      for (let r = 0; r <= 2; r += 1) doc = paintCell(doc, 'region-1', p(c, r));
    }
    doc = wallRoom(doc, p(1, 0), p(2, 2));
    expect(doc.walls[0].edges.length).toBeGreaterThan(1);

    const onEdgeClick = vi.fn();
    const onWallErase = vi.fn();
    const { container } = mount(doc, {
      tool: 'wall',
      onEdgeClick,
      onWallErase,
    });
    fireEvent.pointerDown(cellEl(container, 1, 1), { button: 0 });
    fireEvent.pointerUp(container.querySelector('svg')!);

    expect(onEdgeClick).toHaveBeenCalledTimes(1);
    expect(onWallErase).not.toHaveBeenCalled();
    // One edge came back, not a chain.
    expect(onEdgeClick.mock.calls[0][0]).toHaveLength(2);
  });

  it('toggling an edge of a room run removes that edge and leaves the rest', () => {
    let doc = emptyDungeon();
    for (let c = 0; c <= 3; c += 1) {
      for (let r = 0; r <= 2; r += 1) doc = paintCell(doc, 'region-1', p(c, r));
    }
    doc = wallRoom(doc, p(1, 0), p(2, 2));
    const run = doc.walls[0].edges;
    const before = run.length;

    const opened = toggleWall(doc, run[0]);
    expect(wallEdges(opened)).toHaveLength(before - 1);
    // The rest of the room's wall is untouched — this is a doorway, not a
    // demolition.
    expect(wallEdges(opened).map(edgeKey)).toEqual(run.slice(1).map(edgeKey));
  });
});

describe('the implied envelope is drawn (rpg-dnd5e-web#902)', () => {
  it('outlines the floor so a freshly dragged room reads as a room', () => {
    // One cell: six crossings into void, so six envelope segments.
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(2, 2));
    const { container, unmount } = mount(doc, { tool: 'room' });
    const envelope = () =>
      [...container.querySelectorAll('[data-edge^="env:"]')].length;
    expect(envelope()).toBe(6);
    unmount();

    // Two neighbours share an edge, so that crossing is NOT envelope:
    // 12 sides minus the 2 half-edges they share = 10.
    let pair = emptyDungeon();
    pair = paintCell(pair, 'region-1', p(2, 2));
    pair = paintCell(pair, 'region-1', p(3, 2));
    const { container: c2 } = mount(pair, { tool: 'room' });
    expect([...c2.querySelectorAll('[data-edge^="env:"]')]).toHaveLength(10);
  });

  it('is drawn dimmer than an authored wall, because it is implied not written', () => {
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(2, 2));
    const { container } = mount(doc, { tool: 'select' });
    const env = container.querySelector('[data-edge^="env:"]')!;
    expect(env).toBeTruthy();
    // The envelope is a fact about the floor's edge, not a line in the file,
    // so it must not be mistakable for an authored wall.
    expect(env.getAttribute('stroke')).toBe(ENVELOPE_STROKE);
    expect(env.getAttribute('stroke')).not.toBe(WALL_STROKE);
    expect(Number(env.getAttribute('stroke-width'))).toBeLessThan(4);
  });
});

describe('the room tool paints a rectangle (rpg-dnd5e-web#902)', () => {
  it('commits the two dragged corners, and previews exactly what it will paint', () => {
    let doc = emptyDungeon();
    // A patch of floor so the board has an extent to render.
    for (let c = 0; c <= 6; c += 1) {
      for (let r = 0; r <= 4; r += 1) doc = paintCell(doc, 'region-1', p(c, r));
    }
    const onPaintRoom = vi.fn();
    const { container } = mount(doc, { tool: 'room', onPaintRoom });

    fireEvent.pointerDown(cellEl(container, 1, 1), { button: 0 });
    fireEvent.pointerEnter(cellEl(container, 3, 3));

    // The preview IS the commit: every cell of the 3x3 block is marked, and
    // nothing outside it is.
    const previewed = [...container.querySelectorAll('[data-cell]')].filter(
      (el) => el.getAttribute('opacity') === '0.85'
    );
    expect(previewed).toHaveLength(9);

    fireEvent.pointerUp(container.querySelector('svg')!);
    expect(onPaintRoom).toHaveBeenCalledTimes(1);
    const [from, to] = onPaintRoom.mock.calls[0];
    expect(toOffset('pointy', from)).toEqual([1, 1]);
    expect(toOffset('pointy', to)).toEqual([3, 3]);
  });

  it('a press with no travel is a one-cell room, not a no-op', () => {
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(1, 1));
    const onPaintRoom = vi.fn();
    const { container } = mount(doc, { tool: 'room', onPaintRoom });
    fireEvent.pointerDown(cellEl(container, 1, 1), { button: 0 });
    fireEvent.pointerUp(container.querySelector('svg')!);
    expect(onPaintRoom).toHaveBeenCalledTimes(1);
  });

  it('a canceled pointer drops the room without painting it', () => {
    let doc = emptyDungeon();
    for (let c = 0; c <= 3; c += 1) doc = paintCell(doc, 'region-1', p(c, 1));
    const onPaintRoom = vi.fn();
    const { container } = mount(doc, { tool: 'room', onPaintRoom });
    fireEvent.pointerDown(cellEl(container, 1, 1), { button: 0 });
    fireEvent.pointerEnter(cellEl(container, 3, 1));
    fireEvent.pointerCancel(container.querySelector('svg')!);
    fireEvent.pointerUp(container.querySelector('svg')!);
    expect(onPaintRoom).not.toHaveBeenCalled();
  });
});

describe('corner capture through the real pointer path (#804 walk round 2)', () => {
  const S = BOARD_HEX_SIZE;
  const ref = (c: number, r: number, corner: number): CornerRef => ({
    cell: p(c, r),
    corner,
  });
  const pt = (r: CornerRef) => cornerPoint(r, S, 'pointy');

  beforeEach(() => {
    vi.stubGlobal(
      'DOMPoint',
      class {
        x: number;
        y: number;
        constructor(x = 0, y = 0) {
          this.x = x;
          this.y = y;
        }
        matrixTransform() {
          return { x: this.x, y: this.y };
        }
      }
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function bigFloor(): DungeonDoc {
    let doc = emptyDungeon();
    for (let row = 0; row <= 8; row += 1) {
      for (let col = 0; col <= 9; col += 1) {
        doc = paintCell(doc, 'region-1', p(col, row));
      }
    }
    return doc;
  }

  function boardDrag(
    doc: DungeonDoc,
    from: { x: number; y: number },
    to: { x: number; y: number }
  ): Edge[] {
    const onWallDraw = vi.fn();
    const { container, unmount } = mount(doc, { tool: 'wall', onWallDraw });
    const svg = container.querySelector('svg')!;
    (svg as unknown as { getScreenCTM: () => unknown }).getScreenCTM = () => ({
      inverse: () => ({}),
    });
    const cell = cellEl(container, 2, 2);
    fireEvent.pointerDown(cell, {
      button: 0,
      clientX: from.x,
      clientY: from.y,
    });
    fireEvent.pointerMove(cell, { clientX: to.x, clientY: to.y });
    fireEvent.pointerUp(svg);
    unmount();
    expect(onWallDraw).toHaveBeenCalledTimes(1);
    return onWallDraw.mock.calls[0][0] as Edge[];
  }

  /** The diagonal chain's far end: its chain-end lattice ref, its
   * rendered (drawn) endpoint, and the outward direction of the run. */
  function drawnEndOf(doc: DungeonDoc, near: CornerRef) {
    const scene = boardWallScene(doc, S)!;
    expect(scene.runs).toHaveLength(1);
    const run = scene.runs[0];
    const nearP = pt(near);
    const endRef = chainEndpoints(run.edges, S, 'pointy').reduce((acc, e) => {
      const pe = cornerPoint(e, S, 'pointy');
      const pa = cornerPoint(acc, S, 'pointy');
      return Math.hypot(pe.x - nearP.x, pe.y - nearP.y) <
        Math.hypot(pa.x - nearP.x, pa.y - nearP.y)
        ? e
        : acc;
    });
    const lp = cornerPoint(endRef, S, 'pointy');
    const drawn =
      Math.hypot(run.a.x - lp.x, run.a.y - lp.y) <
      Math.hypot(run.b.x - lp.x, run.b.y - lp.y)
        ? run.a
        : run.b;
    const other = drawn === run.a ? run.b : run.a;
    const len = Math.hypot(drawn.x - other.x, drawn.y - other.y);
    return {
      endRef,
      drawn,
      dir: { x: (drawn.x - other.x) / len, y: (drawn.y - other.y) / len },
    };
  }

  it('a second drag aimed just past a diagonal chain’s DRAWN end shares its vertex and the runs join', () => {
    const doc = bigFloor();
    const chain1 = boardDrag(doc, pt(ref(1, 1, 0)), pt(ref(5, 5, 1)));
    const doc1 = addWalls(doc, chain1);
    const { endRef, drawn, dir } = drawnEndOf(doc1, ref(5, 5, 1));
    const aim = {
      x: drawn.x + dir.x * 0.15 * S,
      y: drawn.y + dir.y * 0.15 * S,
    };
    const chain2 = boardDrag(doc1, pt(ref(8, 7, 1)), aim);
    expect(
      chainEndpoints(chain2, S, 'pointy').some((e) =>
        sameCorner(e, endRef, S, 'pointy')
      )
    ).toBe(true);
    // The rendered picture closes: the two runs' facing endpoints meet
    // within the corner-overlap miter, never a lateral gap.
    const scene = boardWallScene(addWalls(doc1, chain2), S)!;
    expect(scene.runs).toHaveLength(2);
    let minGap = Infinity;
    for (const q of [scene.runs[0].a, scene.runs[0].b]) {
      for (const w of [scene.runs[1].a, scene.runs[1].b]) {
        minGap = Math.min(minGap, Math.hypot(q.x - w.x, q.y - w.y));
      }
    }
    expect(minGap).toBeLessThan(0.35 * S);
  });

  it('pressing ON a drawn end and dragging onward CONTINUES the wall — one merged run', () => {
    const doc = bigFloor();
    const chain1 = boardDrag(doc, pt(ref(1, 1, 0)), pt(ref(5, 5, 1)));
    const doc1 = addWalls(doc, chain1);
    const { endRef, drawn, dir } = drawnEndOf(doc1, ref(5, 5, 1));
    const release = { x: drawn.x + dir.x * 3 * S, y: drawn.y + dir.y * 3 * S };
    const chain2 = boardDrag(doc1, drawn, release);
    expect(
      chainEndpoints(chain2, S, 'pointy').some((e) =>
        sameCorner(e, endRef, S, 'pointy')
      )
    ).toBe(true);
    // Near-collinear + shared vertex: the shared module fuses the two
    // chains into ONE straight run — continuation leaves no seam.
    expect(boardWallScene(addWalls(doc1, chain2), S)!.runs).toHaveLength(1);
  });
});
