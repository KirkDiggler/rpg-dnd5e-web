import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Uint16BufferAttribute,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { DiceRuntimePreset } from './diceRuntimeManifest';
import type { RuntimeMeshBinding } from './diceRuntimeProvider';
import { validDiceRuntimeManifest } from './diceRuntimeTestFixtures';
import {
  prepareMaterialFreeCarvedScene,
  type DiceMaterialTreatment,
} from './materialFreeCarvedMesh';

const treatment: DiceMaterialTreatment = Object.freeze({
  bodyColor: '#15233b',
  numeralColor: '#f5eddc',
  roughness: 0.72,
  metalness: 0.08,
});

function fixturePreset(): DiceRuntimePreset {
  const fixture = validDiceRuntimeManifest();
  const preset = fixture.presets[0];
  preset.model.meshFacts.triangles = 4;
  preset.model.geometry.totalTriangles = 4;
  preset.model.geometry.bodyTriangleIndices = [2, 0];
  preset.model.geometry.numeralTriangleIndices = [3, 1];
  return preset as unknown as DiceRuntimePreset;
}

function fixtureBinding(preset = fixturePreset()): RuntimeMeshBinding {
  const selectors = preset.model.selectors;
  if (selectors.kind !== 'single-mesh')
    throw Error('fixture selector mismatch');
  return Object.freeze({
    objectNode: selectors.objectNode,
    meshDefinition: selectors.meshDefinition,
    meshDefinitionIndex: 0,
  });
}

function indexedGeometry() {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(
      [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1],
      3
    )
  );
  geometry.setIndex(
    new Uint16BufferAttribute([0, 1, 2, 3, 4, 5, 0, 2, 3, 1, 3, 5], 1)
  );
  geometry.addGroup(3, 6, 7);
  return geometry;
}

function fixtureScene(options: { selected?: Object3D } = {}) {
  const preset = fixturePreset();
  const selectors = preset.model.selectors;
  if (selectors.kind !== 'single-mesh')
    throw Error('fixture selector mismatch');
  const sourceGeometry = indexedGeometry();
  const sourceMaterial = new MeshStandardMaterial({ color: '#ff00ff' });
  sourceMaterial.name = 'loader-default-material';
  const selected = options.selected ?? new Mesh(sourceGeometry, sourceMaterial);
  selected.name = selectors.objectNode;
  const scene = new Group();
  scene.name = 'source-scene';
  scene.add(selected);
  return { scene, selected, sourceGeometry, sourceMaterial, preset };
}

function selectedMesh(scene: Object3D, objectNode: string) {
  const matches: Object3D[] = [];
  scene.traverse((object) => {
    if (object.name === objectNode) matches.push(object);
  });
  expect(matches).toHaveLength(1);
  expect(matches[0]).toBeInstanceOf(Mesh);
  return matches[0] as Mesh;
}

function materialArray(mesh: Mesh) {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function replaceGeometry(
  preset: DiceRuntimePreset,
  replacement: Partial<DiceRuntimePreset['model']['geometry']>
): DiceRuntimePreset {
  return {
    ...preset,
    model: {
      ...preset.model,
      geometry: {
        ...preset.model.geometry,
        ...replacement,
      } as DiceRuntimePreset['model']['geometry'],
    },
  };
}

describe('prepareMaterialFreeCarvedScene', () => {
  it('selects the exact bound Object3D node, requires its Mesh, and never searches by mesh-definition name', () => {
    const { scene, preset } = fixtureScene();
    const binding = fixtureBinding(preset);
    expect(binding.objectNode).not.toBe(binding.meshDefinition);
    const lookup = vi.spyOn(scene, 'getObjectByName');

    const prepared = prepareMaterialFreeCarvedScene(
      scene,
      preset,
      binding,
      treatment
    );

    expect(selectedMesh(prepared.scene, binding.objectNode)).toBeInstanceOf(
      Mesh
    );
    expect(lookup).not.toHaveBeenCalledWith(binding.meshDefinition);
    prepared.dispose();
  });

  it('copies source index triples in body-then-numeral ordinal order into two contiguous draw groups', () => {
    const { scene, preset, sourceGeometry } = fixtureScene();
    const binding = fixtureBinding(preset);
    const sourceIndex = [...sourceGeometry.getIndex()!.array];
    const sourceGroups = sourceGeometry.groups.map((group) => ({ ...group }));

    const prepared = prepareMaterialFreeCarvedScene(
      scene,
      preset,
      binding,
      treatment
    );
    const mesh = selectedMesh(prepared.scene, binding.objectNode);

    expect([...mesh.geometry.getIndex()!.array]).toEqual([
      0, 2, 3, 0, 1, 2, 1, 3, 5, 3, 4, 5,
    ]);
    expect(mesh.geometry.groups).toEqual([
      { start: 0, count: 6, materialIndex: 0 },
      { start: 6, count: 6, materialIndex: 1 },
    ]);
    expect([...sourceGeometry.getIndex()!.array]).toEqual(sourceIndex);
    expect(sourceGeometry.groups).toEqual(sourceGroups);
    prepared.dispose();
  });

  it('owns independent scene, geometry, and runtime materials per witness without mutating source resources', () => {
    const { scene, preset, selected, sourceGeometry, sourceMaterial } =
      fixtureScene();
    const binding = fixtureBinding(preset);
    const sourceMaterialColor = sourceMaterial.color.getHexString();
    const sourceMaterialClone = vi.spyOn(sourceMaterial, 'clone');
    const first = prepareMaterialFreeCarvedScene(
      scene,
      preset,
      binding,
      treatment
    );
    const second = prepareMaterialFreeCarvedScene(
      scene,
      preset,
      binding,
      treatment
    );
    const firstMesh = selectedMesh(first.scene, binding.objectNode);
    const secondMesh = selectedMesh(second.scene, binding.objectNode);
    const firstMaterials = materialArray(firstMesh);
    const secondMaterials = materialArray(secondMesh);

    expect(first.scene).not.toBe(scene);
    expect(second.scene).not.toBe(scene);
    expect(second.scene).not.toBe(first.scene);
    expect(firstMesh).not.toBe(selected);
    expect(firstMesh.geometry).not.toBe(sourceGeometry);
    expect(secondMesh.geometry).not.toBe(sourceGeometry);
    expect(secondMesh.geometry).not.toBe(firstMesh.geometry);
    expect(firstMaterials).toHaveLength(2);
    expect(secondMaterials).toHaveLength(2);
    expect(firstMaterials[0]).not.toBe(sourceMaterial);
    expect(firstMaterials[1]).not.toBe(sourceMaterial);
    expect(secondMaterials[0]).not.toBe(firstMaterials[0]);
    expect(secondMaterials[1]).not.toBe(firstMaterials[1]);
    expect(sourceMaterialClone).toHaveBeenCalledTimes(4);
    expect(sourceMaterial.color.getHexString()).toBe(sourceMaterialColor);
    expect((selected as Mesh).geometry).toBe(sourceGeometry);
    expect((selected as Mesh).material).toBe(sourceMaterial);

    first.dispose();
    second.dispose();
  });

  it('assigns body and numeral treatments and disposes only owned geometry/material clones exactly once', () => {
    const { scene, preset, sourceGeometry, sourceMaterial } = fixtureScene();
    const binding = fixtureBinding(preset);
    const sourceGeometryDispose = vi.spyOn(sourceGeometry, 'dispose');
    const sourceMaterialDispose = vi.spyOn(sourceMaterial, 'dispose');
    const prepared = prepareMaterialFreeCarvedScene(
      scene,
      preset,
      binding,
      treatment
    );
    const mesh = selectedMesh(prepared.scene, binding.objectNode);
    const geometryDispose = vi.spyOn(mesh.geometry, 'dispose');
    const materials = materialArray(mesh);
    const materialDisposals = materials.map((material) =>
      vi.spyOn(material, 'dispose')
    );

    expect(materials.map((material) => material.name)).toEqual([
      'attack-die-runtime-body',
      'attack-die-runtime-numeral',
    ]);
    expect(
      materials.map((material) =>
        material instanceof MeshStandardMaterial
          ? material.color.getStyle()
          : undefined
      )
    ).toEqual(['rgb(21,35,59)', 'rgb(245,237,220)']);

    prepared.dispose();
    prepared.dispose();

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(
      materialDisposals.every((dispose) => dispose.mock.calls.length === 1)
    ).toBe(true);
    expect(sourceGeometryDispose).not.toHaveBeenCalled();
    expect(sourceMaterialDispose).not.toHaveBeenCalled();
  });

  it.each([
    [
      'missing bound node',
      () => {
        const fixture = fixtureScene();
        fixture.selected.name = 'another-node';
        return fixture;
      },
    ],
    [
      'duplicate bound node',
      () => {
        const fixture = fixtureScene();
        const duplicate = new Object3D();
        duplicate.name = fixture.selected.name;
        fixture.scene.add(duplicate);
        return fixture;
      },
    ],
    ['non-mesh bound node', () => fixtureScene({ selected: new Object3D() })],
    [
      'unexpected child mesh',
      () => {
        const fixture = fixtureScene();
        fixture.selected.add(
          new Mesh(indexedGeometry(), new MeshBasicMaterial())
        );
        return fixture;
      },
    ],
  ])('rejects a %s selector', (_name, arrange) => {
    const { scene, preset } = arrange();
    expect(() =>
      prepareMaterialFreeCarvedScene(
        scene,
        preset,
        fixtureBinding(preset),
        treatment
      )
    ).toThrow(/mesh binding/i);
  });

  it('rejects non-indexed geometry and indexed triangle-count mismatch', () => {
    const nonIndexed = fixtureScene();
    nonIndexed.sourceGeometry.setIndex(null);
    expect(() =>
      prepareMaterialFreeCarvedScene(
        nonIndexed.scene,
        nonIndexed.preset,
        fixtureBinding(nonIndexed.preset),
        treatment
      )
    ).toThrow(/indexed/i);

    const mismatch = fixtureScene();
    mismatch.sourceGeometry.setIndex([0, 1, 2]);
    expect(() =>
      prepareMaterialFreeCarvedScene(
        mismatch.scene,
        mismatch.preset,
        fixtureBinding(mismatch.preset),
        treatment
      )
    ).toThrow(/triangle count/i);
  });

  it.each([
    [
      'overlap',
      { bodyTriangleIndices: [0, 1], numeralTriangleIndices: [1, 2] },
    ],
    ['gap', { bodyTriangleIndices: [0], numeralTriangleIndices: [1, 2] }],
    [
      'out of range',
      { bodyTriangleIndices: [0, 1], numeralTriangleIndices: [2, 4] },
    ],
    [
      'empty role',
      { bodyTriangleIndices: [], numeralTriangleIndices: [0, 1, 2, 3] },
    ],
  ])('rejects an invalid %s triangle partition', (_name, replacement) => {
    const { scene, preset } = fixtureScene();
    const malformed = replaceGeometry(preset, replacement);
    expect(() =>
      prepareMaterialFreeCarvedScene(
        scene,
        malformed,
        fixtureBinding(preset),
        treatment
      )
    ).toThrow(/partition/i);
  });
});
