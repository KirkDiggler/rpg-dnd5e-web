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
import {
  projectDwarfCustomizationManifest,
  type DwarfCustomizationCatalog,
} from './generateDwarfCustomizationCatalog';

const PROVIDER_SYNTY_ROOT = 'harness/models/synty/';
const PROVIDER_CUSTOMIZATION_ROOT =
  'harness/models/synty/characters/customization';
const AGGREGATE_MANIFEST = `${PROVIDER_CUSTOMIZATION_ROOT}/manifest.json`;
const OUTFIT_MANIFEST =
  'harness/models/synty/characters/outfit-customization/v1/manifest.json';
const AGGREGATE_MANIFEST_SHA256 =
  '2457ee61b15cb0ef1ca8cd9b42bc30d84d5286510f91e44d8437a6efbc80efac';
const WEB_SYNTY_ROOT = '/models/synty/';
const PROFILE_ORDER = [
  'human',
  'elf',
  'dwarf',
  'half-elf',
  'tiefling',
  'halfling',
  'gnome',
  'half-orc',
] as const;
const CLASSES = [
  ['barbarian', '01'],
  ['fighter', '16'],
  ['monk', '08'],
  ['rogue', '10'],
] as const;
const ANIMATIONS = ['Idle_Relaxed', 'Walk_Forward'] as const;
const SURFACE = {
  mode: 'uniform-pbr-v1',
  defaultColorSrgb: 0x5a3825,
  defaultRoughness: 0.72,
  defaultMetalness: 0,
} as const;
const PRETTIER_CLI = fileURLToPath(
  new URL('../node_modules/prettier/bin/prettier.cjs', import.meta.url)
);
const GENERATED_FORMAT_PATH = fileURLToPath(
  new URL('../src/generated/characterCustomizationCatalog.ts', import.meta.url)
);

export type CustomizationRaceRef = (typeof PROFILE_ORDER)[number];
export type CustomizationStarterClass = (typeof CLASSES)[number][0];
export type CustomizationSlot = 'scalp' | 'facial-hair';
export type CustomizationDefaultSelection =
  | { readonly kind: 'style'; readonly styleRef: string }
  | { readonly kind: 'none' };

export interface CharacterCustomizationStyleOption {
  readonly slot: CustomizationSlot;
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

export interface CharacterCustomizationBody {
  readonly combination: string;
  readonly classRef: CustomizationStarterClass;
  readonly outfit: string;
  readonly url: string;
  readonly sha256: string;
  readonly fallbackUrl: string;
  readonly fallbackSha256: string;
  readonly animations: readonly ['Idle_Relaxed', 'Walk_Forward'];
}

export interface CharacterCustomizationProfile {
  readonly schemaVersion: 2 | 3;
  readonly workflowVersion: string;
  readonly raceRef: CustomizationRaceRef;
  readonly profileRef: string;
  readonly rigFamily: 'modular-fantasy-hero-v1';
  readonly proportions: readonly [number, number, number];
  readonly skeleton: {
    readonly boneCount: 63;
    readonly inverseBindSha256: string;
  };
  readonly animations: readonly ['Idle_Relaxed', 'Walk_Forward'];
  readonly atlas: {
    readonly id: string;
    readonly sha256: string;
    readonly dimensions: readonly [1024, 1024];
  };
  readonly socketProfile: {
    readonly id: 'modular-fantasy-hero-main-hand-v1';
    readonly bone: 'Hand_R';
    readonly boneUnitMeters: number;
    readonly positionMeters: readonly [number, number, number];
    readonly rotationQuaternion: readonly [number, number, number, number];
    readonly scale: 1;
  };
  readonly bodies: Readonly<
    Record<CustomizationStarterClass, CharacterCustomizationBody>
  >;
  readonly slots: {
    readonly scalp: {
      readonly defaultSelection: CustomizationDefaultSelection;
      readonly options: readonly CharacterCustomizationStyleOption[];
    };
    readonly facialHair: {
      readonly defaultSelection: CustomizationDefaultSelection;
      readonly options: readonly CharacterCustomizationStyleOption[];
    };
  };
  readonly surface: typeof SURFACE;
  readonly defaults: {
    readonly scalp: CustomizationDefaultSelection;
    readonly facialHair: CustomizationDefaultSelection;
    readonly colorSrgb: number;
    readonly roughness: number;
    readonly metalness: number;
  };
}

export interface OutfitTreatment {
  readonly classRef: CustomizationStarterClass;
  readonly outfit: '01' | '16' | '08' | '10';
  readonly maskUrl: string;
  readonly maskSha256: string;
  readonly defaultPrimaryColorSrgb: number;
  readonly defaultSecondaryColorSrgb: number;
  readonly meshNames: readonly string[];
}

export interface CharacterCustomizationCatalog {
  readonly schemaVersion: 1;
  readonly workflowVersion: 'character-customization-profiles-v1';
  readonly profileOrder: readonly CustomizationRaceRef[];
  readonly profiles: Readonly<
    Record<CustomizationRaceRef, CharacterCustomizationProfile>
  >;
  readonly outfits: Readonly<
    Record<CustomizationStarterClass, OutfitTreatment>
  >;
}

interface SourceAsset {
  readonly providerRelativePath: string;
  readonly sha256: string;
}

interface ParsedProfile {
  readonly profile: CharacterCustomizationProfile;
  readonly sourceAssets: readonly SourceAsset[];
}

interface AggregateProfileEntry {
  readonly profileRef: string;
  readonly schemaVersion: 2 | 3;
  readonly manifest: string;
  readonly manifestSha256: string;
  readonly runtimeFileCount: 117 | 121;
}

interface ParsedAggregate {
  readonly document: Record<string, unknown>;
  readonly entries: Readonly<
    Record<CustomizationRaceRef, AggregateProfileEntry>
  >;
}

interface GenerateInput {
  readonly providerRoot: string;
  readonly outputPath: string;
}

export interface GeneratedCharacterCustomizationReceipt {
  readonly providerCommit: string;
  readonly aggregateManifestSha256: string;
  readonly outfitManifestSha256: string;
  readonly profileCount: 8;
  readonly bodyCount: 32;
  readonly accessoryCount: 448;
  readonly thumbnailCount: 448;
  readonly sourceAssetCount: 974;
}

function fail(message: string): never {
  throw new Error(`Character customization aggregate: ${message}`);
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function exactObject(
  value: unknown,
  keys: readonly string[],
  label: string
): Record<string, unknown> {
  const result = object(value, label);
  const actual = Object.keys(result).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(`${label} keys must be exactly ${expected.join(', ')}`);
  }
  return result;
}

function nonempty(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${label} must be a non-empty string`);
  }
  return value;
}

function exactString(value: unknown, expected: string, label: string): string {
  const result = nonempty(value, label);
  if (result !== expected) fail(`${label} must be ${expected}`);
  return result;
}

function digest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    fail(`${label} must be a lowercase sha256 digest`);
  }
  return value;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${label} must be finite`);
  }
  return value;
}

function exactNumber(value: unknown, expected: number, label: string): number {
  const result = finite(value, label);
  if (result !== expected) fail(`${label} must be ${expected}`);
  return result;
}

function numberArray(value: unknown, count: number, label: string): number[] {
  if (!Array.isArray(value) || value.length !== count) {
    fail(`${label} must contain ${count} numbers`);
  }
  return value.map((entry, index) => finite(entry, `${label}[${index}]`));
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
  const result = nonempty(value, label);
  const parts = result.split('/');
  if (
    result.startsWith('/') ||
    result.includes('\\') ||
    result.includes('://') ||
    parts.some((part) => part === '' || part === '.' || part === '..') ||
    /\.(?:blend|fbx|zip)$/i.test(result)
  ) {
    fail(`${label} is not a safe portable runtime path`);
  }
  return result;
}

function opaqueRef(value: unknown, label: string): string {
  const result = nonempty(value, label);
  if (result.includes('/') || result.includes('\\') || result.includes('://')) {
    fail(`${label} must be opaque and never a path`);
  }
  return result;
}

function hashBytes(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function expectedOption(slot: CustomizationSlot, index: number) {
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

function providerPathFromUrl(url: string): string {
  if (!url.startsWith(WEB_SYNTY_ROOT))
    fail(`runtime URL escaped Synty root: ${url}`);
  return PROVIDER_SYNTY_ROOT + url.slice(WEB_SYNTY_ROOT.length);
}

function dwarfProfile(value: unknown): ParsedProfile {
  const dwarf = projectDwarfCustomizationManifest(value);
  const assets: SourceAsset[] = [];
  const add = (url: string, sha256: string) =>
    assets.push({ providerRelativePath: providerPathFromUrl(url), sha256 });
  for (const body of Object.values(dwarf.bodies)) {
    add(body.url, body.sha256);
    add(body.fallbackUrl, body.fallbackSha256);
  }
  for (const slot of [dwarf.slots.scalp, dwarf.slots.facialHair]) {
    for (const option of slot.options) {
      add(option.url, option.sha256);
      add(option.thumbnailUrl, option.thumbnailSha256);
    }
  }
  return {
    profile: {
      ...(dwarf as DwarfCustomizationCatalog),
      raceRef: 'dwarf',
      defaults: {
        scalp: { kind: 'style', styleRef: dwarf.defaults.scalpStyleRef },
        facialHair: {
          kind: 'style',
          styleRef: dwarf.defaults.facialHairStyleRef,
        },
        colorSrgb: dwarf.defaults.colorSrgb,
        roughness: dwarf.defaults.roughness,
        metalness: dwarf.defaults.metalness,
      },
      slots: {
        scalp: {
          defaultSelection: {
            kind: 'style',
            styleRef: dwarf.slots.scalp.defaultStyleRef,
          },
          options: dwarf.slots.scalp.options,
        },
        facialHair: {
          defaultSelection: {
            kind: 'style',
            styleRef: dwarf.slots.facialHair.defaultStyleRef,
          },
          options: dwarf.slots.facialHair.options,
        },
      },
    },
    sourceAssets: assets,
  };
}

function defaultSelection(
  value: unknown,
  available: ReadonlySet<string>,
  label: string
): CustomizationDefaultSelection {
  const source = object(value, label);
  if (source.kind === 'none') {
    exactObject(source, ['kind'], label);
    return { kind: 'none' };
  }
  const style = exactObject(source, ['kind', 'styleRef'], label);
  exactString(style.kind, 'style', `${label}.kind`);
  const styleRef = opaqueRef(style.styleRef, `${label}.styleRef`);
  if (!available.has(styleRef)) fail(`${label}.styleRef is not an option`);
  return { kind: 'style', styleRef };
}

function newProfile(
  value: unknown,
  raceRef: Exclude<CustomizationRaceRef, 'dwarf'>,
  entry: AggregateProfileEntry
): ParsedProfile {
  const manifest = exactObject(
    value,
    [
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
    ],
    `${raceRef} manifest`
  );
  if (manifest.schemaVersion !== 3) fail(`${raceRef} schemaVersion must be 3`);
  exactString(
    manifest.workflowVersion,
    'character-customization-profile-v1',
    `${raceRef}.workflowVersion`
  );
  exactString(manifest.profileRef, entry.profileRef, `${raceRef}.profileRef`);
  exactString(manifest.raceRef, raceRef, `${raceRef}.raceRef`);
  exactString(
    manifest.rigFamily,
    'modular-fantasy-hero-v1',
    `${raceRef}.rigFamily`
  );
  const proportions = numberArray(
    manifest.proportions,
    3,
    `${raceRef}.proportions`
  );
  if (proportions.some((number) => number <= 0)) {
    fail(`${raceRef}.proportions must be positive`);
  }
  exactStringArray(manifest.animations, ANIMATIONS, `${raceRef}.animations`);
  const skeleton = exactObject(
    manifest.skeleton,
    ['boneCount', 'inverseBindSha256'],
    `${raceRef}.skeleton`
  );
  if (skeleton.boneCount !== 63)
    fail(`${raceRef}.skeleton.boneCount must be 63`);
  const inverseBindSha256 = digest(
    skeleton.inverseBindSha256,
    `${raceRef}.skeleton.inverseBindSha256`
  );
  const atlas = exactObject(
    manifest.atlas,
    ['dimensions', 'id', 'sha256'],
    `${raceRef}.atlas`
  );
  const atlasDimensions = numberArray(
    atlas.dimensions,
    2,
    `${raceRef}.atlas.dimensions`
  );
  if (atlasDimensions[0] !== 1024 || atlasDimensions[1] !== 1024) {
    fail(`${raceRef}.atlas.dimensions must be 1024x1024`);
  }
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
    `${raceRef}.socketProfile`
  );
  exactString(
    socket.id,
    'modular-fantasy-hero-main-hand-v1',
    `${raceRef}.socketProfile.id`
  );
  exactString(socket.bone, 'Hand_R', `${raceRef}.socketProfile.bone`);
  const positionMeters = numberArray(
    socket.positionMeters,
    3,
    `${raceRef}.socketProfile.positionMeters`
  );
  const rotationQuaternion = numberArray(
    socket.rotationQuaternion,
    4,
    `${raceRef}.socketProfile.rotationQuaternion`
  );
  const surface = exactObject(
    manifest.surface,
    ['defaultColorSrgb', 'defaultMetalness', 'defaultRoughness', 'mode'],
    `${raceRef}.surface`
  );
  exactString(surface.mode, SURFACE.mode, `${raceRef}.surface.mode`);
  exactNumber(
    surface.defaultColorSrgb,
    SURFACE.defaultColorSrgb,
    `${raceRef}.surface.defaultColorSrgb`
  );
  exactNumber(
    surface.defaultRoughness,
    SURFACE.defaultRoughness,
    `${raceRef}.surface.defaultRoughness`
  );
  exactNumber(
    surface.defaultMetalness,
    SURFACE.defaultMetalness,
    `${raceRef}.surface.defaultMetalness`
  );

  const runtimeRoot = `${PROVIDER_CUSTOMIZATION_ROOT}/${raceRef}-v1`;
  const webRoot = `${WEB_SYNTY_ROOT}characters/customization/${raceRef}-v1/`;
  const sourceAssets: SourceAsset[] = [];
  const seenPaths = new Set<string>();
  const add = (relative: string, sha256: string, label: string) => {
    const providerRelativePath = relative.startsWith(PROVIDER_SYNTY_ROOT)
      ? relative
      : `${runtimeRoot}/${relative}`;
    if (seenPaths.has(providerRelativePath)) fail(`${label} path collision`);
    seenPaths.add(providerRelativePath);
    sourceAssets.push({ providerRelativePath, sha256 });
    return relative.startsWith(PROVIDER_SYNTY_ROOT)
      ? WEB_SYNTY_ROOT + relative.slice(PROVIDER_SYNTY_ROOT.length)
      : webRoot + relative;
  };

  const bodiesSource = exactObject(
    manifest.bodies,
    CLASSES.map(([classRef]) => `${raceRef}:${classRef}`),
    `${raceRef}.bodies`
  );
  const bodies = {} as Record<
    CustomizationStarterClass,
    CharacterCustomizationBody
  >;
  for (const [classRef, outfit] of CLASSES) {
    const combination = `${raceRef}:${classRef}`;
    const label = `${raceRef}.bodies.${combination}`;
    const body = exactObject(
      bodiesSource[combination],
      [
        'animations',
        'class',
        'combination',
        'fallback',
        'outfit',
        'path',
        'sha256',
        'sourceMeshes',
      ],
      label
    );
    exactString(body.combination, combination, `${label}.combination`);
    exactString(body.class, classRef, `${label}.class`);
    exactString(body.outfit, outfit, `${label}.outfit`);
    exactStringArray(body.animations, ANIMATIONS, `${label}.animations`);
    if (
      !Array.isArray(body.sourceMeshes) ||
      body.sourceMeshes.length === 0 ||
      body.sourceMeshes.some(
        (mesh) =>
          typeof mesh !== 'string' || mesh.length === 0 || mesh.includes('Hair')
      )
    ) {
      fail(`${label}.sourceMeshes must be non-empty hairless mesh names`);
    }
    const path = portablePath(body.path, `${label}.path`);
    const expectedPath = `bodies/${raceRef}-${classRef}-body.glb`;
    if (path !== expectedPath) fail(`${label}.path must be ${expectedPath}`);
    const bodySha256 = digest(body.sha256, `${label}.sha256`);
    const fallback = exactObject(
      body.fallback,
      ['path', 'sha256'],
      `${label}.fallback`
    );
    const fallbackPath = portablePath(fallback.path, `${label}.fallback.path`);
    const expectedFallback =
      raceRef === 'human'
        ? `fallbacks/human-${classRef}-complete.glb`
        : `${PROVIDER_SYNTY_ROOT}characters/race-class/${raceRef}-${classRef}.glb`;
    if (fallbackPath !== expectedFallback) {
      fail(`${label}.fallback.path must be ${expectedFallback}`);
    }
    const fallbackSha256 = digest(fallback.sha256, `${label}.fallback.sha256`);
    bodies[classRef] = {
      combination,
      classRef,
      outfit,
      url: add(path, bodySha256, `${label}.path`),
      sha256: bodySha256,
      fallbackUrl: add(fallbackPath, fallbackSha256, `${label}.fallback.path`),
      fallbackSha256,
      animations: [...ANIMATIONS],
    };
  }

  const slotsSource = exactObject(
    manifest.slots,
    ['facial-hair', 'scalp'],
    `${raceRef}.slots`
  );
  const parseSlot = (slot: CustomizationSlot, count: number) => {
    const source = exactObject(
      slotsSource[slot],
      ['defaultSelection', 'options', 'slot'],
      `${raceRef}.slots.${slot}`
    );
    exactString(source.slot, slot, `${raceRef}.slots.${slot}.slot`);
    if (!Array.isArray(source.options) || source.options.length !== count) {
      fail(`${raceRef}.slots.${slot}.options must contain ${count} entries`);
    }
    const options = source.options.map((value, zeroIndex) => {
      const expected = expectedOption(slot, zeroIndex + 1);
      const label = `${raceRef}.slots.${slot}.options[${zeroIndex}]`;
      const option = exactObject(
        value,
        [
          'animations',
          'label',
          'material',
          'path',
          'sha256',
          'sourceMesh',
          'styleRef',
          'thumbnailPath',
          'thumbnailSha256',
        ],
        label
      );
      const optionRef = opaqueRef(option.styleRef, `${label}.styleRef`);
      if (optionRef !== expected.styleRef) fail(`${label}.styleRef differs`);
      exactString(option.label, expected.label, `${label}.label`);
      exactString(
        option.sourceMesh,
        expected.sourceMesh,
        `${label}.sourceMesh`
      );
      const path = portablePath(option.path, `${label}.path`);
      if (path !== expected.path) fail(`${label}.path differs`);
      const thumbnail = portablePath(
        option.thumbnailPath,
        `${label}.thumbnailPath`
      );
      if (thumbnail !== expected.thumbnail) {
        fail(`${label}.thumbnailPath differs`);
      }
      exactStringArray(option.animations, [], `${label}.animations`);
      const material = exactObject(
        option.material,
        ['count', 'mode', 'opaque', 'textureCount'],
        `${label}.material`
      );
      if (
        material.mode !== 'uniform-pbr-v1' ||
        material.count !== 1 ||
        material.textureCount !== 0 ||
        material.opaque !== true
      ) {
        fail(`${label}.material differs from uniform-PBR authority`);
      }
      const optionSha256 = digest(option.sha256, `${label}.sha256`);
      const thumbnailSha256 = digest(
        option.thumbnailSha256,
        `${label}.thumbnailSha256`
      );
      return {
        slot,
        styleRef: optionRef,
        label: expected.label,
        url: add(path, optionSha256, `${label}.path`),
        sha256: optionSha256,
        thumbnailUrl: add(thumbnail, thumbnailSha256, `${label}.thumbnailPath`),
        thumbnailSha256,
        animations: [] as const,
        material: {
          mode: 'uniform-pbr-v1' as const,
          count: 1 as const,
          textureCount: 0 as const,
          opaque: true as const,
        },
      };
    });
    const selection = defaultSelection(
      source.defaultSelection,
      new Set(options.map((option) => option.styleRef)),
      `${raceRef}.slots.${slot}.defaultSelection`
    );
    return { defaultSelection: selection, options };
  };
  const scalp = parseSlot('scalp', 38);
  const facialHair = parseSlot('facial-hair', 18);
  if (sourceAssets.length !== 120) {
    fail(
      `${raceRef} must resolve exactly 120 body/fallback/style/thumbnail files`
    );
  }
  return {
    profile: {
      schemaVersion: 3,
      workflowVersion: 'character-customization-profile-v1',
      raceRef,
      profileRef: entry.profileRef,
      rigFamily: 'modular-fantasy-hero-v1',
      proportions: proportions as [number, number, number],
      skeleton: { boneCount: 63, inverseBindSha256 },
      animations: [...ANIMATIONS],
      atlas: {
        id: nonempty(atlas.id, `${raceRef}.atlas.id`),
        sha256: digest(atlas.sha256, `${raceRef}.atlas.sha256`),
        dimensions: [1024, 1024],
      },
      socketProfile: {
        id: 'modular-fantasy-hero-main-hand-v1',
        bone: 'Hand_R',
        boneUnitMeters: finite(
          socket.boneUnitMeters,
          `${raceRef}.socketProfile.boneUnitMeters`
        ),
        positionMeters: positionMeters as [number, number, number],
        rotationQuaternion: rotationQuaternion as [
          number,
          number,
          number,
          number,
        ],
        scale: exactNumber(
          socket.scale,
          1,
          `${raceRef}.socketProfile.scale`
        ) as 1,
      },
      bodies,
      slots: { scalp, facialHair },
      surface: { ...SURFACE },
      defaults: {
        scalp: scalp.defaultSelection,
        facialHair: facialHair.defaultSelection,
        colorSrgb: SURFACE.defaultColorSrgb,
        roughness: SURFACE.defaultRoughness,
        metalness: SURFACE.defaultMetalness,
      },
    },
    sourceAssets,
  };
}

function parseAggregate(value: unknown): ParsedAggregate {
  const aggregate = exactObject(
    value,
    [
      'inventory',
      'profileOrder',
      'profiles',
      'schemaVersion',
      'workflowVersion',
    ],
    'aggregate manifest'
  );
  if (aggregate.schemaVersion !== 1) fail('aggregate schemaVersion must be 1');
  exactString(
    aggregate.workflowVersion,
    'character-customization-profiles-v1',
    'aggregate workflowVersion'
  );
  exactStringArray(
    aggregate.profileOrder,
    PROFILE_ORDER,
    'aggregate profileOrder'
  );
  const inventory = exactObject(
    aggregate.inventory,
    [
      'accessoryCount',
      'bodyCount',
      'compatibilityCheckCount',
      'profileCount',
      'profileRuntimeFileCount',
      'thumbnailCount',
    ],
    'aggregate inventory'
  );
  for (const [field, expected] of Object.entries({
    accessoryCount: 448,
    bodyCount: 32,
    compatibilityCheckCount: 1792,
    profileCount: 8,
    profileRuntimeFileCount: 940,
    thumbnailCount: 448,
  })) {
    exactNumber(inventory[field], expected, `aggregate inventory.${field}`);
  }
  const source = exactObject(
    aggregate.profiles,
    PROFILE_ORDER,
    'aggregate profiles'
  );
  const entries = {} as Record<CustomizationRaceRef, AggregateProfileEntry>;
  for (const raceRef of PROFILE_ORDER) {
    const entry = exactObject(
      source[raceRef],
      [
        'manifest',
        'manifestSha256',
        'profileRef',
        'runtimeFileCount',
        'schemaVersion',
      ],
      `aggregate profiles.${raceRef}`
    );
    const schemaVersion = raceRef === 'dwarf' ? 2 : 3;
    const runtimeFileCount = raceRef === 'human' ? 121 : 117;
    if (entry.schemaVersion !== schemaVersion) {
      fail(`aggregate profiles.${raceRef}.schemaVersion differs`);
    }
    if (entry.runtimeFileCount !== runtimeFileCount) {
      fail(`aggregate profiles.${raceRef}.runtimeFileCount differs`);
    }
    entries[raceRef] = {
      profileRef: exactString(
        entry.profileRef,
        `modular-fantasy-hero-v1:${raceRef}`,
        `aggregate profiles.${raceRef}.profileRef`
      ),
      schemaVersion,
      manifest: exactString(
        entry.manifest,
        `${PROVIDER_CUSTOMIZATION_ROOT}/${raceRef}-v1/manifest.json`,
        `aggregate profiles.${raceRef}.manifest`
      ),
      manifestSha256: digest(
        entry.manifestSha256,
        `aggregate profiles.${raceRef}.manifestSha256`
      ),
      runtimeFileCount,
    };
  }
  return { document: aggregate, entries };
}

function projectOutfitManifest(
  value: unknown,
  authority: {
    readonly aggregateManifestSha256: string;
    readonly profiles: readonly CharacterCustomizationProfile[];
  }
): {
  readonly treatments: Record<CustomizationStarterClass, OutfitTreatment>;
  readonly sourceAssets: readonly SourceAsset[];
} {
  const manifest = exactObject(
    value,
    [
      'atlas',
      'channelEncoding',
      'classOrder',
      'inventory',
      'outfits',
      'profileAuthority',
      'schemaVersion',
      'workflowVersion',
    ],
    'outfit manifest'
  );
  if (manifest.schemaVersion !== 1)
    fail('outfit manifest schemaVersion must be 1');
  exactString(
    manifest.workflowVersion,
    'class-outfit-colors-v1',
    'outfit manifest workflowVersion'
  );
  exactStringArray(
    manifest.classOrder,
    CLASSES.map(([classRef]) => classRef),
    'outfit manifest classOrder'
  );
  const inventory = exactObject(
    manifest.inventory,
    ['maskCount', 'runtimeFileCount'],
    'outfit manifest inventory'
  );
  exactNumber(inventory.maskCount, 4, 'outfit manifest inventory.maskCount');
  exactNumber(
    inventory.runtimeFileCount,
    5,
    'outfit manifest inventory.runtimeFileCount'
  );
  const channelEncoding = exactObject(
    manifest.channelEncoding,
    ['overlapAllowed', 'preserve', 'primary', 'secondary'],
    'outfit manifest channelEncoding'
  );
  if (
    channelEncoding.overlapAllowed !== false ||
    channelEncoding.preserve !== 'black' ||
    channelEncoding.primary !== 'red' ||
    channelEncoding.secondary !== 'green'
  ) {
    fail(
      'outfit manifest channelEncoding differs from red/green mask authority'
    );
  }
  const profileAuthority = exactObject(
    manifest.profileAuthority,
    ['manifest', 'sha256'],
    'outfit manifest profileAuthority'
  );
  exactString(
    profileAuthority.manifest,
    'characters/customization/manifest.json',
    'outfit manifest profileAuthority.manifest'
  );
  exactString(
    profileAuthority.sha256,
    authority.aggregateManifestSha256,
    'outfit manifest profileAuthority.sha256'
  );
  const atlas = exactObject(
    manifest.atlas,
    ['dimensions', 'id', 'sha256'],
    'outfit manifest atlas'
  );
  const dimensions = numberArray(
    atlas.dimensions,
    2,
    'outfit manifest atlas.dimensions'
  );
  const atlasProjection = {
    id: nonempty(atlas.id, 'outfit manifest atlas.id'),
    sha256: digest(atlas.sha256, 'outfit manifest atlas.sha256'),
    dimensions: dimensions as [number, number],
  };
  const sharedHumanAtlas = authority.profiles.find(
    (profile) => profile.raceRef === 'human'
  )?.atlas;
  if (
    !sharedHumanAtlas ||
    atlasProjection.dimensions[0] !== 1024 ||
    atlasProjection.dimensions[1] !== 1024 ||
    sharedHumanAtlas.id !== atlasProjection.id ||
    sharedHumanAtlas.sha256 !== atlasProjection.sha256 ||
    sharedHumanAtlas.dimensions[0] !== atlasProjection.dimensions[0] ||
    sharedHumanAtlas.dimensions[1] !== atlasProjection.dimensions[1]
  ) {
    fail('outfit manifest atlas must match the shared human outfit atlas');
  }
  const source = exactObject(
    manifest.outfits,
    CLASSES.map(([classRef]) => classRef),
    'outfit manifest outfits'
  );
  const treatments = {} as Record<CustomizationStarterClass, OutfitTreatment>;
  const sourceAssets: SourceAsset[] = [];
  for (const [classRef, outfit] of CLASSES) {
    const label = `outfit manifest outfits.${classRef}`;
    const entry = exactObject(
      source[classRef],
      [
        'classRef',
        'defaultPrimarySrgb',
        'defaultSecondarySrgb',
        'mask',
        'maskSha256',
        'meshNames',
        'outfit',
      ],
      label
    );
    exactString(entry.classRef, classRef, `${label}.classRef`);
    exactString(entry.outfit, outfit, `${label}.outfit`);
    const validateColor = (candidate: unknown, name: string) => {
      const color = finite(candidate, name);
      if (!Number.isInteger(color) || color < 0 || color > 0xffffff) {
        fail(`${name} must be an RGB24 integer`);
      }
      return color;
    };
    const mask = portablePath(entry.mask, `${label}.mask`);
    const expectedMask = `characters/outfit-customization/v1/masks/${classRef}-${outfit}.png`;
    if (mask !== expectedMask) fail(`${label}.mask must be ${expectedMask}`);
    if (!Array.isArray(entry.meshNames) || entry.meshNames.length === 0) {
      fail(`${label}.meshNames must be non-empty`);
    }
    const meshNames = entry.meshNames.map((name, index) => {
      const mesh = nonempty(name, `${label}.meshNames[${index}]`);
      if (mesh.includes('/') || mesh.includes('\\')) {
        fail(`${label}.meshNames[${index}] must be a mesh name`);
      }
      return mesh;
    });
    if (new Set(meshNames).size !== meshNames.length) {
      fail(`${label}.meshNames must not contain duplicates`);
    }
    const maskSha256 = digest(entry.maskSha256, `${label}.maskSha256`);
    treatments[classRef] = {
      classRef,
      outfit: outfit as OutfitTreatment['outfit'],
      maskUrl: `${WEB_SYNTY_ROOT}${mask}`,
      maskSha256,
      defaultPrimaryColorSrgb: validateColor(
        entry.defaultPrimarySrgb,
        `${label}.defaultPrimarySrgb`
      ),
      defaultSecondaryColorSrgb: validateColor(
        entry.defaultSecondarySrgb,
        `${label}.defaultSecondarySrgb`
      ),
      meshNames,
    };
    sourceAssets.push({
      providerRelativePath: `${PROVIDER_SYNTY_ROOT}${mask}`,
      sha256: maskSha256,
    });
  }
  return { treatments, sourceAssets };
}

function projectInternal(
  aggregateValue: unknown,
  manifests: Readonly<Record<string, unknown>>,
  outfitManifest: unknown
): {
  readonly catalog: CharacterCustomizationCatalog;
  readonly profiles: readonly ParsedProfile[];
  readonly outfitAssets: readonly SourceAsset[];
} {
  const aggregate = parseAggregate(aggregateValue);
  exactObject(manifests, PROFILE_ORDER, 'profile manifests');
  const parsed = PROFILE_ORDER.map((raceRef) =>
    raceRef === 'dwarf'
      ? dwarfProfile(manifests[raceRef])
      : newProfile(manifests[raceRef], raceRef, aggregate.entries[raceRef])
  );
  for (const [index, value] of parsed.entries()) {
    const raceRef = PROFILE_ORDER[index];
    if (value.profile.raceRef !== raceRef)
      fail(`${raceRef} profile order differs`);
    if (value.profile.profileRef !== aggregate.entries[raceRef].profileRef) {
      fail(`${raceRef} profileRef differs from aggregate`);
    }
  }
  const outfits = projectOutfitManifest(outfitManifest, {
    aggregateManifestSha256: AGGREGATE_MANIFEST_SHA256,
    profiles: parsed.map((value) => value.profile),
  });
  return {
    catalog: {
      schemaVersion: 1,
      workflowVersion: 'character-customization-profiles-v1',
      profileOrder: [...PROFILE_ORDER],
      profiles: Object.fromEntries(
        parsed.map((value) => [value.profile.raceRef, value.profile])
      ) as Record<CustomizationRaceRef, CharacterCustomizationProfile>,
      outfits: outfits.treatments,
    },
    profiles: parsed,
    outfitAssets: outfits.sourceAssets,
  };
}

export function projectCharacterCustomizationAuthority(
  aggregate: unknown,
  manifests: Readonly<Record<string, unknown>>,
  outfitManifest: unknown
): CharacterCustomizationCatalog {
  return projectInternal(aggregate, manifests, outfitManifest).catalog;
}

const GENERATED_TYPES = `export type CustomizationRaceRef = 'human' | 'elf' | 'dwarf' | 'half-elf' | 'tiefling' | 'halfling' | 'gnome' | 'half-orc';
export type CustomizationStarterClass = 'barbarian' | 'fighter' | 'monk' | 'rogue';
export type CustomizationSlot = 'scalp' | 'facial-hair';
export type CustomizationDefaultSelection =
  | { readonly kind: 'style'; readonly styleRef: string }
  | { readonly kind: 'none' };
export interface CharacterCustomizationStyleOption {
  readonly slot: CustomizationSlot; readonly styleRef: string; readonly label: string;
  readonly url: string; readonly sha256: string; readonly thumbnailUrl: string;
  readonly thumbnailSha256: string; readonly animations: readonly [];
  readonly material: { readonly mode: 'uniform-pbr-v1'; readonly count: 1; readonly textureCount: 0; readonly opaque: true };
}
export interface CharacterCustomizationBody {
  readonly combination: string; readonly classRef: CustomizationStarterClass; readonly outfit: string;
  readonly url: string; readonly sha256: string; readonly fallbackUrl: string; readonly fallbackSha256: string;
  readonly animations: readonly ['Idle_Relaxed', 'Walk_Forward'];
}
export interface CharacterCustomizationProfile {
  readonly schemaVersion: 2 | 3; readonly workflowVersion: string; readonly raceRef: CustomizationRaceRef;
  readonly profileRef: string; readonly rigFamily: 'modular-fantasy-hero-v1'; readonly proportions: readonly [number, number, number];
  readonly skeleton: { readonly boneCount: 63; readonly inverseBindSha256: string };
  readonly animations: readonly ['Idle_Relaxed', 'Walk_Forward'];
  readonly atlas: { readonly id: string; readonly sha256: string; readonly dimensions: readonly [1024, 1024] };
  readonly socketProfile: { readonly id: 'modular-fantasy-hero-main-hand-v1'; readonly bone: 'Hand_R'; readonly boneUnitMeters: number; readonly positionMeters: readonly [number, number, number]; readonly rotationQuaternion: readonly [number, number, number, number]; readonly scale: 1 };
  readonly bodies: Readonly<Record<CustomizationStarterClass, CharacterCustomizationBody>>;
  readonly slots: {
    readonly scalp: { readonly defaultSelection: CustomizationDefaultSelection; readonly options: readonly CharacterCustomizationStyleOption[] };
    readonly facialHair: { readonly defaultSelection: CustomizationDefaultSelection; readonly options: readonly CharacterCustomizationStyleOption[] };
  };
  readonly surface: { readonly mode: 'uniform-pbr-v1'; readonly defaultColorSrgb: number; readonly defaultRoughness: number; readonly defaultMetalness: number };
  readonly defaults: { readonly scalp: CustomizationDefaultSelection; readonly facialHair: CustomizationDefaultSelection; readonly colorSrgb: number; readonly roughness: number; readonly metalness: number };
}
export interface OutfitTreatment {
  readonly classRef: CustomizationStarterClass; readonly outfit: '01' | '16' | '08' | '10';
  readonly maskUrl: string; readonly maskSha256: string;
  readonly defaultPrimaryColorSrgb: number; readonly defaultSecondaryColorSrgb: number;
  readonly meshNames: readonly string[];
}
export interface CharacterCustomizationCatalog {
  readonly schemaVersion: 1; readonly workflowVersion: 'character-customization-profiles-v1';
  readonly profileOrder: readonly CustomizationRaceRef[];
  readonly profiles: Readonly<Record<CustomizationRaceRef, CharacterCustomizationProfile>>;
  readonly outfits: Readonly<Record<CustomizationStarterClass, OutfitTreatment>>;
}`;

export function renderCharacterCustomizationCatalogModule(
  catalog: CharacterCustomizationCatalog,
  authority: {
    readonly providerCommit: string;
    readonly aggregateManifestSha256: string;
    readonly outfitManifestSha256: string;
  }
): string {
  if (!/^[0-9a-f]{40}$/.test(authority.providerCommit)) {
    fail('provider commit must be an exact commit id');
  }
  digest(authority.aggregateManifestSha256, 'aggregate manifest sha256');
  digest(authority.outfitManifestSha256, 'outfit manifest sha256');
  const source = `/**\n * GENERATED FILE — DO NOT EDIT.\n * Provider commit: ${authority.providerCommit}\n * Aggregate manifest SHA-256: ${authority.aggregateManifestSha256}\n */\n\n${GENERATED_TYPES}\n\nexport const CHARACTER_CUSTOMIZATION_PROVIDER = Object.freeze(${JSON.stringify(authority, null, 2)} as const);\n\nexport const CHARACTER_CUSTOMIZATION_CATALOG = Object.freeze(${JSON.stringify(catalog, null, 2)} as const satisfies CharacterCustomizationCatalog);\n`;
  return execFileSync(
    process.execPath,
    [PRETTIER_CLI, '--stdin-filepath', GENERATED_FORMAT_PATH],
    { encoding: 'utf8', input: source, maxBuffer: 32 * 1024 * 1024 }
  );
}

function exactRealDirectory(path: string, label: string): string {
  const absolute = resolve(path);
  const status = lstatSync(absolute);
  if (!status.isDirectory() || status.isSymbolicLink()) {
    fail(`${label} must be a real non-symlink directory`);
  }
  if (realpathSync(absolute) !== absolute)
    fail(`${label} may not traverse symlinks`);
  return absolute;
}

function readSource(root: string, relative: string, label: string): Buffer {
  if (isAbsolute(relative)) fail(`${label} must be provider-relative`);
  const absolute = resolve(root, relative);
  if (!absolute.startsWith(`${root}/`)) fail(`${label} escapes provider root`);
  const status = lstatSync(absolute);
  if (
    !status.isFile() ||
    status.isSymbolicLink() ||
    realpathSync(absolute) !== absolute
  ) {
    fail(`${label} must be a real non-symlink file`);
  }
  return readFileSync(absolute);
}

export function generateCharacterCustomizationCatalog({
  providerRoot,
  outputPath,
}: GenerateInput): GeneratedCharacterCustomizationReceipt {
  if (!isAbsolute(providerRoot)) fail('provider root must be absolute');
  const root = exactRealDirectory(providerRoot, 'provider root');
  const dirty = execFileSync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    { cwd: root, encoding: 'utf8' }
  );
  if (dirty !== '') fail('provider checkout must be exactly clean');
  const providerCommit = execFileSync(
    'git',
    ['rev-parse', '--verify', 'HEAD^{commit}'],
    { cwd: root, encoding: 'utf8' }
  ).trim();
  if (!/^[0-9a-f]{40}$/.test(providerCommit))
    fail('provider HEAD is not exact');

  const aggregateBytes = readSource(
    root,
    AGGREGATE_MANIFEST,
    'aggregate manifest'
  );
  let aggregateValue: unknown;
  try {
    aggregateValue = JSON.parse(aggregateBytes.toString('utf8'));
  } catch (error) {
    fail(`aggregate manifest is invalid JSON: ${error}`);
  }
  const aggregate = parseAggregate(aggregateValue);
  if (hashBytes(aggregateBytes) !== AGGREGATE_MANIFEST_SHA256) {
    fail('aggregate manifest hash differs from approved authority');
  }
  const outfitBytes = readSource(root, OUTFIT_MANIFEST, 'outfit manifest');
  let outfitValue: unknown;
  try {
    outfitValue = JSON.parse(outfitBytes.toString('utf8'));
  } catch (error) {
    fail(`outfit manifest is invalid JSON: ${error}`);
  }
  const outfitManifestSha256 = hashBytes(outfitBytes);
  const manifests: Record<string, unknown> = {};
  const manifestAssets: SourceAsset[] = [];
  for (const raceRef of PROFILE_ORDER) {
    const entry = aggregate.entries[raceRef];
    const bytes = readSource(root, entry.manifest, `${raceRef} manifest`);
    if (hashBytes(bytes) !== entry.manifestSha256) {
      fail(`${raceRef} manifest hash differs from aggregate`);
    }
    try {
      manifests[raceRef] = JSON.parse(bytes.toString('utf8'));
    } catch (error) {
      fail(`${raceRef} manifest is invalid JSON: ${error}`);
    }
    manifestAssets.push({
      providerRelativePath: entry.manifest,
      sha256: entry.manifestSha256,
    });
  }
  const projected = projectInternal(aggregateValue, manifests, outfitValue);
  const sourceAssets: SourceAsset[] = [
    {
      providerRelativePath: AGGREGATE_MANIFEST,
      sha256: hashBytes(aggregateBytes),
    },
    {
      providerRelativePath: OUTFIT_MANIFEST,
      sha256: outfitManifestSha256,
    },
    ...manifestAssets,
    ...projected.profiles.flatMap((profile) => profile.sourceAssets),
    ...projected.outfitAssets,
  ];
  const unique = new Map<string, string>();
  for (const asset of sourceAssets) {
    if (unique.has(asset.providerRelativePath)) {
      fail(`source asset path collision: ${asset.providerRelativePath}`);
    }
    unique.set(asset.providerRelativePath, asset.sha256);
    const bytes = readSource(
      root,
      asset.providerRelativePath,
      asset.providerRelativePath
    );
    if (hashBytes(bytes) !== asset.sha256) {
      fail(`source asset hash differs: ${asset.providerRelativePath}`);
    }
  }
  if (sourceAssets.length !== 974) {
    fail(
      `source authority must contain exactly 974 files, found ${sourceAssets.length}`
    );
  }
  const aggregateManifestSha256 = hashBytes(aggregateBytes);
  const source = renderCharacterCustomizationCatalogModule(projected.catalog, {
    providerCommit,
    aggregateManifestSha256,
    outfitManifestSha256,
  });
  const output = resolve(outputPath);
  mkdirSync(dirname(output), { recursive: true });
  try {
    const status = lstatSync(output);
    if (!status.isFile() || status.isSymbolicLink()) {
      fail('generated catalog target must be a regular file');
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
    aggregateManifestSha256,
    outfitManifestSha256,
    profileCount: 8,
    bodyCount: 32,
    accessoryCount: 448,
    thumbnailCount: 448,
    sourceAssetCount: 974,
  };
}

function cliArgument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) fail(`missing ${name}`);
  return value;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const receipt = generateCharacterCustomizationCatalog({
    providerRoot: cliArgument('--provider-root'),
    outputPath: cliArgument('--output'),
  });
  process.stdout.write(
    `Generated aggregate customization catalog from ${receipt.providerCommit} ` +
      `(${receipt.profileCount} profiles, ${receipt.sourceAssetCount} source files).\n`
  );
}
