import { describe, expect, it } from 'vitest';
import {
  attachableDoorAssetRefs,
  attachDoorToOpening,
  attachedDoorPlacement,
  isAttachableDoorAsset,
  openingDoorId,
  removeDoorFromOpening,
  swapOpeningDoorAsset,
  wallBoundDoorIds,
} from './structuralDoorEditing';
import {
  resizeWallLength,
  rotateWall,
  translateWall,
} from './structuralWallEditing';
import { wallOpeningPoint } from './structuralWallGeometry';
import type { StructuralWall } from './structuralWalls';

const WALL_ASSET = 'dnd5e:env:dark-fortress:45_wall_01';
const DOOR_ASSET = 'dnd5e:env:dark-fortress:wall_door_double_01';
const DOOR_BOUNDS_METERS = [
  1.8749944567680359, 2.2550519014766905, 0.2637633271515371,
] as const;

function wall(overrides: Partial<StructuralWall> = {}): StructuralWall {
  return {
    id: 'wall-1',
    label: 'North wall',
    line: { start: { x: 0, z: 0 }, end: { x: 10, z: 0 } },
    openings: [
      {
        id: 'opening-1',
        position: 7,
        width: 2,
        door: { id: 'door-1', assetRef: DOOR_ASSET },
      },
    ],
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

describe('structural door assets', () => {
  it('offers only known catalog assets whose model declares a door leaf', () => {
    expect(isAttachableDoorAsset(DOOR_ASSET)).toBe(true);
    expect(attachableDoorAssetRefs()).toContain(DOOR_ASSET);
    // A wall/column has no leaf; an unknown ref falls back to nothing.
    expect(isAttachableDoorAsset(WALL_ASSET)).toBe(false);
    expect(isAttachableDoorAsset('https://unknown/model.glb')).toBe(false);
  });
});

describe('attach / swap / remove move only the opening record', () => {
  it('attaches a door to a bare opening without touching the gap', () => {
    const bare = wall({
      openings: [{ id: 'opening-1', position: 7, width: 2 }],
    });
    const next = attachDoorToOpening(bare, {
      openingId: 'opening-1',
      doorId: 'door-new',
      assetRef: DOOR_ASSET,
    });
    expect(next.openings[0]).toEqual({
      id: 'opening-1',
      position: 7,
      width: 2,
      door: { id: 'door-new', assetRef: DOOR_ASSET },
    });
    expect(wallBoundDoorIds(next)).toEqual(['door-new']);
    expect(openingDoorId(next, 'opening-1')).toBe('door-new');
    // Input untouched.
    expect(bare.openings[0]!.door).toBeUndefined();
  });

  it('refuses a second attach, an unknown asset and a colliding id', () => {
    expect(() =>
      attachDoorToOpening(wall(), {
        openingId: 'opening-1',
        doorId: 'door-2',
        assetRef: DOOR_ASSET,
      })
    ).toThrow(/already has a door/);
    const bare = wall({
      openings: [{ id: 'opening-1', position: 7, width: 2 }],
    });
    expect(() =>
      attachDoorToOpening(bare, {
        openingId: 'opening-1',
        doorId: 'door-2',
        assetRef: WALL_ASSET,
      })
    ).toThrow(/unknown door asset/);
    expect(() =>
      attachDoorToOpening(bare, {
        openingId: 'opening-1',
        doorId: 'opening-1',
        assetRef: DOOR_ASSET,
      })
    ).toThrow(/already used/);
  });

  it('swaps appearance retaining id, and removes the door keeping the gap', () => {
    const swapped = swapOpeningDoorAsset(wall(), {
      openingId: 'opening-1',
      assetRef: DOOR_ASSET,
    });
    expect(swapped.openings[0]!.door).toEqual({
      id: 'door-1',
      assetRef: DOOR_ASSET,
    });
    const removed = removeDoorFromOpening(wall(), 'opening-1');
    expect(removed.openings[0]).toEqual({
      id: 'opening-1',
      position: 7,
      width: 2,
    });
    expect(wallBoundDoorIds(removed)).toEqual([]);
  });
});

describe('opening-owned pose survives every wall edit', () => {
  it('keeps the resolved door center when the start is extended to -2', () => {
    const source = wall();
    const { wall: resized } = resizeWallLength({
      wall: source,
      endpoint: 'start',
      length: 12,
    });
    expect(resized.openings[0]!.position).toBeCloseTo(9);
    expect(resized.openings[0]!.door).toEqual({
      id: 'door-1',
      assetRef: DOOR_ASSET,
    });
    expect(wallOpeningPoint({ wall: resized, openingId: 'opening-1' })).toEqual(
      {
        x: 7,
        z: 0,
      }
    );
  });

  it('carries the door through whole-wall translation and rotation', () => {
    const moved = translateWall(wall(), { x: 2, z: 3 });
    expect(moved.openings[0]!.door).toEqual({
      id: 'door-1',
      assetRef: DOOR_ASSET,
    });
    expect(wallOpeningPoint({ wall: moved, openingId: 'opening-1' })).toEqual({
      x: 9,
      z: 3,
    });
    const rotated = rotateWall(wall(), { angle: Math.PI / 2 });
    const point = wallOpeningPoint({ wall: rotated, openingId: 'opening-1' });
    expect(point.x).toBeCloseTo(5);
    expect(point.z).toBeCloseTo(2);
    expect(rotated.openings[0]!.door).toEqual({
      id: 'door-1',
      assetRef: DOOR_ASSET,
    });
  });
});

describe('attached door fit', () => {
  it('fits the whole assembly to opening width and wall height/thickness at the opening center', () => {
    const placement = attachedDoorPlacement({
      wall: wall(),
      openingId: 'opening-1',
      assetWidthMeters: DOOR_BOUNDS_METERS[0],
      assetHeightMeters: DOOR_BOUNDS_METERS[1],
      assetDepthMeters: DOOR_BOUNDS_METERS[2],
      open: true,
    });
    expect(placement.point).toEqual({ x: 7, z: 0 });
    expect(placement.rotationY).toBeCloseTo(0);
    expect(placement.y).toBe(0.1);
    expect(placement.open).toBe(true);
    expect(placement.widthScale).toBeCloseTo(2 / DOOR_BOUNDS_METERS[0]);
    expect(placement.heightScale).toBeCloseTo(3 / DOOR_BOUNDS_METERS[1]);
    expect(placement.depthScale).toBeCloseTo(0.3 / DOOR_BOUNDS_METERS[2]);
  });
});
