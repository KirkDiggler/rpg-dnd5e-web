import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { bindSkinnedAccessory } from './skinnedAccessory';

const DEFAULT_TOLERANCE = 1e-5;
const BODY_BONE_NAMES = ['Root', 'Spine', 'Head'] as const;
const BODY_BIND_MATRIX = new THREE.Matrix4().makeTranslation(3, 4, 5);

interface RigFixture {
  readonly bodyRoot: THREE.Group;
  readonly bodySkeleton: THREE.Skeleton;
  readonly bodyMeshes: readonly [THREE.SkinnedMesh, THREE.SkinnedMesh];
  readonly bodyBones: readonly THREE.Bone[];
  readonly bodyInverses: readonly THREE.Matrix4[];
  readonly accessoryRoot: THREE.Group;
  readonly accessoryMesh: THREE.SkinnedMesh;
  readonly accessoryBones: readonly THREE.Bone[];
}

function makeBoneChain(names: readonly string[]): THREE.Bone[] {
  const bones = names.map((name) => {
    const bone = new THREE.Bone();
    bone.name = name;
    return bone;
  });

  for (let index = 1; index < bones.length; index += 1) {
    bones[index - 1]!.add(bones[index]!);
  }

  return bones;
}

function makeBodyInverses(): THREE.Matrix4[] {
  return [
    new THREE.Matrix4().makeTranslation(-1, 0, 0),
    new THREE.Matrix4().makeTranslation(0, -2, 0),
    new THREE.Matrix4().makeTranslation(0, 0, -3),
  ];
}

function makeSkinnedMesh(
  skeleton: THREE.Skeleton,
  bindMatrix = BODY_BIND_MATRIX
): THREE.SkinnedMesh {
  const mesh = new THREE.SkinnedMesh(
    new THREE.BufferGeometry(),
    new THREE.MeshStandardMaterial()
  );
  mesh.bind(skeleton, bindMatrix);
  return mesh;
}

function makeFixture(
  accessoryBoneNames: readonly string[] = ['Root', 'Head']
): RigFixture {
  const bodyRoot = new THREE.Group();
  const bodyBones = makeBoneChain(BODY_BONE_NAMES);
  const bodyInverses = makeBodyInverses();
  const bodySkeleton = new THREE.Skeleton(bodyBones, bodyInverses);
  const bodyMeshes = [
    makeSkinnedMesh(bodySkeleton),
    makeSkinnedMesh(bodySkeleton),
  ] as const;
  bodyRoot.add(bodyBones[0]!);
  bodyRoot.add(...bodyMeshes);

  const bodyInverseByName = new Map<string, THREE.Matrix4>(
    BODY_BONE_NAMES.map((name, index) => [name, bodyInverses[index]!])
  );
  const accessoryBones = makeBoneChain(accessoryBoneNames);
  const accessoryInverses = accessoryBoneNames.map(
    (name) => bodyInverseByName.get(name)?.clone() ?? new THREE.Matrix4()
  );
  const accessorySkeleton = new THREE.Skeleton(
    accessoryBones,
    accessoryInverses
  );
  const accessoryMesh = makeSkinnedMesh(accessorySkeleton);
  const accessoryRoot = new THREE.Group();
  accessoryRoot.add(accessoryBones[0]!, accessoryMesh);

  return {
    bodyRoot,
    bodySkeleton,
    bodyMeshes,
    bodyBones,
    bodyInverses,
    accessoryRoot,
    accessoryMesh,
    accessoryBones,
  };
}

function expectFailure(
  result: ReturnType<typeof bindSkinnedAccessory>,
  code: Exclude<ReturnType<typeof bindSkinnedAccessory>, { ok: true }>['code']
): Exclude<ReturnType<typeof bindSkinnedAccessory>, { ok: true }> {
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error(`Expected ${code}, received a successful binding`);
  }
  expect(result.code).toBe(code);
  return result;
}

describe('bindSkinnedAccessory', () => {
  it('maps a subset by exact name onto body bones and owns only the wrapper', () => {
    const fixture = makeFixture();

    const result = bindSkinnedAccessory(
      fixture.bodyRoot,
      fixture.accessoryRoot
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.mesh).toBe(fixture.accessoryMesh);
    expect(result.mesh.skeleton).not.toBe(fixture.bodySkeleton);
    expect(result.mesh.skeleton.bones).toEqual([
      fixture.bodyBones[0],
      fixture.bodyBones[2],
    ]);
    expect(result.mesh.skeleton.bones).not.toContain(fixture.accessoryBones[0]);
    expect(
      result.mesh.skeleton.boneInverses[0]!.equals(fixture.bodyInverses[0]!)
    ).toBe(true);
    expect(
      result.mesh.skeleton.boneInverses[1]!.equals(fixture.bodyInverses[2]!)
    ).toBe(true);
    expect(result.mappedBoneNames).toEqual(['Root', 'Head']);
    expect(result.mappedBoneUuids).toEqual([
      fixture.bodyBones[0]!.uuid,
      fixture.bodyBones[2]!.uuid,
    ]);
    expect(result.bodyRootBoneUuid).toBe(fixture.bodyBones[0]!.uuid);
    expect(result.ownsSkeletonWrapper).toBe(true);
    expect(fixture.accessoryRoot.children).not.toContain(result.mesh);
  });

  it('reuses the authoritative body Skeleton for an exact full-order skin', () => {
    const fixture = makeFixture(BODY_BONE_NAMES);

    const result = bindSkinnedAccessory(
      fixture.bodyRoot,
      fixture.accessoryRoot
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.mesh.skeleton).toBe(fixture.bodySkeleton);
    expect(result.mesh.skeleton.bones).toEqual(fixture.bodyBones);
    expect(result.ownsSkeletonWrapper).toBe(false);
    expect(result.mappedBoneNames).toEqual(BODY_BONE_NAMES);
  });

  it('uses names rather than body array indices for inverse and bone mapping', () => {
    const fixture = makeFixture(['Head', 'Root']);

    const result = bindSkinnedAccessory(
      fixture.bodyRoot,
      fixture.accessoryRoot
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.mesh.skeleton.bones).toEqual([
      fixture.bodyBones[2],
      fixture.bodyBones[0],
    ]);
    expect(result.mappedBoneNames).toEqual(['Head', 'Root']);
    expect(result.mappedBoneUuids).toEqual([
      fixture.bodyBones[2]!.uuid,
      fixture.bodyBones[0]!.uuid,
    ]);
  });

  it('chooses one canonical Skeleton from equivalent body wrappers', () => {
    const fixture = makeFixture(BODY_BONE_NAMES);
    const equivalentSkeleton = new THREE.Skeleton(
      [...fixture.bodyBones],
      [...fixture.bodyInverses]
    );
    fixture.bodyMeshes[1].bind(equivalentSkeleton, BODY_BIND_MATRIX);

    expect(equivalentSkeleton).not.toBe(fixture.bodySkeleton);
    equivalentSkeleton.bones.forEach((bone, index) => {
      expect(bone).toBe(fixture.bodyBones[index]);
      expect(equivalentSkeleton.boneInverses[index]).toBe(
        fixture.bodyInverses[index]
      );
    });

    const result = bindSkinnedAccessory(
      fixture.bodyRoot,
      fixture.accessoryRoot
    );

    expect(result).not.toMatchObject({
      ok: false,
      code: 'body-skeleton-count',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.mesh.skeleton).toBe(fixture.bodySkeleton);
    expect(result.ownsSkeletonWrapper).toBe(false);
    expect(result.mappedBoneUuids).toEqual(
      fixture.bodyBones.map((bone) => bone.uuid)
    );
  });

  it('requires at least one body skin', () => {
    const fixture = makeFixture();

    expectFailure(
      bindSkinnedAccessory(new THREE.Group(), fixture.accessoryRoot),
      'body-skeleton-count'
    );
  });

  it('rejects an unbound body SkinnedMesh without mutating the accessory', () => {
    const fixture = makeFixture();
    fixture.bodyRoot.add(new THREE.SkinnedMesh());

    expectFailure(
      bindSkinnedAccessory(fixture.bodyRoot, fixture.accessoryRoot),
      'body-skeleton-count'
    );
    expect(fixture.accessoryMesh.parent).toBe(fixture.accessoryRoot);
  });

  it('rejects same-name body wrappers backed by different Bone objects', () => {
    const fixture = makeFixture();
    const otherBones = makeBoneChain(BODY_BONE_NAMES);
    const otherSkeleton = new THREE.Skeleton(otherBones, makeBodyInverses());
    fixture.bodyRoot.add(otherBones[0]!);
    fixture.bodyMeshes[1].bind(otherSkeleton, BODY_BIND_MATRIX);

    expectFailure(
      bindSkinnedAccessory(fixture.bodyRoot, fixture.accessoryRoot),
      'body-skeleton-count'
    );
    expect(fixture.accessoryMesh.parent).toBe(fixture.accessoryRoot);
  });

  it('rejects body wrappers whose inverse matrices differ', () => {
    const fixture = makeFixture();
    const mismatchedInverses = fixture.bodyInverses.map((inverse) =>
      inverse.clone()
    );
    mismatchedInverses[1]!.elements[13] += DEFAULT_TOLERANCE * 1.1;
    const mismatchedSkeleton = new THREE.Skeleton(
      [...fixture.bodyBones],
      mismatchedInverses
    );
    fixture.bodyMeshes[1].bind(mismatchedSkeleton, BODY_BIND_MATRIX);

    expectFailure(
      bindSkinnedAccessory(fixture.bodyRoot, fixture.accessoryRoot),
      'body-skeleton-count'
    );
    expect(fixture.accessoryMesh.parent).toBe(fixture.accessoryRoot);
  });

  it('rejects equivalent body wrappers whose bind matrices differ', () => {
    const fixture = makeFixture();
    const equivalentSkeleton = new THREE.Skeleton(
      [...fixture.bodyBones],
      [...fixture.bodyInverses]
    );
    const mismatchedBindMatrix = BODY_BIND_MATRIX.clone();
    mismatchedBindMatrix.elements[14] += DEFAULT_TOLERANCE * 1.1;
    fixture.bodyMeshes[1].bind(equivalentSkeleton, mismatchedBindMatrix);

    expectFailure(
      bindSkinnedAccessory(fixture.bodyRoot, fixture.accessoryRoot),
      'bind-matrix-mismatch'
    );
    expect(fixture.accessoryMesh.parent).toBe(fixture.accessoryRoot);
  });

  it('rejects duplicate body bone names instead of choosing one', () => {
    const fixture = makeFixture();
    fixture.bodyBones[2]!.name = 'Spine';

    expectFailure(
      bindSkinnedAccessory(fixture.bodyRoot, fixture.accessoryRoot),
      'duplicate-body-bone'
    );
  });

  it('requires exactly one accessory SkinnedMesh', () => {
    const fixture = makeFixture();
    const secondAccessoryBones = makeBoneChain(['Root']);
    const secondAccessorySkeleton = new THREE.Skeleton(secondAccessoryBones, [
      fixture.bodyInverses[0]!.clone(),
    ]);
    fixture.accessoryRoot.add(
      secondAccessoryBones[0]!,
      makeSkinnedMesh(secondAccessorySkeleton)
    );

    expectFailure(
      bindSkinnedAccessory(fixture.bodyRoot, fixture.accessoryRoot),
      'accessory-mesh-count'
    );
  });

  it('reports every accessory joint missing from the body by exact name', () => {
    const fixture = makeFixture(['Tail', 'Root', 'Jaw']);

    const failure = expectFailure(
      bindSkinnedAccessory(fixture.bodyRoot, fixture.accessoryRoot),
      'missing-body-bone'
    );

    expect(failure.missingBoneNames).toEqual(['Tail', 'Jaw']);
    expect(fixture.accessoryMesh.parent).toBe(fixture.accessoryRoot);
  });

  it('rejects a per-name inverse-bind delta above the default tolerance', () => {
    const fixture = makeFixture();
    fixture.accessoryMesh.skeleton.boneInverses[1]!.elements[12] +=
      DEFAULT_TOLERANCE * 1.1;

    expectFailure(
      bindSkinnedAccessory(fixture.bodyRoot, fixture.accessoryRoot),
      'inverse-bind-mismatch'
    );
  });

  it('rejects an accessory bind matrix incompatible with the body bind', () => {
    const fixture = makeFixture();
    fixture.accessoryMesh.bindMatrix.elements[13] += DEFAULT_TOLERANCE * 1.1;

    expectFailure(
      bindSkinnedAccessory(fixture.bodyRoot, fixture.accessoryRoot),
      'bind-matrix-mismatch'
    );
  });

  it('does not return source accessory bones when they descend from the mesh', () => {
    const fixture = makeFixture();
    fixture.accessoryMesh.add(fixture.accessoryBones[0]!);

    const result = bindSkinnedAccessory(
      fixture.bodyRoot,
      fixture.accessoryRoot
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const mountedBones: THREE.Bone[] = [];
    result.mesh.traverse((node) => {
      if (node instanceof THREE.Bone) mountedBones.push(node);
    });
    expect(mountedBones).toEqual([]);
    expect(result.mesh.skeleton.bones).toEqual([
      fixture.bodyBones[0],
      fixture.bodyBones[2],
    ]);
  });
});
