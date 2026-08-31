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
    sha256: '1cfaf1ed343cf83493fcfcffad392bb1000b9d6038f2817d6d2f49de4ccbba8c',
    byteSize: 80_669,
    dimensions: [838, 560],
  },
  {
    path: 'none-both.png',
    sha256: '310929d6634463cf350cd2ad73ea07fceed64f4ff9dee79e72ae3beb4f16ba77',
    byteSize: 78_307,
    dimensions: [838, 560],
  },
  {
    path: 'combined-alternate-arbitrary-color.png',
    sha256: '85fd456b8d508565802703b3e5743894a9aa5ac6257a363956934f9f99a4b8c8',
    byteSize: 80_151,
    dimensions: [838, 560],
  },
  {
    path: 'surface-cloth.png',
    sha256: 'e13715ee155d57dd356d248526771134816bc411b421d0c8d57f22b9d4dd5f37',
    byteSize: 79_880,
    dimensions: [838, 560],
  },
  {
    path: 'surface-leather.png',
    sha256: '71be21d65b3e15352e1e3148f4a4d13450991b1c6596431e74bb7078b57eedda',
    byteSize: 79_472,
    dimensions: [838, 560],
  },
  {
    path: 'surface-metal.png',
    sha256: '83420815105646715a6f23721d1e5fbfc3dd115b5ff6f7119050480789e52f35',
    byteSize: 80_117,
    dimensions: [838, 560],
  },
  {
    path: 'walk-alternate-scalp-default-facial-hair.png',
    sha256: 'bfad92571dcf0170a088351d54df081e3a7ed96b49a07ee62106eaca383ba843',
    byteSize: 83_476,
    dimensions: [838, 560],
  },
  {
    path: 'walk-default-scalp-alternate-facial-hair.png',
    sha256: '4aaaaf9a8824b3de9976791b6b89a1c69f3458ca9f2d08abd54a323825404245',
    byteSize: 84_538,
    dimensions: [838, 560],
  },
  {
    path: 'walk.png',
    sha256: '0d4d8f05b04abd2f97ba9f9f00c57dc4d9ad933046d110da38f1c0d531196d90',
    byteSize: 82_857,
    dimensions: [838, 560],
  },
  {
    path: 'orbit.png',
    sha256: '810509d91917005bffc6b30afdfaabbd1518cd4a16e31988e3fece7ffc192b57',
    byteSize: 62_346,
    dimensions: [838, 560],
  },
  {
    path: 'tactical-twin-isolation.png',
    sha256: '4a06110d667fc3cd7d35da3a3ee253d9797fe492ce88cd233b69d740e3c336ba',
    byteSize: 48_767,
    dimensions: [838, 560],
  },
  {
    path: 'weapon-witness.png',
    sha256: '41feb9f2ef3dba8cd1200333cc51fa708ee54f8b4a6e1611fb3d25fa0a1b5a72',
    byteSize: 49_957,
    dimensions: [838, 560],
  },
  {
    path: 'completed-inspector.png',
    sha256: '06befbf5fd269fdb8f686ff10640b8c7b2855e10c21d2d3342ec2d43dcc63f90',
    byteSize: 52_067,
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
      observations: 28,
      observationAccounting: {
        scriptedCheckpoints: 28,
        conceptAccumulatedUniquePositiveObservations: 45,
        relationship:
          'scripted-explicit-checkpoints-vs-all-distinct-positive-committed-concept-frames',
      },
      exactCurrentIdentityChecks: 28,
      runtimeMaterialValueRowsChecked: 108,
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
          bodyRootBoneUuid: '1d5204a1-09ef-40bd-96ff-ea09280027cf',
          scalp: {
            styleRef: 'modular-fantasy-hero:hair:08',
            publicPath:
              '/models/synty/concepts/character-customization/scalp/hair-08.glb',
            status: 'attached',
            material: {
              materialUuid: '5d51633c-24e6-405c-89e2-a8ae75fab75c',
              ...finalControlledTreatment,
            },
          },
          facialHair: {
            styleRef: 'modular-fantasy-hero:facial-hair:03',
            publicPath:
              '/models/synty/concepts/character-customization/facial-hair/facial-hair-03.glb',
            status: 'attached',
            material: {
              materialUuid: '41a1eead-5e99-4896-9bd1-ee81ae21933b',
              ...finalControlledTreatment,
            },
          },
        },
        reference: {
          bodyRootBoneUuid: '34460149-31dc-40c5-a220-33d6bdfc030a',
          scalp: {
            styleRef: 'modular-fantasy-hero:hair:04',
            publicPath:
              '/models/synty/concepts/character-customization/scalp/hair-04.glb',
            status: 'attached',
            material: {
              materialUuid: '7e34aa43-344d-4020-a674-801ec32d80a8',
              ...defaultTreatment,
            },
          },
          facialHair: {
            styleRef: 'modular-fantasy-hero:facial-hair:02',
            publicPath:
              '/models/synty/concepts/character-customization/facial-hair/facial-hair-02.glb',
            status: 'attached',
            material: {
              materialUuid: 'd612b19d-0925-48a0-8177-e1ce724648a7',
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
