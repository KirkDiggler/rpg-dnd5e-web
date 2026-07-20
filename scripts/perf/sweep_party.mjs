// #537 perf sweep, "+4 characters" stage: creates 4 fresh, real,
// finalized characters (via mkchar_full.mjs, run as child processes so
// this script is self-contained and re-runnable end to end) and joins
// them into ONE real lobby (Home -> select character -> Play ->
// Create/Join lobby -> Ready up -> Start), landing all 4 in the same
// live EncounterView. Measures the perf probe from player 1 (the
// host)'s page once everyone has joined -- a cold-load pass (models
// still Suspense-loading) and a warm pass (second reload, everything
// cached) both, since the two look very different (see baseline doc).
//
// Usage: node sweep_party.mjs <baseUrl> <outDir> [playerIdPrefix]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const [baseUrl, outDir, prefixArg] = process.argv.slice(2);
if (!baseUrl || !outDir) {
  console.error(
    'usage: node sweep_party.mjs <baseUrl> <outDir> [playerIdPrefix]'
  );
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

// A fresh prefix every run avoids colliding with a previous run's
// player -- once a player has an active lobby/encounter, the real route
// auto-resumes into it instead of showing character selection, which
// would break this script's "select character -> Play" step.
const prefix = prefixArg || `sweep${Date.now().toString(36)}`;
const PLAYERS = [1, 2, 3, 4].map((n) => ({
  playerId: `${prefix}p${n}`,
  charName: `${prefix} Hero ${n}`,
}));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
console.log('Creating 4 fresh characters via mkchar_full.mjs...');
for (const { playerId, charName } of PLAYERS) {
  execFileSync(
    process.execPath,
    [path.join(__dirname, 'mkchar_full.mjs'), baseUrl, playerId, charName],
    { stdio: 'inherit' }
  );
}

const browser = await chromium.launch();
const contexts = [];
const pages = [];
for (const p of PLAYERS) {
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 900 },
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) =>
    console.log(`[${p.playerId}] PAGEERROR:`, String(e))
  );
  contexts.push(ctx);
  pages.push(page);
}

async function selectAndPlay(page, playerId, charName) {
  console.log(`[${playerId}] navigating...`);
  await page.goto(`${baseUrl}/?playerId=${playerId}`, {
    waitUntil: 'load',
    timeout: 30000,
  });
  await page.waitForTimeout(1500);
  await page
    .getByRole('button', { name: `Select character: ${charName}` })
    .click({ timeout: 15000 });
  await page.waitForTimeout(500);
  await page
    .getByRole('button', { name: 'Play', exact: true })
    .click({ timeout: 15000 });
  await page.waitForTimeout(1000);
}

// Player 1: create the lobby, grab the join code.
await selectAndPlay(pages[0], PLAYERS[0].playerId, PLAYERS[0].charName);
console.log('[host] creating lobby...');
await pages[0]
  .getByRole('button', { name: /Create lobby/i })
  .click({ timeout: 15000 });
await pages[0].waitForTimeout(1500);
const joinChipText = (
  await pages[0]
    .locator('[data-testid="join-code-display"]')
    .textContent({ timeout: 15000 })
).trim();
// The chip's full text is "Join code<code>Copy" -- pull out just the
// join_<uuid> token.
const joinCodeMatch = joinChipText.match(
  /join_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
);
if (!joinCodeMatch) {
  throw new Error(
    `could not parse join code out of chip text: ${joinChipText}`
  );
}
const joinCode = joinCodeMatch[0];
console.log('[host] join code:', joinCode);
await pages[0].screenshot({ path: `${outDir}/party-00-host-lobby.png` });

// Players 2-4: select their character, then join via the code.
for (let i = 1; i < PLAYERS.length; i++) {
  const { playerId, charName } = PLAYERS[i];
  await selectAndPlay(pages[i], playerId, charName);
  console.log(`[${playerId}] joining lobby with code ${joinCode}...`);
  await pages[i].fill('input[aria-label="join code"]', joinCode);
  await pages[i]
    .getByRole('button', { name: /^Join$/i })
    .click({ timeout: 15000 });
  await pages[i].waitForTimeout(1500);
}

await pages[0].screenshot({ path: `${outDir}/party-01-roster-full.png` });

// Everyone readies up.
for (let i = 0; i < PLAYERS.length; i++) {
  const { playerId } = PLAYERS[i];
  console.log(`[${playerId}] ready up...`);
  await pages[i]
    .getByRole('button', { name: /Ready up|Ready!/ })
    .click({ timeout: 15000 });
  await pages[i].waitForTimeout(800);
}
await pages[0].waitForTimeout(1500);
await pages[0].screenshot({ path: `${outDir}/party-02-all-ready.png` });

// Host starts the encounter.
console.log('[host] starting encounter...');
const startBtn = pages[0].getByTestId('start-encounter-button');
await startBtn.waitFor({ state: 'visible', timeout: 15000 });
await pages[0].waitForTimeout(1000);
await startBtn.click({ timeout: 15000, force: true });

for (let i = 0; i < pages.length; i++) {
  try {
    await pages[i].waitForSelector('[data-testid="encounter-map"] canvas', {
      timeout: 20000,
    });
    console.log(`[${PLAYERS[i].playerId}] reached encounter map`);
  } catch (e) {
    console.log(
      `[${PLAYERS[i].playerId}] FAILED to reach encounter map:`,
      String(e).slice(0, 150)
    );
    await pages[i].screenshot({
      path: `${outDir}/party-debug-p${i + 1}-stuck.png`,
      fullPage: true,
    });
    const btns = await pages[i].locator('button').allTextContents();
    console.log(
      `[${PLAYERS[i].playerId}] buttons:`,
      JSON.stringify(btns).slice(0, 500)
    );
  }
}
await pages[0].waitForTimeout(5000);
for (let i = 0; i < pages.length; i++) {
  await pages[i].screenshot({
    path: `${outDir}/party-03-live-p${i + 1}.png`,
  });
}
console.log('All 4 players in the live encounter.');

// Measure from the host's page: reload with the probe flag (same
// resume-after-refresh pattern as sweep_solo.mjs).
const results = [];
pages[0].on('console', (m) => {
  const text = m.text();
  if (text.startsWith('PERF_PROBE_RESULT:')) {
    const result = JSON.parse(text.slice('PERF_PROBE_RESULT:'.length));
    console.log(
      `  -> captured "${result.label}": ${result.frameCount} frames, mean ${result.frameTimeMs.mean.toFixed(2)}ms, ` +
        `p95 ${result.frameTimeMs.p95.toFixed(2)}ms, calls mean ${result.rendererInfo.calls.mean.toFixed(1)}, ` +
        `triangles mean ${result.rendererInfo.triangles.mean.toFixed(0)}`
    );
    results.push(result);
  }
});
const encounterUrl = new URL(pages[0].url());

// Cold-load pass: all 4 GLB character models + baked-in weapons/textures
// mount fresh on this reload, so a chunk of the window is spent in
// Suspense before the canvas has anything new to paint -- expect a low
// frame count with a huge mean (the "loading spike" itself is the
// finding). windowMs is longer here specifically to still catch a
// handful of real frames once everything resolves.
encounterUrl.searchParams.set('perfProbe', '1');
encounterUrl.searchParams.set('perfProbeLabel', 'four-characters-cold');
encounterUrl.searchParams.set('perfProbeMs', '15000');
console.log('\n=== Stage: +4 characters (cold load) ===');
await pages[0].goto(encounterUrl.toString(), {
  waitUntil: 'load',
  timeout: 30000,
});
await pages[0].waitForSelector('[data-testid="encounter-map"] canvas', {
  timeout: 30000,
});
await pages[0].waitForTimeout(16000);
await pages[0].screenshot({ path: `${outDir}/party-04-four-characters.png` });

// Warm pass: everything's now in the browser's HTTP cache and the
// renderer/scene has already been built once this session -- reload
// again for a steady-state reading uninflated by the cold-load stall.
encounterUrl.searchParams.set('perfProbeLabel', 'four-characters-warm');
encounterUrl.searchParams.set('perfProbeMs', '8000');
console.log('\n=== Stage: +4 characters (warm) ===');
await pages[0].goto(encounterUrl.toString(), {
  waitUntil: 'load',
  timeout: 30000,
});
await pages[0].waitForSelector('[data-testid="encounter-map"] canvas', {
  timeout: 30000,
});
await pages[0].waitForTimeout(9500);
await pages[0].screenshot({
  path: `${outDir}/party-05-four-characters-warm.png`,
});

fs.writeFileSync(
  `${outDir}/party-sweep-results.json`,
  JSON.stringify(results, null, 2)
);
console.log(
  `\nWrote ${outDir}/party-sweep-results.json (${results.length} stage results)`
);

await browser.close();
