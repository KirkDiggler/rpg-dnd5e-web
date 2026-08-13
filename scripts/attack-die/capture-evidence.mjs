#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import {
  assertForcedFallback,
  assertSameManifest,
  observeHeldSettlement,
  parseForcedFailure,
  runEvidenceSequence,
  validateServedBuild,
} from './evidenceProtocol.ts';
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const flag = (name) => args.includes(name);
const url = option('--url');
const out = resolve(option('--out'));
const manifestPath = resolve(option('--build-manifest'));
if (!url || !out || !manifestPath)
  throw Error('--url, --out, and --build-manifest are required');
const force = parseForcedFailure(option('--force', 'none'));
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (!/^[0-9a-f]{64}$/.test(manifest.webBuildSha256))
  throw Error('invalid build hash');
const base = new URL(url);
await validateServedBuild(manifest, async (path) => {
  const response = await fetch(new URL(`/${path}`, base));
  if (!response.ok) throw Error(`served build path failed: ${path}`);
  return new Uint8Array(await response.arrayBuffer());
});
const servedManifest = await (
  await fetch(new URL('/__attack-die-build-manifest.json', base))
).json();
assertSameManifest(manifest, servedManifest);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    reducedMotion: flag('--reduced-motion') ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  if (force === 'load')
    await page.route('**/SM_Prop_D20_Lightning_01.glb', (route) =>
      route.abort()
    );
  if (force === 'hash')
    await page.route('**/SM_Prop_D20_Lightning_01.glb', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'model/gltf-binary',
        body: 'forced changed bytes',
      })
    );
  if (force === 'webgl')
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
        if (kind === 'webgl' || kind === 'webgl2') return null;
        return original.call(this, kind, ...rest);
      };
    });
  await page.addInitScript((hash) => {
    window.__ATTACK_DIE_BUILD_SHA256__ = hash;
  }, manifest.webBuildSha256);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page
    .getByRole('heading', { name: 'Authoritative 3D Attack Die' })
    .waitFor();
  if (['shader', 'invalid-result', 'unmapped'].includes(force))
    await page.getByLabel('Forced fallback').selectOption(force);
  if (force === 'context-loss') {
    await page.locator('.attack-die-3d__canvas').waitFor();
    await page.evaluate(() =>
      document
        .querySelector('.attack-die-3d__canvas')
        ?.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    );
  }
  const modes = [
    ...(flag('--animated') ? ['animated'] : []),
    ...(flag('--reduced-motion') ? ['reduced-motion'] : []),
  ];
  if (!modes.length) modes.push('animated');
  const results = flag('--all-results')
    ? Array.from({ length: 20 }, (_, i) => i + 1)
    : [20];
  const captures = [];
  const forcedObservations = [];
  for (const mode of modes) {
    await page.getByRole('tab', { name: 'Roll' }).click();
    const reduced = page.getByLabel(/Reduced motion/);
    if (mode === 'reduced-motion') await reduced.check();
    else await reduced.uncheck();
    if (force !== 'none') {
      for (let observation = 0; observation < 2; observation++) {
        await page.waitForFunction(
          () => window.__attackDieEvidenceTelemetry?.renderer === 'svg',
          undefined,
          { timeout: 5000 }
        );
        await page.evaluate(() => new Promise(requestAnimationFrame));
        const observed = await page.evaluate(() => {
          const telemetry = window.__attackDieEvidenceTelemetry;
          if (!telemetry) return undefined;
          const semantic = [
            ...document.querySelectorAll('.attack-die-3d__fallback'),
          ].filter((node) => {
            const face = node.querySelector('[data-testid="dice-face"]');
            return (
              node.querySelector('[data-testid="d20-die"]') &&
              face?.textContent?.trim() === String(telemetry.requestedResult)
            );
          });
          return {
            ...telemetry,
            token: telemetry.presentationToken,
            semanticFallbackCount: semantic.length,
          };
        });
        if (observed) forcedObservations.push(observed);
      }
      assertForcedFallback(force, forcedObservations, {
        result: forcedObservations[0]?.requestedResult,
        token: forcedObservations[0]?.token,
      });
      await page.screenshot({
        path: resolve(out, `forced-${force}-${mode}.png`),
        fullPage: true,
      });
      continue;
    }
    const rows = await runEvidenceSequence(
      {
        async currentToken() {
          return (
            (await page.evaluate(
              () => window.__attackDieEvidenceTelemetry?.presentationToken
            )) ?? -1
          );
        },
        async setResult(result) {
          const input = page.getByLabel('Authoritative input');
          await input.fill(String(result));
          await page
            .getByRole('button', { name: /Replay decorative variation/ })
            .click();
        },
        async settle(result, previousToken) {
          await page.waitForFunction(
            (expected) => {
              const value = window.__attackDieEvidenceTelemetry;
              return (
                value?.requestedResult === expected &&
                (value.renderer === 'svg' || value.exactTargetHeld)
              );
            },
            result,
            { timeout: 5000 }
          );
          return observeHeldSettlement(
            result,
            previousToken,
            async () =>
              page.evaluate(
                () =>
                  window.__attackDieEvidenceTelemetry && {
                    ...window.__attackDieEvidenceTelemetry,
                    token:
                      window.__attackDieEvidenceTelemetry.presentationToken,
                  }
              ),
            async () => {
              await page.evaluate(() => new Promise(requestAnimationFrame));
            }
          );
        },
        async setCamera(camera) {
          await page
            .getByRole('radio', {
              name: camera === 'top' ? 'Top' : 'Three-quarter',
            })
            .click();
        },
        async verifyHeld(settlement) {
          await page.evaluate(() => new Promise(requestAnimationFrame));
          const observed = await page.evaluate(
            () =>
              window.__attackDieEvidenceTelemetry && {
                ...window.__attackDieEvidenceTelemetry,
                token: window.__attackDieEvidenceTelemetry.presentationToken,
              }
          );
          if (!observed || observed.token !== settlement.token)
            throw Error('camera hold token replacement');
          return observed;
        },
        async capture(result, camera, settlement) {
          const observed = await page.evaluate(
            () =>
              window.__attackDieEvidenceTelemetry && {
                ...window.__attackDieEvidenceTelemetry,
                token: window.__attackDieEvidenceTelemetry.presentationToken,
              }
          );
          if (
            !observed ||
            observed.token !== settlement.token ||
            observed.requestedResult !== result ||
            observed.renderer !== '3d' ||
            !observed.exactTargetHeld
          )
            throw Error('capture telemetry regression');
          const file = `${mode}-result-${String(result).padStart(2, '0')}-${camera}.png`;
          await page.screenshot({ path: resolve(out, file), fullPage: true });
          captures.push({
            mode,
            result,
            camera,
            file,
            ...settlement,
            humanReview: 'pending',
          });
        },
      },
      results
    );
    if (rows.length !== results.length * 2)
      throw Error('incomplete evidence rows');
  }
  const proposalHash = await page.evaluate(
    () => window.__attackDieProposalBuildSha256
  );
  if (proposalHash !== manifest.webBuildSha256)
    throw Error('proposal build hash mismatch');
  if (force !== 'none') assertForcedFallback(force, forcedObservations);
  const output = {
    schemaVersion: 1,
    kind: 'attack-die-concept-evidence',
    warning: 'PROVISIONAL — NOT GRADUATION EVIDENCE',
    webBuildSha256: manifest.webBuildSha256,
    forcedFailure: force,
    captures: force === 'none' ? captures : [],
    humanAppearanceApproval: 'pending',
    humanFaceCalibration: 'pending',
  };
  await writeFile(
    resolve(out, 'evidence.json'),
    `${JSON.stringify(output, null, 2)}\n`
  );
  console.log(
    JSON.stringify({
      out,
      captures: captures.length,
      webBuildSha256: manifest.webBuildSha256,
    })
  );
} finally {
  await browser.close();
}
