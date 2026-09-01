// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CHARACTER_CUSTOMIZATION_BODY,
  DEFAULT_FACIAL_HAIR_STYLE_REF,
  DEFAULT_SCALP_STYLE_REF,
  FACIAL_HAIR_OPTIONS,
  SCALP_OPTIONS,
} from '../src/concepts/character-customization/characterCustomizationAssets';
import { CUSTOMIZATION_WEAPON_PRESENTATION } from '../src/concepts/character-customization/characterCustomizationDiagnostics';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const evidenceRoot = new URL(
  '../docs/evidence/877-character-customization-concept/',
  import.meta.url
);
const receiptUrl = new URL('receipt.json', evidenceRoot);
const readmeUrl = new URL('README.md', evidenceRoot);

const bodyMeshes = [
  'Chr_Head_Male_00',
  'Chr_Ear_Ear_01',
  'Chr_Torso_Male_16',
  'Chr_Hips_Male_16',
  'Chr_ArmUpperLeft_Male_16',
  'Chr_ArmUpperRight_Male_16',
  'Chr_ArmLowerLeft_Male_16',
  'Chr_ArmLowerRight_Male_16',
  'Chr_HandLeft_Male_16',
  'Chr_HandRight_Male_16',
  'Chr_LegLeft_Male_16',
  'Chr_LegRight_Male_16',
] as const;

const boneOrder = [
  'Root',
  'Hips',
  'Spine_01',
  'Spine_02',
  'Spine_03',
  'Neck',
  'Head',
  'Eyes',
  'Eyebrows',
  'Head_Attachment',
  'Clavicle_L',
  'Shoulder_L',
  'Elbow_L',
  'Hand_L',
  'Thumb_01',
  'Thumb_02',
  'Thumb_03',
  'IndexFinger_01',
  'IndexFinger_02',
  'IndexFinger_03',
  'IndexFinger_04',
  'Finger_01',
  'Finger_02',
  'Finger_03',
  'Finger_04',
  'Elbow_Attachment_L',
  'Shoulder_Attachment_L',
  'Clavicle_R',
  'Shoulder_R',
  'Elbow_R',
  'Hand_R',
  'Thumb_01.001',
  'Thumb_02.001',
  'Thumb_03.001',
  'IndexFinger_01.001',
  'IndexFinger_02.001',
  'IndexFinger_03.001',
  'IndexFinger_04.001',
  'Finger_01.001',
  'Finger_02.001',
  'Finger_03.001',
  'Finger_04.001',
  'Elbow_Attachment_R',
  'Shoulder_Attachment_R',
  'Back_Attachment',
  'Cape_Attachment_01',
  'Cape_Attachment_02',
  'Cape_Attachment_03',
  'Cape_Attachment_04',
  'Chest_Attachment',
  'UpperLeg_R',
  'LowerLeg_R',
  'Ankle_R',
  'Ball_R',
  'Toes_R',
  'Knee_Attachment_R',
  'UpperLeg_L',
  'LowerLeg_L',
  'Ankle_L',
  'Ball_L',
  'Toes_L',
  'Knee_Attachment_L',
  'Hips_Attachment',
] as const;

const expectedBody = {
  publicPath:
    '/models/synty/concepts/character-customization/dwarf-fighter-body.glb',
  byteSize: 786_668,
  sha256: '8d70f73d57abe0a1bb8ec4b6b45eda27fc7841a12479fe7c745ea0b7020d64f6',
  sourceMeshes: bodyMeshes,
  styleRef: null,
  rigFamily: 'modular-fantasy-hero-v1',
  boneCount: 63,
  animations: ['Idle_Relaxed', 'Walk_Forward'],
} as const;

const expectedScalp = [
  {
    publicPath:
      '/models/synty/concepts/character-customization/scalp/hair-04.glb',
    byteSize: 36_936,
    sha256: 'cc896dc487bf18193ec2dbcd4f289711e45f9b1ecea468a1cb7582af1b154f2b',
    sourceMesh: 'Chr_Hair_04',
    styleRef: 'modular-fantasy-hero:hair:04',
  },
  {
    publicPath:
      '/models/synty/concepts/character-customization/scalp/hair-08.glb',
    byteSize: 40_888,
    sha256: 'a4b091376e152d022aef73021f20130c949c6a91ebd44a3fad6f398b42f19f97',
    sourceMesh: 'Chr_Hair_08',
    styleRef: 'modular-fantasy-hero:hair:08',
  },
  {
    publicPath:
      '/models/synty/concepts/character-customization/scalp/hair-16.glb',
    byteSize: 43_488,
    sha256: 'ff71f18f62e172125be519e800d62f26ff88db5ee25915341ff63f5e1df14f73',
    sourceMesh: 'Chr_Hair_16',
    styleRef: 'modular-fantasy-hero:hair:16',
  },
] as const;

const defaultTreatment = {
  baseColorSrgb: '#5A3825',
  roughness: 0.72,
  metalness: 0,
} as const;
const finalControlledTreatment = {
  baseColorSrgb: '#C02626',
  roughness: 0.25,
  metalness: 1,
} as const;

const expectedFacialHair = [
  {
    publicPath:
      '/models/synty/concepts/character-customization/facial-hair/facial-hair-01.glb',
    byteSize: 55_064,
    sha256: '49ccf51ea94778445fb4b0fe068776d6f8e6a7d37ae76171315baf0a9c970255',
    sourceMesh: 'Chr_FacialHair_Male_01',
    styleRef: 'modular-fantasy-hero:facial-hair:01',
  },
  {
    publicPath:
      '/models/synty/concepts/character-customization/facial-hair/facial-hair-02.glb',
    byteSize: 64_652,
    sha256: 'fab5f63914339fd1c12fd09a9145396906e7da5c378ef6f8f6c37edeb62f7890',
    sourceMesh: 'Chr_FacialHair_Male_02',
    styleRef: 'modular-fantasy-hero:facial-hair:02',
  },
  {
    publicPath:
      '/models/synty/concepts/character-customization/facial-hair/facial-hair-03.glb',
    byteSize: 38_544,
    sha256: 'fd5cc26275a796b45dc3af5da492678ddb18165effc002fc86df02f6859a5108',
    sourceMesh: 'Chr_FacialHair_Male_03',
    styleRef: 'modular-fantasy-hero:facial-hair:03',
  },
] as const;

const expectedHttpAssets = [
  expectedBody,
  ...expectedScalp,
  ...expectedFacialHair,
].map(({ publicPath, byteSize, sha256 }) => ({
  publicPath,
  status: 200,
  byteSize,
  sha256,
}));

const expectedWeaponWitness = {
  styleRef: CUSTOMIZATION_WEAPON_PRESENTATION.ref,
  publicPath: CUSTOMIZATION_WEAPON_PRESENTATION.weaponUrl,
  bone: CUSTOMIZATION_WEAPON_PRESENTATION.socket.bone,
  status: 'attached',
} as const;

const expectedRequiredWalkStates = [
  {
    name: 'alternate-scalp-default-facial-hair-walk',
    fixture: {
      scalp: 'modular-fantasy-hero:hair:08',
      facialHair: 'default',
      treatment: defaultTreatment,
      motion: 'walk',
      view: 'close',
      showWeaponWitness: false,
    },
    current: {
      scalp: {
        styleRef: 'modular-fantasy-hero:hair:08',
        publicPath:
          '/models/synty/concepts/character-customization/scalp/hair-08.glb',
        status: 'attached',
      },
      facialHair: {
        styleRef: 'modular-fantasy-hero:facial-hair:02',
        publicPath:
          '/models/synty/concepts/character-customization/facial-hair/facial-hair-02.glb',
        status: 'attached',
      },
    },
    reference: {
      scalp: {
        styleRef: 'modular-fantasy-hero:hair:04',
        publicPath:
          '/models/synty/concepts/character-customization/scalp/hair-04.glb',
        status: 'attached',
      },
      facialHair: {
        styleRef: 'modular-fantasy-hero:facial-hair:02',
        publicPath:
          '/models/synty/concepts/character-customization/facial-hair/facial-hair-02.glb',
        status: 'attached',
      },
    },
    animation: 'Walk_Forward',
    mappedBones: 63,
    mountedSourceArmatures: 0,
    controlledTreatment: defaultTreatment,
    referenceTreatment: defaultTreatment,
    screenshot: 'walk-alternate-scalp-default-facial-hair.png',
  },
  {
    name: 'default-scalp-alternate-facial-hair-walk',
    fixture: {
      scalp: 'default',
      facialHair: 'modular-fantasy-hero:facial-hair:03',
      treatment: defaultTreatment,
      motion: 'walk',
      view: 'close',
      showWeaponWitness: false,
    },
    current: {
      scalp: {
        styleRef: 'modular-fantasy-hero:hair:04',
        publicPath:
          '/models/synty/concepts/character-customization/scalp/hair-04.glb',
        status: 'attached',
      },
      facialHair: {
        styleRef: 'modular-fantasy-hero:facial-hair:03',
        publicPath:
          '/models/synty/concepts/character-customization/facial-hair/facial-hair-03.glb',
        status: 'attached',
      },
    },
    reference: {
      scalp: {
        styleRef: 'modular-fantasy-hero:hair:04',
        publicPath:
          '/models/synty/concepts/character-customization/scalp/hair-04.glb',
        status: 'attached',
      },
      facialHair: {
        styleRef: 'modular-fantasy-hero:facial-hair:02',
        publicPath:
          '/models/synty/concepts/character-customization/facial-hair/facial-hair-02.glb',
        status: 'attached',
      },
    },
    animation: 'Walk_Forward',
    mappedBones: 63,
    mountedSourceArmatures: 0,
    controlledTreatment: defaultTreatment,
    referenceTreatment: defaultTreatment,
    screenshot: 'walk-default-scalp-alternate-facial-hair.png',
  },
] as const;

const expectedEvidence = [
  {
    path: 'default-close.png',
    sha256: '7fab0ed85a32300c256cf7c32a14591043869a8c6a6eb6f246fd2cc06af41ce6',
    byteSize: 69_002,
    dimensions: [462, 560],
  },
  {
    path: 'workspace-wide.png',
    sha256: '60d146be2941faa67442c9360e25eb8062ca714486abdb38d0a8a0ba9eaf2d20',
    byteSize: 176_881,
    dimensions: [1280, 578],
  },
  {
    path: 'treatment-stable.png',
    sha256: '290c66330ab42cd3d84ef12736f3326337c9c2510dad602d324b22d7c3219be3',
    byteSize: 69_376,
    dimensions: [462, 560],
  },
  {
    path: 'none-both.png',
    sha256: 'ceecb66b0c77b980f5ffe0a67b4fccbf2c1459fbc01e9295ebf3f62437885054',
    byteSize: 65_370,
    dimensions: [462, 560],
  },
  {
    path: 'combined-alternate-arbitrary-color.png',
    sha256: 'a19190063751e632f0b169cac4662866971b9d964e788c00f72b8add4324de58',
    byteSize: 67_511,
    dimensions: [462, 560],
  },
  {
    path: 'surface-cloth.png',
    sha256: '981df4f932c98cfafd360154cb9d5a1a25ab2f555060206a54495b96fea69d8b',
    byteSize: 68_199,
    dimensions: [462, 560],
  },
  {
    path: 'surface-leather.png',
    sha256: '9e3dd78bfd8877ba019da0e4c6ca441aceba9ad30dc5eda1d241977eac4d462c',
    byteSize: 67_438,
    dimensions: [462, 560],
  },
  {
    path: 'surface-metal.png',
    sha256: '355f591c5103a2b9eb164dc07db19f16aeaf2a836d8072accac6a29263b0e8c0',
    byteSize: 66_951,
    dimensions: [462, 560],
  },
  {
    path: 'walk-alternate-scalp-default-facial-hair.png',
    sha256: '34e1ad54dab1e184220e4283858d63c1ab95d3aeefb06165755afbe8532dbc31',
    byteSize: 69_966,
    dimensions: [462, 560],
  },
  {
    path: 'walk-default-scalp-alternate-facial-hair.png',
    sha256: '09a86cefa2b002af9b4ed8242e9bc5ee5c4db6e6925152f6716a50c7e74e5ffa',
    byteSize: 71_689,
    dimensions: [462, 560],
  },
  {
    path: 'walk.png',
    sha256: '5ea83dc5a925b51c980c7116160087422d0c9367c469974cd6ff73abecf5c3ab',
    byteSize: 68_571,
    dimensions: [462, 560],
  },
  {
    path: 'orbit.png',
    sha256: 'b73aa2c3c5b69065c2637febf01a1adba5c69c1eb59927391ea4f69389e5c707',
    byteSize: 29_736,
    dimensions: [462, 560],
  },
  {
    path: 'tactical-twin-isolation.png',
    sha256: '1bb18b7b478a28245b7c50efb517384eb1b6373e46eac1f724a17f23470c7882',
    byteSize: 39_049,
    dimensions: [462, 560],
  },
  {
    path: 'weapon-witness.png',
    sha256: '3c64ee1439169c69667e50b675345b993516ad536911a8e152d87738a7525fdf',
    byteSize: 39_588,
    dimensions: [462, 560],
  },
  {
    path: 'completed-inspector.png',
    sha256: 'f5c769d48fc2580e8a1586f01b8f67dda062bfde7c175783e332ef87fc014870',
    byteSize: 31_121,
    dimensions: [366, 787],
  },
] as const;

interface EvidenceImage {
  readonly path: string;
  readonly sha256: string;
  readonly byteSize: number;
  readonly dimensions: readonly [number, number];
}

interface PublicationReceipt {
  readonly providerCommit: string;
  readonly providerFeatureHead: string;
  readonly providerManifestSha256: string;
  readonly providerInventorySha256: string;
  readonly providerInventoryTreeSha256: string;
  readonly body: unknown;
  readonly slots: {
    readonly scalp: {
      readonly defaultStyleRef: string;
      readonly options: unknown;
    };
    readonly facialHair: {
      readonly defaultStyleRef: string;
      readonly options: unknown;
    };
  };
  readonly sharedRig: unknown;
  readonly surface: unknown;
  readonly socketWitness: unknown;
  readonly providerGlbPreservation: unknown;
  readonly productionGlbsChanged: readonly string[];
  readonly browserMatrix: Record<string, unknown>;
  readonly evidence: readonly EvidenceImage[];
}

function loadReceipt(): PublicationReceipt {
  expect(existsSync(receiptUrl)).toBe(true);
  if (!existsSync(receiptUrl)) return {} as PublicationReceipt;
  return JSON.parse(readFileSync(receiptUrl, 'utf8')) as PublicationReceipt;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function publicRows(receipt: PublicationReceipt) {
  return [
    receipt.body,
    ...(receipt.slots?.scalp?.options ?? []),
    ...(receipt.slots?.facialHair?.options ?? []),
  ] as { publicPath: string; byteSize: number; sha256: string }[];
}

describe('character-customization Concept publication', () => {
  it('pins the exact merged provider and all seven public outputs', () => {
    const receipt = loadReceipt();
    expect(receipt.providerCommit).toBe(
      '4c208fad5a950d2103d763a9c8aac96d3bb342b1'
    );
    expect(receipt.providerFeatureHead).toBe(
      '6c567b5939ba308a3a35b2d4e5354111e30e9f44'
    );
    expect(receipt.providerManifestSha256).toBe(
      'd1d8a815c0241986c6f5367a6de82340722a5bae08d2c62307224d42b1ff7c10'
    );
    expect(receipt.providerInventorySha256).toBe(
      'b2ef0d7a975de9aa69c9531138f88a48a6e1fc5c1dfbb716b22627d9c3b91222'
    );
    expect(receipt.providerInventoryTreeSha256).toBe(
      'c29bd470169026d07bf00fc6d30180a80e29b723f56b19b81adff89b468d00af'
    );
    expect(receipt.body).toEqual(expectedBody);
    expect(receipt.slots.scalp).toEqual({
      defaultStyleRef: 'modular-fantasy-hero:hair:04',
      options: expectedScalp,
    });
    expect(receipt.slots.facialHair).toEqual({
      defaultStyleRef: 'modular-fantasy-hero:facial-hair:02',
      options: expectedFacialHair,
    });

    const rows = publicRows(receipt);
    expect(rows).toHaveLength(7);
    for (const row of rows) {
      expect(row.publicPath).toMatch(
        /^\/models\/synty\/concepts\/character-customization\/.+\.glb$/
      );
      expect(row.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(row.byteSize).toBeGreaterThan(0);
    }
  });

  it('matches the exact web asset table and keeps provider bytes ignored', () => {
    const receipt = loadReceipt();
    expect(CHARACTER_CUSTOMIZATION_BODY).toMatchObject({
      url: expectedBody.publicPath,
      byteSize: expectedBody.byteSize,
      sha256: expectedBody.sha256,
      rigFamily: expectedBody.rigFamily,
      boneCount: expectedBody.boneCount,
      animations: expectedBody.animations,
    });
    expect(
      SCALP_OPTIONS.map(({ url, byteSize, sha256, sourceMesh, styleRef }) => ({
        publicPath: url,
        byteSize,
        sha256,
        sourceMesh,
        styleRef,
      }))
    ).toEqual(expectedScalp);
    expect(
      FACIAL_HAIR_OPTIONS.map(
        ({ url, byteSize, sha256, sourceMesh, styleRef }) => ({
          publicPath: url,
          byteSize,
          sha256,
          sourceMesh,
          styleRef,
        })
      )
    ).toEqual(expectedFacialHair);
    expect(receipt.slots.scalp.defaultStyleRef).toBe(DEFAULT_SCALP_STYLE_REF);
    expect(receipt.slots.facialHair.defaultStyleRef).toBe(
      DEFAULT_FACIAL_HAIR_STYLE_REF
    );

    expect(() =>
      execFileSync(
        'git',
        [
          'check-ignore',
          '--quiet',
          '--',
          'public/models/synty/concepts/character-customization/dwarf-fighter-body.glb',
        ],
        { cwd: repositoryRoot }
      )
    ).not.toThrow();
    expect(
      execFileSync('git', ['ls-files', '--', 'public/models/synty'], {
        cwd: repositoryRoot,
        encoding: 'utf8',
      })
    ).toBe('');
  });

  it('pins the shared rig, inverse binds, surface, and socket witness', () => {
    const receipt = loadReceipt();
    expect(receipt.sharedRig).toEqual({
      family: 'modular-fantasy-hero-v1',
      boneCount: 63,
      boneOrder,
      inverseBindSha256:
        'ced85b4f006ee0261b87c9d607c42ae596e4f1f908576bd67649f73207f8265d',
      accessoryWeightedBones: ['Head'],
    });
    expect(receipt.surface).toEqual({
      mode: 'uniform-pbr-v1',
      defaultBaseColorSrgb: '#5A3825',
      defaultRoughness: 0.72,
      defaultMetalness: 0,
    });
    expect(receipt.socketWitness).toEqual({
      profileId: 'modular-fantasy-hero-main-hand-v1',
      socketBone: 'Hand_R',
      contractVersion: 'hand-r-rest-animation-semantics-v1',
      decodedSemanticSha256:
        '81eb990e5b2df6753777e4eaff59ebeb207cac3e0863cb84fc44b016485f14bf',
      matchesProviderProductionDwarf: true,
      providerProductionDwarfSha256:
        '7e1c611b5b5e02a709e75ed71deeccdc30242e0716da469adc2ddaa559068224',
      clips: [
        { name: 'Idle_Relaxed', hierarchyChannels: 9 },
        { name: 'Walk_Forward', hierarchyChannels: 9 },
      ],
    });
  });

  it('records exact provider GLB preservation', () => {
    const receipt = loadReceipt();
    expect(receipt.providerGlbPreservation).toEqual({
      baselineGlbCount: 1231,
      baselineSnapshotJsonSha256:
        'da8fc4228681fee4ea229251e4f63d2503d5d66dc258ea6eb9c958195e308df3',
      conceptGlbCount: 7,
      conceptSnapshotJsonSha256:
        '953569a27afe60fd5fd5269938e0f01227e2bc2f83943c95d6aeb74daf72fd05',
    });
    expect(receipt.productionGlbsChanged).toEqual([]);
  });

  it('records the complete fresh browser matrix and exact HTTP receipts', () => {
    const receipt = loadReceipt();
    expect({
      ref: CUSTOMIZATION_WEAPON_PRESENTATION.ref,
      publicPath: CUSTOMIZATION_WEAPON_PRESENTATION.weaponUrl,
      bone: CUSTOMIZATION_WEAPON_PRESENTATION.socket.bone,
    }).toEqual({
      ref: 'dnd5e:item:warhammer',
      publicPath: '/models/synty/weapons/warhammer.glb',
      bone: 'Hand_R',
    });
    expect(receipt.browserMatrix).toEqual({
      verdict: 'PASS',
      route: '/?concept=character-customization',
      browser: 'Chrome 151.0.7922.169',
      viewport: { width: 1600, height: 1100, deviceScaleFactor: 1 },
      layout: {
        wideDesktop1600: {
          arrangement: 'controls|preview|inspector',
          controls: { x: 160, width: 352, height: 560, scrollHeight: 1016 },
          preview: { x: 536, width: 480, rendererHeight: 560 },
          inspector: { x: 1040, width: 400, height: 560, scrollHeight: 1555 },
          stickyInternalPanes: true,
        },
        ordinaryDesktop1280: {
          arrangement: 'controls|preview then inspector',
          controls: { x: 32, y: 350, width: 384, height: 560 },
          preview: { x: 440, y: 350, width: 808, rendererHeight: 560 },
          inspector: { x: 32, y: 952, width: 1216, height: 560 },
        },
      },
      accessoryPreload: {
        count: 6,
        publicPaths: [
          ...expectedScalp.map((asset) => asset.publicPath),
          ...expectedFacialHair.map((asset) => asset.publicPath),
        ],
      },
      treatmentOnlyStability: {
        checkpoint: '00b-treatment-stable',
        statusEvents: 10,
        loadingStatusEvents: 0,
        meshIdentityStable: true,
        materialIdentityStable: true,
        before: [
          {
            slot: 'scalp',
            meshUuid: '2074f693-dcc9-4a12-a80e-c2adbf10eb89',
            materialUuids: ['414a8b6a-5195-41cf-97a9-0ac5f77677ce'],
          },
          {
            slot: 'facialHair',
            meshUuid: 'f468de40-b4d5-4f46-a162-5c8064008c60',
            materialUuids: ['712d3a00-e943-41c1-a1f8-3f8474b861bb'],
          },
        ],
        after: [
          {
            slot: 'scalp',
            meshUuid: '2074f693-dcc9-4a12-a80e-c2adbf10eb89',
            materialUuids: ['414a8b6a-5195-41cf-97a9-0ac5f77677ce'],
          },
          {
            slot: 'facialHair',
            meshUuid: 'f468de40-b4d5-4f46-a162-5c8064008c60',
            materialUuids: ['712d3a00-e943-41c1-a1f8-3f8474b861bb'],
          },
        ],
        finalTreatment: {
          baseColorSrgb: '#C02626',
          roughness: 0.31,
          metalness: 0.64,
        },
      },
      observations: 29,
      observationAccounting: {
        scriptedCheckpoints: 29,
        conceptAccumulatedUniquePositiveObservations: 49,
        relationship:
          'scripted-explicit-checkpoints-vs-all-distinct-positive-committed-concept-frames',
      },
      exactCurrentIdentityChecks: 29,
      runtimeMaterialValueRowsChecked: 112,
      materialUuidIsolation: true,
      materialValueIsolation: true,
      mappedBones: 63,
      mountedSourceArmatures: 0,
      coverage: {
        scalp: '5/5',
        facialHair: '5/5',
        motions: '2/2',
        views: '3/3',
        presets: '4/4',
        simultaneousAlternatePair: true,
        referenceTwinIsolation: true,
      },
      requiredWalkStates: expectedRequiredWalkStates,
      finalIdentity: {
        fixture: {
          scalp: 'modular-fantasy-hero:hair:08',
          facialHair: 'modular-fantasy-hero:facial-hair:03',
          treatment: finalControlledTreatment,
          motion: 'walk',
          view: 'play',
          showWeaponWitness: true,
        },
        controlled: {
          bodyRootBoneUuid: '5a0f2468-e78f-4e42-8e63-ce272ac05eb1',
          scalp: {
            styleRef: 'modular-fantasy-hero:hair:08',
            publicPath:
              '/models/synty/concepts/character-customization/scalp/hair-08.glb',
            status: 'attached',
            meshUuid: '9c3d7870-8724-4202-acf7-ffbf56c23cf9',
            material: {
              materialUuid: 'be71e611-b279-4813-8fe5-036333366808',
              ...finalControlledTreatment,
            },
          },
          facialHair: {
            styleRef: 'modular-fantasy-hero:facial-hair:03',
            publicPath:
              '/models/synty/concepts/character-customization/facial-hair/facial-hair-03.glb',
            status: 'attached',
            meshUuid: 'b1499c4d-fc34-4f55-9385-d5ce749a40fb',
            material: {
              materialUuid: '9b435428-1267-4276-9b89-ab807b7a027f',
              ...finalControlledTreatment,
            },
          },
        },
        reference: {
          bodyRootBoneUuid: '7093abcf-39b9-4ab4-bf61-e7abdf0ae89a',
          scalp: {
            styleRef: 'modular-fantasy-hero:hair:04',
            publicPath:
              '/models/synty/concepts/character-customization/scalp/hair-04.glb',
            status: 'attached',
            meshUuid: '8704e050-46c4-487b-9d42-dbee3f0d4f4d',
            material: {
              materialUuid: '4d500558-8476-45b0-bec0-fb904a484d3c',
              ...defaultTreatment,
            },
          },
          facialHair: {
            styleRef: 'modular-fantasy-hero:facial-hair:02',
            publicPath:
              '/models/synty/concepts/character-customization/facial-hair/facial-hair-02.glb',
            status: 'attached',
            meshUuid: '831d7adc-d55d-4f07-a6a3-3eede79dadcd',
            material: {
              materialUuid: '0590b869-f2e1-4a93-aa23-46ae1350d615',
              ...defaultTreatment,
            },
          },
        },
      },
      weaponWitness: expectedWeaponWitness,
      httpAssets: expectedHttpAssets,
      unrelatedStartupRpcFixture: 'valid-empty-grpc-web-responses',
      failures: {
        appConsole: 0,
        page: 0,
        request: 0,
        http: 0,
      },
    });
    expect(receipt.browserMatrix.httpAssets).toEqual(expectedHttpAssets);
  });

  it('binds the compact tracked PNG evidence and remains portable', () => {
    const receipt = loadReceipt();
    expect(receipt.evidence).toEqual(expectedEvidence);
    for (const image of receipt.evidence) {
      expect(image.path).toMatch(/^[a-z0-9-]+\.png$/);
      expect(image.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(image.byteSize).toBeGreaterThan(0);
      expect(image.dimensions[0]).toBeGreaterThan(0);
      expect(image.dimensions[1]).toBeGreaterThan(0);
      const imageUrl = new URL(image.path, evidenceRoot);
      expect(existsSync(imageUrl)).toBe(true);
      if (!existsSync(imageUrl)) continue;
      const bytes = readFileSync(imageUrl);
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(statSync(imageUrl).size).toBe(image.byteSize);
      expect(sha256(bytes)).toBe(image.sha256);
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual(
        image.dimensions
      );
    }

    expect(existsSync(readmeUrl)).toBe(true);
    const portableText = `${JSON.stringify(receipt)}\n${
      existsSync(readmeUrl) ? readFileSync(readmeUrl, 'utf8') : ''
    }`;
    expect(portableText).not.toMatch(/\/home\/|\/tmp\/|Downloads\/synty/);
    expect(JSON.stringify(receipt)).not.toMatch(
      /"(?:timestamp|createdAt|capturedAt|generatedAt)"/
    );
    expect(portableText).toContain(
      'Scripted checkpoints and Concept observations are different counters:'
    );
  });
});
