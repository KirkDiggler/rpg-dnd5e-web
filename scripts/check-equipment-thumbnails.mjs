// Isolated fixture proof: no live session is opened or mutated.
// Usage: node scripts/check-equipment-thumbnails.mjs [dev-server origin]
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const origin = process.argv[2] ?? 'http://127.0.0.1:5195';
const evidence = process.env.EVIDENCE_DIR ?? '/tmp/equipment-thumbnail-size';
mkdirSync(evidence, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN ?? '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [1280, 800, 601, 640, 700, 701, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/?concept=equipment&thumbnailPreview=1`, {
      waitUntil: 'networkidle',
    });
    await page.waitForFunction(() => {
      const images = [
        ...document.querySelectorAll('.equip-socket-icon, .equip-inv-icon'),
      ];
      return (
        images.length >= 5 && images.every((image) => image.naturalWidth > 0)
      );
    });
    const panel = page.getByTestId('equipment-popover');
    await page.screenshot({
      path: path.join(evidence, `${width}.png`),
      fullPage: true,
    });
    const metrics = await panel.evaluate((element) => ({
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
      images: [...element.querySelectorAll('img')].map((image) => ({
        kind: image.className,
        width: image.getBoundingClientRect().width,
        height: image.getBoundingClientRect().height,
        fit: getComputedStyle(image).objectFit,
      })),
      overlaps: [
        ...element.querySelectorAll('.equip-socket, .equip-inv-row'),
      ].flatMap((row) => {
        const image = row.querySelector('img');
        const name = row.querySelector('.equip-socket-name, .equip-inv-name');
        if (!image || !name) return [];
        const a = image.getBoundingClientRect();
        const b = name.getBoundingClientRect();
        return a.right > b.left + 1 || name.scrollWidth > name.clientWidth + 1
          ? [name.textContent]
          : [];
      }),
    }));
    console.log(width, JSON.stringify(metrics));
    for (const image of metrics.images) {
      const expected =
        image.kind === 'equip-socket-icon' && width > 700 ? 160 : 128;
      assert.equal(image.width, expected, `${image.kind} width at ${width}`);
      assert.equal(image.height, expected, `${image.kind} height at ${width}`);
      assert.equal(image.fit, 'contain', 'do not crop blades or handles');
    }
    assert.ok(
      metrics.scrollWidth <= metrics.width + 1,
      'panel horizontally overflows'
    );
    assert.deepEqual(
      metrics.overlaps,
      [],
      'images/text must not overlap or clip'
    );
    await page.getByTestId('inv-dnd5e:item:greatsword').click();
    await page.waitForFunction(
      () =>
        document.querySelector(
          '[data-testid="equip-socket-main_hand"] .equip-socket-name'
        )?.textContent === 'Greatsword'
    );
    await page.getByTestId('equip-socket-main_hand').click();
    await page.getByTestId('inv-dnd5e:item:greatsword').waitFor();
  }
  const vendorSize = await page.evaluate(() => {
    const image = document.createElement('img');
    image.className = 'equip-inv-icon';
    image.style.visibility = 'hidden';
    document.body.append(image);
    const size = getComputedStyle(image).width;
    image.remove();
    return size;
  });
  assert.equal(
    vendorSize,
    '26px',
    'shared vendor icon sizing must remain unchanged'
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS: larger contained thumbnails, no overlap, fixture equip/unequip and unchanged shared vendor sizing.'
  );
} finally {
  await browser.close();
}
