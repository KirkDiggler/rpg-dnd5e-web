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
    expect(shellTrimScale(base, 1)).toEqual([0.2777777777777778, 0.75, 0.75]);
    expect(shellTrimScale(cap, 1)).toEqual([0.2631578947368421, 0.75, 0.75]);
  });

  it.each([
    {
      effectiveHeight: 2.4,
      expectedScale: [0.5, 1.08, 0.75] as const,
      expectedTop: 2.9,
      label: 'standard',
    },
    {
      effectiveHeight: 4.8,
      expectedScale: [0.5, 2.04, 0.75] as const,
      expectedTop: 5.3,
      label: 'authored 2x',
    },
    {
      effectiveHeight: 0.3,
      expectedScale: [0.5, 0.24, 0.75] as const,
      expectedTop: 0.8,
      label: 'cutaway',
    },
  ])(
    'makes the visible profile frame top exact for $label',
    ({ effectiveHeight, expectedScale, expectedTop }) => {
      const frameScale = shellDoorSurroundScale(
        surround,
        effectiveHeight + 0.4 * 0.75
      );
      expect(frameScale[0]).toBeCloseTo(expectedScale[0], 12);
      expect(frameScale[1]).toBeCloseTo(expectedScale[1], 12);
      expect(frameScale[2]).toBeCloseTo(expectedScale[2], 12);
      expect(DUNGEON_SURFACE_Y + 2.5 * frameScale[1]).toBeCloseTo(
        expectedTop,
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
      [0.5, 0.75, 0.75]
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

  it('derives leaf horizontal and vertical cover from independent frame literals', () => {
    const opening: ShellOpening = { min: [-0.7, 0], max: [0.7, 2] };
    const expected = [
      [0.6166666666666667, 1.1473684210526316, 0.75],
      [0.6166666666666667, 2.1578947368421053, 0.75],
      [0.6166666666666667, 0.2631578947368421, 0.75],
    ] as const;
    for (const [index, frameY] of [1.08, 2.04, 0.24].entries()) {
      const scale = shellDoorLeafScale(
        artifact([0, 0, 0], [1.2, 1.9, 0.2]),
        opening,
        [0.5, frameY, 0.75]
      );
      expect(scale[0]).toBeCloseTo(expected[index]![0], 12);
      expect(scale[1]).toBeCloseTo(expected[index]![1], 12);
      expect(scale[2]).toBeCloseTo(expected[index]![2], 12);
    }
  });
});
