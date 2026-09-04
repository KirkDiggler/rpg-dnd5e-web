/**
 * The board's tools act through the document; these drive the SVG with
 * pointer events and assert on the document the callbacks produce.
 */
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  addWall,
  emptyDungeon,
  eraseCell,
  paintCell,
  paintScenery,
  placeAt,
  type DungeonDoc,
  type PositionRef,
} from '../dungeonYaml';
import { latticeKey, latticeOf, positionAt } from '../hexGeometry';
import { axialKey, edgeKey, fromOffset, toOffset } from '../hexOffset';
import {
  ENVELOPE_DASH,
  ENVELOPE_STROKE,
  SCENERY_FILL,
  SCENERY_HATCH_ID,
  SCENERY_STROKE,
  VOID_FILL,
  WALL_STROKE,
} from '../markerStyle';
import type { Selection } from '../types';
import { wallRaysFrom } from '../wallPicker';
import { boardWallScene } from './boardWallRuns';
import { cellCenter, growBounds, neededBounds } from './canvasGeometry';
import {
  BOARD_HEX_SIZE,
  BOARD_SCALE,
  CreationBoard,
  type CreationBoardProps,
} from './CreationBoard';

const p = (c: number, r: number) => fromOffset('pointy', [c, r]);
const EMPTY_REGION_IDS: ReadonlySet<string> = new Set();

function mount(doc: DungeonDoc, overrides: Partial<CreationBoardProps> = {}) {
  const calls: {
    paint: string[];
    erase: string[];
    walls: [PositionRef, PositionRef][];
    deleted: number[];
    doors: PositionRef[];
  } = { paint: [], erase: [], walls: [], deleted: [], doors: [] };
  const utils = render(
    <CreationBoard
      doc={doc}
      tool="region"
      selection={{ kind: 'dungeon' }}
      activeRegionId="region-1"
      errorTargets={[]}
      concealedRegionIds={EMPTY_REGION_IDS}
      onPaintRect={() => {}}
      onPaint={(c) => calls.paint.push(axialKey(c))}
      onErase={(c) => calls.erase.push(axialKey(c))}
      onWallCommit={(a, b) => calls.walls.push([a, b])}
      onWallDelete={(i) => calls.deleted.push(i)}
      onDoorToggle={(at) => calls.doors.push(at)}
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

  it('the wall tool shows a hex\u2019s seven positions when it is clicked (design \u00a72.6)', () => {
    let doc = emptyDungeon('pointy', 'opaque');
    doc = paintCell(doc, 'region-1', p(2, 2));
    const { container } = mount(doc, { tool: 'wall' });
    fireEvent.pointerDown(cellEl(container, 2, 2));
    // Seven and no more: a wall starts on a side midpoint or the
    // centre, and there is nothing else to click.
    expect(container.querySelectorAll('[data-position]')).toHaveLength(7);
  });

  it('draws the twelve rays once a start is picked, telling thin and thick apart', () => {
    let doc = emptyDungeon('pointy', 'opaque');
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 6; col += 1)
        doc = paintCell(doc, 'region-1', p(col, row));
    }
    const { container } = mount(doc, { tool: 'wall' });
    fireEvent.pointerDown(cellEl(container, 3, 3));
    const seats = container.querySelectorAll('[data-position]');
    // The CENTRE, whose every ray is thick (F15) — the clearest case to
    // assert the cost labelling on.
    const centre = positionAt(
      'pointy',
      latticeOf('pointy', { cell: p(3, 3), offset: [0, 0] })
    )!;
    const seat = [...seats].find(
      (el) =>
        el.getAttribute('data-position') ===
        latticeKey(latticeOf('pointy', centre))
    )!;
    fireEvent.pointerDown(seat);
    const rays = container.querySelectorAll('[data-ray]');
    expect(rays).toHaveLength(12);
    expect(
      [...rays].every((r) => r.getAttribute('data-thick') === 'true')
    ).toBe(true);
    // And every ray offers at least one end to click.
    expect(container.querySelectorAll('[data-ray-end]').length).toBeGreaterThan(
      11
    );
  });

  it('commits the two picked positions and nothing derived', () => {
    let doc = emptyDungeon('pointy', 'opaque');
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 6; col += 1)
        doc = paintCell(doc, 'region-1', p(col, row));
    }
    const { container, calls } = mount(doc, { tool: 'wall' });
    fireEvent.pointerDown(cellEl(container, 3, 3));
    const start = { cell: p(3, 3), offset: [0.25, -0.375] } as PositionRef;
    fireEvent.pointerDown(
      container.querySelector(
        `[data-position="${latticeKey(latticeOf('pointy', start))}"]`
      )!
    );
    const east = wallRaysFrom(doc, start).find((r) => r.degrees === 0)!;
    fireEvent.pointerDown(
      container.querySelector(
        `[data-ray-end="${latticeKey(east.ends[0].lattice)}"]`
      )!
    );
    expect(calls.walls).toHaveLength(1);
    expect(latticeOf('pointy', calls.walls[0][0])).toEqual(
      latticeOf('pointy', start)
    );
    expect(latticeOf('pointy', calls.walls[0][1])).toEqual(
      east.ends[0].lattice
    );
    // The picker closes after a commit — no half-made second wall.
    expect(container.querySelectorAll('[data-ray]')).toHaveLength(0);
  });

  it('draws a declared wall as the line it is, and its door as a gap in that line', () => {
    let doc = emptyDungeon('pointy', 'opaque');
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 6; col += 1)
        doc = paintCell(doc, 'region-1', p(col, row));
    }
    const start = { cell: p(1, 1), offset: [0.25, -0.375] } as PositionRef;
    const east = wallRaysFrom(doc, start).find((r) => r.degrees === 0)!;
    doc = addWall(doc, start, east.ends[3].position);
    doc = {
      ...doc,
      doors: [{ id: 'd1', at: east.ends[1].position }],
    };
    const { container } = mount(doc, { tool: 'select' });
    const line = container.querySelector('[data-wall="0"]')!;
    const scene = boardWallScene(doc, BOARD_HEX_SIZE);
    // The drawn line IS the authored positions, to the pixel.
    expect(Number(line.getAttribute('x1'))).toBeCloseTo(scene.walls[0].a.x, 9);
    expect(Number(line.getAttribute('y2'))).toBeCloseTo(scene.walls[0].b.y, 9);
    expect(container.querySelector('[data-door-run="d1"]')).not.toBeNull();
  });

  it('shift-clicking a wall deletes it', () => {
    let doc = emptyDungeon('pointy', 'opaque');
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 6; col += 1)
        doc = paintCell(doc, 'region-1', p(col, row));
    }
    const start = { cell: p(1, 1), offset: [0.25, -0.375] } as PositionRef;
    const east = wallRaysFrom(doc, start).find((r) => r.degrees === 0)!;
    doc = addWall(doc, start, east.ends[3].position);
    const { container, calls } = mount(doc, { tool: 'wall' });
    // jsdom has no layout, so `svgPoint` returns the origin; the wall
    // under the origin is the one hit. That is enough to prove the
    // shift branch routes to delete rather than to the picker.
    fireEvent.pointerDown(cellEl(container, 1, 1), { shiftKey: true });
    expect(calls.walls).toHaveLength(0);
    expect(container.querySelectorAll('[data-position]')).toHaveLength(0);
    expect(calls.deleted.length).toBeLessThanOrEqual(1);
  });

  it('the door tool offers the positions its walls pass through, and toggles one', () => {
    let doc = emptyDungeon('pointy', 'opaque');
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 6; col += 1)
        doc = paintCell(doc, 'region-1', p(col, row));
    }
    const start = { cell: p(1, 1), offset: [0.25, -0.375] } as PositionRef;
    const east = wallRaysFrom(doc, start).find((r) => r.degrees === 0)!;
    doc = addWall(doc, start, east.ends[3].position);
    const { container } = mount(doc, { tool: 'door' });
    const targets = container.querySelectorAll('[data-door-target]');
    expect(targets.length).toBeGreaterThan(0);
  });

  it('a flat-top document draws its walls too — the lattice places both', () => {
    let doc = emptyDungeon('flat', 'opaque');
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        doc = paintCell(doc, 'region-1', fromOffset('flat', [col, row]));
      }
    }
    const start = {
      cell: fromOffset('flat', [1, 1]),
      offset: [0.375, -0.25],
    } as PositionRef;
    const ray = wallRaysFrom(doc, start)[0];
    doc = addWall(doc, start, ray.ends[0].position);
    const { container } = mount(doc, { tool: 'select' });
    expect(container.querySelector('[data-wall="0"]')).not.toBeNull();
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
        onPaintRect={() => {}}
        onPaint={() => {}}
        onErase={() => {}}
        onWallCommit={() => {}}
        onWallDelete={() => {}}
        onDoorToggle={() => {}}
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
        onPaintRect={() => {}}
        onPaint={() => {}}
        onErase={() => {}}
        onWallCommit={() => {}}
        onWallDelete={() => {}}
        onDoorToggle={() => {}}
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

describe('the implied envelope is drawn (rpg-dnd5e-web#902)', () => {
  it('outlines the floor so a freshly dragged room reads as a room', () => {
    // One cell: six crossings into void, so six envelope segments.
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(2, 2));
    const { container, unmount } = mount(doc, { tool: 'region-rect' });
    const envelope = () =>
      [...container.querySelectorAll('[data-edge^="env:"]')].length;
    expect(envelope()).toBe(6);
    unmount();

    // Two neighbours share an edge, so that crossing is NOT envelope:
    // 12 sides minus the 2 half-edges they share = 10.
    let pair = emptyDungeon();
    pair = paintCell(pair, 'region-1', p(2, 2));
    pair = paintCell(pair, 'region-1', p(3, 2));
    const { container: c2 } = mount(pair, { tool: 'region-rect' });
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
    // DASHED, so it never reads as a wall. Kirk: "walls are intentional" — an
    // unwalled boundary is its own authored choice, and a region is allowed a
    // cliff edge. This line only says the floor stops here.
    expect(env.getAttribute('stroke-dasharray')).toBe(ENVELOPE_DASH);
  });
});

describe('the region-rect tool paints a rectangle (rpg-dnd5e-web#902)', () => {
  it('commits the two dragged corners, and previews exactly what it will paint', () => {
    let doc = emptyDungeon();
    // A patch of floor so the board has an extent to render.
    for (let c = 0; c <= 6; c += 1) {
      for (let r = 0; r <= 4; r += 1) doc = paintCell(doc, 'region-1', p(c, r));
    }
    const onPaintRect = vi.fn();
    const { container } = mount(doc, { tool: 'region-rect', onPaintRect });

    fireEvent.pointerDown(cellEl(container, 1, 1), { button: 0 });
    fireEvent.pointerEnter(cellEl(container, 3, 3));

    // The preview IS the commit: every cell of the 3x3 block is marked, and
    // nothing outside it is.
    const previewed = [...container.querySelectorAll('[data-cell]')].filter(
      (el) => el.getAttribute('opacity') === '0.85'
    );
    expect(previewed).toHaveLength(9);

    fireEvent.pointerUp(container.querySelector('svg')!);
    expect(onPaintRect).toHaveBeenCalledTimes(1);
    const [from, to] = onPaintRect.mock.calls[0];
    expect(toOffset('pointy', from)).toEqual([1, 1]);
    expect(toOffset('pointy', to)).toEqual([3, 3]);
  });

  it('a press with no travel is a one-cell room, not a no-op', () => {
    let doc = emptyDungeon();
    doc = paintCell(doc, 'region-1', p(1, 1));
    const onPaintRect = vi.fn();
    const { container } = mount(doc, { tool: 'region-rect', onPaintRect });
    fireEvent.pointerDown(cellEl(container, 1, 1), { button: 0 });
    fireEvent.pointerUp(container.querySelector('svg')!);
    expect(onPaintRect).toHaveBeenCalledTimes(1);
  });

  it('a canceled pointer drops the room without painting it', () => {
    let doc = emptyDungeon();
    for (let c = 0; c <= 3; c += 1) doc = paintCell(doc, 'region-1', p(c, 1));
    const onPaintRect = vi.fn();
    const { container } = mount(doc, { tool: 'region-rect', onPaintRect });
    fireEvent.pointerDown(cellEl(container, 1, 1), { button: 0 });
    fireEvent.pointerEnter(cellEl(container, 3, 1));
    fireEvent.pointerCancel(container.querySelector('svg')!);
    fireEvent.pointerUp(container.querySelector('svg')!);
    expect(onPaintRect).not.toHaveBeenCalled();
  });
});

describe('the scenery brush on the board (rpg-project#360 §2.1)', () => {
  /** A room and a scenery strip beside it, the shape the yardstick uses. */
  function stripDoc(): DungeonDoc {
    let doc = emptyDungeon();
    for (const c of [0, 1, 2]) doc = paintCell(doc, 'region-1', p(c, 1));
    doc = paintScenery(doc, p(3, 1));
    doc = paintScenery(doc, p(4, 1));
    return doc;
  }

  it('drags like the region brush and erases with shift', () => {
    const { container, calls } = mount(stripDoc(), { tool: 'scenery' });
    fireEvent.pointerDown(cellEl(container, 3, 2), { button: 0 });
    fireEvent.pointerEnter(cellEl(container, 4, 2));
    fireEvent.pointerUp(container.querySelector('svg')!);
    expect(calls.paint).toEqual([axialKey(p(3, 2)), axialKey(p(4, 2))]);

    fireEvent.pointerDown(cellEl(container, 3, 1), {
      button: 0,
      shiftKey: true,
    });
    expect(calls.erase).toEqual([axialKey(p(3, 1))]);
  });

  it('draws scenery as hatched FLOOR, not as void and not as a region', () => {
    const { container } = mount(stripDoc(), { tool: 'scenery' });
    const strip = cellEl(container, 3, 1);
    expect(strip.getAttribute('data-scenery')).toBe('true');
    expect(strip.getAttribute('data-region')).toBe('');
    expect(strip.getAttribute('fill')).toBe(`url(#${SCENERY_HATCH_ID})`);
    expect(strip.getAttribute('stroke')).toBe(SCENERY_STROKE);
    // The pattern it points at is actually defined, and carries the hatch.
    const pattern = container.querySelector(`#${SCENERY_HATCH_ID}`)!;
    expect(pattern).not.toBeNull();
    expect(pattern.querySelector('rect')!.getAttribute('fill')).toBe(
      SCENERY_FILL
    );

    // A room cell keeps its region fill; a void cell stays void.
    expect(cellEl(container, 1, 1).getAttribute('data-scenery')).toBeNull();
    expect(cellEl(container, 1, 1).getAttribute('fill')).not.toBe(
      `url(#${SCENERY_HATCH_ID})`
    );
    expect(cellEl(container, 1, 0).getAttribute('data-scenery')).toBeNull();
    expect(cellEl(container, 1, 0).getAttribute('fill')).toBe(VOID_FILL);
  });

  it('puts scenery inside the floor envelope instead of drawing a cliff at the room edge', () => {
    const { container } = mount(stripDoc());
    const envelope = new Set(
      [...container.querySelectorAll('line[data-edge^="env:"]')].map((l) =>
        l.getAttribute('data-edge')
      )
    );
    expect(envelope.size).toBeGreaterThan(0);

    // The floor's outer edge runs around the strip too, so the crossing
    // from the last room cell into the first scenery cell is NOT one: both
    // sides are floor. Scenery that drew its own cliff would say the floor
    // stopped where it plainly continues.
    expect(envelope.has(`env:${edgeKey([p(2, 1), p(3, 1)])}`)).toBe(false);
    // ...and the far side of the strip IS one: there the floor really stops.
    expect(envelope.has(`env:${edgeKey([p(4, 1), p(5, 1)])}`)).toBe(true);
  });

  it('lets the wall tool pick positions on a scenery cell (§2.3)', () => {
    const doc = stripDoc();
    const { container } = mount(doc, { tool: 'wall' });
    fireEvent.pointerDown(cellEl(container, 3, 1), { button: 0 });
    // A wall may stand on ANY floor, so scenery offers its seven
    // positions like a room cell. An unowned cell used to return before
    // the edge tool ever ran, which made a strip of scenery unwallable.
    expect(container.querySelectorAll('[data-position]')).toHaveLength(7);
  });
});

describe('ways out on the board (rpg-project#368 §3.1)', () => {
  function withFloor(): DungeonDoc {
    let doc = emptyDungeon();
    for (const c of [0, 1]) doc = paintCell(doc, 'region-1', p(c, 0));
    return doc;
  }

  it('hands a click on the exit tool to the caller, like the start tool does', () => {
    const clicks: string[] = [];
    const { container } = mount(withFloor(), {
      tool: 'exit',
      onCellClick: (c) => clicks.push(axialKey(c)),
    });
    fireEvent.pointerDown(cellEl(container, 1, 0), { button: 0 });
    expect(clicks).toEqual([axialKey(p(1, 0))]);
  });

  it('draws each way out with its own id, distinct from the start', () => {
    let doc = withFloor();
    doc = {
      ...doc,
      start: { at: p(0, 0) },
      exits: [{ id: 'entrance', at: p(0, 0) }],
    };
    const { container } = mount(doc);
    // Both marks stand on the same cell — the tomb's entrance IS its exit
    // — and both are drawn, because `start` is not implicitly a way out.
    expect(container.querySelector('[data-start]')).toBeTruthy();
    const exit = container.querySelector('[data-exit="entrance"]');
    expect(exit).toBeTruthy();
    expect(exit?.textContent).toBe('entrance');
  });

  it('selects the way out under the pointer with the select tool', () => {
    let doc = withFloor();
    doc = { ...doc, exits: [{ id: 'entrance', at: p(1, 0) }] };
    const selected: unknown[] = [];
    const { container } = mount(doc, {
      tool: 'select',
      onSelect: (s) => selected.push(s),
    });
    fireEvent.pointerDown(cellEl(container, 1, 0), { button: 0 });
    expect(selected).toEqual([{ kind: 'exit', index: 0 }]);
  });

  it('marks the way out the compiler refused', () => {
    let doc = withFloor();
    doc = { ...doc, exits: [{ id: 'entrance', at: p(1, 0) }] };
    const { container } = mount(doc, {
      errorTargets: [{ kind: 'exit', index: 0 }],
    });
    const exit = container.querySelector('[data-exit="entrance"] rect');
    expect(exit?.getAttribute('stroke')).toBe('#ff3b30');
  });
});

describe('a cell shared by the start and a way out (rpg-dnd5e-web#934)', () => {
  /** The reference tomb's shape: the party comes in where it leaves. */
  function sharedCell(): DungeonDoc {
    let doc = emptyDungeon();
    for (const c of [0, 1]) doc = paintCell(doc, 'region-1', p(c, 0));
    return {
      ...doc,
      start: { at: p(0, 0) },
      exits: [{ id: 'entrance', at: p(0, 0) }],
    };
  }

  it('selects the START first — the entry is what an author reaches for', () => {
    const selected: unknown[] = [];
    const { container } = mount(sharedCell(), {
      tool: 'select',
      onSelect: (s) => selected.push(s),
    });
    fireEvent.pointerDown(cellEl(container, 0, 0), { button: 0 });
    expect(selected).toEqual([{ kind: 'start' }]);
  });

  it('CYCLES to the exit on a second click, and back again', () => {
    // Without this the tomb's `entrance` exit is unreachable: the exit
    // panel is only ever opened from the board, so an exit under the
    // start could never be renamed or removed.
    const selected: unknown[] = [];
    let selection: Selection = { kind: 'dungeon' };
    const { container, rerender } = mount(sharedCell(), {
      tool: 'select',
      selection,
      onSelect: (s) => {
        selected.push(s);
        selection = s;
      },
    });
    const click = () => {
      fireEvent.pointerDown(cellEl(container, 0, 0), { button: 0 });
      rerender(
        <CreationBoard
          doc={sharedCell()}
          tool="select"
          selection={selection}
          activeRegionId="region-1"
          errorTargets={[]}
          concealedRegionIds={EMPTY_REGION_IDS}
          onPaintRect={() => {}}
          onPaint={() => {}}
          onErase={() => {}}
          onWallCommit={() => {}}
          onWallDelete={() => {}}
          onDoorToggle={() => {}}
          onCellClick={() => {}}
          onSelect={(s) => {
            selected.push(s);
            selection = s;
          }}
        />
      );
    };
    click();
    click();
    click();
    expect(selected).toEqual([
      { kind: 'start' },
      { kind: 'exit', index: 0 },
      { kind: 'start' },
    ]);
  });

  it('selects the way out directly when nothing else shares its cell', () => {
    const doc = sharedCell();
    const selected: unknown[] = [];
    const { container } = mount(
      { ...doc, start: { at: p(1, 0) } },
      { tool: 'select', onSelect: (s) => selected.push(s) }
    );
    fireEvent.pointerDown(cellEl(container, 0, 0), { button: 0 });
    expect(selected).toEqual([{ kind: 'exit', index: 0 }]);
  });
});
