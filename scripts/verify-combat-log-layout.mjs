// Run against a served desktop-hotbar concept (preview=1) or a live encounter:
// CHROMIUM_PATH=/usr/bin/google-chrome node scripts/verify-combat-log-layout.mjs \
//   'http://localhost:3042/?concept=desktop-hotbar&preview=1' evidence/log-layout
// CSS geometry requires a real browser; jsdom's structural guard is not this proof.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const [url, directory] = process.argv.slice(2);
assert.ok(
  url && directory,
  'Provide the served game URL and an evidence directory'
);
const output = resolve(directory);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const results = [];
const panel = page.getByTestId('session-combat-log');
const dock = page.locator('[data-desktop-dock]');
const settle = () =>
  page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done))
      )
  );
async function expand() {
  const button = page.getByRole('button', { name: 'Expand combat log' });
  if (await button.isVisible()) await button.click();
  await page.getByRole('button', { name: 'Collapse combat log' }).waitFor();
}
try {
  await page.goto(url);
  await dock.waitFor();
  await page.locator('canvas').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const canvas = await page.locator('canvas').elementHandle();
  for (const [width, height] of [
    [1440, 900],
    [1000, 501],
  ]) {
    await page.setViewportSize({ width, height });
    await dock.waitFor();
    for (const mode of ['Story', 'Debug', 'Wide debug']) {
      await expand();
      await panel
        .getByRole('button', {
          name: mode === 'Story' ? 'Story' : 'Debug',
          exact: true,
        })
        .click();
      if (mode !== 'Story') {
        const resize = panel.getByRole('button', {
          name:
            mode === 'Wide debug' ? 'Widen debug panel' : 'Narrow debug panel',
        });
        if (await resize.isVisible()) await resize.click();
        const closedDetails = panel
          .locator('details:not([open]) > summary')
          .first();
        if (await closedDetails.count()) await closedDetails.click();
      }
      const cycle = [];
      for (const rows of [1, 2, 3, 4, 1]) {
        await page
          .getByRole('combobox', { name: 'Hotbar rows' })
          .selectOption(String(rows));
        await settle();
        const logBox = await panel.boundingBox();
        const barBox = await dock.boundingBox();
        const band = await page
          .getByTestId('combat-experience-shell')
          .evaluate((el) =>
            parseFloat(getComputedStyle(el).gridTemplateRows.split(' ')[1])
          );
        assert.ok(
          logBox.y + logBox.height <= barBox.y + 1,
          `${width}x${height} ${mode} rows${rows}: log covers bar (${JSON.stringify({ logBox, barBox })})`
        );
        assert.ok(
          Math.abs(logBox.height - band) < 1,
          'Log must use the entire remaining grid band'
        );
        assert.ok(
          logBox.x >= 0 &&
            logBox.y >= 0 &&
            logBox.x + logBox.width <= width + 1 &&
            logBox.y + logBox.height <= height + 1,
          'Log outside viewport'
        );
        assert.ok(
          Math.abs(logBox.x + logBox.width - barBox.x - barBox.width) < 1,
          'Log must stay aligned with the right edge of the bar'
        );
        for (const part of ['header', 'footer']) {
          const box = await panel.locator(`:scope > ${part}`).boundingBox();
          assert.ok(
            box &&
              box.y >= logBox.y - 1 &&
              box.y + box.height <= logBox.y + logBox.height + 1,
            `${part} clipped`
          );
        }
        const feed = page.getByTestId('session-combat-log-scroll');
        const scroll = await feed.evaluate((el) => ({
          top: el.scrollTop,
          max: el.scrollHeight - el.clientHeight,
        }));
        if (scroll.max > 2) {
          await feed.hover();
          await page.mouse.wheel(0, scroll.top > 1 ? -400 : 400);
          await page.waitForFunction(
            ({ el, top }) => Math.abs(el.scrollTop - top) > 1,
            { el: await feed.elementHandle(), top: scroll.top }
          );
        }
        const result = {
          width,
          height,
          mode,
          rows,
          logBox,
          barBox,
          band,
          scrollable: scroll.max > 2,
        };
        cycle.push(result);
        results.push(result);
        if (rows === 4)
          await page.screenshot({
            path: `${output}/${width}x${height}-${mode.replaceAll(' ', '-')}-rows4.png`,
          });
      }
      assert.ok(
        cycle[3].barBox.height > cycle[0].barBox.height,
        'Four rows must exercise a taller bar'
      );
      assert.ok(
        cycle[3].logBox.height < cycle[0].logBox.height,
        'Log must shrink with the growing bar'
      );
      assert.ok(
        Math.abs(cycle[4].logBox.height - cycle[0].logBox.height) < 1,
        'Log must grow back when rows shrink'
      );
      assert.ok(
        cycle.every(
          (entry) => Math.abs(entry.barBox.width - cycle[0].barBox.width) < 1
        ),
        'Bar width must stay constant as rows change'
      );
      const before = await dock.boundingBox();
      await page.getByRole('button', { name: 'Collapse combat log' }).click();
      await settle();
      const collapsed = await dock.boundingBox();
      assert.ok(
        before &&
          collapsed &&
          ['x', 'y', 'width', 'height'].every(
            (key) => Math.abs(collapsed[key] - before[key]) < 1
          ),
        'Collapsing log moved the bar'
      );
      await expand();
    }
  }
  await page.setViewportSize({ width: 393, height: 844 });
  await dock.waitFor({ state: 'detached' });
  await expand();
  await page.screenshot({ path: `${output}/compact.png` });
  await page.setViewportSize({ width: 1440, height: 900 });
  await dock.waitFor();
  await settle();
  const logBox = await panel.boundingBox(),
    barBox = await dock.boundingBox();
  const responsiveReturn = logBox.y + logBox.height <= barBox.y + 1;
  const canvasPreserved = await canvas.evaluate(
    (el) => el === document.querySelector('canvas')
  );
  assert.ok(responsiveReturn, 'Returning to desktop loses clearance');
  assert.ok(canvasPreserved, 'Canvas was remounted');
  const scrollableModes = [
    ...new Set(
      results.filter((entry) => entry.scrollable).map((entry) => entry.mode)
    ),
  ];
  assert.deepEqual(
    new Set(scrollableModes),
    new Set(['Story', 'Debug', 'Wide debug']),
    'Each log mode must exercise real wheel scrolling'
  );
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      {
        url,
        results,
        responsiveReturn,
        canvasPreserved,
        scrollableModes,
        errors,
      },
      null,
      2
    )
  );
  console.log(
    `PASS: ${results.length} Story/Debug/wide layouts, dynamic1–4 rows, real scrolling, collapse/reopen and responsive canvas retention`
  );
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  await browser.close();
}
