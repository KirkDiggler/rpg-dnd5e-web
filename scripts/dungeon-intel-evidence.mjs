// Fixture-only visual smoke. No API non-disclosure or gameplay claim.
// Usage: CHROME_BINARY=/usr/bin/google-chrome node scripts/dungeon-intel-evidence.mjs [url] [output-directory]
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5189/?concept=dungeon-intel';
const out = resolve(process.argv[3] ?? '/tmp/dungeon-intel-evidence');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BINARY || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1100 },
  });
  const errors = [];
  const requests = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('request', (request) => {
    if (
      request.method() !== 'GET' ||
      /GetDungeon|GetAtlas|GetView|GetDoors/.test(request.url())
    )
      requests.push({ method: request.method(), url: request.url() });
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page
    .getByRole('heading', { name: 'Individual dungeon knowledge' })
    .waitFor();
  const capture = async (name) => {
    await page.locator('[data-testid="intel-scene"] canvas').waitFor();
    // Asset decode and software-renderer frames need time after a snapshot swap.
    await page.waitForTimeout(2000);
    await page.screenshot({ path: resolve(out, `${name}.png`) });
  };
  // Development-only browser witness of actual displayed GLB materials.
  // Import the already-loaded Fiber module (including its Vite cache key),
  // not a second renderer instance. No scene or material is modified here.
  const readSentinel = () =>
    page.evaluate(async () => {
      const fiberUrl = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((name) => name.includes('/@react-three_fiber.js?'));
      if (!fiberUrl) throw new Error('Missing development Fiber module');
      const fiber = await import(fiberUrl);
      for (const root of fiber._roots.values()) {
        const mesh = root.store
          .getState()
          .scene.getObjectByName('Character_Skeleton_Soldier_01');
        if (!mesh) continue;
        if (Array.isArray(mesh.material))
          throw new Error('Unexpected sentinel material array');
        return {
          modelUuid: mesh.uuid,
          materialUuid: mesh.material.uuid,
          color: mesh.material.color.getHexString(),
          emissive: mesh.material.emissive.getHexString(),
          emissiveIntensity: mesh.material.emissiveIntensity,
          opacity: mesh.material.opacity,
          transparent: mesh.material.transparent,
        };
      }
      throw new Error('Supplied sentinel model was not rendered');
    });
  await capture('01-start-A');
  await page.getByRole('button', { name: 'Observer B', exact: true }).click();
  await page
    .getByText('Entry door · closed · current', { exact: true })
    .waitFor();
  await page.getByText('Current · Door closed', { exact: true }).waitFor();
  await capture('01-start-B');
  await page.getByRole('button', { name: 'Observer A', exact: true }).click();
  await page.getByRole('button', { name: '2 · A looks inside' }).click();
  await capture('02-look-A');
  await page.getByRole('button', { name: 'Observer B', exact: true }).click();
  await capture('03-obstructed-B');
  await page.getByRole('button', { name: 'Observer A', exact: true }).click();
  await page.waitForTimeout(500);
  const currentSentinel = await readSentinel();
  await page.getByRole('button', { name: '3 · A withdraws' }).click();
  await capture('04-memory-A');
  const rememberedSentinel = await readSentinel();
  await page.getByRole('button', { name: '5 · Unseen changes' }).click();
  await capture('05-unseen-A');
  await page.getByRole('button', { name: 'Observer B', exact: true }).click();
  await capture('06-changed-B');
  await page.getByRole('button', { name: 'Observer A', exact: true }).click();
  await page.getByRole('button', { name: '6 · A observes empty' }).click();
  await capture('07-empty-A');
  const restoredSentinel = await readSentinel();
  await page.getByRole('button', { name: '1 · Closed door' }).click();
  await capture('08-reset-A');
  await writeFile(
    resolve(out, 'browser.json'),
    JSON.stringify(
      {
        url,
        errors,
        requests,
        sentinelMaterial: {
          current: currentSentinel,
          remembered: rememberedSentinel,
          restored: restoredSentinel,
        },
        proof: 'Fixture rendering only; not authenticated server disclosure.',
      },
      null,
      2
    )
  );
  assert.notEqual(
    rememberedSentinel.color,
    currentSentinel.color,
    'Memory must have a different treatment'
  );
  assert.deepEqual(
    restoredSentinel,
    currentSentinel,
    'Re-observation must restore the same model/material, not leave a shadow or remount it'
  );
  // Existing App initialization, not this concept: retain these requests in
  // evidence instead of claiming that the whole page is network-free.
  const shellReads = [
    '/dnd5e.api.lobby.v1alpha1.LobbyService/GetMyActiveLobby',
    '/dnd5e.api.lobby.v1alpha1.LobbyService/StreamLobby',
    '/dnd5e.api.v1alpha1.CharacterService/ListRaces',
    '/dnd5e.api.v1alpha1.CharacterService/ListClasses',
    '/dnd5e.api.v1alpha1.CharacterService/ListBackgrounds',
  ];
  const unexpected = requests.filter(
    (request) => !shellReads.includes(new URL(request.url).pathname)
  );
  if (errors.length || unexpected.length)
    throw new Error(
      `Browser smoke: ${errors.length} errors, ${unexpected.length} unexpected RPC/mutation requests; see browser.json`
    );
  console.log(
    `Nine fixture screenshots; no console errors or dungeon/session RPCs. ${requests.length} existing app-shell reads recorded. Evidence: ${out}`
  );
} finally {
  await browser.close();
}
