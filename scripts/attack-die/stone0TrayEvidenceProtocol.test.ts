// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ORIGINAL_D20_GLB_SHA256,
  STONE0_SCENARIO_IDS,
  assertStone0TrayEvidence,
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
      facts: {
        layout,
        contained: true,
        horizontalOverflow: false,
        overlap: false,
      },
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
        /witness|held|error|distinct|shared/i
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
