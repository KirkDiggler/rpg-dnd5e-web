import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROVIDER_RUNTIME_ROOT =
  'harness/models/synty/characters/customization/dwarf-v1';
const PROVIDER_SYNTY_ROOT = 'harness/models/synty/';
const WEB_RUNTIME_ROOT = '/models/synty/characters/customization/dwarf-v1/';
const WEB_SYNTY_ROOT = '/models/synty/';
const MANIFEST_RELATIVE_PATH = `${PROVIDER_RUNTIME_ROOT}/manifest.json`;
const PRETTIER_CLI = fileURLToPath(
  new URL('../node_modules/prettier/bin/prettier.cjs', import.meta.url)
);
const GENERATED_FORMAT_PATH = fileURLToPath(
  new URL('../src/generated/dwarfCustomizationCatalog.ts', import.meta.url)
);

const CLASSES = [
  ['barbarian', '01'],
  ['fighter', '16'],
  ['monk', '08'],
  ['rogue', '10'],
] as const;
const ANIMATIONS = ['Idle_Relaxed', 'Walk_Forward'] as const;
const PROPORTIONS = [1.08, 0.78, 1.08] as const;
const EXACT_INVERSE_BIND_SHA256 =
  'ced85b4f006ee0261b87c9d607c42ae596e4f1f908576bd67649f73207f8265d';
const EXACT_ATLAS = {
  dimensions: [1024, 1024] as const,
  id: '01-a',
  sha256: '7f84972790e530f8d83b378eb95f3151e2664c7b4ac23b1d125a55e1efcecd62',
};
const EXACT_SOCKET = {
  bone: 'Hand_R',
  boneUnitMeters: 0.01,
  id: 'modular-fantasy-hero-main-hand-v1',
  positionMeters: [-0.113634511828, 0.043524894863, -0.006868128199] as const,
  rotationQuaternion: [
    -0.31697111189640637, -0.4555468694563118, 0.6829896921327775,
    0.47490151020194044,
  ] as const,
  scale: 1,
};
const EXACT_SURFACE = {
  defaultColorSrgb: 0x5a3825,
  defaultMetalness: 0,
  defaultRoughness: 0.72,
  mode: 'uniform-pbr-v1',
} as const;

const TOP_LEVEL_KEYS = [
  'animations',
  'atlas',
  'bodies',
  'profileRef',
  'proportions',
  'raceRef',
  'rigFamily',
  'schemaVersion',
  'skeleton',
  'slots',
  'socketProfile',
  'surface',
  'workflowVersion',
] as const;
const BODY_KEYS = [
  'animations',
  'class',
  'combination',
  'fallback',
  'outfit',
  'path',
  'sha256',
  'sourceMeshes',
] as const;
const OPTION_KEYS = [
  'animations',
  'label',
  'material',
  'path',
  'sha256',
  'sourceMesh',
  'styleRef',
  'thumbnail',
  'thumbnailSha256',
] as const;

export type DwarfStarterClass = (typeof CLASSES)[number][0];
export type DwarfCustomizationSlot = 'scalp' | 'facial-hair';

export interface DwarfStyleOption {
  readonly slot: DwarfCustomizationSlot;
  readonly styleRef: string;
  readonly label: string;
  readonly url: string;
  readonly sha256: string;
  readonly thumbnailUrl: string;
  readonly thumbnailSha256: string;
  readonly animations: readonly [];
  readonly material: {
    readonly mode: 'uniform-pbr-v1';
    readonly count: 1;
    readonly textureCount: 0;
    readonly opaque: true;
  };
}

export interface DwarfCustomizationBody {
  readonly combination: string;
  readonly classRef: DwarfStarterClass;
  readonly outfit: string;
  readonly url: string;
  readonly sha256: string;
  readonly fallbackUrl: string;
  readonly fallbackSha256: string;
  readonly animations: readonly ['Idle_Relaxed', 'Walk_Forward'];
}

export interface DwarfCustomizationCatalog {
  readonly schemaVersion: 2;
  readonly workflowVersion: 'character-customization-v1';
  readonly raceRef: 'dwarf';
  readonly profileRef: 'modular-fantasy-hero-v1:dwarf';
  readonly rigFamily: 'modular-fantasy-hero-v1';
  readonly proportions: readonly [1.08, 0.78, 1.08];
  readonly skeleton: {
    readonly boneCount: 63;
    readonly inverseBindSha256: string;
  };
  readonly animations: readonly ['Idle_Relaxed', 'Walk_Forward'];
  readonly atlas: {
    readonly id: '01-a';
    readonly sha256: string;
    readonly dimensions: readonly [1024, 1024];
  };
  readonly socketProfile: {
    readonly id: 'modular-fantasy-hero-main-hand-v1';
    readonly bone: 'Hand_R';
    readonly boneUnitMeters: 0.01;
    readonly positionMeters: readonly [number, number, number];
    readonly rotationQuaternion: readonly [number, number, number, number];
    readonly scale: 1;
  };
  readonly bodies: Readonly<Record<DwarfStarterClass, DwarfCustomizationBody>>;
  readonly slots: {
    readonly scalp: {
      readonly defaultStyleRef: string;
      readonly options: readonly DwarfStyleOption[];
    };
    readonly facialHair: {
      readonly defaultStyleRef: string;
      readonly options: readonly DwarfStyleOption[];
    };
  };
  readonly surface: {
    readonly mode: 'uniform-pbr-v1';
    readonly defaultColorSrgb: number;
    readonly defaultRoughness: number;
    readonly defaultMetalness: number;
  };
  readonly defaults: {
    readonly scalpStyleRef: string;
    readonly facialHairStyleRef: string;
    readonly colorSrgb: number;
    readonly roughness: number;
    readonly metalness: number;
  };
}

interface SourceAsset {
  readonly providerRelativePath: string;
  readonly sha256: string;
}

interface ParsedManifest {
  readonly catalog: DwarfCustomizationCatalog;
  readonly sourceAssets: readonly SourceAsset[];
}

interface CatalogAuthority {
  readonly providerCommit: string;
  readonly manifestSha256: string;
}

interface GenerateCatalogInput {
  readonly providerRoot: string;
  readonly outputPath: string;
}

export interface GeneratedCatalogReceipt extends CatalogAuthority {
  readonly bodyCount: 4;
  readonly scalpCount: 38;
  readonly facialHairCount: 18;
}

function fail(message: string): never {
  throw new Error(`Dwarf customization manifest: ${message}`);
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function exactObject(
  value: unknown,
  expectedKeys: readonly string[],
  label: string
): Record<string, unknown> {
  const result = object(value, label);
  const actual = Object.keys(result).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(`${label}: keys must be exactly ${expected.join(', ')}`);
  }
  return result;
}

function exactString(value: unknown, expected: string, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${label} must be a non-empty string`);
  }
  if (value !== expected) fail(`${label} must be ${expected}`);
  return value;
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    fail(`${label} must be a lowercase sha256 hex digest`);
  }
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${label} must be a finite number`);
  }
  return value;
}

function exactNumber(value: unknown, expected: number, label: string): number {
  const result = finiteNumber(value, label);
  if (result !== expected) fail(`${label} must be ${expected}`);
  return result;
}

function exactNumberArray(
  value: unknown,
  expected: readonly number[],
  label: string
): number[] {
  if (!Array.isArray(value) || value.length !== expected.length) {
    fail(`${label} must contain exactly ${expected.length} numbers`);
  }
  const result = value.map((entry, index) =>
    finiteNumber(entry, `${label}[${index}]`)
  );
  if (result.some((entry, index) => entry !== expected[index])) {
    fail(`${label} differs from the exact provider profile`);
  }
  return result;
}

function exactStringArray(
  value: unknown,
  expected: readonly string[],
  label: string
): string[] {
  if (
    !Array.isArray(value) ||
    value.length !== expected.length ||
    value.some((entry, index) => entry !== expected[index])
  ) {
    fail(`${label} must be ${JSON.stringify(expected)}`);
  }
  return value as string[];
}

function portablePath(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${label} must be a non-empty path`);
  }
  const parts = value.split('/');
  if (
    value.startsWith('/') ||
    value.includes('\\') ||
    value.includes('://') ||
    parts.some((part) => part === '' || part === '.' || part === '..') ||
    /\.(?:blend|fbx|zip)$/i.test(value) ||
    parts.some((part) => /^sources?$/i.test(part))
  ) {
    fail(
      `${label}: unsafe, absolute, traversal, or source path is not allowed`
    );
  }
  return value;
}

function exactRuntimeUrl(
  value: unknown,
  expected: string,
  label: string
): { readonly path: string; readonly url: string } {
  const path = portablePath(value, label);
  if (path !== expected) fail(`${label} must be ${expected}`);
  return { path, url: WEB_RUNTIME_ROOT + path };
}

function exactFallbackUrl(
  value: unknown,
  expected: string,
  label: string
): { readonly path: string; readonly url: string } {
  const path = portablePath(value, label);
  if (path !== expected || !path.startsWith(PROVIDER_SYNTY_ROOT)) {
    fail(
      `${label} must use the exact harness/models/synty/ provider-relative base`
    );
  }
  const relative = path.slice(PROVIDER_SYNTY_ROOT.length);
  return { path, url: WEB_SYNTY_ROOT + relative };
}

function styleRef(value: unknown, expected: string, label: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('/') ||
    value.includes('\\') ||
    value.includes('://')
  ) {
    fail(`${label}: a persisted styleRef is never a path or URL`);
  }
  if (value !== expected) fail(`${label} must be ${expected}`);
  return value;
}

function expectedBodyMeshes(outfit: string): string[] {
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

function expectedOption(slot: DwarfCustomizationSlot, index: number) {
  const number = index.toString().padStart(2, '0');
  const scalp = slot === 'scalp';
  const file = scalp ? `hair-${number}` : `facial-hair-${number}`;
  return {
    label: scalp ? `Hair ${number}` : `Facial Hair ${number}`,
    path: `${slot}/${file}.glb`,
    sourceMesh: scalp ? `Chr_Hair_${number}` : `Chr_FacialHair_Male_${number}`,
    styleRef: scalp
      ? `modular-fantasy-hero:hair:${number}`
      : `modular-fantasy-hero:facial-hair:${number}`,
    thumbnail: `thumbnails/${slot}/${file}.png`,
  };
}

function parseManifest(value: unknown): ParsedManifest {
  const manifest = exactObject(value, TOP_LEVEL_KEYS, 'manifest');
  if (manifest.schemaVersion !== 2) fail('manifest.schemaVersion must be 2');
  exactString(
    manifest.workflowVersion,
    'character-customization-v1',
    'manifest.workflowVersion'
  );
  exactString(
    manifest.profileRef,
    'modular-fantasy-hero-v1:dwarf',
    'manifest.profileRef'
  );
  exactString(manifest.raceRef, 'dwarf', 'manifest.raceRef');
  exactString(
    manifest.rigFamily,
    'modular-fantasy-hero-v1',
    'manifest.rigFamily'
  );
  exactNumberArray(manifest.proportions, PROPORTIONS, 'manifest.proportions');
  exactStringArray(manifest.animations, ANIMATIONS, 'manifest.animations');

  const skeleton = exactObject(
    manifest.skeleton,
    ['boneCount', 'inverseBindSha256'],
    'manifest.skeleton'
  );
  if (skeleton.boneCount !== 63) fail('manifest.skeleton.boneCount must be 63');
  if (
    sha256(
      skeleton.inverseBindSha256,
      'manifest.skeleton.inverseBindSha256'
    ) !== EXACT_INVERSE_BIND_SHA256
  ) {
    fail('manifest.skeleton.inverseBindSha256 differs');
  }

  const atlas = exactObject(
    manifest.atlas,
    ['dimensions', 'id', 'sha256'],
    'manifest.atlas'
  );
  exactString(atlas.id, EXACT_ATLAS.id, 'manifest.atlas.id');
  if (sha256(atlas.sha256, 'manifest.atlas.sha256') !== EXACT_ATLAS.sha256) {
    fail('manifest.atlas.sha256 differs');
  }
  exactNumberArray(
    atlas.dimensions,
    EXACT_ATLAS.dimensions,
    'manifest.atlas.dimensions'
  );

  const socket = exactObject(
    manifest.socketProfile,
    [
      'bone',
      'boneUnitMeters',
      'id',
      'positionMeters',
      'rotationQuaternion',
      'scale',
    ],
    'manifest.socketProfile'
  );
  exactString(socket.id, EXACT_SOCKET.id, 'manifest.socketProfile.id');
  exactString(socket.bone, EXACT_SOCKET.bone, 'manifest.socketProfile.bone');
  exactNumber(
    socket.boneUnitMeters,
    EXACT_SOCKET.boneUnitMeters,
    'manifest.socketProfile.boneUnitMeters'
  );
  exactNumberArray(
    socket.positionMeters,
    EXACT_SOCKET.positionMeters,
    'manifest.socketProfile.positionMeters'
  );
  exactNumberArray(
    socket.rotationQuaternion,
    EXACT_SOCKET.rotationQuaternion,
    'manifest.socketProfile.rotationQuaternion'
  );
  exactNumber(socket.scale, EXACT_SOCKET.scale, 'manifest.socketProfile.scale');

  const surface = exactObject(
    manifest.surface,
    ['defaultColorSrgb', 'defaultMetalness', 'defaultRoughness', 'mode'],
    'manifest.surface'
  );
  exactString(surface.mode, EXACT_SURFACE.mode, 'manifest.surface.mode');
  exactNumber(
    surface.defaultColorSrgb,
    EXACT_SURFACE.defaultColorSrgb,
    'manifest.surface.defaultColorSrgb'
  );
  exactNumber(
    surface.defaultRoughness,
    EXACT_SURFACE.defaultRoughness,
    'manifest.surface.defaultRoughness'
  );
  exactNumber(
    surface.defaultMetalness,
    EXACT_SURFACE.defaultMetalness,
    'manifest.surface.defaultMetalness'
  );

  const sourceAssets: SourceAsset[] = [];
  const seenPaths = new Set<string>();
  const addAsset = (
    providerRelativePath: string,
    digest: string,
    label: string
  ) => {
    if (seenPaths.has(providerRelativePath)) fail(`${label} path collision`);
    seenPaths.add(providerRelativePath);
    sourceAssets.push({ providerRelativePath, sha256: digest });
  };

  const bodySource = exactObject(
    manifest.bodies,
    CLASSES.map(([classRef]) => `dwarf:${classRef}`),
    'manifest.bodies'
  );
  const bodies = {} as Record<DwarfStarterClass, DwarfCustomizationBody>;
  for (const [classRef, outfit] of CLASSES) {
    const combination = `dwarf:${classRef}`;
    const label = `manifest.bodies.${combination}`;
    const body = exactObject(bodySource[combination], BODY_KEYS, label);
    exactString(body.combination, combination, `${label}.combination`);
    exactString(body.class, classRef, `${label}.class`);
    exactString(body.outfit, outfit, `${label}.outfit`);
    exactStringArray(
      body.sourceMeshes,
      expectedBodyMeshes(outfit),
      `${label}.sourceMeshes`
    );
    exactStringArray(body.animations, ANIMATIONS, `${label}.animations`);
    const runtime = exactRuntimeUrl(
      body.path,
      `bodies/dwarf-${classRef}-body.glb`,
      `${label}.path`
    );
    const bodySha256 = sha256(body.sha256, `${label}.sha256`);
    addAsset(
      `${PROVIDER_RUNTIME_ROOT}/${runtime.path}`,
      bodySha256,
      `${label}.path`
    );
    const fallback = exactObject(
      body.fallback,
      ['path', 'sha256'],
      `${label}.fallback`
    );
    const fallbackPath = exactFallbackUrl(
      fallback.path,
      `harness/models/synty/characters/race-class/dwarf-${classRef}.glb`,
      `${label}.fallback.path`
    );
    const fallbackSha256 = sha256(fallback.sha256, `${label}.fallback.sha256`);
    addAsset(fallbackPath.path, fallbackSha256, `${label}.fallback.path`);
    bodies[classRef] = {
      combination,
      classRef,
      outfit,
      url: runtime.url,
      sha256: bodySha256,
      fallbackUrl: fallbackPath.url,
      fallbackSha256,
      animations: [...ANIMATIONS],
    };
  }

  const slotsSource = exactObject(
    manifest.slots,
    ['facial-hair', 'scalp'],
    'manifest.slots'
  );
  const seenRefs = new Set<string>();
  const projectSlot = (
    slot: DwarfCustomizationSlot,
    count: number,
    expectedDefault: string
  ) => {
    const sourceKey = slot;
    const slotLabel = `manifest.slots.${sourceKey}`;
    const source = exactObject(
      slotsSource[sourceKey],
      ['defaultStyleRef', 'options'],
      slotLabel
    );
    const defaultStyleRef = styleRef(
      source.defaultStyleRef,
      expectedDefault,
      `${slotLabel}.defaultStyleRef`
    );
    if (!Array.isArray(source.options) || source.options.length !== count) {
      fail(`${slotLabel}.options must contain exactly ${count} entries`);
    }
    const options = source.options.map((value, zeroIndex) => {
      const index = zeroIndex + 1;
      const optionLabel = `${slotLabel}.options[${zeroIndex}]`;
      const sourceOption = exactObject(value, OPTION_KEYS, optionLabel);
      const expected = expectedOption(slot, index);
      const optionStyleRef = styleRef(
        sourceOption.styleRef,
        expected.styleRef,
        `${optionLabel}.styleRef`
      );
      if (seenRefs.has(optionStyleRef))
        fail(`${optionLabel}.styleRef collision`);
      seenRefs.add(optionStyleRef);
      exactString(sourceOption.label, expected.label, `${optionLabel}.label`);
      exactString(
        sourceOption.sourceMesh,
        expected.sourceMesh,
        `${optionLabel}.sourceMesh`
      );
      const runtime = exactRuntimeUrl(
        sourceOption.path,
        expected.path,
        `${optionLabel}.path`
      );
      const optionSha256 = sha256(sourceOption.sha256, `${optionLabel}.sha256`);
      addAsset(
        `${PROVIDER_RUNTIME_ROOT}/${runtime.path}`,
        optionSha256,
        `${optionLabel}.path`
      );
      const thumbnail = exactRuntimeUrl(
        sourceOption.thumbnail,
        expected.thumbnail,
        `${optionLabel}.thumbnail`
      );
      const thumbnailSha256 = sha256(
        sourceOption.thumbnailSha256,
        `${optionLabel}.thumbnailSha256`
      );
      addAsset(
        `${PROVIDER_RUNTIME_ROOT}/${thumbnail.path}`,
        thumbnailSha256,
        `${optionLabel}.thumbnail`
      );
      exactStringArray(
        sourceOption.animations,
        [],
        `${optionLabel}.animations`
      );
      const material = exactObject(
        sourceOption.material,
        ['count', 'mode', 'opaque', 'textureCount'],
        `${optionLabel}.material`
      );
      exactString(
        material.mode,
        'uniform-pbr-v1',
        `${optionLabel}.material.mode`
      );
      if (
        material.count !== 1 ||
        material.textureCount !== 0 ||
        material.opaque !== true
      ) {
        fail(
          `${optionLabel}.material must be one opaque untextured uniform-PBR material`
        );
      }
      return {
        slot,
        styleRef: optionStyleRef,
        label: expected.label,
        url: runtime.url,
        sha256: optionSha256,
        thumbnailUrl: thumbnail.url,
        thumbnailSha256,
        animations: [] as const,
        material: {
          mode: 'uniform-pbr-v1' as const,
          count: 1 as const,
          textureCount: 0 as const,
          opaque: true as const,
        },
      } satisfies DwarfStyleOption;
    });
    if (!seenRefs.has(defaultStyleRef))
      fail(`${slotLabel}.defaultStyleRef must name an option in this slot`);
    return { defaultStyleRef, options };
  };

  const scalp = projectSlot('scalp', 38, 'modular-fantasy-hero:hair:04');
  const facialHair = projectSlot(
    'facial-hair',
    18,
    'modular-fantasy-hero:facial-hair:02'
  );
  if (seenRefs.size !== 56) fail('manifest must contain 56 unique style refs');
  if (sourceAssets.length !== 120) {
    fail(
      'manifest must resolve 4 body, 4 fallback, 56 accessory, and 56 thumbnail files'
    );
  }

  return {
    catalog: {
      schemaVersion: 2,
      workflowVersion: 'character-customization-v1',
      raceRef: 'dwarf',
      profileRef: 'modular-fantasy-hero-v1:dwarf',
      rigFamily: 'modular-fantasy-hero-v1',
      proportions: [...PROPORTIONS],
      skeleton: {
        boneCount: 63,
        inverseBindSha256: EXACT_INVERSE_BIND_SHA256,
      },
      animations: [...ANIMATIONS],
      atlas: {
        id: EXACT_ATLAS.id,
        sha256: EXACT_ATLAS.sha256,
        dimensions: [...EXACT_ATLAS.dimensions],
      },
      socketProfile: {
        id: EXACT_SOCKET.id,
        bone: EXACT_SOCKET.bone,
        boneUnitMeters: EXACT_SOCKET.boneUnitMeters,
        positionMeters: [...EXACT_SOCKET.positionMeters],
        rotationQuaternion: [...EXACT_SOCKET.rotationQuaternion],
        scale: EXACT_SOCKET.scale,
      },
      bodies,
      slots: { scalp, facialHair },
      surface: { ...EXACT_SURFACE },
      defaults: {
        scalpStyleRef: scalp.defaultStyleRef,
        facialHairStyleRef: facialHair.defaultStyleRef,
        colorSrgb: EXACT_SURFACE.defaultColorSrgb,
        roughness: EXACT_SURFACE.defaultRoughness,
        metalness: EXACT_SURFACE.defaultMetalness,
      },
    },
    sourceAssets,
  };
}

export function projectDwarfCustomizationManifest(
  value: unknown
): DwarfCustomizationCatalog {
  return parseManifest(value).catalog;
}

const GENERATED_TYPES = `export type DwarfStarterClass = 'barbarian' | 'fighter' | 'monk' | 'rogue';
export type DwarfCustomizationSlot = 'scalp' | 'facial-hair';

export interface DwarfStyleOption {
  readonly slot: DwarfCustomizationSlot;
  readonly styleRef: string;
  readonly label: string;
  readonly url: string;
  readonly sha256: string;
  readonly thumbnailUrl: string;
  readonly thumbnailSha256: string;
  readonly animations: readonly [];
  readonly material: {
    readonly mode: 'uniform-pbr-v1';
    readonly count: 1;
    readonly textureCount: 0;
    readonly opaque: true;
  };
}

export interface DwarfCustomizationBody {
  readonly combination: string;
  readonly classRef: DwarfStarterClass;
  readonly outfit: string;
  readonly url: string;
  readonly sha256: string;
  readonly fallbackUrl: string;
  readonly fallbackSha256: string;
  readonly animations: readonly ['Idle_Relaxed', 'Walk_Forward'];
}

export interface DwarfCustomizationCatalog {
  readonly schemaVersion: 2;
  readonly workflowVersion: 'character-customization-v1';
  readonly raceRef: 'dwarf';
  readonly profileRef: 'modular-fantasy-hero-v1:dwarf';
  readonly rigFamily: 'modular-fantasy-hero-v1';
  readonly proportions: readonly [1.08, 0.78, 1.08];
  readonly skeleton: { readonly boneCount: 63; readonly inverseBindSha256: string };
  readonly animations: readonly ['Idle_Relaxed', 'Walk_Forward'];
  readonly atlas: { readonly id: '01-a'; readonly sha256: string; readonly dimensions: readonly [1024, 1024] };
  readonly socketProfile: {
    readonly id: 'modular-fantasy-hero-main-hand-v1';
    readonly bone: 'Hand_R';
    readonly boneUnitMeters: 0.01;
    readonly positionMeters: readonly [number, number, number];
    readonly rotationQuaternion: readonly [number, number, number, number];
    readonly scale: 1;
  };
  readonly bodies: Readonly<Record<DwarfStarterClass, DwarfCustomizationBody>>;
  readonly slots: {
    readonly scalp: { readonly defaultStyleRef: string; readonly options: readonly DwarfStyleOption[] };
    readonly facialHair: { readonly defaultStyleRef: string; readonly options: readonly DwarfStyleOption[] };
  };
  readonly surface: {
    readonly mode: 'uniform-pbr-v1';
    readonly defaultColorSrgb: number;
    readonly defaultRoughness: number;
    readonly defaultMetalness: number;
  };
  readonly defaults: {
    readonly scalpStyleRef: string;
    readonly facialHairStyleRef: string;
    readonly colorSrgb: number;
    readonly roughness: number;
    readonly metalness: number;
  };
}`;

export function renderDwarfCustomizationCatalogModule(
  value: unknown,
  authority: CatalogAuthority
): string {
  if (!/^[0-9a-f]{40}$/.test(authority.providerCommit)) {
    fail('provider commit must be an exact 40-character commit id');
  }
  sha256(authority.manifestSha256, 'source manifest sha256');
  const catalog = projectDwarfCustomizationManifest(value);
  const json = JSON.stringify(catalog, null, 2);
  const source = `/**
 * GENERATED FILE — DO NOT EDIT.
 * Provider schema-v2 projection: nested slot objects are intentional consumer truth.
 * Provider commit: ${authority.providerCommit}
 * Source manifest SHA-256: ${authority.manifestSha256}
 */

${GENERATED_TYPES}

export const DWARF_CUSTOMIZATION_CATALOG = Object.freeze(
  ${json} as const satisfies DwarfCustomizationCatalog
);
`;
  return execFileSync(
    process.execPath,
    [PRETTIER_CLI, '--stdin-filepath', GENERATED_FORMAT_PATH],
    { encoding: 'utf8', input: source, maxBuffer: 16 * 1024 * 1024 }
  );
}

function hashBytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function exactRealDirectory(path: string, label: string): string {
  const absolute = resolve(path);
  const status = lstatSync(absolute);
  if (!status.isDirectory() || status.isSymbolicLink()) {
    throw new Error(`${label} must be a real non-symlink directory: ${path}`);
  }
  if (realpathSync(absolute) !== absolute) {
    throw new Error(`${label} may not traverse a symlink: ${path}`);
  }
  return absolute;
}

function readExactSourceFile(
  providerRoot: string,
  providerRelativePath: string,
  label: string
): Buffer {
  if (isAbsolute(providerRelativePath)) {
    throw new Error(`${label} must be provider-relative`);
  }
  const absolute = resolve(providerRoot, providerRelativePath);
  const providerPrefix = providerRoot.endsWith('/')
    ? providerRoot
    : `${providerRoot}/`;
  if (!absolute.startsWith(providerPrefix)) {
    throw new Error(`${label} escapes the provider root`);
  }
  const status = lstatSync(absolute);
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${label} must be a real non-symlink file`);
  }
  if (realpathSync(absolute) !== absolute) {
    throw new Error(`${label} may not traverse a symlink`);
  }
  return readFileSync(absolute);
}

export function generateDwarfCustomizationCatalog({
  providerRoot,
  outputPath,
}: GenerateCatalogInput): GeneratedCatalogReceipt {
  if (!isAbsolute(providerRoot)) {
    throw new Error(
      'The Dwarf catalog requires an explicit absolute provider root.'
    );
  }
  const root = exactRealDirectory(providerRoot, 'Provider root');
  const dirty = execFileSync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    { cwd: root, encoding: 'utf8' }
  );
  if (dirty !== '') throw new Error('Provider checkout must be exactly clean.');
  const providerCommit = execFileSync(
    'git',
    ['rev-parse', '--verify', 'HEAD^{commit}'],
    { cwd: root, encoding: 'utf8' }
  ).trim();
  if (!/^[0-9a-f]{40}$/.test(providerCommit)) {
    throw new Error('Provider HEAD did not resolve to an exact commit.');
  }

  const manifestBytes = readExactSourceFile(
    root,
    MANIFEST_RELATIVE_PATH,
    'Dwarf customization manifest'
  );
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8'));
  } catch (error) {
    throw new Error(`Dwarf customization manifest is not valid JSON: ${error}`);
  }
  const parsed = parseManifest(manifest);
  for (const asset of parsed.sourceAssets) {
    const bytes = readExactSourceFile(
      root,
      asset.providerRelativePath,
      `Dwarf customization asset ${asset.providerRelativePath}`
    );
    if (hashBytes(bytes) !== asset.sha256) {
      throw new Error(
        `Dwarf customization asset hash differs: ${asset.providerRelativePath}`
      );
    }
  }

  const manifestSha256 = hashBytes(manifestBytes);
  const source = renderDwarfCustomizationCatalogModule(manifest, {
    providerCommit,
    manifestSha256,
  });
  const output = resolve(outputPath);
  mkdirSync(dirname(output), { recursive: true });
  try {
    const status = lstatSync(output);
    if (!status.isFile() || status.isSymbolicLink()) {
      throw new Error(
        `Generated catalog target must be a regular file: ${output}`
      );
    }
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      (error as NodeJS.ErrnoException).code !== 'ENOENT'
    ) {
      throw error;
    }
  }
  writeFileSync(output, source, 'utf8');
  return {
    providerCommit,
    manifestSha256,
    bodyCount: 4,
    scalpCount: 38,
    facialHairCount: 18,
  };
}

function cliArgument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing required ${name} argument.`);
  return value;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const receipt = generateDwarfCustomizationCatalog({
    providerRoot: cliArgument('--provider-root'),
    outputPath: cliArgument('--output'),
  });
  process.stdout.write(
    `Generated Dwarf customization catalog from ${receipt.providerCommit} ` +
      `(${receipt.bodyCount} bodies, ${receipt.scalpCount} scalp, ` +
      `${receipt.facialHairCount} facial hair).\n`
  );
}
