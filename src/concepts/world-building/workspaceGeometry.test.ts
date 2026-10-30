import {
  cubeToWorld,
  HEX_SIZE,
  hexCorners,
} from '@/components/hex-grid/hexMath';
import { describe, expect, it } from 'vitest';
import {
  anchoredRoomWorkspace,
  centeredRoomWorkspace,
  containsWorkspaceAabb,
  containsWorkspaceCell,
  containsWorkspacePoint,
  growRoomWorkspace,
  rectangleOf,
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
    // The derived grid's cap (rpg-project#725): sides <= 1024, <= 131072 cells.
    [1025, 1],
    [1, 1025],
    [1.5, 2],
    [NaN, 2],
    [Infinity, 1],
    [1024, 129],
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
  it('accepts the derived grid cap exactly', () => {
    expect(centeredRoomWorkspace(1024, 128)).toMatchObject({
      widthHexes: 1024,
      heightHexes: 128,
    });
    expect(centeredRoomWorkspace(1, 1024)).toMatchObject({ heightHexes: 1024 });
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
  it('keeps shared-corner and edge ties stable through screen roundtrips and machine-precision perturbations', () => {
    const workspace = centeredRoomWorkspace(73, 48);
    for (const cell of [
      { q: 0, r: 0 },
      { q: 5, r: -3 },
    ]) {
      const center = cubeToWorld(
        { x: cell.q, y: -cell.q - cell.r, z: cell.r },
        HEX_SIZE
      );
      const corner = hexCorners(center, HEX_SIZE)[0]!;
      const scale = 900 / 130;
      const roundtrip = {
        x: (317 + (corner.x + 65) * scale - 317) / scale - 65,
        z: (91 + (corner.z + 65) * scale - 91) / scale - 65,
      };
      const expected = { q: cell.q + 1, r: cell.r - 1 };
      for (const point of [corner, roundtrip]) {
        expect(workspaceCellAtPoint(workspace, point)).toEqual(expected);
        const epsilon =
          4 *
          Number.EPSILON *
          Math.max(1, Math.abs(point.x), Math.abs(point.z));
        for (const dx of [-epsilon, 0, epsilon])
          for (const dz of [-epsilon, 0, epsilon])
            expect(
              workspaceCellAtPoint(workspace, {
                x: point.x + dx,
                z: point.z + dz,
              })
            ).toEqual(expected);
      }
    }
    const edge = { x: Math.sqrt(3) / 2, z: 0 };
    for (const dx of [-Number.EPSILON, 0, Number.EPSILON])
      expect(
        workspaceCellAtPoint(workspace, { ...edge, x: edge.x + dx })
      ).toEqual({ q: 0, r: 0 });
    // A genuine point on either side is not snapped to the tie winner.
    expect(
      workspaceCellAtPoint(workspace, { ...edge, x: edge.x - 1e-9 })
    ).toEqual({ q: 0, r: 0 });
    expect(
      workspaceCellAtPoint(workspace, { ...edge, x: edge.x + 1e-9 })
    ).toEqual({ q: 1, r: 0 });
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

describe('workspace growth by chosen edges (R13)', () => {
  const colOf = (cell: { q: number; r: number }): number =>
    cell.q + Math.floor(cell.r / 2);
  const set = (workspace: Parameters<typeof workspaceCells>[0]) =>
    new Set(workspaceCells(workspace).map(key));

  it('growing 20x20 to 24x22 keeps every old cell and adds 4 columns right and 2 rows on top', () => {
    const before = centeredRoomWorkspace(20, 20);
    const old = rectangleOf(before)!;
    const after = growRoomWorkspace(before, 24, 22);
    expect(after.kind).toBe('odd-r-rect');
    const oldCells = set(before);
    const newCells = workspaceCells(after);
    expect(newCells).toHaveLength(24 * 22);
    for (const cell of oldCells) expect(set(after).has(cell)).toBe(true);
    const oldMaxCol = old.minCol + old.widthHexes - 1;
    const added = newCells.filter((cell) => !oldCells.has(key(cell)));
    expect(added).toHaveLength(24 * 22 - 20 * 20);
    for (const cell of added)
      expect(colOf(cell) >= oldMaxCol + 1 || cell.r < old.minRow).toBe(true);
    expect(rectangleOf(after)).toEqual({
      minCol: old.minCol,
      minRow: old.minRow - 2,
      widthHexes: 24,
      heightHexes: 22,
    });
  });

  it('growing on the left and bottom keeps every old cell and moves only those edges', () => {
    const before = centeredRoomWorkspace(20, 20);
    const old = rectangleOf(before)!;
    const after = growRoomWorkspace(before, 26, 23, {
      columns: 'left',
      rows: 'bottom',
    });
    for (const cell of set(before)) expect(set(after).has(cell)).toBe(true);
    expect(rectangleOf(after)).toEqual({
      minCol: old.minCol - 6,
      minRow: old.minRow,
      widthHexes: 26,
      heightHexes: 23,
    });
    const added = workspaceCells(after).filter(
      (cell) => !set(before).has(key(cell))
    );
    for (const cell of added)
      expect(
        colOf(cell) < old.minCol || cell.r >= old.minRow + old.heightHexes
      ).toBe(true);
  });

  it('shrinking moves the chosen edges', () => {
    const before = anchoredRoomWorkspace({
      minCol: -10,
      minRow: -10,
      widthHexes: 20,
      heightHexes: 20,
    });
    expect(rectangleOf(growRoomWorkspace(before, 18, 17))).toEqual({
      minCol: -10,
      minRow: -7,
      widthHexes: 18,
      heightHexes: 17,
    });
    expect(
      rectangleOf(
        growRoomWorkspace(before, 18, 17, { columns: 'left', rows: 'bottom' })
      )
    ).toEqual({ minCol: -8, minRow: -10, widthHexes: 18, heightHexes: 17 });
  });

  it('a centred workspace reads as its rectangle', () => {
    expect(rectangleOf(centeredRoomWorkspace(73, 48))).toEqual({
      minCol: -36,
      minRow: -24,
      widthHexes: 73,
      heightHexes: 48,
    });
    expect(rectangleOf({ hexRadius: 6, horizontalLimit: 12 })).toBeNull();
    const centred = centeredRoomWorkspace(7, 4);
    expect(growRoomWorkspace(centred, 7, 4)).toBe(centred);
    expect(set(anchoredRoomWorkspace(rectangleOf(centred)!))).toEqual(
      set(centred)
    );
  });

  it('a mismatched hexRadius on odd-r-rect is refused', () => {
    const valid = anchoredRoomWorkspace({
      minCol: 3,
      minRow: -9,
      widthHexes: 5,
      heightHexes: 4,
    });
    expect(validateWorkspace(JSON.parse(JSON.stringify(valid)))).toEqual(valid);
    expect(() => validateWorkspace({ ...valid, hexRadius: 99 })).toThrow(
      'Room workspace hexRadius/horizontalLimit must match its derived envelopes.'
    );
    expect(() => validateWorkspace({ ...valid, minCol: 1.5 })).toThrow(
      /integer/
    );
    expect(() => validateWorkspace({ ...valid, extra: 1 })).toThrow();
  });

  it('hexRadius covers the farthest cell of an off-centre rectangle', () => {
    const workspace = anchoredRoomWorkspace({
      minCol: 40,
      minRow: -60,
      widthHexes: 10,
      heightHexes: 10,
    });
    const farthest = Math.max(
      ...workspaceCells(workspace).map((c) =>
        Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(c.q + c.r))
      )
    );
    expect(workspace.hexRadius).toBe(farthest);
    for (const cell of workspaceCells(workspace))
      expect(containsWorkspaceCell(workspace, cell)).toBe(true);
    expect(containsWorkspaceCell(workspace, { q: 0, r: 0 })).toBe(false);
  });
});

/** A RADIUS WORKSPACE OFF THE PRESETS (rpg-dnd5e-web#1311). Before, Discovery
 * Check Walk's `{hexRadius: 9, horizontalLimit: 20}` and The Watch Post's
 * `{hexRadius: 6}` were refused with "Unsupported room workspace extent."
 * The engine reads only the radius, so the studio reads both as written. */
describe('validateWorkspace reads a radius workspace as written', () => {
  it('keeps a preset, a radius off the presets, and a radius alone', () => {
    expect(validateWorkspace({ hexRadius: 6, horizontalLimit: 12 })).toEqual({
      hexRadius: 6,
      horizontalLimit: 12,
    });
    expect(validateWorkspace({ hexRadius: 9, horizontalLimit: 20 })).toEqual({
      hexRadius: 9,
      horizontalLimit: 20,
    });
    expect(validateWorkspace({ hexRadius: 6 })).toEqual({
      hexRadius: 6,
      horizontalLimit: 12,
    });
  });

  it('refuses a radius it cannot hold, naming what the file says', () => {
    expect(() => validateWorkspace({ hexRadius: 0 })).toThrow(
      'Unsupported room workspace extent: hexRadius must be a whole number from 1 to 73, and this file says 0.'
    );
    expect(() => validateWorkspace({ hexRadius: 6.5 })).toThrow(
      'and this file says 6.5.'
    );
    expect(() =>
      validateWorkspace({ hexRadius: 100, horizontalLimit: 200 })
    ).toThrow('and this file says 100.');
    expect(() =>
      validateWorkspace({ hexRadius: 9, horizontalLimit: -1 })
    ).toThrow(
      'Unsupported room workspace extent: horizontalLimit must be a positive number, and this file says -1.'
    );
  });
});
