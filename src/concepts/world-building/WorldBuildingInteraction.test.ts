import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { dropTargetFromIntersections } from './worldBuildingPointer';

function hit(
  object: THREE.Object3D,
  point: THREE.Vector3,
  normal = new THREE.Vector3(0, 1, 0),
  distance = 1
): THREE.Intersection {
  return {
    distance,
    point,
    object,
    face: {
      a: 0,
      b: 1,
      c: 2,
      normal,
      materialIndex: 0,
    },
  };
}

function surfaces() {
  const root = new THREE.Group();
  const support = new THREE.Group();
  support.userData.worldBuildingSupportId = 'table';
  const realMesh = new THREE.Mesh(new THREE.BoxGeometry());
  support.add(realMesh);
  const loadingFallback = new THREE.Mesh(new THREE.BoxGeometry());
  loadingFallback.name = 'world-building-model-loading';
  const selection = new THREE.Mesh(new THREE.BoxGeometry());
  selection.name = 'world-building-selection-table';
  const ground = new THREE.Mesh(new THREE.CircleGeometry());
  ground.userData.worldBuildingGround = true;
  root.add(support, loadingFallback, selection, ground);
  root.updateMatrixWorld(true);
  return { realMesh, loadingFallback, selection, ground };
}

describe('world-building drag target raycast policy', () => {
  it('places a prop on an upward real loaded support face with exact surface Y', () => {
    const { realMesh, ground } = surfaces();
    const target = dropTargetFromIntersections(
      { kind: 'prop', id: 'dnd5e:props:candles' },
      [
        hit(realMesh, new THREE.Vector3(1.2, 1.1685, -0.4)),
        hit(ground, new THREE.Vector3(1.2, 0.2, -0.4), undefined, 2),
      ],
      0.2
    );

    expect(target).toMatchObject({
      kind: 'surface',
      supportId: 'table',
      point: { x: 1.2, z: -0.4 },
    });
    expect(target?.kind === 'surface' ? target.point.y : -1).toBeCloseTo(
      0.9685
    );
  });

  it('ignores fallback/selection meshes and rejects a downward support face', () => {
    const { realMesh, loadingFallback, selection, ground } = surfaces();
    const target = dropTargetFromIntersections(
      { kind: 'prop', id: 'dnd5e:props:books' },
      [
        hit(loadingFallback, new THREE.Vector3(0, 4, 0)),
        hit(selection, new THREE.Vector3(0, 3, 0)),
        hit(realMesh, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0)),
        hit(ground, new THREE.Vector3(0.25, 0.2, -0.5), undefined, 4),
      ],
      0.2
    );

    expect(target).toEqual({
      kind: 'ground',
      point: { x: 0.25, z: -0.5 },
    });
  });

  it('stamps arrangements on ground and never invents a tabletop anchor', () => {
    const { realMesh, ground } = surfaces();
    const target = dropTargetFromIntersections(
      { kind: 'arrangement', id: 'arrangement-1' },
      [
        hit(realMesh, new THREE.Vector3(2, 1, 3)),
        hit(ground, new THREE.Vector3(2, 0.2, 3), undefined, 2),
      ],
      0.2
    );

    expect(target).toEqual({
      kind: 'ground',
      point: { x: 2, z: 3 },
    });
  });

  it('returns no target when the ray misses the finite ground and eligible support', () => {
    const { loadingFallback, selection } = surfaces();
    expect(
      dropTargetFromIntersections(
        { kind: 'prop', id: 'dnd5e:props:books' },
        [
          hit(loadingFallback, new THREE.Vector3()),
          hit(selection, new THREE.Vector3()),
        ],
        0.2
      )
    ).toBeNull();
  });
});
