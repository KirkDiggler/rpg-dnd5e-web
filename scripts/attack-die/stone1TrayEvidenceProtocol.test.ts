// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  ORIGINAL_D20_GLB_SHA256,
  ORIGINAL_D20_MANIFEST_SHA256,
  ORIGINAL_D20_SOURCE_MANIFEST_SHA256,
} from './stone0TrayEvidenceProtocol';
import {
  STONE1_DENIED_PROFILE_KEYS,
  STONE1_PHASES,
  STONE1_SCENARIO_IDS,
  assertStone1TrayEvidence,
  assertStone1TrayEvidencePackage,
  stone1PhaseCloseupScreenshot,
  stone1ScenarioScreenshot,
  type Stone1TrayEvidence,
  type Stone1TrayEvidenceIdentity,
} from './stone1TrayEvidenceProtocol';

const sha256 = (bytes: Uint8Array | string) =>
  createHash('sha256').update(bytes).digest('hex');

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1)
    crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data = new Uint8Array()) {
  const bytes = new Uint8Array(12 + data.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.byteLength);
  bytes.set(new TextEncoder().encode(type), 4);
  bytes.set(data, 8);
  view.setUint32(
    8 + data.byteLength,
    crc32(bytes.subarray(4, 8 + data.byteLength))
  );
  return bytes;
}
function screenshotPng(width: number, height: number, filter = 0) {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = new Uint8Array(height * (width * 3 + 1));
  for (let row = 0; row < height; row += 1) {
    const offset = row * (width * 3 + 1);
    rows[offset] = filter;
    rows[offset + 1] = row % 255;
    rows[offset + 2] = 40;
    rows[offset + 3] = 220;
    rows[offset + 4] = 245;
    rows[offset + 5] = 180;
    rows[offset + 6] = 20;
  }
  return Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk('IHDR', header),
    ...chunk('IDAT', deflateSync(rows)),
    ...chunk('IEND'),
  ]);
}

const buildIndex = new TextEncoder().encode(
  '<script>1'.repeat(40) + '</script>'
);
const buildFileSha = sha256(buildIndex);
const webBuildSha256 = sha256(
  `index.html\0${buildIndex.byteLength}\0${buildFileSha}\n`
);
const buildManifestBytes = new TextEncoder().encode(
  JSON.stringify({
    schemaVersion: 1,
    kind: 'attack-die-web-build-manifest',
    files: [
      { path: 'index.html', size: buildIndex.byteLength, sha256: buildFileSha },
    ],
    webBuildSha256,
  })
);
const identity: Stone1TrayEvidenceIdentity = {
  sourceSha: '1'.repeat(40),
  frozenBuildSourceSha: '1'.repeat(40),
  webBuildSha256,
  buildManifestSha256: sha256(buildManifestBytes),
  providerManifestSha256: ORIGINAL_D20_MANIFEST_SHA256,
  providerSourceManifestSha256: ORIGINAL_D20_SOURCE_MANIFEST_SHA256,
  providerGlbSha256: ORIGINAL_D20_GLB_SHA256,
};

const profile = Object.freeze({
  schemaVersion: 1 as const,
  releasePosition: Object.freeze([0.55, 0.45] as const),
  releaseDirection: Object.freeze([0.6, 0.8] as const),
  releaseSpeed: 0.7,
  shakeEnergy: 0.4,
  spinBias: -0.25,
  motionSeed: 42,
});

function timeline(release: boolean, held: boolean) {
  return {
    beforeRelease: {
      result: 10,
      releaseCount: 0,
      lifecyclePhase: 'armed',
      rollerGrabbed: false,
      spectatorGrabbed: false,
      releasePresent: false,
      profilePresent: false,
      finalObservationPresent: false,
    },
    held: {
      result: 10,
      releaseCount: 0,
      lifecyclePhase: 'armed',
      rollerGrabbed: held,
      spectatorGrabbed: false,
      releasePresent: false,
      profilePresent: false,
      finalObservationPresent: false,
    },
    afterRelease: {
      result: 10,
      releaseCount: release ? 1 : 0,
      lifecyclePhase: release ? 'settled' : 'armed',
      rollerGrabbed: false,
      spectatorGrabbed: false,
      releasePresent: release,
      releaseSchemaVersion: release ? 2 : null,
      profilePresent: release,
      profileSchemaVersion: release ? 1 : null,
    },
  } as const;
}

function observation(role: 'roller' | 'spectator', contextBase = 100) {
  const roller = role === 'roller';
  return {
    contextId: contextBase + (roller ? 1 : 2),
    sourceId: contextBase + 3,
    cloneId: contextBase + (roller ? 4 : 5),
    eventArrayId: contextBase + 6,
    providerId: contextBase + 7,
    requestedResult: 10,
    observedUpwardResult: 10,
    upwardDotThresholdPassed: true,
    upwardMarginThresholdPassed: true,
    angularThresholdPassed: true,
    exactTargetHeld: true,
    canvasVisible: true,
    motionRevision: 'choreographed-v1',
    profile,
    profileObjectFrozen: true,
    profileTuplesFrozen: true,
    observationObjectFrozen: true,
  } as const;
}

function observations(index: number) {
  const contextBase = (index + 1) * 100;
  return {
    profilesDeepEqual: true,
    eventShared: true,
    providerShared: true,
    sourceShared: true,
    contextsDistinct: true,
    clonesDistinct: true,
    observationsDistinct: true,
    roller: observation('roller', contextBase),
    spectator: observation('spectator', contextBase),
  } as const;
}

const successIds = new Set(STONE1_SCENARIO_IDS.slice(0, 8));
const pointerHeldIds = new Set([
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

function scenario(id: (typeof STONE1_SCENARIO_IDS)[number], index: number) {
  const success = successIds.has(id);
  const cancelled = id === 'pointer-cancel' || id === 'lost-pointer-capture';
  const failure = id === 'provider-failure' || id === 'context-loss';
  const release = success || failure;
  const viewport =
    id === 'responsive-narrow'
      ? { width: 760, height: 900 }
      : { width: 1440, height: 1080 };
  return {
    id,
    passed: true,
    screenshot: stone1ScenarioScreenshot(id),
    viewport,
    deviceScaleFactor: 1,
    authoritativeResult: 10,
    timeline: timeline(release, pointerHeldIds.has(id)),
    heldCue: {
      staticLifted: id === 'reduced-motion-held',
      tumbleSampleCount:
        id === 'reduced-motion-held'
          ? 0
          : success && id !== 'keyboard-neutral'
            ? 3
            : 0,
      shakeSampleCount:
        id === 'reduced-motion-held'
          ? 0
          : success && id !== 'keyboard-neutral'
            ? 2
            : 0,
      bounceSampleCount:
        id === 'reduced-motion-held'
          ? 0
          : success && id !== 'keyboard-neutral'
            ? 1
            : 0,
    },
    outsideCaptureObserved: id === 'held-outside-capture',
    cancellationObserved: cancelled,
    observations: success ? observations(index) : null,
    failure: failure
      ? {
          origin: id === 'provider-failure' ? 'provider' : 'context-loss',
          fallbackRenderer: 'svg',
          fallbackResult: 10,
          affectedCanvasCount: 0,
          heldStateCleared: true,
          staleHeldTelemetry: false,
          staleProfileTelemetry: false,
        }
      : null,
  };
}

function evidence(): Stone1TrayEvidence {
  return {
    schemaVersion: 1,
    kind: 'stone1-tactile-roll-group-evidence',
    sourceSha: identity.sourceSha,
    frozenBuildSourceSha: identity.frozenBuildSourceSha,
    webBuildSha256: identity.webBuildSha256,
    buildManifestSha256: identity.buildManifestSha256,
    provider: {
      manifestPath: '/models/custom-dice/dice-tray-presets.json',
      manifestSha256: ORIGINAL_D20_MANIFEST_SHA256,
      sourceManifestSha256: ORIGINAL_D20_SOURCE_MANIFEST_SHA256,
      presetId: 'dice.original.carved.d20',
      glbPath: '/models/custom-dice/original-set/Original_D20_Source.glb',
      glbSha256: ORIGINAL_D20_GLB_SHA256,
      glbSizeBytes: 491312,
      bodyTriangleCount: 2684,
      numeralTriangleCount: 7798,
    },
    scenarios: STONE1_SCENARIO_IDS.map(scenario),
    phaseCloseups: STONE1_PHASES.flatMap((phase) =>
      (['roller', 'spectator'] as const).map((role) => ({
        phase,
        role,
        screenshot: stone1PhaseCloseupScreenshot(phase, role),
        deviceScaleFactor: 1,
        physicalWidth: 320,
        physicalHeight: 248,
      }))
    ),
    artifacts: {
      browserEvidence: 'browser-evidence.json',
      network: 'network.json',
      console: 'console.json',
    },
    validationFailures: [],
    unexpectedErrors: [],
  };
}

function networkArtifact() {
  return {
    schemaVersion: 1,
    kind: 'stone1-network-log',
    contexts: STONE1_SCENARIO_IDS.map((scenarioId, index) => ({
      scenarioId,
      contextOrdinal: index + 1,
      manifestRequestCount: 1,
      manifestTransferCount: scenarioId === 'provider-failure' ? 0 : 1,
      glbRequestCount: scenarioId === 'provider-failure' ? 0 : 1,
      glbTransferCount: scenarioId === 'provider-failure' ? 0 : 1,
      unexpectedRequestCount: 0,
    })),
    requests: [],
    unexpectedErrors: [],
  };
}
function consoleArtifact() {
  return {
    schemaVersion: 1,
    kind: 'stone1-console-log',
    entries: [],
    pageErrors: [],
    unexpectedErrors: [],
  };
}

function packageFixture() {
  const browser = new TextEncoder().encode(JSON.stringify(evidence()));
  const network = new TextEncoder().encode(JSON.stringify(networkArtifact()));
  const consoleBytes = new TextEncoder().encode(
    JSON.stringify(consoleArtifact())
  );
  const artifactBytes = new Map<string, Uint8Array>([
    ['build-manifest.json', buildManifestBytes],
    ['browser-evidence.json', browser],
    ['network.json', network],
    ['console.json', consoleBytes],
  ]);
  for (const id of STONE1_SCENARIO_IDS) {
    const viewport = id === 'responsive-narrow' ? [760, 900] : [1440, 1080];
    artifactBytes.set(
      stone1ScenarioScreenshot(id),
      screenshotPng(viewport[0], viewport[1])
    );
  }
  for (const phase of STONE1_PHASES)
    for (const role of ['roller', 'spectator'] as const)
      artifactBytes.set(
        stone1PhaseCloseupScreenshot(phase, role),
        screenshotPng(320, 248)
      );
  const artifacts = [...artifactBytes].map(([path, bytes]) => ({
    path,
    kind:
      path === 'build-manifest.json'
        ? 'build-manifest'
        : path.endsWith('.json')
          ? 'json'
          : 'screenshot',
    sha256: sha256(bytes),
    sizeBytes: bytes.byteLength,
  }));
  return {
    manifest: {
      schemaVersion: 1,
      kind: 'stone1-tactile-roll-group-package',
      verdict: 'PASS',
      sourceSha: identity.sourceSha,
      frozenBuildSourceSha: identity.frozenBuildSourceSha,
      webBuildSha256: identity.webBuildSha256,
      buildManifestSha256: identity.buildManifestSha256,
      providerManifestSha256: identity.providerManifestSha256,
      providerSourceManifestSha256: identity.providerSourceManifestSha256,
      providerGlbSha256: identity.providerGlbSha256,
      scenarioCount: 12,
      contextCount: 12,
      screenshotCount: 18,
      validationRssLimitBytes: 512 * 1024 * 1024,
      validationPeakRssBytes: 128 * 1024 * 1024,
      artifacts,
    },
    artifactBytes,
  };
}

function cloneEvidence() {
  return structuredClone(evidence()) as Stone1TrayEvidence;
}
function expectEvidenceFailure(mutate: (value: Stone1TrayEvidence) => void) {
  const value = cloneEvidence();
  mutate(value);
  expect(() => assertStone1TrayEvidence(value, identity)).toThrow();
}

describe('Stone 1 browser evidence protocol', () => {
  it('keeps the capture exact-head, private, atomic, real-browser driven, and cleanup-first', () => {
    const source = readFileSync(
      'scripts/attack-die/capture-stone1-tray-evidence.mjs',
      'utf8'
    );
    expect(source).toContain("git('rev-parse', 'HEAD')");
    expect(source).toContain("'--untracked-files=no'");
    expect(source).toContain(
      '/home/kirk/game-dev/.verification/interactive-dice-tray/stone-1'
    );
    expect(source).toContain('atomicProviderCopy');
    expect(source).toContain('attack-die:freeze-build');
    expect(source).toContain('validateServedBuild');
    expect(source).toContain('includes(sourceSha)');
    expect(source).toContain('chromium.launch');
    expect(source).toContain('browser.newContext');
    expect(source).toContain('page.mouse.down');
    expect(source).toContain('page.mouse.up');
    expect(source).toContain("dispatchEvent('pointercancel'");
    expect(source).toContain('releasePointerCapture(1)');
    expect(source).toContain("dispatchEvent('lostpointercapture'");
    expect(source).toContain("getExtension('WEBGL_lose_context')");
    expect(source).toContain('capturePhaseCloseups');
    expect(source).toContain('assertStone1TrayEvidencePackage');
    expect(source).toContain('FAILED.txt');
    expect(source).toContain('INVALIDATED-PASS.txt');
    expect(source.indexOf("process.once('SIGINT'")).toBeLessThan(
      source.indexOf('preview = spawn(')
    );
    expect(source.indexOf('assertStone1TrayEvidencePackage(')).toBeLessThan(
      source.indexOf('await rename(passTemporary, passPath)')
    );
  });

  it('accepts exactly the twelve required ordered scenario IDs and safe exact profile/ownership facts', () => {
    expect(
      assertStone1TrayEvidence(evidence(), identity).scenarios.map(
        (value) => value.id
      )
    ).toEqual(STONE1_SCENARIO_IDS);
  });

  it('rejects missing, duplicate, reordered, renamed, failed, or non-result-10 scenarios', () => {
    expectEvidenceFailure((value) => value.scenarios.pop());
    expectEvidenceFailure(
      (value) => (value.scenarios[1] = structuredClone(value.scenarios[0]))
    );
    expectEvidenceFailure((value) => value.scenarios.reverse());
    expectEvidenceFailure(
      (value) => ((value.scenarios[0] as { id: string }).id = 'other')
    );
    expectEvidenceFailure((value) => (value.scenarios[0].passed = false));
    expectEvidenceFailure(
      (value) => (value.scenarios[0].authoritativeResult = 9)
    );
  });

  it('rejects every local-before-release/shared-after-release boolean and schema/count mutation', () => {
    const mutations: Array<
      (scenario: Stone1TrayEvidence['scenarios'][number]) => void
    > = [
      (value) => (value.timeline.beforeRelease.releaseCount = 1),
      (value) => (value.timeline.beforeRelease.rollerGrabbed = true),
      (value) => (value.timeline.beforeRelease.spectatorGrabbed = true),
      (value) => (value.timeline.beforeRelease.releasePresent = true),
      (value) => (value.timeline.beforeRelease.profilePresent = true),
      (value) => (value.timeline.beforeRelease.finalObservationPresent = true),
      (value) => (value.timeline.held.rollerGrabbed = false),
      (value) => (value.timeline.held.spectatorGrabbed = true),
      (value) => (value.timeline.held.releasePresent = true),
      (value) => (value.timeline.held.profilePresent = true),
      (value) => (value.timeline.held.finalObservationPresent = true),
      (value) => (value.timeline.afterRelease.releaseCount = 2),
      (value) => (value.timeline.afterRelease.rollerGrabbed = true),
      (value) => (value.timeline.afterRelease.spectatorGrabbed = true),
      (value) => (value.timeline.afterRelease.releasePresent = false),
      (value) => (value.timeline.afterRelease.releaseSchemaVersion = 1),
      (value) => (value.timeline.afterRelease.profilePresent = false),
      (value) => (value.timeline.afterRelease.profileSchemaVersion = 2),
    ];
    for (const mutate of mutations)
      expectEvidenceFailure((value) => mutate(value.scenarios[0]));
  });

  it('rejects each profile field mutation and every denied raw/transport/profile key', () => {
    const profileMutations: Array<(value: Record<string, unknown>) => void> = [
      (value) => (value.schemaVersion = 2),
      (value) => (value.releasePosition = [-0.01, 0.5]),
      (value) => (value.releaseDirection = [0.6, 0.7]),
      (value) => (value.releaseSpeed = 1.01),
      (value) => (value.shakeEnergy = -0.01),
      (value) => (value.spinBias = 1.01),
      (value) => (value.motionSeed = -1),
    ];
    for (const mutate of profileMutations)
      expectEvidenceFailure((value) =>
        mutate(
          value.scenarios[0].observations!.roller.profile as unknown as Record<
            string,
            unknown
          >
        )
      );
    for (const denied of STONE1_DENIED_PROFILE_KEYS)
      expectEvidenceFailure((value) => {
        (
          value.scenarios[0].observations!.roller.profile as unknown as Record<
            string,
            unknown
          >
        )[denied] = 1;
      });
  });

  it('rejects every freeze/share/distinctness/threshold/visibility boolean independently', () => {
    const keys = [
      'profilesDeepEqual',
      'eventShared',
      'providerShared',
      'sourceShared',
      'contextsDistinct',
      'clonesDistinct',
      'observationsDistinct',
    ] as const;
    for (const key of keys)
      expectEvidenceFailure(
        (value) => (value.scenarios[0].observations![key] = false)
      );
    const witnessKeys = [
      'upwardDotThresholdPassed',
      'upwardMarginThresholdPassed',
      'angularThresholdPassed',
      'exactTargetHeld',
      'canvasVisible',
      'profileObjectFrozen',
      'profileTuplesFrozen',
      'observationObjectFrozen',
    ] as const;
    for (const key of witnessKeys)
      expectEvidenceFailure(
        (value) => (value.scenarios[0].observations!.roller[key] = false)
      );
  });

  it('rejects equal contexts/clones, unshared source/provider/events, unequal profiles, result and target observations', () => {
    expectEvidenceFailure((value) => {
      value.scenarios[0].observations!.spectator.contextId =
        value.scenarios[0].observations!.roller.contextId;
    });
    expectEvidenceFailure((value) => {
      value.scenarios[0].observations!.spectator.cloneId =
        value.scenarios[0].observations!.roller.cloneId;
    });
    for (const key of ['sourceId', 'providerId', 'eventArrayId'] as const)
      expectEvidenceFailure(
        (value) => (value.scenarios[0].observations!.spectator[key] += 1)
      );
    expectEvidenceFailure((value) => {
      value.scenarios[0].observations!.spectator.profile = {
        ...value.scenarios[0].observations!.spectator.profile,
        releaseSpeed: 0.2,
      };
    });
    expectEvidenceFailure(
      (value) => (value.scenarios[0].observations!.roller.requestedResult = 9)
    );
    expectEvidenceFailure(
      (value) =>
        (value.scenarios[0].observations!.roller.observedUpwardResult = 9)
    );
  });

  it('rejects reduced-motion animation, cancellation release, outside-capture loss, or stale failure cleanup', () => {
    for (const key of [
      'tumbleSampleCount',
      'shakeSampleCount',
      'bounceSampleCount',
    ] as const)
      expectEvidenceFailure((value) => (value.scenarios[6].heldCue[key] = 1));
    expectEvidenceFailure(
      (value) => (value.scenarios[6].heldCue.staticLifted = false)
    );
    expectEvidenceFailure(
      (value) => (value.scenarios[1].outsideCaptureObserved = false)
    );
    expectEvidenceFailure(
      (value) => (value.scenarios[8].timeline.afterRelease.releaseCount = 1)
    );
    expectEvidenceFailure(
      (value) =>
        (value.scenarios[9].timeline.afterRelease.profilePresent = true)
    );
    for (const key of ['heldStateCleared'] as const)
      expectEvidenceFailure(
        (value) => (value.scenarios[10].failure![key] = false)
      );
    for (const key of ['staleHeldTelemetry', 'staleProfileTelemetry'] as const)
      expectEvidenceFailure(
        (value) => (value.scenarios[11].failure![key] = true)
      );
    expectEvidenceFailure(
      (value) => (value.scenarios[10].failure!.fallbackRenderer = '3d')
    );
  });

  it('rejects source/build/provider bindings and provider roles', () => {
    expectEvidenceFailure((value) => (value.sourceSha = '2'.repeat(40)));
    expectEvidenceFailure(
      (value) => (value.frozenBuildSourceSha = '2'.repeat(40))
    );
    expectEvidenceFailure((value) => (value.webBuildSha256 = '2'.repeat(64)));
    expectEvidenceFailure(
      (value) => (value.buildManifestSha256 = '2'.repeat(64))
    );
    expectEvidenceFailure(
      (value) => (value.provider.manifestSha256 = '2'.repeat(64))
    );
    expectEvidenceFailure(
      (value) => (value.provider.sourceManifestSha256 = '2'.repeat(64))
    );
    expectEvidenceFailure(
      (value) => (value.provider.glbSha256 = '2'.repeat(64))
    );
    expectEvidenceFailure((value) => (value.provider.glbSizeBytes += 1));
    expectEvidenceFailure((value) => (value.provider.bodyTriangleCount = 7798));
    expectEvidenceFailure(
      (value) => (value.provider.numeralTriangleCount = 2684)
    );
  });
});

describe('Stone 1 exact package protocol', () => {
  it('binds build/browser/network/console bytes and fully validates all sequential screenshots below 512 MiB RSS', () => {
    const fixture = packageFixture();
    const result = assertStone1TrayEvidencePackage(
      fixture.manifest,
      identity,
      fixture.artifactBytes,
      ['PASS']
    );
    expect(result.scenarioCount).toBe(12);
    expect(result.screenshotCount).toBe(18);
    expect(result.validationRssLimitBytes).toBe(512 * 1024 * 1024);
  });

  it.each([
    ['FAILED.txt', ['PASS', 'FAILED.txt']],
    ['INVALIDATED-PASS.txt', ['INVALIDATED-PASS.txt']],
    ['missing PASS', []],
  ])('rejects marker semantics: %s', (_name, markers) => {
    const fixture = packageFixture();
    expect(() =>
      assertStone1TrayEvidencePackage(
        fixture.manifest,
        identity,
        fixture.artifactBytes,
        markers
      )
    ).toThrow();
  });

  it('rejects artifact omission/substitution/hash/size/order and build hash/source mismatches', () => {
    let fixture = packageFixture();
    fixture.artifactBytes.delete('console.json');
    expect(() =>
      assertStone1TrayEvidencePackage(
        fixture.manifest,
        identity,
        fixture.artifactBytes
      )
    ).toThrow();
    fixture = packageFixture();
    fixture.manifest.artifacts[0].sha256 = 'f'.repeat(64);
    expect(() =>
      assertStone1TrayEvidencePackage(
        fixture.manifest,
        identity,
        fixture.artifactBytes
      )
    ).toThrow();
    fixture = packageFixture();
    fixture.manifest.artifacts.reverse();
    expect(() =>
      assertStone1TrayEvidencePackage(
        fixture.manifest,
        identity,
        fixture.artifactBytes
      )
    ).toThrow();
    fixture = packageFixture();
    fixture.manifest.validationPeakRssBytes = 513 * 1024 * 1024;
    expect(() =>
      assertStone1TrayEvidencePackage(
        fixture.manifest,
        identity,
        fixture.artifactBytes
      )
    ).toThrow();
  });

  it('rejects each PNG corruption stage and screenshot viewport/hash/resource mismatches', () => {
    const mutatePng = (mutate: (bytes: Uint8Array) => Uint8Array) => {
      const fixture = packageFixture();
      const path = stone1ScenarioScreenshot('held-desktop');
      const replacement = mutate(fixture.artifactBytes.get(path)!);
      fixture.artifactBytes.set(path, replacement);
      const artifact = fixture.manifest.artifacts.find(
        (value) => value.path === path
      )!;
      artifact.sha256 = sha256(replacement);
      artifact.sizeBytes = replacement.byteLength;
      expect(() =>
        assertStone1TrayEvidencePackage(
          fixture.manifest,
          identity,
          fixture.artifactBytes
        )
      ).toThrow();
    };
    mutatePng((bytes) => bytes.subarray(0, 7));
    mutatePng((bytes) => {
      const value = bytes.slice();
      value[29] ^= 0xff;
      return value;
    });
    mutatePng((bytes) => bytes.subarray(0, bytes.byteLength - 8));
    mutatePng((bytes) => Uint8Array.from([...bytes, 0]));
    mutatePng((bytes) => {
      const value = bytes.slice();
      new DataView(value.buffer).setUint32(16, 50_000);
      new DataView(value.buffer).setUint32(29, crc32(value.subarray(12, 29)));
      return value;
    });
  });

  it('rejects network/console errors and context/provider count mutations', () => {
    const mutateJson = (
      path: string,
      mutate: (value: Record<string, unknown>) => void
    ) => {
      const fixture = packageFixture();
      const value = JSON.parse(
        new TextDecoder().decode(fixture.artifactBytes.get(path)!)
      ) as Record<string, unknown>;
      mutate(value);
      const replacement = new TextEncoder().encode(JSON.stringify(value));
      fixture.artifactBytes.set(path, replacement);
      const artifact = fixture.manifest.artifacts.find(
        (entry) => entry.path === path
      )!;
      artifact.sha256 = sha256(replacement);
      artifact.sizeBytes = replacement.byteLength;
      expect(() =>
        assertStone1TrayEvidencePackage(
          fixture.manifest,
          identity,
          fixture.artifactBytes
        )
      ).toThrow();
    };
    mutateJson(
      'network.json',
      (value) =>
        ((value.contexts as Record<string, unknown>[])[0].manifestRequestCount =
          2)
    );
    mutateJson('network.json', (value) =>
      (value.unexpectedErrors as unknown[]).push('request')
    );
    mutateJson('console.json', (value) =>
      (value.pageErrors as unknown[]).push('boom')
    );
    mutateJson('console.json', (value) =>
      (value.unexpectedErrors as unknown[]).push('console')
    );
  });
});
