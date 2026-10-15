// The Encounter Studio header never scrolls sideways (S5's law; the S7 QA
// finding on rpg-dnd5e-web#1285): Back, the title, the homes, the views and
// the Save group (Save local draft, Draft file, Open, Save & Play) fit the
// window. CSS geometry requires a real browser; jsdom measures every width
// as 0, so this is the proof, not a vitest case.
//
// Run against a served build with an API (any dev player works):
//   PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers \
//   node scripts/verify-studio-header-fit.mjs http://localhost:3087 evidence/header
//
// It opens the studio with no character picked (Save & Play shows its
// reason sentence), measures `.es-header` at each width, then aborts every
// API call and reloads, so the server is unreachable (the reason sentence
// and Retry server), and measures again. Each row must hold
// scrollWidth <= clientWidth for the header and for the page.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const [base, directory] = process.argv.slice(2);
assert.ok(
  base && directory,
  'Provide the served game URL and an evidence directory'
);
const output = resolve(directory);
await mkdir(output, { recursive: true });
const WIDTHS = [1024, 1152, 1280, 1366, 1440, 1600, 1920];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const results = [];
async function measure(state, prepare) {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
  });
  await prepare?.(page);
  await page.goto(`${base}/?playerId=local--studio-header-fit`, {
    waitUntil: 'load',
    timeout: 90000,
  });
  await page
    .getByRole('button', { name: 'Open Encounter Studio' })
    .click({ timeout: 60000 });
  await page
    .getByRole('region', { name: 'Encounter Studio workspace' })
    .waitFor({ timeout: 60000 });
  // The authoring gate settles once; the header's words depend on it.
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll('.es-save button')].some(
        (b) => b.title === 'Checking whether the server accepts saves…'
      ),
    null,
    { timeout: 30000 }
  );
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done))
        )
    );
    const row = await page.evaluate(() => {
      const header = document.querySelector('.es-header');
      const save = header.querySelector('.es-save');
      const labels = [...save.querySelectorAll('button')].map((b) =>
        b.textContent.trim()
      );
      return {
        header: [header.scrollWidth, header.clientWidth],
        page: [
          document.documentElement.scrollWidth,
          document.documentElement.clientWidth,
        ],
        headerHeight: Math.round(header.getBoundingClientRect().height),
        saveOnSecondRow:
          save.getBoundingClientRect().top >
          header.querySelector('.es-title').getBoundingClientRect().bottom,
        controls: labels,
      };
    });
    const ok = row.header[0] <= row.header[1] && row.page[0] <= row.page[1];
    results.push({ state, width, ok, ...row });
    await page.screenshot({
      path: `${output}/${state}-${width}.png`,
      clip: { x: 0, y: 0, width, height: Math.max(row.headerHeight, 60) + 10 },
    });
  }
  await page.close();
}

try {
  await measure('live-no-character');
  await measure('unreachable', (page) =>
    page.route(/\/(dnd5e|api)\.[^/]+\/[A-Za-z]+$/, (route) => route.abort())
  );
} finally {
  await browser.close();
}
await writeFile(`${output}/header-fit.json`, JSON.stringify(results, null, 2));
for (const r of results)
  console.log(
    `${r.ok ? 'ok  ' : 'FAIL'} ${r.state.padEnd(18)} ${String(r.width).padStart(4)}  header ${r.header.join('/')}  page ${r.page.join('/')}  height ${r.headerHeight}${r.saveOnSecondRow ? '  (Save group on row 2)' : ''}`
  );
assert.ok(
  results.every((r) => r.ok),
  'the studio header scrolls sideways at a measured width'
);
