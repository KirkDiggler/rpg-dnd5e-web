#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import {
  evaluateAttackDieRun,
  parseAttackDieProfiles,
  performanceExitCode,
} from '../../src/dev/attackDiePerfProtocol.ts';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const baseUrl = option('--base-url');
const manifestPath = option('--build-manifest');
const profilePath = option('--profile-file');
const out = resolve(option('--out'));
const samplesPerMode = Number(option('--samples-per-mode', '20'));
const postUnmountMs = Number(option('--post-unmount-ms', '8000'));
if (!baseUrl || !manifestPath || !profilePath || !out)
  throw Error(
    '--base-url, --build-manifest, --profile-file, and --out are required'
  );
if (samplesPerMode !== 20)
  throw Error('frozen protocol requires exactly --samples-per-mode 20');
if (postUnmountMs !== 8000)
  throw Error('frozen protocol requires exactly --post-unmount-ms 8000');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const profileArtifact = parseAttackDieProfiles(
  JSON.parse(await readFile(profilePath, 'utf8'))
);
if (profileArtifact.blocked.length) {
  await mkdir(out, { recursive: true });
  const blocked = {
    schemaVersion: 1,
    kind: 'attack-die-paired-performance',
    status: 'blocked',
    reason: profileArtifact.blocked.join('; '),
    profiles: profileArtifact.profiles,
    webBuildSha256: manifest.webBuildSha256,
  };
  await writeFile(
    resolve(out, 'performance.json'),
    `${JSON.stringify(blocked, null, 2)}
`
  );
  console.log(JSON.stringify(blocked));
  process.exit(2);
}
const outcomes = [];
for (const profile of profileArtifact.profiles) {
  if (profile.status !== 'available') continue;
  outcomes.push(await runProfile(profile));
}
process.exitCode = performanceExitCode(outcomes);
async function runProfile(profile) {
  const percentile = (values, p) => {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)] ?? 0;
  };
  const summary = (samples) => ({
    median: percentile(
      samples.map((s) => s.p95FrameTimeMs),
      0.5
    ),
    p95: percentile(
      samples.map((s) => s.p95FrameTimeMs),
      0.95
    ),
    attributableLongTasks: samples.reduce(
      (sum, sample) => sum + sample.longTasks.length,
      0
    ),
  });
  let finalSummary;
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  });
  try {
    const context = await browser.newContext({
      viewport: profile.viewportPixels,
      deviceScaleFactor: profile.dpr,
    });
    const page = await context.newPage();
    const requests = new Map();
    let requestSequence = 0;
    page.on('response', async (response) => {
      const url = response.url();
      if (!requests.has(url)) {
        let bytes = null;
        try {
          bytes = (await response.body()).byteLength;
        } catch {}
        requests.set(url, {
          url,
          status: response.status(),
          bytes,
          sequence: requestSequence++,
        });
      }
    });
    await page.addInitScript(() => {
      window.__attackDiePerfLongTasks = [];
      if ('PerformanceObserver' in window)
        new PerformanceObserver((list) => {
          window.__attackDiePerfLongTasks.push(
            ...list.getEntries().map((entry) => ({
              startTime: entry.startTime,
              duration: entry.duration,
            }))
          );
        }).observe({ type: 'longtask', buffered: true });
    });
    const url = new URL(baseUrl);
    url.searchParams.set('attackDiePerf', '1');
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.__attackDiePerf));
    // Warm provider and shader outside timed windows without touching the queue.
    await page.evaluate(() =>
      window.__attackDiePerf.runSample({
        mode: '3d',
        result: 20,
        reducedMotion: false,
        token: 1,
      })
    );
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__attackDiePerf.unmountDie());
    const samples = [];
    for (let index = 0; index < 40; index++) {
      const mode = index % 2 === 0 ? 'svg' : '3d';
      const result = (Math.floor(index / 2) % 20) + 1;
      const sample = await page.evaluate(
        async ({ mode, result, token }) => {
          const longStart = window.__attackDiePerfLongTasks.length;
          const resourceStart = performance.getEntriesByType('resource').length;
          const deltas = [];
          const begin = performance.now();
          let last = begin;
          window.__attackDiePerf.runSample({
            mode,
            result,
            reducedMotion: false,
            token,
          });
          await new Promise((done) => {
            const frame = (now) => {
              deltas.push(now - last);
              last = now;
              if (now - begin >= 2800) done();
              else requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
          });
          const counters = window.__attackDiePerf.readCounters();
          const sorted = deltas.sort((a, b) => a - b);
          return {
            mode,
            result,
            p95FrameTimeMs: sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0,
            medianFrameTimeMs: sorted[Math.ceil(sorted.length * 0.5) - 1] ?? 0,
            frameCount: sorted.length,
            longTasks: window.__attackDiePerfLongTasks
              .slice(longStart)
              .filter((task) => task.duration > 50),
            counters,
            healthy3d: mode === 'svg' || counters.healthy3d,
            requestCount:
              performance.getEntriesByType('resource').length - resourceStart,
            requestBytes: performance
              .getEntriesByType('resource')
              .slice(resourceStart)
              .reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
            requestBytesLimitation:
              'Resource Timing transferSize may be zero when unavailable or cross-origin.',
            readyMs: counters.readyAtMs,
            decodeMs: null,
            decodeMsLimitation:
              'Three.js loader does not expose a separate portable decode interval through this harness.',
            heapBytes: performance.memory?.usedJSHeapSize ?? null,
          };
        },
        { mode, result, token: index + 2 }
      );
      samples.push(sample);
    }
    const postUnmount = {};
    for (const mode of ['svg', '3d']) {
      postUnmount[mode] = await page.evaluate(
        async ({ mode, token, windowMs }) => {
          window.__attackDiePerf.runSample({
            mode,
            result: 20,
            reducedMotion: false,
            token,
          });
          await new Promise((done) => setTimeout(done, 100));
          window.__attackDiePerf.unmountDie();
          const deltas = [];
          let last = performance.now();
          const start = last;
          await new Promise((done) => {
            const frame = (now) => {
              deltas.push(now - last);
              last = now;
              if (now - start >= windowMs) done();
              else requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
          });
          deltas.sort((a, b) => a - b);
          return {
            p95FrameTimeMs: deltas[Math.ceil(deltas.length * 0.95) - 1] ?? 0,
            frameCount: deltas.length,
            counters: window.__attackDiePerf.readCounters(),
            requestCount:
              performance.getEntriesByType('resource').length - resourceStart,
            requestBytes: performance
              .getEntriesByType('resource')
              .slice(resourceStart)
              .reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
            requestBytesLimitation:
              'Resource Timing transferSize may be zero when unavailable or cross-origin.',
            readyMs: counters.readyAtMs,
            decodeMs: null,
            decodeMsLimitation:
              'Three.js loader does not expose a separate portable decode interval through this harness.',
            heapBytes: performance.memory?.usedJSHeapSize ?? null,
          };
        },
        { mode, token: mode === 'svg' ? 50 : 51, windowMs: postUnmountMs }
      );
    }
    const svg = summary(samples.filter((sample) => sample.mode === 'svg'));
    const candidate = summary(samples.filter((sample) => sample.mode === '3d'));
    const budgets = {
      frameTime: candidate.p95 <= svg.p95 * 1.1,
      longTasks: candidate.attributableLongTasks === 0,
      postUnmount:
        postUnmount['3d'].p95FrameTimeMs <=
        postUnmount.svg.p95FrameTimeMs * 1.1,
    };
    const health = evaluateAttackDieRun({
      samples,
      svgP95: svg.p95,
      candidateP95: candidate.p95,
      svgPostUnmountP95: postUnmount.svg.p95FrameTimeMs,
      candidatePostUnmountP95: postUnmount['3d'].p95FrameTimeMs,
      postUnmountCounters: {
        contextsActive: postUnmount['3d'].counters.activeContextIds.length,
        geometries:
          postUnmount['3d'].counters.activeContextIds.length === 0
            ? 0
            : postUnmount['3d'].counters.rendererInfo.geometries,
        textures:
          postUnmount['3d'].counters.activeContextIds.length === 0
            ? 0
            : postUnmount['3d'].counters.rendererInfo.textures,
        programs:
          postUnmount['3d'].counters.activeContextIds.length === 0
            ? 0
            : postUnmount['3d'].counters.rendererInfo.programs,
      },
    });
    budgets.healthy3d = health.healthy;
    budgets.resourcesReleased = health.resourcesReleased;
    budgets.pass =
      budgets.frameTime &&
      budgets.longTasks &&
      budgets.postUnmount &&
      health.healthy &&
      health.resourcesReleased;
    const output = {
      schemaVersion: 1,
      kind: 'attack-die-paired-performance',
      status: budgets.pass ? 'pass' : 'failed',
      protocol: {
        samplesPerMode,
        alternatingOrder: true,
        postUnmountMs,
        sameBuild: true,
        warmed: true,
      },
      profile,
      webBuildSha256: manifest.webBuildSha256,
      samples,
      summary: { svg, candidate },
      postUnmount,
      budgets,
      readiness: {
        coldMs: samples.find((sample) => sample.mode === '3d')?.readyMs ?? null,
        warmMs: samples
          .filter((sample) => sample.mode === '3d')
          .slice(1)
          .map((sample) => sample.readyMs),
        decodeMs: null,
        decodeMsLimitation: 'No portable separate decode interval is exposed.',
      },
      network: {
        count: requests.size,
        bytes: [...requests.values()].reduce(
          (sum, request) => sum + (request.bytes ?? 0),
          0
        ),
        requests: [...requests.values()],
      },
      gpuBytes: null,
      gpuBytesLimitation:
        'Browser does not expose portable GPU allocation bytes; exact harness renderer.info proxies are recorded when available.',
    };
    await mkdir(out, { recursive: true });
    await writeFile(
      resolve(out, `performance-${profile.category}.json`),
      `${JSON.stringify(output, null, 2)}\n`
    );
    finalSummary = {
      status: output.status,
      out,
      category: profile.category,
      budgets,
    };
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify(finalSummary));
  return finalSummary;
}
