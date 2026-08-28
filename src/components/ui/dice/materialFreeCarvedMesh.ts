import { Mesh, type BufferAttribute, type Object3D } from 'three';
import {
  createMaterialFreeDiceMaterials,
  type DiceMaterialTreatment,
} from './attackDieMaterial';
import type { DiceRuntimePreset } from './diceRuntimeManifest';
import type { RuntimeMeshBinding } from './diceRuntimeProvider';

export type { DiceMaterialTreatment } from './attackDieMaterial';

export interface PreparedDiceScene {
  readonly scene: Object3D;
  readonly dispose: () => void;
}

export const ORIGINAL_RUNTIME_CAMERA_DISTANCE_SCALE = 1.2;

export function runtimeDiceNormalization(preset: DiceRuntimePreset) {
  const { bboxMin, bboxMax, dimensions } = preset.model.bounds;
  const maximumDimension = Math.max(...dimensions);
  if (!Number.isFinite(maximumDimension) || maximumDimension <= 0)
    throw Error('runtime dice normalization requires positive bounds');
  return {
    scale: 0.55 / maximumDimension,
    position: [
      -(bboxMin[0] + bboxMax[0]) / 2,
      -(bboxMin[1] + bboxMax[1]) / 2,
      -(bboxMin[2] + bboxMax[2]) / 2,
    ] as const,
  };
}

function bindingFailure(reason: string): never {
  throw Error(`runtime mesh binding failed: ${reason}`);
}

function matchingObjects(scene: Object3D, name: string) {
  const matches: Object3D[] = [];
  scene.traverse((object) => {
    if (object.name === name) matches.push(object);
  });
  return matches;
}

function validatedSourceMesh(
  scene: Object3D,
  preset: DiceRuntimePreset,
  binding: RuntimeMeshBinding
) {
  const selectors = preset.model.selectors;
  if (
    selectors.kind !== 'single-mesh' ||
    binding.objectNode !== selectors.objectNode ||
    binding.meshDefinition !== selectors.meshDefinition ||
    !Number.isSafeInteger(binding.meshDefinitionIndex) ||
    binding.meshDefinitionIndex < 0
  )
    return bindingFailure('provider binding does not match preset selectors');

  const matches = matchingObjects(scene, binding.objectNode);
  if (matches.length !== 1)
    return bindingFailure('expected exactly one bound object node');
  const selected = matches[0];
  if (!(selected instanceof Mesh))
    return bindingFailure('bound object node is not a Mesh');

  const sceneMeshes: Mesh[] = [];
  scene.traverse((object) => {
    if (object instanceof Mesh) sceneMeshes.push(object);
  });
  if (sceneMeshes.length !== 1 || sceneMeshes[0] !== selected)
    return bindingFailure('unexpected child mesh');
  return selected;
}

function validatedTriangleOrdinals(
  preset: DiceRuntimePreset,
  index: BufferAttribute
) {
  const geometry = preset.model.geometry;
  if (geometry.kind !== 'single-mesh-triangle-groups')
    throw Error('material-free carved geometry discriminator mismatch');
  if (index.count % 3 !== 0)
    throw Error('indexed geometry has an incomplete triangle');
  const triangleCount = index.count / 3;
  if (
    triangleCount !== geometry.totalTriangles ||
    triangleCount !== preset.model.meshFacts.triangles
  )
    throw Error('indexed geometry triangle count mismatch');
  if (
    geometry.bodyTriangleIndices.length === 0 ||
    geometry.numeralTriangleIndices.length === 0
  )
    throw Error('invalid carved triangle partition');

  const occupied = new Set<number>();
  const validateRole = (ordinals: readonly number[]) => {
    for (const ordinal of ordinals) {
      if (
        !Number.isSafeInteger(ordinal) ||
        ordinal < 0 ||
        ordinal >= triangleCount ||
        occupied.has(ordinal)
      )
        throw Error('invalid carved triangle partition');
      occupied.add(ordinal);
    }
  };
  validateRole(geometry.bodyTriangleIndices);
  validateRole(geometry.numeralTriangleIndices);
  if (occupied.size !== triangleCount)
    throw Error('invalid carved triangle partition');
  return geometry;
}

function reorderedIndex(
  source: BufferAttribute,
  body: readonly number[],
  numeral: readonly number[]
) {
  const reordered = source.clone();
  let destination = 0;
  for (const triangleOrdinal of [...body, ...numeral]) {
    const sourceStart = triangleOrdinal * 3;
    reordered.setX(destination++, source.getX(sourceStart));
    reordered.setX(destination++, source.getX(sourceStart + 1));
    reordered.setX(destination++, source.getX(sourceStart + 2));
  }
  reordered.needsUpdate = true;
  return reordered;
}

export function prepareMaterialFreeCarvedScene(
  scene: Object3D,
  preset: DiceRuntimePreset,
  binding: RuntimeMeshBinding,
  treatment: DiceMaterialTreatment
): PreparedDiceScene {
  const sourceMesh = validatedSourceMesh(scene, preset, binding);
  const sourceIndex = sourceMesh.geometry.getIndex();
  if (!sourceIndex)
    throw Error('material-free carved geometry must be indexed');
  const triangleGroups = validatedTriangleOrdinals(preset, sourceIndex);

  const clonedScene = scene.clone(true);
  const clonedMatches = matchingObjects(clonedScene, binding.objectNode);
  if (clonedMatches.length !== 1 || !(clonedMatches[0] instanceof Mesh))
    return bindingFailure('cloned object node is not the selected Mesh');
  const clonedMesh = clonedMatches[0];
  const clonedGeometry = sourceMesh.geometry.clone();
  let bodyMaterial:
    | ReturnType<typeof createMaterialFreeDiceMaterials>['body']
    | null = null;
  let numeralMaterial:
    | ReturnType<typeof createMaterialFreeDiceMaterials>['numeral']
    | null = null;

  try {
    clonedGeometry.setIndex(
      reorderedIndex(
        sourceIndex,
        triangleGroups.bodyTriangleIndices,
        triangleGroups.numeralTriangleIndices
      )
    );
    clonedGeometry.clearGroups();
    const bodyIndexCount = triangleGroups.bodyTriangleIndices.length * 3;
    clonedGeometry.addGroup(0, bodyIndexCount, 0);
    clonedGeometry.addGroup(
      bodyIndexCount,
      triangleGroups.numeralTriangleIndices.length * 3,
      1
    );
    const sourceMaterial = Array.isArray(sourceMesh.material)
      ? sourceMesh.material[0]
      : sourceMesh.material;
    const materials = createMaterialFreeDiceMaterials(
      treatment,
      sourceMaterial
    );
    bodyMaterial = materials.body;
    numeralMaterial = materials.numeral;
    clonedMesh.geometry = clonedGeometry;
    clonedMesh.material = [bodyMaterial, numeralMaterial];
  } catch (error) {
    clonedGeometry.dispose();
    bodyMaterial?.dispose();
    numeralMaterial?.dispose();
    throw error;
  }

  let disposed = false;
  return {
    scene: clonedScene,
    dispose() {
      if (disposed) return;
      disposed = true;
      clonedGeometry.dispose();
      bodyMaterial?.dispose();
      numeralMaterial?.dispose();
    },
  };
}
