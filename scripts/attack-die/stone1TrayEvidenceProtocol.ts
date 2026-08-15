import { createHash } from 'node:crypto';
import { validateManifest } from './evidenceProtocol';
import { validatePngEvidenceSequence } from './pngEvidenceValidation';
import {
  ORIGINAL_D20_BODY_TRIANGLE_COUNT,
  ORIGINAL_D20_GLB_PATH,
  ORIGINAL_D20_GLB_SHA256,
  ORIGINAL_D20_MANIFEST_PATH,
  ORIGINAL_D20_MANIFEST_SHA256,
  ORIGINAL_D20_NUMERAL_TRIANGLE_COUNT,
  ORIGINAL_D20_PRESET_ID,
  ORIGINAL_D20_SIZE_BYTES,
  ORIGINAL_D20_SOURCE_MANIFEST_SHA256,
} from './stone0TrayEvidenceProtocol';

export const STONE1_SCENARIO_IDS = [
  'held-desktop',
  'held-outside-capture',
  'quick-release',
  'repeated-shake',
  'keyboard-neutral',
  'paired-shared-release',
  'reduced-motion-held',
  'responsive-narrow',
  'pointer-cancel',
  'lost-pointer-capture',
  'provider-failure',
  'context-loss',
] as const;

export const STONE1_PHASES = ['held', 'release', 'settled'] as const;
export const STONE1_DENIED_PROFILE_KEYS = [
  'result',
  'requestedResult',
  'mappedTarget',
  'target',
  'quaternion',
  'pointerId',
  'pointerType',
  'clientX',
  'clientY',
  'timestamp',
  'timeStamp',
  'history',
  'path',
  'bounds',
  'url',
  'transport',
  'log',
  'held',
] as const;

export type Stone1ScenarioId = (typeof STONE1_SCENARIO_IDS)[number];
export type Stone1Phase = (typeof STONE1_PHASES)[number];
export type Stone1Role = 'roller' | 'spectator';

export interface Stone1TrayEvidenceIdentity {
  sourceSha: string;
  frozenBuildSourceSha: string;
  webBuildSha256: string;
  buildManifestSha256: string;
  providerManifestSha256: string;
  providerSourceManifestSha256: string;
  providerGlbSha256: string;
}

export interface Stone1VisualThrowProfile {
  schemaVersion: 1;
  releasePosition: [number, number];
  releaseDirection: [number, number];
  releaseSpeed: number;
  shakeEnergy: number;
  spinBias: number;
  motionSeed: number;
}

export interface Stone1TimelineState {
  result: number;
  releaseCount: number;
  lifecyclePhase: 'armed' | 'rolling' | 'settled' | 'mixed';
  rollerGrabbed: boolean;
  spectatorGrabbed: boolean;
  releasePresent: boolean;
  profilePresent: boolean;
  finalObservationPresent: boolean;
}

export interface Stone1AfterReleaseState {
  result: number;
  releaseCount: number;
  lifecyclePhase: 'armed' | 'rolling' | 'settled' | 'mixed';
  rollerGrabbed: boolean;
  spectatorGrabbed: boolean;
  releasePresent: boolean;
  releaseSchemaVersion: number | null;
  profilePresent: boolean;
  profileSchemaVersion: number | null;
}

export interface Stone1FinalObservation {
  contextId: number;
  sourceId: number;
  cloneId: number;
  eventArrayId: number;
  providerId: number;
  requestedResult: number;
  observedUpwardResult: number;
  upwardDotThresholdPassed: boolean;
  upwardMarginThresholdPassed: boolean;
  angularThresholdPassed: boolean;
  exactTargetHeld: boolean;
  canvasVisible: boolean;
  motionRevision: 'choreographed-v1';
  profile: Stone1VisualThrowProfile;
  profileObjectFrozen: boolean;
  profileTuplesFrozen: boolean;
  observationObjectFrozen: boolean;
}

export interface Stone1ObservationPair {
  profilesDeepEqual: boolean;
  eventShared: boolean;
  providerShared: boolean;
  sourceShared: boolean;
  contextsDistinct: boolean;
  clonesDistinct: boolean;
  observationsDistinct: boolean;
  roller: Stone1FinalObservation;
  spectator: Stone1FinalObservation;
}

export interface Stone1FailureFact {
  origin: 'provider' | 'context-loss';
  fallbackRenderer: 'svg' | '3d';
  fallbackResult: number;
  affectedCanvasCount: number;
  heldStateCleared: boolean;
  staleHeldTelemetry: boolean;
  staleProfileTelemetry: boolean;
}

export interface Stone1ScenarioFact {
  id: Stone1ScenarioId;
  passed: boolean;
  screenshot: string;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  authoritativeResult: number;
  timeline: {
    beforeRelease: Stone1TimelineState;
    held: Stone1TimelineState;
    afterRelease: Stone1AfterReleaseState;
  };
  heldCue: {
    staticLifted: boolean;
    tumbleSampleCount: number;
    shakeSampleCount: number;
    bounceSampleCount: number;
  };
  outsideCaptureObserved: boolean;
  cancellationObserved: boolean;
  observations: Stone1ObservationPair | null;
  failure: Stone1FailureFact | null;
}

export interface Stone1PhaseCloseupFact {
  phase: Stone1Phase;
  role: Stone1Role;
  screenshot: string;
  deviceScaleFactor: number;
  physicalWidth: number;
  physicalHeight: number;
}

export interface Stone1TrayEvidence {
  schemaVersion: 1;
  kind: 'stone1-tactile-roll-group-evidence';
  sourceSha: string;
  frozenBuildSourceSha: string;
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
  };
  scenarios: Stone1ScenarioFact[];
  phaseCloseups: Stone1PhaseCloseupFact[];
  artifacts: {
    browserEvidence: string;
    network: string;
    console: string;
  };
  validationFailures: unknown[];
  unexpectedErrors: unknown[];
}

export interface Stone1PackageArtifact {
  path: string;
  kind: 'build-manifest' | 'json' | 'screenshot';
  sha256: string;
  sizeBytes: number;
}

export interface Stone1TrayEvidencePackage {
  schemaVersion: 1;
  kind: 'stone1-tactile-roll-group-package';
  verdict: 'PASS';
  sourceSha: string;
  frozenBuildSourceSha: string;
  webBuildSha256: string;
  buildManifestSha256: string;
  providerManifestSha256: string;
  providerSourceManifestSha256: string;
  providerGlbSha256: string;
  scenarioCount: number;
  contextCount: number;
  screenshotCount: number;
  validationRssLimitBytes: number;
  validationPeakRssBytes: number;
  artifacts: Stone1PackageArtifact[];
}

const SOURCE_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
export const STONE1_VALIDATION_RSS_LIMIT_BYTES = 512 * 1024 * 1024;
export const STONE1_MAX_AGGREGATE_DECODED_BYTES = 96 * 1024 * 1024;

const TOP_KEYS = [
  'schemaVersion',
  'kind',
  'sourceSha',
  'frozenBuildSourceSha',
  'webBuildSha256',
  'buildManifestSha256',
  'provider',
  'scenarios',
  'phaseCloseups',
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
] as const;
const SCENARIO_KEYS = [
  'id',
  'passed',
  'screenshot',
  'viewport',
  'deviceScaleFactor',
  'authoritativeResult',
  'timeline',
  'heldCue',
  'outsideCaptureObserved',
  'cancellationObserved',
  'observations',
  'failure',
] as const;
const VIEWPORT_KEYS = ['width', 'height'] as const;
const TIMELINE_KEYS = ['beforeRelease', 'held', 'afterRelease'] as const;
const TIMELINE_STATE_KEYS = [
  'result',
  'releaseCount',
  'lifecyclePhase',
  'rollerGrabbed',
  'spectatorGrabbed',
  'releasePresent',
  'profilePresent',
  'finalObservationPresent',
] as const;
const AFTER_RELEASE_KEYS = [
  'result',
  'releaseCount',
  'lifecyclePhase',
  'rollerGrabbed',
  'spectatorGrabbed',
  'releasePresent',
  'releaseSchemaVersion',
  'profilePresent',
  'profileSchemaVersion',
] as const;
const HELD_CUE_KEYS = [
  'staticLifted',
  'tumbleSampleCount',
  'shakeSampleCount',
  'bounceSampleCount',
] as const;
const OBSERVATION_PAIR_KEYS = [
  'profilesDeepEqual',
  'eventShared',
  'providerShared',
  'sourceShared',
  'contextsDistinct',
  'clonesDistinct',
  'observationsDistinct',
  'roller',
  'spectator',
] as const;
const OBSERVATION_KEYS = [
  'contextId',
  'sourceId',
  'cloneId',
  'eventArrayId',
  'providerId',
  'requestedResult',
  'observedUpwardResult',
  'upwardDotThresholdPassed',
  'upwardMarginThresholdPassed',
  'angularThresholdPassed',
  'exactTargetHeld',
  'canvasVisible',
  'motionRevision',
  'profile',
  'profileObjectFrozen',
  'profileTuplesFrozen',
  'observationObjectFrozen',
] as const;
const PROFILE_KEYS = [
  'schemaVersion',
  'releasePosition',
  'releaseDirection',
  'releaseSpeed',
  'shakeEnergy',
  'spinBias',
  'motionSeed',
] as const;
const FAILURE_KEYS = [
  'origin',
  'fallbackRenderer',
  'fallbackResult',
  'affectedCanvasCount',
  'heldStateCleared',
  'staleHeldTelemetry',
  'staleProfileTelemetry',
] as const;
const CLOSEUP_KEYS = [
  'phase',
  'role',
  'screenshot',
  'deviceScaleFactor',
  'physicalWidth',
  'physicalHeight',
] as const;
const ARTIFACT_BINDING_KEYS = [
  'browserEvidence',
  'network',
  'console',
] as const;
const PACKAGE_KEYS = [
  'schemaVersion',
  'kind',
  'verdict',
  'sourceSha',
  'frozenBuildSourceSha',
  'webBuildSha256',
  'buildManifestSha256',
  'providerManifestSha256',
  'providerSourceManifestSha256',
  'providerGlbSha256',
  'scenarioCount',
  'contextCount',
  'screenshotCount',
  'validationRssLimitBytes',
  'validationPeakRssBytes',
  'artifacts',
] as const;
const PACKAGE_ARTIFACT_KEYS = ['path', 'kind', 'sha256', 'sizeBytes'] as const;

const SUCCESS_IDS = new Set<Stone1ScenarioId>(STONE1_SCENARIO_IDS.slice(0, 8));
const POINTER_HELD_IDS = new Set<Stone1ScenarioId>([
  'held-desktop',
  'held-outside-capture',
  'quick-release',
  'repeated-shake',
  'paired-shared-release',
  'reduced-motion-held',
  'responsive-narrow',
  'pointer-cancel',
  'lost-pointer-capture',
  'context-loss',
]);
const CANCEL_IDS = new Set<Stone1ScenarioId>([
  'pointer-cancel',
  'lost-pointer-capture',
]);
const FAILURE_IDS = new Set<Stone1ScenarioId>([
  'provider-failure',
  'context-loss',
]);

function fail(reason: string): never {
  throw Error(`Stone 1 evidence ${reason}`);
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
  const actual = Reflect.ownKeys(candidate);
  if (
    actual.length !== keys.length ||
    !actual.every(
      (key) =>
        typeof key === 'string' &&
        keys.includes(key) &&
        Object.prototype.propertyIsEnumerable.call(candidate, key)
    )
  )
    fail(`${label} exact keys`);
  return candidate;
}

function denseArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) fail(`${label} dense array schema`);
  if (
    Reflect.ownKeys(value).length !== value.length + 1 ||
    Reflect.ownKeys(value).some(
      (key) =>
        typeof key !== 'string' || (key !== 'length' && !/^\d+$/.test(key))
    )
  )
    fail(`${label} dense array schema`);
  for (let index = 0; index < value.length; index += 1)
    if (!Object.prototype.hasOwnProperty.call(value, index))
      fail(`${label} dense array schema`);
  return value;
}

function emptyArray(value: unknown, label: string) {
  if (denseArray(value, label).length !== 0) fail(`${label} must be empty`);
}

function positiveSafeInteger(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 1)
    fail(`${label} must be a positive safe integer`);
  return Number(value);
}

function nonnegativeSafeInteger(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 0)
    fail(`${label} must be a nonnegative safe integer`);
  return Number(value);
}

function exactBoolean(value: unknown, expected: boolean, label: string) {
  if (value !== expected) fail(`${label} boolean mismatch`);
}

function exactString(value: unknown, expected: string, label: string) {
  if (value !== expected) fail(`${label} mismatch`);
}

function exactTimelineState(
  value: unknown,
  label: string,
  expected: {
    releaseCount: number;
    rollerGrabbed: boolean;
    releasePresent: boolean;
    profilePresent: boolean;
    finalObservationPresent: boolean;
  }
) {
  const state = exactObject(value, TIMELINE_STATE_KEYS, label);
  if (
    state.result !== 10 ||
    state.releaseCount !== expected.releaseCount ||
    state.lifecyclePhase !== 'armed'
  )
    fail(`${label} result/release/lifecycle mismatch`);
  exactBoolean(state.rollerGrabbed, expected.rollerGrabbed, `${label} Roller`);
  exactBoolean(state.spectatorGrabbed, false, `${label} Spectator`);
  exactBoolean(
    state.releasePresent,
    expected.releasePresent,
    `${label} release`
  );
  exactBoolean(
    state.profilePresent,
    expected.profilePresent,
    `${label} profile`
  );
  exactBoolean(
    state.finalObservationPresent,
    expected.finalObservationPresent,
    `${label} final observation`
  );
}

function finiteInRange(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string
) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  )
    fail(`${label} range`);
  return value;
}

function tuple(value: unknown, label: string): [number, number] {
  const values = denseArray(value, label);
  if (values.length !== 2) fail(`${label} exact tuple length`);
  return [
    finiteInRange(values[0], -1, 1, `${label}[0]`),
    finiteInRange(values[1], -1, 1, `${label}[1]`),
  ];
}

function validateProfile(
  value: unknown,
  label: string
): Stone1VisualThrowProfile {
  const profile = exactObject(value, PROFILE_KEYS, label);
  if (profile.schemaVersion !== 1) fail(`${label} schema version`);
  const position = tuple(profile.releasePosition, `${label} release position`);
  if (position.some((coordinate) => coordinate < 0 || coordinate > 1))
    fail(`${label} release position range`);
  const direction = tuple(
    profile.releaseDirection,
    `${label} release direction`
  );
  const releaseSpeed = finiteInRange(
    profile.releaseSpeed,
    0,
    1,
    `${label} release speed`
  );
  finiteInRange(profile.shakeEnergy, 0, 1, `${label} shake energy`);
  finiteInRange(profile.spinBias, -1, 1, `${label} spin bias`);
  const motionSeed = nonnegativeSafeInteger(
    profile.motionSeed,
    `${label} motion seed`
  );
  if (motionSeed > 0xffff_ffff) fail(`${label} motion seed range`);
  const directionLength = Math.hypot(...direction);
  if (
    (directionLength === 0 && releaseSpeed !== 0) ||
    (directionLength !== 0 && Math.abs(directionLength - 1) > 0.000001)
  )
    fail(`${label} canonical direction/speed`);
  return profile as unknown as Stone1VisualThrowProfile;
}

function validateObservation(
  value: unknown,
  label: string
): Stone1FinalObservation {
  const observation = exactObject(value, OBSERVATION_KEYS, label);
  for (const key of [
    'contextId',
    'sourceId',
    'cloneId',
    'eventArrayId',
    'providerId',
  ] as const)
    positiveSafeInteger(observation[key], `${label} ${key}`);
  if (
    observation.requestedResult !== 10 ||
    observation.observedUpwardResult !== 10
  )
    fail(`${label} authoritative/observed result mismatch`);
  for (const key of [
    'upwardDotThresholdPassed',
    'upwardMarginThresholdPassed',
    'angularThresholdPassed',
    'exactTargetHeld',
    'canvasVisible',
    'profileObjectFrozen',
    'profileTuplesFrozen',
    'observationObjectFrozen',
  ] as const)
    exactBoolean(observation[key], true, `${label} ${key}`);
  exactString(
    observation.motionRevision,
    'choreographed-v1',
    `${label} motion revision`
  );
  validateProfile(observation.profile, `${label} profile`);
  return observation as unknown as Stone1FinalObservation;
}

function validateObservations(value: unknown, label: string) {
  const pair = exactObject(value, OBSERVATION_PAIR_KEYS, label);
  for (const key of [
    'profilesDeepEqual',
    'eventShared',
    'providerShared',
    'sourceShared',
    'contextsDistinct',
    'clonesDistinct',
    'observationsDistinct',
  ] as const)
    exactBoolean(pair[key], true, `${label} ${key}`);
  const roller = validateObservation(pair.roller, `${label} Roller`);
  const spectator = validateObservation(pair.spectator, `${label} Spectator`);
  if (
    roller.contextId === spectator.contextId ||
    roller.cloneId === spectator.cloneId
  )
    fail(`${label} contexts/clones are not independent`);
  if (
    roller.sourceId !== spectator.sourceId ||
    roller.eventArrayId !== spectator.eventArrayId ||
    roller.providerId !== spectator.providerId
  )
    fail(`${label} source/provider/events are not shared`);
  if (JSON.stringify(roller.profile) !== JSON.stringify(spectator.profile))
    fail(`${label} profiles are not deep-equal`);
}

export function stone1ScenarioScreenshot(id: Stone1ScenarioId) {
  if (!STONE1_SCENARIO_IDS.includes(id)) fail('scenario screenshot ID');
  const dimensions = id === 'responsive-narrow' ? '760x900' : '1440x1080';
  return `stone1-${String(STONE1_SCENARIO_IDS.indexOf(id) + 1).padStart(2, '0')}-${id}-${dimensions}.png`;
}

export function stone1PhaseCloseupScreenshot(
  phase: Stone1Phase,
  role: Stone1Role
) {
  if (!STONE1_PHASES.includes(phase) || !['roller', 'spectator'].includes(role))
    fail('phase closeup input');
  return `stone1-phase-${phase}-${role}-well.png`;
}

function validateScenario(value: unknown, id: Stone1ScenarioId, index: number) {
  const label = `scenario ${id}`;
  const scenario = exactObject(value, SCENARIO_KEYS, label);
  if (scenario.id !== id || scenario.passed !== true)
    fail(`${label} identity/verdict`);
  exactString(
    scenario.screenshot,
    stone1ScenarioScreenshot(id),
    `${label} screenshot`
  );
  const viewport = exactObject(
    scenario.viewport,
    VIEWPORT_KEYS,
    `${label} viewport`
  );
  const expectedViewport =
    id === 'responsive-narrow'
      ? { width: 760, height: 900 }
      : { width: 1440, height: 1080 };
  if (
    viewport.width !== expectedViewport.width ||
    viewport.height !== expectedViewport.height ||
    scenario.deviceScaleFactor !== 1 ||
    scenario.authoritativeResult !== 10
  )
    fail(`${label} viewport/scale/result mismatch`);

  const timeline = exactObject(
    scenario.timeline,
    TIMELINE_KEYS,
    `${label} timeline`
  );
  exactTimelineState(timeline.beforeRelease, `${label} before release`, {
    releaseCount: 0,
    rollerGrabbed: false,
    releasePresent: false,
    profilePresent: false,
    finalObservationPresent: false,
  });
  exactTimelineState(timeline.held, `${label} held`, {
    releaseCount: 0,
    rollerGrabbed: POINTER_HELD_IDS.has(id),
    releasePresent: false,
    profilePresent: false,
    finalObservationPresent: false,
  });

  const released = SUCCESS_IDS.has(id) || FAILURE_IDS.has(id);
  const after = exactObject(
    timeline.afterRelease,
    AFTER_RELEASE_KEYS,
    `${label} after release`
  );
  if (
    after.result !== 10 ||
    after.releaseCount !== (released ? 1 : 0) ||
    after.lifecyclePhase !== (released ? 'settled' : 'armed')
  )
    fail(`${label} after result/release/lifecycle mismatch`);
  exactBoolean(after.rollerGrabbed, false, `${label} after Roller grabbed`);
  exactBoolean(
    after.spectatorGrabbed,
    false,
    `${label} after Spectator grabbed`
  );
  exactBoolean(
    after.releasePresent,
    released,
    `${label} after release present`
  );
  exactBoolean(
    after.profilePresent,
    released,
    `${label} after profile present`
  );
  if (
    after.releaseSchemaVersion !== (released ? 2 : null) ||
    after.profileSchemaVersion !== (released ? 1 : null)
  )
    fail(`${label} release/profile schema mismatch`);

  const cue = exactObject(scenario.heldCue, HELD_CUE_KEYS, `${label} held cue`);
  for (const key of [
    'tumbleSampleCount',
    'shakeSampleCount',
    'bounceSampleCount',
  ] as const)
    nonnegativeSafeInteger(cue[key], `${label} ${key}`);
  if (id === 'reduced-motion-held') {
    exactBoolean(cue.staticLifted, true, `${label} static lifted cue`);
    if (
      cue.tumbleSampleCount !== 0 ||
      cue.shakeSampleCount !== 0 ||
      cue.bounceSampleCount !== 0
    )
      fail(`${label} reduced motion animated samples`);
  } else {
    exactBoolean(cue.staticLifted, false, `${label} static lifted cue`);
    if (
      SUCCESS_IDS.has(id) &&
      id !== 'keyboard-neutral' &&
      (Number(cue.tumbleSampleCount) < 1 ||
        Number(cue.shakeSampleCount) < 1 ||
        Number(cue.bounceSampleCount) < 1)
    )
      fail(`${label} tactile motion samples missing`);
    if (
      (!SUCCESS_IDS.has(id) || id === 'keyboard-neutral') &&
      (cue.tumbleSampleCount !== 0 ||
        cue.shakeSampleCount !== 0 ||
        cue.bounceSampleCount !== 0)
    )
      fail(`${label} unexpected motion samples`);
  }
  exactBoolean(
    scenario.outsideCaptureObserved,
    id === 'held-outside-capture',
    `${label} outside-capture witness`
  );
  exactBoolean(
    scenario.cancellationObserved,
    CANCEL_IDS.has(id),
    `${label} cancellation witness`
  );

  if (SUCCESS_IDS.has(id)) {
    if (scenario.observations === null) fail(`${label} observations missing`);
    validateObservations(scenario.observations, `${label} observations`);
  } else if (scenario.observations !== null) {
    fail(`${label} stale/unexpected observations`);
  }

  if (FAILURE_IDS.has(id)) {
    const failure = exactObject(
      scenario.failure,
      FAILURE_KEYS,
      `${label} failure`
    );
    if (
      failure.origin !==
        (id === 'provider-failure' ? 'provider' : 'context-loss') ||
      failure.fallbackRenderer !== 'svg' ||
      failure.fallbackResult !== 10 ||
      failure.affectedCanvasCount !== 0
    )
      fail(`${label} fallback identity/result/Canvas mismatch`);
    exactBoolean(failure.heldStateCleared, true, `${label} held cleanup`);
    exactBoolean(
      failure.staleHeldTelemetry,
      false,
      `${label} stale held telemetry`
    );
    exactBoolean(
      failure.staleProfileTelemetry,
      false,
      `${label} stale profile telemetry`
    );
  } else if (scenario.failure !== null) {
    fail(`${label} unexpected failure fact`);
  }

  if (index !== STONE1_SCENARIO_IDS.indexOf(id))
    fail(`${label} order mismatch`);
}

export function assertStone1TrayEvidence(
  value: unknown,
  identity: Stone1TrayEvidenceIdentity
): Stone1TrayEvidence {
  if (
    !SOURCE_SHA.test(identity.sourceSha) ||
    identity.frozenBuildSourceSha !== identity.sourceSha ||
    !SHA256.test(identity.webBuildSha256) ||
    !SHA256.test(identity.buildManifestSha256) ||
    identity.providerManifestSha256 !== ORIGINAL_D20_MANIFEST_SHA256 ||
    identity.providerSourceManifestSha256 !==
      ORIGINAL_D20_SOURCE_MANIFEST_SHA256 ||
    identity.providerGlbSha256 !== ORIGINAL_D20_GLB_SHA256
  )
    fail('expected exact source/build/corrected-provider identity');
  const evidence = exactObject(value, TOP_KEYS, 'top-level');
  if (
    evidence.schemaVersion !== 1 ||
    evidence.kind !== 'stone1-tactile-roll-group-evidence'
  )
    fail('top-level schema');
  if (
    evidence.sourceSha !== identity.sourceSha ||
    evidence.frozenBuildSourceSha !== identity.sourceSha ||
    evidence.webBuildSha256 !== identity.webBuildSha256 ||
    evidence.buildManifestSha256 !== identity.buildManifestSha256
  )
    fail('source/frozen-build identity mismatch');
  const provider = exactObject(evidence.provider, PROVIDER_KEYS, 'provider');
  if (
    provider.manifestPath !== ORIGINAL_D20_MANIFEST_PATH ||
    provider.manifestSha256 !== identity.providerManifestSha256 ||
    provider.sourceManifestSha256 !== identity.providerSourceManifestSha256 ||
    provider.presetId !== ORIGINAL_D20_PRESET_ID ||
    provider.glbPath !== ORIGINAL_D20_GLB_PATH ||
    provider.glbSha256 !== identity.providerGlbSha256 ||
    provider.glbSizeBytes !== ORIGINAL_D20_SIZE_BYTES ||
    provider.bodyTriangleCount !== ORIGINAL_D20_BODY_TRIANGLE_COUNT ||
    provider.numeralTriangleCount !== ORIGINAL_D20_NUMERAL_TRIANGLE_COUNT
  )
    fail('provider bytes/preset/triangle-role binding mismatch');

  const scenarios = denseArray(evidence.scenarios, 'scenarios');
  if (scenarios.length !== STONE1_SCENARIO_IDS.length)
    fail('scenario matrix must contain exactly twelve scenarios');
  scenarios.forEach((scenario, index) =>
    validateScenario(scenario, STONE1_SCENARIO_IDS[index], index)
  );

  const closeups = denseArray(evidence.phaseCloseups, 'phase closeups');
  if (closeups.length !== STONE1_PHASES.length * 2)
    fail('phase closeup exact count');
  closeups.forEach((raw, index) => {
    const closeup = exactObject(raw, CLOSEUP_KEYS, `phase closeup ${index}`);
    const phase = STONE1_PHASES[Math.floor(index / 2)];
    const role = (index % 2 === 0 ? 'roller' : 'spectator') as Stone1Role;
    if (
      closeup.phase !== phase ||
      closeup.role !== role ||
      closeup.screenshot !== stone1PhaseCloseupScreenshot(phase, role) ||
      closeup.deviceScaleFactor !== 1
    )
      fail(`phase closeup ${index} identity/scale/order`);
    if (
      positiveSafeInteger(
        closeup.physicalWidth,
        `phase closeup ${index} width`
      ) < 220 ||
      positiveSafeInteger(
        closeup.physicalHeight,
        `phase closeup ${index} height`
      ) < 220
    )
      fail(`phase closeup ${index} dimensions`);
  });
  const screenshotPaths = [
    ...STONE1_SCENARIO_IDS.map(stone1ScenarioScreenshot),
    ...STONE1_PHASES.flatMap((phase) =>
      (['roller', 'spectator'] as const).map((role) =>
        stone1PhaseCloseupScreenshot(phase, role)
      )
    ),
  ];
  if (new Set(screenshotPaths).size !== screenshotPaths.length)
    fail('duplicate screenshot paths');
  const artifacts = exactObject(
    evidence.artifacts,
    ARTIFACT_BINDING_KEYS,
    'artifact bindings'
  );
  exactString(
    artifacts.browserEvidence,
    'browser-evidence.json',
    'browser evidence artifact'
  );
  exactString(artifacts.network, 'network.json', 'network artifact');
  exactString(artifacts.console, 'console.json', 'console artifact');
  emptyArray(evidence.validationFailures, 'validation failures');
  emptyArray(evidence.unexpectedErrors, 'unexpected errors');
  return value as Stone1TrayEvidence;
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

const NETWORK_KEYS = [
  'schemaVersion',
  'kind',
  'contexts',
  'requests',
  'unexpectedErrors',
] as const;
const NETWORK_CONTEXT_KEYS = [
  'scenarioId',
  'contextOrdinal',
  'manifestRequestCount',
  'manifestTransferCount',
  'glbRequestCount',
  'glbTransferCount',
  'unexpectedRequestCount',
] as const;
const NETWORK_REQUEST_KEYS = [
  'scenarioId',
  'url',
  'method',
  'resourceType',
  'status',
  'expected',
] as const;
const CONSOLE_KEYS = [
  'schemaVersion',
  'kind',
  'entries',
  'pageErrors',
  'unexpectedErrors',
] as const;
const CONSOLE_ENTRY_KEYS = [
  'scenarioId',
  'type',
  'text',
  'url',
  'expected',
] as const;

function validateNetwork(value: unknown) {
  const network = exactObject(value, NETWORK_KEYS, 'network log');
  if (network.schemaVersion !== 1 || network.kind !== 'stone1-network-log')
    fail('network log schema');
  const contexts = denseArray(network.contexts, 'network contexts');
  if (contexts.length !== STONE1_SCENARIO_IDS.length)
    fail('network exact context count');
  contexts.forEach((raw, index) => {
    const context = exactObject(
      raw,
      NETWORK_CONTEXT_KEYS,
      `network context ${index}`
    );
    const id = STONE1_SCENARIO_IDS[index];
    const providerFailed = id === 'provider-failure';
    if (
      context.scenarioId !== id ||
      context.contextOrdinal !== index + 1 ||
      context.manifestRequestCount !== 1 ||
      context.manifestTransferCount !== (providerFailed ? 0 : 1) ||
      context.glbRequestCount !== (providerFailed ? 0 : 1) ||
      context.glbTransferCount !== (providerFailed ? 0 : 1) ||
      context.unexpectedRequestCount !== 0
    )
      fail(`network ${id} exact request/transfer matrix`);
  });
  const requests = denseArray(network.requests, 'network request records');
  requests.forEach((raw, index) => {
    const request = exactObject(
      raw,
      NETWORK_REQUEST_KEYS,
      `network request ${index}`
    );
    if (
      !STONE1_SCENARIO_IDS.includes(request.scenarioId as Stone1ScenarioId) ||
      typeof request.url !== 'string' ||
      typeof request.method !== 'string' ||
      typeof request.resourceType !== 'string' ||
      !(request.status === null || Number.isInteger(request.status)) ||
      request.expected !== true
    )
      fail(`network request ${index} schema/ownership`);
  });
  emptyArray(network.unexpectedErrors, 'network unexpected errors');
  return contexts.length;
}

function validateConsole(value: unknown) {
  const artifact = exactObject(value, CONSOLE_KEYS, 'console log');
  if (artifact.schemaVersion !== 1 || artifact.kind !== 'stone1-console-log')
    fail('console log schema');
  const entries = denseArray(artifact.entries, 'console entries');
  entries.forEach((raw, index) => {
    const entry = exactObject(
      raw,
      CONSOLE_ENTRY_KEYS,
      `console entry ${index}`
    );
    if (
      !STONE1_SCENARIO_IDS.includes(entry.scenarioId as Stone1ScenarioId) ||
      typeof entry.type !== 'string' ||
      typeof entry.text !== 'string' ||
      typeof entry.url !== 'string' ||
      entry.expected !== true
    )
      fail(`console entry ${index} schema/expectation`);
  });
  emptyArray(artifact.pageErrors, 'console page errors');
  emptyArray(artifact.unexpectedErrors, 'console unexpected errors');
}

function currentPeakRssBytes() {
  // maxRSS is KiB on Linux (the evidence capture platform).
  return process.resourceUsage().maxRSS * 1024;
}

export function assertStone1TrayEvidencePackage(
  value: unknown,
  identity: Stone1TrayEvidenceIdentity,
  artifactBytes: ReadonlyMap<string, Uint8Array>,
  markerNames: readonly string[] = ['PASS']
): Stone1TrayEvidencePackage {
  if (
    markerNames.length !== 1 ||
    markerNames[0] !== 'PASS' ||
    markerNames.some((name) =>
      ['FAILED', 'FAILED.txt', 'INVALIDATED-PASS.txt'].includes(name)
    )
  )
    fail(
      'package markers require only PASS; failed/invalidated packages reject'
    );
  const packageValue = exactObject(value, PACKAGE_KEYS, 'package manifest');
  if (
    packageValue.schemaVersion !== 1 ||
    packageValue.kind !== 'stone1-tactile-roll-group-package' ||
    packageValue.verdict !== 'PASS'
  )
    fail('package verdict/schema');
  if (
    packageValue.sourceSha !== identity.sourceSha ||
    packageValue.frozenBuildSourceSha !== identity.sourceSha ||
    packageValue.webBuildSha256 !== identity.webBuildSha256 ||
    packageValue.buildManifestSha256 !== identity.buildManifestSha256 ||
    packageValue.providerManifestSha256 !== identity.providerManifestSha256 ||
    packageValue.providerSourceManifestSha256 !==
      identity.providerSourceManifestSha256 ||
    packageValue.providerGlbSha256 !== identity.providerGlbSha256
  )
    fail('package source/build/provider identity binding');
  if (
    packageValue.validationRssLimitBytes !==
      STONE1_VALIDATION_RSS_LIMIT_BYTES ||
    !Number.isSafeInteger(packageValue.validationPeakRssBytes) ||
    Number(packageValue.validationPeakRssBytes) < 1 ||
    Number(packageValue.validationPeakRssBytes) >
      STONE1_VALIDATION_RSS_LIMIT_BYTES
  )
    fail('package validation RSS declaration');

  const expectedScreenshotPaths = [
    ...STONE1_SCENARIO_IDS.map(stone1ScenarioScreenshot),
    ...STONE1_PHASES.flatMap((phase) =>
      (['roller', 'spectator'] as const).map((role) =>
        stone1PhaseCloseupScreenshot(phase, role)
      )
    ),
  ];
  const expectedPaths = [
    'build-manifest.json',
    'browser-evidence.json',
    'network.json',
    'console.json',
    ...expectedScreenshotPaths,
  ];
  const artifacts = denseArray(packageValue.artifacts, 'package artifacts').map(
    (artifact, index) =>
      exactObject(artifact, PACKAGE_ARTIFACT_KEYS, `package artifact ${index}`)
  );
  if (
    artifacts.length !== expectedPaths.length ||
    artifactBytes.size !== expectedPaths.length
  )
    fail('package exact artifact count');
  artifacts.forEach((artifact, index) => {
    const path = expectedPaths[index];
    const kind =
      path === 'build-manifest.json'
        ? 'build-manifest'
        : path.endsWith('.json')
          ? 'json'
          : 'screenshot';
    if (
      artifact.path !== path ||
      artifact.kind !== kind ||
      !SHA256.test(String(artifact.sha256)) ||
      !Number.isSafeInteger(artifact.sizeBytes) ||
      Number(artifact.sizeBytes) < 1
    )
      fail(`package artifact order/schema ${path}`);
    const bytes = artifactBytes.get(path);
    if (
      !bytes ||
      bytes.byteLength !== artifact.sizeBytes ||
      hashBytes(bytes) !== artifact.sha256
    )
      fail(`package artifact digest/size ${path}`);
  });
  for (const path of artifactBytes.keys())
    if (!expectedPaths.includes(path))
      fail(`package unexpected artifact ${path}`);

  const buildBytes = artifactBytes.get('build-manifest.json')!;
  if (hashBytes(buildBytes) !== identity.buildManifestSha256)
    fail('package build manifest hash mismatch');
  const build = validateManifest(parseJsonBytes(buildBytes, 'build manifest'));
  if (build.webBuildSha256 !== identity.webBuildSha256)
    fail('package frozen build root mismatch');
  const evidence = assertStone1TrayEvidence(
    parseJsonBytes(
      artifactBytes.get('browser-evidence.json')!,
      'browser evidence'
    ),
    identity
  );
  const contextCount = validateNetwork(
    parseJsonBytes(artifactBytes.get('network.json')!, 'network')
  );
  validateConsole(
    parseJsonBytes(artifactBytes.get('console.json')!, 'console')
  );

  const pngValidation = validatePngEvidenceSequence(
    expectedScreenshotPaths.map((path) => ({
      path,
      bytes: artifactBytes.get(path)!,
      requireReadableContent: true,
    })),
    { maxAggregateDecodedBytes: STONE1_MAX_AGGREGATE_DECODED_BYTES }
  );
  const dimensions = new Map(
    pngValidation.images.map((image) => [image.path, image] as const)
  );
  for (const scenario of evidence.scenarios) {
    const image = dimensions.get(scenario.screenshot)!;
    if (
      image.width !== scenario.viewport.width * scenario.deviceScaleFactor ||
      image.height !== scenario.viewport.height * scenario.deviceScaleFactor ||
      image.opaquePixelCount !== image.width * image.height ||
      !image.readableContent
    )
      fail(`scenario ${scenario.id} screenshot viewport/content mismatch`);
  }
  for (const closeup of evidence.phaseCloseups) {
    const image = dimensions.get(closeup.screenshot)!;
    if (
      image.width !== closeup.physicalWidth ||
      image.height !== closeup.physicalHeight ||
      image.width < 220 ||
      image.height < 220 ||
      image.opaquePixelCount !== image.width * image.height ||
      !image.readableContent
    )
      fail(`phase ${closeup.phase} ${closeup.role} screenshot mismatch`);
  }
  if (
    packageValue.scenarioCount !== evidence.scenarios.length ||
    packageValue.contextCount !== contextCount ||
    packageValue.screenshotCount !== expectedScreenshotPaths.length
  )
    fail('package exact count summary');
  if (currentPeakRssBytes() > STONE1_VALIDATION_RSS_LIMIT_BYTES)
    fail('package validation process exceeded 512 MiB peak RSS');
  return value as Stone1TrayEvidencePackage;
}
