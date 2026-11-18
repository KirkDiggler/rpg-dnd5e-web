import * as THREE from 'three';
import { SYNTY_SCALE } from './calibrationConstants';
import type { PlainWallProfile } from './plainWallFit';

export interface WallOpeningDescriptor {
  openingId: string;
  frameNode: string;
  widthMeters: number;
  frameWidthMeters: number;
  frameHeightMeters: number;
  wallDepthMeters: number;
  leftExtentMeters: number;
}

/** The provider proves aperture clearance; this consumer checks the loaded
 * anchors against those exact measured metrics. It never derives an opening
 * from a whole-assembly box or moves a hinge. Run on a detached instance. */
export function fitWallOpeningInstance(
  root: THREE.Object3D,
  descriptor: WallOpeningDescriptor
): {
  profile: PlainWallProfile;
  owned: THREE.BufferGeometry[];
} {
  root.updateMatrixWorld(true);
  const named = (name: string): THREE.Object3D => {
    const matches: THREE.Object3D[] = [];
    root.traverse((node) => {
      if (node.name === name) matches.push(node);
    });
    if (matches.length !== 1)
      throw new Error(`Doorway fit requires one ${name}.`);
    return matches[0]!;
  };
  const point = (name: string): THREE.Vector3 => {
    const node = named(name);
    if ((node as THREE.Mesh).isMesh)
      throw new Error('Doorway anchors must be geometry-free.');
    return node.getWorldPosition(new THREE.Vector3());
  };
  const body = named(descriptor.frameNode);
  const bounds = new THREE.Box3().setFromObject(body, true);
  const origin = point(`Opening_v1_${descriptor.openingId}`);
  const left = point(`OpeningPoint_${descriptor.openingId}_00`);
  const right = point(`OpeningPoint_${descriptor.openingId}_01`);
  const front = point('WallFit_v1_Front'),
    back = point('WallFit_v1_Back');
  const width = bounds.max.x - bounds.min.x,
    height = bounds.max.y - bounds.min.y,
    depth = front.z - back.z;
  const actual = [
    right.x - left.x,
    width,
    height,
    depth,
    origin.x - bounds.min.x,
  ].map((v) => v * SYNTY_SCALE);
  const expected = [
    descriptor.widthMeters,
    descriptor.frameWidthMeters,
    descriptor.frameHeightMeters,
    descriptor.wallDepthMeters,
    descriptor.leftExtentMeters,
  ];
  if (
    actual.some(
      (v, i) =>
        !Number.isFinite(v) ||
        v <= 0 ||
        !Number.isFinite(expected[i]) ||
        Math.abs(v - expected[i]!) > 1e-4
    )
  )
    throw new Error(
      'Doorway loaded geometry disagrees with provider fit metrics.'
    );
  const owned: THREE.BufferGeometry[] = [];
  body.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry = mesh.geometry.clone();
    owned.push(mesh.geometry);
  });
  return {
    profile: {
      body,
      start: bounds.min.x,
      end: bounds.max.x,
      centerX: origin.x,
      centerZ: (front.z + back.z) / 2,
      baseY: bounds.min.y,
      width,
      height,
      depth,
    },
    owned,
  };
}
