export type ShellVec3 = readonly [number, number, number];

export interface DungeonShellArtifact {
  readonly file: `env/${string}.glb`;
  readonly sha256: string;
  readonly bounds: {
    readonly min: ShellVec3;
    readonly max: ShellVec3;
  };
}

export interface DungeonShellFloorProfile {
  readonly diffuse: `textures/${string}.png`;
  readonly sha256: string;
  readonly worldUnitsPerRepeat: number;
}

export interface DungeonShellWallProfile {
  readonly body: DungeonShellArtifact & {
    readonly localSpanAxis: '+X';
    readonly localFaceAxis: 'Z';
    readonly twoSided: true;
  };
  readonly base: DungeonShellArtifact;
  readonly cap: DungeonShellArtifact;
  readonly doorSurround: DungeonShellArtifact;
}

export interface DungeonShellProfile {
  readonly floor: DungeonShellFloorProfile;
  readonly wall: DungeonShellWallProfile;
}

export interface DungeonShellCatalog {
  readonly schemaVersion: 1;
  readonly profiles: { readonly crypt: DungeonShellProfile };
}

export type DungeonShellManifestResult =
  | { readonly ok: true; readonly catalog: DungeonShellCatalog }
  | { readonly ok: false; readonly reason: string };

const SHA256 = /^[a-f0-9]{64}$/;
const TEXTURE_PATH = /^textures\/[A-Za-z0-9_.-]+\.png$/;
const ARTIFACT_PATH = /^env\/[A-Za-z0-9_.-]+\.glb$/;
const GENERIC_FAILURE = Object.freeze({
  ok: false as const,
  reason: 'manifest could not be safely inspected',
});
const validationFailureReasons = new WeakMap<object, string>();

function invalid(reason: string): never {
  const failure = Object.freeze(Object.create(null) as object);
  validationFailureReasons.set(failure, reason);
  throw failure;
}

function exactKeys(
  value: unknown,
  expected: readonly string[],
  label: string
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    invalid(`${label} must be an object`);

  const source = value as Record<string, unknown>;
  const keys = Reflect.ownKeys(source);
  if (
    keys.length !== expected.length ||
    !keys.every((key): key is string => typeof key === 'string') ||
    !expected.every((key) => keys.includes(key))
  )
    invalid(`${label} must contain exact keys`);

  const snapshot: Record<string, unknown> = Object.create(null);
  for (const key of expected) snapshot[key] = source[key];
  return snapshot;
}

function exactArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) invalid(`${label} must be an array`);
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== value.length + 1 ||
    !keys.every((key): key is string => typeof key === 'string') ||
    !keys.includes('length')
  )
    invalid(`${label} must be a dense undecorated array`);
  for (let index = 0; index < value.length; index += 1) {
    if (!keys.includes(String(index)))
      invalid(`${label} must be a dense undecorated array`);
  }
  return Array.from({ length: value.length }, (_, index) => value[index]);
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    invalid(`${label} must be finite`);
  return value;
}

function tuple(value: unknown, label: string): ShellVec3 {
  const values = exactArray(value, label);
  if (values.length !== 3) invalid(`${label} must contain three numbers`);
  return Object.freeze([
    finiteNumber(values[0], `${label}[0]`),
    finiteNumber(values[1], `${label}[1]`),
    finiteNumber(values[2], `${label}[2]`),
  ]);
}

function bounds(value: unknown, label: string): DungeonShellArtifact['bounds'] {
  const source = exactKeys(value, ['min', 'max'], label);
  const min = tuple(source.min, `${label}.min`);
  const max = tuple(source.max, `${label}.max`);
  for (let axis = 0; axis < 3; axis += 1) {
    if (!(max[axis] > min[axis]))
      invalid(`${label} must have strictly ordered, non-degenerate bounds`);
  }
  return Object.freeze({ min, max });
}

function hash(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value))
    invalid(`${label} must be lowercase SHA-256`);
  return value;
}

function path(value: unknown, label: string, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value))
    invalid(`${label} must be a safe runtime-relative path`);
  return value;
}

function artifact(value: unknown, label: string): DungeonShellArtifact {
  const source = exactKeys(value, ['file', 'sha256', 'bounds'], label);
  return Object.freeze({
    file: path(
      source.file,
      `${label}.file`,
      ARTIFACT_PATH
    ) as `env/${string}.glb`,
    sha256: hash(source.sha256, `${label}.sha256`),
    bounds: bounds(source.bounds, `${label}.bounds`),
  });
}

function floor(value: unknown): DungeonShellFloorProfile {
  const source = exactKeys(
    value,
    ['diffuse', 'sha256', 'worldUnitsPerRepeat'],
    'profiles.crypt.floor'
  );
  const worldUnitsPerRepeat = finiteNumber(
    source.worldUnitsPerRepeat,
    'floor.worldUnitsPerRepeat'
  );
  if (!(worldUnitsPerRepeat > 0))
    invalid('floor.worldUnitsPerRepeat must be greater than zero');
  return Object.freeze({
    diffuse: path(
      source.diffuse,
      'floor.diffuse',
      TEXTURE_PATH
    ) as `textures/${string}.png`,
    sha256: hash(source.sha256, 'floor.sha256'),
    worldUnitsPerRepeat,
  });
}

function wall(value: unknown): DungeonShellWallProfile {
  const source = exactKeys(
    value,
    ['body', 'base', 'cap', 'doorSurround'],
    'profiles.crypt.wall'
  );
  const bodySource = exactKeys(
    source.body,
    ['file', 'sha256', 'localSpanAxis', 'localFaceAxis', 'twoSided', 'bounds'],
    'wall.body'
  );
  if (bodySource.localSpanAxis !== '+X')
    invalid('wall.body.localSpanAxis must be +X');
  if (bodySource.localFaceAxis !== 'Z')
    invalid('wall.body.localFaceAxis must be Z');
  if (bodySource.twoSided !== true) invalid('wall.body.twoSided must be true');

  const body = Object.freeze({
    file: path(
      bodySource.file,
      'wall.body.file',
      ARTIFACT_PATH
    ) as `env/${string}.glb`,
    sha256: hash(bodySource.sha256, 'wall.body.sha256'),
    localSpanAxis: '+X' as const,
    localFaceAxis: 'Z' as const,
    twoSided: true as const,
    bounds: bounds(bodySource.bounds, 'wall.body.bounds'),
  });
  return Object.freeze({
    body,
    base: artifact(source.base, 'wall.base'),
    cap: artifact(source.cap, 'wall.cap'),
    doorSurround: artifact(source.doorSurround, 'wall.doorSurround'),
  });
}

function parseCatalog(value: unknown): DungeonShellCatalog {
  const manifest = exactKeys(value, ['schemaVersion', 'profiles'], 'manifest');
  if (manifest.schemaVersion !== 1) invalid('unknown manifest schema version');
  const profiles = exactKeys(manifest.profiles, ['crypt'], 'manifest.profiles');
  const profile = exactKeys(
    profiles.crypt,
    ['floor', 'wall'],
    'profiles.crypt'
  );
  return Object.freeze({
    schemaVersion: 1,
    profiles: Object.freeze({
      crypt: Object.freeze({
        floor: floor(profile.floor),
        wall: wall(profile.wall),
      }),
    }),
  });
}

export function parseDungeonShellManifest(
  value: unknown
): DungeonShellManifestResult {
  try {
    return Object.freeze({ ok: true, catalog: parseCatalog(value) });
  } catch (error) {
    const isWeakKey =
      (typeof error === 'object' && error !== null) ||
      typeof error === 'function';
    const reason = isWeakKey ? validationFailureReasons.get(error) : undefined;
    return reason ? Object.freeze({ ok: false, reason }) : GENERIC_FAILURE;
  }
}
