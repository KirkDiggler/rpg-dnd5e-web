import type { GeneratedWorldAsset } from '@/generated/worldAssetCatalog';
import * as THREE from 'three';
import { resolveWorldSurfaceTargets } from './worldSurfaceMaterials';

type Binding = NonNullable<GeneratedWorldAsset['surfaces']>[number];
interface OriginalTargetUvs {
  channel: string;
  y: Float64Array;
  uv: Float64Array;
  /** Area-weighted local chart derivative; UV seams already own separate vertices. */
  derivative: Float64Array;
}
export interface OriginalHeightUvs {
  binding: Binding;
  targets: OriginalTargetUvs[];
}

/** Read the actual authored chart of explicitly enrolled moving masonry parts,
 * before height assembly. No material/name heuristic, replacement material or
 * assumed repeat size: Original retains each source chart and its own density. */
export function captureOriginalHeightUvs(input: {
  root: THREE.Object3D;
  assetRef: string;
  bindings: readonly Binding[];
}): OriginalHeightUvs[] {
  const { root, assetRef, bindings } = input;
  root.updateMatrixWorld(true);
  return bindings.map((binding) => ({
    binding,
    targets: resolveWorldSurfaceTargets(root, binding, assetRef).map(
      ({ mesh, source }) => {
        if (Array.isArray(mesh.material))
          throw Error(
            'Original height chart requires separate exported material primitives.'
          );
        const channel = source.normalMap?.channel;
        if (channel === undefined || channel !== source.map?.channel)
          throw Error('Original height chart requires paired UV channels.');
        const name = channel === 0 ? 'uv' : `uv${channel}`;
        const position = mesh.geometry.getAttribute('position'),
          uv = mesh.geometry.getAttribute(name);
        if (!position || !uv || uv.count !== position.count)
          throw Error('Original height chart is missing UV coordinates.');
        const points = Array.from({ length: position.count }, (_, i) =>
          new THREE.Vector3()
            .fromBufferAttribute(position, i)
            .applyMatrix4(mesh.matrixWorld)
        );
        const derivative = new Float64Array(position.count * 2),
          weights = new Float64Array(position.count);
        const indices = mesh.geometry.index;
        const count = indices?.count ?? position.count;
        if (count % 3) throw Error('Original height chart requires triangles.');
        for (let t = 0; t < count; t += 3) {
          const ids = [0, 1, 2].map((offset) =>
            indices ? indices.getX(t + offset) : t + offset
          );
          const [a, b, c] = ids.map((id) => points[id]);
          const abx = b.x - a.x,
            aby = b.y - a.y,
            acx = c.x - a.x,
            acy = c.y - a.y;
          const determinant = abx * acy - acx * aby;
          if (determinant === 0) continue;
          const du =
            ((uv.getX(ids[2]) - uv.getX(ids[0])) * abx -
              (uv.getX(ids[1]) - uv.getX(ids[0])) * acx) /
            determinant;
          const dv =
            ((uv.getY(ids[2]) - uv.getY(ids[0])) * abx -
              (uv.getY(ids[1]) - uv.getY(ids[0])) * acx) /
            determinant;
          if (!Number.isFinite(du) || !Number.isFinite(dv))
            throw Error('Original height chart has invalid derivatives.');
          const weight = Math.abs(determinant);
          for (const id of ids) {
            derivative[id * 2] += du * weight;
            derivative[id * 2 + 1] += dv * weight;
            weights[id] += weight;
          }
        }
        for (let i = 0; i < position.count; i++)
          if (weights[i] > 0) {
            derivative[i * 2] /= weights[i];
            derivative[i * 2 + 1] /= weights[i];
          }
        return {
          channel: name,
          y: Float64Array.from(points.map((point) => point.y)),
          uv: Float64Array.from(
            points.flatMap((_, i) => [uv.getX(i), uv.getY(i)])
          ),
          derivative,
        };
      }
    ),
  }));
}

/** Extend those charts over actual moved/scaled rows and the translated cap.
 * Unbound trim/atlas channels are untouched. Cached buffers are never written;
 * repeated pieces use the same captured source rather than an already shifted row. */
export function applyOriginalHeightUvs(input: {
  root: THREE.Object3D;
  assetRef: string;
  captured: readonly OriginalHeightUvs[];
  nodeCopies: ReadonlyMap<string, readonly string[]>;
  owned: readonly THREE.BufferGeometry[];
}): void {
  const { root, assetRef, captured, nodeCopies, owned } = input;
  root.updateMatrixWorld(true);
  for (const record of captured)
    for (const node of [
      record.binding.node,
      ...(nodeCopies.get(record.binding.node) ?? []),
    ]) {
      const targets = resolveWorldSurfaceTargets(
        root,
        { ...record.binding, node },
        assetRef
      );
      if (targets.length !== record.targets.length)
        throw Error('Original height chart target shape changed.');
      targets.forEach(({ mesh }, index) => {
        const source = record.targets[index],
          position = mesh.geometry.getAttribute('position'),
          uv = mesh.geometry.getAttribute(source.channel);
        if (
          !position ||
          !uv ||
          position.count !== source.y.length ||
          uv.count !== source.y.length
        )
          throw Error('Original height chart vertex shape changed.');
        const deltas = Array.from(
          { length: position.count },
          (_, i) =>
            new THREE.Vector3()
              .fromBufferAttribute(position, i)
              .applyMatrix4(mesh.matrixWorld).y - source.y[i]
        );
        if (deltas.every((delta) => Math.abs(delta) <= 1e-10)) return;
        if (!owned.includes(mesh.geometry))
          throw Error(
            'Original height chart requires instance-owned geometry.'
          );
        for (let i = 0; i < position.count; i++)
          uv.setXY(
            i,
            source.uv[i * 2] + source.derivative[i * 2] * deltas[i],
            source.uv[i * 2 + 1] + source.derivative[i * 2 + 1] * deltas[i]
          );
        uv.needsUpdate = true;
        mesh.geometry.deleteAttribute('tangent');
      });
    }
}
