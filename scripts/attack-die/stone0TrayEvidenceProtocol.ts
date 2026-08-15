export const ORIGINAL_D20_GLB_SHA256 =
  '87bf2d0535023e69c968fb9878ba4ad990df4eeec4b503ebb0e917419c47a77e';
export const ORIGINAL_D20_PRESET_ID = 'dice.original.carved.d20';
export const ORIGINAL_D20_MANIFEST_PATH =
  '/models/custom-dice/dice-tray-presets.json';
export const ORIGINAL_D20_GLB_PATH =
  '/models/custom-dice/original-set/Original_D20_Source.glb';
export const ORIGINAL_D20_SIZE_BYTES = 491312;

export const STONE0_SCENARIO_IDS = [
  'pending-provider',
  'player-armed',
  'monster-host-release',
  'reduced-motion',
  'responsive-desktop',
  'responsive-boundary-wide',
  'responsive-boundary-stacked',
  'responsive-narrow',
  'missing-manifest',
  'incomplete-face-map',
  'malformed-manifest',
  'glb-hash-mismatch',
  'invalid-geometry-partition',
  'unknown-safe-preset',
  'unmapped-result',
  'webgl-creation-failure',
  'context-loss',
  'shader-failure',
] as const;

export type Stone0ScenarioId = (typeof STONE0_SCENARIO_IDS)[number];
export type Stone0Quaternion = [number, number, number, number];

export interface Stone0TrayEvidenceIdentity {
  sourceSha: string;
  webBuildSha256: string;
  buildManifestSha256: string;
  providerManifestSha256: string;
  providerSourceManifestSha256: string;
}

export interface Stone0WitnessFact {
  generation: number;
  contextId: number;
  cloneId: string;
  requestedResult: number;
  renderer: '3d';
  angularErrorDegrees: number;
  exactTargetHeld: boolean;
  targetQuaternion: Stone0Quaternion;
}

export interface Stone0ResultFact {
  result: number;
  requestIdentity: string;
  presetId: string;
  manifestRequestCount: number;
  manifestTransferCount: number;
  glbRequestCount: number;
  glbTransferCount: number;
  sharedEvents: boolean;
  sharedProvider: boolean;
  sourceSceneShared: boolean;
  clonesDistinct: boolean;
  roller: Stone0WitnessFact;
  spectator: Stone0WitnessFact;
  targetInvariance: {
    rollerRoll: Stone0Quaternion;
    hostRelease: Stone0Quaternion;
    decorativeVariation: Stone0Quaternion;
  };
  screenshot: string;
}

export interface Stone0ScenarioFact {
  id: Stone0ScenarioId;
  screenshot: string;
  passed: boolean;
  viewport: { width: number; height: number };
  facts: Record<string, string | number | boolean>;
}

export interface Stone0TrayEvidence {
  schemaVersion: 1;
  kind: 'stone0-original-d20-tray-evidence';
  sourceSha: string;
  webBuildSha256: string;
  buildManifestSha256: string;
  provider: {
    manifestPath: string;
    manifestSha256: string;
    sourceManifestSha256: string;
    presetId: string;
    glbPath: string;
    glbSha256: string;
    glbSizeBytes: number;
    manifestRequestCount: number;
    manifestTransferCount: number;
    glbRequestCount: number;
    glbTransferCount: number;
  };
  results: Stone0ResultFact[];
  scenarios: Stone0ScenarioFact[];
  artifacts: {
    browserEvidence: string;
    network: string;
    console: string;
  };
  validationFailures: string[];
  unexpectedErrors: string[];
}

const SHA256 = /^[a-f0-9]{64}$/;
const SOURCE_SHA = /^[a-f0-9]{40}$/;

const TOP_KEYS = [
  'schemaVersion',
  'kind',
  'sourceSha',
  'webBuildSha256',
  'buildManifestSha256',
  'provider',
  'results',
  'scenarios',
  'artifacts',
  'validationFailures',
  'unexpectedErrors',
] as const;
const PROVIDER_KEYS = [
  'manifestPath',
  'manifestSha256',
  'sourceManifestSha256',
  'presetId',
  'glbPath',
  'glbSha256',
  'glbSizeBytes',
  'manifestRequestCount',
  'manifestTransferCount',
  'glbRequestCount',
  'glbTransferCount',
] as const;
const RESULT_KEYS = [
  'result',
  'requestIdentity',
  'presetId',
  'manifestRequestCount',
  'manifestTransferCount',
  'glbRequestCount',
  'glbTransferCount',
  'sharedEvents',
  'sharedProvider',
  'sourceSceneShared',
  'clonesDistinct',
  'roller',
  'spectator',
  'targetInvariance',
  'screenshot',
] as const;
const WITNESS_KEYS = [
  'generation',
  'contextId',
  'cloneId',
  'requestedResult',
  'renderer',
  'angularErrorDegrees',
  'exactTargetHeld',
  'targetQuaternion',
] as const;
const INVARIANCE_KEYS = [
  'rollerRoll',
  'hostRelease',
  'decorativeVariation',
] as const;
const SCENARIO_KEYS = [
  'id',
  'screenshot',
  'passed',
  'viewport',
  'facts',
] as const;
const VIEWPORT_KEYS = ['width', 'height'] as const;
const ARTIFACT_KEYS = ['browserEvidence', 'network', 'console'] as const;

function fail(reason: string): never {
  throw Error(`Stone 0 evidence ${reason}`);
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    fail(`${label} schema`);
  return value as Record<string, unknown>;
}

function exactObject(
  value: unknown,
  keys: readonly string[],
  label: string
): Record<string, unknown> {
  const candidate = object(value, label);
  const actual = Object.keys(candidate);
  if (
    actual.length !== keys.length ||
    !keys.every((key) => Object.prototype.hasOwnProperty.call(candidate, key))
  )
    fail(`${label} keys`);
  return candidate;
}

function denseArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) fail(`${label} schema`);
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== value.length + 1 ||
    !keys.every((key) =>
      typeof key === 'string' ? key === 'length' || /^\d+$/.test(key) : false
    )
  )
    fail(`${label} schema`);
  for (let index = 0; index < value.length; index += 1)
    if (!Object.prototype.hasOwnProperty.call(value, index))
      fail(`${label} schema`);
  return value;
}

function exactEmptyArray(value: unknown, label: string) {
  const values = denseArray(value, label);
  if (values.length !== 0) fail(`${label} must be empty`);
}

function exactCount(value: unknown, label: string) {
  if (value !== 1) fail(`${label} count must equal one`);
}

function safeInteger(value: unknown, label: string) {
  if (!Number.isSafeInteger(value)) fail(`${label} must be a safe integer`);
  return Number(value);
}

function finite(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value))
    fail(`${label} must be finite`);
  return value;
}

function exactBoolean(value: unknown, expected: boolean, label: string) {
  if (value !== expected) fail(`${label} mismatch`);
}

function exactString(value: unknown, expected: string, label: string) {
  if (value !== expected) fail(`${label} mismatch`);
}

function quaternion(value: unknown, label: string): Stone0Quaternion {
  const values = denseArray(value, label);
  if (values.length !== 4) fail(`${label} target schema`);
  const parsed = values.map((item, index) =>
    finite(item, `${label}[${index}]`)
  );
  if (Math.abs(Math.hypot(...parsed) - 1) > 0.000001)
    fail(`${label} target must be normalized`);
  return parsed as Stone0Quaternion;
}

function sameQuaternion(first: Stone0Quaternion, second: Stone0Quaternion) {
  return first.every((value, index) => value === second[index]);
}

export function stone0ResultScreenshot(result: number) {
  if (!Number.isInteger(result) || result < 1 || result > 20)
    fail('result screenshot input');
  return `result-${String(result).padStart(2, '0')}-desktop-1440x1080.png`;
}

export function stone0ScenarioScreenshot(id: Stone0ScenarioId) {
  const viewport = {
    'responsive-boundary-wide': '1241x900',
    'responsive-boundary-stacked': '1240x900',
    'responsive-narrow': '760x900',
  }[id];
  const dimensions = viewport ?? '1440x1080';
  const prefix =
    id.includes('manifest') ||
    id.includes('failure') ||
    id === 'glb-hash-mismatch' ||
    id === 'invalid-geometry-partition' ||
    id === 'unknown-safe-preset' ||
    id === 'unmapped-result' ||
    id === 'context-loss' ||
    id === 'shader-failure'
      ? 'failure'
      : 'scenario';
  return `${prefix}-${id}-${dimensions}.png`;
}

function validateWitness(
  value: unknown,
  result: number,
  label: string
): Stone0WitnessFact {
  const witness = exactObject(value, WITNESS_KEYS, label);
  safeInteger(witness.generation, `${label} generation`);
  const contextId = safeInteger(witness.contextId, `${label} context`);
  if (contextId < 1) fail(`${label} context must be positive`);
  if (
    typeof witness.cloneId !== 'string' ||
    witness.cloneId.length < 1 ||
    witness.cloneId.length > 128
  )
    fail(`${label} clone identity`);
  if (witness.requestedResult !== result)
    fail(`${label} requested result mismatch`);
  exactString(witness.renderer, '3d', `${label} renderer`);
  const error = finite(witness.angularErrorDegrees, `${label} angular error`);
  if (error < 0 || error > 0.25) fail(`${label} angular error exceeds 0.25`);
  exactBoolean(witness.exactTargetHeld, true, `${label} held witness`);
  quaternion(witness.targetQuaternion, `${label} target`);
  return witness as unknown as Stone0WitnessFact;
}

function validateResult(value: unknown, result: number): Stone0ResultFact {
  const fact = exactObject(value, RESULT_KEYS, `result ${result}`);
  if (fact.result !== result) fail('result matrix order or identity mismatch');
  exactString(fact.presetId, ORIGINAL_D20_PRESET_ID, `result ${result} preset`);
  if (
    typeof fact.requestIdentity !== 'string' ||
    !new RegExp(
      `^concept:witness:player:-?\\d+:result:${String(result)}$`
    ).test(fact.requestIdentity)
  )
    fail(`result ${result} request identity mismatch`);
  for (const key of [
    'manifestRequestCount',
    'manifestTransferCount',
    'glbRequestCount',
    'glbTransferCount',
  ] as const)
    exactCount(fact[key], `result ${result} ${key}`);
  for (const key of [
    'sharedEvents',
    'sharedProvider',
    'sourceSceneShared',
    'clonesDistinct',
  ] as const)
    exactBoolean(fact[key], true, `result ${result} ${key} witness`);

  const roller = validateWitness(
    fact.roller,
    result,
    `result ${result} roller`
  );
  const spectator = validateWitness(
    fact.spectator,
    result,
    `result ${result} spectator`
  );
  if (
    roller.generation === spectator.generation ||
    roller.contextId === spectator.contextId ||
    roller.cloneId === spectator.cloneId
  )
    fail(
      `result ${result} witnesses must own distinct generations, contexts, and clones`
    );
  if (!sameQuaternion(roller.targetQuaternion, spectator.targetQuaternion))
    fail(`result ${result} witness target mismatch`);

  const invariance = exactObject(
    fact.targetInvariance,
    INVARIANCE_KEYS,
    `result ${result} target invariance`
  );
  const rollerRoll = quaternion(
    invariance.rollerRoll,
    `result ${result} roller Roll target`
  );
  const hostRelease = quaternion(
    invariance.hostRelease,
    `result ${result} host release target`
  );
  const variation = quaternion(
    invariance.decorativeVariation,
    `result ${result} decorative variation target`
  );
  if (
    !sameQuaternion(roller.targetQuaternion, rollerRoll) ||
    !sameQuaternion(rollerRoll, hostRelease) ||
    !sameQuaternion(rollerRoll, variation)
  )
    fail(`result ${result} target invariant mismatch`);
  exactString(
    fact.screenshot,
    stone0ResultScreenshot(result),
    `result ${result} screenshot filename`
  );
  return fact as unknown as Stone0ResultFact;
}

const responsive = {
  'responsive-desktop': [1440, 1080, 'columns'],
  'responsive-boundary-wide': [1241, 900, 'columns'],
  'responsive-boundary-stacked': [1240, 900, 'stacked'],
  'responsive-narrow': [760, 900, 'narrow-order'],
} as const;

const failureSemantics = {
  'missing-manifest': ['manifest-fetch', true, false, 0, 0],
  'incomplete-face-map': ['manifest-parse', true, true, 0, 0],
  'malformed-manifest': ['manifest-parse', true, true, 0, 0],
  'glb-hash-mismatch': ['model-hash', true, false, 1, 0],
  'invalid-geometry-partition': ['manifest-parse', true, true, 0, 0],
  'unknown-safe-preset': ['synthetic-renderer-only', false, false, 1, 0],
  'unmapped-result': ['synthetic-renderer-only', false, false, 1, 0],
  'webgl-creation-failure': ['webgl', false, false, 1, 0],
  'context-loss': ['webgl-context-loss', false, false, 1, 1],
  'shader-failure': ['shader', false, false, 1, 0],
} as const;

type FactExpected = string | number | boolean;

function validateFacts(
  value: unknown,
  expected: Readonly<Record<string, FactExpected>>,
  label: string
) {
  const facts = exactObject(value, Object.keys(expected), label);
  for (const [key, expectedValue] of Object.entries(expected))
    if (facts[key] !== expectedValue) fail(`${label} ${key} mismatch`);
}

function validateViewport(
  value: unknown,
  width: number,
  height: number,
  label: string
) {
  const viewport = exactObject(value, VIEWPORT_KEYS, `${label} viewport`);
  if (viewport.width !== width || viewport.height !== height)
    fail(`${label} viewport mismatch`);
}

function validateScenario(
  value: unknown,
  id: Stone0ScenarioId
): Stone0ScenarioFact {
  const scenario = exactObject(value, SCENARIO_KEYS, `scenario ${id}`);
  if (scenario.id !== id || scenario.passed !== true)
    fail(`scenario ${id} identity or verdict mismatch`);
  exactString(
    scenario.screenshot,
    stone0ScenarioScreenshot(id),
    `scenario ${id} screenshot filename`
  );

  if (id === 'pending-provider') {
    validateViewport(scenario.viewport, 1440, 1080, id);
    validateFacts(
      scenario.facts,
      {
        providerState: 'loading',
        resultVisible: false,
        trayMounted: false,
        canvasCount: 0,
      },
      'pending provider scenario'
    );
  } else if (id === 'player-armed') {
    validateViewport(scenario.viewport, 1440, 1080, id);
    validateFacts(
      scenario.facts,
      {
        releaseAuthority: 'roller-only',
        rollerControl: true,
        spectatorControl: false,
        resultVisible: false,
        autoReleased: false,
      },
      'player armed scenario'
    );
  } else if (id === 'monster-host-release') {
    validateViewport(scenario.viewport, 1440, 1080, id);
    validateFacts(
      scenario.facts,
      {
        releaseAuthority: 'fixture-host',
        consumerControlCount: 0,
        releaseCount: 1,
      },
      'monster host release scenario'
    );
  } else if (id === 'reduced-motion') {
    validateViewport(scenario.viewport, 1440, 1080, id);
    validateFacts(
      scenario.facts,
      {
        explicitInputRequired: true,
        tumbleObserved: false,
        rollerExact: true,
        spectatorExact: true,
      },
      'reduced motion scenario'
    );
  } else if (id in responsive) {
    const [width, height, layout] = responsive[id as keyof typeof responsive];
    validateViewport(scenario.viewport, width, height, id);
    validateFacts(
      scenario.facts,
      {
        layout,
        contained: true,
        horizontalOverflow: false,
        overlap: false,
      },
      `${id} scenario`
    );
  } else {
    const [
      failureOrigin,
      providerMutation,
      manifestParseFailedBeforeModel,
      modelRequestCount,
      canvasCount,
    ] = failureSemantics[id as keyof typeof failureSemantics];
    validateViewport(scenario.viewport, 1440, 1080, id);
    validateFacts(
      scenario.facts,
      {
        failureOrigin,
        providerMutation,
        manifestParseFailedBeforeModel,
        modelRequestCount,
        canvasCount,
        armedResultVisible: false,
        releasedSvgTruth: true,
        rollerControlPreserved: true,
        spectatorAuthority: false,
      },
      `${id} failure scenario`
    );
  }
  return scenario as unknown as Stone0ScenarioFact;
}

export function assertStone0TrayEvidence(
  value: unknown,
  identity: Stone0TrayEvidenceIdentity
): Stone0TrayEvidence {
  if (
    !SOURCE_SHA.test(identity.sourceSha) ||
    !SHA256.test(identity.webBuildSha256) ||
    !SHA256.test(identity.buildManifestSha256) ||
    !SHA256.test(identity.providerManifestSha256) ||
    !SHA256.test(identity.providerSourceManifestSha256)
  )
    fail('expected identity schema');

  const evidence = exactObject(value, TOP_KEYS, 'top-level');
  if (
    evidence.schemaVersion !== 1 ||
    evidence.kind !== 'stone0-original-d20-tray-evidence'
  )
    fail('top-level schema');
  if (
    evidence.sourceSha !== identity.sourceSha ||
    evidence.webBuildSha256 !== identity.webBuildSha256 ||
    evidence.buildManifestSha256 !== identity.buildManifestSha256
  )
    fail('source/build identity mismatch');

  const provider = exactObject(evidence.provider, PROVIDER_KEYS, 'provider');
  if (
    provider.manifestPath !== ORIGINAL_D20_MANIFEST_PATH ||
    provider.manifestSha256 !== identity.providerManifestSha256 ||
    provider.sourceManifestSha256 !== identity.providerSourceManifestSha256 ||
    provider.presetId !== ORIGINAL_D20_PRESET_ID ||
    provider.glbPath !== ORIGINAL_D20_GLB_PATH ||
    provider.glbSha256 !== ORIGINAL_D20_GLB_SHA256 ||
    provider.glbSizeBytes !== ORIGINAL_D20_SIZE_BYTES
  )
    fail('provider identity or hash mismatch');
  for (const key of [
    'manifestRequestCount',
    'manifestTransferCount',
    'glbRequestCount',
    'glbTransferCount',
  ] as const)
    exactCount(provider[key], `provider ${key}`);

  const results = denseArray(evidence.results, 'result matrix');
  if (results.length !== 20) fail('result matrix must contain 1–20 once');
  results.forEach((fact, index) => validateResult(fact, index + 1));

  const scenarios = denseArray(evidence.scenarios, 'scenario matrix');
  if (scenarios.length !== STONE0_SCENARIO_IDS.length)
    fail('scenario matrix is incomplete');
  scenarios.forEach((fact, index) =>
    validateScenario(fact, STONE0_SCENARIO_IDS[index])
  );

  const filenames = [
    ...results.map((fact) => (fact as Stone0ResultFact).screenshot),
    ...scenarios.map((fact) => (fact as Stone0ScenarioFact).screenshot),
  ];
  if (new Set(filenames).size !== filenames.length)
    fail('duplicate screenshot filename');

  const artifacts = exactObject(evidence.artifacts, ARTIFACT_KEYS, 'artifacts');
  exactString(
    artifacts.browserEvidence,
    'browser-evidence.json',
    'artifacts browser evidence filename'
  );
  exactString(artifacts.network, 'network.json', 'artifacts network filename');
  exactString(artifacts.console, 'console.json', 'artifacts console filename');
  exactEmptyArray(evidence.validationFailures, 'validation failures');
  exactEmptyArray(evidence.unexpectedErrors, 'unexpected errors');
  return value as Stone0TrayEvidence;
}
