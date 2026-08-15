import { isDicePresetIdentifier } from './dicePresentationRelease';

export type RuntimeDiceSelectors =
  | {
      readonly kind: 'single-mesh';
      readonly objectNode: string;
      readonly meshDefinition: string;
    }
  | {
      readonly kind: 'multi-node';
      readonly rootObjectNode: string;
      readonly shellObjectNode: string;
      readonly numeralObjectNodeCount: number;
    };

export interface CarvedTriangleGroupGeometry {
  readonly kind: 'single-mesh-triangle-groups';
  readonly totalTriangles: number;
  readonly bodyTriangleIndices: readonly number[];
  readonly numeralTriangleIndices: readonly number[];
}

export interface MultiNodeGeometry {
  readonly kind: 'multi-node';
}

export interface RuntimeFaceTrianglesWitnessV2 {
  readonly kind: 'runtime-face-triangles';
  readonly readKind: 'face';
  readonly readIndex: number;
  readonly readDirection: readonly [number, number, number];
  readonly triangleIndices: readonly number[];
  readonly triangleSignatureSha256: string;
}

export interface RuntimeDirectionWitnessV2 {
  readonly kind: 'runtime-direction';
  readonly readKind: 'face' | 'vertex';
  readonly readIndex: number;
  readonly readDirection: readonly [number, number, number];
}

export type RuntimeResultWitnessV2 =
  | RuntimeFaceTrianglesWitnessV2
  | RuntimeDirectionWitnessV2;

export interface DiceSettlementEntryV2 {
  readonly quaternion: readonly [number, number, number, number];
  readonly witness: RuntimeResultWitnessV2;
}

export type RuntimeDieKind =
  | 'd20'
  | 'd12'
  | 'd10-percentile'
  | 'd10'
  | 'd8'
  | 'd6'
  | 'd4';

export interface DiceRuntimePreset {
  readonly presetId: string;
  readonly displayName: string;
  readonly familyId: string;
  readonly dieKind: RuntimeDieKind;
  readonly model: {
    readonly path: string;
    readonly sha256: string;
    readonly sizeBytes: number;
    readonly selectors: RuntimeDiceSelectors;
    readonly bounds: {
      readonly bboxMin: readonly [number, number, number];
      readonly bboxMax: readonly [number, number, number];
      readonly dimensions: readonly [number, number, number];
    };
    readonly meshFacts: {
      readonly primitiveCount: number;
      readonly triangles: number;
      readonly materials: number;
      readonly textures: number;
    };
    readonly geometry: CarvedTriangleGroupGeometry | MultiNodeGeometry;
  };
  readonly faceSettlementMap: {
    readonly supportedResults: readonly number[];
    readonly entries: Readonly<Record<string, DiceSettlementEntryV2>>;
  };
}

export interface DiceRuntimeManifest {
  readonly $schemaVersion: 2;
  readonly contract: 'dice-runtime-presets';
  readonly generatedBy: 'build_dice_runtime_manifest@2.0.0';
  readonly sourceManifestSha256: string;
  readonly runtimeRoot: 'harness/models/custom-dice';
  readonly coordinateContract: {
    readonly assetUpAxis: 'Y-up glTF';
    readonly assetUnits: 'glTF scene units';
    readonly quaternionConvention: 'x,y,z,w';
    readonly settlementMapMeaning: string;
  };
  readonly presets: readonly DiceRuntimePreset[];
}

export type DiceRuntimeManifestResult =
  | { readonly ok: true; readonly manifest: DiceRuntimeManifest }
  | { readonly ok: false; readonly reason: string };

const SHA256 = /^[a-f0-9]{64}$/;
const MODEL_PATH_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const BOUNDS_RECONCILIATION_TOLERANCE = 0.000001;
const QUATERNION_NORMALIZATION_TOLERANCE = 0.000001;
const READ_DIRECTION_NORMALIZATION_TOLERANCE = 0.000001;

const EXPECTED_RESULTS: Readonly<Record<RuntimeDieKind, readonly number[]>> = {
  d20: Object.freeze(Array.from({ length: 20 }, (_, index) => index + 1)),
  d12: Object.freeze(Array.from({ length: 12 }, (_, index) => index + 1)),
  'd10-percentile': Object.freeze([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]),
  d10: Object.freeze(Array.from({ length: 10 }, (_, index) => index + 1)),
  d8: Object.freeze(Array.from({ length: 8 }, (_, index) => index + 1)),
  d6: Object.freeze(Array.from({ length: 6 }, (_, index) => index + 1)),
  d4: Object.freeze(Array.from({ length: 4 }, (_, index) => index + 1)),
};

const validationFailureReasons = new WeakMap<object, string>();
const GENERIC_MANIFEST_FAILURE: DiceRuntimeManifestResult = Object.freeze({
  ok: false,
  reason: 'manifest could not be safely inspected',
});

interface ObjectSnapshot {
  readonly keys: readonly string[];
  readonly value: Readonly<Record<string, unknown>>;
}

function invalid(reason: string): never {
  const failure = Object.freeze(Object.create(null) as object);
  validationFailureReasons.set(failure, reason);
  throw failure;
}

function sameKeys(actual: readonly string[], expected: readonly string[]) {
  return (
    actual.length === expected.length &&
    expected.every((key) => actual.includes(key))
  );
}

function snapshotObject(value: unknown, label: string): ObjectSnapshot {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    invalid(`${label} must be an object`);

  const source = value as Record<string, unknown>;
  const ownKeys = Reflect.ownKeys(source);
  if (!ownKeys.every((key): key is string => typeof key === 'string'))
    invalid(`${label} has an unsupported key`);

  const snapshot: Record<string, unknown> = {};
  for (const key of ownKeys) snapshot[key] = source[key];
  return { keys: ownKeys, value: snapshot };
}

function exactObject(
  value: unknown,
  expectedKeys: readonly string[],
  label: string
): Readonly<Record<string, unknown>> {
  const snapshot = snapshotObject(value, label);
  if (!sameKeys(snapshot.keys, expectedKeys))
    invalid(`${label} must contain exact keys`);
  return snapshot.value;
}

function snapshotArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) invalid(`${label} must be an array`);
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== value.length + 1 ||
    !ownKeys.every((key): key is string => typeof key === 'string')
  )
    invalid(`${label} must be a dense undecorated array`);
  const keySet = new Set(ownKeys);
  if (!keySet.has('length'))
    invalid(`${label} must be a dense undecorated array`);
  for (let index = 0; index < value.length; index += 1) {
    if (!keySet.has(String(index)))
      invalid(`${label} must be a dense undecorated array`);
  }

  return Array.from({ length: value.length }, (_, index) => value[index]);
}

function boundedString(
  value: unknown,
  label: string,
  minimumLength: number,
  maximumLength: number
): string {
  if (typeof value !== 'string') invalid(`${label} is malformed`);
  const hasControlCharacter = [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
  if (
    value.length < minimumLength ||
    value.length > maximumLength ||
    hasControlCharacter
  )
    invalid(`${label} is malformed`);
  return value;
}

function safeInteger(value: unknown, label: string, minimum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum)
    invalid(`${label} must be a safe integer of at least ${minimum}`);
  return Number(value);
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    invalid(`${label} must be finite`);
  return value;
}

function parseTuple3(
  value: unknown,
  label: string
): readonly [number, number, number] {
  const tuple = snapshotArray(value, label);
  if (tuple.length !== 3) invalid(`${label} must contain three numbers`);
  return Object.freeze([
    finiteNumber(tuple[0], `${label}[0]`),
    finiteNumber(tuple[1], `${label}[1]`),
    finiteNumber(tuple[2], `${label}[2]`),
  ]);
}

function parseReadDirection(
  value: unknown,
  label: string
): readonly [number, number, number] {
  const direction = parseTuple3(value, label);
  const magnitude = Math.hypot(...direction);
  if (
    Math.abs(magnitude - 1) - READ_DIRECTION_NORMALIZATION_TOLERANCE >
    Number.EPSILON * Math.max(1, magnitude)
  )
    invalid(`${label} must be normalized`);
  return direction;
}

function parseQuaternion(
  value: unknown,
  label: string
): readonly [number, number, number, number] {
  const tuple = snapshotArray(value, label);
  if (tuple.length !== 4) invalid(`${label} must contain four numbers`);
  const quaternion = [
    finiteNumber(tuple[0], `${label}[0]`),
    finiteNumber(tuple[1], `${label}[1]`),
    finiteNumber(tuple[2], `${label}[2]`),
    finiteNumber(tuple[3], `${label}[3]`),
  ] as const;
  const magnitude = Math.hypot(...quaternion);
  if (
    Math.abs(magnitude - 1) - QUATERNION_NORMALIZATION_TOLERANCE >
    Number.EPSILON * Math.max(1, magnitude)
  )
    invalid(`${label} must be normalized`);
  return Object.freeze(quaternion);
}

function parseModelPath(value: unknown): string {
  const path = boundedString(value, 'model.path', 1, 256);
  const segments = path.split('/');
  if (
    !path.endsWith('.glb') ||
    segments.some(
      (segment) =>
        segment === '.' || segment === '..' || !MODEL_PATH_SEGMENT.test(segment)
    )
  )
    invalid('model.path must be a runtime-relative GLB path');
  return path;
}

function parseSelectors(value: unknown): RuntimeDiceSelectors {
  const snapshot = snapshotObject(value, 'model.selectors');
  if (snapshot.value.kind === 'single-mesh') {
    if (!sameKeys(snapshot.keys, ['kind', 'objectNode', 'meshDefinition']))
      invalid('single-mesh selectors must contain exact keys');
    return Object.freeze({
      kind: 'single-mesh',
      objectNode: boundedString(
        snapshot.value.objectNode,
        'selectors.objectNode',
        1,
        256
      ),
      meshDefinition: boundedString(
        snapshot.value.meshDefinition,
        'selectors.meshDefinition',
        1,
        256
      ),
    });
  }
  if (snapshot.value.kind === 'multi-node') {
    if (
      !sameKeys(snapshot.keys, [
        'kind',
        'rootObjectNode',
        'shellObjectNode',
        'numeralObjectNodeCount',
      ])
    )
      invalid('multi-node selectors must contain exact keys');
    return Object.freeze({
      kind: 'multi-node',
      rootObjectNode: boundedString(
        snapshot.value.rootObjectNode,
        'selectors.rootObjectNode',
        1,
        256
      ),
      shellObjectNode: boundedString(
        snapshot.value.shellObjectNode,
        'selectors.shellObjectNode',
        1,
        256
      ),
      numeralObjectNodeCount: safeInteger(
        snapshot.value.numeralObjectNodeCount,
        'selectors.numeralObjectNodeCount',
        1
      ),
    });
  }
  invalid('model.selectors has an unknown kind');
}

function parseBounds(value: unknown): DiceRuntimePreset['model']['bounds'] {
  const bounds = exactObject(
    value,
    ['bboxMin', 'bboxMax', 'dimensions'],
    'model.bounds'
  );
  const bboxMin = parseTuple3(bounds.bboxMin, 'bounds.bboxMin');
  const bboxMax = parseTuple3(bounds.bboxMax, 'bounds.bboxMax');
  const dimensions = parseTuple3(bounds.dimensions, 'bounds.dimensions');

  for (let axis = 0; axis < 3; axis += 1) {
    const delta = bboxMax[axis] - bboxMin[axis];
    if (!(delta > 0) || !(dimensions[axis] > 0))
      invalid('bounds deltas and dimensions must be strictly positive');
    const difference = Math.abs(dimensions[axis] - delta);
    if (difference - BOUNDS_RECONCILIATION_TOLERANCE > Number.EPSILON * 8)
      invalid('bounds dimensions do not match bbox deltas');
  }

  return Object.freeze({ bboxMin, bboxMax, dimensions });
}

function parseMeshFacts(
  value: unknown
): DiceRuntimePreset['model']['meshFacts'] {
  const facts = exactObject(
    value,
    ['primitiveCount', 'triangles', 'materials', 'textures'],
    'model.meshFacts'
  );
  return Object.freeze({
    primitiveCount: safeInteger(
      facts.primitiveCount,
      'meshFacts.primitiveCount',
      1
    ),
    triangles: safeInteger(facts.triangles, 'meshFacts.triangles', 1),
    materials: safeInteger(facts.materials, 'meshFacts.materials', 0),
    textures: safeInteger(facts.textures, 'meshFacts.textures', 0),
  });
}

function parseTriangleIndices(
  value: unknown,
  label: string,
  totalTriangles: number,
  occupied: Set<number>
): readonly number[] {
  const source = snapshotArray(value, label);
  const indices = source.map((item, index) => {
    const triangleIndex = safeInteger(item, `${label}[${index}]`, 0);
    if (triangleIndex >= totalTriangles)
      invalid(`${label}[${index}] is out of range`);
    if (occupied.has(triangleIndex))
      invalid('triangle geometry partition overlaps or contains duplicates');
    occupied.add(triangleIndex);
    return triangleIndex;
  });
  return Object.freeze(indices);
}

function parseGeometry(
  value: unknown,
  triangles: number
): CarvedTriangleGroupGeometry | MultiNodeGeometry {
  const snapshot = snapshotObject(value, 'model.geometry');
  if (snapshot.value.kind === 'multi-node') {
    if (!sameKeys(snapshot.keys, ['kind']))
      invalid('multi-node geometry must contain exact keys');
    return Object.freeze({ kind: 'multi-node' });
  }
  if (snapshot.value.kind !== 'single-mesh-triangle-groups')
    invalid('model.geometry has an unknown kind');
  if (
    !sameKeys(snapshot.keys, [
      'kind',
      'totalTriangles',
      'bodyTriangleIndices',
      'numeralTriangleIndices',
    ])
  )
    invalid('single-mesh geometry must contain exact keys');

  const totalTriangles = safeInteger(
    snapshot.value.totalTriangles,
    'geometry.totalTriangles',
    1
  );
  if (totalTriangles !== triangles)
    invalid('geometry triangle total does not match mesh facts');
  const occupied = new Set<number>();
  const bodyTriangleIndices = parseTriangleIndices(
    snapshot.value.bodyTriangleIndices,
    'geometry.bodyTriangleIndices',
    totalTriangles,
    occupied
  );
  const numeralTriangleIndices = parseTriangleIndices(
    snapshot.value.numeralTriangleIndices,
    'geometry.numeralTriangleIndices',
    totalTriangles,
    occupied
  );
  if (occupied.size !== totalTriangles)
    invalid('triangle geometry partition has a gap');

  return Object.freeze({
    kind: 'single-mesh-triangle-groups',
    totalTriangles,
    bodyTriangleIndices,
    numeralTriangleIndices,
  });
}

function parseDieKind(value: unknown): RuntimeDieKind {
  if (
    value !== 'd20' &&
    value !== 'd12' &&
    value !== 'd10-percentile' &&
    value !== 'd10' &&
    value !== 'd8' &&
    value !== 'd6' &&
    value !== 'd4'
  )
    invalid('preset.dieKind is unknown');
  return value;
}

function parseSettlementMap(
  value: unknown,
  dieKind: RuntimeDieKind,
  geometry: CarvedTriangleGroupGeometry | MultiNodeGeometry
): DiceRuntimePreset['faceSettlementMap'] {
  const map = exactObject(
    value,
    ['supportedResults', 'entries'],
    'preset.faceSettlementMap'
  );
  const expected = EXPECTED_RESULTS[dieKind];
  const supportedSource = snapshotArray(
    map.supportedResults,
    'faceSettlementMap.supportedResults'
  );
  if (
    supportedSource.length !== expected.length ||
    !expected.every((result, index) => supportedSource[index] === result)
  )
    invalid('faceSettlementMap has the wrong supported result set');
  const supportedResults = Object.freeze([...expected]);

  const expectedKeys = expected.map(String);
  const entrySource = exactObject(
    map.entries,
    expectedKeys,
    'faceSettlementMap.entries'
  );
  const entries: Record<string, DiceSettlementEntryV2> = {};
  const occupiedWitnessTriangles = new Set<number>();
  const occupiedFaceIndices = new Set<number>();
  const bodyTriangles =
    geometry.kind === 'single-mesh-triangle-groups'
      ? new Set(geometry.bodyTriangleIndices)
      : undefined;

  for (const result of expected) {
    const key = String(result);
    const label = `faceSettlementMap.entries.${key}`;
    const entry = exactObject(
      entrySource[key],
      ['quaternion', 'witness'],
      label
    );
    const witnessSnapshot = snapshotObject(entry.witness, `${label}.witness`);
    const readIndex = safeInteger(
      witnessSnapshot.value.readIndex,
      `${label}.witness.readIndex`,
      0
    );
    const readDirection = parseReadDirection(
      witnessSnapshot.value.readDirection,
      `${label}.witness.readDirection`
    );
    let witness: RuntimeResultWitnessV2;

    if (witnessSnapshot.value.kind === 'runtime-face-triangles') {
      if (
        !sameKeys(witnessSnapshot.keys, [
          'kind',
          'readKind',
          'readIndex',
          'readDirection',
          'triangleIndices',
          'triangleSignatureSha256',
        ])
      )
        invalid(`${label}.witness must contain exact triangle witness keys`);
      if (witnessSnapshot.value.readKind !== 'face')
        invalid(`${label}.witness.readKind must be face`);
      if (!bodyTriangles || geometry.kind !== 'single-mesh-triangle-groups')
        invalid(`${label}.witness requires single-mesh triangle geometry`);
      const triangleSource = snapshotArray(
        witnessSnapshot.value.triangleIndices,
        `${label}.witness.triangleIndices`
      );
      if (triangleSource.length === 0)
        invalid(`${label}.witness.triangleIndices must not be empty`);
      const triangleIndices = triangleSource.map((item, index) => {
        const triangleIndex = safeInteger(
          item,
          `${label}.witness.triangleIndices[${index}]`,
          0
        );
        if (triangleIndex >= geometry.totalTriangles)
          invalid(`${label}.witness triangle index is out of range`);
        if (!bodyTriangles.has(triangleIndex))
          invalid(`${label}.witness triangle index is outside the body role`);
        if (occupiedWitnessTriangles.has(triangleIndex))
          invalid('result triangle witnesses overlap or contain duplicates');
        occupiedWitnessTriangles.add(triangleIndex);
        return triangleIndex;
      });
      if (
        typeof witnessSnapshot.value.triangleSignatureSha256 !== 'string' ||
        !SHA256.test(witnessSnapshot.value.triangleSignatureSha256)
      )
        invalid(
          `${label}.witness.triangleSignatureSha256 must be lowercase SHA-256`
        );
      witness = Object.freeze({
        kind: 'runtime-face-triangles',
        readKind: 'face',
        readIndex,
        readDirection,
        triangleIndices: Object.freeze(triangleIndices),
        triangleSignatureSha256: witnessSnapshot.value.triangleSignatureSha256,
      });
    } else if (witnessSnapshot.value.kind === 'runtime-direction') {
      if (
        !sameKeys(witnessSnapshot.keys, [
          'kind',
          'readKind',
          'readIndex',
          'readDirection',
        ])
      )
        invalid(`${label}.witness must contain exact direction witness keys`);
      if (
        witnessSnapshot.value.readKind !== 'face' &&
        witnessSnapshot.value.readKind !== 'vertex'
      )
        invalid(`${label}.witness.readKind must be face or vertex`);
      witness = Object.freeze({
        kind: 'runtime-direction',
        readKind: witnessSnapshot.value.readKind,
        readIndex,
        readDirection,
      });
    } else {
      invalid(`${label}.witness has an unknown kind`);
    }

    if (witness.readKind === 'face') {
      if (occupiedFaceIndices.has(readIndex))
        invalid('faceSettlementMap reuses one face index for two results');
      occupiedFaceIndices.add(readIndex);
    }
    entries[key] = Object.freeze({
      quaternion: parseQuaternion(entry.quaternion, `${label}.quaternion`),
      witness,
    });
  }

  return Object.freeze({
    supportedResults,
    entries: Object.freeze(entries),
  });
}

function validateMultiNodeSettlementShape(
  selectors: Extract<RuntimeDiceSelectors, { kind: 'multi-node' }>,
  dieKind: RuntimeDieKind,
  settlementMap: DiceRuntimePreset['faceSettlementMap']
) {
  const witnesses = Object.values(settlementMap.entries).map(
    (entry) => entry.witness
  );
  const ordinaryFaceShape = witnesses.every(
    (witness) =>
      witness.kind === 'runtime-direction' && witness.readKind === 'face'
  );
  if (ordinaryFaceShape) {
    if (selectors.numeralObjectNodeCount !== EXPECTED_RESULTS[dieKind].length)
      invalid('multi-node face-read numeral count does not match result count');
    return;
  }

  const vertexIndices = new Set(witnesses.map((witness) => witness.readIndex));
  const altD4VertexShape =
    dieKind === 'd4' &&
    witnesses.length === 4 &&
    selectors.numeralObjectNodeCount === 12 &&
    witnesses.every(
      (witness) =>
        witness.kind === 'runtime-direction' && witness.readKind === 'vertex'
    ) &&
    vertexIndices.size === 4 &&
    witnesses.every(
      (witness) => witness.readIndex >= 0 && witness.readIndex < 4
    );
  if (!altD4VertexShape) invalid('multi-node settlement shape is unsupported');
}

function parsePreset(value: unknown): DiceRuntimePreset {
  const preset = exactObject(
    value,
    [
      'presetId',
      'displayName',
      'familyId',
      'dieKind',
      'model',
      'faceSettlementMap',
    ],
    'preset'
  );
  if (!isDicePresetIdentifier(preset.presetId))
    invalid('preset.presetId is malformed');
  if (!isDicePresetIdentifier(preset.familyId))
    invalid('preset.familyId is malformed');
  const dieKind = parseDieKind(preset.dieKind);
  const model = exactObject(
    preset.model,
    [
      'path',
      'sha256',
      'sizeBytes',
      'selectors',
      'bounds',
      'meshFacts',
      'geometry',
    ],
    'preset.model'
  );
  if (typeof model.sha256 !== 'string' || !SHA256.test(model.sha256))
    invalid('model.sha256 must be lowercase SHA-256');
  const selectors = parseSelectors(model.selectors);
  const meshFacts = parseMeshFacts(model.meshFacts);
  const geometry = parseGeometry(model.geometry, meshFacts.triangles);
  if (
    (selectors.kind === 'single-mesh') !==
    (geometry.kind === 'single-mesh-triangle-groups')
  )
    invalid('selector and geometry discriminators do not match');
  const faceSettlementMap = parseSettlementMap(
    preset.faceSettlementMap,
    dieKind,
    geometry
  );
  if (selectors.kind === 'multi-node')
    validateMultiNodeSettlementShape(selectors, dieKind, faceSettlementMap);
  return Object.freeze({
    presetId: preset.presetId,
    displayName: boundedString(
      preset.displayName,
      'preset.displayName',
      1,
      128
    ),
    familyId: preset.familyId,
    dieKind,
    model: Object.freeze({
      path: parseModelPath(model.path),
      sha256: model.sha256,
      sizeBytes: safeInteger(model.sizeBytes, 'model.sizeBytes', 1),
      selectors,
      bounds: parseBounds(model.bounds),
      meshFacts,
      geometry,
    }),
    faceSettlementMap,
  });
}

function parseManifest(value: unknown): DiceRuntimeManifest {
  const manifest = exactObject(
    value,
    [
      '$schemaVersion',
      'contract',
      'generatedBy',
      'sourceManifestSha256',
      'runtimeRoot',
      'coordinateContract',
      'presets',
    ],
    'manifest'
  );
  if (manifest.$schemaVersion !== 2) invalid('unknown manifest schema version');
  if (manifest.contract !== 'dice-runtime-presets')
    invalid('unknown manifest contract');
  if (manifest.generatedBy !== 'build_dice_runtime_manifest@2.0.0')
    invalid('unknown manifest generator');
  if (
    typeof manifest.sourceManifestSha256 !== 'string' ||
    !SHA256.test(manifest.sourceManifestSha256)
  )
    invalid('sourceManifestSha256 must be lowercase SHA-256');
  if (manifest.runtimeRoot !== 'harness/models/custom-dice')
    invalid('unknown manifest runtime root');

  const coordinate = exactObject(
    manifest.coordinateContract,
    [
      'assetUpAxis',
      'assetUnits',
      'quaternionConvention',
      'settlementMapMeaning',
    ],
    'coordinateContract'
  );
  if (coordinate.assetUpAxis !== 'Y-up glTF') invalid('unknown asset up-axis');
  if (coordinate.assetUnits !== 'glTF scene units')
    invalid('unknown asset units');
  if (coordinate.quaternionConvention !== 'x,y,z,w')
    invalid('unknown quaternion convention');

  const presetSource = snapshotArray(manifest.presets, 'manifest.presets');
  if (presetSource.length < 1 || presetSource.length > 128)
    invalid('manifest.presets has invalid cardinality');
  const presets = presetSource.map(parsePreset);
  if (new Set(presets.map((preset) => preset.presetId)).size !== presets.length)
    invalid('manifest contains duplicate preset IDs');

  return Object.freeze({
    $schemaVersion: 2,
    contract: 'dice-runtime-presets',
    generatedBy: 'build_dice_runtime_manifest@2.0.0',
    sourceManifestSha256: manifest.sourceManifestSha256,
    runtimeRoot: 'harness/models/custom-dice',
    coordinateContract: Object.freeze({
      assetUpAxis: 'Y-up glTF',
      assetUnits: 'glTF scene units',
      quaternionConvention: 'x,y,z,w',
      settlementMapMeaning: boundedString(
        coordinate.settlementMapMeaning,
        'coordinateContract.settlementMapMeaning',
        1,
        1024
      ),
    }),
    presets: Object.freeze(presets),
  });
}

export function parseDiceRuntimeManifest(
  value: unknown
): DiceRuntimeManifestResult {
  try {
    return Object.freeze({ ok: true, manifest: parseManifest(value) });
  } catch (error) {
    const isWeakKey =
      (typeof error === 'object' && error !== null) ||
      typeof error === 'function';
    const reason = isWeakKey ? validationFailureReasons.get(error) : undefined;
    return reason
      ? Object.freeze({ ok: false, reason })
      : GENERIC_MANIFEST_FAILURE;
  }
}
