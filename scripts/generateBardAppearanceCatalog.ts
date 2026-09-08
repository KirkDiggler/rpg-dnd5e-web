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

const PROVIDER_MANIFEST =
  'harness/models/synty/characters/race-class/manifest.json';
const PROVIDER_SYNTY_ROOT = 'harness/models/synty';
const WEB_SYNTY_ROOT = '/models/synty/';
const BARD_RACES = [
  'dwarf',
  'elf',
  'gnome',
  'half-elf',
  'halfling',
  'half-orc',
  'human',
  'tiefling',
] as const;
const BARD_CLASS_REF = 'dnd5e:classes:bard' as const;
const RIG_FAMILY = 'modular-fantasy-hero-v1' as const;
const BONE_COUNT = 63 as const;
const ANIMATIONS = ['Idle_Relaxed', 'Walk_Forward'] as const;
const SOCKET_PROFILE = 'modular-fantasy-hero-main-hand-v1' as const;
const PALETTES = {
  dwarf: '01-a',
  elf: '01-a',
  gnome: '01-a',
  'half-elf': '01-a',
  halfling: '01-a',
  'half-orc': '01-a-half-orc-olive-40',
  human: '01-a',
  tiefling: '02-a-tiefling-crimson',
} as const satisfies Record<BardAppearanceRaceRef, string>;
const PRETTIER_CLI = fileURLToPath(
  new URL('../node_modules/prettier/bin/prettier.cjs', import.meta.url)
);
const GENERATED_FORMAT_PATH = fileURLToPath(
  new URL('../src/generated/bardAppearanceCatalog.ts', import.meta.url)
);

export type BardAppearanceRaceRef = (typeof BARD_RACES)[number];

export interface BardAppearance {
  readonly combination: `${BardAppearanceRaceRef}:bard`;
  readonly raceRef: `dnd5e:races:${BardAppearanceRaceRef}`;
  readonly classRef: typeof BARD_CLASS_REF;
  readonly url: string;
  readonly sha256: string;
  readonly rigFamily: typeof RIG_FAMILY;
  readonly boneCount: typeof BONE_COUNT;
  readonly animations: typeof ANIMATIONS;
  readonly defaultPalette: string;
}

export interface BardAppearanceCatalog {
  readonly schemaVersion: 1;
  readonly workflowVersion: 'bard-race-class-appearances-v1';
  readonly classRef: typeof BARD_CLASS_REF;
  readonly raceOrder: readonly BardAppearanceRaceRef[];
  readonly appearances: Readonly<Record<BardAppearanceRaceRef, BardAppearance>>;
}

interface GenerateInput {
  readonly providerRoot: string;
  readonly outputPath: string;
}

export interface GeneratedBardAppearanceReceipt {
  readonly providerCommit: string;
  readonly manifestSha256: string;
  readonly appearanceCount: 8;
}

function fail(message: string): never {
  throw new Error(`Bard appearance catalog: ${message}`);
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

function exactString(value: unknown, expected: string, label: string): string {
  if (value !== expected) fail(`${label} must be ${expected}`);
  return expected;
}

function digest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    fail(`${label} must be a lowercase sha256 digest`);
  }
  return value;
}

function exactStringArray(
  value: unknown,
  expected: readonly string[],
  label: string
): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length !== expected.length ||
    value.some((entry, index) => entry !== expected[index])
  ) {
    fail(`${label} must be ${JSON.stringify(expected)}`);
  }
  return expected;
}

function exactNumberArray(
  value: unknown,
  expected: readonly number[],
  label: string
): readonly number[] {
  if (
    !Array.isArray(value) ||
    value.length !== expected.length ||
    value.some((entry, index) => entry !== expected[index])
  ) {
    fail(`${label} must be ${JSON.stringify(expected)}`);
  }
  return expected;
}

function hash(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function projectBardAppearanceManifest(
  value: unknown
): BardAppearanceCatalog {
  const manifest = exactObject(
    value,
    ['schemaVersion', 'workflowVersion', 'socketProfiles', 'combinations'],
    'manifest'
  );
  if (manifest.schemaVersion !== 1) fail('manifest schemaVersion must be 1');
  exactString(
    manifest.workflowVersion,
    'modular-race-class-v1',
    'manifest workflowVersion'
  );
  const combinations = object(manifest.combinations, 'manifest combinations');
  const appearances = {} as Record<BardAppearanceRaceRef, BardAppearance>;

  for (const race of BARD_RACES) {
    const combination = `${race}:bard` as const;
    const row = exactObject(
      combinations[combination],
      [
        'animations',
        'atlasDimensions',
        'class',
        'defaultPalette',
        'model',
        'race',
        'rigFamily',
        'sha256',
        'socketProfile',
      ],
      combination
    );
    exactString(row.class, 'bard', `${combination} class`);
    exactString(row.race, race, `${combination} race`);
    exactString(row.rigFamily, RIG_FAMILY, `${combination} rigFamily`);
    exactString(
      row.socketProfile,
      SOCKET_PROFILE,
      `${combination} socketProfile`
    );
    exactStringArray(row.animations, ANIMATIONS, `${combination} animations`);
    exactNumberArray(
      row.atlasDimensions,
      [1024, 1024],
      `${combination} atlasDimensions`
    );
    exactString(
      row.defaultPalette,
      PALETTES[race],
      `${combination} defaultPalette`
    );
    const model = exactString(
      row.model,
      `characters/race-class/${race}-bard.glb`,
      `${combination} model`
    );

    appearances[race] = {
      combination,
      raceRef: `dnd5e:races:${race}`,
      classRef: BARD_CLASS_REF,
      url: WEB_SYNTY_ROOT + model,
      sha256: digest(row.sha256, `${combination} sha256`),
      rigFamily: RIG_FAMILY,
      boneCount: BONE_COUNT,
      animations: ANIMATIONS,
      defaultPalette: PALETTES[race],
    };
  }

  const providerBards = Object.entries(combinations).filter(
    ([, row]) => object(row, 'combination').class === 'bard'
  );
  if (providerBards.length !== BARD_RACES.length) {
    fail(
      `provider must contain exactly ${BARD_RACES.length} Bard rows, found ${providerBards.length}`
    );
  }

  return {
    schemaVersion: 1,
    workflowVersion: 'bard-race-class-appearances-v1',
    classRef: BARD_CLASS_REF,
    raceOrder: BARD_RACES,
    appearances,
  };
}

const GENERATED_TYPES = `export type BardAppearanceRaceRef =
  | 'dwarf' | 'elf' | 'gnome' | 'half-elf' | 'halfling' | 'half-orc' | 'human' | 'tiefling';
export interface BardAppearance {
  readonly combination: \`${'${BardAppearanceRaceRef}'}:bard\`;
  readonly raceRef: \`dnd5e:races:${'${BardAppearanceRaceRef}'}\`;
  readonly classRef: 'dnd5e:classes:bard';
  readonly url: string; readonly sha256: string;
  readonly rigFamily: 'modular-fantasy-hero-v1'; readonly boneCount: 63;
  readonly animations: readonly ['Idle_Relaxed', 'Walk_Forward'];
  readonly defaultPalette: string;
}
export interface BardAppearanceCatalog {
  readonly schemaVersion: 1;
  readonly workflowVersion: 'bard-race-class-appearances-v1';
  readonly classRef: 'dnd5e:classes:bard';
  readonly raceOrder: readonly BardAppearanceRaceRef[];
  readonly appearances: Readonly<Record<BardAppearanceRaceRef, BardAppearance>>;
}`;

export function renderBardAppearanceCatalogModule(
  catalog: BardAppearanceCatalog,
  authority: {
    readonly providerCommit: string;
    readonly manifestSha256: string;
  }
): string {
  if (!/^[0-9a-f]{40}$/.test(authority.providerCommit)) {
    fail('provider commit must be an exact commit id');
  }
  digest(authority.manifestSha256, 'manifest sha256');
  const source = `/**\n * GENERATED FILE — DO NOT EDIT.\n * Provider commit: ${authority.providerCommit}\n * Race/class manifest SHA-256: ${authority.manifestSha256}\n */\n\n${GENERATED_TYPES}\n\nexport const BARD_APPEARANCE_PROVIDER = Object.freeze(${JSON.stringify(authority, null, 2)} as const);\n\nexport const BARD_APPEARANCE_CATALOG = Object.freeze(${JSON.stringify(catalog, null, 2)} as const satisfies BardAppearanceCatalog);\n`;
  return execFileSync(
    process.execPath,
    [PRETTIER_CLI, '--stdin-filepath', GENERATED_FORMAT_PATH],
    { encoding: 'utf8', input: source }
  );
}

function exactRealDirectory(path: string, label: string): string {
  const absolute = resolve(path);
  const status = lstatSync(absolute);
  if (!status.isDirectory() || status.isSymbolicLink()) {
    fail(`${label} must be a real non-symlink directory`);
  }
  if (realpathSync(absolute) !== absolute) {
    fail(`${label} may not traverse symlinks`);
  }
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

export function generateBardAppearanceCatalog({
  providerRoot,
  outputPath,
}: GenerateInput): GeneratedBardAppearanceReceipt {
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
  if (!/^[0-9a-f]{40}$/.test(providerCommit)) {
    fail('provider HEAD is not exact');
  }

  const manifestBytes = readSource(
    root,
    PROVIDER_MANIFEST,
    'race/class manifest'
  );
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8'));
  } catch (error) {
    fail(`race/class manifest is invalid JSON: ${error}`);
  }
  const catalog = projectBardAppearanceManifest(manifest);
  for (const appearance of Object.values(catalog.appearances)) {
    const modelRelative = appearance.url.slice(WEB_SYNTY_ROOT.length);
    const modelBytes = readSource(
      root,
      `${PROVIDER_SYNTY_ROOT}/${modelRelative}`,
      appearance.combination
    );
    if (hash(modelBytes) !== appearance.sha256) {
      fail(`${appearance.combination} model hash differs from manifest`);
    }
  }

  const manifestSha256 = hash(manifestBytes);
  const source = renderBardAppearanceCatalogModule(catalog, {
    providerCommit,
    manifestSha256,
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
  return { providerCommit, manifestSha256, appearanceCount: 8 };
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
  const receipt = generateBardAppearanceCatalog({
    providerRoot: cliArgument('--provider-root'),
    outputPath: cliArgument('--output'),
  });
  process.stdout.write(
    `Generated ${receipt.appearanceCount} Bard appearances from ${receipt.providerCommit}.\n`
  );
}
