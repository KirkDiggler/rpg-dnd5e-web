import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { bindSkinnedAccessory } from './skinnedAccessory';

const DEFAULT_TOLERANCE = 1e-5;
const BODY_BONE_NAMES = ['Root', 'Spine', 'Head'] as const;
const BODY_BIND_MATRIX = new THREE.Matrix4().makeTranslation(3, 4, 5);

interface RigFixture {
  readonly bodyRoot: THREE.Group;
  readonly bodySkeleton: THREE.Skeleton;
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
  bodyRoot.add(bodyBones[0]!);
  bodyRoot.add(makeSkinnedMesh(bodySkeleton), makeSkinnedMesh(bodySkeleton));

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

  it('requires one authoritative body Skeleton while allowing shared body meshes', () => {
    const fixture = makeFixture();
    const noBodySkin = new THREE.Group();

    expectFailure(
      bindSkinnedAccessory(noBodySkin, fixture.accessoryRoot),
      'body-skeleton-count'
    );

    const otherBones = makeBoneChain(BODY_BONE_NAMES);
    const otherSkeleton = new THREE.Skeleton(otherBones, makeBodyInverses());
    fixture.bodyRoot.add(otherBones[0]!, makeSkinnedMesh(otherSkeleton));

    expectFailure(
      bindSkinnedAccessory(fixture.bodyRoot, fixture.accessoryRoot),
      'body-skeleton-count'
    );
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
