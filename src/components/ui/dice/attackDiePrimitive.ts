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
  const candidates: Mesh[] = [];
  nodes[0].traverse((object) => {
    const mesh = object as Mesh;
    if (
      mesh.isMesh &&
      normalizeSelectorName(mesh.name).startsWith(selectors.sourceMesh)
    )
      candidates.push(mesh);
  });
  const role = (materialName: string) =>
    candidates.filter((mesh) =>
      materials(mesh).some(
        (material) => normalizeSelectorName(material.name) === materialName
      )
    );
  const body = role(selectors.bodyPrimitive.material);
  const numeral = role(selectors.numeralPrimitive.material);
  if (
    candidates.length !== 2 ||
    body.length !== 1 ||
    numeral.length !== 1 ||
    body[0] === numeral[0] ||
    materials(body[0]).length !== 1 ||
    materials(numeral[0]).length !== 1
  )
    throw Error('attack die primitive selectors ambiguous');
  return { node: nodes[0], body: body[0], numeral: numeral[0] };
}
