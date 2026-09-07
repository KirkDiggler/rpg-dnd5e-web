import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import {
  applyRuntimeSurfaceTreatment,
  type RuntimeSurfaceTreatment,
} from './runtimeSurfaceTreatment';

const DEFAULT_BIND_TOLERANCE = 1e-5;

export type SkinnedAccessoryBindFailureCode =
  | 'invalid-tolerance'
  | 'body-skeleton-count'
  | 'accessory-mesh-count'
  | 'accessory-skeleton'
  | 'duplicate-body-bone'
  | 'missing-body-bone'
  | 'inverse-bind-mismatch'
  | 'bind-matrix-mismatch';

export interface SkinnedAccessoryPresentation {
  readonly slot: 'scalp' | 'facial-hair';
  readonly styleRef: string;
  readonly url: string;
  readonly treatment: RuntimeSurfaceTreatment;
}

export interface SkinnedAccessoryBindingEvidence {
  readonly bodyRootBoneUuid: string;
  readonly mappedBoneNames: readonly string[];
  readonly mappedBoneUuids: readonly string[];
}

export interface PreparedSkinnedAccessory {
  readonly mesh: THREE.SkinnedMesh;
  readonly materials: readonly THREE.MeshStandardMaterial[];
  readonly dispose: () => void;
  readonly evidence: SkinnedAccessoryBindingEvidence;
}

export type SkinnedAccessoryBindResult =
  | {
      readonly ok: true;
      readonly mesh: THREE.SkinnedMesh;
      readonly mappedBoneNames: readonly string[];
      readonly bodyRootBoneUuid: string;
      readonly mappedBoneUuids: readonly string[];
      readonly ownsSkeletonWrapper: boolean;
    }
  | {
      readonly ok: false;
      readonly code: SkinnedAccessoryBindFailureCode;
      readonly message: string;
      readonly missingBoneNames: readonly string[];
    };

interface BodyBoneBinding {
  readonly bone: THREE.Bone;
  readonly inverse: THREE.Matrix4 | undefined;
}

function failure(
  code: SkinnedAccessoryBindFailureCode,
  message: string,
  missingBoneNames: readonly string[] = []
): SkinnedAccessoryBindResult {
  return { ok: false, code, message, missingBoneNames };
}

const MOUNTED_ACCESSORIES = new WeakSet<THREE.SkinnedMesh>();

export function markMountedSkinnedAccessory(mesh: THREE.SkinnedMesh): void {
  MOUNTED_ACCESSORIES.add(mesh);
}

function collectSkinnedMeshes(
  root: THREE.Object3D,
  excludeMountedAccessories = false
): THREE.SkinnedMesh[] {
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((node) => {
    if (
      node instanceof THREE.SkinnedMesh &&
      (!excludeMountedAccessories || !MOUNTED_ACCESSORIES.has(node))
    ) {
      meshes.push(node);
    }
  });
  return meshes;
}

function matricesMatch(
  left: THREE.Matrix4,
  right: THREE.Matrix4,
  tolerance: number
): boolean {
  return left.elements.every((value, index) => {
    const delta = Math.abs(value - right.elements[index]!);
    return Number.isFinite(delta) && delta <= tolerance;
  });
}

function skeletonsShareArmature(
  canonical: THREE.Skeleton,
  candidate: THREE.Skeleton,
  tolerance: number
): boolean {
  if (candidate.bones.length !== canonical.bones.length) return false;

  return canonical.bones.every((bone, index) => {
    const canonicalInverse = canonical.boneInverses[index];
    const candidateInverse = candidate.boneInverses[index];
    return (
      candidate.bones[index] === bone &&
      canonicalInverse !== undefined &&
      candidateInverse !== undefined &&
      matricesMatch(canonicalInverse, candidateInverse, tolerance)
    );
  });
}

function findBodyRootBone(skeleton: THREE.Skeleton): THREE.Bone | undefined {
  const bodyBones = new Set(skeleton.bones);
  return (
    skeleton.bones.find(
      (bone) =>
        !(bone.parent instanceof THREE.Bone) || !bodyBones.has(bone.parent)
    ) ?? skeleton.bones[0]
  );
}

function detachBoneDescendants(mesh: THREE.SkinnedMesh): void {
  const descendants: THREE.Bone[] = [];
  mesh.traverse((node) => {
    if (node !== mesh && node instanceof THREE.Bone) descendants.push(node);
  });

  for (const bone of descendants) {
    let ancestor: THREE.Object3D | null = bone.parent;
    while (ancestor !== null && ancestor !== mesh) ancestor = ancestor.parent;
    if (ancestor === mesh) bone.removeFromParent();
  }
}

export function bindSkinnedAccessory(
  bodyRoot: THREE.Object3D,
  accessoryRoot: THREE.Object3D,
  tolerance = DEFAULT_BIND_TOLERANCE
): SkinnedAccessoryBindResult {
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    return failure(
      'invalid-tolerance',
      'Bind tolerance must be a finite non-negative number.'
    );
  }

  const bodyMeshes = collectSkinnedMeshes(bodyRoot, true);
  const bodySkeleton = bodyMeshes[0]?.skeleton;
  if (
    !(bodySkeleton instanceof THREE.Skeleton) ||
    bodySkeleton.bones.length === 0 ||
    bodyMeshes.some((mesh) => {
      const skeleton = mesh.skeleton;
      return (
        skeleton !== bodySkeleton &&
        (!(skeleton instanceof THREE.Skeleton) ||
          !skeletonsShareArmature(bodySkeleton, skeleton, tolerance))
      );
    })
  ) {
    return failure(
      'body-skeleton-count',
      'Body must contain one authoritative armature shared by every SkinnedMesh.'
    );
  }

  const accessoryMeshes = collectSkinnedMeshes(accessoryRoot);
  if (accessoryMeshes.length !== 1) {
    return failure(
      'accessory-mesh-count',
      `Accessory must contain exactly one SkinnedMesh; found ${accessoryMeshes.length}.`
    );
  }

  const accessoryMesh = accessoryMeshes[0]!;
  const accessorySkeleton = accessoryMesh.skeleton;
  if (!(accessorySkeleton instanceof THREE.Skeleton)) {
    return failure(
      'accessory-skeleton',
      'Accessory SkinnedMesh must be bound to a THREE.Skeleton before attachment.'
    );
  }

  const bodyBoneByName = new Map<string, BodyBoneBinding>();
  for (let index = 0; index < bodySkeleton.bones.length; index += 1) {
    const bone = bodySkeleton.bones[index]!;
    if (bodyBoneByName.has(bone.name)) {
      return failure(
        'duplicate-body-bone',
        `Body Skeleton contains duplicate bone name "${bone.name}".`
      );
    }
    bodyBoneByName.set(bone.name, {
      bone,
      inverse: bodySkeleton.boneInverses[index],
    });
  }

  const missingBoneNames = accessorySkeleton.bones
    .map((bone) => bone.name)
    .filter((name) => !bodyBoneByName.has(name));
  if (missingBoneNames.length > 0) {
    return failure(
      'missing-body-bone',
      `Body Skeleton is missing accessory bones: ${missingBoneNames.join(', ')}.`,
      missingBoneNames
    );
  }

  const mappedBones: THREE.Bone[] = [];
  for (let index = 0; index < accessorySkeleton.bones.length; index += 1) {
    const accessoryBone = accessorySkeleton.bones[index]!;
    const bodyBinding = bodyBoneByName.get(accessoryBone.name)!;
    const accessoryInverse = accessorySkeleton.boneInverses[index];
    if (
      bodyBinding.inverse === undefined ||
      accessoryInverse === undefined ||
      !matricesMatch(bodyBinding.inverse, accessoryInverse, tolerance)
    ) {
      return failure(
        'inverse-bind-mismatch',
        `Inverse bind matrix for accessory bone "${accessoryBone.name}" does not match the body.`
      );
    }
    mappedBones.push(bodyBinding.bone);
  }

  const bodyBindMatrix = bodyMeshes[0]!.bindMatrix;
  if (
    bodyMeshes.some(
      (mesh) => !matricesMatch(mesh.bindMatrix, bodyBindMatrix, tolerance)
    ) ||
    !matricesMatch(accessoryMesh.bindMatrix, bodyBindMatrix, tolerance)
  ) {
    return failure(
      'bind-matrix-mismatch',
      'Accessory and body SkinnedMesh bind matrices must match.'
    );
  }

  const reusesBodySkeleton =
    accessorySkeleton.bones.length === bodySkeleton.bones.length &&
    accessorySkeleton.bones.every(
      (bone, index) => bone.name === bodySkeleton.bones[index]!.name
    );
  const targetSkeleton = reusesBodySkeleton
    ? bodySkeleton
    : new THREE.Skeleton(
        mappedBones,
        accessorySkeleton.boneInverses.map((inverse) => inverse.clone())
      );

  detachBoneDescendants(accessoryMesh);
  accessoryMesh.removeFromParent();
  accessoryMesh.bind(targetSkeleton, bodyBindMatrix);

  const bodyRootBone = findBodyRootBone(bodySkeleton)!;
  const mappedBoneNames = accessorySkeleton.bones.map((bone) => bone.name);
  return {
    ok: true,
    mesh: accessoryMesh,
    mappedBoneNames,
    bodyRootBoneUuid: bodyRootBone.uuid,
    mappedBoneUuids: mappedBones.map((bone) => bone.uuid),
    ownsSkeletonWrapper: !reusesBodySkeleton,
  };
}

function disposeSkeletons(skeletons: Iterable<THREE.Skeleton>): void {
  for (const skeleton of skeletons) skeleton.dispose();
}

/**
 * Clone and exact-bind a provider accessory without mounting it. Source GLTF
 * geometry/materials remain cache-owned; only cloned material and Skeleton
 * wrapper identities are owned by the returned preparation.
 */
export function prepareSkinnedAccessory(
  characterRoot: THREE.Object3D,
  sourceScene: THREE.Object3D,
  presentation: SkinnedAccessoryPresentation
): PreparedSkinnedAccessory {
  const accessoryRoot = cloneSkeleton(sourceScene);
  const clonedSkeletons = new Set<THREE.Skeleton>();
  accessoryRoot.traverse((node) => {
    if (node instanceof THREE.SkinnedMesh) clonedSkeletons.add(node.skeleton);
  });

  const result = bindSkinnedAccessory(characterRoot, accessoryRoot);
  if (!result.ok) {
    disposeSkeletons(clonedSkeletons);
    throw new Error(result.message);
  }

  // bindSkinnedAccessory replaces the clone's source Skeleton wrapper with
  // either the authoritative body Skeleton or one exact mapped wrapper. The
  // now-detached clone wrappers are ours and must not survive preparation.
  clonedSkeletons.delete(result.mesh.skeleton);
  disposeSkeletons(clonedSkeletons);

  let materials: readonly THREE.MeshStandardMaterial[];
  try {
    materials = applyRuntimeSurfaceTreatment(
      result.mesh,
      presentation.treatment
    );
  } catch (error) {
    if (result.ownsSkeletonWrapper) result.mesh.skeleton.dispose();
    throw error;
  }

  let disposed = false;
  return {
    mesh: result.mesh,
    materials,
    evidence: {
      bodyRootBoneUuid: result.bodyRootBoneUuid,
      mappedBoneNames: result.mappedBoneNames,
      mappedBoneUuids: result.mappedBoneUuids,
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      materials.forEach((material) => material.dispose());
      if (result.ownsSkeletonWrapper) result.mesh.skeleton.dispose();
    },
  };
}
