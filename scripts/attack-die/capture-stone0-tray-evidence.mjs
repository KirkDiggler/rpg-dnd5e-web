#!/usr/bin/env node
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

async function bundleTsModule(path) {
  const bundled = await build({
    entryPoints: [resolve(path)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    write: false,
  });
  const source = bundled.outputFiles[0]?.text;
  if (!source) throw Error(`failed to bundle TypeScript module: ${path}`);
  return import(
    `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  );
}

const [manifestModule, frozenEvidenceModule, stone0ProtocolModule] =
  await Promise.all([
    bundleTsModule('src/components/ui/dice/diceRuntimeManifest.ts'),
    bundleTsModule('scripts/attack-die/evidenceProtocol.ts'),
    bundleTsModule('scripts/attack-die/stone0TrayEvidenceProtocol.ts'),
  ]);
const { parseDiceRuntimeManifest } = manifestModule;
const { assertSameManifest, validateServedBuild } = frozenEvidenceModule;
const {
  ORIGINAL_D20_GLB_PATH,
  ORIGINAL_D20_GLB_SHA256,
  ORIGINAL_D20_MANIFEST_PATH,
  ORIGINAL_D20_PRESET_ID,
  ORIGINAL_D20_SIZE_BYTES,
  STONE0_SCENARIO_IDS,
  assertStone0TrayEvidence,
  stone0ResultScreenshot,
  stone0ScenarioScreenshot,
} = stone0ProtocolModule;

const argv = process.argv.slice(2);
const option = (name) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};
const url = option('--url');
const outputRoot = option('--out');
const buildManifestPath = option('--build-manifest');
const sourceSha = option('--source-sha');
if (!url || !outputRoot || !buildManifestPath || !sourceSha)
  throw Error('--url, --out, --build-manifest, and --source-sha are required');
if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw Error('invalid exact source SHA');

const out = resolve(outputRoot);
const manifestPath = resolve(buildManifestPath);
const browserEvidencePath = resolve(out, 'browser-evidence.json');
const networkPath = resolve(out, 'network.json');
const consolePath = resolve(out, 'console.json');
for (const path of [browserEvidencePath, networkPath, consolePath])
  await readFile(path).then(
    () => {
      throw Error(`refusing stale Stone 0 evidence file: ${path}`);
    },
    (error) => {
      if (error?.code !== 'ENOENT') throw error;
    }
  );
await mkdir(out, { recursive: true });

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const buildManifestBytes = await readFile(manifestPath);
const buildManifestSha256 = sha256(buildManifestBytes);
const buildManifest = JSON.parse(buildManifestBytes.toString('utf8'));
const baseUrl = new URL(url);
const servedFiles = new Map();
await validateServedBuild(buildManifest, async (path) => {
  const response = await fetch(new URL(`/${path}`, baseUrl));
  if (!response.ok) throw Error(`served build path failed: ${path}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  servedFiles.set(path, bytes);
  return bytes;
});
const servedManifestResponse = await fetch(
  new URL('/__attack-die-build-manifest.json', baseUrl)
);
if (!servedManifestResponse.ok) throw Error('served build manifest failed');
assertSameManifest(buildManifest, await servedManifestResponse.json());
if (
  ![...servedFiles.values()].some((bytes) =>
    new TextDecoder('utf-8', { fatal: false }).decode(bytes).includes(sourceSha)
  )
)
  throw Error('exact source SHA is not embedded in the frozen build');

const providerManifestUrl = new URL(ORIGINAL_D20_MANIFEST_PATH, baseUrl);
const providerManifestResponse = await fetch(providerManifestUrl);
if (!providerManifestResponse.ok)
  throw Error('baseline provider manifest failed');
const providerManifestBytes = new Uint8Array(
  await providerManifestResponse.arrayBuffer()
);
const providerManifestSha256 = sha256(providerManifestBytes);
let providerManifestValue;
try {
  providerManifestValue = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(providerManifestBytes)
  );
} catch (error) {
  throw Error(`baseline provider manifest JSON failed: ${error.message}`);
}
const parsedProvider = parseDiceRuntimeManifest(providerManifestValue);
if (!parsedProvider.ok)
  throw Error(`baseline provider manifest invalid: ${parsedProvider.reason}`);
const originalPreset = parsedProvider.manifest.presets.find(
  (preset) => preset.presetId === ORIGINAL_D20_PRESET_ID
);
if (!originalPreset) throw Error('Original carved d20 preset missing');
if (
  originalPreset.model.path !==
    ORIGINAL_D20_GLB_PATH.split('/').slice(3).join('/') ||
  originalPreset.model.sha256 !== ORIGINAL_D20_GLB_SHA256 ||
  originalPreset.model.sizeBytes !== ORIGINAL_D20_SIZE_BYTES ||
  originalPreset.faceSettlementMap.supportedResults.length !== 20
)
  throw Error('Original carved d20 baseline identity mismatch');
const providerSourceManifestSha256 =
  parsedProvider.manifest.sourceManifestSha256;
const glbUrl = new URL(ORIGINAL_D20_GLB_PATH, baseUrl);
const glbResponse = await fetch(glbUrl);
if (!glbResponse.ok) throw Error('baseline Original carved d20 GLB failed');
const glbBytes = new Uint8Array(await glbResponse.arrayBuffer());
if (
  glbBytes.byteLength !== ORIGINAL_D20_SIZE_BYTES ||
  sha256(glbBytes) !== ORIGINAL_D20_GLB_SHA256
)
  throw Error('baseline Original carved d20 GLB hash/size mismatch');

const incompleteManifest = structuredClone(providerManifestValue);
const incompletePreset = incompleteManifest.presets.find(
  (preset) => preset.presetId === ORIGINAL_D20_PRESET_ID
);
delete incompletePreset.faceSettlementMap.entries['20'];
if (parseDiceRuntimeManifest(incompleteManifest).ok)
  throw Error('incomplete face map mutation did not fail manifest parsing');
const invalidGeometryManifest = structuredClone(providerManifestValue);
const invalidGeometryPreset = invalidGeometryManifest.presets.find(
  (preset) => preset.presetId === ORIGINAL_D20_PRESET_ID
);
invalidGeometryPreset.model.geometry.numeralTriangleIndices[0] =
  invalidGeometryPreset.model.geometry.bodyTriangleIndices[0];
if (parseDiceRuntimeManifest(invalidGeometryManifest).ok)
  throw Error('invalid geometry mutation did not fail manifest parsing');
const hashMismatchGlb = glbBytes.slice();
hashMismatchGlb[0] ^= 0xff;
if (
  hashMismatchGlb.byteLength !== ORIGINAL_D20_SIZE_BYTES ||
  sha256(hashMismatchGlb) === ORIGINAL_D20_GLB_SHA256
)
  throw Error('GLB hash mutation fixture is not discriminating');

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
const networkContexts = [];
const consoleEntries = [];
const pageErrors = [];
const unexpectedErrors = [];
let nextContextOrdinal = 1;

const providerKind = (requestUrl) => {
  const pathname = new URL(requestUrl).pathname;
  if (pathname === ORIGINAL_D20_MANIFEST_PATH) return 'manifest';
  if (pathname === ORIGINAL_D20_GLB_PATH) return 'glb';
  return undefined;
};

function isExpectedConsole(id, text) {
  if (id === 'webgl-creation-failure')
    return /webgl|context|renderer/i.test(text);
  if (id === 'context-loss') return /context.*lost|webgl/i.test(text);
  if (id === 'shader-failure') return /shader/i.test(text);
  return false;
}

async function createScenarioPage({
  id,
  viewport = { width: 1440, height: 1080 },
  reducedMotion = 'no-preference',
  init,
  route,
}) {
  const ordinal = nextContextOrdinal++;
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    reducedMotion,
  });
  const page = await context.newPage();
  const record = {
    id,
    contextOrdinal: ordinal,
    viewport,
    requests: [],
    responses: [],
    provider: {
      manifestRequestCount: 0,
      manifestTransferCount: 0,
      glbRequestCount: 0,
      glbTransferCount: 0,
    },
    trayCanvasFirstObservedMs: null,
    glbResponseEndMs: null,
  };
  networkContexts.push(record);
  page.on('request', (request) => {
    const kind = providerKind(request.url());
    if (kind) record.provider[`${kind}RequestCount`] += 1;
    record.requests.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      providerKind: kind ?? null,
    });
  });
  page.on('response', (response) => {
    const kind = providerKind(response.url());
    if (kind && response.ok()) record.provider[`${kind}TransferCount`] += 1;
    record.responses.push({
      url: response.url(),
      status: response.status(),
      providerKind: kind ?? null,
      contentLength: response.headers()['content-length'] ?? null,
    });
  });
  page.on('console', (message) => {
    const entry = {
      id,
      contextOrdinal: ordinal,
      type: message.type(),
      text: message.text(),
      expected: isExpectedConsole(id, message.text()),
    };
    consoleEntries.push(entry);
    if (message.type() === 'error' && !entry.expected)
      unexpectedErrors.push(`console:${id}:${message.text()}`);
  });
  page.on('pageerror', (error) => {
    pageErrors.push({ id, contextOrdinal: ordinal, message: error.message });
    unexpectedErrors.push(`pageerror:${id}:${error.message}`);
  });
  await page.addInitScript(() => {
    window.__stone0TrayCanvasFirstObservedMs = null;
    const observe = () => {
      if (
        window.__stone0TrayCanvasFirstObservedMs === null &&
        document.querySelector(
          '[data-witness-role] canvas.attack-die-3d__canvas'
        )
      )
        window.__stone0TrayCanvasFirstObservedMs = performance.now();
    };
    new MutationObserver(observe).observe(document, {
      childList: true,
      subtree: true,
    });
    document.addEventListener('DOMContentLoaded', observe, { once: true });
  });
  if (init) await page.addInitScript(init);
  if (route) await route(page);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page
    .getByRole('heading', { name: 'Authoritative 3D Attack Die' })
    .waitFor({ timeout: 30_000 });
  return { context, page, record };
}

async function closeScenario(scenario) {
  const timing = await scenario.page.evaluate(
    ({ glb }) => {
      const resource = performance.getEntriesByName(glb)[0];
      return {
        canvas: window.__stone0TrayCanvasFirstObservedMs ?? null,
        glb:
          resource && 'responseEnd' in resource ? resource.responseEnd : null,
      };
    },
    { glb: glbUrl.href }
  );
  scenario.record.trayCanvasFirstObservedMs = timing.canvas;
  scenario.record.glbResponseEndMs = timing.glb;
  if (
    timing.canvas !== null &&
    timing.glb !== null &&
    timing.glb > timing.canvas
  )
    throw Error(
      `${scenario.record.id} mounted a Tray Canvas before GLB transfer completed`
    );
  await scenario.context.close();
}

async function selectTray(page) {
  await page.getByRole('tab', { name: 'Tray' }).click();
}

async function waitTrayReady(page) {
  await page
    .getByRole('heading', { name: 'Gameplay placement checkpoint' })
    .waitFor({ timeout: 30_000 });
  await page.waitForFunction(
    () =>
      window.__stone0TrayEvidence?.witnesses &&
      document.querySelectorAll('[data-witness-role]').length === 2,
    undefined,
    { timeout: 30_000 }
  );
}

async function setResult(page, result) {
  const input = page.getByLabel('Authoritative fixture result');
  await input.fill(String(result));
  await page.waitForFunction(
    (expected) =>
      window.__stone0TrayEvidence?.result === expected &&
      window.__stone0TrayEvidence.requestIdentity.endsWith(
        `:result:${expected}`
      ) &&
      window.__stone0TrayEvidence.eventCount === 1,
    result,
    { timeout: 10_000 }
  );
}

async function waitCanvases(page, count = 2) {
  await page.waitForFunction(
    (expected) =>
      document.querySelectorAll(
        '[data-witness-role] canvas.attack-die-3d__canvas'
      ).length === expected,
    count,
    { timeout: 30_000 }
  );
}

async function waitHealthy(page, result) {
  await page.waitForFunction(
    (expected) => {
      const bridge = window.__stone0TrayEvidence;
      if (!bridge || bridge.result !== expected) return false;
      return ['roller', 'spectator'].every((role) => {
        const telemetry = bridge.witnesses[role]?.telemetry;
        const rendererInfo = bridge.witnesses[role]?.rendererInfo;
        return (
          telemetry?.requestedResult === expected &&
          telemetry.renderer === '3d' &&
          telemetry.state === 'observed' &&
          telemetry.exactTargetHeld === true &&
          typeof telemetry.angularErrorDegrees === 'number' &&
          telemetry.angularErrorDegrees <= 0.25 &&
          Number.isSafeInteger(telemetry.runtimeSourceId) &&
          Number.isSafeInteger(telemetry.runtimeCloneId) &&
          Number.isSafeInteger(rendererInfo?.contextId)
        );
      });
    },
    result,
    { timeout: 15_000 }
  );
  await page.evaluate(() => new Promise(requestAnimationFrame));
  return page.evaluate(() => structuredClone(window.__stone0TrayEvidence));
}

function assertProviderOnce(record, label) {
  const counts = record.provider;
  for (const key of [
    'manifestRequestCount',
    'manifestTransferCount',
    'glbRequestCount',
    'glbTransferCount',
  ])
    if (counts[key] !== 1)
      throw Error(`${label} ${key} expected 1, received ${counts[key]}`);
}

function assertHealthyBridge(bridge, result, label) {
  if (
    !bridge ||
    bridge.result !== result ||
    bridge.presetId !== ORIGINAL_D20_PRESET_ID ||
    bridge.eventCount !== 2 ||
    !bridge.eventsFrozen
  )
    throw Error(`${label} bridge/request mismatch`);
  const roller = bridge.witnesses.roller;
  const spectator = bridge.witnesses.spectator;
  for (const [role, witness] of Object.entries({ roller, spectator })) {
    const telemetry = witness.telemetry;
    if (
      telemetry.requestedResult !== result ||
      telemetry.renderer !== '3d' ||
      telemetry.state !== 'observed' ||
      !telemetry.exactTargetHeld ||
      telemetry.angularErrorDegrees > 0.25 ||
      !Array.isArray(telemetry.mappedTarget) ||
      telemetry.mappedTarget.length !== 4
    )
      throw Error(`${label} ${role} settlement mismatch`);
  }
  if (
    roller.telemetry.presentationToken ===
      spectator.telemetry.presentationToken ||
    roller.rendererInfo.contextId === spectator.rendererInfo.contextId ||
    roller.telemetry.runtimeCloneId === spectator.telemetry.runtimeCloneId ||
    roller.telemetry.runtimeSourceId !== spectator.telemetry.runtimeSourceId
  )
    throw Error(`${label} witness ownership mismatch`);
  if (
    JSON.stringify(roller.telemetry.mappedTarget) !==
    JSON.stringify(spectator.telemetry.mappedTarget)
  )
    throw Error(`${label} witness target mismatch`);
}

async function startHealthyContext(id, result, options = {}) {
  const scenario = await createScenarioPage({ id, ...options });
  await selectTray(scenario.page);
  await waitTrayReady(scenario.page);
  await setResult(scenario.page, result);
  await waitCanvases(scenario.page);
  assertProviderOnce(scenario.record, id);
  return scenario;
}

async function runResultRelease(result, releaseKind) {
  const id = `result-${String(result).padStart(2, '0')}-${releaseKind}`;
  const scenario = await startHealthyContext(id, result);
  const { page } = scenario;
  if (releaseKind === 'roller-roll') {
    await page.getByRole('button', { name: 'Roll d20' }).click();
  } else if (releaseKind === 'decorative-gesture') {
    const grab = page
      .getByRole('complementary', { name: 'Roller dice drawer' })
      .getByRole('button', { name: 'Grab d20' });
    const box = await grab.boundingBox();
    if (!box) throw Error(`${id} grab target has no bounding box`);
    await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.55);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.25, {
      steps: 4,
    });
    await page.mouse.up();
  } else {
    await page.getByRole('radio', { name: 'Monster' }).click();
    await page.waitForFunction(
      (expected) =>
        window.__stone0TrayEvidence?.mode === 'monster' &&
        window.__stone0TrayEvidence.result === expected,
      result,
      { timeout: 10_000 }
    );
  }
  const bridge = await waitHealthy(page, result);
  assertHealthyBridge(bridge, result, id);
  if (releaseKind === 'roller-roll') {
    const screenshot = stone0ResultScreenshot(result);
    await page.screenshot({ path: resolve(out, screenshot), fullPage: true });
  }
  await closeScenario(scenario);
  return { bridge, record: scenario.record };
}

function witnessFact(bridge, role) {
  const witness = bridge.witnesses[role];
  return {
    generation: witness.telemetry.presentationToken,
    contextId: witness.rendererInfo.contextId,
    cloneId: `runtime-clone:${witness.telemetry.runtimeCloneId}`,
    requestedResult: witness.telemetry.requestedResult,
    renderer: '3d',
    angularErrorDegrees: witness.telemetry.angularErrorDegrees,
    exactTargetHeld: witness.telemetry.exactTargetHeld,
    targetQuaternion: witness.telemetry.mappedTarget,
  };
}

const results = [];
try {
  for (let result = 1; result <= 20; result += 1) {
    const roller = await runResultRelease(result, 'roller-roll');
    const decoration = await runResultRelease(result, 'decorative-gesture');
    const host = await runResultRelease(result, 'host-release');
    const rollerTarget = roller.bridge.witnesses.roller.telemetry.mappedTarget;
    const decorationTarget =
      decoration.bridge.witnesses.roller.telemetry.mappedTarget;
    const hostTarget = host.bridge.witnesses.roller.telemetry.mappedTarget;
    if (
      JSON.stringify(rollerTarget) !== JSON.stringify(decorationTarget) ||
      JSON.stringify(rollerTarget) !== JSON.stringify(hostTarget)
    )
      throw Error(
        `result ${result} target changed with release decoration/owner`
      );
    results.push({
      result,
      requestIdentity: roller.bridge.requestIdentity,
      presetId: ORIGINAL_D20_PRESET_ID,
      ...roller.record.provider,
      sharedEvents: true,
      sharedProvider: true,
      sourceSceneShared:
        roller.bridge.witnesses.roller.telemetry.runtimeSourceId ===
        roller.bridge.witnesses.spectator.telemetry.runtimeSourceId,
      clonesDistinct:
        roller.bridge.witnesses.roller.telemetry.runtimeCloneId !==
        roller.bridge.witnesses.spectator.telemetry.runtimeCloneId,
      roller: witnessFact(roller.bridge, 'roller'),
      spectator: witnessFact(roller.bridge, 'spectator'),
      targetInvariance: {
        rollerRoll: rollerTarget,
        hostRelease: hostTarget,
        decorativeVariation: decorationTarget,
      },
      screenshot: stone0ResultScreenshot(result),
    });
  }

  const scenarios = [];
  const pushScenario = (id, viewport, facts) => {
    scenarios.push({
      id,
      screenshot: stone0ScenarioScreenshot(id),
      passed: true,
      viewport,
      facts,
    });
  };

  {
    let releaseManifest;
    const pending = new Promise((resolvePromise) => {
      releaseManifest = resolvePromise;
    });
    const scenario = await createScenarioPage({
      id: 'pending-provider',
      route: async (page) => {
        await page.route(providerManifestUrl.href, async (route) => {
          await pending;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: Buffer.from(providerManifestBytes),
          });
        });
      },
    });
    await selectTray(scenario.page);
    const status = scenario.page.getByTestId('dice-tray-provider-status');
    await status.waitFor();
    const text = await status.textContent();
    const trayMounted = await scenario.page
      .getByRole('heading', { name: 'Gameplay placement checkpoint' })
      .count();
    const canvasCount = await scenario.page
      .locator('[data-witness-role] canvas')
      .count();
    if (!/Loading Original carved d20 provider/.test(text ?? ''))
      throw Error('pending provider status mismatch');
    if (
      (text ?? '').includes('Result 10') ||
      trayMounted !== 0 ||
      canvasCount !== 0
    )
      throw Error('pending provider leaked result/tray/Canvas');
    await scenario.page.screenshot({
      path: resolve(out, stone0ScenarioScreenshot('pending-provider')),
      fullPage: true,
    });
    pushScenario(
      'pending-provider',
      { width: 1440, height: 1080 },
      {
        providerState: 'loading',
        resultVisible: false,
        trayMounted: false,
        canvasCount: 0,
      }
    );
    releaseManifest();
    await waitTrayReady(scenario.page);
    await closeScenario(scenario);
  }

  {
    const scenario = await startHealthyContext('player-armed', 10);
    await scenario.page.waitForTimeout(1000);
    const bridge = await scenario.page.evaluate(() =>
      structuredClone(window.__stone0TrayEvidence)
    );
    const faces = await scenario.page
      .locator('[data-witness-role] [data-testid="dice-face"]')
      .allTextContents();
    const rollerControl =
      (await scenario.page
        .getByRole('button', { name: 'Roll d20' })
        .count()) === 1;
    const spectatorControl =
      (await scenario.page
        .getByRole('complementary', { name: 'Spectator dice drawer' })
        .getByRole('button', { name: /d20/ })
        .count()) > 0;
    if (
      bridge.eventCount !== 1 ||
      faces.some((face) => face.trim() !== '?') ||
      !rollerControl ||
      spectatorControl
    )
      throw Error('player armed authority/concealment mismatch');
    await scenario.page.screenshot({
      path: resolve(out, stone0ScenarioScreenshot('player-armed')),
      fullPage: true,
    });
    pushScenario(
      'player-armed',
      { width: 1440, height: 1080 },
      {
        releaseAuthority: 'roller-only',
        rollerControl: true,
        spectatorControl: false,
        resultVisible: false,
        autoReleased: false,
      }
    );
    await closeScenario(scenario);
  }

  {
    const scenario = await startHealthyContext('monster-host-release', 10);
    await scenario.page.getByRole('radio', { name: 'Monster' }).click();
    const bridge = await waitHealthy(scenario.page, 10);
    assertHealthyBridge(bridge, 10, 'monster-host-release');
    const controls = await scenario.page
      .getByRole('button', { name: /d20/ })
      .count();
    if (bridge.mode !== 'monster' || bridge.eventCount !== 2 || controls !== 0)
      throw Error('Monster release authority mismatch');
    await scenario.page.screenshot({
      path: resolve(out, stone0ScenarioScreenshot('monster-host-release')),
      fullPage: true,
    });
    pushScenario(
      'monster-host-release',
      { width: 1440, height: 1080 },
      {
        releaseAuthority: 'fixture-host',
        consumerControlCount: 0,
        releaseCount: 1,
      }
    );
    await closeScenario(scenario);
  }

  {
    const scenario = await startHealthyContext('reduced-motion', 10, {
      reducedMotion: 'reduce',
    });
    await scenario.page.waitForTimeout(500);
    const before = await scenario.page.evaluate(() =>
      structuredClone(window.__stone0TrayEvidence)
    );
    if (
      before.eventCount !== 1 ||
      Object.values(before.witnesses).some(
        (witness) => witness.telemetry?.state === 'observed'
      )
    )
      throw Error('reduced motion released without explicit input');
    const started = Date.now();
    await scenario.page.getByRole('button', { name: 'Roll d20' }).click();
    const bridge = await waitHealthy(scenario.page, 10);
    if (Date.now() - started > 1200)
      throw Error('reduced motion performed a tumble-duration settlement');
    assertHealthyBridge(bridge, 10, 'reduced-motion');
    await scenario.page.screenshot({
      path: resolve(out, stone0ScenarioScreenshot('reduced-motion')),
      fullPage: true,
    });
    pushScenario(
      'reduced-motion',
      { width: 1440, height: 1080 },
      {
        explicitInputRequired: true,
        tumbleObserved: false,
        rollerExact: true,
        spectatorExact: true,
      }
    );
    await closeScenario(scenario);
  }

  for (const [id, width, height, layout] of [
    ['responsive-desktop', 1440, 1080, 'columns'],
    ['responsive-boundary-wide', 1241, 900, 'columns'],
    ['responsive-boundary-stacked', 1240, 900, 'stacked'],
    ['responsive-narrow', 760, 900, 'narrow-order'],
  ]) {
    const viewport = { width, height };
    const scenario = await startHealthyContext(id, 10, { viewport });
    const measured = await scenario.page.evaluate(() => {
      const rect = (selector) => {
        const value = document.querySelector(selector)?.getBoundingClientRect();
        return value
          ? {
              left: value.left,
              right: value.right,
              top: value.top,
              bottom: value.bottom,
              width: value.width,
              height: value.height,
            }
          : null;
      };
      const drawers = [...document.querySelectorAll('[data-witness-role]')].map(
        (value) => {
          const box = value.getBoundingClientRect();
          return {
            role: value.getAttribute('data-witness-role'),
            left: box.left,
            right: box.right,
            top: box.top,
            bottom: box.bottom,
          };
        }
      );
      return {
        innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        drawers,
        map: rect('[data-testid="dice-tray-neutral-map"]'),
        log: rect('[data-testid="floating-log"]'),
        dock: rect('[data-testid="encounter-dock"]'),
      };
    });
    const [roller, spectator] = measured.drawers;
    const contained = measured.drawers.every(
      (drawer) => drawer.left >= 0 && drawer.right <= measured.innerWidth
    );
    const horizontalOverflow = measured.scrollWidth > measured.innerWidth;
    const drawerOverlap = !(
      roller.right <= spectator.left ||
      spectator.right <= roller.left ||
      roller.bottom <= spectator.top ||
      spectator.bottom <= roller.top
    );
    const observedLayout =
      Math.abs(roller.top - spectator.top) < 2
        ? 'columns'
        : width <= 760
          ? 'narrow-order'
          : 'stacked';
    if (
      observedLayout !== layout ||
      !contained ||
      horizontalOverflow ||
      drawerOverlap ||
      !measured.map ||
      !measured.log ||
      !measured.dock
    )
      throw Error(`${id} responsive containment/layout mismatch`);
    await scenario.page.screenshot({
      path: resolve(out, stone0ScenarioScreenshot(id)),
      fullPage: true,
    });
    pushScenario(id, viewport, {
      layout,
      contained: true,
      horizontalOverflow: false,
      overlap: false,
    });
    await closeScenario(scenario);
  }

  const failureConfiguration = {
    'missing-manifest': {
      origin: 'manifest-fetch',
      providerMutation: true,
      parseBeforeModel: false,
      route: async (page) => {
        await page.route(providerManifestUrl.href, (route) =>
          route.fulfill({
            status: 404,
            contentType: 'text/plain',
            body: 'missing',
          })
        );
      },
    },
    'incomplete-face-map': {
      origin: 'manifest-parse',
      providerMutation: true,
      parseBeforeModel: true,
      route: async (page) => {
        await page.route(providerManifestUrl.href, (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(incompleteManifest),
          })
        );
      },
    },
    'malformed-manifest': {
      origin: 'manifest-parse',
      providerMutation: true,
      parseBeforeModel: true,
      route: async (page) => {
        await page.route(providerManifestUrl.href, (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: '{"contract":',
          })
        );
      },
    },
    'glb-hash-mismatch': {
      origin: 'model-hash',
      providerMutation: true,
      parseBeforeModel: false,
      route: async (page) => {
        await page.route(glbUrl.href, (route) =>
          route.fulfill({
            status: 200,
            contentType: 'model/gltf-binary',
            body: Buffer.from(hashMismatchGlb),
          })
        );
      },
    },
    'invalid-geometry-partition': {
      origin: 'manifest-parse',
      providerMutation: true,
      parseBeforeModel: true,
      route: async (page) => {
        await page.route(providerManifestUrl.href, (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(invalidGeometryManifest),
          })
        );
      },
    },
    'unknown-safe-preset': {
      origin: 'synthetic-renderer-only',
      providerMutation: false,
      parseBeforeModel: false,
      exercise: 'unknown-safe-preset',
    },
    'unmapped-result': {
      origin: 'synthetic-renderer-only',
      providerMutation: false,
      parseBeforeModel: false,
      exercise: 'unmapped-result',
    },
    'webgl-creation-failure': {
      origin: 'webgl',
      providerMutation: false,
      parseBeforeModel: false,
      init: () => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
          if (kind === 'webgl' || kind === 'webgl2') return null;
          return original.call(this, kind, ...rest);
        };
      },
    },
    'shader-failure': {
      origin: 'shader',
      providerMutation: false,
      parseBeforeModel: false,
      exercise: 'shader-failure',
    },
  };

  async function proveFailure(id, configuration) {
    const scenario = await createScenarioPage({
      id,
      init: configuration.init,
      route: configuration.route,
    });
    await selectTray(scenario.page);
    await waitTrayReady(scenario.page);
    if (configuration.exercise)
      await scenario.page
        .getByLabel('Evidence-only renderer exercise')
        .selectOption(configuration.exercise);
    await scenario.page.waitForFunction(
      (syntheticUnknown) => {
        const bridge = window.__stone0TrayEvidence;
        if (!bridge) return false;
        if (syntheticUnknown)
          return bridge.presetId === 'stone0.unknown.safe.d20';
        return ['roller', 'spectator'].every(
          (role) => bridge.witnesses[role]?.telemetry?.state === 'failed'
        );
      },
      id === 'unknown-safe-preset',
      { timeout: 30_000 }
    );
    const beforeFaces = await scenario.page
      .locator('[data-witness-role] [data-testid="dice-face"]')
      .allTextContents();
    const rollerControl =
      (await scenario.page
        .getByRole('button', { name: 'Roll d20' })
        .count()) === 1;
    const spectatorAuthority =
      (await scenario.page
        .getByRole('complementary', { name: 'Spectator dice drawer' })
        .getByRole('button', { name: /d20/ })
        .count()) > 0;
    if (
      beforeFaces.some((face) => face.trim() !== '?') ||
      !rollerControl ||
      spectatorAuthority
    )
      throw Error(`${id} armed failure authority/concealment mismatch`);
    const canvasCount = await scenario.page
      .locator('[data-witness-role] canvas.attack-die-3d__canvas')
      .count();
    await scenario.page.getByRole('button', { name: 'Roll d20' }).click();
    await scenario.page.waitForFunction(
      () =>
        [
          ...document.querySelectorAll(
            '[data-witness-role] [data-testid="dice-face"]'
          ),
        ].every((face) => face.textContent?.trim() === '10'),
      undefined,
      { timeout: 10_000 }
    );
    const rollerStatus = await scenario.page
      .getByRole('complementary', { name: 'Roller dice drawer' })
      .getByRole('status')
      .textContent();
    if (!/truthful SVG settled/i.test(rollerStatus ?? ''))
      throw Error(`${id} did not converge to truthful Roller SVG`);
    await scenario.page.screenshot({
      path: resolve(out, stone0ScenarioScreenshot(id)),
      fullPage: true,
    });
    const modelRequestCount = scenario.record.provider.glbRequestCount;
    if (configuration.parseBeforeModel && modelRequestCount !== 0)
      throw Error(`${id} reached model I/O before manifest rejection`);
    pushScenario(
      id,
      { width: 1440, height: 1080 },
      {
        failureOrigin: configuration.origin,
        providerMutation: configuration.providerMutation,
        manifestParseFailedBeforeModel: configuration.parseBeforeModel,
        modelRequestCount,
        canvasCount,
        armedResultVisible: false,
        releasedSvgTruth: true,
        rollerControlPreserved: true,
        spectatorAuthority: false,
      }
    );
    await closeScenario(scenario);
  }

  for (const id of [
    'missing-manifest',
    'incomplete-face-map',
    'malformed-manifest',
    'glb-hash-mismatch',
    'invalid-geometry-partition',
    'unknown-safe-preset',
    'unmapped-result',
    'webgl-creation-failure',
    'shader-failure',
  ])
    await proveFailure(id, failureConfiguration[id]);

  {
    const id = 'context-loss';
    const scenario = await startHealthyContext(id, 10);
    const lost = await scenario.page.evaluate(() => {
      const canvas = document.querySelector(
        '[data-witness-role="roller"] canvas.attack-die-3d__canvas'
      );
      if (!(canvas instanceof HTMLCanvasElement)) return false;
      const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      const extension = context?.getExtension('WEBGL_lose_context');
      if (!extension) return false;
      extension.loseContext();
      return true;
    });
    if (!lost) throw Error('real WEBGL_lose_context was unavailable');
    await scenario.page.waitForFunction(
      () =>
        window.__stone0TrayEvidence?.witnesses.roller.telemetry?.state ===
        'failed',
      undefined,
      { timeout: 10_000 }
    );
    const beforeFaces = await scenario.page
      .locator('[data-witness-role] [data-testid="dice-face"]')
      .allTextContents();
    const canvasCount = await scenario.page
      .locator('[data-witness-role] canvas.attack-die-3d__canvas')
      .count();
    if (beforeFaces.some((face) => face.trim() !== '?') || canvasCount !== 1)
      throw Error('context loss did not isolate/conceal the failed witness');
    await scenario.page.getByRole('button', { name: 'Roll d20' }).click();
    await scenario.page.waitForFunction(
      () =>
        [
          ...document.querySelectorAll(
            '[data-witness-role] [data-testid="dice-face"]'
          ),
        ].every((face) => face.textContent?.trim() === '10'),
      undefined,
      { timeout: 15_000 }
    );
    const rollerStatus = await scenario.page
      .getByRole('complementary', { name: 'Roller dice drawer' })
      .getByRole('status')
      .textContent();
    if (!/truthful SVG settled/i.test(rollerStatus ?? ''))
      throw Error('context loss Roller did not converge to truthful SVG');
    await scenario.page.screenshot({
      path: resolve(out, stone0ScenarioScreenshot(id)),
      fullPage: true,
    });
    pushScenario(
      id,
      { width: 1440, height: 1080 },
      {
        failureOrigin: 'webgl-context-loss',
        providerMutation: false,
        manifestParseFailedBeforeModel: false,
        modelRequestCount: scenario.record.provider.glbRequestCount,
        canvasCount: 1,
        armedResultVisible: false,
        releasedSvgTruth: true,
        rollerControlPreserved: true,
        spectatorAuthority: false,
      }
    );
    await closeScenario(scenario);
  }

  const scenarioOrder = new Map(
    STONE0_SCENARIO_IDS.map((id, index) => [id, index])
  );
  scenarios.sort(
    (first, second) =>
      scenarioOrder.get(first.id) - scenarioOrder.get(second.id)
  );

  const baseline = networkContexts.find(
    (context) => context.id === 'player-armed'
  );
  assertProviderOnce(baseline, 'baseline provider');
  const evidence = {
    schemaVersion: 1,
    kind: 'stone0-original-d20-tray-evidence',
    sourceSha,
    webBuildSha256: buildManifest.webBuildSha256,
    buildManifestSha256,
    provider: {
      manifestPath: ORIGINAL_D20_MANIFEST_PATH,
      manifestSha256: providerManifestSha256,
      sourceManifestSha256: providerSourceManifestSha256,
      presetId: ORIGINAL_D20_PRESET_ID,
      glbPath: ORIGINAL_D20_GLB_PATH,
      glbSha256: ORIGINAL_D20_GLB_SHA256,
      glbSizeBytes: ORIGINAL_D20_SIZE_BYTES,
      ...baseline.provider,
    },
    results,
    scenarios,
    artifacts: {
      browserEvidence: 'browser-evidence.json',
      network: 'network.json',
      console: 'console.json',
    },
    validationFailures: [],
    unexpectedErrors,
  };
  assertStone0TrayEvidence(evidence, {
    sourceSha,
    webBuildSha256: buildManifest.webBuildSha256,
    buildManifestSha256,
    providerManifestSha256,
    providerSourceManifestSha256,
  });
  await writeFile(
    networkPath,
    `${JSON.stringify({ schemaVersion: 1, contexts: networkContexts }, null, 2)}\n`
  );
  await writeFile(
    consolePath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        console: consoleEntries,
        pageErrors,
        unexpectedErrors,
      },
      null,
      2
    )}\n`
  );
  await writeFile(
    browserEvidencePath,
    `${JSON.stringify(evidence, null, 2)}\n`
  );
  const artifactHashes = {};
  for (const path of [browserEvidencePath, networkPath, consolePath])
    artifactHashes[path.split('/').at(-1)] = sha256(await readFile(path));
  console.log(
    JSON.stringify({
      verdict: 'PASS',
      out,
      sourceSha,
      webBuildSha256: buildManifest.webBuildSha256,
      buildManifestSha256,
      providerManifestSha256,
      providerSourceManifestSha256,
      glbSha256: ORIGINAL_D20_GLB_SHA256,
      resultFacts: results.length,
      scenarioFacts: scenarios.length,
      unexpectedErrors: unexpectedErrors.length,
      artifactHashes,
    })
  );
} finally {
  await browser.close();
}
