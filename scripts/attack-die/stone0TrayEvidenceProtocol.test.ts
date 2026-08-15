// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ORIGINAL_D20_BODY_TRIANGLE_COUNT,
  ORIGINAL_D20_GLB_SHA256,
  ORIGINAL_D20_MANIFEST_SHA256,
  ORIGINAL_D20_NUMERAL_TRIANGLE_COUNT,
  ORIGINAL_D20_SOURCE_MANIFEST_SHA256,
  STONE0_LOCAL_API_FIXTURES,
  STONE0_LOCAL_API_RESPONSE,
  STONE0_SCENARIO_IDS,
  assertStone0TrayEvidence,
  assertStone0TrayEvidencePackage,
  stone0ExpectedNetworkContextIds,
  stone0ResultCloseupScreenshot,
  stone0ResultScreenshot,
  stone0ScenarioScreenshot,
  type Stone0TrayEvidence,
  type Stone0TrayEvidenceIdentity,
} from './stone0TrayEvidenceProtocol';

const SHA = {
  source: '1'.repeat(40),
  build: '2'.repeat(64),
  buildManifest: '3'.repeat(64),
};

const identity: Stone0TrayEvidenceIdentity = {
  sourceSha: SHA.source,
  webBuildSha256: SHA.build,
  buildManifestSha256: SHA.buildManifest,
  providerManifestSha256: ORIGINAL_D20_MANIFEST_SHA256,
  providerSourceManifestSha256: ORIGINAL_D20_SOURCE_MANIFEST_SHA256,
};

const failureSemantics = {
  'missing-manifest': ['manifest-fetch', true, false, 0],
  'incomplete-face-map': ['manifest-parse', true, true, 0],
  'malformed-manifest': ['manifest-parse', true, true, 0],
  'glb-hash-mismatch': ['model-hash', true, false, 1],
  'invalid-geometry-partition': ['manifest-parse', true, true, 0],
  'unknown-safe-preset': ['synthetic-renderer-only', false, false, 1],
  'unmapped-result': ['synthetic-renderer-only', false, false, 1],
  'webgl-creation-failure': ['webgl', false, false, 1],
  'context-loss': ['webgl-context-loss', false, false, 1],
  'shader-failure': ['shader', false, false, 1],
} as const;

function rect(left: number, top: number, width: number, height: number) {
  return {
    left,
    right: left + width,
    top,
    bottom: top + height,
    width,
    height,
  };
}

function responsiveFacts(layout: string, width: number) {
  if (layout === 'columns')
    return {
      layout,
      rollerCanvasVisible: true,
      spectatorCanvasVisible: true,
      innerWidth: width,
      scrollWidth: width,
      surfaces: {
        preview: rect(0, 0, width, 1_010),
        map: rect(0, 0, width, 650),
        roller: rect(20, 300, 356, 248),
        spectator: rect(388, 300, 356, 248),
        log: rect(width - 360, 400, 348, 230),
        dock: rect(0, 650, width, 360),
      },
    };
  return {
    layout,
    rollerCanvasVisible: true,
    spectatorCanvasVisible: true,
    innerWidth: width,
    scrollWidth: width,
    surfaces: {
      preview: rect(0, 0, width, 1_350),
      map: rect(0, 0, width, 220),
      roller: rect(12, 232, 356, 248),
      spectator: rect(12, 492, 356, 248),
      log: rect(Math.max(12, width - 372), 752, 360, 230),
      dock: rect(0, 992, width, 358),
    },
  };
}

function scenario(id: (typeof STONE0_SCENARIO_IDS)[number]) {
  const common = {
    id,
    screenshot: stone0ScenarioScreenshot(id),
    passed: true as const,
  };
  if (id === 'pending-provider')
    return {
      ...common,
      viewport: { width: 1440, height: 1080 },
      facts: {
        providerState: 'loading',
        resultVisible: false,
        trayMounted: false,
        canvasCount: 0,
      },
    };
  if (id === 'player-armed')
    return {
      ...common,
      viewport: { width: 1440, height: 1080 },
      facts: {
        releaseAuthority: 'roller-only',
        rollerControl: true,
        spectatorControl: false,
        resultVisible: false,
        autoReleased: false,
      },
    };
  if (id === 'monster-host-release')
    return {
      ...common,
      viewport: { width: 1440, height: 1080 },
      facts: {
        releaseAuthority: 'fixture-host',
        consumerControlCount: 0,
        releaseCount: 1,
      },
    };
  if (id === 'reduced-motion')
    return {
      ...common,
      viewport: { width: 1440, height: 1080 },
      facts: {
        explicitInputRequired: true,
        tumbleObserved: false,
        rollerExact: true,
        spectatorExact: true,
      },
    };
  const responsive = {
    'responsive-desktop': [1440, 1080, 'columns'],
    'responsive-boundary-wide': [1241, 900, 'columns'],
    'responsive-boundary-stacked': [1240, 900, 'stacked'],
    'responsive-narrow': [760, 900, 'narrow-order'],
  } as const;
  if (id in responsive) {
    const [width, height, layout] = responsive[id as keyof typeof responsive];
    return {
      ...common,
      viewport: { width, height },
      facts: responsiveFacts(layout, width),
    };
  }
  const [failureOrigin, providerMutation, parseBeforeModel, modelRequestCount] =
    failureSemantics[id as keyof typeof failureSemantics];
  return {
    ...common,
    viewport: { width: 1440, height: 1080 },
    facts: {
      failureOrigin,
      providerMutation,
      manifestParseFailedBeforeModel: parseBeforeModel,
      modelRequestCount,
      canvasCount: [
        'webgl-creation-failure',
        'unknown-safe-preset',
        'unmapped-result',
      ].includes(id)
        ? 0
        : id === 'context-loss'
          ? 1
          : 0,
      armedResultVisible: false,
      releasedSvgTruth: true,
      rollerControlPreserved: true,
      spectatorAuthority: false,
    },
  };
}

function resultFact(result: number) {
  const angle = result / 100;
  const target = [Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)] as const;
  const witness = (role: 'roller' | 'spectator') => ({
    generation: role === 'roller' ? -result * 2 : -result * 2 - 1,
    contextId: role === 'roller' ? result * 2 : result * 2 + 1,
    cloneId: `clone:${result}:${role}`,
    eventArrayId: result * 2_000,
    providerId: 1,
    requestedResult: result,
    mappedTarget: target,
    observedUpwardResult: result,
    observedUpDot: 1,
    observedUpMargin: 0.25,
    canvasVisible: true,
    exactTargetHeld: true,
    numeralTriangleCount: ORIGINAL_D20_NUMERAL_TRIANGLE_COUNT,
  });
  return {
    result,
    requestIdentity: `concept:witness:player:500:result:${result}`,
    presetId: 'dice.original.carved.d20',
    manifestRequestCount: 1,
    manifestTransferCount: 1,
    glbRequestCount: 1,
    glbTransferCount: 1,
    sharedEvents: true,
    sharedProvider: true,
    sourceSceneShared: true,
    clonesDistinct: true,
    roller: witness('roller'),
    spectator: witness('spectator'),
    targetInvariance: {
      rollerRoll: target,
      hostRelease: target,
      decorativeVariation: target,
    },
    screenshot: stone0ResultScreenshot(result),
    closeups: {
      roller: {
        screenshot: stone0ResultCloseupScreenshot(result, 'roller'),
        deviceScaleFactor: 3,
        physicalWidth: 660,
        physicalHeight: 660,
      },
      spectator: {
        screenshot: stone0ResultCloseupScreenshot(result, 'spectator'),
        deviceScaleFactor: 3,
        physicalWidth: 660,
        physicalHeight: 660,
      },
    },
  };
}

function validEvidence(): Stone0TrayEvidence {
  return {
    schemaVersion: 2,
    kind: 'stone0-original-d20-tray-evidence',
    sourceSha: SHA.source,
    webBuildSha256: SHA.build,
    buildManifestSha256: SHA.buildManifest,
    provider: {
      manifestPath: '/models/custom-dice/dice-tray-presets.json',
      manifestSha256: ORIGINAL_D20_MANIFEST_SHA256,
      sourceManifestSha256: ORIGINAL_D20_SOURCE_MANIFEST_SHA256,
      presetId: 'dice.original.carved.d20',
      glbPath: '/models/custom-dice/original-set/Original_D20_Source.glb',
      glbSha256: ORIGINAL_D20_GLB_SHA256,
      glbSizeBytes: 491312,
      bodyTriangleCount: ORIGINAL_D20_BODY_TRIANGLE_COUNT,
      numeralTriangleCount: ORIGINAL_D20_NUMERAL_TRIANGLE_COUNT,
      manifestRequestCount: 1,
      manifestTransferCount: 1,
      glbRequestCount: 1,
      glbTransferCount: 1,
    },
    results: Array.from({ length: 20 }, (_, index) => resultFact(index + 1)),
    scenarios: STONE0_SCENARIO_IDS.map(scenario),
    artifacts: {
      browserEvidence: 'browser-evidence.json',
      network: 'network.json',
      console: 'console.json',
    },
    validationFailures: [],
    unexpectedErrors: [],
  };
}

function cloneEvidence(): Stone0TrayEvidence {
  return structuredClone(validEvidence());
}

const hash = (value: Uint8Array | string) =>
  createHash('sha256').update(value).digest('hex');
const jsonBytes = (value: unknown) =>
  new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);

function pngBytes(width = 1440, height = 1080) {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function packageFixture() {
  const evidence = validEvidence();
  const build = {
    schemaVersion: 1,
    kind: 'attack-die-web-build-manifest',
    files: [],
    webBuildSha256: hash(''),
  };
  const buildBytes = jsonBytes(build);
  const packageIdentity: Stone0TrayEvidenceIdentity = {
    ...identity,
    webBuildSha256: build.webBuildSha256,
    buildManifestSha256: hash(buildBytes),
  };
  evidence.webBuildSha256 = packageIdentity.webBuildSha256;
  evidence.buildManifestSha256 = packageIdentity.buildManifestSha256;

  const contextIds = stone0ExpectedNetworkContextIds();
  const scenarioById = new Map(
    evidence.scenarios.map((value) => [value.id, value])
  );
  const providerCounts = (id: string) => {
    if (id === 'missing-manifest')
      return {
        manifestRequestCount: 1,
        manifestTransferCount: 0,
        glbRequestCount: 0,
        glbTransferCount: 0,
      };
    if (
      [
        'incomplete-face-map',
        'malformed-manifest',
        'invalid-geometry-partition',
      ].includes(id)
    )
      return {
        manifestRequestCount: 1,
        manifestTransferCount: 1,
        glbRequestCount: 0,
        glbTransferCount: 0,
      };
    return {
      manifestRequestCount: 1,
      manifestTransferCount: 1,
      glbRequestCount: 1,
      glbTransferCount: 1,
    };
  };
  const contexts = contextIds.map((id, index) => {
    const scenarioId = STONE0_SCENARIO_IDS.find((value) => value === id);
    const viewport = scenarioId
      ? scenarioById.get(scenarioId)!.viewport
      : { width: 1440, height: 1080 };
    const provider = providerCounts(id);
    const apiFixtures = STONE0_LOCAL_API_FIXTURES.map((fixture) => ({
      url: fixture.url,
      method: 'POST',
      status: 200,
      requestBodySha256: hash(`request:${fixture.url}`),
      responseBodySha256: fixture.responseSha256,
    }));
    const requests = [
      ...apiFixtures.map((fixture) => ({
        url: fixture.url,
        method: fixture.method,
        resourceType: 'fetch',
        providerKind: null,
      })),
      ...(provider.manifestRequestCount
        ? [
            {
              url: `http://127.0.0.1:3003${evidence.provider.manifestPath}`,
              method: 'GET',
              resourceType: 'fetch',
              providerKind: 'manifest',
            },
          ]
        : []),
      ...(provider.glbRequestCount
        ? [
            {
              url: `http://127.0.0.1:3003${evidence.provider.glbPath}`,
              method: 'GET',
              resourceType: 'fetch',
              providerKind: 'glb',
            },
          ]
        : []),
    ];
    const responses = [
      ...apiFixtures.map((fixture) => ({
        url: fixture.url,
        status: fixture.status,
        providerKind: null,
        contentLength: '2',
      })),
      ...(provider.manifestRequestCount
        ? [
            {
              url: `http://127.0.0.1:3003${evidence.provider.manifestPath}`,
              status: provider.manifestTransferCount ? 200 : 404,
              providerKind: 'manifest',
              contentLength: null,
            },
          ]
        : []),
      ...(provider.glbRequestCount
        ? [
            {
              url: `http://127.0.0.1:3003${evidence.provider.glbPath}`,
              status: 200,
              providerKind: 'glb',
              contentLength: String(491312),
            },
          ]
        : []),
    ];
    return {
      id,
      contextOrdinal: index + 1,
      viewport,
      requests,
      responses,
      apiFixtures,
      provider,
      trayCanvasFirstObservedMs: provider.glbTransferCount ? 200 : null,
      glbResponseEndMs: provider.glbTransferCount ? 100 : null,
    };
  });
  const network = { schemaVersion: 2, contexts };
  const consoleEvidence = {
    schemaVersion: 2,
    console: [
      {
        id: 'missing-manifest',
        contextOrdinal: contextIds.indexOf('missing-manifest') + 1,
        type: 'error',
        text: 'Failed to load resource: the server responded with a status of 404 (Not Found)',
        location: {
          url: `http://127.0.0.1:3003${evidence.provider.manifestPath}`,
          lineNumber: 0,
          columnNumber: 0,
        },
        expected: true,
      },
    ],
    pageErrors: [],
    unexpectedErrors: [],
  };

  const files = new Map<string, Uint8Array>([
    ['build-manifest.json', buildBytes],
    ['browser-evidence.json', jsonBytes(evidence)],
    ['network.json', jsonBytes(network)],
    ['console.json', jsonBytes(consoleEvidence)],
  ]);
  const resultScreenshots = evidence.results.flatMap((value) => [
    value.screenshot,
    value.closeups.roller.screenshot,
    value.closeups.spectator.screenshot,
  ]);
  for (const path of [
    ...resultScreenshots,
    ...evidence.scenarios.map((value) => value.screenshot),
  ]) {
    const closeup = evidence.results
      .flatMap((value) => [value.closeups.roller, value.closeups.spectator])
      .find((value) => value.screenshot === path);
    files.set(
      path,
      closeup
        ? pngBytes(closeup.physicalWidth, closeup.physicalHeight)
        : pngBytes()
    );
  }
  const kind = (path: string) =>
    path === 'build-manifest.json'
      ? 'build-manifest'
      : path.endsWith('.json')
        ? 'json'
        : 'screenshot';
  const artifacts = [...files].map(([path, bytes]) => ({
    path,
    kind: kind(path),
    sha256: hash(bytes),
    sizeBytes: bytes.byteLength,
  }));
  const packageManifest = {
    schemaVersion: 2,
    kind: 'stone0-original-d20-tray-package',
    verdict: 'PASS',
    sourceSha: packageIdentity.sourceSha,
    webBuildSha256: packageIdentity.webBuildSha256,
    buildManifestSha256: packageIdentity.buildManifestSha256,
    resultCount: evidence.results.length,
    scenarioCount: evidence.scenarios.length,
    contextCount: contexts.length,
    screenshotCount: resultScreenshots.length + evidence.scenarios.length,
    closeupCount: evidence.results.length * 2,
    consoleErrorCount: 1,
    pageErrorCount: 0,
    artifacts,
  };
  return {
    evidence,
    network,
    consoleEvidence,
    packageIdentity,
    packageManifest,
    files,
  };
}

function refreshArtifact(
  fixture: ReturnType<typeof packageFixture>,
  path: string
) {
  const artifact = fixture.packageManifest.artifacts.find(
    (value) => value.path === path
  )!;
  const bytes = fixture.files.get(path)!;
  artifact.sha256 = hash(bytes);
  artifact.sizeBytes = bytes.byteLength;
}

describe('Stone 0 Tray evidence protocol v2', () => {
  it('keeps the capture on the real Tray and obtains upward identity only from renderer telemetry', () => {
    const source = readFileSync(
      'scripts/attack-die/capture-stone0-tray-evidence.mjs',
      'utf8'
    );
    expect(source).not.toMatch(/^import[\s\S]*?from ['"][^'"]+\.ts['"]?;?$/m);
    expect(source).toMatch(/bundleTsModule/);
    expect(source).toMatch(/\.attack-die-3d__canvas canvas/);
    expect(source).toContain("attackDieStage', 'tray'");
    expect(source).toContain('STONE0_LOCAL_API_FIXTURES');
    expect(source).toContain('message.location()');
    expect(source).toContain('STONE0_LOCAL_API_RESPONSE');
    expect(source).not.toMatch(/ERR_CONNECTION_REFUSED/);
    expect(source).not.toMatch(/carvedVisible|carvedResult/);
    const upwardAssignments = source
      .split('\n')
      .filter((line) => line.includes('observedUpwardResult:'));
    expect(upwardAssignments.length).toBeGreaterThan(0);
    expect(
      upwardAssignments.every((line) =>
        /telemetry\.observedUpwardResult/.test(line)
      )
    ).toBe(true);
    expect(source).not.toMatch(/observedUpwardResult\s*:\s*(?:\d+|result)\b/);
    expect(source).toMatch(/deviceScaleFactor:\s*3/);
    expect(source).toMatch(/stone0ResultCloseupScreenshot/);
    expect(STONE0_LOCAL_API_RESPONSE).toEqual(
      Uint8Array.from([
        0, 0, 0, 0, 0, 128, 0, 0, 0, 16, 103, 114, 112, 99, 45, 115, 116, 97,
        116, 117, 115, 58, 32, 48, 13, 10,
      ])
    );
    expect(hash(STONE0_LOCAL_API_RESPONSE)).toBe(
      STONE0_LOCAL_API_FIXTURES[0].responseSha256
    );
  });

  it('accepts only schema v2 with the corrected provider identity, exact roles, results 1–20, and 40 closeups', () => {
    const evidence = validEvidence();
    expect(assertStone0TrayEvidence(evidence, identity)).toEqual(evidence);
    expect(evidence.schemaVersion).toBe(2);
    expect(evidence.provider.manifestSha256).toBe(
      '9c2d08b53442e6307ea4235103495f33fd4678b0363d9721bafa7f162dac1c74'
    );
    expect(evidence.provider.bodyTriangleCount).toBe(2684);
    expect(evidence.provider.numeralTriangleCount).toBe(7798);
    expect(
      evidence.results.flatMap((result) => Object.values(result.closeups))
    ).toHaveLength(40);
  });

  it('rejects schema v1 and stale or caller-invented provider hashes', () => {
    const old = cloneEvidence() as unknown as { schemaVersion: number };
    old.schemaVersion = 1;
    expect(() => assertStone0TrayEvidence(old, identity)).toThrow(/schema/i);

    const staleIdentity = {
      ...identity,
      providerManifestSha256: 'a'.repeat(64),
    };
    expect(() =>
      assertStone0TrayEvidence(validEvidence(), staleIdentity)
    ).toThrow(/expected identity|provider|hash/i);

    const staleEvidence = cloneEvidence();
    staleEvidence.provider.manifestSha256 = 'a'.repeat(64);
    expect(() => assertStone0TrayEvidence(staleEvidence, identity)).toThrow(
      /provider|hash|identity/i
    );
  });

  it('rejects missing, duplicate, reordered, or malformed 1–20 facts', () => {
    for (const mutate of [
      (value: Stone0TrayEvidence) => value.results.pop(),
      (value: Stone0TrayEvidence) =>
        (value.results[19] = structuredClone(value.results[0])),
      (value: Stone0TrayEvidence) =>
        ([value.results[0], value.results[1]] = [
          value.results[1],
          value.results[0],
        ]),
      (value: Stone0TrayEvidence) =>
        (value.results[0].requestIdentity = 'stale-request'),
    ]) {
      const value = cloneEvidence();
      mutate(value);
      expect(() => assertStone0TrayEvidence(value, identity)).toThrow(
        /result|identity/i
      );
    }
  });

  it('rejects requested/observed disagreement even when the mapped target is held', () => {
    const value = cloneEvidence();
    value.results[2].roller.observedUpwardResult = 5;
    value.results[2].roller.exactTargetHeld = true;
    expect(() => assertStone0TrayEvidence(value, identity)).toThrow(
      'requested result 3 observed upward result 5'
    );
  });

  it('rejects the historical semantic permutation from independent renderer observations', () => {
    const oldObservedByRequested = [
      1, 2, 5, 6, 3, 4, 8, 7, 9, 11, 12, 10, 14, 13, 18, 17, 16, 15, 19, 20,
    ];
    const value = cloneEvidence();
    value.results.forEach((fact, index) => {
      fact.roller.observedUpwardResult = oldObservedByRequested[index];
      fact.spectator.observedUpwardResult = oldObservedByRequested[index];
    });
    expect(() => assertStone0TrayEvidence(value, identity)).toThrow(
      'requested result 3 observed upward result 5'
    );
  });

  it('requires both independent upward witnesses and keeps target hold diagnostic', () => {
    for (const mutate of [
      (value: Stone0TrayEvidence) =>
        (value.results[0].roller.observedUpDot = 0.999999),
      (value: Stone0TrayEvidence) =>
        (value.results[0].spectator.observedUpMargin = 0.2),
      (value: Stone0TrayEvidence) =>
        (value.results[0].spectator.canvasVisible = false),
      (value: Stone0TrayEvidence) =>
        (value.results[0].spectator.exactTargetHeld = false),
      (value: Stone0TrayEvidence) =>
        (value.results[0].spectator.contextId =
          value.results[0].roller.contextId),
      (value: Stone0TrayEvidence) =>
        (value.results[0].spectator.cloneId = value.results[0].roller.cloneId),
    ]) {
      const value = cloneEvidence();
      mutate(value);
      expect(() => assertStone0TrayEvidence(value, identity)).toThrow(
        /observed|canvas|target|held|distinct|witness|margin|dot/i
      );
    }
  });

  it('rejects old triangle roles and forbidden circular vocabulary', () => {
    for (const [body, numeral] of [
      [3563, 6919],
      [2684, 6919],
      [3563, 7798],
    ]) {
      const value = cloneEvidence();
      value.provider.bodyTriangleCount = body;
      value.provider.numeralTriangleCount = numeral;
      expect(() => assertStone0TrayEvidence(value, identity)).toThrow(
        /triangle|provider|role/i
      );
    }
    for (const decoration of [{ carvedVisible: true }, { carvedResult: 1 }]) {
      const value = cloneEvidence();
      Object.assign(value.results[0].roller, decoration);
      expect(() => assertStone0TrayEvidence(value, identity)).toThrow(
        /keys|schema/i
      );
    }
  });

  it('rejects missing or duplicate closeups and dimensions under 220 physical pixels', () => {
    const missing = cloneEvidence();
    delete (missing.results[0].closeups as { roller?: unknown }).roller;
    expect(() => assertStone0TrayEvidence(missing, identity)).toThrow(
      /closeup|keys|schema/i
    );

    const duplicate = cloneEvidence();
    duplicate.results[1].closeups.roller.screenshot =
      duplicate.results[0].closeups.roller.screenshot;
    expect(() => assertStone0TrayEvidence(duplicate, identity)).toThrow(
      /duplicate|closeup|screenshot/i
    );

    for (const dimension of ['physicalWidth', 'physicalHeight'] as const) {
      const small = cloneEvidence();
      small.results[0].closeups.roller[dimension] = 219;
      expect(() => assertStone0TrayEvidence(small, identity)).toThrow(
        /220|dimension|physical|closeup/i
      );
    }
  });

  it('retains exact responsive boundaries with canvas-only visibility vocabulary', () => {
    for (const mutate of [
      (facts: ReturnType<typeof responsiveFacts>) =>
        (facts.rollerCanvasVisible = false),
      (facts: ReturnType<typeof responsiveFacts>) =>
        (facts.scrollWidth = facts.innerWidth + 1),
      (facts: ReturnType<typeof responsiveFacts>) =>
        (facts.surfaces.log.right = facts.surfaces.preview.right + 20),
      (facts: ReturnType<typeof responsiveFacts>) =>
        (facts.surfaces.dock.top = facts.surfaces.log.bottom + 1),
    ]) {
      const value = cloneEvidence();
      const responsive = value.scenarios.find(
        (candidate) => candidate.id === 'responsive-desktop'
      )!;
      mutate(responsive.facts as ReturnType<typeof responsiveFacts>);
      expect(() => assertStone0TrayEvidence(value, identity)).toThrow(
        /responsive|canvas|overflow|contain|order|gap|clearance|dimension/i
      );
    }
  });

  it('retains the complete pending, release, reduced-motion, failure, context-loss, and shader matrix', () => {
    const missing = cloneEvidence();
    missing.scenarios.pop();
    expect(() => assertStone0TrayEvidence(missing, identity)).toThrow(
      /scenario/i
    );

    const contextLoss = cloneEvidence();
    contextLoss.scenarios.find(
      (item) => item.id === 'context-loss'
    )!.facts.failureOrigin = 'synthetic';
    expect(() => assertStone0TrayEvidence(contextLoss, identity)).toThrow(
      /context-loss|failure/i
    );

    const shader = cloneEvidence();
    shader.scenarios.find((item) => item.id === 'shader-failure')!.passed =
      false;
    expect(() => assertStone0TrayEvidence(shader, identity)).toThrow(
      /shader|scenario/i
    );
  });

  it('binds exact build/provider/browser/network/console bytes and all 78 screenshots into a schema-v2 PASS package', () => {
    const fixture = packageFixture();
    expect(
      assertStone0TrayEvidencePackage(
        fixture.packageManifest,
        fixture.packageIdentity,
        fixture.files,
        ['PASS']
      )
    ).toEqual(fixture.packageManifest);
    expect(fixture.packageManifest.contextCount).toBe(78);
    expect(fixture.packageManifest.closeupCount).toBe(40);
    expect(fixture.packageManifest.screenshotCount).toBe(78);
    expect(fixture.packageManifest.artifacts).toHaveLength(82);
  });

  it.each([
    'browser-evidence.json',
    'network.json',
    'console.json',
    'build-manifest.json',
    stone0ResultScreenshot(1),
    stone0ResultCloseupScreenshot(1, 'roller'),
    stone0ScenarioScreenshot('responsive-narrow'),
  ])('rejects a missing or substituted package artifact: %s', (path) => {
    const missing = packageFixture();
    missing.files.delete(path);
    expect(() =>
      assertStone0TrayEvidencePackage(
        missing.packageManifest,
        missing.packageIdentity,
        missing.files,
        ['PASS']
      )
    ).toThrow(/artifact|missing|package/i);

    const substituted = packageFixture();
    substituted.files.set(path, new TextEncoder().encode('substituted'));
    expect(() =>
      assertStone0TrayEvidencePackage(
        substituted.packageManifest,
        substituted.packageIdentity,
        substituted.files,
        ['PASS']
      )
    ).toThrow(/artifact|digest|size|json|png|package/i);
  });

  it('rejects actual closeup PNG dimensions below the physical minimum or contradicting browser facts', () => {
    for (const dimensions of [
      [219, 660],
      [660, 219],
      [659, 660],
    ]) {
      const fixture = packageFixture();
      const path = stone0ResultCloseupScreenshot(1, 'roller');
      fixture.files.set(path, pngBytes(dimensions[0], dimensions[1]));
      refreshArtifact(fixture, path);
      expect(() =>
        assertStone0TrayEvidencePackage(
          fixture.packageManifest,
          fixture.packageIdentity,
          fixture.files,
          ['PASS']
        )
      ).toThrow(/closeup|PNG|physical|dimension|220/i);
    }
  });

  it('rejects any package carrying both PASS and FAILED markers', () => {
    const fixture = packageFixture();
    expect(() =>
      assertStone0TrayEvidencePackage(
        fixture.packageManifest,
        fixture.packageIdentity,
        fixture.files,
        ['PASS', 'FAILED.txt']
      )
    ).toThrow(/PASS|FAILED|marker/i);
  });

  it('rejects contradictory network, console, build, package-count, and artifact-order facts', () => {
    for (const mutate of [
      (fixture: ReturnType<typeof packageFixture>) => {
        fixture.network.contexts[0].id = 'substituted-context';
        fixture.files.set('network.json', jsonBytes(fixture.network));
        refreshArtifact(fixture, 'network.json');
      },
      (fixture: ReturnType<typeof packageFixture>) => {
        fixture.consoleEvidence.console[0].location.url =
          'http://127.0.0.1:3003/unrelated.png';
        fixture.files.set('console.json', jsonBytes(fixture.consoleEvidence));
        refreshArtifact(fixture, 'console.json');
      },
      (fixture: ReturnType<typeof packageFixture>) => {
        const build = JSON.parse(
          new TextDecoder().decode(fixture.files.get('build-manifest.json'))
        );
        build.webBuildSha256 = 'f'.repeat(64);
        fixture.files.set('build-manifest.json', jsonBytes(build));
        refreshArtifact(fixture, 'build-manifest.json');
      },
      (fixture: ReturnType<typeof packageFixture>) =>
        (fixture.packageManifest.closeupCount = 39),
      (fixture: ReturnType<typeof packageFixture>) =>
        fixture.packageManifest.artifacts.reverse(),
    ]) {
      const fixture = packageFixture();
      mutate(fixture);
      expect(() =>
        assertStone0TrayEvidencePackage(
          fixture.packageManifest,
          fixture.packageIdentity,
          fixture.files,
          ['PASS']
        )
      ).toThrow(
        /context|console|location|build|identity|count|artifact|order|package/i
      );
    }
  });

  it('rejects decorated top-level, provider, result, witness, closeup, scenario, and artifact objects', () => {
    for (const mutate of [
      (value: Stone0TrayEvidence) => Object.assign(value, { extra: true }),
      (value: Stone0TrayEvidence) =>
        Object.assign(value.provider, { extra: true }),
      (value: Stone0TrayEvidence) =>
        Object.assign(value.results[0], { extra: true }),
      (value: Stone0TrayEvidence) =>
        Object.assign(value.results[0].roller, { extra: true }),
      (value: Stone0TrayEvidence) =>
        Object.assign(value.results[0].closeups.roller, { extra: true }),
      (value: Stone0TrayEvidence) =>
        Object.assign(value.scenarios[0], { extra: true }),
      (value: Stone0TrayEvidence) =>
        Object.assign(value.artifacts, { extra: true }),
    ]) {
      const value = cloneEvidence();
      mutate(value);
      expect(() => assertStone0TrayEvidence(value, identity)).toThrow(
        /schema|keys/i
      );
    }
  });
});
