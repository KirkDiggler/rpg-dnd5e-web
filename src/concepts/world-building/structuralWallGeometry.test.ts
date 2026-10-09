import { describe, expect, it } from 'vitest';
import {
  resizeWallEndpoint,
  transformWall,
  wallOpeningPoint,
  wallSolidIntervals,
  type WallGeometry,
} from './structuralWallGeometry';

function fixture(): WallGeometry {
  return {
    line: { start: { x: 0, z: 0 }, end: { x: 10, z: 0 } },
    openings: [{ id: 'door', position: 7, width: 2 }],
  };
}

function door(wall: WallGeometry) {
  return wallOpeningPoint({ wall, openingId: 'door' });
}

describe('structural wall editing geometry', () => {
  it('rebases an opening when extending the starting end without moving it', () => {
    const { wall, clamped } = resizeWallEndpoint({
      wall: fixture(),
      endpoint: 'start',
      distance: -2,
    });
    expect(wall.line.start).toEqual({ x: -2, z: 0 });
    expect(wall.openings).toEqual([{ id: 'door', position: 9, width: 2 }]);
    expect(door(wall)).toEqual({ x: 7, z: 0 });
    expect(clamped).toBe(false);
  });

  it.each([
    ['end', 8],
    ['start', 6],
  ] as const)(
    'stops a %s drag at the doorway edge without deleting it',
    (endpoint, expected) => {
      const { wall, clamped } = resizeWallEndpoint({
        wall: fixture(),
        endpoint,
        distance: 7,
      });
      expect(wall.line[endpoint]).toEqual({ x: expected, z: 0 });
      expect(door(wall)).toEqual({ x: 7, z: 0 });
      expect(wall.openings[0].id).toBe('door');
      expect(clamped).toBe(true);
    }
  );

  it('uses the outermost openings as the two resize limits', () => {
    const wall = fixture();
    wall.openings = [{ id: 'other', position: 2, width: 2 }, ...wall.openings];
    expect(
      resizeWallEndpoint({ wall, endpoint: 'start', distance: 9 }).wall.line
        .start.x
    ).toBe(1);
    expect(
      resizeWallEndpoint({ wall, endpoint: 'end', distance: -2 }).wall.line.end
        .x
    ).toBe(8);
  });

  it('carries a noncentral opening through translation', () => {
    const wall = transformWall({
      wall: fixture(),
      translation: { x: 2, z: 3 },
      angle: 0,
      pivot: { x: 0, z: 0 },
    });
    expect(door(wall)).toEqual({ x: 9, z: 3 });
    expect(wall.openings).toEqual(fixture().openings);
  });

  it('rotates in the stated XZ plane, then translates', () => {
    const wall = transformWall({
      wall: fixture(),
      translation: { x: 2, z: 3 },
      angle: Math.PI / 2,
      pivot: { x: 5, z: 0 },
    });
    expect(door(wall).x).toBeCloseTo(7);
    expect(door(wall).z).toBeCloseTo(5);
  });

  it('preserves world position when resizing a diagonal line', () => {
    const wall = fixture();
    wall.line.end = { x: 6, z: 8 };
    const before = door(wall);
    const after = resizeWallEndpoint({
      wall,
      endpoint: 'start',
      distance: -3,
    }).wall;
    expect(door(after).x).toBeCloseTo(before.x);
    expect(door(after).z).toBeCloseTo(before.z);
  });

  it('cuts the supplied independent extent, rather than offsetting already cut spans', () => {
    expect(
      wallSolidIntervals({ wall: fixture(), extent: { start: -1, end: 11 } })
    ).toEqual([
      { start: -1, end: 6 },
      { start: 8, end: 11 },
    ]);
    expect(
      wallSolidIntervals({ wall: fixture(), extent: { start: 6.5, end: 7.5 } })
    ).toEqual([]);
    expect(
      wallSolidIntervals({ wall: fixture(), extent: { start: 20, end: 22 } })
    ).toEqual([{ start: 20, end: 22 }]);
  });

  it('does not clamp long walls to prop limits', () => {
    const wall: WallGeometry = {
      line: { start: { x: 0, z: 0 }, end: { x: 20, z: 0 } },
      openings: [],
    };
    expect(wallSolidIntervals({ wall, extent: { start: 0, end: 20 } })).toEqual(
      [{ start: 0, end: 20 }]
    );
  });

  it('accepts touching openings and exact endpoint openings without phantom spans', () => {
    const wall = fixture();
    wall.openings = [
      { id: 'a', position: 2, width: 4 },
      { id: 'b', position: 7, width: 6 },
    ];
    expect(wallSolidIntervals({ wall, extent: { start: 0, end: 10 } })).toEqual(
      []
    );
  });

  it('keeps endpoint openings valid through ordinary rotations', () => {
    const wall = fixture();
    wall.openings = [{ id: 'door', position: 9, width: 2 }];
    for (let i = 0; i < 100; i++) {
      const transformed = transformWall({
        wall,
        angle: i / 13,
        pivot: { x: 5, z: 0 },
        translation: { x: 0, z: 0 },
      });
      expect(transformed.openings).toEqual(wall.openings);
      expect(
        Math.hypot(
          door(transformed).x - transformed.line.start.x,
          door(transformed).z - transformed.line.start.z
        )
      ).toBeCloseTo(9);
    }
  });

  it('does not mutate frozen source geometry or reorder source openings', () => {
    const wall = fixture();
    wall.openings = [
      ...wall.openings,
      { id: 'earlier', position: 2, width: 1 },
    ];
    wall.openings.forEach(Object.freeze);
    Object.freeze(wall.openings);
    Object.freeze(wall.line.start);
    Object.freeze(wall.line.end);
    Object.freeze(wall.line);
    Object.freeze(wall);
    const before = JSON.stringify(wall);
    resizeWallEndpoint({ wall, endpoint: 'start', distance: -2 });
    transformWall({
      wall,
      angle: 1,
      pivot: { x: 0, z: 0 },
      translation: { x: 1, z: 2 },
    });
    wallSolidIntervals({ wall, extent: { start: -1, end: 11 } });
    expect(JSON.stringify(wall)).toBe(before);
  });

  it.each([NaN, Infinity, -Infinity])(
    'rejects nonfinite geometry (%s)',
    (value) => {
      const wall = fixture();
      wall.line.start.x = value;
      expect(() => door(wall)).toThrow('Wall geometry');
      expect(() =>
        resizeWallEndpoint({
          wall: fixture(),
          endpoint: 'end',
          distance: value,
        })
      ).toThrow('Wall geometry');
      expect(() =>
        transformWall({
          wall: fixture(),
          angle: value,
          pivot: { x: 0, z: 0 },
          translation: { x: 0, z: 0 },
        })
      ).toThrow('Wall geometry');
      expect(() =>
        wallSolidIntervals({
          wall: fixture(),
          extent: { start: 0, end: value },
        })
      ).toThrow('Wall geometry');
    }
  );

  it('rejects zero lines and unrepresentable arithmetic', () => {
    const wall = fixture();
    wall.line.end = { ...wall.line.start };
    expect(() => door(wall)).toThrow('Wall geometry');
    wall.line = {
      start: { x: -Number.MAX_VALUE, z: 0 },
      end: { x: Number.MAX_VALUE, z: 0 },
    };
    expect(() => door(wall)).toThrow('Wall geometry');
    expect(() =>
      transformWall({
        wall: fixture(),
        angle: 0,
        pivot: { x: 0, z: 0 },
        translation: { x: Number.MAX_VALUE, z: 0 },
      })
    ).toThrow('Wall geometry');
  });

  it('refuses collapse or inversion of a wall without openings', () => {
    const wall = fixture();
    wall.openings = [];
    expect(() =>
      resizeWallEndpoint({ wall, endpoint: 'end', distance: 0 })
    ).toThrow('Wall geometry');
    expect(() =>
      resizeWallEndpoint({ wall, endpoint: 'start', distance: 11 })
    ).toThrow('Wall geometry');
  });

  it.each([
    [{ id: 'a', position: 2, width: 0 }],
    [{ id: '', position: 2, width: 1 }],
    [{ id: 'a', position: 0, width: 1 }],
    [{ id: 'a', position: 10, width: 1 }],
    [
      { id: 'a', position: 2, width: 2 },
      { id: 'a', position: 6, width: 1 },
    ],
    [
      { id: 'a', position: 2, width: 4 },
      { id: 'b', position: 3, width: 2 },
    ],
  ])('refuses invalid openings %#', (...openings) => {
    const wall = fixture();
    wall.openings = openings;
    expect(() =>
      wallSolidIntervals({ wall, extent: { start: 0, end: 10 } })
    ).toThrow('Wall geometry');
  });

  it('refuses missing opening identities and reversed extents', () => {
    expect(() =>
      wallOpeningPoint({ wall: fixture(), openingId: 'missing' })
    ).toThrow('Wall geometry');
    expect(() =>
      wallSolidIntervals({ wall: fixture(), extent: { start: 2, end: 1 } })
    ).toThrow('Wall geometry');
  });
});

describe('M1 exact geometry identity operations', () => {
  const fractional = (): WallGeometry => ({
    line: { start: { x: -2.7, z: -3.1 }, end: { x: 3.2, z: 5.7 } },
    openings: fixture().openings,
  });
  it.each(['start', 'end'] as const)(
    'preserves exact fractional %s endpoint at its original distance',
    (endpoint) => {
      const wall = fractional();
      const before = structuredClone(wall);
      const length = Math.hypot(
        wall.line.end.x - wall.line.start.x,
        wall.line.end.z - wall.line.start.z
      );
      Object.freeze(wall.line.start);
      Object.freeze(wall.line.end);
      Object.freeze(wall.line);
      wall.openings.forEach(Object.freeze);
      Object.freeze(wall.openings);
      Object.freeze(wall);
      const result = resizeWallEndpoint({
        wall,
        endpoint,
        distance: endpoint === 'start' ? 0 : length,
      });
      expect(result).toEqual({ wall: before, clamped: false });
      expect(result.wall).not.toBe(wall);
      expect(result.wall.line).not.toBe(wall.line);
      expect(result.wall.openings[0]).not.toBe(wall.openings[0]);
      expect(wall).toEqual(before);
    }
  );
  it('preserves a fractional zero transform with fresh copies after validating geometry and inputs', () => {
    const wall = fractional();
    const result = transformWall({
      wall,
      pivot: { x: 0.25, z: 1.3 },
      angle: 0,
      translation: { x: 0, z: 0 },
    });
    expect(result).toEqual(wall);
    expect(result).not.toBe(wall);
    expect(result.line.start).not.toBe(wall.line.start);
    expect(result.openings[0]).not.toBe(wall.openings[0]);
    expect(() =>
      transformWall({
        wall,
        pivot: { x: NaN, z: 0 },
        angle: 0,
        translation: { x: 0, z: 0 },
      })
    ).toThrow('Wall geometry');
    expect(() =>
      transformWall({
        wall,
        pivot: { x: 0, z: 0 },
        angle: 0,
        translation: { x: Infinity, z: 0 },
      })
    ).toThrow('Wall geometry');
    const bad = { ...wall, openings: [{ id: 'bad', position: 1, width: -1 }] };
    expect(() =>
      transformWall({
        wall: bad,
        pivot: { x: 0, z: 0 },
        angle: 0,
        translation: { x: 0, z: 0 },
      })
    ).toThrow('Wall geometry');
    expect(() =>
      resizeWallEndpoint({ wall: bad, endpoint: 'start', distance: 0 })
    ).toThrow('Wall geometry');
  });
  it.each(['start', 'end'] as const)(
    'retains clamped metadata when an attempted %s resize clamps to the original pose',
    (endpoint) => {
      const wall = fractional();
      const length = Math.hypot(
        wall.line.end.x - wall.line.start.x,
        wall.line.end.z - wall.line.start.z
      );
      wall.openings = [{ id: 'whole', position: length / 2, width: length }];
      expect(
        resizeWallEndpoint({
          wall,
          endpoint,
          distance: endpoint === 'start' ? 1 : length - 1,
        })
      ).toEqual({ wall, clamped: true });
    }
  );
  it('does not discard representable tiny nonzero transforms or resizes', () => {
    const wall = fractional();
    const pivot = { x: 0.25, z: 1.3 };
    expect(
      transformWall({ wall, pivot, angle: 0, translation: { x: 1e-10, z: 0 } })
    ).not.toEqual(wall);
    expect(
      transformWall({ wall, pivot, angle: 1e-10, translation: { x: 0, z: 0 } })
    ).not.toEqual(wall);
    expect(
      resizeWallEndpoint({ wall, endpoint: 'start', distance: -1e-10 }).wall
    ).not.toEqual(wall);
  });
});
