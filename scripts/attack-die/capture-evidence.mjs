#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import {
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
if (servedManifest.webBuildSha256 !== manifest.webBuildSha256)
  throw Error('preview serves a different build manifest');
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
  await page.addInitScript((hash) => {
    window.__ATTACK_DIE_BUILD_SHA256__ = hash;
  }, manifest.webBuildSha256);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page
    .getByRole('heading', { name: 'Authoritative 3D Attack Die' })
    .waitFor();
  const modes = [
    ...(flag('--animated') ? ['animated'] : []),
    ...(flag('--reduced-motion') ? ['reduced-motion'] : []),
  ];
  if (!modes.length) modes.push('animated');
  const results = flag('--all-results')
    ? Array.from({ length: 20 }, (_, i) => i + 1)
    : [20];
  const captures = [];
  for (const mode of modes) {
    await page.getByRole('tab', { name: 'Roll' }).click();
    const reduced = page.getByLabel(/Reduced motion/);
    if (mode === 'reduced-motion') await reduced.check();
    else await reduced.uncheck();
    const rows = await runEvidenceSequence(
      {
        async setResult(result) {
          const input = page.getByLabel('Authoritative input');
          await input.fill(String(result));
          await page
            .getByRole('button', { name: /Replay decorative variation/ })
            .click();
        },
        async settle(result) {
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
          return page.evaluate(() => window.__attackDieEvidenceTelemetry);
        },
        async capture(result, camera, settlement) {
          await page
            .getByRole('radio', {
              name: camera === 'top' ? 'Top' : 'Three-quarter',
            })
            .click();
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
  const output = {
    schemaVersion: 1,
    kind: 'attack-die-concept-evidence',
    warning: 'PROVISIONAL — NOT GRADUATION EVIDENCE',
    webBuildSha256: manifest.webBuildSha256,
    captures,
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
