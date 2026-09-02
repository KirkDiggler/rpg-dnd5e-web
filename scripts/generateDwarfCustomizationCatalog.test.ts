// @vitest-environment node
import { check, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';
import {
  projectDwarfCustomizationManifest,
  renderDwarfCustomizationCatalogModule,
} from './generateDwarfCustomizationCatalog';

const EXACT_ATLAS_SHA256 =
  '7f84972790e530f8d83b378eb95f3151e2664c7b4ac23b1d125a55e1efcecd62';
const EXACT_INVERSE_BIND_SHA256 =
  'ced85b4f006ee0261b87c9d607c42ae596e4f1f908576bd67649f73207f8265d';

function digest(index: number): string {
  return index.toString(16).padStart(64, '0');
}

function bodyMeshes(outfit: string): string[] {
  return [
    'Chr_Head_Male_00',
    'Chr_Ear_Ear_01',
    ...[
      'Torso',
      'Hips',
      'ArmUpperLeft',
      'ArmUpperRight',
      'ArmLowerLeft',
      'ArmLowerRight',
      'HandLeft',
      'HandRight',
      'LegLeft',
      'LegRight',
    ].map((part) => `Chr_${part}_Male_${outfit}`),
  ];
}

function option(
  slot: 'scalp' | 'facial-hair',
  index: number,
  hashIndex: number
) {
  const number = index.toString().padStart(2, '0');
  const scalp = slot === 'scalp';
  const file = scalp ? `hair-${number}` : `facial-hair-${number}`;
  return {
    animations: [],
    label: scalp ? `Hair ${number}` : `Facial Hair ${number}`,
    material: {
      count: 1,
      mode: 'uniform-pbr-v1',
      opaque: true,
      textureCount: 0,
    },
    path: `${slot}/${file}.glb`,
    sha256: digest(hashIndex),
    sourceMesh: scalp ? `Chr_Hair_${number}` : `Chr_FacialHair_Male_${number}`,
    styleRef: scalp
      ? `modular-fantasy-hero:hair:${number}`
      : `modular-fantasy-hero:facial-hair:${number}`,
    thumbnail: `thumbnails/${slot}/${file}.png`,
    thumbnailSha256: digest(hashIndex + 100),
  };
}

function validManifest() {
  const classes = [
    ['barbarian', '01'],
    ['fighter', '16'],
    ['monk', '08'],
    ['rogue', '10'],
  ] as const;
  return {
    animations: ['Idle_Relaxed', 'Walk_Forward'],
    atlas: {
      dimensions: [1024, 1024],
      id: '01-a',
      sha256: EXACT_ATLAS_SHA256,
    },
    bodies: Object.fromEntries(
      classes.map(([classRef, outfit], index) => [
        `dwarf:${classRef}`,
        {
          animations: ['Idle_Relaxed', 'Walk_Forward'],
          class: classRef,
          combination: `dwarf:${classRef}`,
          fallback: {
            path: `harness/models/synty/characters/race-class/dwarf-${classRef}.glb`,
            sha256: digest(201 + index),
          },
          outfit,
          path: `bodies/dwarf-${classRef}-body.glb`,
          sha256: digest(1 + index),
          sourceMeshes: bodyMeshes(outfit),
        },
      ])
    ),
    profileRef: 'modular-fantasy-hero-v1:dwarf',
    proportions: [1.08, 0.78, 1.08],
    raceRef: 'dwarf',
    rigFamily: 'modular-fantasy-hero-v1',
    schemaVersion: 2,
    skeleton: {
      boneCount: 63,
      inverseBindSha256: EXACT_INVERSE_BIND_SHA256,
    },
    slots: {
      'facial-hair': {
        defaultStyleRef: 'modular-fantasy-hero:facial-hair:02',
        options: Array.from({ length: 18 }, (_, index) =>
          option('facial-hair', index + 1, index + 50)
        ),
      },
      scalp: {
        defaultStyleRef: 'modular-fantasy-hero:hair:04',
        options: Array.from({ length: 38 }, (_, index) =>
          option('scalp', index + 1, index + 10)
        ),
      },
    },
    socketProfile: {
      bone: 'Hand_R',
      boneUnitMeters: 0.01,
      id: 'modular-fantasy-hero-main-hand-v1',
      positionMeters: [-0.113634511828, 0.043524894863, -0.006868128199],
      rotationQuaternion: [
        -0.31697111189640637, -0.4555468694563118, 0.6829896921327775,
        0.47490151020194044,
      ],
      scale: 1,
    },
    surface: {
      defaultColorSrgb: 0x5a3825,
      defaultMetalness: 0,
      defaultRoughness: 0.72,
      mode: 'uniform-pbr-v1',
    },
    workflowVersion: 'character-customization-v1',
  };
}

type MutableManifest = ReturnType<typeof validManifest>;
type MutateManifest = (manifest: MutableManifest) => unknown;

function mutableManifest(): MutableManifest {
  return structuredClone(validManifest());
}

function addUnknownKey(value: object): void {
  (value as Record<string, unknown>).future = true;
}

describe('projectDwarfCustomizationManifest', () => {
  it('projects the complete schema-v2 production contract to safe web URLs', () => {
    const catalog = projectDwarfCustomizationManifest(validManifest());

    expect(catalog).toMatchObject({
      schemaVersion: 2,
      workflowVersion: 'character-customization-v1',
      raceRef: 'dwarf',
      profileRef: 'modular-fantasy-hero-v1:dwarf',
      rigFamily: 'modular-fantasy-hero-v1',
      proportions: [1.08, 0.78, 1.08],
      skeleton: {
        boneCount: 63,
        inverseBindSha256: EXACT_INVERSE_BIND_SHA256,
      },
      animations: ['Idle_Relaxed', 'Walk_Forward'],
      atlas: {
        id: '01-a',
        sha256: EXACT_ATLAS_SHA256,
        dimensions: [1024, 1024],
      },
      socketProfile: {
        id: 'modular-fantasy-hero-main-hand-v1',
        bone: 'Hand_R',
        boneUnitMeters: 0.01,
        positionMeters: [-0.113634511828, 0.043524894863, -0.006868128199],
        rotationQuaternion: [
          -0.31697111189640637, -0.4555468694563118, 0.6829896921327775,
          0.47490151020194044,
        ],
        scale: 1,
      },
      surface: {
        mode: 'uniform-pbr-v1',
        defaultColorSrgb: 0x5a3825,
        defaultRoughness: 0.72,
        defaultMetalness: 0,
      },
      defaults: {
        scalpStyleRef: 'modular-fantasy-hero:hair:04',
        facialHairStyleRef: 'modular-fantasy-hero:facial-hair:02',
        colorSrgb: 0x5a3825,
        roughness: 0.72,
        metalness: 0,
      },
    });
    expect(Object.keys(catalog.bodies)).toEqual([
      'barbarian',
      'fighter',
      'monk',
      'rogue',
    ]);
    expect(catalog.bodies.barbarian).toMatchObject({
      combination: 'dwarf:barbarian',
      classRef: 'barbarian',
      outfit: '01',
      url: '/models/synty/characters/customization/dwarf-v1/bodies/dwarf-barbarian-body.glb',
      fallbackUrl: '/models/synty/characters/race-class/dwarf-barbarian.glb',
      animations: ['Idle_Relaxed', 'Walk_Forward'],
    });
    expect(catalog.slots.scalp.options).toHaveLength(38);
    expect(catalog.slots.facialHair.options).toHaveLength(18);
    expect(catalog.slots.scalp.options[0]).toEqual({
      slot: 'scalp',
      styleRef: 'modular-fantasy-hero:hair:01',
      label: 'Hair 01',
      url: '/models/synty/characters/customization/dwarf-v1/scalp/hair-01.glb',
      sha256: digest(10),
      thumbnailUrl:
        '/models/synty/characters/customization/dwarf-v1/thumbnails/scalp/hair-01.png',
      thumbnailSha256: digest(110),
      animations: [],
      material: {
        mode: 'uniform-pbr-v1',
        count: 1,
        textureCount: 0,
        opaque: true,
      },
    });
    expect(catalog.slots.facialHair.options.at(-1)?.styleRef).toBe(
      'modular-fantasy-hero:facial-hair:18'
    );
  });

  const unknownKeyMutations: readonly (readonly [string, MutateManifest])[] = [
    ['top-level', (manifest) => addUnknownKey(manifest)],
    ['skeleton', (manifest) => addUnknownKey(manifest.skeleton)],
    ['body', (manifest) => addUnknownKey(manifest.bodies['dwarf:fighter'])],
    [
      'fallback',
      (manifest) => addUnknownKey(manifest.bodies['dwarf:fighter'].fallback),
    ],
    ['slot', (manifest) => addUnknownKey(manifest.slots.scalp)],
    ['option', (manifest) => addUnknownKey(manifest.slots.scalp.options[0]!)],
    [
      'material',
      (manifest) => addUnknownKey(manifest.slots.scalp.options[0]!.material),
    ],
  ];

  it.each(unknownKeyMutations)(
    'rejects unknown required-object keys at %s',
    (_label, mutate) => {
      const manifest = mutableManifest();
      mutate(manifest);
      expect(() => projectDwarfCustomizationManifest(manifest)).toThrow(
        /keys must be exactly/
      );
    }
  );

  const invalidManifestMutations: readonly (readonly [
    string,
    MutateManifest,
    RegExp,
  ])[] = [
    [
      'duplicate style ref',
      (manifest) =>
        (manifest.slots.scalp.options[1]!.styleRef =
          manifest.slots.scalp.options[0]!.styleRef),
      /styleRef|collision/,
    ],
    [
      'duplicate runtime path',
      (manifest) =>
        (manifest.slots.scalp.options[1]!.path =
          manifest.slots.scalp.options[0]!.path),
      /path|collision/,
    ],
    [
      'duplicate thumbnail path',
      (manifest) =>
        (manifest.slots.scalp.options[1]!.thumbnail =
          manifest.slots.scalp.options[0]!.thumbnail),
      /thumbnail|collision/,
    ],
    [
      'missing default',
      (manifest) =>
        (manifest.slots.scalp.defaultStyleRef = 'modular-fantasy-hero:hair:99'),
      /defaultStyleRef/,
    ],
    [
      'wrong scalp count',
      (manifest) => manifest.slots.scalp.options.pop(),
      /exactly 38/,
    ],
    [
      'wrong facial-hair count',
      (manifest) => manifest.slots['facial-hair'].options.pop(),
      /exactly 18/,
    ],
  ];

  it.each(invalidManifestMutations)('rejects %s', (_label, mutate, message) => {
    const manifest = mutableManifest();
    mutate(manifest);
    expect(() => projectDwarfCustomizationManifest(manifest)).toThrow(message);
  });

  it.each([
    '/absolute.glb',
    '../escape.glb',
    'scalp/../escape.glb',
    'scalp\\hair-01.glb',
    'https://evil.invalid/hair.glb',
    'source/hair-01.fbx',
  ])('rejects unsafe/source runtime path %s', (path) => {
    const manifest = mutableManifest();
    manifest.slots.scalp.options[0].path = path;
    expect(() => projectDwarfCustomizationManifest(manifest)).toThrow(/path/);
  });

  it.each([
    '/models/synty/characters/race-class/dwarf-fighter.glb',
    'models/synty/characters/race-class/dwarf-fighter.glb',
    'harness/models/synty/../private/dwarf-fighter.glb',
    'harness/models/synty/source/dwarf-fighter.blend',
  ])('rejects fallback outside the exact provider Synty base: %s', (path) => {
    const manifest = mutableManifest();
    manifest.bodies['dwarf:fighter'].fallback.path = path;
    expect(() => projectDwarfCustomizationManifest(manifest)).toThrow(
      /fallback\.path/
    );
  });

  it('rejects a persisted style ref shaped like a URL instead of treating it as one', () => {
    const manifest = mutableManifest();
    manifest.slots.scalp.options[0].styleRef =
      '/models/synty/characters/customization/dwarf-v1/scalp/hair-01.glb';
    expect(() => projectDwarfCustomizationManifest(manifest)).toThrow(
      /styleRef.*never a path/
    );
  });

  const malformedValueMutations: readonly (readonly [
    string,
    MutateManifest,
  ])[] = [
    ['malformed hash', (manifest) => (manifest.atlas.sha256 = 'ABC')],
    [
      'non-finite proportion',
      (manifest) => (manifest.proportions[1] = Number.NaN),
    ],
    [
      'non-finite socket value',
      (manifest) =>
        (manifest.socketProfile.positionMeters[0] = Number.POSITIVE_INFINITY),
    ],
    [
      'non-finite surface value',
      (manifest) =>
        (manifest.surface.defaultRoughness = Number.NEGATIVE_INFINITY),
    ],
  ];

  it.each(malformedValueMutations)('rejects %s', (_label, mutate) => {
    const manifest = mutableManifest();
    mutate(manifest);
    expect(() => projectDwarfCustomizationManifest(manifest)).toThrow();
  });
});

describe('renderDwarfCustomizationCatalogModule', () => {
  it('emits deterministic immutable formatted TypeScript with exact authority and no source mesh leakage', async () => {
    const manifest = validManifest();
    const metadata = {
      providerCommit: '69a229aabe4a366039dd06a68148a8ff9e0ca4e8',
      manifestSha256:
        '10ba18b4281ea65b757d959ab7caa888adced2b106e2dc3b2e6ae0d19688ba4a',
    };

    const first = renderDwarfCustomizationCatalogModule(manifest, metadata);
    const second = renderDwarfCustomizationCatalogModule(
      structuredClone(manifest),
      metadata
    );

    expect(second).toBe(first);
    expect(first).toContain(metadata.providerCommit);
    expect(first).toContain(metadata.manifestSha256);
    expect(first).toContain('export interface DwarfCustomizationCatalog');
    expect(first).toContain('Object.freeze');
    expect(first).not.toContain('sourceMesh');
    expect(first).not.toContain('Chr_Hair_');
    expect(first).not.toContain('harness/models/synty/');
    expect(first).not.toContain('/home/');
    const filepath = 'src/generated/dwarfCustomizationCatalog.ts';
    const prettierConfig = await resolveConfig(filepath);
    await expect(check(first, { ...prettierConfig, filepath })).resolves.toBe(
      true
    );
  });
});
