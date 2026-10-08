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
  resizeWallLength,
  rotateWall,
  setWallAppearance,
  setWallBlocker,
  setWallLabel,
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
