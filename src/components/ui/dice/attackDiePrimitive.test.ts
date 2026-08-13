import { BufferGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { validSidecar } from './attackDieContract.test';
import { resolveAttackDiePrimitives } from './attackDiePrimitive';

const sceneFixture = () => {
  const scene = new Group();
  const node = new Group();
  node.name = 'Node';
  scene.add(node);
  const body = new Mesh(new BufferGeometry(), new MeshStandardMaterial());
  body.name = 'SourceMesh_primitive_0';
  body.material.name = 'Body.010';
  const numeral = new Mesh(new BufferGeometry(), new MeshStandardMaterial());
  numeral.name = 'SourceMesh_primitive_1';
  numeral.material.name = 'Numbers.010';
  node.add(body, numeral);
  return { scene, body, numeral };
};
describe('parsed primitive selectors', () => {
  it('resolves two sibling primitive meshes by source mesh identity and role material', () => {
    const { scene, body, numeral } = sceneFixture();
    const selectors = {
      ...validSidecar().selectors,
      node: 'Node',
      sourceMesh: 'SourceMesh_primitive',
      bodyPrimitive: { mesh: 'SourceMesh_primitive_0', material: 'Body' },
      numeralPrimitive: { mesh: 'SourceMesh_primitive_1', material: 'Numbers' },
    };
    expect(resolveAttackDiePrimitives(scene, selectors as never)).toEqual({
      node: scene.children[0],
      body,
      numeral,
    });
  });
  it('fails extra, missing, or ambiguous primitive roles closed', () => {
    const { scene } = sceneFixture();
    const selectors = {
      ...validSidecar().selectors,
      node: 'Node',
      sourceMesh: 'SourceMesh_primitive',
      bodyPrimitive: { mesh: 'SourceMesh_primitive_0', material: 'Body' },
      numeralPrimitive: { mesh: 'SourceMesh_primitive_1', material: 'Numbers' },
    };
    const extra = (scene.children[0].children[0] as Mesh).clone();
    scene.children[0].add(extra);
    expect(() => resolveAttackDiePrimitives(scene, selectors as never)).toThrow(
      /primitive/
    );
  });
});

it('rejects matching descendants and unrelated prefix primitive names', () => {
  const { scene } = sceneFixture();
  const node = scene.children[0];
  const wrapper = new Group();
  wrapper.add(node.children[0]);
  node.add(wrapper);
  const selectors = {
    ...validSidecar().selectors,
    node: 'Node',
    sourceMesh: 'SourceMesh_primitive',
    bodyPrimitive: { mesh: 'SourceMesh_primitive_0', material: 'Body' },
    numeralPrimitive: { mesh: 'SourceMesh_primitive_1', material: 'Numbers' },
  };
  expect(() => resolveAttackDiePrimitives(scene, selectors as never)).toThrow(
    /direct sibling/
  );
  wrapper.clear();
  (node.children[0] as Mesh).name = 'SourceMesh_primitive_extra';
  expect(() => resolveAttackDiePrimitives(scene, selectors as never)).toThrow(
    /primitive/
  );
});
