import * as THREE from 'three';

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

function collectSkinnedMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((node) => {
    if (node instanceof THREE.SkinnedMesh) meshes.push(node);
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

  const bodyMeshes = collectSkinnedMeshes(bodyRoot);
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
