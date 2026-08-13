#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { chromium } from 'playwright';

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
const allResults = flag('--all-results');
const modes = [
  ...(flag('--animated') ? ['animated'] : []),
  ...(flag('--reduced-motion') ? ['reduced-motion'] : []),
];
if (modes.length === 0) modes.push('animated');
const failure = option('--force', 'none');
if (
  ![
    'none',
    'load',
    'webgl',
    'shader',
    'context-loss',
    'hash',
    'invalid-result',
    'unmapped',
  ].includes(failure)
)
  throw Error('unsupported --force value');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

await mkdir(out, { recursive: true });
const base = new URL(url);
for (const file of manifest.files) {
  if (
    !['.js', '.css', '.html', '.svg', '.png', '.json'].includes(
      extname(file.path)
    )
  )
    continue;
  const response = await fetch(new URL(`/${file.path}`, base));
  if (!response.ok) throw Error(`served build path failed: ${file.path}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== file.size || sha(bytes) !== file.sha256)
    throw Error(`served build digest mismatch: ${file.path}`);
}
const servedManifest = await (
  await fetch(new URL('/__attack-die-build-manifest.json', base))
).json();
if (servedManifest.webBuildSha256 !== manifest.webBuildSha256)
  throw Error('preview serves a different build manifest');

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  reducedMotion: flag('--reduced-motion') ? 'reduce' : 'no-preference',
});
const page = await context.newPage();
if (failure === 'load') {
  await page.route('**/SM_Prop_D20_Lightning_01.glb', (route) => route.abort());
}
if (failure === 'hash') {
  await page.route('**/SM_Prop_D20_Lightning_01.glb', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'model/gltf-binary',
      body: 'forced changed bytes',
    })
  );
}
if (failure === 'webgl') {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
      if (kind === 'webgl' || kind === 'webgl2') return null;
      return original.call(this, kind, ...rest);
    };
  });
}
const consoleMessages = [];
page.on('console', (message) =>
  consoleMessages.push(`${message.type()}: ${message.text()}`)
);
await page.goto(url, { waitUntil: 'networkidle' });
await page
  .getByRole('heading', { name: 'Authoritative 3D Attack Die' })
  .waitFor();
if (failure !== 'none')
  await page.getByLabel('Forced fallback').selectOption(failure);
if (failure === 'context-loss') {
  await page.evaluate(() => {
    const canvas = document.querySelector('.attack-die-3d__canvas');
    canvas?.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  });
}
const results = allResults
  ? Array.from({ length: 20 }, (_, index) => index + 1)
  : [20];
const captures = [];
for (const mode of modes) {
  await page
    .getByRole('tab', { name: mode === 'animated' ? 'Roll' : 'Verify' })
    .click();
  if (mode === 'reduced-motion') {
    const checkbox = page.getByLabel(/Reduced motion/).first();
    if (await checkbox.isVisible()) await checkbox.check();
  }
  for (const result of results) {
    const input = page.getByLabel('Authoritative input');
    if (await input.count()) await input.fill(String(result));
    const file = `${mode}-result-${String(result).padStart(2, '0')}-${failure}.png`;
    await page.screenshot({ path: resolve(out, file), fullPage: true });
    captures.push({
      mode,
      result,
      file,
      authoritativeInput: result,
      humanReview: 'pending',
      graduationClaim: false,
    });
  }
}
const output = {
  schemaVersion: 1,
  kind: 'attack-die-concept-evidence',
  warning: 'PROVISIONAL — NOT GRADUATION EVIDENCE',
  webBuildSha256: manifest.webBuildSha256,
  url,
  viewport: { width: 390, height: 844, dpr: 2 },
  forcedFailure: failure,
  captures,
  consoleMessages,
  profileFacts: 'not supplied',
  humanAppearanceApproval: 'pending',
  humanFaceCalibration: 'pending',
};
await writeFile(
  resolve(out, 'evidence.json'),
  `${JSON.stringify(output, null, 2)}\n`
);
await browser.close();
console.log(
  JSON.stringify({
    out,
    captures: captures.length,
    webBuildSha256: manifest.webBuildSha256,
  })
);
