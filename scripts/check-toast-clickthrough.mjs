// Isolated browser regression; does not open or mutate a live player session.
// Usage: node scripts/check-toast-clickthrough.mjs [dev-server origin]
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = process.argv[2] ?? 'http://127.0.0.1:3002';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN ?? '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 768 },
  });
  page.setDefaultTimeout(10000);
  await page.goto(`${origin}/?concept=desktop-hotbar&preview=1`);
  await page.locator('.organizedHudControls summary').click();
  await page
    .getByRole('button', { name: 'Preview hit toast', exact: true })
    .click();
  const notices = page.getByTestId('story-notices');
  await notices
    .getByRole('heading', { name: '9 Damage', exact: true })
    .waitFor();
  await page.locator('.organizedHudControls').evaluate((element) => {
    element.hidden = true;
  });
  await notices.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const target = document.createElement('button');
    target.id = 'toast-clickthrough-probe';
    target.textContent = 'Isolated map target';
    // Same stacking context as the toast, but deliberately beneath its z-index 5.
    Object.assign(target.style, {
      position: 'fixed',
      left: `${rect.x + 20}px`,
      top: `${rect.y + 30}px`,
      width: '80px',
      height: '40px',
      zIndex: '4',
    });
    target.addEventListener('click', () => {
      target.dataset.clicked = 'yes';
    });
    target.addEventListener('wheel', () => {
      target.dataset.wheeled = 'yes';
    });
    element.parentElement.append(target);
  });
  const target = page.locator('#toast-clickthrough-probe');
  const rect = await target.boundingBox();
  assert.ok(rect);
  await page.mouse.click(rect.x + 10, rect.y + 10);
  assert.equal(
    await target.getAttribute('data-clicked'),
    'yes',
    'toast swallowed map click'
  );
  await page.mouse.wheel(0, 30);
  await page.waitForFunction(
    () =>
      document
        .querySelector('#toast-clickthrough-probe')
        ?.getAttribute('data-wheeled') === 'yes'
  );
  assert.ok(
    await notices
      .getByRole('heading', { name: '9 Damage', exact: true })
      .isVisible()
  );
  console.log(
    'PASS: live toast presentation passes click and wheel to the target beneath it.'
  );
} finally {
  await browser.close();
}
