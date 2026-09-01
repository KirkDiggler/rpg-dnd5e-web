import ReactThreeTestRenderer from '@react-three/test-renderer';
import { act, render } from '@testing-library/react';
import { StrictMode } from 'react';
import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RuntimeSurfaceTreatment } from './runtimeSurfaceTreatment';
import type {
  SkinnedAccessoryPresentation,
  SkinnedAccessoryStatus,
} from './SkinnedAccessoryAttachment';

const gltf = vi.hoisted(() => ({
  scenes: new Map<string, THREE.Group>(),
  errors: new Map<string, Error>(),
  requests: [] as string[],
  pending: new Map<string, { readonly promise: Promise<void> }>(),
}));

const renderState = vi.hoisted(() => ({
  invalidate: vi.fn(),
}));

vi.mock('@react-three/drei', () => ({
  useGLTF: (url: string) => {
    gltf.requests.push(url);
    const pending = gltf.pending.get(url);
    if (pending) throw pending.promise;

    const error = gltf.errors.get(url);
    if (error) throw error;

    const scene = gltf.scenes.get(url);
    if (!scene) throw new Error(`missing synthetic GLTF ${url}`);
    return { scene };
  },
}));

vi.mock('@react-three/fiber', async () => {
  const actual =
    await vi.importActual<typeof import('@react-three/fiber')>(
      '@react-three/fiber'
    );
  return {
    ...actual,
    useThree: (selector: (state: typeof renderState) => unknown) =>
      selector(renderState),
  };
});

import { SkinnedAccessoryAttachment } from './SkinnedAccessoryAttachment';

const FIRST_URL = '/concept/accessories/hair-short.glb';
const SECOND_URL = '/concept/accessories/hair-long.glb';
const REJECTED_URL = '/concept/accessories/hair-rejected.glb';
const LOAD_REJECTED_URL = '/concept/accessories/hair-load-rejected.glb';
const TREATMENT = {
  baseColorSrgb: '#6B3F26',
  roughness: 0.8,
  metalness: 0.05,
} as const satisfies RuntimeSurfaceTreatment;

interface Rig {
  readonly root: THREE.Group;
  readonly skeleton: THREE.Skeleton;
  readonly mesh: THREE.SkinnedMesh;
  readonly material: THREE.MeshStandardMaterial;
  readonly geometry: THREE.BufferGeometry;
}

function makeBones(names: readonly string[]): THREE.Bone[] {
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

function makeRig(name: string, boneNames: readonly string[]): Rig {
  const root = new THREE.Group();
  const bones = makeBones(boneNames);
  const skeleton = new THREE.Skeleton(
    bones,
    bones.map(() => new THREE.Matrix4())
  );
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff' });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = name;
  mesh.bind(skeleton, new THREE.Matrix4());
  root.add(bones[0]!, mesh);
  return { root, skeleton, mesh, material, geometry };
}

function makeBody(): Rig {
  return makeRig('body', ['Root', 'Spine', 'Head']);
}

function makeAccessory(url: string, boneNames = ['Root', 'Head']): Rig {
  const accessory = makeRig(`accessory:${url}`, boneNames);
  gltf.scenes.set(url, accessory.root);
  return accessory;
}

function presentation(
  url: string,
  styleRef = 'concept:hair:short',
  treatment: RuntimeSurfaceTreatment = TREATMENT
): SkinnedAccessoryPresentation {
  return { slot: 'scalp', styleRef, url, treatment };
}

function suspend(url: string): () => void {
  let settle!: () => void;
  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });
  const resolve = () => {
    gltf.pending.delete(url);
    settle();
  };
  gltf.pending.set(url, { promise });
  return resolve;
}

function suspendThenReject(url: string): (error: Error) => void {
  let settle!: (error: Error) => void;
  const promise = new Promise<void>((_resolve, reject) => {
    settle = reject;
  });
  const reject = (error: Error) => {
    gltf.pending.delete(url);
    gltf.errors.set(url, error);
    settle(error);
  };
  gltf.pending.set(url, { promise });
  return reject;
}

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  gltf.scenes.clear();
  gltf.errors.clear();
  gltf.requests.length = 0;
  gltf.pending.clear();
  renderState.invalidate = vi.fn();
});

describe('SkinnedAccessoryAttachment', () => {
  it('reports loading then attaches one exact rebound mesh', async () => {
    const body = makeBody();
    const sourceAccessory = makeAccessory(FIRST_URL);
    const statuses: SkinnedAccessoryStatus[] = [];
    const accessory = presentation(FIRST_URL);

    const renderer = await ReactThreeTestRenderer.create(
      <SkinnedAccessoryAttachment
        characterRoot={body.root}
        presentation={accessory}
        onStatus={(status) => statuses.push(status)}
      />
    );

    const attached = body.root.children.filter(
      (child) => child.name === `accessory:${FIRST_URL}`
    );
    expect(attached).toHaveLength(1);
    expect(attached[0]).toBeInstanceOf(THREE.SkinnedMesh);
    expect(attached[0]!.parent).toBe(body.root);
    expect(gltf.scenes.get(FIRST_URL)!.parent).toBeNull();
    expect(statuses.map((status) => status.code)).toEqual([
      'loading',
      'attached',
    ]);
    expect(statuses.at(-1)).toMatchObject({
      code: 'attached',
      slot: 'scalp',
      styleRef: accessory.styleRef,
      url: FIRST_URL,
      bodyRootBoneUuid: body.skeleton.bones[0]!.uuid,
      mappedBoneNames: ['Root', 'Head'],
      mappedBoneUuids: [
        body.skeleton.bones[0]!.uuid,
        body.skeleton.bones[2]!.uuid,
      ],
      instanceMaterials: [
        {
          baseColorSrgb: TREATMENT.baseColorSrgb,
          roughness: TREATMENT.roughness,
          metalness: TREATMENT.metalness,
        },
      ],
    });
    const attachedStatus = statuses.at(-1);
    expect(attachedStatus?.code).toBe('attached');
    if (attachedStatus?.code !== 'attached') {
      throw new Error('expected attached material evidence');
    }
    const mountedMaterial = (attached[0] as THREE.SkinnedMesh)
      .material as THREE.MeshStandardMaterial;
    expect(attachedStatus.instanceMaterials[0]?.materialUuid).toBe(
      mountedMaterial.uuid
    );
    expect(attachedStatus.instanceMaterials[0]?.materialUuid).not.toBe(
      sourceAccessory.material.uuid
    );
    expect(renderState.invalidate).toHaveBeenCalledOnce();

    await renderer.unmount();
  });

  it('publishes and mounts a pending attachment after it resolves in StrictMode', async () => {
    const body = makeBody();
    makeAccessory(FIRST_URL);
    const resolveLoad = suspend(FIRST_URL);
    const statuses: SkinnedAccessoryStatus[] = [];
    const accessory = presentation(FIRST_URL);

    const { unmount } = render(
      <StrictMode>
        <SkinnedAccessoryAttachment
          characterRoot={body.root}
          presentation={accessory}
          onStatus={(status) => statuses.push(status)}
        />
      </StrictMode>
    );

    expect(statuses.at(-1)?.code).toBe('loading');
    expect(body.root.getObjectByName(`accessory:${FIRST_URL}`)).toBeUndefined();
    renderState.invalidate.mockClear();

    await act(async () => {
      resolveLoad();
      await Promise.resolve();
    });

    expect(statuses.at(-1)).toMatchObject({
      code: 'attached',
      slot: 'scalp',
      styleRef: accessory.styleRef,
      url: FIRST_URL,
    });
    expect(body.mesh.parent).toBe(body.root);
    expect(body.root.getObjectByName(`accessory:${FIRST_URL}`)).toBeDefined();
    expect(renderState.invalidate).toHaveBeenCalled();

    unmount();
  });

  it('keeps the mounted identities stable across a StrictMode treatment update', async () => {
    const body = makeBody();
    makeAccessory(FIRST_URL);
    const statuses: SkinnedAccessoryStatus[] = [];
    const first = presentation(FIRST_URL);
    const { rerender, unmount } = render(
      <StrictMode>
        <SkinnedAccessoryAttachment
          characterRoot={body.root}
          presentation={first}
          onStatus={(status) => statuses.push(status)}
        />
      </StrictMode>
    );
    await act(async () => {
      await Promise.resolve();
    });
    const mountedMesh = body.root.getObjectByName(
      `accessory:${FIRST_URL}`
    ) as THREE.SkinnedMesh;
    const mountedMaterial = mountedMesh.material as THREE.MeshStandardMaterial;
    expect(statuses.at(-1)).toMatchObject({
      code: 'attached',
      meshUuid: mountedMesh.uuid,
      instanceMaterials: [{ materialUuid: mountedMaterial.uuid }],
    });
    statuses.length = 0;

    rerender(
      <StrictMode>
        <SkinnedAccessoryAttachment
          characterRoot={body.root}
          presentation={presentation(FIRST_URL, first.styleRef, {
            ...TREATMENT,
            baseColorSrgb: '#D8B36A',
          })}
          onStatus={(status) => statuses.push(status)}
        />
      </StrictMode>
    );

    const updatedMesh = body.root.getObjectByName(
      `accessory:${FIRST_URL}`
    ) as THREE.SkinnedMesh;
    expect(updatedMesh).toBe(mountedMesh);
    expect(updatedMesh.material).toBe(mountedMaterial);
    expect(statuses.map((status) => status.code)).toEqual(['attached']);
    expect(statuses[0]).toMatchObject({
      code: 'attached',
      meshUuid: mountedMesh.uuid,
      instanceMaterials: [{ materialUuid: mountedMaterial.uuid }],
    });

    unmount();
  });

  it('publishes and invalidates a pending load rejection in StrictMode without mounting', async () => {
    const body = makeBody();
    const rejectLoad = suspendThenReject(LOAD_REJECTED_URL);
    const statuses: SkinnedAccessoryStatus[] = [];
    const accessory = presentation(
      LOAD_REJECTED_URL,
      'concept:hair:load-rejected'
    );
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { unmount } = render(
      <StrictMode>
        <SkinnedAccessoryAttachment
          characterRoot={body.root}
          presentation={accessory}
          onStatus={(status) => statuses.push(status)}
        />
      </StrictMode>
    );

    expect(statuses.at(-1)?.code).toBe('loading');
    renderState.invalidate.mockClear();

    await act(async () => {
      rejectLoad(new Error('pending accessory load failed'));
      await Promise.resolve();
    });

    expect(statuses.at(-1)).toEqual({
      code: 'rejected',
      slot: 'scalp',
      styleRef: accessory.styleRef,
      url: LOAD_REJECTED_URL,
      message: 'pending accessory load failed',
    });
    expect(body.mesh.parent).toBe(body.root);
    expect(body.root.children).toEqual([body.skeleton.bones[0], body.mesh]);
    expect(renderState.invalidate).toHaveBeenCalled();

    consoleError.mockRestore();
    unmount();
  });

  it('ignores a stale suspended style after a new presentation attaches', async () => {
    const body = makeBody();
    makeAccessory(FIRST_URL);
    makeAccessory(SECOND_URL);
    const resolveFirst = suspend(FIRST_URL);
    const statuses: SkinnedAccessoryStatus[] = [];
    const first = presentation(FIRST_URL);

    const renderer = await ReactThreeTestRenderer.create(
      <SkinnedAccessoryAttachment
        key={`${first.slot}|${first.styleRef}|${first.url}`}
        characterRoot={body.root}
        presentation={first}
        onStatus={(status) => statuses.push(status)}
      />
    );
    expect(statuses.map((status) => status.code)).toEqual(['loading']);

    const second = presentation(SECOND_URL, 'concept:hair:long');
    await renderer.update(
      <SkinnedAccessoryAttachment
        key={`${second.slot}|${second.styleRef}|${second.url}`}
        characterRoot={body.root}
        presentation={second}
        onStatus={(status) => statuses.push(status)}
      />
    );

    expect(statuses.map((status) => status.code)).toEqual([
      'loading',
      'loading',
      'attached',
    ]);
    expect(statuses.at(-1)).toMatchObject({
      code: 'attached',
      styleRef: second.styleRef,
      url: SECOND_URL,
    });

    await ReactThreeTestRenderer.act(async () => {
      resolveFirst();
      await Promise.resolve();
    });

    expect(statuses).toHaveLength(3);
    expect(body.root.getObjectByName(`accessory:${FIRST_URL}`)).toBeUndefined();
    expect(body.root.getObjectByName(`accessory:${SECOND_URL}`)).toBeDefined();

    await renderer.unmount();
  });

  it('removes and disposes the old style before mounting its replacement', async () => {
    const body = makeBody();
    makeAccessory(FIRST_URL);
    makeAccessory(SECOND_URL);
    const lifecycle: string[] = [];
    body.root.addEventListener('childadded', (event) => {
      const child = event.child;
      if (child.name.startsWith('accessory:')) {
        lifecycle.push(`added:${child.name}`);
      }
    });
    body.root.addEventListener('childremoved', (event) => {
      const child = event.child;
      if (child.name.startsWith('accessory:')) {
        lifecycle.push(`removed:${child.name}`);
      }
    });

    const first = presentation(FIRST_URL);
    const renderer = await ReactThreeTestRenderer.create(
      <SkinnedAccessoryAttachment
        key={`${first.slot}|${first.styleRef}|${first.url}`}
        characterRoot={body.root}
        presentation={first}
      />
    );
    const oldMesh = body.root.getObjectByName(
      `accessory:${FIRST_URL}`
    ) as THREE.SkinnedMesh;
    const oldMaterial = oldMesh.material as THREE.MeshStandardMaterial;
    oldMaterial.addEventListener('dispose', () => {
      lifecycle.push('disposed:first-material');
    });
    lifecycle.length = 0;

    const second = presentation(SECOND_URL, 'concept:hair:long');
    await renderer.update(
      <SkinnedAccessoryAttachment
        key={`${second.slot}|${second.styleRef}|${second.url}`}
        characterRoot={body.root}
        presentation={second}
      />
    );

    expect(lifecycle).toEqual([
      `removed:accessory:${FIRST_URL}`,
      'disposed:first-material',
      `added:accessory:${SECOND_URL}`,
    ]);
    expect(oldMesh.parent).toBeNull();
    expect(body.root.getObjectByName(`accessory:${FIRST_URL}`)).toBeUndefined();
    expect(body.root.getObjectByName(`accessory:${SECOND_URL}`)).toBeDefined();
    expect(body.root.children).toHaveLength(3);

    await renderer.unmount();
  });

  it('rejects an incompatible bind without disturbing the body', async () => {
    const body = makeBody();
    makeAccessory(REJECTED_URL, ['Root', 'Tail']);
    const statuses: SkinnedAccessoryStatus[] = [];

    const renderer = await ReactThreeTestRenderer.create(
      <SkinnedAccessoryAttachment
        characterRoot={body.root}
        presentation={presentation(REJECTED_URL, 'concept:hair:rejected')}
        onStatus={(status) => statuses.push(status)}
      />
    );

    expect(body.mesh.parent).toBe(body.root);
    expect(body.root.children).toEqual([body.skeleton.bones[0], body.mesh]);
    expect(statuses.at(-1)).toMatchObject({
      code: 'rejected',
      slot: 'scalp',
      styleRef: 'concept:hair:rejected',
      url: REJECTED_URL,
      message: 'Body Skeleton is missing accessory bones: Tail.',
    });
    expect(renderState.invalidate).toHaveBeenCalledOnce();

    await renderer.unmount();
  });

  it('unmounts the mesh and disposes only owned runtime resources', async () => {
    const body = makeBody();
    const accessory = makeAccessory(FIRST_URL);
    const bodySkeletonDispose = vi.spyOn(body.skeleton, 'dispose');
    const bodyMaterialDispose = vi.spyOn(body.material, 'dispose');
    const bodyGeometryDispose = vi.spyOn(body.geometry, 'dispose');
    const sourceSkeletonDispose = vi.spyOn(accessory.skeleton, 'dispose');
    const sourceMaterialDispose = vi.spyOn(accessory.material, 'dispose');
    const sourceGeometryDispose = vi.spyOn(accessory.geometry, 'dispose');

    const renderer = await ReactThreeTestRenderer.create(
      <SkinnedAccessoryAttachment
        characterRoot={body.root}
        presentation={presentation(FIRST_URL)}
      />
    );
    const attached = body.root.getObjectByName(
      `accessory:${FIRST_URL}`
    ) as THREE.SkinnedMesh;
    const clonedMaterial = attached.material as THREE.MeshStandardMaterial;
    const clonedMaterialDispose = vi.spyOn(clonedMaterial, 'dispose');
    const ownedSkeleton = attached.skeleton;
    const ownedSkeletonDispose = vi.spyOn(ownedSkeleton, 'dispose');
    expect(ownedSkeleton).not.toBe(body.skeleton);

    renderState.invalidate.mockClear();
    await renderer.unmount();

    expect(attached.parent).toBeNull();
    expect(clonedMaterialDispose).toHaveBeenCalledOnce();
    expect(ownedSkeletonDispose).toHaveBeenCalledOnce();
    expect(bodySkeletonDispose).not.toHaveBeenCalled();
    expect(bodyMaterialDispose).not.toHaveBeenCalled();
    expect(bodyGeometryDispose).not.toHaveBeenCalled();
    expect(sourceSkeletonDispose).not.toHaveBeenCalled();
    expect(sourceMaterialDispose).not.toHaveBeenCalled();
    expect(sourceGeometryDispose).not.toHaveBeenCalled();
    expect(renderState.invalidate).toHaveBeenCalledOnce();
  });

  it('never disposes the reused body Skeleton for a full ordered skin', async () => {
    const body = makeBody();
    makeAccessory(FIRST_URL, ['Root', 'Spine', 'Head']);
    const bodySkeletonDispose = vi.spyOn(body.skeleton, 'dispose');

    const renderer = await ReactThreeTestRenderer.create(
      <SkinnedAccessoryAttachment
        characterRoot={body.root}
        presentation={presentation(FIRST_URL)}
      />
    );
    const attached = body.root.getObjectByName(
      `accessory:${FIRST_URL}`
    ) as THREE.SkinnedMesh;
    expect(attached.skeleton).toBe(body.skeleton);

    await renderer.unmount();

    expect(bodySkeletonDispose).not.toHaveBeenCalled();
  });

  it('updates treatment in place without a loading or attachment lifecycle pop', async () => {
    const body = makeBody();
    const sourceAccessory = makeAccessory(FIRST_URL);
    const sourceClone = vi.spyOn(sourceAccessory.root, 'clone');
    const bind = vi.spyOn(THREE.SkinnedMesh.prototype, 'bind');
    const statuses: SkinnedAccessoryStatus[] = [];
    const lifecycle: string[] = [];
    body.root.addEventListener('childadded', (event) => {
      if (event.child.name.startsWith('accessory:')) {
        lifecycle.push(`added:${event.child.uuid}`);
      }
    });
    body.root.addEventListener('childremoved', (event) => {
      if (event.child.name.startsWith('accessory:')) {
        lifecycle.push(`removed:${event.child.uuid}`);
      }
    });

    const first = presentation(FIRST_URL);
    const renderer = await ReactThreeTestRenderer.create(
      <SkinnedAccessoryAttachment
        characterRoot={body.root}
        presentation={first}
        onStatus={(status) => statuses.push(status)}
      />
    );
    const mountedMesh = body.root.getObjectByName(
      `accessory:${FIRST_URL}`
    ) as THREE.SkinnedMesh;
    const mountedMaterial = mountedMesh.material as THREE.MeshStandardMaterial;
    const materialUuid = mountedMaterial.uuid;
    const materialDispose = vi.spyOn(mountedMaterial, 'dispose');
    statuses.length = 0;
    lifecycle.length = 0;
    sourceClone.mockClear();
    bind.mockClear();
    renderState.invalidate.mockClear();
    const updatedInvalidate = vi.fn();
    renderState.invalidate = updatedInvalidate;

    const updatedTreatment = {
      baseColorSrgb: '#D8B36A',
      roughness: 0.33,
      metalness: 0.66,
    } as const satisfies RuntimeSurfaceTreatment;
    const recolored = presentation(FIRST_URL, first.styleRef, updatedTreatment);
    await renderer.update(
      <SkinnedAccessoryAttachment
        characterRoot={body.root}
        presentation={recolored}
        onStatus={(status) => statuses.push(status)}
      />
    );

    const updatedMesh = body.root.getObjectByName(
      `accessory:${FIRST_URL}`
    ) as THREE.SkinnedMesh;
    expect(updatedMesh).toBe(mountedMesh);
    expect(updatedMesh.parent).toBe(body.root);
    expect(updatedMesh.material).toBe(mountedMaterial);
    expect(mountedMaterial.uuid).toBe(materialUuid);
    expect(mountedMaterial.color.getHexString()).toBe('d8b36a');
    expect(mountedMaterial.roughness).toBe(updatedTreatment.roughness);
    expect(mountedMaterial.metalness).toBe(updatedTreatment.metalness);
    expect(statuses.map((status) => status.code)).toEqual(['attached']);
    expect(statuses[0]).toMatchObject({
      code: 'attached',
      meshUuid: mountedMesh.uuid,
      instanceMaterials: [{ materialUuid, ...updatedTreatment }],
    });
    expect(lifecycle).toEqual([]);
    expect(sourceClone).not.toHaveBeenCalled();
    expect(bind).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
    expect(updatedInvalidate).toHaveBeenCalledOnce();

    bind.mockRestore();
    await renderer.unmount();
  });
});
