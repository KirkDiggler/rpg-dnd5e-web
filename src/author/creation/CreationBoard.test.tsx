/**
 * The board's tools act through the document; these drive the SVG with
 * pointer events and assert on the document the callbacks produce.
 */
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  emptyDungeon,
  eraseCell,
  paintCell,
  placeAt,
  toggleWall,
  type DungeonDoc,
} from '../dungeonYaml';
import { axialKey, fromOffset, type Edge } from '../hexOffset';
import { cellCenter, growBounds, neededBounds } from './canvasGeometry';
import {
  BOARD_HEX_SIZE,
  BOARD_SCALE,
  CreationBoard,
  type CreationBoardProps,
} from './CreationBoard';

const p = (c: number, r: number) => fromOffset('pointy', [c, r]);

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
      onPaint={(c) => calls.paint.push(axialKey(c))}
      onErase={(c) => calls.erase.push(axialKey(c))}
      onEdgeClick={(e) => calls.edges.push(e)}
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
    expect(calls.edges).toHaveLength(0);
  });

  it('the wall tool reports an edge from a floor cell to one of its six neighbours', () => {
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(1, 1));
    doc = paintCell(doc, 'region-1', p(2, 1));
    const { container, calls } = mount(doc, { tool: 'wall' });
    fireEvent.pointerDown(cellEl(container, 1, 1), { button: 0 });
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

  it('draws a declared wall and a door edge, and highlights error targets in red', () => {
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
    expect(container.querySelectorAll('[data-edge^="w:"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-edge^="d:"]')).toHaveLength(1);
    expect(cellEl(container, 3, 1).getAttribute('stroke')).toBe('#ff3b30');
    expect(cellEl(container, 2, 1).getAttribute('stroke')).not.toBe('#ff3b30');
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
        onPaint={() => {}}
        onErase={() => {}}
        onEdgeClick={() => {}}
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
        onPaint={() => {}}
        onErase={() => {}}
        onEdgeClick={() => {}}
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
