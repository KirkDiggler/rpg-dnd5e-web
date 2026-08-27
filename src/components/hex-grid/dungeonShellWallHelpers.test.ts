import type { DungeonShellArtifact } from '@/rendering/dungeonShellManifest';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  deriveShellDoorGeometry,
  shellBodyScale,
  shellComponentPivotOffset,
  shellComponentY,
  shellDoorLeafFit,
  shellDoorSurroundScale,
  shellLocalOffsetToWorld,
  shellRawDimensions,
  shellTrimScale,
  shellVisibleWallTop,
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

// License-safe boxes transcribed from the reviewed provider geometry report
// (rpg-game-assets#68 tree 46e41c2). Production still measures loaded scenes;
// these literals are an independent fixture for the accepted asymmetric leaf.
const providerSurround = artifact(
  [-0.9993886947631836, 0, -0.3419951796531677],
  [0.9993886947631836, 2.5346500873565674, 0.3419951796531677]
);
const providerCap = artifact(
  [-2.546480178833008, 0, -0.20546433329582214],
  [2.546480178833008, 0.663008451461792, 0.20546433329582214]
);

function providerDoorFixture() {
  const frame = new THREE.Group();
  frame.add(
    boxMesh(
      [-0.9993886947631836, 0, -0.3419951796531677],
      [-0.66627635917071, 2.5346500873565674, 0.3419951796531677]
    ),
    boxMesh(
      [0.6408623012743637, 0, -0.3419951796531677],
      [0.9993886947631836, 2.5346500873565674, 0.3419951796531677]
    ),
    boxMesh(
      [-0.9993886947631836, 2.1852569580078125, -0.3419951796531677],
      [0.9993886947631836, 2.5346500873565674, 0.3419951796531677]
    )
  );
  const leaf = new THREE.Group();
  leaf.add(
    boxMesh(
      [-0.03624606132507324, 0, -0.09246932715177536],
      [1.2874064445495605, 2.455683946609497, 0.09246950596570969]
    )
  );
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

  it.each([
    { wallHeight: 2.4, expectedScaleY: 1.0253274410877296 },
    { wallHeight: 3.6, expectedScaleY: 1.4466292015600781 },
  ])(
    'fits the provider-derived asymmetric leaf over the scaled opening at wallHeight=$wallHeight',
    ({ wallHeight, expectedScaleY }) => {
      const { frame, leaf } = providerDoorFixture();
      const geometry = deriveShellDoorGeometry(frame, leaf);
      const frameScale = shellDoorSurroundScale(
        providerSurround,
        shellVisibleWallTop(wallHeight, providerCap)
      );
      const fit = shellDoorLeafFit(
        { bounds: geometry.leafBounds },
        geometry.opening,
        frameScale,
        -0.5
      );

      // Buffer attributes are float32, so geometry-derived values are pinned
      // to the provider gate's 1e-6 seam tolerance rather than JSON precision.
      expect(fit.scale[0]).toBeCloseTo(0.5242849629197495, 7);
      expect(fit.scale[1]).toBeCloseTo(expectedScaleY, 7);
      expect(fit.scale[2]).toBe(0.75);
      expect(fit.localTranslation[0]).toBeCloseTo(0.16566031165076522, 7);
      expect(fit.localTranslation[1]).toBeCloseTo(0, 7);
      expect(fit.localTranslation[2]).toBe(0);

      // Independent readback of the geometry after scale + child translation.
      const openingLeft = geometry.opening.min[0] * frameScale[0];
      const openingRight = geometry.opening.max[0] * frameScale[0];
      const openingTop = geometry.opening.max[1] * frameScale[1];
      const leafLeft =
        -0.5 +
        fit.localTranslation[0] +
        geometry.leafBounds.min[0] * fit.scale[0];
      const leafRight =
        -0.5 +
        fit.localTranslation[0] +
        geometry.leafBounds.max[0] * fit.scale[0];
      const leafBottom = fit.localTranslation[1];
      const leafTop =
        fit.localTranslation[1] +
        (geometry.leafBounds.max[1] - geometry.leafBounds.min[1]) *
          fit.scale[1];
      expect(openingLeft - leafLeft).toBeGreaterThanOrEqual(0.02);
      expect(leafRight - openingRight).toBeGreaterThanOrEqual(0.02);
      expect(leafTop - openingTop).toBeGreaterThanOrEqual(0.02);
      expect(openingLeft - leafLeft).toBeCloseTo(0.020001, 7);
      expect(leafRight - openingRight).toBeCloseTo(0.020001, 7);
      expect(leafTop - openingTop).toBeCloseTo(0.020001, 7);
      expect(leafBottom).toBe(0);
    }
  );

  it('kills the scale-only mutation because an unchanged gapStart root leaves the provider opening uncovered on the right', () => {
    const { frame, leaf } = providerDoorFixture();
    const geometry = deriveShellDoorGeometry(frame, leaf);
    const frameScale = shellDoorSurroundScale(
      providerSurround,
      shellVisibleWallTop(2.4, providerCap)
    );
    const fit = shellDoorLeafFit(
      { bounds: geometry.leafBounds },
      geometry.opening,
      frameScale,
      -0.5
    );

    const scaleOnlyLeafRight = -0.5 + geometry.leafBounds.max[0] * fit.scale[0];
    const openingRight = geometry.opening.max[0] * frameScale[0];
    expect(scaleOnlyLeafRight - openingRight).toBeCloseTo(
      -0.14565931165076512,
      7
    );
    expect(scaleOnlyLeafRight - openingRight).toBeLessThan(0.02);
  });
});
