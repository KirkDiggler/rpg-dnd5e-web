import * as THREE from 'three';
import { SYNTY_SCALE } from './calibrationConstants';

export interface PlainWallFit {
  width: number;
  height: number;
  depth: number;
  /** Derived distance from the owning wall's start; not authored room phase. */
  offset?: number;
  start?: number;
  end?: number;
}
export interface PlainWallProfile {
  start: number;
  end: number;
  centerX: number;
  centerZ: number;
  baseY: number;
  width: number;
  height: number;
  depth: number;
  body: THREE.Object3D;
}
function materialUvNames(material: THREE.Material): string[] {
  const m = material as THREE.MeshStandardMaterial;
  const maps = [
    m.map,
    m.normalMap,
    m.roughnessMap,
    m.metalnessMap,
    m.aoMap,
    m.emissiveMap,
    m.alphaMap,
  ].filter((map): map is THREE.Texture => !!map);
  const channels = maps.length
    ? [...new Set(maps.map((map) => map.channel))]
    : [0];
  return channels.map((channel) => {
    if (!Number.isInteger(channel) || channel < 0 || channel > 3)
      throw new Error('Unsupported wall material UV channel.');
    return channel === 0 ? 'uv' : `uv${channel}`;
  });
}
function named(root: THREE.Object3D, name: string): THREE.Object3D {
  const found: THREE.Object3D[] = [];
  root.traverse((node) => {
    if (node.name === name) found.push(node);
  });
  if (found.length !== 1) throw new Error(`Wall fit requires one ${name}.`);
  return found[0]!;
}
/** On a detached instance, before model placement/shared scaling. Never center
 * or ground helpers by bounds: transformed marker positions own the fit. */
export function inspectPlainWall(root: THREE.Object3D): PlainWallProfile {
  root.updateMatrixWorld(true);
  const body = named(root, 'WallBody_v1');
  const marker = (name: string): THREE.Vector3 => {
    const node = named(root, `WallFit_v1_${name}`);
    if ((node as THREE.Mesh).isMesh || node.children.length)
      throw new Error('Wall fit markers must be geometry-free leaves.');
    return node.getWorldPosition(new THREE.Vector3());
  };
  const start = marker('Start'),
    end = marker('End'),
    front = marker('Front'),
    back = marker('Back'),
    top = marker('Top');
  const width = end.x - start.x,
    height = top.y - start.y,
    depth = front.z - back.z;
  if (
    ![
      ...start.toArray(),
      ...end.toArray(),
      ...front.toArray(),
      ...back.toArray(),
      ...top.toArray(),
      width,
      height,
      depth,
    ].every(Number.isFinite) ||
    Math.min(width, height, depth) <= 0
  )
    throw new Error('Wall fit planes must have finite ordered dimensions.');
  const meshes = new Set<THREE.Object3D>();
  body.traverse((n) => {
    if ((n as THREE.Mesh).isMesh) meshes.add(n);
  });
  if (!meshes.size)
    throw new Error('Wall fit body has no material primitives.');
  root.traverse((n) => {
    if ((n as THREE.Mesh).isMesh && !meshes.has(n))
      throw new Error('Wall fit has geometry outside the enrolled body.');
  });
  return {
    start: start.x,
    end: end.x,
    centerX: (start.x + end.x) / 2,
    centerZ: (front.z + back.z) / 2,
    baseY: start.y,
    width,
    height,
    depth,
    body,
  };
}

/** Mutates only detached instance-owned buffer clones. Returned buffers belong
 * to the caller and must be disposed; original geometry/materials/textures stay
 * cached. Each application starts from the source instance, never a prior fit. */
export function fitPlainWallInstance(
  root: THREE.Object3D,
  fit: PlainWallFit
): { profile: PlainWallProfile; owned: THREE.BufferGeometry[] } {
  if (
    ![fit.width, fit.height, fit.depth].every(
      (v) => Number.isFinite(v) && v > 0
    ) ||
    [fit.start, fit.end, fit.offset].some(
      (v) => v !== undefined && !Number.isFinite(v)
    )
  )
    throw new Error('Invalid plain wall fit dimensions.');
  const profile = inspectPlainWall(root),
    owned: THREE.BufferGeometry[] = [];
  if (
    (fit.start !== undefined || fit.end !== undefined) &&
    fit.width <= fit.depth
  )
    throw new Error(
      'Mitered terminal piece must be longer than its thickness.'
    );
  const ratio = fit.depth / profile.depth / (fit.width / profile.width);
  try {
    profile.body.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (
        (mesh as THREE.SkinnedMesh).isSkinnedMesh ||
        mesh.geometry.morphAttributes.position?.length
      )
        throw new Error('Plain wall fit does not deform moving geometry.');
      const geometry = mesh.geometry.clone();
      owned.push(geometry);
      const pos = geometry.getAttribute('position');
      if (!pos) throw new Error('Plain wall fit requires position attributes.');
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      const channels = materials.map(materialUvNames);
      const uvs = new Map(
        [...new Set(channels.flat())].map((name) => {
          const uv = geometry.getAttribute(name);
          if (!uv)
            throw new Error(
              `Wall material requires missing ${name} coordinates.`
            );
          return [name, uv] as const;
        })
      );
      if (!geometry.index)
        geometry.setIndex(Array.from({ length: pos.count }, (_, i) => i));
      const points = Array.from({ length: pos.count }, (_, i) =>
        new THREE.Vector3()
          .fromBufferAttribute(pos, i)
          .applyMatrix4(mesh.matrixWorld)
      );
      const gradients = new Map(
        [...uvs.keys()].map(
          (name) =>
            [
              name,
              new Map<
                number,
                { ux: number; vx: number; uy: number; vy: number }
              >(),
            ] as const
        )
      );
      const index = geometry.index!;
      for (let t = 0; t < index.count; t += 3) {
        const ids = [
          index.getX(t),
          index.getX(t + 1),
          index.getX(t + 2),
        ] as const;
        const [a, b, c] = ids.map((i) => points[i]!) as [
          THREE.Vector3,
          THREE.Vector3,
          THREE.Vector3,
        ];
        const ab = b.clone().sub(a),
          ac = c.clone().sub(a),
          normal = ab.clone().cross(ac);
        // Only masonry side charts vary along X/Y. Caps (including top) keep
        // their authored UVs/materials, even when the end plane becomes diagonal.
        if (
          Math.abs(normal.z) <= Math.max(Math.abs(normal.x), Math.abs(normal.y))
        )
          continue;
        const det = ab.x * ac.y - ac.x * ab.y;
        if (det === 0) continue;
        const group = geometry.groups.find(
          (entry) => t >= entry.start && t < entry.start + entry.count
        );
        const materialIndex = Array.isArray(mesh.material)
          ? (group?.materialIndex ?? (materials.length === 1 ? 0 : undefined))
          : 0;
        if (materialIndex === undefined || !channels[materialIndex])
          throw new Error('Wall primitive has no declared material group.');
        for (const name of channels[materialIndex]) {
          const uv = uvs.get(name)!;
          const du1 = uv.getX(ids[1]) - uv.getX(ids[0]),
            du2 = uv.getX(ids[2]) - uv.getX(ids[0]);
          const dv1 = uv.getY(ids[1]) - uv.getY(ids[0]),
            dv2 = uv.getY(ids[2]) - uv.getY(ids[0]);
          const gradient = {
            ux: (du1 * ac.y - du2 * ab.y) / det,
            vx: (dv1 * ac.y - dv2 * ab.y) / det,
            uy: (du2 * ab.x - du1 * ac.x) / det,
            vy: (dv2 * ab.x - dv1 * ac.x) / det,
          };
          for (const i of ids) gradients.get(name)!.set(i, gradient);
        }
      }
      const inverse = mesh.matrixWorld.clone().invert();
      for (let i = 0; i < pos.count; i++) {
        const original = points[i]!;
        const atStart =
          Math.abs(original.x - profile.start) <
          Math.abs(original.x - profile.end);
        const slope = atStart ? fit.start : fit.end;
        const fittedX =
          slope === undefined
            ? original.x
            : (atStart ? profile.start : profile.end) +
              slope * ratio * (original.z - profile.centerZ);
        if (slope !== undefined) {
          const changed = original.clone();
          changed.x = fittedX;
          changed.applyMatrix4(inverse);
          pos.setXYZ(i, changed.x, changed.y, changed.z);
        }
        // Preserve physical texel density and phase along this wall, including
        // across repeated pieces/openings. This is not room-loop phase mapping.
        const dx =
          ((fittedX - profile.start) * fit.width) /
            (profile.width * SYNTY_SCALE) +
          (fit.offset ?? 0) / SYNTY_SCALE -
          (original.x - profile.start);
        const dy =
          (original.y - profile.baseY) *
          (fit.height / (profile.height * SYNTY_SCALE) - 1);
        for (const [name, uv] of uvs) {
          const gradient = gradients.get(name)!.get(i);
          if (gradient)
            uv.setXY(
              i,
              uv.getX(i) + gradient.ux * dx + gradient.uy * dy,
              uv.getY(i) + gradient.vx * dx + gradient.vy * dy
            );
        }
      }
      pos.needsUpdate = true;
      for (const uv of uvs.values()) uv.needsUpdate = true;
      geometry.computeVertexNormals();
      // Three's stock derivative path uses vNormalMapUv (the material's actual
      // channel). computeTangents() is hardwired to UV0 and would install an
      // incorrect basis for the released masonry's TEXCOORD_2, especially with
      // mixed-channel material groups. Do not carry stale source tangents.
      geometry.deleteAttribute('tangent');
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      mesh.geometry = geometry;
    });
    return { profile, owned };
  } catch (error) {
    for (const geometry of owned) geometry.dispose();
    throw error;
  }
}
