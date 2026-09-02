import ReactThreeTestRenderer from '@react-three/test-renderer';
import type { ComponentProps } from 'react';
import * as THREE from 'three';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import type {
  MainHandAttachmentStatus,
  MainHandPresentation,
  MainHandSocket,
} from './mainHandPresentation';
import type {
  OffHandAttachmentStatus,
  OffHandPresentation,
} from './offHandEquipment';
import type {
  SkinnedAccessoryPresentation,
  SkinnedAccessoryStatus,
} from './SkinnedAccessoryAttachment';

const fighterUrl = '/models/synty/characters/fighter.glb';
const failedWeapon = '/models/synty/characters/weapons/fighter-weapon.glb';
const firstWeapon = '/models/synty/characters/weapons/fighter-weapon-a.glb';
const remappedWeapon =
  '/models/synty/characters/weapons/fighter-weapon-remap.glb';
const rejectedAccessory = '/concept/accessories/rejected-hair.glb';
const compatibleAccessory = '/concept/accessories/compatible-hair.glb';
const secondCompatibleAccessory =
  '/concept/accessories/compatible-hair-long.glb';
const socket = {
  bone: 'Hand_R',
  boneUnitMeters: 0.01,
  positionMeters: [-0.0554, 0.1299, 0.0237] as [number, number, number],
  rotationQuaternion: [-0.7071067811865475, 0, 0, 0.7071067811865476] as [
    number,
    number,
    number,
    number,
  ],
  scale: 1,
};
const modularFantasyHeroSocket = {
  bone: 'Hand_R',
  boneUnitMeters: 0.01,
  positionMeters: [-0.113634511828, 0.043524894863, -0.006868128199] as [
    number,
    number,
    number,
  ],
  rotationQuaternion: [
    -0.31697111189640637, -0.4555468694563118, 0.6829896921327775,
    0.47490151020194044,
  ] as [number, number, number, number],
  scale: 1,
} satisfies MainHandSocket;

type Task8ClassCharacterModelProps = ComponentProps<
  typeof ClassCharacterModel
> & {
  mainHandSocketOverride?: MainHandSocket;
  offHandPresentation?: OffHandPresentation;
  onOffHandStatus?: (status: OffHandAttachmentStatus) => void;
};

const Task8ClassCharacterModel = ClassCharacterModel as unknown as (
  props: Task8ClassCharacterModelProps
) => ReturnType<typeof ClassCharacterModel>;

const gltf = vi.hoisted(() => ({
  scenes: new Map<string, THREE.Group>(),
  failed: new Set<string>(),
  requests: [] as string[],
}));

vi.mock('@react-three/drei', () => ({
  useGLTF: (url: string) => {
    gltf.requests.push(url);
    if (gltf.failed.has(url)) throw new Error(`failed ${url}`);

    let scene = gltf.scenes.get(url);
    if (!scene) {
      scene = new THREE.Group();
      scene.name = `cached:${url}`;

      if (url === fighterUrl) {
        const root = new THREE.Group();
        root.name = 'Root';
        const rootBone = new THREE.Bone();
        rootBone.name = 'Root';
        const hand = new THREE.Bone();
        hand.name = 'Hand_R';
        const offHand = new THREE.Bone();
        offHand.name = 'Hand_L';
        rootBone.add(hand, offHand);
        const skeleton = new THREE.Skeleton(
          [rootBone, hand, offHand],
          [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()]
        );
        const body = new THREE.SkinnedMesh(
          new THREE.BoxGeometry(),
          new THREE.MeshStandardMaterial()
        );
        body.name = 'fighter-body';
        body.bind(skeleton, new THREE.Matrix4());
        root.add(rootBone, body);
        scene.add(root);
      } else if (
        url === rejectedAccessory ||
        url === compatibleAccessory ||
        url === secondCompatibleAccessory
      ) {
        const rootBone = new THREE.Bone();
        rootBone.name = 'Root';
        const accessoryBones = [rootBone];
        if (url === rejectedAccessory) {
          const missingBone = new THREE.Bone();
          missingBone.name = 'Tail';
          rootBone.add(missingBone);
          accessoryBones.push(missingBone);
        }
        const skeleton = new THREE.Skeleton(
          accessoryBones,
          accessoryBones.map(() => new THREE.Matrix4())
        );
        const mesh = new THREE.SkinnedMesh(
          new THREE.BoxGeometry(),
          new THREE.MeshStandardMaterial()
        );
        mesh.name = `cached-mesh:${url}`;
        mesh.bind(skeleton, new THREE.Matrix4());
        scene.add(rootBone, mesh);
      } else {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(),
          new THREE.MeshStandardMaterial()
        );
        mesh.name = `cached-mesh:${url}`;
        scene.add(mesh);
      }

      gltf.scenes.set(url, scene);
    }

    return { scene, animations: [] };
  },
  useAnimations: () => ({ actions: {}, names: [] }),
}));

import { ClassCharacterModel } from './ClassCharacterModel';

function presentationFor(weaponUrl: string): MainHandPresentation {
  return {
    ref: 'dnd5e:item:longsword',
    weaponUrl,
    socket,
  };
}

function handBone(
  renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>
): THREE.Bone {
  return renderer.scene.findAll(
    (node) =>
      node.instance instanceof THREE.Bone &&
      (node.instance as THREE.Bone).name === 'Hand_R'
  )[0]!.instance as THREE.Bone;
}

function expectVectorCloseTo(
  actual: readonly number[],
  expected: readonly number[]
) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index]!, 9);
  });
}

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  gltf.scenes.clear();
  gltf.failed.clear();
  gltf.requests.length = 0;
});

it('does not mount an accessory loader when accessories are absent', async () => {
  const renderer = await ReactThreeTestRenderer.create(
    <ClassCharacterModel url={fighterUrl} />
  );

  expect(gltf.requests).toEqual([fighterUrl]);
  expect(
    renderer.scene.findAll(
      (node) =>
        (node.instance as { name?: string } | undefined)?.name ===
        'fighter-body'
    )
  ).toHaveLength(1);

  await renderer.unmount();
});

it('keeps the real body mounted and reports a rejected accessory bind', async () => {
  const statuses: SkinnedAccessoryStatus[] = [];
  const accessories: readonly SkinnedAccessoryPresentation[] = [
    {
      slot: 'scalp',
      styleRef: 'concept:hair:rejected',
      url: rejectedAccessory,
      treatment: {
        baseColorSrgb: '#6B3F26',
        roughness: 0.8,
        metalness: 0.05,
      },
    },
  ];

  const renderer = await ReactThreeTestRenderer.create(
    <ClassCharacterModel
      url={fighterUrl}
      accessories={accessories}
      onAccessoryStatus={(status) => statuses.push(status)}
    />
  );

  expect(gltf.requests).toContain(rejectedAccessory);
  expect(
    renderer.scene.findAll(
      (node) =>
        (node.instance as { name?: string } | undefined)?.name ===
        'fighter-body'
    )
  ).toHaveLength(1);
  expect(statuses.at(-1)).toMatchObject({
    code: 'rejected',
    slot: 'scalp',
    styleRef: 'concept:hair:rejected',
    url: rejectedAccessory,
    message: 'Body Skeleton is missing accessory bones: Tail.',
  });

  await renderer.unmount();
});

it('isolates a rejected scalp from the body and valid facial-hair sibling', async () => {
  const statuses: SkinnedAccessoryStatus[] = [];
  const treatment = {
    baseColorSrgb: '#5A3825',
    roughness: 0.72,
    metalness: 0,
  } as const;
  const renderer = await ReactThreeTestRenderer.create(
    <ClassCharacterModel
      url={fighterUrl}
      accessories={[
        {
          slot: 'scalp',
          styleRef: 'concept:hair:rejected',
          url: rejectedAccessory,
          treatment,
        },
        {
          slot: 'facial-hair',
          styleRef: 'concept:facial-hair:valid',
          url: compatibleAccessory,
          treatment,
        },
      ]}
      onAccessoryStatus={(status) => statuses.push(status)}
    />
  );

  expect(
    renderer.scene.findAll(
      (node) =>
        (node.instance as { name?: string } | undefined)?.name ===
        'fighter-body'
    )
  ).toHaveLength(1);
  expect(
    renderer.scene.findAll(
      (node) =>
        (node.instance as { name?: string } | undefined)?.name ===
        `cached-mesh:${compatibleAccessory}`
    )
  ).toHaveLength(1);
  expect(statuses).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: 'rejected',
        slot: 'scalp',
        styleRef: 'concept:hair:rejected',
      }),
      expect.objectContaining({
        code: 'attached',
        slot: 'facial-hair',
        styleRef: 'concept:facial-hair:valid',
      }),
    ])
  );

  await renderer.unmount();
});

it('applies body-equivalent entity overlays to accessories and restores their persisted base in place', async () => {
  const treatment = {
    baseColorSrgb: '#5A3825',
    roughness: 0.72,
    metalness: 0,
  } as const;
  const accessories: readonly SkinnedAccessoryPresentation[] = [
    {
      slot: 'scalp',
      styleRef: 'modular-fantasy-hero:hair:04',
      url: compatibleAccessory,
      treatment,
    },
  ];
  const renderer = await ReactThreeTestRenderer.create(
    <ClassCharacterModel
      url={fighterUrl}
      accessories={accessories}
      isSelected
    />
  );
  const body = renderer.scene.findAll(
    (node) =>
      (node.instance as { name?: string } | undefined)?.name === 'fighter-body'
  )[0]!.instance as THREE.SkinnedMesh;
  const hair = body.parent!.parent!.getObjectByName(
    `cached-mesh:${compatibleAccessory}`
  ) as THREE.SkinnedMesh;
  const bodyMaterial = body.material as THREE.MeshStandardMaterial;
  const hairMaterial = hair.material as THREE.MeshStandardMaterial;
  const hairUuid = hair.uuid;
  const materialUuid = hairMaterial.uuid;

  expect(bodyMaterial.emissive.getHexString()).toBe('ffffff');
  expect(hairMaterial.emissive.getHexString()).toBe('ffffff');
  expect(hairMaterial.emissiveIntensity).toBe(0.25);

  await renderer.update(
    <ClassCharacterModel url={fighterUrl} accessories={accessories} isGhost />
  );
  expect(body.material).not.toBe(bodyMaterial);
  expect((body.material as THREE.Material).opacity).toBe(0.35);
  expect(hair.material).toBe(hairMaterial);
  expect(hairMaterial.opacity).toBe(0.35);
  expect(hairMaterial.transparent).toBe(true);

  await renderer.update(
    <ClassCharacterModel
      url={fighterUrl}
      accessories={accessories}
      remembered
    />
  );
  const expectedRememberedHair = new THREE.Color(
    treatment.baseColorSrgb
  ).multiply(new THREE.Color('#465366'));
  expect(hairMaterial.color.getHex()).toBe(expectedRememberedHair.getHex());
  expect(hairMaterial.emissive.getHexString()).toBe('111923');
  expect(hairMaterial.opacity).toBe(1);

  await renderer.update(
    <ClassCharacterModel url={fighterUrl} accessories={accessories} />
  );
  expect(hair.uuid).toBe(hairUuid);
  expect(hair.material).toBe(hairMaterial);
  expect(hairMaterial.uuid).toBe(materialUuid);
  expect(hairMaterial.color.getHexString()).toBe('5a3825');
  expect(hairMaterial.roughness).toBe(treatment.roughness);
  expect(hairMaterial.metalness).toBe(treatment.metalness);
  expect(hairMaterial.emissive.getHexString()).toBe('000000');
  expect(hairMaterial.transparent).toBe(false);
  expect(hairMaterial.opacity).toBe(1);

  await renderer.unmount();
});

it('keeps one slot owner across style changes so replacement adds before old cleanup', async () => {
  const treatment = {
    baseColorSrgb: '#5A3825',
    roughness: 0.72,
    metalness: 0,
  } as const;
  const first: SkinnedAccessoryPresentation = {
    slot: 'scalp',
    styleRef: 'modular-fantasy-hero:hair:04',
    url: compatibleAccessory,
    treatment,
  };
  const renderer = await ReactThreeTestRenderer.create(
    <ClassCharacterModel url={fighterUrl} accessories={[first]} />
  );
  const body = renderer.scene.findAll(
    (node) =>
      (node.instance as { name?: string } | undefined)?.name === 'fighter-body'
  )[0]!.instance as THREE.SkinnedMesh;
  const root = body.parent!.parent!;
  const oldHair = root.getObjectByName(
    `cached-mesh:${compatibleAccessory}`
  ) as THREE.SkinnedMesh;
  const oldMaterial = oldHair.material as THREE.MeshStandardMaterial;
  const lifecycle: string[] = [];
  root.addEventListener('childadded', (event) => {
    if (event.child.name.startsWith('cached-mesh:/concept/accessories/')) {
      lifecycle.push(`added:${event.child.name}`);
    }
  });
  root.addEventListener('childremoved', (event) => {
    if (event.child.name.startsWith('cached-mesh:/concept/accessories/')) {
      lifecycle.push(`removed:${event.child.name}`);
    }
  });
  oldMaterial.addEventListener('dispose', () => lifecycle.push('disposed:old'));

  const second: SkinnedAccessoryPresentation = {
    ...first,
    styleRef: 'modular-fantasy-hero:hair:38',
    url: secondCompatibleAccessory,
  };
  await renderer.update(
    <ClassCharacterModel url={fighterUrl} accessories={[second]} />
  );

  expect(lifecycle).toEqual([
    `added:cached-mesh:${secondCompatibleAccessory}`,
    `removed:cached-mesh:${compatibleAccessory}`,
    'disposed:old',
  ]);
  expect(oldHair.parent).toBeNull();
  expect(
    root.getObjectByName(`cached-mesh:${secondCompatibleAccessory}`)
  ).toBeDefined();
  await renderer.unmount();
});

it('mounts main and off-hand assets independently on their exact bones', async () => {
  const offStatuses: OffHandAttachmentStatus[] = [];
  const offHandPresentation: OffHandPresentation = {
    ref: 'dnd5e:item:shield',
    assetUrl: '/models/synty/off-hand/shield.glb',
    assetKind: 'shield',
    socket: {
      bone: 'Hand_L',
      boneUnitMeters: 0.01,
      positionMeters: [0, 0, 0],
      rotationQuaternion: [0, 0, 0, 1],
      scale: 1,
    },
  };
  const renderer = await ReactThreeTestRenderer.create(
    <Task8ClassCharacterModel
      url={fighterUrl}
      mainHandPresentation={presentationFor(firstWeapon)}
      offHandPresentation={offHandPresentation}
      onOffHandStatus={(status) => offStatuses.push(status)}
    />
  );

  const right = renderer.scene.findAll(
    (node) =>
      node.instance instanceof THREE.Bone && node.instance.name === 'Hand_R'
  )[0]!.instance as THREE.Bone;
  const left = renderer.scene.findAll(
    (node) =>
      node.instance instanceof THREE.Bone && node.instance.name === 'Hand_L'
  )[0]!.instance as THREE.Bone;
  expect(right.children).toHaveLength(1);
  expect(left.children).toHaveLength(1);
  expect(offStatuses.at(-1)?.code).toBe('attached');
});

it('cleans both slots when the same exact ref and URL are equipped in both hands', async () => {
  const sharedUrl = '/models/synty/weapons/dagger.glb';
  const main = presentationFor(sharedUrl);
  main.ref = 'dnd5e:item:dagger';
  const off: OffHandPresentation = {
    ref: 'dnd5e:item:dagger',
    assetUrl: sharedUrl,
    assetKind: 'weapon',
    socket: {
      bone: 'Hand_L',
      boneUnitMeters: 0.01,
      positionMeters: [0, 0, 0],
      rotationQuaternion: [0, 0, 0, 1],
      scale: 1,
    },
  };
  const renderer = await ReactThreeTestRenderer.create(
    <Task8ClassCharacterModel
      url={fighterUrl}
      mainHandPresentation={main}
      offHandPresentation={off}
    />
  );
  const bones = (name: string) =>
    renderer.scene.findAll(
      (node) =>
        node.instance instanceof THREE.Bone && node.instance.name === name
    )[0]!.instance as THREE.Bone;
  expect(bones('Hand_R').children).toHaveLength(1);
  expect(bones('Hand_L').children).toHaveLength(1);

  await renderer.update(<Task8ClassCharacterModel url={fighterUrl} />);

  expect(bones('Hand_R').children).toHaveLength(0);
  expect(bones('Hand_L').children).toHaveLength(0);
});

it('keeps the fighter rendered when only its weapon load fails', async () => {
  const statuses: MainHandAttachmentStatus[] = [];
  gltf.failed.add(failedWeapon);

  const renderer = await ReactThreeTestRenderer.create(
    <ClassCharacterModel
      url={fighterUrl}
      mainHandPresentation={presentationFor(failedWeapon)}
      onMainHandStatus={(status) => statuses.push(status)}
    />
  );

  expect(
    renderer.scene.findAll(
      (node) =>
        (node.instance as { name?: string } | undefined)?.name ===
        'fighter-body'
    )
  ).toHaveLength(1);
  expect(statuses.at(-1)?.code).toBe('asset-load-failed');
});

it('remounts the actual ref+URL attachment path when the ref stays the same', async () => {
  const statuses: MainHandAttachmentStatus[] = [];
  const renderer = await ReactThreeTestRenderer.create(
    <ClassCharacterModel
      url={fighterUrl}
      mainHandPresentation={presentationFor(firstWeapon)}
      onMainHandStatus={(status) => statuses.push(status)}
    />
  );

  const hand = handBone(renderer);
  const firstClone = hand.children[0]!;

  expect(
    firstClone.getObjectByName(`cached-mesh:${firstWeapon}`)
  ).toBeDefined();
  expect(gltf.scenes.get(firstWeapon)?.parent).toBeNull();

  await renderer.update(
    <ClassCharacterModel
      url={fighterUrl}
      mainHandPresentation={presentationFor(remappedWeapon)}
      onMainHandStatus={(status) => statuses.push(status)}
    />
  );

  const remappedClone = hand.children[0]!;
  expect(hand.children).toHaveLength(1);
  expect(remappedClone).not.toBe(firstClone);
  expect(firstClone.parent).toBeNull();
  expect(
    remappedClone.getObjectByName(`cached-mesh:${remappedWeapon}`)
  ).toBeDefined();
  expect(
    remappedClone.getObjectByName(`cached-mesh:${firstWeapon}`)
  ).toBeUndefined();
  expect(gltf.scenes.get(firstWeapon)?.parent).toBeNull();
  expect(gltf.scenes.get(remappedWeapon)?.parent).toBeNull();
  expect(statuses.at(-1)).toMatchObject({
    code: 'attached',
    ref: 'dnd5e:item:longsword',
    weaponUrl: remappedWeapon,
  });
});

it('attaches the clone at the override socket and leaves the input presentation unchanged', async () => {
  const mainHandPresentation = presentationFor(firstWeapon);
  const originalPresentation = {
    ref: mainHandPresentation.ref,
    weaponUrl: mainHandPresentation.weaponUrl,
    socket: {
      bone: mainHandPresentation.socket.bone,
      boneUnitMeters: mainHandPresentation.socket.boneUnitMeters,
      positionMeters: [...mainHandPresentation.socket.positionMeters] as [
        number,
        number,
        number,
      ],
      rotationQuaternion: [
        ...mainHandPresentation.socket.rotationQuaternion,
      ] as [number, number, number, number],
      scale: mainHandPresentation.socket.scale,
    },
  } satisfies MainHandPresentation;

  const renderer = await ReactThreeTestRenderer.create(
    <Task8ClassCharacterModel
      url={fighterUrl}
      mainHandPresentation={mainHandPresentation}
      mainHandSocketOverride={modularFantasyHeroSocket}
    />
  );

  const attachedClone = handBone(renderer).children[0]!;
  const unitsPerMeter = 1 / modularFantasyHeroSocket.boneUnitMeters;

  expectVectorCloseTo(attachedClone.position.toArray(), [
    modularFantasyHeroSocket.positionMeters[0] * unitsPerMeter,
    modularFantasyHeroSocket.positionMeters[1] * unitsPerMeter,
    modularFantasyHeroSocket.positionMeters[2] * unitsPerMeter,
  ]);
  expectVectorCloseTo(attachedClone.quaternion.toArray(), [
    ...modularFantasyHeroSocket.rotationQuaternion,
  ]);
  expectVectorCloseTo(attachedClone.scale.toArray(), [
    modularFantasyHeroSocket.scale * unitsPerMeter,
    modularFantasyHeroSocket.scale * unitsPerMeter,
    modularFantasyHeroSocket.scale * unitsPerMeter,
  ]);
  expect(mainHandPresentation).toEqual(originalPresentation);
  expect(mainHandPresentation.socket).toBe(socket);
});
