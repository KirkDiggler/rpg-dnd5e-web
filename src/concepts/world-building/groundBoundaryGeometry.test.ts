import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createGroundBoundaryGeometry } from './groundBoundaryGeometry';
import { ROOM_WORKSPACE_STEPS } from './roomDraft';
import { createWorkspaceFloorGeometry } from './workspaceFloorGeometry';

function transformedPerimeter(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute('position');
  return Array.from({ length: 6 }, (_, index) => ({
    x: position.getX(index + 1),
    z: -position.getY(index + 1),
  }));
}

function outlinePerimeter(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute('position');
  return Array.from({ length: position.count }, (_, index) => ({
    x: position.getX(index),
    z: position.getZ(index),
  }));
}

function expectSamePerimeter(
  actual: readonly { x: number; z: number }[],
  expected: readonly { x: number; z: number }[]
) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((point, index) => {
    expect(point.x).toBeCloseTo(expected[index]!.x);
    expect(point.z).toBeCloseTo(expected[index]!.z);
  });
}

describe('ground boundary geometry', () => {
  it.each(ROOM_WORKSPACE_STEPS)(
    'matches the transformed finite ground and underlay perimeter at room radius $hexRadius',
    (workspace) => {
      const radius = workspace.horizontalLimit + 1;
      const finiteGround = new THREE.CircleGeometry(radius, 6);
      const underlay = createWorkspaceFloorGeometry(radius, 6);
      const outline = createGroundBoundaryGeometry(radius, true);

      const expected = transformedPerimeter(finiteGround);
      expectSamePerimeter(transformedPerimeter(underlay), expected);
      expectSamePerimeter(outlinePerimeter(outline), expected);

      finiteGround.dispose();
      underlay.dispose();
      outline.dispose();
    }
  );

  it('retains the standalone composer outline phase', () => {
    const radius = 11.5;
    const outline = createGroundBoundaryGeometry(radius, false);
    const expected = Array.from({ length: 6 }, (_, index) => {
      const angle = Math.PI / 6 + (index * Math.PI) / 3;
      return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
    });

    expectSamePerimeter(outlinePerimeter(outline), expected);
    outline.dispose();
  });
});
