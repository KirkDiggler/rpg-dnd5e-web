import type { GeneratedWorldAsset } from '@/generated/worldAssetCatalog';
import * as THREE from 'three';
import type { PlainWallFit, PlainWallProfile } from './plainWallFit';
import { resolveWorldSurfaceTargets } from './worldSurfaceMaterials';

export interface WallSurfaceChart {
  surfaceId: string;
  /** Boundary distance at the SOURCE wall's distance zero, in scene units. */
  phase: number;
  direction: 1 | -1;
  repeat: readonly [number, number];
  elevation: number;
}
/** Only the fitter's owned buffers may be rewritten. Caps and inactive charts
 * remain authored. U follows the room boundary; V decreases with height, matching
 * the no-tangent glTF derivative normal adapter (logical Y-up => scale.y=-1). */
export function applyWallSurfaceCharts(input: {
  root: THREE.Object3D;
  assetRef: string;
  bindings: NonNullable<GeneratedWorldAsset['surfaces']>;
  charts: readonly WallSurfaceChart[];
  fit: PlainWallFit;
  profile: PlainWallProfile;
  owned: readonly THREE.BufferGeometry[];
}): void {
  const { root, assetRef, bindings, charts, fit, profile, owned } = input;
  root.updateMatrixWorld(true);
  for (const chart of charts) {
    const binding = bindings.find((row) => row.id === chart.surfaceId);
    if (
      !binding ||
      ![chart.phase, chart.elevation, ...chart.repeat].every(Number.isFinite) ||
      chart.repeat.some((n) => n <= 0) ||
      ![1, -1].includes(chart.direction)
    )
      throw new Error('Wall surface chart has invalid binding or dimensions.');
    for (const { mesh, source } of resolveWorldSurfaceTargets(
      root,
      binding,
      assetRef
    )) {
      if (!owned.includes(mesh.geometry))
        throw new Error(
          'Wall surface chart requires fitted instance-owned geometry.'
        );
      if (Array.isArray(mesh.material))
        throw new Error(
          'Wall surface chart requires separate exported material primitives.'
        );
      const channel = source.normalMap?.channel;
      if (channel === undefined || channel !== source.map?.channel)
        throw new Error('Wall surface chart requires paired UV channels.');
      const uv = mesh.geometry.getAttribute(
        channel === 0 ? 'uv' : `uv${channel}`
      );
      const position = mesh.geometry.getAttribute('position');
      if (!uv || uv.count !== position.count)
        throw new Error('Wall surface chart is missing UV coordinates.');
      for (let i = 0; i < position.count; i++) {
        const p = new THREE.Vector3()
          .fromBufferAttribute(position, i)
          .applyMatrix4(mesh.matrixWorld);
        const along =
          (fit.offset ?? 0) +
          ((p.x - profile.start) * fit.width) / profile.width;
        const height =
          chart.elevation +
          ((p.y - profile.baseY) * fit.height) / profile.height;
        uv.setXY(
          i,
          (chart.phase + chart.direction * along) / chart.repeat[0],
          -height / chart.repeat[1]
        );
      }
      uv.needsUpdate = true;
      mesh.geometry.deleteAttribute('tangent');
    }
  }
}
