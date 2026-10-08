import {
  cubeToWorld,
  HEX_SIZE,
  hexCorners,
} from '@/components/hex-grid/hexMath';
import { describe, expect, it } from 'vitest';
import {
  centeredRoomWorkspace,
  containsWorkspaceAabb,
  containsWorkspaceCell,
  containsWorkspacePoint,
  validateWorkspace,
  workspaceBoundary,
  workspaceBounds,
  workspaceCellAtPoint,
  workspaceCells,
} from './workspaceGeometry';

const key = (cell: { q: number; r: number }): string => `${cell.q},${cell.r}`;
describe('centered workspace authority', () => {
  it.each([
    [73, 48, 3504],
    [128, 128, 16384],
    [1, 1, 1],
    [2, 2, 4],
  ])(
    'enumerates exactly %i × %i = %i unique cells, not its enclosing disk',
    (w, h, count) => {
      const workspace = centeredRoomWorkspace(w, h),
        cells = workspaceCells(workspace);
      expect(cells).toHaveLength(count);
      expect(new Set(cells.map(key)).size).toBe(count);
      for (const cell of cells) {
        expect(containsWorkspaceCell(workspace, cell)).toBe(true);
        expect(
          Math.max(
            Math.abs(cell.q),
            Math.abs(cell.r),
            Math.abs(cell.q + cell.r)
          )
        ).toBeLessThanOrEqual(workspace.hexRadius);
      }
      expect(validateWorkspace(workspace)).toEqual(workspace);
    }
  );
  it('derives honest positive engine and scalar envelopes independently of rectangle membership', () => {
    expect(centeredRoomWorkspace(73, 48)).toMatchObject({
      hexRadius: 48,
      horizontalLimit: 65,
    });
    expect(centeredRoomWorkspace(128, 128)).toMatchObject({
      hexRadius: 96,
      horizontalLimit: 112,
    });
    // This rectangle accidentally matches an old preset: scene promotion still fences old readers.
    expect(centeredRoomWorkspace(9, 9)).toMatchObject({
      hexRadius: 6,
      horizontalLimit: 12,
    });
  });
  it('uses original origin, even negative tie and absolute negative odd-row staggering', () => {
    const workspace = centeredRoomWorkspace(2, 2);
    expect(workspaceCells(centeredRoomWorkspace(1, 1))).toEqual([
      { q: 0, r: 0 },
    ]);
    expect(workspaceCells(workspace)).toEqual([
      { q: 0, r: -1 },
      { q: 1, r: -1 },
      { q: -1, r: 0 },
      { q: 0, r: 0 },
    ]);
    expect(cubeToWorld({ x: 0, y: 0, z: 0 }, HEX_SIZE)).toEqual({ x: 0, z: 0 });
    for (const cell of workspaceCells(centeredRoomWorkspace(9, 8))) {
      const col = cell.q + Math.floor(cell.r / 2);
      expect(col - Math.floor(cell.r / 2)).toBe(cell.q);
      const world = cubeToWorld(
        { x: cell.q, y: -cell.q - cell.r, z: cell.r },
        HEX_SIZE
      );
      expect(workspaceCellAtPoint(centeredRoomWorkspace(9, 8), world)).toEqual(
        cell
      );
      if (cell.r % 2 !== 0)
        expect(world.x).toBeCloseTo(Math.sqrt(3) * (col + 0.5));
    }
  });
  it('growth in either dimension never removes an existing cell', () => {
    for (let w = 1; w < 12; w++)
      for (let h = 1; h < 12; h++)
        for (const cell of workspaceCells(centeredRoomWorkspace(w, h))) {
          expect(
            containsWorkspaceCell(centeredRoomWorkspace(w + 1, h), cell)
          ).toBe(true);
          expect(
            containsWorkspaceCell(centeredRoomWorkspace(w, h + 1), cell)
          ).toBe(true);
        }
  });
  it.each([
    [0, 1],
    [-1, 2],
    [129, 1],
    [1, 129],
    [1.5, 2],
    [NaN, 2],
    [Infinity, 1],
    [128, 129],
  ])('refuses invalid dimensions before allocation: %s/%s', (w, h) => {
    expect(() => centeredRoomWorkspace(w, h)).toThrow(/integers/);
    expect(() =>
      workspaceCells({
        kind: 'centered-odd-r',
        widthHexes: w,
        heightHexes: h,
        hexRadius: 1,
        horizontalLimit: 12,
      })
    ).toThrow(/integers/);
  });
  it('refuses invalid, untagged dimensions and false envelopes', () => {
    for (const bad of [
      null,
      [],
      { kind: 'other' },
      { ...centeredRoomWorkspace(73, 48), hexRadius: 6 },
      { ...centeredRoomWorkspace(73, 48), horizontalLimit: 12 },
      { ...centeredRoomWorkspace(1, 1), origin: { x: 0, z: 0 } },
      { hexRadius: 6, horizontalLimit: 12, widthHexes: 2 },
    ])
      expect(() => validateWorkspace(bad)).toThrow();
    expect(centeredRoomWorkspace(1, 1)).toEqual({
      kind: 'centered-odd-r',
      widthHexes: 1,
      heightHexes: 1,
      hexRadius: 1,
      horizontalLimit: 12,
    });
  });
  it('contains closed polygon boundaries with deterministic ties, never the scalar envelope', () => {
    const workspace = centeredRoomWorkspace(1, 1);
    for (const p of hexCorners({ x: 0, z: 0 }, HEX_SIZE)) {
      expect(containsWorkspacePoint(workspace, p)).toBe(true);
      expect(workspaceCellAtPoint(workspace, p)).toEqual({ q: 0, r: 0 });
    }
    expect(containsWorkspacePoint(workspace, { x: 0.8, z: 0.8 })).toBe(false);
    expect(containsWorkspacePoint(workspace, { x: 12, z: 12 })).toBe(false);
    expect(
      containsWorkspacePoint(workspace, { x: Math.sqrt(3) / 2 + 1e-10, z: 0 })
    ).toBe(false);
    expect(containsWorkspacePoint(workspace, { x: NaN, z: 0 })).toBe(false);
    const boundary = workspaceBoundary(centeredRoomWorkspace(2, 2));
    for (const edge of boundary)
      expect(
        containsWorkspacePoint(centeredRoomWorkspace(2, 2), {
          x: (edge.a.x + edge.b.x) / 2,
          z: (edge.a.z + edge.b.z) / 2,
        })
      ).toBe(true);
    expect(workspaceBoundary(workspace)).toHaveLength(6);
    const bounds = workspaceBounds(workspace);
    expect(bounds.minX).toBeCloseTo(-Math.sqrt(3) / 2);
    expect(bounds.maxZ).toBe(1);
  });
  it('checks area coverage and degenerate segments/points non-vacuously', () => {
    const workspace = centeredRoomWorkspace(1, 1);
    expect(
      containsWorkspaceAabb(workspace, {
        minX: -0.5,
        maxX: 0.5,
        minZ: -0.5,
        maxZ: 0.5,
      })
    ).toBe(true);
    expect(
      containsWorkspaceAabb(workspace, {
        minX: -0.8,
        maxX: 0.8,
        minZ: -0.8,
        maxZ: 0.8,
      })
    ).toBe(false);
    expect(
      containsWorkspaceAabb(workspace, { minX: 0, maxX: 0, minZ: -1, maxZ: 1 })
    ).toBe(true);
    expect(
      containsWorkspaceAabb(workspace, {
        minX: 0.8,
        maxX: 0.8,
        minZ: -0.8,
        maxZ: 0.8,
      })
    ).toBe(false);
    expect(
      containsWorkspaceAabb(workspace, {
        minX: 0.8,
        maxX: 0.8,
        minZ: 0.8,
        maxZ: 0.8,
      })
    ).toBe(false);
    expect(
      containsWorkspaceAabb(workspace, { minX: 0, maxX: 0, minZ: 1, maxZ: 1 })
    ).toBe(true);
    // Endpoints are contained in separate hexes, but the line crosses an excluded-row notch.
    const row = centeredRoomWorkspace(2, 1),
      x = -Math.sqrt(3);
    expect(containsWorkspacePoint(row, { x, z: 0.9 })).toBe(true);
    expect(containsWorkspacePoint(row, { x: 0, z: 0.9 })).toBe(true);
    expect(
      containsWorkspaceAabb(row, { minX: x, maxX: 0, minZ: 0.9, maxZ: 0.9 })
    ).toBe(false);
    expect(
      containsWorkspaceAabb(row, {
        minX: x,
        maxX: 0,
        minZ: 0.9,
        maxZ: 0.9 + 1e-12,
      })
    ).toBe(false);
  });
});
