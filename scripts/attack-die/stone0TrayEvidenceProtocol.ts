import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { validateManifest } from './evidenceProtocol';

export const ORIGINAL_D20_GLB_SHA256 =
  '87bf2d0535023e69c968fb9878ba4ad990df4eeec4b503ebb0e917419c47a77e';
export const ORIGINAL_D20_MANIFEST_SHA256 =
  '9c2d08b53442e6307ea4235103495f33fd4678b0363d9721bafa7f162dac1c74';
export const ORIGINAL_D20_SOURCE_MANIFEST_SHA256 =
  '46f50f32b27e16d2c5e984b07a0612a6fab890834d9ae3a4cba7a4dcf05059f7';
export const ORIGINAL_D20_BODY_TRIANGLE_COUNT = 2684;
export const ORIGINAL_D20_NUMERAL_TRIANGLE_COUNT = 7798;
export const ORIGINAL_D20_PRESET_ID = 'dice.original.carved.d20';
export const ORIGINAL_D20_MANIFEST_PATH =
  '/models/custom-dice/dice-tray-presets.json';
export const ORIGINAL_D20_GLB_PATH =
  '/models/custom-dice/original-set/Original_D20_Source.glb';
export const ORIGINAL_D20_SIZE_BYTES = 491312;

export const STONE0_LOCAL_API_RESPONSE = Uint8Array.from([
  0, 0, 0, 0, 0, 128, 0, 0, 0, 16, 103, 114, 112, 99, 45, 115, 116, 97, 116,
  117, 115, 58, 32, 48, 13, 10,
]);

export const STONE0_LOCAL_API_FIXTURES = Object.freeze(
  [
    'http://localhost:8080/dnd5e.api.lobby.v1alpha1.LobbyService/GetMyActiveLobby',
    'http://localhost:8080/dnd5e.api.v1alpha1.CharacterService/ListRaces',
    'http://localhost:8080/dnd5e.api.v1alpha1.CharacterService/ListClasses',
    'http://localhost:8080/dnd5e.api.v1alpha1.CharacterService/ListBackgrounds',
  ].map((url) =>
    Object.freeze({
      url,
      responseSha256:
        '4d24ea4a38be86462305aefe2489c7073b47641849f401d5d309ea67547419cd',
    })
  )
);

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

export interface Stone0ResultWitnessV2 {
  readonly requestedResult: number;
  readonly mappedTarget: Stone0Quaternion;
  readonly observedUpwardResult: number;
  readonly observedUpDot: number;
  readonly observedUpMargin: number;
  readonly canvasVisible: boolean;
  readonly exactTargetHeld: boolean;
  readonly numeralTriangleCount: 7798;
}

export interface Stone0WitnessFact extends Stone0ResultWitnessV2 {
  generation: number;
  contextId: number;
  cloneId: string;
  eventArrayId: number;
  providerId: number;
}

export interface Stone0CloseupFact {
  screenshot: string;
  deviceScaleFactor: 3;
  physicalWidth: number;
  physicalHeight: number;
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
  closeups: {
    roller: Stone0CloseupFact;
    spectator: Stone0CloseupFact;
  };
}

export interface Stone0ScenarioFact {
  id: Stone0ScenarioId;
  screenshot: string;
  passed: boolean;
  viewport: { width: number; height: number };
  facts: Record<string, unknown>;
}

export interface Stone0TrayEvidence {
  schemaVersion: 2;
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
    bodyTriangleCount: number;
    numeralTriangleCount: number;
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
  'bodyTriangleCount',
  'numeralTriangleCount',
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
  'closeups',
] as const;
const WITNESS_KEYS = [
  'generation',
  'contextId',
  'cloneId',
  'eventArrayId',
  'providerId',
  'requestedResult',
  'mappedTarget',
  'observedUpwardResult',
  'observedUpDot',
  'observedUpMargin',
  'canvasVisible',
  'exactTargetHeld',
  'numeralTriangleCount',
] as const;
const CLOSEUPS_KEYS = ['roller', 'spectator'] as const;
const CLOSEUP_KEYS = [
  'screenshot',
  'deviceScaleFactor',
  'physicalWidth',
  'physicalHeight',
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

function assertResultNumber(result: number, label: string) {
  if (!Number.isInteger(result) || result < 1 || result > 20) fail(label);
}

export function stone0ResultScreenshot(result: number) {
  assertResultNumber(result, 'result screenshot input');
  return `result-${String(result).padStart(2, '0')}-desktop-1440x1080.png`;
}

export function stone0ResultCloseupScreenshot(
  result: number,
  role: 'roller' | 'spectator'
) {
  assertResultNumber(result, 'result closeup screenshot input');
  if (role !== 'roller' && role !== 'spectator')
    fail('result closeup role input');
  return `result-${String(result).padStart(2, '0')}-${role}-well-dsf3.png`;
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
  const eventArrayId = safeInteger(
    witness.eventArrayId,
    `${label} event-array identity`
  );
  const providerId = safeInteger(
    witness.providerId,
    `${label} provider identity`
  );
  if (eventArrayId < 1 || providerId < 1)
    fail(`${label} boundary identities must be positive`);
  if (witness.requestedResult !== result)
    fail(`${label} requested result mismatch`);

  quaternion(witness.mappedTarget, `${label} mapped target`);
  const observed = safeInteger(
    witness.observedUpwardResult,
    `${label} observed upward result`
  );
  if (observed !== witness.requestedResult)
    fail(
      `result ${result} ${label.endsWith('roller') ? 'roller' : 'spectator'} requested result ${witness.requestedResult} observed upward result ${observed}`
    );
  const upDot = finite(witness.observedUpDot, `${label} observed upward dot`);
  const upMargin = finite(
    witness.observedUpMargin,
    `${label} observed upward margin`
  );
  if (upDot <= 0.999999) fail(`${label} observed upward dot is not decisive`);
  if (upMargin <= 0.2) fail(`${label} observed upward margin is not decisive`);
  exactBoolean(witness.canvasVisible, true, `${label} canvas visibility`);
  exactBoolean(
    witness.exactTargetHeld,
    true,
    `${label} target-hold diagnostic`
  );
  if (witness.numeralTriangleCount !== ORIGINAL_D20_NUMERAL_TRIANGLE_COUNT)
    fail(`${label} numeral triangle role mismatch`);
  return witness as unknown as Stone0WitnessFact;
}

function validateCloseup(
  value: unknown,
  result: number,
  role: 'roller' | 'spectator'
): Stone0CloseupFact {
  const label = `result ${result} ${role} closeup`;
  const closeup = exactObject(value, CLOSEUP_KEYS, label);
  exactString(
    closeup.screenshot,
    stone0ResultCloseupScreenshot(result, role),
    `${label} screenshot filename`
  );
  if (closeup.deviceScaleFactor !== 3)
    fail(`${label} device scale factor must equal 3`);
  const width = safeInteger(closeup.physicalWidth, `${label} physical width`);
  const height = safeInteger(
    closeup.physicalHeight,
    `${label} physical height`
  );
  if (width < 220 || height < 220)
    fail(`${label} physical dimensions must be at least 220x220`);
  return closeup as unknown as Stone0CloseupFact;
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
    roller.eventArrayId !== spectator.eventArrayId ||
    roller.providerId !== spectator.providerId
  )
    fail(`result ${result} measured event-array/provider identity mismatch`);
  if (
    roller.generation === spectator.generation ||
    roller.contextId === spectator.contextId ||
    roller.cloneId === spectator.cloneId
  )
    fail(
      `result ${result} witnesses must own distinct generations, contexts, and clones`
    );
  if (!sameQuaternion(roller.mappedTarget, spectator.mappedTarget))
    fail(`result ${result} witness mapped target mismatch`);

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
    !sameQuaternion(roller.mappedTarget, rollerRoll) ||
    !sameQuaternion(rollerRoll, hostRelease) ||
    !sameQuaternion(rollerRoll, variation)
  )
    fail(`result ${result} target invariant mismatch`);
  exactString(
    fact.screenshot,
    stone0ResultScreenshot(result),
    `result ${result} screenshot filename`
  );
  const closeups = exactObject(
    fact.closeups,
    CLOSEUPS_KEYS,
    `result ${result} closeups`
  );
  validateCloseup(closeups.roller, result, 'roller');
  validateCloseup(closeups.spectator, result, 'spectator');
  return fact as unknown as Stone0ResultFact;
}

const responsive = {
  'responsive-desktop': [1440, 1080, 'columns'],
  'responsive-boundary-wide': [1241, 900, 'columns'],
  'responsive-boundary-stacked': [1240, 900, 'stacked'],
  'responsive-narrow': [760, 900, 'narrow-order'],
} as const;

const RECT_KEYS = [
  'left',
  'right',
  'top',
  'bottom',
  'width',
  'height',
] as const;
const SURFACE_KEYS = [
  'preview',
  'map',
  'roller',
  'spectator',
  'log',
  'dock',
] as const;
const RESPONSIVE_FACT_KEYS = [
  'layout',
  'rollerCanvasVisible',
  'spectatorCanvasVisible',
  'innerWidth',
  'scrollWidth',
  'surfaces',
] as const;

interface Stone0Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

function rectangle(value: unknown, label: string): Stone0Rect {
  const candidate = exactObject(value, RECT_KEYS, label);
  const parsed = Object.fromEntries(
    RECT_KEYS.map((key) => [key, finite(candidate[key], `${label} ${key}`)])
  ) as unknown as Stone0Rect;
  if (
    parsed.width <= 0 ||
    parsed.height <= 0 ||
    Math.abs(parsed.right - parsed.left - parsed.width) > 0.5 ||
    Math.abs(parsed.bottom - parsed.top - parsed.height) > 0.5
  )
    fail(`${label} dimensions`);
  return parsed;
}

function contains(outer: Stone0Rect, inner: Stone0Rect, tolerance = 1) {
  return (
    inner.left >= outer.left - tolerance &&
    inner.right <= outer.right + tolerance &&
    inner.top >= outer.top - tolerance &&
    inner.bottom <= outer.bottom + tolerance
  );
}

function responsiveFacts(
  value: unknown,
  layout: string,
  width: number,
  label: string
) {
  const facts = exactObject(value, RESPONSIVE_FACT_KEYS, `${label} facts`);
  exactString(facts.layout, layout, `${label} layout`);
  exactBoolean(
    facts.rollerCanvasVisible,
    true,
    `${label} Roller canvas visibility`
  );
  exactBoolean(
    facts.spectatorCanvasVisible,
    true,
    `${label} Spectator canvas visibility`
  );
  if (facts.innerWidth !== width) fail(`${label} browser inner width mismatch`);
  const scrollWidth = finite(facts.scrollWidth, `${label} scroll width`);
  if (scrollWidth > width) fail(`${label} horizontal overflow`);
  const rawSurfaces = exactObject(
    facts.surfaces,
    SURFACE_KEYS,
    `${label} surfaces`
  );
  const surfaces = Object.fromEntries(
    SURFACE_KEYS.map((key) => [
      key,
      rectangle(rawSurfaces[key], `${label} ${key} rectangle`),
    ])
  ) as unknown as Record<(typeof SURFACE_KEYS)[number], Stone0Rect>;
  const { preview, map, roller, spectator, log, dock } = surfaces;
  if (preview.left < -1 || preview.right > width + 1)
    fail(`${label} preview horizontal containment`);
  for (const key of ['map', 'roller', 'spectator', 'log', 'dock'] as const)
    if (!contains(preview, surfaces[key])) fail(`${label} ${key} containment`);

  const gap = 7.5;
  if (layout === 'columns') {
    if (!contains(map, roller) || !contains(map, spectator))
      fail(`${label} map/drawer containment`);
    if (
      roller.right + gap > spectator.left ||
      spectator.right + gap > log.left ||
      log.bottom + gap > dock.top
    )
      fail(`${label} map → Roller → Spectator → log → dock order/gaps`);
  } else if (
    map.bottom + gap > roller.top ||
    roller.bottom + gap > spectator.top ||
    spectator.bottom + gap > log.top ||
    log.bottom + gap > dock.top
  )
    fail(`${label} map → Roller → Spectator → log → dock order/gaps`);
  if (dock.top < map.bottom - 1) fail(`${label} dock clearance`);
}

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
    const facts = exactObject(
      scenario.facts,
      [
        'providerState',
        'resultVisible',
        'trayMounted',
        'canvasCount',
        'effectiveAncestorOpacity',
        'statusContrastRatio',
        'paintedAfterStabilization',
        'statusRegion',
      ],
      'pending provider scenario'
    );
    exactString(facts.providerState, 'loading', 'pending provider state');
    exactBoolean(
      facts.resultVisible,
      false,
      'pending provider result visibility'
    );
    exactBoolean(facts.trayMounted, false, 'pending provider Tray mount');
    if (facts.canvasCount !== 0) fail('pending provider Canvas count');
    const opacity = finite(
      facts.effectiveAncestorOpacity,
      'pending provider effective ancestor opacity'
    );
    if (opacity < 0.9999 || opacity > 1)
      fail('pending provider content is not fully opaque');
    const contrast = finite(
      facts.statusContrastRatio,
      'pending provider status contrast ratio'
    );
    if (contrast < 4.5 || contrast > 21)
      fail('pending provider status is not readable at 4.5:1 contrast');
    exactBoolean(
      facts.paintedAfterStabilization,
      true,
      'pending provider painted-after-stabilization witness'
    );
    const statusRegion = exactObject(
      facts.statusRegion,
      ['left', 'top', 'width', 'height'],
      'pending provider status region'
    );
    const left = safeInteger(
      statusRegion.left,
      'pending provider status region left'
    );
    const top = safeInteger(
      statusRegion.top,
      'pending provider status region top'
    );
    const width = safeInteger(
      statusRegion.width,
      'pending provider status region width'
    );
    const height = safeInteger(
      statusRegion.height,
      'pending provider status region height'
    );
    if (
      left < 0 ||
      top < 0 ||
      width < 1 ||
      height < 1 ||
      left + width > 1440 ||
      top + height > 1080
    )
      fail('pending provider status region dimensions');
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
    responsiveFacts(scenario.facts, layout, width, id);
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
    identity.providerManifestSha256 !== ORIGINAL_D20_MANIFEST_SHA256 ||
    identity.providerSourceManifestSha256 !==
      ORIGINAL_D20_SOURCE_MANIFEST_SHA256
  )
    fail('expected identity schema or corrected provider hash');

  const evidence = exactObject(value, TOP_KEYS, 'top-level');
  if (
    evidence.schemaVersion !== 2 ||
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
    provider.glbSizeBytes !== ORIGINAL_D20_SIZE_BYTES ||
    provider.bodyTriangleCount !== ORIGINAL_D20_BODY_TRIANGLE_COUNT ||
    provider.numeralTriangleCount !== ORIGINAL_D20_NUMERAL_TRIANGLE_COUNT
  )
    fail('provider identity, hash, or triangle role mismatch');
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
    ...results.flatMap((fact) => {
      const result = fact as Stone0ResultFact;
      return [
        result.screenshot,
        result.closeups.roller.screenshot,
        result.closeups.spectator.screenshot,
      ];
    }),
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

const PACKAGE_KEYS = [
  'schemaVersion',
  'kind',
  'verdict',
  'sourceSha',
  'webBuildSha256',
  'buildManifestSha256',
  'resultCount',
  'scenarioCount',
  'contextCount',
  'screenshotCount',
  'closeupCount',
  'consoleErrorCount',
  'pageErrorCount',
  'artifacts',
] as const;
const PACKAGE_ARTIFACT_KEYS = ['path', 'kind', 'sha256', 'sizeBytes'] as const;
const NETWORK_KEYS = ['schemaVersion', 'contexts'] as const;
const NETWORK_CONTEXT_KEYS = [
  'id',
  'contextOrdinal',
  'viewport',
  'requests',
  'responses',
  'apiFixtures',
  'provider',
  'trayCanvasFirstObservedMs',
  'glbResponseEndMs',
] as const;
const NETWORK_REQUEST_KEYS = [
  'url',
  'method',
  'resourceType',
  'providerKind',
] as const;
const NETWORK_RESPONSE_KEYS = [
  'url',
  'status',
  'providerKind',
  'contentLength',
] as const;
const API_FIXTURE_KEYS = [
  'url',
  'method',
  'status',
  'requestBodySha256',
  'responseBodySha256',
] as const;
const PROVIDER_COUNT_KEYS = [
  'manifestRequestCount',
  'manifestTransferCount',
  'glbRequestCount',
  'glbTransferCount',
] as const;
const CONSOLE_KEYS = [
  'schemaVersion',
  'console',
  'pageErrors',
  'unexpectedErrors',
] as const;
const CONSOLE_ENTRY_KEYS = [
  'id',
  'contextOrdinal',
  'type',
  'text',
  'location',
  'expected',
] as const;
const CONSOLE_LOCATION_KEYS = ['url', 'lineNumber', 'columnNumber'] as const;

export interface Stone0PackageArtifact {
  path: string;
  kind: 'build-manifest' | 'json' | 'screenshot';
  sha256: string;
  sizeBytes: number;
}

export interface Stone0TrayEvidencePackage {
  schemaVersion: 2;
  kind: 'stone0-original-d20-tray-package';
  verdict: 'PASS';
  sourceSha: string;
  webBuildSha256: string;
  buildManifestSha256: string;
  resultCount: number;
  scenarioCount: number;
  contextCount: number;
  screenshotCount: number;
  closeupCount: number;
  consoleErrorCount: number;
  pageErrorCount: number;
  artifacts: Stone0PackageArtifact[];
}

export function stone0ExpectedNetworkContextIds() {
  const results = Array.from({ length: 20 }, (_, index) => {
    const prefix = `result-${String(index + 1).padStart(2, '0')}`;
    return [
      `${prefix}-roller-roll`,
      `${prefix}-decorative-gesture`,
      `${prefix}-host-release`,
    ];
  }).flat();
  return Object.freeze([
    ...results,
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
    'shader-failure',
    'context-loss',
  ]);
}

function hashBytes(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseJsonBytes(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail(`${label} JSON reread failed`);
  }
}

function expectedProviderCounts(id: string) {
  if (id === 'missing-manifest') return [1, 0, 0, 0] as const;
  if (
    id === 'incomplete-face-map' ||
    id === 'malformed-manifest' ||
    id === 'invalid-geometry-partition'
  )
    return [1, 1, 0, 0] as const;
  return [1, 1, 1, 1] as const;
}

function validateNetwork(
  value: unknown,
  evidence: Stone0TrayEvidence
): {
  contextCount: number;
  contexts: Map<string, Record<string, unknown>>;
  missingManifestUrl: string;
} {
  const network = exactObject(value, NETWORK_KEYS, 'network artifact');
  if (network.schemaVersion !== 2) fail('network schema version');
  const contexts = denseArray(network.contexts, 'network contexts');
  const expectedIds = stone0ExpectedNetworkContextIds();
  if (contexts.length !== expectedIds.length)
    fail('network exact context count mismatch');
  const scenarioViewport = new Map(
    evidence.scenarios.map((scenario) => [scenario.id, scenario.viewport])
  );
  const byId = new Map<string, Record<string, unknown>>();
  let missingManifestUrl = '';

  contexts.forEach((raw, index) => {
    const id = expectedIds[index];
    const context = exactObject(raw, NETWORK_CONTEXT_KEYS, `network ${id}`);
    if (context.id !== id || context.contextOrdinal !== index + 1)
      fail(`network context ID/order mismatch at ${index + 1}`);
    const expectedViewport = scenarioViewport.get(id as Stone0ScenarioId) ?? {
      width: 1440,
      height: 1080,
    };
    validateViewport(
      context.viewport,
      expectedViewport.width,
      expectedViewport.height,
      `network ${id}`
    );

    const requests = denseArray(
      context.requests,
      `network ${id} request records`
    ).map((request, requestIndex) =>
      exactObject(
        request,
        NETWORK_REQUEST_KEYS,
        `network ${id} request ${requestIndex}`
      )
    );
    const responses = denseArray(
      context.responses,
      `network ${id} response records`
    ).map((response, responseIndex) =>
      exactObject(
        response,
        NETWORK_RESPONSE_KEYS,
        `network ${id} response ${responseIndex}`
      )
    );
    const apiFixtures = denseArray(
      context.apiFixtures,
      `network ${id} API fixtures`
    ).map((fixture, fixtureIndex) =>
      exactObject(
        fixture,
        API_FIXTURE_KEYS,
        `network ${id} API fixture ${fixtureIndex}`
      )
    );
    if (apiFixtures.length !== STONE0_LOCAL_API_FIXTURES.length)
      fail(`network ${id} exact API fixture count mismatch`);
    const sortedFixtures = [...apiFixtures].sort((first, second) =>
      String(first.url).localeCompare(String(second.url))
    );
    const sortedExpected = [...STONE0_LOCAL_API_FIXTURES].sort(
      (first, second) => first.url.localeCompare(second.url)
    );
    sortedExpected.forEach((expected, fixtureIndex) => {
      const fixture = sortedFixtures[fixtureIndex];
      if (
        fixture.url !== expected.url ||
        fixture.method !== 'POST' ||
        fixture.status !== 200 ||
        !SHA256.test(String(fixture.requestBodySha256)) ||
        fixture.responseBodySha256 !== expected.responseSha256
      )
        fail(`network ${id} exact local API fixture mismatch`);
      const matchingRequests = requests.filter(
        (request) => request.url === expected.url && request.method === 'POST'
      );
      const matchingResponses = responses.filter(
        (response) => response.url === expected.url && response.status === 200
      );
      if (matchingRequests.length !== 1 || matchingResponses.length !== 1)
        fail(`network ${id} local API request/response count mismatch`);
    });
    for (const request of requests) {
      if (
        typeof request.url !== 'string' ||
        typeof request.method !== 'string' ||
        typeof request.resourceType !== 'string' ||
        ![null, 'manifest', 'glb'].includes(
          request.providerKind as null | string
        )
      )
        fail(`network ${id} request schema`);
      if (
        request.url.startsWith('http://localhost:8080/') &&
        !STONE0_LOCAL_API_FIXTURES.some(
          (fixture) => fixture.url === request.url
        )
      )
        fail(`network ${id} unowned local API request`);
    }
    for (const response of responses)
      if (
        typeof response.url !== 'string' ||
        !Number.isInteger(response.status) ||
        ![null, 'manifest', 'glb'].includes(
          response.providerKind as null | string
        ) ||
        !(
          response.contentLength === null ||
          typeof response.contentLength === 'string'
        )
      )
        fail(`network ${id} response schema`);

    const provider = exactObject(
      context.provider,
      PROVIDER_COUNT_KEYS,
      `network ${id} provider counts`
    );
    const expectedCounts = expectedProviderCounts(id);
    PROVIDER_COUNT_KEYS.forEach((key, countIndex) => {
      if (provider[key] !== expectedCounts[countIndex])
        fail(`network ${id} ${key} count mismatch`);
    });
    const manifestRequests = requests.filter(
      (request) => request.providerKind === 'manifest'
    );
    const glbRequests = requests.filter(
      (request) => request.providerKind === 'glb'
    );
    const manifestTransfers = responses.filter(
      (response) =>
        response.providerKind === 'manifest' &&
        Number(response.status) >= 200 &&
        Number(response.status) < 300
    );
    const glbTransfers = responses.filter(
      (response) =>
        response.providerKind === 'glb' &&
        Number(response.status) >= 200 &&
        Number(response.status) < 300
    );
    if (
      manifestRequests.length !== expectedCounts[0] ||
      manifestTransfers.length !== expectedCounts[1] ||
      glbRequests.length !== expectedCounts[2] ||
      glbTransfers.length !== expectedCounts[3]
    )
      fail(`network ${id} provider records contradict counts`);
    for (const request of manifestRequests)
      if (new URL(String(request.url)).pathname !== ORIGINAL_D20_MANIFEST_PATH)
        fail(`network ${id} manifest URL mismatch`);
    for (const request of glbRequests)
      if (new URL(String(request.url)).pathname !== ORIGINAL_D20_GLB_PATH)
        fail(`network ${id} GLB URL mismatch`);
    if (id === 'missing-manifest')
      missingManifestUrl = String(manifestRequests[0]?.url ?? '');

    const canvas = context.trayCanvasFirstObservedMs;
    const glbEnd = context.glbResponseEndMs;
    if (canvas !== null) finite(canvas, `network ${id} canvas timing`);
    if (glbEnd !== null) finite(glbEnd, `network ${id} GLB timing`);
    if (canvas !== null && glbEnd !== null && Number(glbEnd) > Number(canvas))
      fail(`network ${id} Canvas preceded GLB transfer`);
    if (expectedCounts[3] === 0 && glbEnd !== null)
      fail(`network ${id} impossible GLB timing`);
    byId.set(id, context);
  });

  for (const result of evidence.results) {
    const id = `result-${String(result.result).padStart(2, '0')}-roller-roll`;
    const counts = object(byId.get(id)?.provider, `${id} provider`);
    for (const key of PROVIDER_COUNT_KEYS)
      if (result[key] !== counts[key])
        fail(`${id} browser/network count contradiction`);
  }
  for (const scenario of evidence.scenarios) {
    if (!('modelRequestCount' in scenario.facts)) continue;
    const counts = object(
      byId.get(scenario.id)?.provider,
      `${scenario.id} provider`
    );
    if (scenario.facts.modelRequestCount !== counts.glbRequestCount)
      fail(`${scenario.id} browser/network model count contradiction`);
  }
  if (!missingManifestUrl) fail('network missing-manifest URL unavailable');
  return { contextCount: contexts.length, contexts: byId, missingManifestUrl };
}

function validateConsole(
  value: unknown,
  network: ReturnType<typeof validateNetwork>
): { consoleErrorCount: number; pageErrorCount: number } {
  const artifact = exactObject(value, CONSOLE_KEYS, 'console artifact');
  if (artifact.schemaVersion !== 2) fail('console schema version');
  const entries = denseArray(artifact.console, 'console entries');
  const errors: Record<string, unknown>[] = [];
  for (const [index, raw] of entries.entries()) {
    const entry = exactObject(
      raw,
      CONSOLE_ENTRY_KEYS,
      `console entry ${index}`
    );
    if (
      typeof entry.id !== 'string' ||
      !network.contexts.has(entry.id) ||
      network.contexts.get(entry.id)?.contextOrdinal !== entry.contextOrdinal ||
      typeof entry.type !== 'string' ||
      typeof entry.text !== 'string'
    )
      fail(`console entry ${index} context/schema mismatch`);
    const location = exactObject(
      entry.location,
      CONSOLE_LOCATION_KEYS,
      `console entry ${index} location`
    );
    if (
      typeof location.url !== 'string' ||
      !Number.isInteger(location.lineNumber) ||
      !Number.isInteger(location.columnNumber)
    )
      fail(`console entry ${index} location schema`);
    if (entry.type === 'error') errors.push(entry);
    else if (entry.expected !== false)
      fail(`console entry ${index} non-error cannot be expected`);
  }
  if (errors.length !== 1) fail('console exact expected error count mismatch');
  const expected = errors[0];
  const location = object(expected.location, 'expected console location');
  if (
    expected.id !== 'missing-manifest' ||
    expected.contextOrdinal !==
      stone0ExpectedNetworkContextIds().indexOf('missing-manifest') + 1 ||
    expected.text !==
      'Failed to load resource: the server responded with a status of 404 (Not Found)' ||
    expected.expected !== true ||
    location.url !== network.missingManifestUrl
  )
    fail('console error is not the exact URL/scenario expected message');
  const pageErrors = denseArray(artifact.pageErrors, 'page errors');
  const unexpected = denseArray(
    artifact.unexpectedErrors,
    'console unexpected errors'
  );
  if (pageErrors.length !== 0 || unexpected.length !== 0)
    fail('console/page unexpected errors must be empty');
  return {
    consoleErrorCount: errors.length,
    pageErrorCount: pageErrors.length,
  };
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const PNG_MAX_INFLATED_BYTES = 128 * 1024 * 1024;
// The reviewed package expands to 1,370,878,587 RGB bytes. A 1.5 GiB
// package budget leaves about 17.5% growth room while rejecting hostile
// multi-image totals long before any screenshot is inflated.
const PNG_MAX_AGGREGATE_DECODED_BYTES = 1536 * 1024 * 1024;
const PNG_CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1)
    crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function pngCrc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes)
    crc = PNG_CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function paethPredictor(left: number, above: number, upperLeft: number) {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance)
    return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function preflightPngDecodedBytes(bytes: Uint8Array, label: string) {
  if (
    bytes.byteLength < 33 ||
    !PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
  )
    fail(`${label} PNG signature or preflight framing mismatch`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerOffset = PNG_SIGNATURE.length;
  const headerLength = view.getUint32(headerOffset);
  const typeOffset = headerOffset + 4;
  const dataOffset = headerOffset + 8;
  const crcOffset = dataOffset + headerLength;
  if (
    headerLength !== 13 ||
    crcOffset + 4 > bytes.byteLength ||
    String.fromCharCode(...bytes.subarray(typeOffset, dataOffset)) !== 'IHDR' ||
    pngCrc32(bytes.subarray(typeOffset, crcOffset)) !==
      view.getUint32(crcOffset)
  )
    fail(`${label} PNG IHDR preflight mismatch`);
  const width = view.getUint32(dataOffset);
  const height = view.getUint32(dataOffset + 4);
  if (
    width < 1 ||
    height < 1 ||
    bytes[dataOffset + 8] !== 8 ||
    bytes[dataOffset + 9] !== 2 ||
    bytes[dataOffset + 10] !== 0 ||
    bytes[dataOffset + 11] !== 0 ||
    bytes[dataOffset + 12] !== 0
  )
    fail(`${label} PNG unsupported or illegal IHDR screenshot profile`);
  const rowBytes = width * 3;
  const inflatedBytes = height * (rowBytes + 1);
  const decodedBytes = width * height * 3;
  if (
    !Number.isSafeInteger(rowBytes) ||
    !Number.isSafeInteger(inflatedBytes) ||
    !Number.isSafeInteger(decodedBytes) ||
    inflatedBytes > PNG_MAX_INFLATED_BYTES
  )
    fail(`${label} PNG decoded image dimensions exceed supported profile`);
  return { width, height, decodedBytes };
}

interface PngContrastRegion {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

function decodePng(
  bytes: Uint8Array,
  label: string,
  contrastRegion?: PngContrastRegion
) {
  if (
    bytes.byteLength < 57 ||
    !PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
  )
    fail(`${label} PNG signature or framing mismatch`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let sawHeader = false;
  let sawImageData = false;
  let imageDataEnded = false;
  let sawEnd = false;
  const imageDataChunks: Uint8Array[] = [];
  let imageDataLength = 0;

  while (offset < bytes.byteLength) {
    if (bytes.byteLength - offset < 12)
      fail(`${label} PNG truncated chunk framing`);
    const length = view.getUint32(offset);
    const typeOffset = offset + 4;
    const dataOffset = offset + 8;
    const crcOffset = dataOffset + length;
    const nextOffset = crcOffset + 4;
    if (nextOffset > bytes.byteLength)
      fail(`${label} PNG truncated chunk data`);
    const type = String.fromCharCode(...bytes.subarray(typeOffset, dataOffset));
    if (!/^[A-Za-z]{4}$/.test(type)) fail(`${label} PNG illegal chunk type`);
    if (
      pngCrc32(bytes.subarray(typeOffset, crcOffset)) !==
      view.getUint32(crcOffset)
    )
      fail(`${label} PNG ${type} CRC mismatch`);

    if (type === 'IHDR') {
      if (sawHeader || offset !== PNG_SIGNATURE.length || length !== 13)
        fail(`${label} PNG IHDR order or length mismatch`);
      width = view.getUint32(dataOffset);
      height = view.getUint32(dataOffset + 4);
      if (
        width < 1 ||
        height < 1 ||
        bytes[dataOffset + 8] !== 8 ||
        bytes[dataOffset + 9] !== 2 ||
        bytes[dataOffset + 10] !== 0 ||
        bytes[dataOffset + 11] !== 0 ||
        bytes[dataOffset + 12] !== 0
      )
        fail(`${label} PNG unsupported or illegal IHDR screenshot profile`);
      sawHeader = true;
    } else if (type === 'IDAT') {
      if (!sawHeader || sawEnd || imageDataEnded || length < 1)
        fail(`${label} PNG IDAT order or length mismatch`);
      sawImageData = true;
      imageDataLength += length;
      if (!Number.isSafeInteger(imageDataLength))
        fail(`${label} PNG IDAT length overflow`);
      imageDataChunks.push(bytes.subarray(dataOffset, crcOffset));
    } else if (type === 'IEND') {
      if (!sawHeader || !sawImageData || sawEnd || length !== 0)
        fail(`${label} PNG IEND order or length mismatch`);
      sawEnd = true;
      if (nextOffset !== bytes.byteLength)
        fail(`${label} PNG data follows IEND`);
    } else {
      fail(`${label} PNG unsupported screenshot chunk ${type}`);
    }
    if (sawImageData && type !== 'IDAT' && type !== 'IEND')
      imageDataEnded = true;
    offset = nextOffset;
    if (sawEnd) break;
  }
  if (!sawHeader || !sawImageData || !sawEnd || offset !== bytes.byteLength)
    fail(`${label} PNG incomplete IHDR/IDAT/IEND structure`);

  const rowBytes = width * 3;
  const inflatedLength = height * (rowBytes + 1);
  if (
    !Number.isSafeInteger(rowBytes) ||
    !Number.isSafeInteger(inflatedLength) ||
    inflatedLength > PNG_MAX_INFLATED_BYTES
  )
    fail(`${label} PNG decoded image dimensions exceed supported profile`);
  const compressed = new Uint8Array(imageDataLength);
  let compressedOffset = 0;
  for (const chunk of imageDataChunks) {
    compressed.set(chunk, compressedOffset);
    compressedOffset += chunk.byteLength;
  }
  let inflated: Uint8Array;
  try {
    inflated = inflateSync(compressed, {
      maxOutputLength: inflatedLength + 1,
    });
  } catch {
    fail(`${label} PNG IDAT inflate failed`);
  }
  if (inflated.byteLength !== inflatedLength)
    fail(`${label} PNG inflated image-data length mismatch`);

  if (
    contrastRegion &&
    (contrastRegion.left < 0 ||
      contrastRegion.top < 0 ||
      contrastRegion.width < 1 ||
      contrastRegion.height < 1 ||
      contrastRegion.left + contrastRegion.width > width ||
      contrastRegion.top + contrastRegion.height > height)
  )
    fail(`${label} PNG contrast region containment`);

  let darkest = 1;
  let lightest = 0;
  let previous = new Uint8Array(rowBytes);
  let current = new Uint8Array(rowBytes);
  for (let row = 0; row < height; row += 1) {
    const scanlineOffset = row * (rowBytes + 1);
    const filter = inflated[scanlineOffset];
    if (filter > 4) fail(`${label} PNG illegal scanline filter`);
    current.fill(0);
    for (let column = 0; column < rowBytes; column += 1) {
      const encoded = inflated[scanlineOffset + column + 1];
      const left = column >= 3 ? current[column - 3] : 0;
      const above = previous[column];
      const upperLeft = column >= 3 ? previous[column - 3] : 0;
      const predictor =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? above
              : filter === 3
                ? Math.floor((left + above) / 2)
                : paethPredictor(left, above, upperLeft);
      current[column] = (encoded + predictor) & 0xff;
    }
    if (
      contrastRegion &&
      row >= contrastRegion.top &&
      row < contrastRegion.top + contrastRegion.height
    )
      for (
        let column = contrastRegion.left * 3;
        column < (contrastRegion.left + contrastRegion.width) * 3;
        column += 3
      ) {
        const luminance = relativeLuminance(
          current[column],
          current[column + 1],
          current[column + 2]
        );
        darkest = Math.min(darkest, luminance);
        lightest = Math.max(lightest, luminance);
      }
    const swap = previous;
    previous = current;
    current = swap;
  }
  return {
    width,
    height,
    contrastRatio: contrastRegion
      ? (lightest + 0.05) / (darkest + 0.05)
      : undefined,
  };
}

function relativeLuminance(red: number, green: number, blue: number) {
  const channels = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function assertStone0TrayEvidencePackage(
  value: unknown,
  identity: Stone0TrayEvidenceIdentity,
  artifactBytes: ReadonlyMap<string, Uint8Array>,
  markerNames: readonly string[] = ['PASS']
): Stone0TrayEvidencePackage {
  if (
    markerNames.length !== 1 ||
    markerNames[0] !== 'PASS' ||
    markerNames.includes('FAILED') ||
    markerNames.includes('FAILED.txt')
  )
    fail('package marker matrix must contain PASS and no FAILED marker');
  const packageValue = exactObject(value, PACKAGE_KEYS, 'package manifest');
  if (
    packageValue.schemaVersion !== 2 ||
    packageValue.kind !== 'stone0-original-d20-tray-package' ||
    packageValue.verdict !== 'PASS'
  )
    fail('package verdict/schema');
  if (
    packageValue.sourceSha !== identity.sourceSha ||
    packageValue.webBuildSha256 !== identity.webBuildSha256 ||
    packageValue.buildManifestSha256 !== identity.buildManifestSha256
  )
    fail('package source/build identity mismatch');

  const artifacts = denseArray(packageValue.artifacts, 'package artifacts').map(
    (artifact, index) =>
      exactObject(artifact, PACKAGE_ARTIFACT_KEYS, `package artifact ${index}`)
  );
  const expectedScreenshotPaths = [
    ...Array.from({ length: 20 }, (_, index) => {
      const result = index + 1;
      return [
        stone0ResultScreenshot(result),
        stone0ResultCloseupScreenshot(result, 'roller'),
        stone0ResultCloseupScreenshot(result, 'spectator'),
      ];
    }).flat(),
    ...STONE0_SCENARIO_IDS.map(stone0ScenarioScreenshot),
  ];
  const expectedPaths = [
    'build-manifest.json',
    'browser-evidence.json',
    'network.json',
    'console.json',
    ...expectedScreenshotPaths,
  ];
  if (
    artifacts.length !== expectedPaths.length ||
    artifactBytes.size !== expectedPaths.length
  )
    fail('package exact artifact count mismatch');
  artifacts.forEach((artifact, index) => {
    const path = expectedPaths[index];
    const expectedKind =
      path === 'build-manifest.json'
        ? 'build-manifest'
        : path.endsWith('.json')
          ? 'json'
          : 'screenshot';
    if (
      artifact.path !== path ||
      artifact.kind !== expectedKind ||
      !SHA256.test(String(artifact.sha256)) ||
      !Number.isSafeInteger(artifact.sizeBytes) ||
      Number(artifact.sizeBytes) < 1
    )
      fail(`package artifact order/schema mismatch: ${path}`);
    const bytes = artifactBytes.get(path);
    if (!bytes) fail(`package missing artifact bytes: ${path}`);
    if (
      bytes.byteLength !== artifact.sizeBytes ||
      hashBytes(bytes) !== artifact.sha256
    )
      fail(`package artifact digest/size mismatch: ${path}`);
  });
  for (const path of artifactBytes.keys())
    if (!expectedPaths.includes(path))
      fail(`package unexpected artifact bytes: ${path}`);

  const buildBytes = artifactBytes.get('build-manifest.json')!;
  if (hashBytes(buildBytes) !== identity.buildManifestSha256)
    fail('package build manifest digest mismatch');
  const build = validateManifest(parseJsonBytes(buildBytes, 'build manifest'));
  if (build.webBuildSha256 !== identity.webBuildSha256)
    fail('package parsed build identity mismatch');
  const evidence = assertStone0TrayEvidence(
    parseJsonBytes(
      artifactBytes.get('browser-evidence.json')!,
      'browser evidence'
    ),
    identity
  );
  const pending = evidence.scenarios.find(
    (scenario) => scenario.id === 'pending-provider'
  )!;
  const pendingFacts = object(
    pending.facts,
    'pending provider screenshot readability facts'
  );
  const statusRegion = object(
    pendingFacts.statusRegion,
    'pending provider screenshot status region'
  );
  const pendingContrastRegion: PngContrastRegion = {
    left: Number(statusRegion.left),
    top: Number(statusRegion.top),
    width: Number(statusRegion.width),
    height: Number(statusRegion.height),
  };

  let aggregateDecodedBytes = 0;
  for (const path of expectedScreenshotPaths) {
    const preflight = preflightPngDecodedBytes(
      artifactBytes.get(path)!,
      `package screenshot ${path}`
    );
    aggregateDecodedBytes += preflight.decodedBytes;
    if (
      !Number.isSafeInteger(aggregateDecodedBytes) ||
      aggregateDecodedBytes > PNG_MAX_AGGREGATE_DECODED_BYTES
    )
      fail(
        `package aggregate decoded PNG budget exceeds ${PNG_MAX_AGGREGATE_DECODED_BYTES} bytes`
      );
  }

  const screenshotDimensions = new Map<
    string,
    { readonly width: number; readonly height: number }
  >();
  let pendingScreenshotContrast: number | undefined;
  for (const path of expectedScreenshotPaths) {
    const decoded = decodePng(
      artifactBytes.get(path)!,
      `package screenshot ${path}`,
      path === pending.screenshot ? pendingContrastRegion : undefined
    );
    screenshotDimensions.set(path, {
      width: decoded.width,
      height: decoded.height,
    });
    if (path === pending.screenshot)
      pendingScreenshotContrast = decoded.contrastRatio;
  }
  if (
    pendingScreenshotContrast === undefined ||
    pendingScreenshotContrast < 4.5
  )
    fail('pending provider screenshot status region is not readable at 4.5:1');

  const network = validateNetwork(
    parseJsonBytes(artifactBytes.get('network.json')!, 'network'),
    evidence
  );
  const consoleSummary = validateConsole(
    parseJsonBytes(artifactBytes.get('console.json')!, 'console'),
    network
  );
  for (const result of evidence.results)
    for (const role of ['roller', 'spectator'] as const) {
      const closeup = result.closeups[role];
      const dimensions = screenshotDimensions.get(closeup.screenshot)!;
      if (
        dimensions.width !== closeup.physicalWidth ||
        dimensions.height !== closeup.physicalHeight ||
        dimensions.width < 220 ||
        dimensions.height < 220
      )
        fail(
          `result ${result.result} ${role} closeup physical dimensions mismatch`
        );
    }
  if (
    packageValue.resultCount !== evidence.results.length ||
    packageValue.scenarioCount !== evidence.scenarios.length ||
    packageValue.contextCount !== network.contextCount ||
    packageValue.screenshotCount !== expectedScreenshotPaths.length ||
    packageValue.closeupCount !== evidence.results.length * 2 ||
    packageValue.consoleErrorCount !== consoleSummary.consoleErrorCount ||
    packageValue.pageErrorCount !== consoleSummary.pageErrorCount
  )
    fail('package exact count summary mismatch');
  return value as Stone0TrayEvidencePackage;
}
