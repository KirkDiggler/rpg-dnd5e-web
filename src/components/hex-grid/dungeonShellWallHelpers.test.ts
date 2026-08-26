import type { DungeonShellArtifact } from '@/rendering/dungeonShellManifest';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  deriveShellDoorGeometry,
  shellBodyScale,
  shellComponentPivotOffset,
  shellComponentY,
  shellDoorLeafScale,
  shellDoorSurroundScale,
  shellLocalOffsetToWorld,
  shellRawDimensions,
  shellTrimScale,
  shellVisibleWallTop,
  type ShellOpening,
} from './dungeonShellWallHelpers';

const body = artifact([-2, 0, -0.2], [2, 4, 0.2]);
const base = artifact([-1.8, 0, -0.3], [1.8, 0.3, 0.3]);
const cap = artifact([-1.9, 0, -0.2], [1.9, 0.4, 0.2]);
const surround = artifact([-1, 0, -0.3], [1, 2.5, 0.3]);
const profileBody = {
  ...body,
  localSpanAxis: '+X' as const,
  localFaceAxis: 'Z' as const,
  twoSided: true as const,
};

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

  it('fits body and trims from measured bounds', () => {
    expect(shellBodyScale(body, 1, 2.4)).toEqual([0.25, 0.6, 0.75]);
    expect(shellTrimScale(base, 1)).toEqual([1 / 3.6, 0.75, 0.75]);
    expect(shellTrimScale(cap, 1)).toEqual([1 / 3.8, 0.75, 0.75]);
  });

  it.each([
    { effectiveHeight: 2.4, label: 'standard' },
    { effectiveHeight: 4.8, label: 'authored 2x' },
    { effectiveHeight: 0.3, label: 'cutaway' },
  ])(
    'makes the visible profile frame top exact for $label',
    ({ effectiveHeight }) => {
      const visibleWallTop = shellVisibleWallTop(effectiveHeight, cap);
      const frameScale = shellDoorSurroundScale(surround, visibleWallTop);
      const frameTop =
        DUNGEON_SURFACE_Y +
        shellRawDimensions(surround.bounds).height * frameScale[1];
      expect(frameTop).toBeCloseTo(
        DUNGEON_SURFACE_Y +
          effectiveHeight +
          shellRawDimensions(cap.bounds).height * 0.75,
        9
      );
    }
  );

  it('places base/body/surround on the floor and cap at the effective wall top', () => {
    expect(shellComponentY('body', 2.4)).toBe(DUNGEON_SURFACE_Y);
    expect(shellComponentY('base', 2.4)).toBe(DUNGEON_SURFACE_Y);
    expect(shellComponentY('doorSurround', 0.3)).toBe(DUNGEON_SURFACE_Y);
    expect(shellComponentY('cap', 2.4)).toBe(DUNGEON_SURFACE_Y + 2.4);
  });

  it('aligns trim pivots to the body on both facings without changing the local offset', () => {
    const offset = shellComponentPivotOffset(
      profileBody,
      artifact([0, 0, -0.3], [2, 0.3, 0.3]),
      1,
      shellTrimScale(artifact([0, 0, -0.3], [2, 0.3, 0.3]), 1)
    );
    expect(offset).toBeCloseTo(-0.5, 9);
    expect(shellLocalOffsetToWorld({ x: offset, z: 0 }, 0).x).toBeCloseTo(
      offset
    );
    expect(shellLocalOffsetToWorld({ x: offset, z: 0 }, Math.PI).x).toBeCloseTo(
      -offset
    );
  });

  it('rotates local offsets using the same X/Z convention as Three.js Y rotation', () => {
    expect(shellLocalOffsetToWorld({ x: 1, z: 0 }, 0)).toEqual({ x: 1, z: 0 });
    expect(shellLocalOffsetToWorld({ x: 0, z: 1 }, Math.PI / 2)).toMatchObject({
      x: 1,
      z: expect.closeTo(0),
    });
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

  it('derives leaf horizontal and vertical cover from the exact surround frame scale', () => {
    const opening: ShellOpening = { min: [-0.7, 0], max: [0.7, 2] };
    for (const effectiveHeight of [0.3, 0.8, 2.4]) {
      const visibleWallTop = shellVisibleWallTop(effectiveHeight, cap);
      const frameScale = shellDoorSurroundScale(surround, visibleWallTop);
      const scale = shellDoorLeafScale(
        artifact([0, 0, 0], [1.2, 1.9, 0.2]),
        opening,
        frameScale
      );
      expect(scale.every((value) => Number.isFinite(value) && value > 0)).toBe(
        true
      );
      expect(scale[0]).toBeCloseTo((1.4 * frameScale[0] + 0.04) / 1.2);
      expect(scale[1]).toBeCloseTo((2 * frameScale[1] + 0.02) / 1.9);
    }
  });
});
