import * as THREE from 'three';
import { vi } from 'vitest';
import {
  createRegionLightingFieldTextures,
  type RegionLightingMaterialBinding,
} from './regionLightingMaterials';
import { buildSpatialBackgroundField } from './spatialBackgroundField';
/** Synthetic test resources only; callers dispose textures. */
export function createTestLightingBinding(): RegionLightingMaterialBinding & {
  dispose(): void;
} {
  const textures = createRegionLightingFieldTextures(
    buildSpatialBackgroundField([
      {
        id: 'test',
        background: 0.15,
        ring: [
          { x: -4, z: -4 },
          { x: 4, z: -4 },
          { x: 4, z: 4 },
          { x: -4, z: 4 },
        ],
      },
    ]),
    4096
  );
  return {
    uniforms: {
      rlTriangles: { value: textures.triangles },
      rlHeads: { value: textures.heads },
      rlCandidates: { value: textures.candidates },
      rlBounds: { value: new THREE.Vector4(-4, 4, -4, 4) },
      rlGridSize: { value: 64 },
      rlPointPositions: {
        value: Array.from({ length: 12 }, () => new THREE.Vector4()),
      },
      rlPointColors: {
        value: Array.from({ length: 12 }, () => new THREE.Vector3()),
      },
      rlPointCount: { value: 0 },
    },
    reportDiagnostic: vi.fn(),
    dispose: textures.dispose,
  };
}
