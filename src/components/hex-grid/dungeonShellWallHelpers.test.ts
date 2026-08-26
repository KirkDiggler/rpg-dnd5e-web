import type { DungeonShellArtifact } from '@/rendering/dungeonShellManifest';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  deriveShellDoorGeometry,
  extendWallRunsAtDoorGaps,
  shellBodyScale,
  shellComponentY,
  shellDoorLeafScale,
  shellDoorSurroundScale,
  shellLocalOffsetToWorld,
  shellRawDimensions,
  shellSeamOverlap,
  shellTrimScale,
  type ShellOpening,
} from './dungeonShellWallHelpers';
import { DOOR_FRAME_CALIBRATED_WIDTH } from './syntyHexWallHelpers';

const body = artifact([-2, 0, -0.2], [2, 4, 0.2]);
const base = artifact([-1.8, 0, -0.3], [1.8, 0.3, 0.3]);
const cap = artifact([-1.9, 0, -0.2], [1.9, 0.4, 0.2]);
const surround = artifact([-1, 0, -0.3], [1, 2.5, 0.3]);

function artifact(
  min: [number, number, number],
  max: [number, number, number]
): DungeonShellArtifact {
  return {
    file: 'env/test.glb',
    sha256: 'a'.repeat(64),
    bounds: { min, max },
  };
}

function boxMesh(
  min: [number, number, number],
  max: [number, number, number]
): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(
    max[0] - min[0],
    max[1] - min[1],
    max[2] - min[2]
  );
  geometry.translate(
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2
  );
  return new THREE.Mesh(geometry);
}

function doorFixture() {
  const frame = new THREE.Group();
  frame.add(
    boxMesh([-1, 0, -0.2], [-0.7, 2, 0.2]),
    boxMesh([0.7, 0, -0.2], [1, 2, 0.2]),
    boxMesh([-1, 2, -0.2], [1, 2.5, 0.2])
  );
  const leaf = new THREE.Group();
  leaf.add(boxMesh([0, 0, -0.1], [1.2, 1.9, 0.1]));
  return { frame, leaf };
}

describe('dungeon shell wall transforms', () => {
  it('validates measured bounds and rejects non-positive dimensions', () => {
    expect(shellRawDimensions(body.bounds)).toEqual({
      width: 4,
      height: 4,
      depth: 0.4,
    });
    expect(() =>
      shellRawDimensions({ min: [0, 0, 0], max: [0, 1, 1] })
    ).toThrow(/positive/);
    expect(() =>
      shellRawDimensions({ min: [0, 0, 0], max: [1, NaN, 1] })
    ).toThrow(/finite/);
  });

  it('fits body, trims, and surround from measured bounds', () => {
    expect(shellBodyScale(body, 1, 2.4)).toEqual([0.25, 0.6, 0.75]);
    expect(shellTrimScale(base, 1)).toEqual([1 / 3.6, 0.75, 0.75]);
    expect(shellTrimScale(cap, 1)).toEqual([1 / 3.8, 0.75, 0.75]);
    expect(shellDoorSurroundScale(surround, 2.4)).toEqual([
      DOOR_FRAME_CALIBRATED_WIDTH / 2,
      2.4 / 2.5,
      0.75,
    ]);
  });

  it('places base/body/surround on the floor and cap at the effective wall top', () => {
    expect(shellComponentY('body', 2.4)).toBe(DUNGEON_SURFACE_Y);
    expect(shellComponentY('base', 2.4)).toBe(DUNGEON_SURFACE_Y);
    expect(shellComponentY('doorSurround', 0.3)).toBe(DUNGEON_SURFACE_Y);
    expect(shellComponentY('cap', 2.4)).toBe(DUNGEON_SURFACE_Y + 2.4);
  });

  it('rotates local offsets using the same X/Z convention as Three.js Y rotation', () => {
    expect(shellLocalOffsetToWorld({ x: 1, z: 0 }, 0)).toEqual({ x: 1, z: 0 });
    expect(shellLocalOffsetToWorld({ x: 0, z: 1 }, Math.PI / 2)).toMatchObject({
      x: 1,
      z: expect.closeTo(0),
    });
  });

  it('extends only door-adjacent visual endpoints under the frame seam', () => {
    const runs = [
      {
        key: 'left',
        start: { x: -2, z: 0 },
        end: { x: -0.5, z: 0 },
        facing: { x: 0, z: 1 },
        height: 0,
      },
      {
        key: 'right',
        start: { x: 0.5, z: 0 },
        end: { x: 2, z: 0 },
        facing: { x: 0, z: 1 },
        height: 2,
      },
    ];
    const gaps = [
      {
        key: 'door',
        connection: 'door',
        position: { x: 0, z: 0 },
        leafPosition: { x: -0.5, z: 0 },
        rotationY: 0,
      },
    ];
    expect(shellSeamOverlap()).toBe(0.08);
    const extended = extendWallRunsAtDoorGaps(runs, gaps);
    expect(extended[0]!.end.x).toBeCloseTo(-0.42);
    expect(extended[1]!.start.x).toBeCloseTo(0.42);
    expect(runs[0]!.end.x).toBe(-0.5);
    expect(extended[0]!.height).toBe(0);
    expect(extended[1]!.height).toBe(2);
  });
});

describe('measured closed-door geometry', () => {
  it('derives the central opening and leaf bounds from mesh geometry, not provider coordinates', () => {
    const { frame, leaf } = doorFixture();
    const geometry = deriveShellDoorGeometry(frame, leaf);
    expect(geometry.frameBounds.min[0]).toBeCloseTo(-1);
    expect(geometry.frameBounds.min[1]).toBeCloseTo(0);
    expect(geometry.frameBounds.min[2]).toBeCloseTo(-0.2);
    expect(geometry.frameBounds.max[0]).toBeCloseTo(1);
    expect(geometry.frameBounds.max[1]).toBeCloseTo(2.5);
    expect(geometry.frameBounds.max[2]).toBeCloseTo(0.2);
    expect(geometry.opening.min[0]).toBeCloseTo(-0.7);
    expect(geometry.opening.min[1]).toBeCloseTo(0);
    expect(geometry.opening.max[0]).toBeCloseTo(0.7);
    expect(geometry.opening.max[1]).toBeCloseTo(2);
    expect(geometry.leafBounds.min[0]).toBeCloseTo(0);
    expect(geometry.leafBounds.min[1]).toBeCloseTo(0);
    expect(geometry.leafBounds.min[2]).toBeCloseTo(-0.1);
    expect(geometry.leafBounds.max[0]).toBeCloseTo(1.2);
    expect(geometry.leafBounds.max[1]).toBeCloseTo(1.9);
    expect(geometry.leafBounds.max[2]).toBeCloseTo(0.1);
  });

  it('fits the leaf 0.02 under each side post and lintel at every wall height', () => {
    const opening: ShellOpening = { min: [-0.7, 0], max: [0.7, 2] };
    for (const wallHeight of [0.3, 0.8, 2.4]) {
      const scale = shellDoorLeafScale(
        artifact([0, 0, 0], [1.2, 1.9, 0.2]),
        opening,
        wallHeight,
        surround
      );
      expect(scale.every((value) => Number.isFinite(value) && value > 0)).toBe(
        true
      );
      expect(scale[0]).toBeCloseTo((1.4 * 0.5 + 0.04) / 1.2);
      expect(scale[1]).toBeCloseTo((2 * (wallHeight / 2.5) + 0.02) / 1.9);
    }
  });
});
