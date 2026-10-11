import {
  cubeToWorld,
  HEX_SIZE,
  hexCorners,
} from '@/components/hex-grid/hexMath';
import { describe, expect, it } from 'vitest';
import {
  addWallOpening,
  createWall,
  DEFAULT_WALL_BLOCKER_DEPTH,
  isRepeatableWallAsset,
  layoutWallPieces,
  MAX_WALL_PIECES_PER_WALL,
  removeWallOpening,
  reshapeWallEndpoint,
  resizeWallLength,
  rotateWall,
  setWallAppearance,
  setWallBlocker,
  setWallEndpoints,
  setWallLabel,
  snapWallEndpoint,
  snapWallPoint,
  translateWall,
  updateWallOpening,
  wallBlockerGuide,
  wallDirectionYaw,
  wallMidpoint,
} from './structuralWallEditing';
import { wallOpeningPoint } from './structuralWallGeometry';
import type { StructuralWall } from './structuralWalls';

const WALL_ASSET = 'dnd5e:env:dark-fortress:45_wall_01';

function wall(overrides: Partial<StructuralWall> = {}): StructuralWall {
  return {
    id: 'wall-1',
    label: 'North wall',
    line: { start: { x: 0, z: 0 }, end: { x: 10, z: 0 } },
    openings: [{ id: 'opening-1', position: 7, width: 2 }],
    appearance: {
      assetRef: WALL_ASSET,
      height: 3,
      thickness: 0.3,
      elevation: 0.1,
    },
    blocker: {
      footprint: { width: 12, depth: 0.5, offsetX: 1, offsetZ: -0.2 },
      blocksMovement: false,
      blocksLineOfSight: true,
    },
    ...overrides,
  };
}

function openingPoint(target: StructuralWall, id: string) {
  return wallOpeningPoint({ wall: target, openingId: id });
}

describe('exact endpoint authoring', () => {
  it('copies non-binary endpoint coordinates exactly for numeric and dragged edits', () => {
    const source = wall({
      line: { start: { x: 0.13, z: 0.27 }, end: { x: 10.43, z: 3.51 } },
      openings: [],
    });
    const target = { x: -6.135791357913579, z: 18.5 };
    const before = structuredClone(source);
    const numeric = setWallEndpoints({ wall: source, end: target });
    const dragged = reshapeWallEndpoint({
      wall: source,
      endpoint: 'end',
      point: target,
    });
    expect(numeric.line).toEqual({ start: source.line.start, end: target });
    expect(dragged.wall.line).toEqual(numeric.line);
    expect(dragged.clamped).toBe(false);
    expect(source).toEqual(before);
    expect(
      setWallEndpoints({
        wall: source,
        start: source.line.start,
        end: source.line.end,
      })
    ).toEqual(source);
  });
  it('evaluates both ends together and preserves opening identities and blocker margins', () => {
    const source = wall();
    const moved = setWallEndpoints({
      wall: source,
      start: { x: 10, z: 0 },
      end: { x: 20, z: 0 },
    });
    expect(moved.line).toEqual({
      start: { x: 10, z: 0 },
      end: { x: 20, z: 0 },
    });
    expect(moved.openings).toEqual(source.openings);
    expect(moved.blocker).toEqual(source.blocker);
    const trimmed = setWallEndpoints({ wall: source, start: { x: 3, z: 0 } });
    expect(trimmed.openings[0]).toEqual({ ...source.openings[0], position: 4 });
    expect(trimmed.blocker.footprint).toEqual({
      ...source.blocker.footprint,
      width: 9,
    });
    expect(openingPoint(trimmed, 'opening-1')).toEqual(
      openingPoint(source, 'opening-1')
    );
    expect(
      setWallEndpoints({
        wall: source,
        start: { x: 3, z: 0 },
        end: source.line.end,
      })
    ).toEqual(trimmed);
  });
  it('refuses protected/zero/nonfinite numeric endpoints while drags still visibly clamp', () => {
    const source = wall();
    const before = structuredClone(source);
    expect(() =>
      setWallEndpoints({ wall: source, end: { x: 7, z: 0 } })
    ).toThrow(/opening/);
    expect(() =>
      setWallEndpoints({ wall: source, end: source.line.start })
    ).toThrow();
    expect(() =>
      setWallEndpoints({ wall: source, start: { x: NaN, z: 0 } })
    ).toThrow();
    expect(
      reshapeWallEndpoint({
        wall: source,
        endpoint: 'end',
        point: { x: 7, z: 0 },
      }).clamped
    ).toBe(true);
    expect(source).toEqual(before);
  });
  it('snaps only to eligible nearby endpoints with stable ties and no geometry mutation', () => {
    const a = wall({
      id: 'a',
      line: { start: { x: 0.123456789012345, z: 2.1 }, end: { x: 10, z: 2.1 } },
    });
    const b = wall({ ...a, id: 'b' });
    const input = {
      point: { x: 0.15, z: 2.11 },
      enabled: true,
      walls: [b, a],
      radius: 0.1,
    };
    const before = structuredClone(input);
    const result = snapWallEndpoint(input);
    expect(result).toEqual({
      point: a.line.start,
      snapped: true,
      target: { wallId: 'a', endpoint: 'start' },
    });
    expect(result.point).not.toBe(a.line.start);
    expect(snapWallEndpoint({ ...input, walls: [a, b] })).toEqual(result);
    expect(
      snapWallEndpoint({ ...input, excludedWallId: 'a' }).target?.wallId
    ).toBe('b');
    expect(snapWallEndpoint({ ...input, enabled: false })).toEqual({
      point: input.point,
      snapped: false,
    });
    expect(snapWallEndpoint({ ...input, radius: 0.001 }).snapped).toBe(false);
    expect(
      snapWallEndpoint({ ...input, walls: [a], excludedWallId: 'a' }).snapped
    ).toBe(false);
    expect(input).toEqual(before);
  });
});

describe('wall snapping', () => {
  it('returns free placement untouched when snapping is disabled', () => {
    const result = snapWallPoint({
      point: { x: 0.37, z: -1.21 },
      enabled: false,
    });
    expect(result).toEqual({ point: { x: 0.37, z: -1.21 }, snapped: false });
  });

  it('snaps to a hex centre, a corner and a side midpoint', () => {
    const centre = cubeToWorld({ x: 0, y: 0, z: 0 }, HEX_SIZE);
    const centreSnap = snapWallPoint({
      point: { x: centre.x + 0.05, z: centre.z - 0.04 },
      enabled: true,
    });
    expect(centreSnap.snapped).toBe(true);
    expect(centreSnap.point.x).toBeCloseTo(centre.x);
    expect(centreSnap.point.z).toBeCloseTo(centre.z);

    const corner = hexCorners(centre, HEX_SIZE)[0]!;
    const cornerSnap = snapWallPoint({
      point: { x: corner.x + 0.03, z: corner.z },
      enabled: true,
    });
    expect(cornerSnap.point.x).toBeCloseTo(corner.x);
    expect(cornerSnap.point.z).toBeCloseTo(corner.z);

    const neighbour = cubeToWorld({ x: 1, y: -1, z: 0 }, HEX_SIZE);
    const sideMid = {
      x: (centre.x + neighbour.x) / 2,
      z: (centre.z + neighbour.z) / 2,
    };
    const sideSnap = snapWallPoint({
      point: { x: sideMid.x - 0.02, z: sideMid.z + 0.01 },
      enabled: true,
    });
    expect(sideSnap.point.x).toBeCloseTo(sideMid.x);
    expect(sideSnap.point.z).toBeCloseTo(sideMid.z);
  });

  it('reports the same point for a preview and a commit of one input', () => {
    const input = { point: { x: 1.9, z: 0.4 }, enabled: true };
    expect(snapWallPoint(input)).toEqual(snapWallPoint(input));
  });

  it('refuses nonfinite input rather than guessing a snap', () => {
    expect(() =>
      snapWallPoint({ point: { x: NaN, z: 0 }, enabled: true })
    ).toThrow('Structural wall edit');
  });
});

describe('repeatable wall asset eligibility', () => {
  it('refuses legacy assets and generated assets carrying a door leaf', () => {
    expect(isRepeatableWallAsset({ source: 'legacy' })).toBe(false);
    expect(
      isRepeatableWallAsset({
        source: 'generated',
        asset: {
          boundsMeters: [1, 1, 1],
          roles: [{ role: 'leaf' }],
        },
      })
    ).toBe(false);
  });

  it('refuses unusable measured dimensions', () => {
    expect(
      isRepeatableWallAsset({
        source: 'generated',
        asset: { boundsMeters: [1, 0, 1] },
      })
    ).toBe(false);
    expect(
      isRepeatableWallAsset({
        source: 'generated',
        asset: { boundsMeters: [1, Number.NaN, 1] },
      })
    ).toBe(false);
  });

  it('accepts a generated asset with measured dimensions and no leaf', () => {
    expect(
      isRepeatableWallAsset({
        source: 'generated',
        asset: { boundsMeters: [2.78, 2.25, 0.24] },
      })
    ).toBe(true);
  });
});

describe('wall piece derivation', () => {
  it('even-fits the visible span and cuts the authored opening interval', () => {
    const layouts = layoutWallPieces({
      wall: wall(),
      sourceWidthMeters: 2,
      sourceHeightMeters: 2,
      sourceDepthMeters: 0.25,
    });
    expect(layouts).toHaveLength(2);
    expect(layouts[0]!.span).toEqual({ start: 0, end: 6 });
    expect(layouts[1]!.span).toEqual({ start: 8, end: 10 });
    // Catalog width is already 2 scene units: [0,6] fits three pieces.
    expect(layouts[0]!.pieces).toHaveLength(3);
    expect(layouts[1]!.pieces).toHaveLength(1);
    expect(layouts[0]!.pieces[0]!.point.x).toBeCloseTo(1);
    expect(layouts[0]!.pieces[2]!.point.x).toBeCloseTo(5);
    // 8→10 fits one piece centred at 9, not a piece at the opening edge.
    expect(layouts[1]!.pieces[0]!.point.x).toBeCloseTo(9);
  });

  it('uses the same scene units for the repeat count and the fit scale', () => {
    // Length 2.5 with catalog runtime width 2 fits one piece at scale 1.25.
    // Scaling the catalog a second time incorrectly asks for two pieces.
    const target = wall({
      line: { start: { x: 0, z: 0 }, end: { x: 2.5, z: 0 } },
      openings: [],
    });
    const layouts = layoutWallPieces({
      wall: target,
      sourceWidthMeters: 2,
      sourceHeightMeters: 2,
      sourceDepthMeters: 0.25,
    });
    expect(layouts[0]!.pieces).toHaveLength(1);
    expect(layouts[0]!.pieces[0]!.widthScale).toBeCloseTo(2.5 / 2);
  });

  it('keeps the authored elevation with no dungeon surface lift baked in', () => {
    const layouts = layoutWallPieces({
      wall: wall(),
      sourceWidthMeters: 2,
      sourceHeightMeters: 2,
      sourceDepthMeters: 0.25,
    });
    for (const layout of layouts) {
      for (const piece of layout.pieces) {
        expect(piece.y).toBe(0.1);
      }
    }
  });

  it('fits against already-scaled catalog dimensions', () => {
    const layouts = layoutWallPieces({
      wall: wall(),
      sourceWidthMeters: 2,
      sourceHeightMeters: 4,
      sourceDepthMeters: 0.5,
    });
    // Span [8,10] is 2 scene units; the catalog's width is already 2.
    const piece = layouts[1]!.pieces[0]!;
    expect(piece.widthScale).toBeCloseTo(2 / 2);
    expect(piece.heightScale).toBeCloseTo(3 / 4);
    expect(piece.depthScale).toBeCloseTo(0.3 / 0.5);
  });

  it('returns the exact parent-owned height fit, unbounded by the prop clamp', () => {
    const tall = layoutWallPieces({
      wall: wall({
        appearance: {
          assetRef: WALL_ASSET,
          height: 20,
          thickness: 0.3,
          elevation: 0,
        },
      }),
      sourceWidthMeters: 2,
      sourceHeightMeters: 2,
      sourceDepthMeters: 0.25,
    });
    expect(tall[0]!.pieces[0]!.heightScale).toBeCloseTo(20 / 2);
    expect(tall[0]!.pieces[0]!.heightScale).toBeGreaterThan(4);

    const short = layoutWallPieces({
      wall: wall({
        appearance: {
          assetRef: WALL_ASSET,
          height: 0.1,
          thickness: 0.3,
          elevation: 0,
        },
      }),
      sourceWidthMeters: 2,
      sourceHeightMeters: 2,
      sourceDepthMeters: 0.25,
    });
    expect(short[0]!.pieces[0]!.heightScale).toBeCloseTo(0.1 / 2);
    expect(short[0]!.pieces[0]!.heightScale).toBeLessThan(0.25);
  });

  it('uses the wall direction yaw for a diagonal run', () => {
    const target = wall({
      line: { start: { x: 0, z: 0 }, end: { x: 3, z: 4 } },
      openings: [],
    });
    // Native world width chosen as 1 unit so the even-fit count is 5.
    const layouts = layoutWallPieces({
      wall: target,
      sourceWidthMeters: 1,
      sourceHeightMeters: 1,
      sourceDepthMeters: 0.25,
    });
    const piece = layouts[0]!.pieces[1]!;
    expect(piece.rotationY).toBeCloseTo(wallDirectionYaw(target));
    expect(piece.point.x).toBeCloseTo(0.9);
    expect(piece.point.z).toBeCloseTo(1.2);
  });

  it('produces no pieces when the opening fills the whole wall', () => {
    const target = wall({
      openings: [{ id: 'a', position: 5, width: 10 }],
    });
    expect(
      layoutWallPieces({
        wall: target,
        sourceWidthMeters: 1,
        sourceHeightMeters: 1,
        sourceDepthMeters: 0.25,
      })
    ).toEqual([]);
  });

  it('refuses an excessive piece count by name without allocating', () => {
    expect(() =>
      layoutWallPieces({
        wall: wall({ line: { start: { x: 0, z: 0 }, end: { x: 4000, z: 0 } } }),
        sourceWidthMeters: 1,
        sourceHeightMeters: 1,
        sourceDepthMeters: 0.25,
        maxPieces: 32,
      })
    ).toThrow(/allocation cap/);
    expect(MAX_WALL_PIECES_PER_WALL).toBeGreaterThan(0);
  });

  it('refuses nonpositive source dimensions', () => {
    expect(() =>
      layoutWallPieces({
        wall: wall(),
        sourceWidthMeters: 0,
        sourceHeightMeters: 1,
        sourceDepthMeters: 1,
      })
    ).toThrow('Structural wall edit');
  });
});

describe('exact length resize', () => {
  it('moves the end to the requested length and carries the opening', () => {
    const result = resizeWallLength({
      wall: wall(),
      endpoint: 'end',
      length: 14,
    });
    expect(result.wall.line.end).toEqual({ x: 14, z: 0 });
    expect(result.appliedLength).toBeCloseTo(14);
    expect(result.clamped).toBe(false);
    expect(result.wall.openings).toEqual([
      { id: 'opening-1', position: 7, width: 2 },
    ]);
    expect(openingPoint(result.wall, 'opening-1')).toEqual({ x: 7, z: 0 });
  });

  it('stops a shortening edit at the doorway edge without deleting it', () => {
    const result = resizeWallLength({
      wall: wall(),
      endpoint: 'end',
      length: 7,
    });
    expect(result.wall.line.end.x).toBeCloseTo(8);
    expect(result.appliedLength).toBeCloseTo(8);
    expect(result.clamped).toBe(true);
    expect(result.wall.openings.map((opening) => opening.id)).toEqual([
      'opening-1',
    ]);
    expect(openingPoint(result.wall, 'opening-1')).toEqual({ x: 7, z: 0 });
  });

  it('rebases opening distances when the starting end moves', () => {
    const result = resizeWallLength({
      wall: wall(),
      endpoint: 'start',
      length: 12,
    });
    expect(result.wall.line.start.x).toBeCloseTo(-2);
    expect(result.wall.openings[0]).toEqual({
      id: 'opening-1',
      position: 9,
      width: 2,
    });
    expect(openingPoint(result.wall, 'opening-1')).toEqual({ x: 7, z: 0 });
  });

  it('preserves blocker end margins via the same signed width delta', () => {
    const result = resizeWallLength({
      wall: wall(),
      endpoint: 'end',
      length: 14,
    });
    expect(result.wall.blocker.footprint.width).toBeCloseTo(16);
    expect(result.wall.blocker.footprint.depth).toBe(0.5);
    expect(result.wall.blocker.footprint.offsetX).toBe(1);
    expect(result.wall.blocker.footprint.offsetZ).toBe(-0.2);
    expect(result.wall.blocker.blocksLineOfSight).toBe(true);
    // near edge distance from start is unchanged when width grows with length.
    const nearEdgeDistance = (material: StructuralWall) => {
      const length = Math.hypot(
        material.line.end.x - material.line.start.x,
        material.line.end.z - material.line.start.z
      );
      return (
        length / 2 +
        material.blocker.footprint.offsetX -
        material.blocker.footprint.width / 2
      );
    };
    expect(nearEdgeDistance(result.wall)).toBeCloseTo(nearEdgeDistance(wall()));
  });

  it('refuses an edit that would leave a nonpositive blocker width', () => {
    const target = wall({
      openings: [],
      blocker: {
        footprint: { width: 1, depth: 0.25, offsetX: 0, offsetZ: 0 },
        blocksMovement: false,
        blocksLineOfSight: false,
      },
    });
    expect(() =>
      resizeWallLength({ wall: target, endpoint: 'end', length: 0.4 })
    ).toThrow(/nonpositive blocker width/);
    expect(target.line.end.x).toBe(10);
  });

  it('refuses a nonpositive or nonfinite requested length without mutating', () => {
    const target = wall();
    for (const length of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        resizeWallLength({ wall: target, endpoint: 'end', length })
      ).toThrow('Structural wall edit');
    }
    expect(target.line.end.x).toBe(10);
  });
});

describe('endpoint reshape', () => {
  it('resizes then rotates the end about the fixed start without openings', () => {
    const source = wall({ openings: [] });
    const result = reshapeWallEndpoint({
      wall: source,
      endpoint: 'end',
      point: { x: 0, z: 6 },
    });
    expect(result.wall.line.start).toEqual(source.line.start);
    expect(result.wall.line.end.x).toBeCloseTo(0, 12);
    expect(result.wall.line.end.z).toBeCloseTo(6, 12);
    expect(result.appliedLength).toBeCloseTo(6, 12);
    expect(result.clamped).toBe(false);
    expect(result.wall.blocker.footprint.width).toBeCloseTo(8, 12);
  });

  it('clamps at the opening edge and rotates its attached door with the wall', () => {
    const door = {
      id: 'door-1',
      assetRef: 'dnd5e:env:dark-fortress:wall_door_double_01',
    };
    const source = wall({
      openings: [{ id: 'opening-1', position: 7, width: 2, door }],
    });
    const result = reshapeWallEndpoint({
      wall: source,
      endpoint: 'end',
      point: { x: 0, z: 6 },
    });
    expect(result.wall.line.start).toEqual({ x: 0, z: 0 });
    expect(result.wall.line.end.x).toBeCloseTo(0, 12);
    expect(result.wall.line.end.z).toBeCloseTo(8, 12);
    expect(result.appliedLength).toBeCloseTo(8, 12);
    expect(result.clamped).toBe(true);
    expect(result.wall.openings).toEqual(source.openings);
    expect(result.wall.openings[0]!.door).toBe(door);
    const point = openingPoint(result.wall, 'opening-1');
    expect(point.x).toBeCloseTo(0, 12);
    expect(point.z).toBeCloseTo(7, 12);
    expect(result.wall).toMatchObject({
      id: source.id,
      label: source.label,
      appearance: source.appearance,
      blocker: {
        ...source.blocker,
        footprint: { ...source.blocker.footprint, width: 10 },
      },
    });
  });

  it('rebases local openings on a start drag before rotating about the fixed end', () => {
    const source = wall();
    const result = reshapeWallEndpoint({
      wall: source,
      endpoint: 'start',
      point: { x: 10, z: -12 },
    });
    expect(result.wall.line.end).toEqual(source.line.end);
    expect(result.wall.line.start.x).toBeCloseTo(10, 12);
    expect(result.wall.line.start.z).toBeCloseTo(-12, 12);
    expect(result.appliedLength).toBeCloseTo(12, 12);
    expect(result.clamped).toBe(false);
    expect(result.wall.openings[0]).toEqual({
      id: 'opening-1',
      position: 9,
      width: 2,
    });
    const point = openingPoint(result.wall, 'opening-1');
    expect(point.x).toBeCloseTo(10, 12);
    expect(point.z).toBeCloseTo(-3, 12);
    expect(result.wall.blocker.footprint.width).toBeCloseTo(14, 12);
  });

  it('clamps a start drag to the nearest opening edge on the requested ray', () => {
    const source = wall();
    const result = reshapeWallEndpoint({
      wall: source,
      endpoint: 'start',
      point: { x: 10, z: -2 },
    });
    expect(result.wall.line.end).toEqual(source.line.end);
    expect(result.wall.line.start.x).toBeCloseTo(10, 12);
    expect(result.wall.line.start.z).toBeCloseTo(-4, 12);
    expect(result.appliedLength).toBeCloseTo(4, 12);
    expect(result.clamped).toBe(true);
    expect(result.wall.openings[0]).toEqual({
      id: 'opening-1',
      position: 1,
      width: 2,
    });
    const point = openingPoint(result.wall, 'opening-1');
    expect(point.x).toBeCloseTo(10, 12);
    expect(point.z).toBeCloseTo(-3, 12);
    expect(result.wall.blocker.footprint.width).toBeCloseTo(6, 12);
  });

  it.each(['start', 'end'] as const)(
    'handles a rotated wall with negative coordinates dragging %s',
    (endpoint) => {
      const source = wall({
        line: { start: { x: -8, z: -9 }, end: { x: -2, z: -1 } },
      });
      const fixed = source.line[endpoint === 'start' ? 'end' : 'start'];
      const result = reshapeWallEndpoint({
        wall: source,
        endpoint,
        point: { x: fixed.x - 9.6, z: fixed.z + 7.2 },
      });
      expect(result.wall.line[endpoint === 'start' ? 'end' : 'start']).toEqual(
        fixed
      );
      expect(result.wall.line[endpoint].x).toBeCloseTo(fixed.x - 9.6, 12);
      expect(result.wall.line[endpoint].z).toBeCloseTo(fixed.z + 7.2, 12);
      expect(result.appliedLength).toBeCloseTo(12, 12);
      expect(result.clamped).toBe(false);
      // The doorway remains 7 from the fixed start or 3 from the fixed end.
      const point = openingPoint(result.wall, 'opening-1');
      const distance = endpoint === 'end' ? 7 : 3;
      expect(point.x).toBeCloseTo(fixed.x - 0.8 * distance, 12);
      expect(point.z).toBeCloseTo(fixed.z + 0.6 * distance, 12);
      expect(result.wall.openings[0]!.position).toBe(
        endpoint === 'end' ? 7 : 9
      );
    }
  );

  it.each(['start', 'end'] as const)(
    'retains an exactly unchanged %s without floating-point pose drift',
    (endpoint) => {
      const source = wall({
        line: { start: { x: -2.7, z: -3.1 }, end: { x: 3.2, z: 5.7 } },
      });
      const result = reshapeWallEndpoint({
        wall: source,
        endpoint,
        point: { ...source.line[endpoint] },
      });
      expect(result.wall).toEqual(source);
      expect(result.wall).not.toBe(source);
      expect(result.clamped).toBe(false);
      expect(result.appliedLength).toBe(Math.hypot(5.9, 8.8));
    }
  );

  it('rotates through the fixed endpoint at unchanged radius without rebasing openings', () => {
    const source = wall();
    const result = reshapeWallEndpoint({
      wall: source,
      endpoint: 'end',
      point: { x: -10, z: 0 },
    });
    expect(result.wall.line.start).toEqual(source.line.start);
    expect(result.wall.line.end.x).toBeCloseTo(-10, 12);
    expect(result.wall.line.end.z).toBeCloseTo(0, 12);
    expect(result.wall.openings).toEqual(source.openings);
    expect(result.wall.blocker).toEqual(source.blocker);
    expect(result.appliedLength).toBe(10);
    expect(result.clamped).toBe(false);
    const point = openingPoint(result.wall, 'opening-1');
    expect(point.x).toBeCloseTo(-7, 12);
    expect(point.z).toBeCloseTo(0, 12);
  });

  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])(
    'preserves independent blocker flags movement=%s sight=%s',
    (blocksMovement, blocksLineOfSight) => {
      const source = wall();
      source.blocker.blocksMovement = blocksMovement;
      source.blocker.blocksLineOfSight = blocksLineOfSight;
      const result = reshapeWallEndpoint({
        wall: source,
        endpoint: 'end',
        point: { x: -12, z: -5 },
      });
      expect(result.wall.blocker).toEqual({
        ...source.blocker,
        footprint: { ...source.blocker.footprint, width: 15 },
      });
      expect(result.wall.appearance).toEqual(source.appearance);
      expect(result.wall.id).toBe(source.id);
      expect(result.wall.label).toBe(source.label);
    }
  );

  it.each(['start', 'end'] as const)(
    'protects the outermost of multiple opening edges on a %s drag',
    (endpoint) => {
      const source = wall({
        openings: [
          { id: 'far-opening', position: 7, width: 2 },
          { id: 'near-opening', position: 2, width: 2 },
        ],
      });
      const fixed = source.line[endpoint === 'start' ? 'end' : 'start'];
      const result = reshapeWallEndpoint({
        wall: source,
        endpoint,
        point: { x: fixed.x, z: fixed.z - 1 },
      });
      const radius = endpoint === 'start' ? 9 : 8;
      expect(result.appliedLength).toBeCloseTo(radius, 12);
      expect(result.clamped).toBe(true);
      expect(result.wall.line[endpoint].x).toBeCloseTo(fixed.x, 12);
      expect(result.wall.line[endpoint].z).toBeCloseTo(fixed.z - radius, 12);
      expect(result.wall.openings.map((opening) => opening.id)).toEqual(
        source.openings.map((opening) => opening.id)
      );
      for (const opening of source.openings) {
        const point = openingPoint(result.wall, opening.id);
        const distance =
          endpoint === 'end' ? opening.position : 10 - opening.position;
        expect(point.x).toBeCloseTo(fixed.x, 12);
        expect(point.z).toBeCloseTo(fixed.z - distance, 12);
      }
    }
  );

  it('preserves the existing collinear resize result without an extra rotation', () => {
    const source = wall();
    expect(
      reshapeWallEndpoint({
        wall: source,
        endpoint: 'start',
        point: { x: -2, z: 0 },
      })
    ).toEqual(
      resizeWallLength({ wall: source, endpoint: 'start', length: 12 })
    );
  });

  it.each(['start', 'end'] as const)(
    'refuses nonfinite and zero-radius %s requests immutably',
    (endpoint) => {
      const source = wall();
      const before = structuredClone(source);
      const fixed = source.line[endpoint === 'start' ? 'end' : 'start'];
      for (const point of [
        fixed,
        { x: NaN, z: 1 },
        { x: 1, z: Infinity },
        { x: -Infinity, z: 1 },
        { x: 1, z: NaN },
      ]) {
        expect(() =>
          reshapeWallEndpoint({ wall: source, endpoint, point })
        ).toThrow('Structural wall edit');
        expect(source).toEqual(before);
      }
    }
  );

  it.each(['start', 'end'] as const)(
    'refuses a %s request with nonpositive resulting blocker width immutably',
    (endpoint) => {
      const source = wall({
        openings: [],
        blocker: {
          footprint: { width: 4, depth: 0.25, offsetX: 1, offsetZ: -1 },
          blocksMovement: false,
          blocksLineOfSight: false,
        },
      });
      const before = structuredClone(source);
      const fixed = source.line[endpoint === 'start' ? 'end' : 'start'];
      for (const radius of [6, 5]) {
        expect(() =>
          reshapeWallEndpoint({
            wall: source,
            endpoint,
            point: { x: fixed.x, z: fixed.z + radius },
          })
        ).toThrow(/Structural wall edit:.*nonpositive blocker width/);
        expect(source).toEqual(before);
      }
    }
  );
});

describe('doorless opening editing', () => {
  it('adds an opening and refuses overlap, extent and duplicate identity', () => {
    const next = addWallOpening(wall({ openings: [] }), {
      id: 'window',
      position: 3,
      width: 2,
    });
    expect(next.openings).toEqual([{ id: 'window', position: 3, width: 2 }]);
    expect(() =>
      addWallOpening(next, { id: 'other', position: 3.5, width: 1 })
    ).toThrow(/overlap/);
    expect(() =>
      addWallOpening(next, { id: 'other', position: 9.8, width: 1 })
    ).toThrow(/does not fit/);
    expect(() =>
      addWallOpening(next, { id: 'window', position: 7, width: 1 })
    ).toThrow(/already used/);
    expect(next.openings).toHaveLength(1);
  });

  it('updates one opening by id and leaves others alone', () => {
    const next = addWallOpening(wall(), {
      id: 'window',
      position: 2,
      width: 1,
    });
    const updated = updateWallOpening(next, 'window', {
      position: 3,
      width: 2,
    });
    expect(updated.openings).toEqual([
      { id: 'opening-1', position: 7, width: 2 },
      { id: 'window', position: 3, width: 2 },
    ]);
    expect(() =>
      updateWallOpening(next, 'missing', { position: 3, width: 2 })
    ).toThrow(/unknown opening/);
  });

  it('preserves an attached-door record through an opening edit', () => {
    const withDoor = wall({
      openings: [
        {
          id: 'opening-1',
          position: 7,
          width: 2,
          door: {
            id: 'door-1',
            assetRef: 'dnd5e:env:dark-fortress:wall_door_double_01',
          },
        },
      ],
    });
    const updated = updateWallOpening(withDoor, 'opening-1', {
      position: 7,
      width: 2.5,
    });
    expect(updated.openings[0]).toEqual({
      id: 'opening-1',
      position: 7,
      width: 2.5,
      door: {
        id: 'door-1',
        assetRef: 'dnd5e:env:dark-fortress:wall_door_double_01',
      },
    });
    // The source is untouched.
    expect(withDoor.openings[0]!.width).toBe(2);
  });

  it('removes one opening and tolerates an absent id', () => {
    expect(removeWallOpening(wall(), 'opening-1').openings).toEqual([]);
    expect(removeWallOpening(wall(), 'absent').openings).toHaveLength(1);
  });
});

describe('appearance and blocker edits', () => {
  it('changes appearance without touching blocker, openings or identity', () => {
    const source = wall();
    const next = setWallAppearance(source, {
      assetRef: 'dnd5e:env:dark-fantasy:pillar_01',
      height: 4,
      thickness: 0.5,
      elevation: -0.2,
    });
    expect(next.id).toBe(source.id);
    expect(next.line).toEqual(source.line);
    expect(next.openings).toEqual(source.openings);
    expect(next.blocker).toEqual(source.blocker);
    expect(next.appearance.height).toBe(4);
  });

  it('refuses an unknown asset and invalid dimensions without mutation', () => {
    const source = wall();
    expect(() =>
      setWallAppearance(source, {
        assetRef: 'dnd5e:props:not-real',
        height: 3,
        thickness: 0.3,
        elevation: 0,
      })
    ).toThrow(/unknown catalog asset/);
    expect(() =>
      setWallAppearance(source, {
        assetRef: WALL_ASSET,
        height: 0,
        thickness: 0.3,
        elevation: 0,
      })
    ).toThrow('Structural wall edit');
    expect(source.appearance.height).toBe(3);
  });

  it('edits label and blocker independent of appearance', () => {
    const labelled = setWallLabel(wall(), 'South wall');
    expect(labelled.label).toBe('South wall');
    expect(labelled.appearance).toEqual(wall().appearance);
    const blocked = setWallBlocker(wall(), {
      footprint: { width: 30, depth: 0.4, offsetX: 2, offsetZ: 1 },
      blocksMovement: true,
      blocksLineOfSight: false,
    });
    expect(blocked.blocker.footprint.width).toBe(30);
    expect(blocked.appearance).toEqual(wall().appearance);
    expect(() =>
      setWallBlocker(wall(), {
        footprint: { width: 0, depth: 0.4, offsetX: 0, offsetZ: 0 },
        blocksMovement: false,
        blocksLineOfSight: false,
      })
    ).toThrow('Structural wall edit');
  });
});

describe('whole-wall operations', () => {
  it('translates the wall and its noncentral opening as one structure', () => {
    const next = translateWall(wall(), { x: 2, z: 3 });
    expect(next.line.start).toEqual({ x: 2, z: 3 });
    expect(next.line.end).toEqual({ x: 12, z: 3 });
    expect(openingPoint(next, 'opening-1')).toEqual({ x: 9, z: 3 });
    expect(next.openings).toEqual(wall().openings);
    expect(next.blocker).toEqual(wall().blocker);
  });

  it('rotates about the wall midpoint using the mathematical XZ plane', () => {
    const target = wall({
      line: { start: { x: 0, z: 0 }, end: { x: 10, z: 0 } },
    });
    const next = rotateWall(target, { angle: Math.PI / 2 });
    const point = openingPoint(next, 'opening-1');
    expect(point.x).toBeCloseTo(5);
    expect(point.z).toBeCloseTo(2);
    expect(next.openings).toEqual(target.openings);
  });
});

describe('wall creation and guides', () => {
  it('creates a wall with movement and sight blocking enabled by default', () => {
    const created = createWall({
      id: 'wall-2',
      start: { x: 0, z: 0 },
      end: { x: 6, z: 0 },
      assetRef: WALL_ASSET,
      height: 3,
      thickness: 0.3,
      elevation: 0,
    });
    expect(created.blocker.footprint.width).toBeCloseTo(6);
    expect(created.blocker.footprint.depth).toBe(DEFAULT_WALL_BLOCKER_DEPTH);
    expect(created.blocker.blocksMovement).toBe(true);
    expect(created.blocker.blocksLineOfSight).toBe(true);
    const edited = setWallBlocker(created, {
      ...created.blocker,
      blocksMovement: false,
      blocksLineOfSight: false,
    });
    expect(edited.blocker.blocksMovement).toBe(false);
    expect(edited.blocker.blocksLineOfSight).toBe(false);
    expect(created.openings).toEqual([]);
  });

  it('refuses a zero-length draw and nonfinite points', () => {
    expect(() =>
      createWall({
        id: 'wall-2',
        start: { x: 1, z: 1 },
        end: { x: 1, z: 1 },
        assetRef: WALL_ASSET,
        height: 3,
        thickness: 0.3,
        elevation: 0,
      })
    ).toThrow(/finite positive length/);
    expect(() =>
      createWall({
        id: 'wall-2',
        start: { x: Number.NaN, z: 0 },
        end: { x: 1, z: 0 },
        assetRef: WALL_ASSET,
        height: 3,
        thickness: 0.3,
        elevation: 0,
      })
    ).toThrow('Structural wall edit');
  });

  it('places the blocker guide from the authored independent offset', () => {
    const guide = wallBlockerGuide(wall());
    expect(guide.width).toBe(12);
    expect(guide.depth).toBe(0.5);
    // midpoint (5,0) + localX(1,0)*offsetX(1) + localZ(0,1)*offsetZ(-0.2)
    expect(guide.point.x).toBeCloseTo(6);
    expect(guide.point.z).toBeCloseTo(-0.2);
    expect(guide.rotationY).toBeCloseTo(0);
    expect(wallMidpoint(wall())).toEqual({ x: 5, z: 0 });
  });
});

describe('no source mutation', () => {
  it('leaves frozen source walls unchanged through every edit', () => {
    const source = wall();
    const before = JSON.stringify(source);
    Object.freeze(source.appearance);
    Object.freeze(source.blocker.footprint);
    Object.freeze(source.blocker);
    Object.freeze(source.openings[0]);
    Object.freeze(source.openings);
    Object.freeze(source.line.start);
    Object.freeze(source.line.end);
    Object.freeze(source.line);
    Object.freeze(source);
    reshapeWallEndpoint({
      wall: source,
      endpoint: 'end',
      point: { x: -2, z: 14 },
    });
    reshapeWallEndpoint({
      wall: source,
      endpoint: 'start',
      point: { x: 10, z: -12 },
    });
    resizeWallLength({ wall: source, endpoint: 'end', length: 14 });
    translateWall(source, { x: 1, z: 1 });
    rotateWall(source, { angle: 0.5 });
    addWallOpening(source, { id: 'x', position: 2, width: 1 });
    setWallAppearance(source, {
      assetRef: WALL_ASSET,
      height: 5,
      thickness: 0.4,
      elevation: 0,
    });
    expect(JSON.stringify(source)).toBe(before);
  });
});

describe('M1 exact editing no-ops', () => {
  it('preserves the complete frozen fractional wall for both unchanged lengths, zero move and zero rotation', () => {
    const source = wall({
      line: { start: { x: -2.7, z: -3.1 }, end: { x: 3.2, z: 5.7 } },
      openings: [
        {
          id: 'opening-1',
          position: 7,
          width: 2,
          door: { id: 'attached-door', assetRef: WALL_ASSET },
        },
      ],
    });
    const before = structuredClone(source);
    const length = Math.hypot(
      source.line.end.x - source.line.start.x,
      source.line.end.z - source.line.start.z
    );
    Object.freeze(source.appearance);
    Object.freeze(source.blocker.footprint);
    Object.freeze(source.blocker);
    Object.freeze(source.openings[0].door);
    Object.freeze(source.openings[0]);
    Object.freeze(source.openings);
    Object.freeze(source.line.start);
    Object.freeze(source.line.end);
    Object.freeze(source.line);
    Object.freeze(source);
    for (const endpoint of ['start', 'end'] as const) {
      const result = resizeWallLength({ wall: source, endpoint, length });
      expect(result).toEqual({
        wall: before,
        appliedLength: length,
        clamped: false,
      });
      expect(result.wall).not.toBe(source);
      expect(result.wall.blocker).not.toBe(source.blocker);
    }
    expect(translateWall(source, { x: 0, z: 0 })).toEqual(before);
    expect(rotateWall(source, { angle: 0 })).toEqual(before);
    expect(
      rotateWall(source, { angle: 0, pivot: { x: 0.25, z: 1.3 } })
    ).toEqual(before);
    expect(source).toEqual(before);
  });
  it.each(['start', 'end'] as const)(
    'retains length/clamp metadata for a %s edit clamped to the original fractional pose',
    (endpoint) => {
      const source = wall({
        line: { start: { x: 0, z: 0 }, end: { x: 3, z: 2 } },
      });
      const length = Math.hypot(3, 2);
      source.openings = [{ id: 'whole', position: length / 2, width: length }];
      expect(
        resizeWallLength({ wall: source, endpoint, length: length - 1 })
      ).toEqual({ wall: source, appliedLength: length, clamped: true });
    }
  );
  it('does not treat intentional tiny length, movement or rotation edits as unchanged', () => {
    const source = wall({
      line: { start: { x: 0, z: 0 }, end: { x: 3, z: 2 } },
      openings: [],
    });
    expect(
      resizeWallLength({
        wall: source,
        endpoint: 'end',
        length: Math.hypot(3, 2) + 1e-10,
      }).wall
    ).not.toEqual(source);
    expect(translateWall(source, { x: 1e-10, z: 0 })).not.toEqual(source);
    expect(rotateWall(source, { angle: 1e-10 })).not.toEqual(source);
  });
  it('still refuses invalid input geometry, blocker width and zero-operation parameters', () => {
    const source = wall();
    source.openings[0].width = -1;
    expect(() =>
      resizeWallLength({ wall: source, endpoint: 'end', length: 10 })
    ).toThrow('Wall geometry');
    expect(() => translateWall(source, { x: 0, z: 0 })).toThrow(
      'Wall geometry'
    );
    expect(() => rotateWall(source, { angle: 0 })).toThrow('Wall geometry');
    const badBlocker = wall();
    badBlocker.blocker.footprint.width = 0;
    expect(() =>
      resizeWallLength({ wall: badBlocker, endpoint: 'end', length: 10 })
    ).toThrow(/nonpositive blocker width/);
    expect(() =>
      rotateWall(wall(), { angle: 0, pivot: { x: NaN, z: 0 } })
    ).toThrow('Wall geometry');
    expect(() => translateWall(wall(), { x: Infinity, z: 0 })).toThrow(
      'Structural wall edit'
    );
    expect(() =>
      resizeWallLength({ wall: wall(), endpoint: 'end', length: NaN })
    ).toThrow('Structural wall edit');
  });
});
