import type { Material, Mesh, Object3D } from 'three';
import type { AttackDieRuntimeSidecar } from './attackDieContract';
import { normalizeSelectorName } from './attackDieContract';
export interface ResolvedAttackDiePrimitives {
  node: Object3D;
  body: Mesh;
  numeral: Mesh;
}
const materials = (mesh: Mesh): Material[] =>
  Array.isArray(mesh.material) ? mesh.material : [mesh.material];
export function resolveAttackDiePrimitives(
  scene: Object3D,
  selectors: AttackDieRuntimeSidecar['selectors']
): ResolvedAttackDiePrimitives {
  const nodes: Object3D[] = [];
  scene.traverse((object) => {
    if (object.name === selectors.node) nodes.push(object);
  });
  if (nodes.length !== 1) throw Error('attack die node selector ambiguous');
  const directMeshes = nodes[0].children.filter(
    (object): object is Mesh => (object as Mesh).isMesh === true
  );
  const descendants: Mesh[] = [];
  nodes[0].children.forEach((child) =>
    child.traverse((object) => {
      if (object !== child && (object as Mesh).isMesh)
        descendants.push(object as Mesh);
    })
  );
  if (descendants.length)
    throw Error('attack die primitives must be direct siblings');
  const byRole = (selector: { mesh: string; material: string }) =>
    directMeshes.filter((mesh) => {
      const originalName = String(
        mesh.userData?.attackDieSourceName ?? mesh.name
      );
      return (
        originalName === selector.mesh &&
        normalizeSelectorName(originalName).replace(/_\d+$/, '') ===
          selectors.sourceMesh &&
        materials(mesh).length === 1 &&
        normalizeSelectorName(materials(mesh)[0].name) === selector.material
      );
    });
  const body = byRole(selectors.bodyPrimitive);
  const numeral = byRole(selectors.numeralPrimitive);
  if (
    directMeshes.length !== 2 ||
    body.length !== 1 ||
    numeral.length !== 1 ||
    body[0] === numeral[0]
  )
    throw Error('attack die primitive selectors ambiguous');
  return { node: nodes[0], body: body[0], numeral: numeral[0] };
}
