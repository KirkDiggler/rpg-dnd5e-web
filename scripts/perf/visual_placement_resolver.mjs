#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const SAMPLE_COUNT = 100;
const BATCH_SIZE = 1_000;
const WARMUP_BATCHES = 10;
const MAX_MEDIAN_P95_MS = 0.05;

function nearestRankP95(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(0.95 * sorted.length) - 1];
}

async function worker() {
  // Vite loads the actual TypeScript production module; setup/import time is
  // deliberately outside the timed resolver batches.
  const { createServer } = await import('vite');
  const server = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });
  try {
    const { resolveVisualPlacement } = await server.ssrLoadModule(
      '/src/rendering/visualPlacement/resolver.ts'
    );
    const entry = {
      id: 'perf:enrolled',
      glbPath: 'fixture-only/perf.glb',
      glbSha256: '0'.repeat(64),
      sourceForwardAxis: '+Z',
      sourceForwardYawRad: 0.125,
      sourceUpAxis: '+Y',
      totalScale: 0.75,
      modelPoint: { kind: 'contact', position: [0.25, -0.5, 0.75] },
      requiredCompanions: [],
    };
    const facings = Array.from(
      { length: 6 },
      (_, index) => (index * Math.PI) / 3
    );
    const offsets = [
      [0.25, -0.5, 0.75],
      [-0.375, 0.625, -0.875],
      [1.125, -1.25, 1.5],
    ];
    const cases = facings.flatMap((facing) =>
      offsets.map((offset) => [facing, offset])
    );
    const runBatch = () => {
      for (let i = 0; i < BATCH_SIZE; i += 1) {
        const [facing, offset] = cases[i % cases.length];
        resolveVisualPlacement(entry, [10, 2, -5], facing, offset);
      }
    };
    for (let i = 0; i < WARMUP_BATCHES; i += 1) runBatch();
    const samples = [];
    for (let i = 0; i < SAMPLE_COUNT; i += 1) {
      const start = performance.now();
      runBatch();
      samples.push((performance.now() - start) / BATCH_SIZE);
    }
    process.stdout.write(
      `${JSON.stringify({ p95MsPerResolve: nearestRankP95(samples) })}\n`
    );
  } finally {
    await server.close();
  }
}

if (process.argv.includes('--worker')) {
  await worker();
} else {
  const executable = fileURLToPath(import.meta.url);
  const p95s = [];
  for (let run = 0; run < 3; run += 1) {
    const child = spawnSync(process.execPath, [executable, '--worker'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });
    if (child.status !== 0) {
      process.stderr.write(child.stderr);
      process.exit(child.status ?? 1);
    }
    const lines = child.stdout.trim().split('\n');
    const result = JSON.parse(lines.at(-1));
    p95s.push(result.p95MsPerResolve);
  }
  const medianP95 = [...p95s].sort((a, b) => a - b)[1];
  const evidence = {
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    freshProcesses: 3,
    warmupBatches: WARMUP_BATCHES,
    timedSamples: SAMPLE_COUNT,
    resolvesPerSample: BATCH_SIZE,
    cases: 'six facings × three fixed nonzero offsets',
    p95MsPerResolveByRun: p95s,
    medianP95MsPerResolve: medianP95,
    thresholdMsPerResolve: MAX_MEDIAN_P95_MS,
  };
  console.log(JSON.stringify(evidence, null, 2));
  if (medianP95 > MAX_MEDIAN_P95_MS) {
    console.error('visual placement resolver performance gate failed');
    process.exit(1);
  }
}
