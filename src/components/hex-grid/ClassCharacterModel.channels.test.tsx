import { ActivityCharacterModel } from '@/npc-activities/ActivityCharacterModel';
import type { NpcActivityProfile } from '@/npc-activities/activityTypes';
import type { MaterialChannelTreatment } from '@/rendering/materialChannelMaterials';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { StrictMode, useMemo } from 'react';
import * as THREE from 'three';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { ClassCharacterModel } from './ClassCharacterModel';

const loaded = vi.hoisted(() => ({
  scenes: new Map<string, THREE.Group>(),
  animations: [] as THREE.AnimationClip[],
  activityClips: [] as THREE.AnimationClip[],
}));
vi.mock('@react-three/drei', () => ({
  useGLTF: (url: string) => ({
    scene: loaded.scenes.get(url),
    animations:
      url === '/downed.glb'
        ? []
        : url === '/activities.glb'
          ? loaded.activityClips
          : loaded.animations,
  }),
  useAnimations: (clips: THREE.AnimationClip[], root: THREE.Object3D) =>
    useMemo(() => {
      const mixer = new THREE.AnimationMixer(root);
      return {
        mixer,
        names: clips.map((clip) => clip.name),
        actions: Object.fromEntries(
          clips.map((clip) => [clip.name, mixer.clipAction(clip)])
        ),
      };
    }, [clips, root]),
}));
beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});
let source: THREE.MeshStandardMaterial;
beforeEach(() => {
  loaded.scenes.clear();
  loaded.animations = [new THREE.AnimationClip('Idle_Relaxed', 1, [])];
  loaded.activityClips = [new THREE.AnimationClip('ActivityIdle', 1, [])];
  source = new THREE.MeshStandardMaterial();
  source.name = 'Authored';
  source.normalMap = new THREE.Texture();
  source.emissiveMap = new THREE.Texture();
  source.normalScale.set(-1, 0.6);
  source.emissive.setRGB(0.1, 0.2, 0.3);
  source.emissiveIntensity = 3;
  for (const [url, name] of [
    ['/standing.glb', 'Body'],
    ['/downed.glb', 'FallenBody'],
  ]) {
    const root = new THREE.Group();
    const bone = new THREE.Bone();
    bone.name = 'Root';
    const mesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(), source);
    mesh.name = name;
    mesh.bind(new THREE.Skeleton([bone]), new THREE.Matrix4());
    root.add(bone, mesh);
    loaded.scenes.set(url, root);
  }
});
function treatment(downed = false): MaterialChannelTreatment {
  const identity = {
    assetRef: 'dnd5e:npcs:test:body',
    representation: downed ? ('downed' as const) : ('standing' as const),
    glbSha256: (downed ? 'b' : 'a').repeat(64),
  };
  return {
    ...identity,
    binding: {
      ...identity,
      targets: [
        {
          id: 'body',
          label: 'Body',
          selectors: [
            { node: downed ? 'FallenBody' : 'Body', material: 'Authored' },
          ],
          normal: { kind: 'adjustable', minMultiplier: 0.5, maxMultiplier: 2 },
          emissive: {
            kind: 'adjustable',
            minMultiplier: 0.5,
            maxMultiplier: 2,
          },
        },
      ],
    },
    adjustments: [
      {
        targetId: 'body',
        normal: { mode: 'scale', multiplier: 0.5 },
        emissive: { mode: 'scale', multiplier: 2 },
      },
    ],
  };
}
const meshOf = (
  renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>,
  name = 'Body'
) => {
  const found = renderer.scene.findAll((node) => node.instance?.name === name);
  expect(found).toHaveLength(1);
  return found[0].instance as THREE.SkinnedMesh<
    THREE.BufferGeometry,
    THREE.MeshStandardMaterial
  >;
};
const material = (
  renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>,
  name = 'Body'
) => meshOf(renderer, name).material;

it('keeps the NPC material owner stable while restoring channel defaults after overlays', async () => {
  const channels = treatment();
  const render = (
    value?: MaterialChannelTreatment,
    selected = false,
    remembered = false
  ) => (
    <StrictMode>
      <ClassCharacterModel
        url="/standing.glb"
        materialChannelTreatment={value}
        isSelected={selected}
        remembered={remembered}
      />
    </StrictMode>
  );
  const renderer = await ReactThreeTestRenderer.create(render(channels));
  const owned = material(renderer);
  const body = meshOf(renderer);
  expect(owned.normalScale.toArray()).toEqual([-0.5, 0.3]);
  expect(owned.emissiveIntensity).toBe(6);
  expect(owned.emissive.toArray()).toEqual(source.emissive.toArray());
  const dispose = vi.spyOn(owned, 'dispose');
  for (const [selected, remembered] of [
    [true, false],
    [false, true],
    [false, false],
  ]) {
    await renderer.update(render(channels, selected, remembered));
    expect(material(renderer)).toBe(owned);
    expect(meshOf(renderer)).toBe(body);
    expect(owned.normalScale.toArray()).toEqual([-0.5, 0.3]);
  }
  expect(owned.emissiveIntensity).toBe(6);
  expect(owned.emissive.toArray()).toEqual(source.emissive.toArray());
  await renderer.update(
    render({
      ...channels,
      adjustments: [
        {
          targetId: 'body',
          normal: { mode: 'off' },
          emissive: { mode: 'off' },
        },
      ],
    })
  );
  expect(owned.normalScale.toArray()).toEqual([0, 0]);
  expect(owned.emissiveIntensity).toBe(0);
  await renderer.update(render());
  expect(material(renderer)).toBe(owned);
  expect(owned.normalScale.toArray()).toEqual([-1, 0.6]);
  expect(owned.emissiveIntensity).toBe(3);
  expect(owned.normalMap).toBe(source.normalMap);
  expect(owned.emissiveMap).toBe(source.emissiveMap);
  expect(dispose).not.toHaveBeenCalled();
  await renderer.unmount();
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(source.normalScale.toArray()).toEqual([-1, 0.6]);
  expect(source.emissiveIntensity).toBe(3);
});

it('passes body treatment through the existing activity adapter and changes representation safely', async () => {
  const renderer = await ReactThreeTestRenderer.create(
    <ActivityCharacterModel
      key="/standing.glb"
      url="/standing.glb"
      materialChannelTreatment={treatment()}
    />
  );
  expect(material(renderer).normalScale.toArray()).toEqual([-0.5, 0.3]);
  await renderer.update(
    <ActivityCharacterModel
      key="/downed.glb"
      url="/downed.glb"
      isDownedVariant
      materialChannelTreatment={treatment(true)}
    />
  );
  expect(material(renderer, 'FallenBody').normalScale.toArray()).toEqual([
    -0.5, 0.3,
  ]);
  expect(material(renderer, 'FallenBody').emissiveIntensity).toBe(6);
  expect(source.normalScale.toArray()).toEqual([-1, 0.6]);
  await renderer.unmount();
});

it('does not adjust another body using the same cached GLTF', async () => {
  const renderer = await ReactThreeTestRenderer.create(
    <>
      <ClassCharacterModel
        url="/standing.glb"
        materialChannelTreatment={treatment()}
      />
      <ClassCharacterModel url="/standing.glb" />
    </>
  );
  const bodies = renderer.scene.findAll(
    (node) => node.instance?.name === 'Body'
  );
  const materials = bodies.map(
    ({ instance }) =>
      (instance as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>)
        .material
  );
  expect(materials[0].normalScale.toArray()).toEqual([-0.5, 0.3]);
  expect(materials[1].normalScale.toArray()).toEqual([-1, 0.6]);
  expect(materials[0]).not.toBe(materials[1]);
  await renderer.unmount();
});

it('keeps channel treatment when the activity adapter loads a provider clip library', async () => {
  const idle = {
    label: 'Idle',
    entryPose: 'standing',
    exitPose: 'standing',
    enter: null,
    sustain: 'ActivityIdle',
    exit: null,
    leaveAt: 'any-time' as const,
    moving: false,
  };
  const profile: NpcActivityProfile = {
    schemaVersion: 1,
    id: 'test:activities',
    jointCount: 1,
    library: {
      url: '/activities.glb',
      sha256: 'c'.repeat(64),
      clips: ['ActivityIdle'],
    },
    defaultActivityRef: 'test:idle',
    walkActivityRef: 'test:walk',
    activities: {
      'test:idle': idle,
      'test:walk': { ...idle, label: 'Walk', moving: true },
    },
    poseBridges: [],
    appearances: [
      { assetRef: 'dnd5e:npcs:test:body', standingSha256: 'a'.repeat(64) },
    ],
  };
  const renderer = await ReactThreeTestRenderer.create(
    <ActivityCharacterModel
      url="/standing.glb"
      profile={profile}
      materialChannelTreatment={treatment()}
    />
  );
  expect(material(renderer).normalScale.toArray()).toEqual([-0.5, 0.3]);
  expect(material(renderer).emissiveIntensity).toBe(6);
  await renderer.unmount();
});

it('resolves a multi-primitive source before the stable owner splits its materials', async () => {
  const root = loaded.scenes.get('/standing.glb')!;
  const first = root.getObjectByName('Body') as THREE.SkinnedMesh;
  first.name = 'Torso';
  const second = new THREE.SkinnedMesh(first.geometry, source);
  second.name = 'Head';
  second.bind(first.skeleton, first.bindMatrix);
  const group = new THREE.Group();
  group.name = 'Body';
  group.add(first, second);
  root.add(group);
  const renderer = await ReactThreeTestRenderer.create(
    <ClassCharacterModel
      url="/standing.glb"
      materialChannelTreatment={treatment()}
    />
  );
  expect(material(renderer, 'Torso').normalScale.toArray()).toEqual([
    -0.5, 0.3,
  ]);
  expect(material(renderer, 'Head').normalScale.toArray()).toEqual([-0.5, 0.3]);
  expect(material(renderer, 'Torso')).not.toBe(material(renderer, 'Head'));
  expect(source.normalScale.toArray()).toEqual([-1, 0.6]);
  await renderer.unmount();
});
