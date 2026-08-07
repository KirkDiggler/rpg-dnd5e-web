/**
 * PreviewMonsterModel — skinned-clone regression (rider fix, graduation
 * unit, 2026-08-07, found live by Kirk: a monster placed at any authored
 * `at:` cell rendered away from its own cell, reading as "stuck at the
 * canvas origin"). Ground-truthed directly in the running app (this
 * unit) by patching `Object3D.prototype.updateMatrixWorld` and reading
 * real placements' skeleton state: the clone's own top-level position
 * (the `<primitive position=...>` prop) was already correct in both the
 * broken and fixed builds — the actual defect is narrower and precisely
 * what this file tests: the bone driving GPU skinning stays frozen at a
 * SHARED, stale world position (identical across every placed instance)
 * instead of tracking each clone's own placement. See
 * `PreviewMonsterModel.tsx`'s own doc comment for the full transcript.
 *
 * `PreviewMonsterModel.test.tsx`'s existing coverage mocks `useGLTF` to
 * return a plain `THREE.Group`/`THREE.Mesh` with no skeleton at all — a
 * real, previously-shipped bug this shape is structurally BLIND to:
 * `Object3D.clone(true)` and `SkeletonUtils.clone()` behave identically
 * for an unskinned scene (`SkeletonUtils.clone`'s own source is correct
 * for the static case too — see `ClassCharacterModel.tsx`'s doc comment),
 * so no assertion built on that mock could ever distinguish the broken
 * clone from the fixed one.
 *
 * This file exercises the REAL, unmocked mechanism instead: a hand-built
 * (not GLTF-file-loaded, but genuinely rigged — real `THREE.SkinnedMesh` /
 * `THREE.Skeleton` / `THREE.Bone`) fixture, run through the REAL
 * `three/addons/utils/SkeletonUtils.js` `clone` export, nothing stubbed.
 * The bug is generic Three.js Object3D/SkinnedMesh clone semantics, not
 * anything GLTF-format-specific, so this fixture exercises exactly the
 * load-bearing mechanism without the complexity/flakiness of loading a
 * real .glb through a real GLTFLoader in a jsdom test environment.
 *
 * Root cause, confirmed by reading three.js's own source
 * (`node_modules/three/src/objects/SkinnedMesh.js`, `copy()`):
 *
 *   this.skeleton = source.skeleton;
 *
 * A plain reference copy, not a clone — every `SkinnedMesh` produced by
 * `Object3D.clone(true)` keeps pointing at the SAME `Skeleton` instance
 * (and therefore the SAME, original, never-repositioned bones) as the
 * scene it was cloned from. Moving/repositioning the CLONE does nothing
 * to the bones actually driving its GPU skinning — they're not even part
 * of the clone's own tree. `SkeletonUtils.clone()` rebuilds a NEW
 * `Skeleton` from the CLONED bones and rebinds it
 * (`SkeletonUtils.js`: `clonedMesh.skeleton.bones = sourceBones.map(...)`,
 * `clonedMesh.bind(clonedMesh.skeleton, ...)`).
 */
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { describe, expect, it } from 'vitest';

/** A minimal but genuinely rigged fixture — one root bone, one
 * `SkinnedMesh` bound to it, wrapped in a `Group` the way a GLTF's own
 * `scene` wraps its content. Real `THREE.SkinnedMesh`/`Skeleton`/`Bone`,
 * nothing mocked. */
function buildRiggedFixture(): {
  scene: THREE.Group;
  mesh: THREE.SkinnedMesh;
  bone: THREE.Bone;
} {
  const bone = new THREE.Bone();
  bone.name = 'root';

  const skeleton = new THREE.Skeleton([bone]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0], 3)
  );
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  mesh.add(bone);
  mesh.bind(skeleton);

  const scene = new THREE.Group();
  scene.add(mesh);
  scene.updateMatrixWorld(true);

  return { scene, mesh, bone };
}

describe('SkeletonUtils.clone vs Object3D.clone(true) — the real mechanism behind the origin bug', () => {
  it('Object3D.clone(true) leaves the SkinnedMesh pointing at the ORIGINAL skeleton/bone — the documented three.js gotcha', () => {
    const { scene, mesh, bone } = buildRiggedFixture();

    const badScene = scene.clone(true);
    const badMesh = badScene.getObjectByProperty(
      'type',
      'SkinnedMesh'
    ) as THREE.SkinnedMesh;

    // SkinnedMesh.copy() does `this.skeleton = source.skeleton` — a shallow
    // reference, confirmed by reading three.js's own source (this file's
    // doc comment). The clone's mesh is a DIFFERENT object, but its
    // skeleton (and therefore the bone actually driving GPU skinning) is
    // the exact same instance as the original scene's.
    expect(badMesh).not.toBe(mesh);
    expect(badMesh.skeleton).toBe(mesh.skeleton);
    expect(badMesh.skeleton.bones[0]).toBe(bone);
  });

  it('cloneSkeleton() correctly rebinds the SkinnedMesh to ITS OWN cloned bone', () => {
    const { scene, mesh, bone } = buildRiggedFixture();

    const goodScene = cloneSkeleton(scene) as THREE.Group;
    const goodMesh = goodScene.getObjectByProperty(
      'type',
      'SkinnedMesh'
    ) as THREE.SkinnedMesh;
    const goodBone = goodScene.getObjectByProperty(
      'type',
      'Bone'
    ) as THREE.Bone;

    expect(goodMesh.skeleton).not.toBe(mesh.skeleton);
    expect(goodMesh.skeleton.bones[0]).not.toBe(bone);
    // Rebound to the bone that actually lives in the CLONE's own tree.
    expect(goodMesh.skeleton.bones[0]).toBe(goodBone);
  });

  it("world-position consequence: the naive clone's driving bone never follows its own scene; cloneSkeleton's does", () => {
    // Two independent fixtures — one clone method exercised on each — so
    // repositioning one scene can never leak into the other's assertion.
    const naive = buildRiggedFixture();
    const badScene = naive.scene.clone(true);
    const badMesh = badScene.getObjectByProperty(
      'type',
      'SkinnedMesh'
    ) as THREE.SkinnedMesh;
    badScene.position.set(10, 0, 5);
    badScene.updateMatrixWorld(true);
    const badBonePos = new THREE.Vector3().setFromMatrixPosition(
      badMesh.skeleton.bones[0].matrixWorld
    );
    // BUG (pre-fix, real symptom): the skinning-driving bone is the
    // ORIGINAL, never-repositioned bone — moving badScene does nothing to
    // it. It stays at the fixture's untouched origin, matching exactly
    // what Kirk saw live: every placed monster rendering at the canvas
    // origin regardless of its authored `at:` cell.
    expect(badBonePos.x).toBe(0);
    expect(badBonePos.z).toBe(0);

    const fixed = buildRiggedFixture();
    const goodScene = cloneSkeleton(fixed.scene) as THREE.Group;
    const goodMesh = goodScene.getObjectByProperty(
      'type',
      'SkinnedMesh'
    ) as THREE.SkinnedMesh;
    goodScene.position.set(10, 0, 5);
    goodScene.updateMatrixWorld(true);
    const goodBonePos = new THREE.Vector3().setFromMatrixPosition(
      goodMesh.skeleton.bones[0].matrixWorld
    );
    // FIXED: the driving bone is goodScene's OWN cloned bone, so it
    // correctly tracks the clone's own position — this is what makes a
    // placed monster render at its authored cell instead of the origin.
    expect(goodBonePos.x).toBe(10);
    expect(goodBonePos.z).toBe(5);
  });
});
