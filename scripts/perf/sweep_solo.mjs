// #537 perf sweep, solo-character stages: empty -> with walls -> +props.
// Drives the REAL rpg-dnd5e-web game route (Home -> select character ->
// Play -> Create lobby -> Ready up -> Start encounter -> live
// EncounterView), same flow as ~/tools/browser/drive_game_515.mjs.
//
// Methodology note: the perf probe (?perfProbe) is read via useMemo(...,[])
// in EncounterMap.tsx -- it only activates ONCE, at mount -- so each stage
// is captured by RELOADING the page with that stage's query params, not by
// mutating the query string live. This works because revealed-hex/wall
// state is server-side (GeometryRevealed/StreamEncounter snapshot), so a
// reload resumes the SAME encounter with whatever's already been revealed
// -- confirmed by this repo's "resume-after-refresh" (#444) convention.
//
// Usage: node sweep_solo.mjs <baseUrl> <playerId> <charName> <outDir>
import fs from 'node:fs';
import { chromium } from 'playwright';

const [baseUrl, playerId, charName, outDir] = process.argv.slice(2);
if (!baseUrl || !playerId || !charName || !outDir) {
  console.error(
    'usage: node sweep_solo.mjs <baseUrl> <playerId> <charName> <outDir>'
  );
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const results = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e)));
page.on('console', (m) => {
  const text = m.text();
  if (text.startsWith('PERF_PROBE_RESULT:')) {
    const result = JSON.parse(text.slice('PERF_PROBE_RESULT:'.length));
    console.log(
      `  -> captured stage "${result.label}": ${result.frameCount} frames, ` +
        `mean ${result.frameTimeMs.mean.toFixed(2)}ms, p95 ${result.frameTimeMs.p95.toFixed(2)}ms, ` +
        `calls mean ${result.rendererInfo.calls.mean.toFixed(1)}, triangles mean ${result.rendererInfo.triangles.mean.toFixed(0)}`
    );
    results.push(result);
  }
});

async function shot(name) {
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('saved', `${outDir}/${name}.png`);
}

console.log('Navigating to', `${baseUrl}/?playerId=${playerId}`);
await page.goto(`${baseUrl}/?playerId=${playerId}`, {
  waitUntil: 'load',
  timeout: 30000,
});
await page.waitForTimeout(1500);

console.log(`Selecting ${charName}...`);
await page
  .getByRole('button', { name: `Select character: ${charName}` })
  .click({ timeout: 15000 });
await page.waitForTimeout(500);
await page
  .getByRole('button', { name: 'Play', exact: true })
  .click({ timeout: 15000 });
await page.waitForTimeout(1000);

console.log('Creating lobby...');
const createBtn = page.getByRole('button', { name: /Create lobby/i });
if (await createBtn.count()) {
  await createBtn.click({ timeout: 15000 });
}
await page.waitForTimeout(1500);

console.log('Readying up...');
const readyBtn = page.getByRole('button', { name: /Ready up|Ready!/ });
await readyBtn.click({ timeout: 15000 });
await page.waitForTimeout(1000);

console.log('Starting encounter...');
const startBtn = page.getByTestId('start-encounter-button');
await startBtn.waitFor({ state: 'visible', timeout: 15000 });
await page.waitForTimeout(1000);
await startBtn.click({ timeout: 15000, force: true });

console.log('Waiting for encounter map...');
await page.waitForSelector('[data-testid="encounter-map"] canvas', {
  timeout: 30000,
});
await page.waitForTimeout(4000);
await shot('00-encounter-live');

const encounterUrl = new URL(page.url());

// --- Stage 1: empty (minimal reveal, right after Start) ---
console.log('\n=== Stage 1: empty ===');
const emptyUrl = new URL(encounterUrl);
emptyUrl.searchParams.set('perfProbe', '1');
emptyUrl.searchParams.set('perfProbeLabel', 'empty');
emptyUrl.searchParams.set('perfProbeMs', '8000');
await page.goto(emptyUrl.toString(), { waitUntil: 'load', timeout: 30000 });
await page.waitForSelector('[data-testid="encounter-map"] canvas', {
  timeout: 30000,
});
await page.waitForTimeout(9500);
await shot('01-empty');

// --- Reveal walls: click a few hexes to move the character around ---
console.log('\nMoving to reveal walls...');
const canvas = page.locator('[data-testid="encounter-map"] canvas');
const box = await canvas.boundingBox();
if (box) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const offsets = [
    [80, 0],
    [-160, 0],
    [0, 80],
    [0, -160],
    [120, 80],
  ];
  for (const [dx, dy] of offsets) {
    await page.mouse.click(cx + dx, cy + dy);
    await page.waitForTimeout(1500);
  }
}
await page.waitForTimeout(1500);
await shot('02-after-movement');

// --- Stage 2: with walls (reload to resume the now-more-revealed encounter) ---
console.log('\n=== Stage 2: with walls ===');
const wallsUrl = new URL(encounterUrl);
wallsUrl.searchParams.set('perfProbe', '1');
wallsUrl.searchParams.set('perfProbeLabel', 'walls');
wallsUrl.searchParams.set('perfProbeMs', '8000');
await page.goto(wallsUrl.toString(), { waitUntil: 'load', timeout: 30000 });
await page.waitForSelector('[data-testid="encounter-map"] canvas', {
  timeout: 30000,
});
await page.waitForTimeout(9500);
await shot('03-walls');

// --- Stage 3: +props (devPropDemoKeys on top of the same revealed room) ---
console.log('\n=== Stage 3: +props ===');
const propsUrl = new URL(encounterUrl);
propsUrl.searchParams.set('perfProbe', '1');
propsUrl.searchParams.set('perfProbeLabel', 'props');
propsUrl.searchParams.set('perfProbeMs', '8000');
propsUrl.searchParams.set(
  'devPropDemoKeys',
  'barrel,pillar,rock-pile,crate,tomb,barricade'
);
await page.goto(propsUrl.toString(), { waitUntil: 'load', timeout: 30000 });
await page.waitForSelector('[data-testid="encounter-map"] canvas', {
  timeout: 30000,
});
await page.waitForTimeout(9500);
await shot('04-props');

fs.writeFileSync(
  `${outDir}/solo-sweep-results.json`,
  JSON.stringify(results, null, 2)
);
console.log(
  `\nWrote ${outDir}/solo-sweep-results.json (${results.length} stage results)`
);

await browser.close();
