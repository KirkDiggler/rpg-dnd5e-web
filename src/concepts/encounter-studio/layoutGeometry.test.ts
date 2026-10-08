// @vitest-environment node
import {
  cubeToWorld,
  HEX_SIZE,
  hexCorners,
} from '@/components/hex-grid/hexMath';
import { describe, expect, it } from 'vitest';
import {
  centeredRoomWorkspace,
  containsWorkspaceCell,
  workspaceBoundary,
  workspaceBounds,
  workspaceCellAtPoint,
} from '../world-building/workspaceGeometry';
import {
  clientToWorld,
  createLayoutTransform,
  layoutCellCenter,
  layoutCellCorners,
  layoutRectangleCells,
  layoutWorkspaceCells,
  panLayoutFrame,
  pickLayoutCell,
  worldToClient,
  zoomLayoutFrame,
  type LayoutBounds,
} from './layoutGeometry';
import type { LayoutFrame } from './studioSession';

const bounds: LayoutBounds = { left: 30, top: 70, width: 960, height: 600 };
const frame: LayoutFrame = { center: { x: 0, z: 0 }, zoom: 1 };

describe('rectangular Layout geometry', () => {
  it.each([
    [73, 48, 3504],
    [128, 128, 16384],
  ])(
    'enumerates exactly %s × %s = %s cells and clips rectangles to that union',
    (w, h, count) => {
      const workspace = centeredRoomWorkspace(w, h);
      expect(layoutWorkspaceCells(workspace)).toHaveLength(count);
      expect(
        layoutRectangleCells(
          { x: -1000, z: -1000 },
          { x: 1000, z: 1000 },
          workspace
        )
      ).toHaveLength(count);
      expect(
        layoutRectangleCells(
          layoutCellCenter({ q: -36, r: 0 }),
          layoutCellCenter({ q: 36, r: 0 }),
          workspace
        ).every((c) => containsWorkspaceCell(workspace, c))
      ).toBe(true);
    }
  );

  it('fits a non-square cell union on both axes without shifting the world origin', () => {
    const workspace = centeredRoomWorkspace(73, 8);
    const extent = workspaceBounds(workspace);
    const transform = createLayoutTransform(bounds, frame, extent)!;
    expect(transform.scale).toBeCloseTo(
      Math.min(
        bounds.width /
          (2 * Math.max(Math.abs(extent.minX), Math.abs(extent.maxX))),
        bounds.height /
          (2 * Math.max(Math.abs(extent.minZ), Math.abs(extent.maxZ)))
      )
    );
    expect(worldToClient({ x: 0, z: 0 }, transform)).toEqual({
      x: 510,
      y: 370,
    });
    for (const { a, b } of workspaceBoundary(workspace))
      for (const p of [a, b]) {
        const screen = worldToClient(p, transform)!;
        expect(screen.x).toBeGreaterThanOrEqual(bounds.left - 1e-10);
        expect(screen.x).toBeLessThanOrEqual(
          bounds.left + bounds.width + 1e-10
        );
        expect(screen.y).toBeGreaterThanOrEqual(bounds.top - 1e-10);
        expect(screen.y).toBeLessThanOrEqual(
          bounds.top + bounds.height + 1e-10
        );
      }
  });

  it('uses canonical negative edge/hex ties, newly exposed cells and refuses the enclosing envelope', () => {
    const workspace = centeredRoomWorkspace(73, 48);
    const transform = createLayoutTransform(
      bounds,
      frame,
      workspaceBounds(workspace)
    )!;
    const edge = workspaceBoundary(workspace).find(
      ({ a }) => a.x < 0 && a.z < 0
    )!;
    const points = [
      layoutCellCenter({ q: -36, r: 0 }),
      layoutCellCenter({ q: 36, r: 0 }),
      edge.a,
      { x: (edge.a.x + edge.b.x) / 2, z: (edge.a.z + edge.b.z) / 2 },
      layoutCellCorners({ q: 0, r: 0 })[0]!,
      { x: 0, z: 60 },
    ];
    for (const p of points)
      expect(
        pickLayoutCell(worldToClient(p, transform)!, transform, workspace)
      ).toEqual(workspaceCellAtPoint(workspace, p));
    expect(
      pickLayoutCell(
        worldToClient({ x: 0, z: 60 }, transform)!,
        transform,
        workspace
      )
    ).toBeNull();
  });
});

describe('Layout geometry', () => {
  it('projects and picks cell 0,0 and cell 1,0 using shared HEX_SIZE', () => {
    const transform = createLayoutTransform(bounds, frame, 12)!;
    for (const cell of [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ]) {
      const center = cubeToWorld(
        { x: cell.q, y: -cell.q, z: cell.r },
        HEX_SIZE
      );
      expect(layoutCellCenter(cell)).toEqual(center);
      expect(layoutCellCorners(cell)).toEqual(hexCorners(center, HEX_SIZE));
      expect(
        pickLayoutCell(worldToClient(center, transform)!, transform, 6)
      ).toEqual(cell);
    }
    expect(worldToClient({ x: 0, z: 0 }, transform)).toEqual({
      x: 510,
      y: 370,
    });
    expect(
      worldToClient({ x: Math.sqrt(3) * HEX_SIZE, z: 0 }, transform)!.x
    ).toBeCloseTo(510 + 25 * Math.sqrt(3));
  });

  it('screen world roundtrip survives translated bounds pan zoom and resize', () => {
    const world = { x: 3.7, z: -4.2 };
    for (const size of [
      bounds,
      { left: -90, top: 125, width: 500, height: 850 },
    ]) {
      for (const zoom of [0.25, 1, 4]) {
        const transform = createLayoutTransform(
          size,
          { center: { x: -2, z: 7 }, zoom },
          12
        )!;
        const result = clientToWorld(
          worldToClient(world, transform)!,
          transform
        )!;
        expect(result.x).toBeCloseTo(world.x, 12);
        expect(result.z).toBeCloseTo(world.z, 12);
      }
    }
    const before = createLayoutTransform(bounds, frame, 12)!;
    const anchor = { x: 0, z: 0 };
    const next = panLayoutFrame(frame, anchor, { x: 560, y: 345 }, before)!;
    expect(next).toEqual({ center: { x: -2, z: 1 }, zoom: 1 });
    expect(
      worldToClient(anchor, createLayoutTransform(bounds, next, 12))
    ).toEqual({ x: 560, y: 345 });
  });

  it('anchors zoom to cursor including both clamps', () => {
    const pointer = { x: 700, y: 250 };
    const before = createLayoutTransform(bounds, frame, 12)!;
    const anchor = clientToWorld(pointer, before)!;
    for (const [delta, zoom] of [
      [-100000, 4],
      [100000, 0.25],
      [0, 1],
    ]) {
      const next = zoomLayoutFrame(frame, pointer, delta, before)!;
      expect(next.zoom).toBe(zoom);
      const after = clientToWorld(
        pointer,
        createLayoutTransform(bounds, next, 12)
      )!;
      expect(after.x).toBeCloseTo(anchor.x, 12);
      expect(after.z).toBeCloseTo(anchor.z, 12);
    }
  });

  it.each([
    { ...bounds, width: 0 },
    { ...bounds, height: 0 },
    { ...bounds, width: -10 },
    { ...bounds, height: Infinity },
    { ...bounds, left: NaN },
    { ...bounds, top: Infinity },
  ])('unavailable bounds produce no world or cell: %j', (invalid) => {
    const transform = createLayoutTransform(invalid, frame, 12);
    expect(transform).toBeNull();
    expect(clientToWorld({ x: 0, y: 0 }, transform)).toBeNull();
    expect(worldToClient({ x: 0, z: 0 }, transform)).toBeNull();
    expect(pickLayoutCell({ x: 0, y: 0 }, transform, 6)).toBeNull();
  });

  it('rejects nonfinite inputs and invalid frame without inventing origin', () => {
    for (const invalid of [0, -1, Infinity, NaN]) {
      expect(
        createLayoutTransform(bounds, { ...frame, zoom: invalid }, 12)
      ).toBeNull();
    }
    expect(
      createLayoutTransform(bounds, { ...frame, center: { x: NaN, z: 0 } }, 12)
    ).toBeNull();
    expect(createLayoutTransform(bounds, frame, 0)).toBeNull();
    const transform = createLayoutTransform(bounds, frame, 12)!;
    expect(clientToWorld({ x: Infinity, y: 0 }, transform)).toBeNull();
    expect(worldToClient({ x: NaN, z: 0 }, transform)).toBeNull();
    expect(zoomLayoutFrame(frame, { x: 0, y: 0 }, NaN, transform)).toBeNull();
    expect(
      panLayoutFrame(frame, { x: 0, z: 0 }, { x: 0, y: 0 }, null)
    ).toBeNull();
  });

  it('rectangle absorbs only floating point error at inclusive center boundaries', () => {
    const start = layoutCellCenter({ q: 0, r: 0 });
    const end = layoutCellCenter({ q: 1, r: 0 });
    const transform = createLayoutTransform(bounds, frame, 12)!;
    const sampledEnd = clientToWorld(
      worldToClient(end, transform)!,
      transform
    )!;
    expect(layoutRectangleCells(start, sampledEnd, 6)).toEqual([
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ]);
    expect(
      layoutRectangleCells(start, { x: end.x - 1e-9, z: end.z }, 6)
    ).toEqual([{ q: 0, r: 0 }]);
    expect(layoutRectangleCells({ x: start.x + 1e-9, z: 0 }, end, 6)).toEqual([
      { q: 1, r: 0 },
    ]);
  });

  it('workspace boundary filters outside cells without altering committed content', () => {
    const transform = createLayoutTransform(bounds, frame, 12)!;
    expect(layoutWorkspaceCells(6)).toHaveLength(127);
    for (const cell of [
      { q: 6, r: 0 },
      { q: 0, r: -6 },
    ]) {
      expect(
        pickLayoutCell(
          worldToClient(layoutCellCenter(cell), transform)!,
          transform,
          6
        )
      ).toEqual(cell);
    }
    for (const cell of [
      { q: 7, r: 0 },
      { q: 4, r: 4 },
    ]) {
      expect(
        pickLayoutCell(
          worldToClient(layoutCellCenter(cell), transform)!,
          transform,
          6
        )
      ).toBeNull();
      expect(layoutWorkspaceCells(6)).not.toContainEqual(cell);
    }
  });
});
