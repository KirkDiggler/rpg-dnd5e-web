/**
 * The board's tools act through the document; these drive the SVG with
 * pointer events and assert on the document the callbacks produce.
 */
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  emptyDungeon,
  paintCell,
  toggleWall,
  type DungeonDoc,
} from '../dungeonYaml';
import { axialKey, fromOffset, type Edge } from '../hexOffset';
import { CreationBoard, type CreationBoardProps } from './CreationBoard';

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
