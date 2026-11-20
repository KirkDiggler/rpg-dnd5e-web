import * as THREE from 'three';

interface Vertex {
  x: number;
  values: number[][];
}
function cut(
  vertices: Vertex[],
  boundary: number,
  keepAbove: boolean
): Vertex[] {
  const out: Vertex[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i],
      b = vertices[(i + 1) % vertices.length];
    const insideA = keepAbove ? a.x >= boundary : a.x <= boundary;
    const insideB = keepAbove ? b.x >= boundary : b.x <= boundary;
    if (insideA) out.push(a);
    if (insideA !== insideB) {
      const t = (boundary - a.x) / (b.x - a.x);
      out.push({
        x: boundary,
        values: a.values.map((values, index) =>
          values.map(
            (value, component) =>
              value + t * (b.values[index][component] - value)
          )
        ),
      });
    }
  }
  return out;
}

/** After fit/height/charts, clip detached static buffers in their marker frame.
 * The full section fit stays unchanged: a partial visible stretch is not a
 * smaller copy of the feature. Source attributes/material groups stay intact;
 * interpolation retains the already projected UV phase at cut boundaries.
 * New buffers join the caller's disposal list, including on partial failure. */
export function clipWallSection(input: {
  root: THREE.Object3D;
  min: number;
  max: number;
  owned: THREE.BufferGeometry[];
}): void {
  const { root, min, max, owned } = input;
  if (root.parent)
    throw Error('Section clipping requires a detached hierarchy.');
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min)
    throw Error('Invalid section clip interval.');
  root.updateMatrixWorld(true);
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const source = mesh.geometry;
    if (
      (mesh as THREE.SkinnedMesh).isSkinnedMesh ||
      Object.values(source.morphAttributes).some(
        (attributes) => attributes?.length
      )
    )
      throw Error('Section clipping requires static geometry.');
    const attributes = Object.entries(source.attributes),
      positionIndex = attributes.findIndex(([name]) => name === 'position');
    if (positionIndex < 0) throw Error('Section clip requires positions.');
    const count = source.index?.count ?? source.getAttribute('position').count;
    const begin = source.drawRange.start,
      end = Math.min(count, begin + source.drawRange.count);
    if (begin % 3 || end % 3)
      throw Error('Section clip requires triangle geometry.');
    const values = attributes.map(() => [] as number[]),
      geometry = new THREE.BufferGeometry();
    owned.push(geometry);
    const vertex = (index: number): Vertex => {
      const row = attributes.map(([, attribute]) =>
        Array.from({ length: attribute.itemSize }, (_, component) =>
          attribute.getComponent(index, component)
        )
      );
      const p = new THREE.Vector3()
        .fromArray(row[positionIndex])
        .applyMatrix4(mesh.matrixWorld);
      return { x: p.x, values: row };
    };
    for (let i = begin; i < end; i += 3) {
      const triangle = [0, 1, 2].map((offset) =>
        vertex(source.index ? source.index.getX(i + offset) : i + offset)
      );
      const polygon = cut(cut(triangle, min, true), max, false);
      if (polygon.length < 3) continue;
      const material =
        source.groups.find(
          (group) => i >= group.start && i < group.start + group.count
        )?.materialIndex ?? 0;
      for (let j = 1; j < polygon.length - 1; j++) {
        const start = values[positionIndex].length / 3;
        for (const point of [polygon[0], polygon[j], polygon[j + 1]])
          point.values.forEach((data, a) => values[a].push(...data));
        const last = geometry.groups.at(-1);
        if (
          last &&
          last.materialIndex === material &&
          last.start + last.count === start
        )
          last.count += 3;
        else geometry.addGroup(start, 3, material);
      }
    }
    attributes.forEach(([name, attribute], index) =>
      geometry.setAttribute(
        name,
        new THREE.Float32BufferAttribute(values[index], attribute.itemSize)
      )
    );
    if (geometry.hasAttribute('normal')) geometry.normalizeNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    mesh.geometry = geometry;
  });
}
