// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ORIGINAL_D20_GLB_SHA256,
  STONE0_LOCAL_API_FIXTURES,
  STONE0_SCENARIO_IDS,
  assertStone0TrayEvidence,
  assertStone0TrayEvidencePackage,
  stone0ExpectedNetworkContextIds,
  stone0ResultScreenshot,
  stone0ScenarioScreenshot,
  type Stone0TrayEvidence,
  type Stone0TrayEvidenceIdentity,
} from './stone0TrayEvidenceProtocol';

const SHA = {
  source: '1'.repeat(40),
  build: '2'.repeat(64),
  buildManifest: '3'.repeat(64),
  providerManifest: '4'.repeat(64),
  providerSource: '5'.repeat(64),
};

const identity: Stone0TrayEvidenceIdentity = {
  sourceSha: SHA.source,
  webBuildSha256: SHA.build,
  buildManifestSha256: SHA.buildManifest,
  providerManifestSha256: SHA.providerManifest,
  providerSourceManifestSha256: SHA.providerSource,
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
      carvedResult: 10,
      rollerCarvedVisible: true,
      spectatorCarvedVisible: true,
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
    carvedResult: 10,
    rollerCarvedVisible: true,
    spectatorCarvedVisible: true,
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
    roller: {
      generation: -result * 2,
      contextId: result * 2,
      cloneId: `clone:${result}:roller`,
      eventArrayId: result * 2_000,
      providerId: 1,
      requestedResult: result,
      renderer: '3d' as const,
      angularErrorDegrees: 0,
      exactTargetHeld: true,
      targetQuaternion: target,
    },
    spectator: {
      generation: -result * 2 - 1,
      contextId: result * 2 + 1,
      cloneId: `clone:${result}:spectator`,
      eventArrayId: result * 2_000,
      providerId: 1,
      requestedResult: result,
      renderer: '3d' as const,
      angularErrorDegrees: 0.1,
      exactTargetHeld: true,
      targetQuaternion: target,
    },
    targetInvariance: {
      rollerRoll: target,
      hostRelease: target,
      decorativeVariation: target,
    },
    screenshot: stone0ResultScreenshot(result),
  };
}

function validEvidence(): Stone0TrayEvidence {
  return {
    schemaVersion: 1,
    kind: 'stone0-original-d20-tray-evidence',
    sourceSha: SHA.source,
    webBuildSha256: SHA.build,
    buildManifestSha256: SHA.buildManifest,
    provider: {
      manifestPath: '/models/custom-dice/dice-tray-presets.json',
      manifestSha256: SHA.providerManifest,
      sourceManifestSha256: SHA.providerSource,
      presetId: 'dice.original.carved.d20',
      glbPath: '/models/custom-dice/original-set/Original_D20_Source.glb',
      glbSha256: ORIGINAL_D20_GLB_SHA256,
      glbSizeBytes: 491312,
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

function cloneEvidence() {
  return structuredClone(validEvidence());
}

const hash = (value: Uint8Array | string) =>
  createHash('sha256').update(value).digest('hex');
const jsonBytes = (value: unknown) =>
  new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);

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

  const resultContextIds = Array.from({ length: 20 }, (_, index) => {
    const prefix = `result-${String(index + 1).padStart(2, '0')}`;
    return [
      `${prefix}-roller-roll`,
      `${prefix}-decorative-gesture`,
      `${prefix}-host-release`,
    ];
  }).flat();
  const contextIds = stone0ExpectedNetworkContextIds();
  expect(contextIds.slice(0, 60)).toEqual(resultContextIds);

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
  const missingOrdinal = contextIds.indexOf('missing-manifest') + 1;
  const consoleEvidence = {
    schemaVersion: 2,
    console: [
      {
        id: 'missing-manifest',
        contextOrdinal: missingOrdinal,
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
  for (const [index, path] of [
    ...evidence.results.map((value) => value.screenshot),
    ...evidence.scenarios.map((value) => value.screenshot),
  ].entries())
    files.set(
      path,
      Uint8Array.from([
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
        index & 0xff,
        1,
        2,
        3,
      ])
    );
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
    schemaVersion: 1,
    kind: 'stone0-original-d20-tray-package',
    verdict: 'PASS',
    sourceSha: packageIdentity.sourceSha,
    webBuildSha256: packageIdentity.webBuildSha256,
    buildManifestSha256: packageIdentity.buildManifestSha256,
    resultCount: evidence.results.length,
    scenarioCount: evidence.scenarios.length,
    contextCount: contexts.length,
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

describe('Stone 0 Tray evidence protocol', () => {
  it('keeps the Node 22 capture entrypoint free of direct TypeScript imports with extensionless transitive dependencies', () => {
    const source = readFileSync(
      'scripts/attack-die/capture-stone0-tray-evidence.mjs',
      'utf8'
    );
    expect(source).not.toMatch(/^import[\s\S]*?from ['"][^'"]+\.ts['"];?$/m);
    expect(source).toMatch(/bundleTsModule/);
    expect(source).toMatch(/import\(['"]esbuild['"]\)|from ['"]esbuild['"]/);
  });

  it('targets the real R3F Canvas wrapper and nested canvas shape', () => {
    const source = readFileSync(
      'scripts/attack-die/capture-stone0-tray-evidence.mjs',
      'utf8'
    );
    expect(source).not.toMatch(/canvas\.attack-die-3d__canvas/);
    expect(source).toMatch(/\.attack-die-3d__canvas canvas/);
  });

  it('scrolls the below-fold grab target into view before driving a real pointer gesture', () => {
    const source = readFileSync(
      'scripts/attack-die/capture-stone0-tray-evidence.mjs',
      'utf8'
    );
    expect(source).toMatch(
      /const grab =[\s\S]*?await grab\.scrollIntoViewIfNeeded\(\);[\s\S]*?await grab\.boundingBox\(\)/
    );
  });

  it('waits for renderer lifecycle ownership before invoking real context loss', () => {
    const source = readFileSync(
      'scripts/attack-die/capture-stone0-tray-evidence.mjs',
      'utf8'
    );
    expect(source).toMatch(
      /await waitRendererOwnership\(scenario\.page\);\s*const lost =/
    );
  });

  it('requires the capture driver to own exact local API fixtures, location-aware console rules, and a Tray-first route', () => {
    const source = readFileSync(
      'scripts/attack-die/capture-stone0-tray-evidence.mjs',
      'utf8'
    );
    expect(source).toContain('STONE0_LOCAL_API_FIXTURES');
    expect(source).toContain('message.location()');
    expect(source).toContain("attackDieStage', 'tray'");
    expect(source).not.toMatch(/ERR_CONNECTION_REFUSED/);
    expect(source).not.toMatch(/responded with a status of 404\/i/);
  });

  it('accepts one exact complete immutable identity, result, and scenario matrix', () => {
    const evidence = validEvidence();
    expect(assertStone0TrayEvidence(evidence, identity)).toEqual(evidence);
    expect(evidence.results).toHaveLength(20);
    expect(evidence.scenarios).toHaveLength(STONE0_SCENARIO_IDS.length);
  });

  it.each([
    [
      'source SHA',
      (value: Stone0TrayEvidence) => (value.sourceSha = 'a'.repeat(40)),
    ],
    [
      'build root',
      (value: Stone0TrayEvidence) => (value.webBuildSha256 = 'a'.repeat(64)),
    ],
    [
      'build manifest',
      (value: Stone0TrayEvidence) =>
        (value.buildManifestSha256 = 'a'.repeat(64)),
    ],
    [
      'provider manifest',
      (value: Stone0TrayEvidence) =>
        (value.provider.manifestSha256 = 'a'.repeat(64)),
    ],
    [
      'provider source manifest',
      (value: Stone0TrayEvidence) =>
        (value.provider.sourceManifestSha256 = 'a'.repeat(64)),
    ],
    [
      'Original GLB',
      (value: Stone0TrayEvidence) =>
        (value.provider.glbSha256 = 'a'.repeat(64)),
    ],
  ] as const)('rejects stale or mismatched %s identity', (_name, mutate) => {
    const value = cloneEvidence();
    mutate(value);
    expect(() => assertStone0TrayEvidence(value, identity)).toThrow(
      /identity|hash|sha/i
    );
  });

  it.each([
    ['manifest requests', 'manifestRequestCount'],
    ['manifest transfers', 'manifestTransferCount'],
    ['GLB requests', 'glbRequestCount'],
    ['GLB transfers', 'glbTransferCount'],
  ] as const)('requires exactly one %s per baseline context', (_name, key) => {
    for (const count of [0, 2]) {
      const value = cloneEvidence();
      value.provider[key] = count;
      expect(() => assertStone0TrayEvidence(value, identity)).toThrow(
        /count|request|transfer/i
      );
    }
  });

  it('rejects missing, duplicate, reordered, or malformed 1–20 result facts', () => {
    const missing = cloneEvidence();
    missing.results.pop();
    expect(() => assertStone0TrayEvidence(missing, identity)).toThrow(
      /result/i
    );

    const duplicate = cloneEvidence();
    duplicate.results[19] = structuredClone(duplicate.results[0]);
    expect(() => assertStone0TrayEvidence(duplicate, identity)).toThrow(
      /result/i
    );

    const reordered = cloneEvidence();
    [reordered.results[0], reordered.results[1]] = [
      reordered.results[1],
      reordered.results[0],
    ];
    expect(() => assertStone0TrayEvidence(reordered, identity)).toThrow(
      /result/i
    );

    const malformed = cloneEvidence();
    malformed.results[0].requestIdentity = 'stale-request';
    expect(() => assertStone0TrayEvidence(malformed, identity)).toThrow(
      /identity/i
    );
  });

  it('requires held <=0.25-degree independent witnesses sharing provider/events/source', () => {
    for (const mutate of [
      (value: Stone0TrayEvidence) =>
        (value.results[0].roller.angularErrorDegrees = 0.250001),
      (value: Stone0TrayEvidence) =>
        (value.results[0].spectator.exactTargetHeld = false),
      (value: Stone0TrayEvidence) => (value.results[0].sharedEvents = false),
      (value: Stone0TrayEvidence) => (value.results[0].sharedProvider = false),
      (value: Stone0TrayEvidence) =>
        (value.results[0].spectator.eventArrayId += 1),
      (value: Stone0TrayEvidence) =>
        (value.results[0].spectator.providerId += 1),
      (value: Stone0TrayEvidence) =>
        (value.results[0].sourceSceneShared = false),
      (value: Stone0TrayEvidence) => (value.results[0].clonesDistinct = false),
      (value: Stone0TrayEvidence) =>
        (value.results[0].spectator.generation =
          value.results[0].roller.generation),
      (value: Stone0TrayEvidence) =>
        (value.results[0].spectator.contextId =
          value.results[0].roller.contextId),
      (value: Stone0TrayEvidence) =>
        (value.results[0].spectator.cloneId = value.results[0].roller.cloneId),
    ]) {
      const value = cloneEvidence();
      mutate(value);
      expect(() => assertStone0TrayEvidence(value, identity)).toThrow(
        /witness|held|error|distinct|shared|identity|measured/i
      );
    }
  });

  it('requires exact mapped target invariance across release ownership and decoration', () => {
    const value = cloneEvidence();
    value.results[6].targetInvariance.decorativeVariation = [0, 0, 0, 1];
    expect(() => assertStone0TrayEvidence(value, identity)).toThrow(
      /target|invariant/i
    );
  });

  it('requires deterministic unique result and scenario filenames', () => {
    const result = cloneEvidence();
    result.results[0].screenshot = '../result-01.png';
    expect(() => assertStone0TrayEvidence(result, identity)).toThrow(
      /filename|screenshot/i
    );

    const scenarioValue = cloneEvidence();
    scenarioValue.scenarios[0].screenshot =
      scenarioValue.scenarios[1].screenshot;
    expect(() => assertStone0TrayEvidence(scenarioValue, identity)).toThrow(
      /filename|screenshot|duplicate/i
    );
  });

  it('rejects missing, duplicate, reordered, malformed, or failed scenario facts', () => {
    const missing = cloneEvidence();
    missing.scenarios.pop();
    expect(() => assertStone0TrayEvidence(missing, identity)).toThrow(
      /scenario/i
    );

    const duplicate = cloneEvidence();
    duplicate.scenarios[1] = structuredClone(duplicate.scenarios[0]);
    expect(() => assertStone0TrayEvidence(duplicate, identity)).toThrow(
      /scenario/i
    );

    const reordered = cloneEvidence();
    [reordered.scenarios[0], reordered.scenarios[1]] = [
      reordered.scenarios[1],
      reordered.scenarios[0],
    ];
    expect(() => assertStone0TrayEvidence(reordered, identity)).toThrow(
      /scenario/i
    );

    const failed = cloneEvidence();
    failed.scenarios[0].passed = false;
    expect(() => assertStone0TrayEvidence(failed, identity)).toThrow(
      /scenario/i
    );

    const malformed = cloneEvidence();
    malformed.scenarios[0].facts.canvasCount = 1;
    expect(() => assertStone0TrayEvidence(malformed, identity)).toThrow(
      /pending|scenario/i
    );
  });

  it('requires released carved result 10 and measured five-surface responsive containment, order, gaps, clearance, and overflow', () => {
    for (const mutate of [
      (facts: ReturnType<typeof responsiveFacts>) =>
        (facts.rollerCarvedVisible = false),
      (facts: ReturnType<typeof responsiveFacts>) => (facts.carvedResult = 9),
      (facts: ReturnType<typeof responsiveFacts>) =>
        (facts.scrollWidth = facts.innerWidth + 1),
      (facts: ReturnType<typeof responsiveFacts>) =>
        (facts.surfaces.spectator.left = facts.surfaces.roller.right + 1),
      (facts: ReturnType<typeof responsiveFacts>) =>
        (facts.surfaces.log.right = facts.surfaces.preview.right + 20),
      (facts: ReturnType<typeof responsiveFacts>) =>
        (facts.surfaces.dock.top = facts.surfaces.log.bottom + 1),
    ]) {
      const value = cloneEvidence();
      const scenario = value.scenarios.find(
        (candidate) => candidate.id === 'responsive-desktop'
      )!;
      mutate(scenario.facts as ReturnType<typeof responsiveFacts>);
      expect(() => assertStone0TrayEvidence(value, identity)).toThrow(
        /responsive|carved|overflow|contain|order|gap|clearance|dimension/i
      );
    }
  });

  it('requires incomplete maps to be manifest parse failures and unmapped-result to remain synthetic renderer-only', () => {
    const incomplete = cloneEvidence();
    incomplete.scenarios.find(
      (item) => item.id === 'incomplete-face-map'
    )!.facts.failureOrigin = 'synthetic-renderer-only';
    expect(() => assertStone0TrayEvidence(incomplete, identity)).toThrow(
      /incomplete|manifest|failure/i
    );

    const unmapped = cloneEvidence();
    const fact = unmapped.scenarios.find(
      (item) => item.id === 'unmapped-result'
    )!;
    fact.facts.providerMutation = true;
    fact.facts.failureOrigin = 'manifest-parse';
    expect(() => assertStone0TrayEvidence(unmapped, identity)).toThrow(
      /unmapped|synthetic|failure/i
    );
  });

  it('requires empty validation failures and unexpected console/page errors', () => {
    for (const key of ['validationFailures', 'unexpectedErrors'] as const) {
      const value = cloneEvidence();
      value[key].push('unexpected defect');
      expect(() => assertStone0TrayEvidence(value, identity)).toThrow(
        /failure|error/i
      );
    }
  });

  it('binds reread browser/network/console/build data and every screenshot digest into one PASS package', () => {
    const fixture = packageFixture();
    expect(
      assertStone0TrayEvidencePackage(
        fixture.packageManifest,
        fixture.packageIdentity,
        fixture.files
      )
    ).toEqual(fixture.packageManifest);
    expect(fixture.packageManifest.contextCount).toBe(78);
    expect(fixture.packageManifest.artifacts).toHaveLength(42);
  });

  it.each([
    'browser-evidence.json',
    'network.json',
    'console.json',
    'build-manifest.json',
    stone0ResultScreenshot(1),
    stone0ScenarioScreenshot('responsive-narrow'),
  ])('rejects a missing or substituted package artifact: %s', (path) => {
    const missing = packageFixture();
    missing.files.delete(path);
    expect(() =>
      assertStone0TrayEvidencePackage(
        missing.packageManifest,
        missing.packageIdentity,
        missing.files
      )
    ).toThrow(/artifact|missing|package/i);

    const substituted = packageFixture();
    substituted.files.set(path, new TextEncoder().encode('substituted'));
    expect(() =>
      assertStone0TrayEvidencePackage(
        substituted.packageManifest,
        substituted.packageIdentity,
        substituted.files
      )
    ).toThrow(/artifact|digest|size|json|png|package/i);
  });

  it('rejects contradictory network context IDs/counts, API fixtures, console locations, screenshot references, and build data', () => {
    for (const mutate of [
      (fixture: ReturnType<typeof packageFixture>) => {
        fixture.network.contexts[0].id = 'substituted-context';
        fixture.files.set('network.json', jsonBytes(fixture.network));
      },
      (fixture: ReturnType<typeof packageFixture>) => {
        fixture.network.contexts[0].provider.glbTransferCount = 0;
        fixture.files.set('network.json', jsonBytes(fixture.network));
      },
      (fixture: ReturnType<typeof packageFixture>) => {
        fixture.network.contexts[0].apiFixtures.pop();
        fixture.files.set('network.json', jsonBytes(fixture.network));
      },
      (fixture: ReturnType<typeof packageFixture>) => {
        fixture.consoleEvidence.console[0].location.url =
          'http://127.0.0.1:3003/unrelated.png';
        fixture.files.set('console.json', jsonBytes(fixture.consoleEvidence));
      },
      (fixture: ReturnType<typeof packageFixture>) => {
        fixture.evidence.results[0].screenshot = stone0ResultScreenshot(2);
        fixture.files.set('browser-evidence.json', jsonBytes(fixture.evidence));
      },
      (fixture: ReturnType<typeof packageFixture>) => {
        const build = JSON.parse(
          new TextDecoder().decode(fixture.files.get('build-manifest.json'))
        );
        build.webBuildSha256 = 'f'.repeat(64);
        fixture.files.set('build-manifest.json', jsonBytes(build));
      },
    ]) {
      const fixture = packageFixture();
      mutate(fixture);
      const changedPath = [
        'network.json',
        'console.json',
        'browser-evidence.json',
        'build-manifest.json',
      ].find(
        (path) =>
          hash(fixture.files.get(path)!) !==
          fixture.packageManifest.artifacts.find(
            (artifact) => artifact.path === path
          )!.sha256
      )!;
      const artifact = fixture.packageManifest.artifacts.find(
        (value) => value.path === changedPath
      )!;
      const bytes = fixture.files.get(changedPath)!;
      artifact.sha256 = hash(bytes);
      artifact.sizeBytes = bytes.byteLength;
      expect(() =>
        assertStone0TrayEvidencePackage(
          fixture.packageManifest,
          fixture.packageIdentity,
          fixture.files
        )
      ).toThrow(
        /context|count|fixture|console|location|screenshot|build|identity|package/i
      );
    }
  });

  it('rejects package manifests that omit, duplicate, reorder, or falsely summarize artifacts', () => {
    for (const mutate of [
      (fixture: ReturnType<typeof packageFixture>) =>
        fixture.packageManifest.artifacts.pop(),
      (fixture: ReturnType<typeof packageFixture>) =>
        (fixture.packageManifest.artifacts[1] = structuredClone(
          fixture.packageManifest.artifacts[0]
        )),
      (fixture: ReturnType<typeof packageFixture>) =>
        fixture.packageManifest.artifacts.reverse(),
      (fixture: ReturnType<typeof packageFixture>) =>
        (fixture.packageManifest.contextCount = 77),
      (fixture: ReturnType<typeof packageFixture>) =>
        (fixture.packageManifest.consoleErrorCount = 0),
    ]) {
      const fixture = packageFixture();
      mutate(fixture);
      expect(() =>
        assertStone0TrayEvidencePackage(
          fixture.packageManifest,
          fixture.packageIdentity,
          fixture.files
        )
      ).toThrow(/artifact|order|count|package/i);
    }
  });

  it('rejects decorated top-level, provider, result, witness, scenario, and artifact objects', () => {
    for (const mutate of [
      (value: Stone0TrayEvidence) => Object.assign(value, { extra: true }),
      (value: Stone0TrayEvidence) =>
        Object.assign(value.provider, { extra: true }),
      (value: Stone0TrayEvidence) =>
        Object.assign(value.results[0], { extra: true }),
      (value: Stone0TrayEvidence) =>
        Object.assign(value.results[0].roller, { extra: true }),
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
