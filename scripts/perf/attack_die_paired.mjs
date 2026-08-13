#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import {
  evaluateAttackDieRun,
  parseAttackDieProfiles,
} from '../../src/dev/attackDiePerfProtocol.ts';
import {
  measurePostUnmount,
  releasedCounters,
  runProfileAttempts,
  writeProfileArtifact,
} from './attackDiePairedDriver.ts';
import { AttackDieRequestTracker } from './attackDieRequestTracker.ts';

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
const attempted = await runProfileAttempts(
  profileArtifact.profiles.filter((profile) => profile.status === 'available'),
  out,
  runProfile
);
process.exitCode = attempted.exitCode;
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
    const requestTracker = new AttackDieRequestTracker();
    page.on('request', (request) =>
      requestTracker.start(request, request.url(), performance.now())
    );
    page.on('response', async (response) => {
      let bytes = null;
      try {
        bytes = (await response.body()).byteLength;
      } catch {}
      requestTracker.settle(response.request(), {
        status: response.status(),
        bytes,
        settledAt: performance.now(),
      });
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
    // Preserve one actual cold readiness trial before any provider/shader warmup.
    const coldBoundary = performance.now();
    await page.evaluate(() =>
      window.__attackDiePerf.runSample({
        mode: '3d',
        result: 20,
        reducedMotion: false,
        token: 1,
      })
    );
    await page
      .waitForFunction(
        () => window.__attackDiePerf.readCounters().readyAtMs !== null,
        undefined,
        { timeout: 5000 }
      )
      .catch(() => undefined);
    const coldCounters = await page.evaluate(() =>
      window.__attackDiePerf.readCounters()
    );
    const coldEndedAt = performance.now();
    const coldTrial = {
      readyMs: coldCounters.readyAtMs,
      healthy3d: coldCounters.healthy3d,
      requests: requestTracker.sample(coldBoundary, coldEndedAt),
    };
    await page.evaluate(() => window.__attackDiePerf.unmountDie());
    // Warm after the separately recorded cold trial, outside measured alternating windows.
    await page.evaluate(() =>
      window.__attackDiePerf.runSample({
        mode: '3d',
        result: 20,
        reducedMotion: false,
        token: 2,
      })
    );
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__attackDiePerf.unmountDie());
    const samples = [];
    for (let index = 0; index < 40; index++) {
      const mode = index % 2 === 0 ? 'svg' : '3d';
      const result = (Math.floor(index / 2) % 20) + 1;
      const sampleStartedAt = performance.now();
      const sample = await page.evaluate(
        async ({ mode, result, token }) => {
          const longStart = window.__attackDiePerfLongTasks.length;
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
            readyMs: counters.readyAtMs,
            decodeMs: null,
            decodeMsLimitation:
              'Three.js loader does not expose a separate portable decode interval through this harness.',
            heapBytes: performance.memory?.usedJSHeapSize ?? null,
          };
        },
        { mode, result, token: index + 3 }
      );
      const sampleEndedAt = performance.now();
      const startedRequests = requestTracker.sample(
        sampleStartedAt,
        sampleEndedAt
      );
      samples.push({
        ...sample,
        requestCount: startedRequests.length,
        requestBytes: startedRequests.every((request) => request.bytes !== null)
          ? startedRequests.reduce((sum, request) => sum + request.bytes, 0)
          : null,
        requests: startedRequests,
        requestBytesLimitation: startedRequests.some(
          (request) => request.bytes === null
        )
          ? 'One or more requests started in this sample have unknown bytes or had not settled at sample close.'
          : null,
      });
    }
    const postUnmount = {};
    for (const mode of ['svg', '3d']) {
      postUnmount[mode] = await measurePostUnmount(page, {
        mode,
        token: mode === 'svg' ? 50 : 51,
        windowMs: postUnmountMs,
      });
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
      postUnmountCounters: releasedCounters(postUnmount['3d'].counters),
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
        coldTrial,
        coldMs: coldTrial.readyMs,
        warmMs: samples
          .filter((sample) => sample.mode === '3d')
          .map((sample) => sample.readyMs),
        decodeMs: null,
        decodeMsLimitation: 'No portable separate decode interval is exposed.',
      },
      network: {
        attribution:
          'Playwright request identity with request-start boundaries; repeated URLs retained.',
        byteLimitation:
          'Response body bytes are null when unavailable or the request has not settled.',
      },
      gpuBytes: null,
      gpuBytesLimitation:
        'Browser does not expose portable GPU allocation bytes; exact harness renderer.info proxies are recorded when available.',
    };
    await writeProfileArtifact(out, profile.category, output);
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
