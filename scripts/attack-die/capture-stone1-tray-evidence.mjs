#!/usr/bin/env node
import { build } from 'esbuild';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:net';
import { basename, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
if (process.cwd() !== ROOT)
  throw Error(`run Stone 1 evidence from repository root: ${ROOT}`);

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

const [manifestModule, frozenEvidenceModule, stone0Module, protocolModule] =
  await Promise.all([
    bundleTsModule('src/components/ui/dice/diceRuntimeManifest.ts'),
    bundleTsModule('scripts/attack-die/evidenceProtocol.ts'),
    bundleTsModule('scripts/attack-die/stone0TrayEvidenceProtocol.ts'),
    bundleTsModule('scripts/attack-die/stone1TrayEvidenceProtocol.ts'),
  ]);
const { parseDiceRuntimeManifest } = manifestModule;
const { assertSameManifest, validateServedBuild } = frozenEvidenceModule;
const {
  ORIGINAL_D20_BODY_TRIANGLE_COUNT,
  ORIGINAL_D20_GLB_PATH,
  ORIGINAL_D20_GLB_SHA256,
  ORIGINAL_D20_MANIFEST_PATH,
  ORIGINAL_D20_MANIFEST_SHA256,
  ORIGINAL_D20_NUMERAL_TRIANGLE_COUNT,
  ORIGINAL_D20_PRESET_ID,
  ORIGINAL_D20_SIZE_BYTES,
  ORIGINAL_D20_SOURCE_MANIFEST_SHA256,
  STONE0_LOCAL_API_FIXTURES,
  STONE0_LOCAL_API_RESPONSE,
} = stone0Module;
const {
  STONE1_FONT_CSS_URL,
  STONE1_PHASES,
  STONE1_SCENARIO_IDS,
  STONE1_SYNTY_REQUEST_PATHS,
  STONE1_VALIDATION_RSS_LIMIT_BYTES,
  assertFrozenBuildSourceBinding,
  assertStone1TrayEvidence,
  assertStone1TrayEvidencePackage,
  classifyStone1ConsoleEntry,
  stone1PhaseCloseupScreenshot,
  stone1ScenarioScreenshot,
} = protocolModule;

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0)
    throw Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
};
const sourceSha = git('rev-parse', 'HEAD');
if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw Error('invalid exact git HEAD');
if (git('status', '--porcelain=v1', '--untracked-files=no') !== '')
  throw Error('Stone 1 capture requires a clean tracked tree and index');

const outputParent = resolve(
  '/home/kirk/game-dev/.verification/interactive-dice-tray/stone-1'
);
const out = resolve(outputParent, sourceSha);
if (dirname(out) !== outputParent || basename(out) !== sourceSha)
  throw Error('private exact-SHA output containment failed');
await mkdir(outputParent, { recursive: true });
const recapture = process.argv.slice(2).includes('--recapture');
let outputExists = false;
try {
  await stat(out);
  outputExists = true;
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
if (outputExists) {
  if (!recapture)
    throw Error(`exact-SHA output already exists; refusing overwrite: ${out}`);
  const invalidated = resolve(out, 'INVALIDATED-PASS.txt');
  await writeFile(
    invalidated,
    `Superseded by a requested recapture of ${sourceSha} at ${new Date().toISOString()}\n`
  );
  await rm(resolve(out, 'PASS'), { force: true });
  const superseded = resolve(
    outputParent,
    `${sourceSha}.superseded-${Date.now()}`
  );
  await rename(out, superseded);
}
await mkdir(out, { recursive: false });

const failedPath = resolve(out, 'FAILED.txt');
const passPath = resolve(out, 'PASS');
const buildManifestPath = resolve(out, 'build-manifest.json');
const previewLogPath = resolve(out, 'preview.log');
const buildLogPath = resolve(out, 'build.log');
const tempRoot = resolve(out, `.stone1-package-${process.pid}-${Date.now()}`);
await mkdir(tempRoot, { recursive: false });

let browser;
let preview;
let previewLog;
let shuttingDown = false;
let port;
async function cleanup() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (browser) {
    await browser.close().catch(() => undefined);
    browser = undefined;
  }
  if (preview && preview.exitCode === null) {
    preview.kill('SIGTERM');
    await new Promise((resolveExit) => {
      const timer = setTimeout(() => {
        preview?.kill('SIGKILL');
        resolveExit();
      }, 5_000);
      preview.once('exit', () => {
        clearTimeout(timer);
        resolveExit();
      });
    });
  }
  preview = undefined;
  if (previewLog) {
    await new Promise((resolveClose) => previewLog.end(resolveClose));
    previewLog = undefined;
  }
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'])
  process.once(signal, () => {
    void cleanup().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
  });
process.once('uncaughtException', (error) => {
  void writeFile(failedPath, `${error.stack ?? error}\n`)
    .catch(() => undefined)
    .finally(() => cleanup().finally(() => process.exit(1)));
});
process.once('unhandledRejection', (error) => {
  const message = error instanceof Error ? error.stack : String(error);
  void writeFile(failedPath, `${message}\n`)
    .catch(() => undefined)
    .finally(() => cleanup().finally(() => process.exit(1)));
});

async function atomicProviderCopy(source, destination) {
  await mkdir(dirname(destination), { recursive: true });
  const temporary = resolve(
    dirname(destination),
    `.${basename(destination)}.stone1-${process.pid}-${Date.now()}.tmp`
  );
  await copyFile(source, temporary);
  await rename(temporary, destination);
}

async function allocatePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(Error('failed to allocate dedicated port'));
        return;
      }
      const selected = address.port;
      server.close((error) => (error ? reject(error) : resolvePort(selected)));
    });
  });
}

function runLogged(command, args, logPath, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  const output = `$ ${command} ${args.join(' ')}\n${result.stdout ?? ''}${result.stderr ?? ''}`;
  return writeFile(logPath, output).then(() => {
    if (result.status !== 0)
      throw Error(`${command} ${args.join(' ')} failed; see ${logPath}`);
    return output;
  });
}

function mainScreenshotPath(id) {
  return resolve(tempRoot, stone1ScenarioScreenshot(id));
}
function readPngDimensions(bytes, label) {
  if (
    bytes.byteLength < 24 ||
    Buffer.from(bytes).toString('ascii', 12, 16) !== 'IHDR'
  )
    throw Error(`${label} screenshot is not PNG`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

const providerRoot = resolve(
  process.env.STONE1_PROVIDER_ROOT ??
    '/home/kirk/game-dev/rpg-game-assets/harness/models/custom-dice'
);
const privateManifestSource = resolve(providerRoot, 'dice-tray-presets.json');
const privateGlbSource = resolve(
  providerRoot,
  'original-set/Original_D20_Source.glb'
);
const runtimeProviderRoot = resolve(ROOT, 'public/models/custom-dice');
const syntyProviderRoot = resolve(
  process.env.STONE1_SYNTY_PROVIDER_ROOT ??
    '/home/kirk/game-dev/rpg-game-assets/harness/models/synty'
);
const runtimeSyntyRoot = resolve(ROOT, 'public/models/synty');
const STONE1_SYNTY_FIXTURE_PATHS = STONE1_SYNTY_REQUEST_PATHS.map((path) =>
  path.replace('/models/synty/', '')
);
const runtimeManifestPath = resolve(
  runtimeProviderRoot,
  'dice-tray-presets.json'
);
const runtimeGlbPath = resolve(
  runtimeProviderRoot,
  'original-set/Original_D20_Source.glb'
);

try {
  await atomicProviderCopy(privateManifestSource, runtimeManifestPath);
  await atomicProviderCopy(privateGlbSource, runtimeGlbPath);
  for (const relativePath of STONE1_SYNTY_FIXTURE_PATHS)
    await atomicProviderCopy(
      resolve(syntyProviderRoot, relativePath),
      resolve(runtimeSyntyRoot, relativePath)
    );
  const providerManifestBytes = new Uint8Array(
    await readFile(runtimeManifestPath)
  );
  const glbBytes = new Uint8Array(await readFile(runtimeGlbPath));
  if (sha256(providerManifestBytes) !== ORIGINAL_D20_MANIFEST_SHA256)
    throw Error('synchronized provider manifest is not the corrected bytes');
  if (
    glbBytes.byteLength !== ORIGINAL_D20_SIZE_BYTES ||
    sha256(glbBytes) !== ORIGINAL_D20_GLB_SHA256
  )
    throw Error('synchronized Original d20 GLB size/hash mismatch');
  const parsedProvider = parseDiceRuntimeManifest(
    JSON.parse(
      new TextDecoder('utf8', { fatal: true }).decode(providerManifestBytes)
    )
  );
  if (!parsedProvider.ok)
    throw Error(`synchronized provider parse failed: ${parsedProvider.reason}`);
  const preset = parsedProvider.manifest.presets.find(
    (candidate) => candidate.presetId === ORIGINAL_D20_PRESET_ID
  );
  if (
    !preset ||
    parsedProvider.manifest.sourceManifestSha256 !==
      ORIGINAL_D20_SOURCE_MANIFEST_SHA256 ||
    preset.model.path !== ORIGINAL_D20_GLB_PATH.split('/').slice(3).join('/') ||
    preset.model.sha256 !== ORIGINAL_D20_GLB_SHA256 ||
    preset.model.sizeBytes !== ORIGINAL_D20_SIZE_BYTES ||
    preset.model.geometry.bodyTriangleIndices.length !==
      ORIGINAL_D20_BODY_TRIANGLE_COUNT ||
    preset.model.geometry.numeralTriangleIndices.length !==
      ORIGINAL_D20_NUMERAL_TRIANGLE_COUNT
  )
    throw Error('synchronized provider preset/roles/source binding mismatch');

  await runLogged(
    'npm',
    ['run', 'attack-die:freeze-build', '--', '--out', buildManifestPath],
    buildLogPath,
    { ...process.env, VITE_ATTACK_DIE_WEB_COMMIT: sourceSha }
  );
  if (git('status', '--porcelain=v1', '--untracked-files=no') !== '')
    throw Error('tracked tree changed while freezing the exact build');
  const buildManifestBytes = new Uint8Array(await readFile(buildManifestPath));
  const buildManifestSha256 = sha256(buildManifestBytes);
  const buildManifest = JSON.parse(
    new TextDecoder().decode(buildManifestBytes)
  );
  if (buildManifest.webBuildSha256 === undefined)
    throw Error('frozen build manifest lacks root hash');

  port = await allocatePort();
  previewLog = createWriteStream(previewLogPath, { flags: 'wx' });
  preview = spawn(
    process.execPath,
    [
      'scripts/attack-die/serve-frozen.mjs',
      '--dist',
      'dist',
      '--build-manifest',
      buildManifestPath,
      '--synty-root',
      runtimeSyntyRoot,
      '--custom-dice-root',
      runtimeProviderRoot,
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  preview.stdout.pipe(previewLog, { end: false });
  preview.stderr.pipe(previewLog, { end: false });
  const baseUrl = new URL(`http://127.0.0.1:${port}/`);
  const trayUrl = new URL(
    '?concept=attack-die-3d&attackDieStage=tray',
    baseUrl
  );
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (preview.exitCode !== null)
      throw Error(`frozen preview exited early with ${preview.exitCode}`);
    try {
      const response = await fetch(trayUrl);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // The dedicated server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  if (!ready) throw Error('frozen preview did not become ready');

  const servedFiles = new Map();
  await validateServedBuild(buildManifest, async (path) => {
    const response = await fetch(new URL(path, baseUrl));
    if (!response.ok) throw Error(`served frozen file failed: ${path}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    servedFiles.set(path, bytes);
    return bytes;
  });
  const servedManifestResponse = await fetch(
    new URL('/__attack-die-build-manifest.json', baseUrl)
  );
  if (!servedManifestResponse.ok) throw Error('served build manifest failed');
  assertSameManifest(buildManifest, await servedManifestResponse.json());
  const sourceBindingCandidates = [...servedFiles].filter(
    ([path, bytes]) =>
      path.startsWith('assets/') &&
      path.endsWith('.js') &&
      new TextDecoder('utf8', { fatal: false })
        .decode(bytes)
        .includes(sourceSha)
  );
  if (sourceBindingCandidates.length !== 1)
    throw Error(
      `exact source SHA must be embedded by one frozen JS asset, found ${sourceBindingCandidates.length}`
    );
  const [sourceBindingAssetPath, sourceBindingAssetBytes] =
    sourceBindingCandidates[0];
  assertFrozenBuildSourceBinding(
    buildManifest,
    sourceSha,
    sourceBindingAssetPath,
    sourceBindingAssetBytes
  );
  const sourceBindingPackagePath = `frozen-build/${sourceBindingAssetPath}`;
  const servedProvider = new Uint8Array(
    await (
      await fetch(new URL(ORIGINAL_D20_MANIFEST_PATH, baseUrl))
    ).arrayBuffer()
  );
  const servedGlb = new Uint8Array(
    await (await fetch(new URL(ORIGINAL_D20_GLB_PATH, baseUrl))).arrayBuffer()
  );
  if (
    sha256(servedProvider) !== ORIGINAL_D20_MANIFEST_SHA256 ||
    sha256(servedGlb) !== ORIGINAL_D20_GLB_SHA256 ||
    servedGlb.byteLength !== ORIGINAL_D20_SIZE_BYTES
  )
    throw Error(
      'served provider bytes do not match captured synchronized bytes'
    );

  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/usr/bin/google-chrome',
  });
  const networkContexts = [];
  const networkRequests = [];
  const networkUnexpectedErrors = [];
  const consoleEntries = [];
  const pageErrors = [];
  const consoleUnexpectedErrors = [];
  const scenarioFacts = [];
  const phaseCloseups = [];
  const expectedApiUrls = new Set(
    STONE0_LOCAL_API_FIXTURES.map((fixture) => fixture.url)
  );

  const frozenBuildPaths = new Set(
    buildManifest.files.map((file) => file.path)
  );
  function ownedRequest(request) {
    const parsed = new URL(request.url());
    if (expectedApiUrls.has(request.url())) return request.method() === 'POST';
    if (request.url() === STONE1_FONT_CSS_URL)
      return request.method() === 'GET';
    if (parsed.origin !== baseUrl.origin || request.method() !== 'GET')
      return false;
    const path = parsed.pathname.replace(/^\//, '');
    return (
      parsed.pathname === '/' ||
      frozenBuildPaths.has(path) ||
      STONE1_SYNTY_REQUEST_PATHS.includes(parsed.pathname) ||
      parsed.pathname === ORIGINAL_D20_MANIFEST_PATH ||
      parsed.pathname === ORIGINAL_D20_GLB_PATH
    );
  }

  function ownedConsoleEntry(id, type, text, url) {
    return (
      classifyStone1ConsoleEntry(
        { scenarioId: id, type, text, url },
        baseUrl.origin,
        sourceBindingAssetPath
      ) !== null
    );
  }

  async function createScenario(id, options = {}) {
    const viewport =
      id === 'responsive-narrow'
        ? { width: 760, height: 900 }
        : { width: 1440, height: 1080 };
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      reducedMotion: id === 'reduced-motion-held' ? 'reduce' : 'no-preference',
      hasTouch: id === 'pointer-cancel',
    });
    const page = await context.newPage();
    const record = {
      scenarioId: id,
      contextOrdinal: STONE1_SCENARIO_IDS.indexOf(id) + 1,
      manifestRequestCount: 0,
      manifestTransferCount: 0,
      glbRequestCount: 0,
      glbTransferCount: 0,
      unexpectedRequestCount: 0,
    };
    networkContexts.push(record);
    const requestRecords = new Map();
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (path === ORIGINAL_D20_MANIFEST_PATH) record.manifestRequestCount += 1;
      if (path === ORIGINAL_D20_GLB_PATH) record.glbRequestCount += 1;
      if (!ownedRequest(request)) {
        record.unexpectedRequestCount += 1;
        networkUnexpectedErrors.push(
          `${id}:${request.method()}:${request.url()}`
        );
      }
      const item = {
        scenarioId: id,
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        status: null,
        completed: false,
      };
      requestRecords.set(request, item);
      networkRequests.push(item);
    });
    page.on('response', (response) => {
      const item = requestRecords.get(response.request());
      if (item) item.status = response.status();
    });
    page.on('requestfinished', (request) => {
      const item = requestRecords.get(request);
      if (!item) {
        networkUnexpectedErrors.push(`${id}:finished-without-request`);
        return;
      }
      item.completed = true;
      const path = new URL(request.url()).pathname;
      if (item.status === 200 && path === ORIGINAL_D20_MANIFEST_PATH)
        record.manifestTransferCount += 1;
      if (item.status === 200 && path === ORIGINAL_D20_GLB_PATH)
        record.glbTransferCount += 1;
    });
    page.on('requestfailed', (request) => {
      const item = requestRecords.get(request);
      networkUnexpectedErrors.push(
        `${id}:incomplete:${request.method()}:${request.url()}:${request.failure()?.errorText ?? 'unknown'}`
      );
      if (item) item.completed = false;
    });
    page.on('console', (message) => {
      const location = message.location();
      const type = message.type();
      const text = message.text();
      const url = location.url || '';
      consoleEntries.push({ scenarioId: id, type, text, url });
      if (!ownedConsoleEntry(id, type, text, url))
        consoleUnexpectedErrors.push(`${id}:${type}:${url}:${text}`);
    });
    page.on('pageerror', (error) => {
      pageErrors.push(`${id}:${error.message}`);
    });
    await page.route('https://fonts.googleapis.com/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/css',
        body: '/* Stone 1 deterministic empty web-font fixture */',
      })
    );
    await page.route('http://localhost:8080/**', async (route) => {
      const request = route.request();
      if (!expectedApiUrls.has(request.url()) || request.method() !== 'POST') {
        networkUnexpectedErrors.push(
          `${id}:unowned-local-api:${request.method()}:${request.url()}`
        );
        await route.abort('blockedbyclient');
        return;
      }
      await route.fulfill({
        status: 200,
        body: Buffer.from(STONE0_LOCAL_API_RESPONSE),
        headers: {
          'content-type': 'application/grpc-web+proto',
          'access-control-allow-origin': '*',
          'access-control-expose-headers': '*',
        },
      });
    });
    if (options.providerFailure)
      await page.route(
        new URL(ORIGINAL_D20_MANIFEST_PATH, baseUrl).href,
        (route) =>
          route.fulfill({
            status: 503,
            body: 'Stone 1 provider failure fixture',
          })
      );
    await page.goto(trayUrl.href, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await page
      .getByRole('heading', { name: 'Gameplay placement checkpoint' })
      .waitFor({ timeout: 30_000 });
    await page.waitForFunction(
      ({ failure }) => {
        const bridge = window.__stone1TrayEvidence;
        if (
          !bridge ||
          bridge.request.result !== 10 ||
          bridge.request.presetId !== 'dice.original.carved.d20' ||
          bridge.releaseCount !== 0 ||
          bridge.lifecyclePhase !== 'armed' ||
          !Number.isSafeInteger(bridge.shared.eventArrayId) ||
          !Number.isSafeInteger(bridge.shared.providerId)
        )
          return false;
        const canvases = document.querySelectorAll(
          '[data-witness-role] .attack-die-3d__canvas canvas'
        ).length;
        if (failure) return canvases === 0;
        return (
          canvases === 2 &&
          Number.isSafeInteger(bridge.witnesses.roller.rendererContextId) &&
          Number.isSafeInteger(bridge.witnesses.spectator.rendererContextId)
        );
      },
      { failure: Boolean(options.providerFailure) },
      { timeout: 30_000 }
    );
    return { context, page, viewport, requestRecords };
  }

  async function bridgeState(page, phase = 'timeline') {
    return page.evaluate((label) => {
      const bridge = window.__stone1TrayEvidence;
      if (!bridge) throw Error(`${label}: Stone 1 bridge missing`);
      const witnesses = [bridge.witnesses.roller, bridge.witnesses.spectator];
      return {
        result: bridge.request.result,
        releaseCount: bridge.releaseCount,
        lifecyclePhase: bridge.lifecyclePhase,
        rollerGrabbed: bridge.rollerGrabbed,
        spectatorGrabbed: bridge.spectatorGrabbed,
        releasePresent: bridge.releaseCount > 0,
        releaseSchemaVersion: bridge.releaseSchemaVersion ?? null,
        profilePresent: witnesses.every(
          (witness) => witness.releaseProfile !== undefined
        ),
        profileSchemaVersion:
          witnesses.length > 0 &&
          witnesses.every(
            (witness) =>
              witness.releaseProfile?.schemaVersion ===
              witnesses[0].releaseProfile?.schemaVersion
          )
            ? (witnesses[0].releaseProfile?.schemaVersion ?? null)
            : null,
        finalObservationPresent: witnesses.every(
          (witness) => witness.finalTelemetry !== undefined
        ),
      };
    }, phase);
  }

  function timelineState(state) {
    return {
      result: state.result,
      releaseCount: state.releaseCount,
      lifecyclePhase: state.lifecyclePhase,
      rollerGrabbed: state.rollerGrabbed,
      spectatorGrabbed: state.spectatorGrabbed,
      releasePresent: state.releasePresent,
      profilePresent: state.profilePresent,
      finalObservationPresent: state.finalObservationPresent,
    };
  }

  function afterReleaseState(state) {
    return {
      result: state.result,
      releaseCount: state.releaseCount,
      lifecyclePhase: state.lifecyclePhase,
      rollerGrabbed: state.rollerGrabbed,
      spectatorGrabbed: state.spectatorGrabbed,
      releasePresent: state.releasePresent,
      releaseSchemaVersion: state.releaseSchemaVersion,
      profilePresent: state.profilePresent,
      profileSchemaVersion: state.profileSchemaVersion,
    };
  }

  async function installNativeInputAudit(target, expectedType) {
    await target.evaluate((element, terminalType) => {
      const audit = {
        gotCaptureTrusted: false,
        captureOwnedBefore: false,
        terminalEvent: null,
      };
      Object.defineProperty(window, '__stone1NativeInputAudit', {
        configurable: true,
        enumerable: false,
        value: audit,
      });
      element.addEventListener(
        'gotpointercapture',
        (event) => {
          audit.gotCaptureTrusted = event.isTrusted;
          audit.captureOwnedBefore = element.hasPointerCapture(event.pointerId);
        },
        { once: true }
      );
      for (const eventType of ['pointercancel', 'lostpointercapture'])
        element.addEventListener(
          eventType,
          (event) => {
            if (event.type !== terminalType) return;
            audit.terminalEvent = {
              eventType: event.type,
              pointerId: event.pointerId,
              isTrusted: event.isTrusted,
              captureOwnedBefore:
                audit.gotCaptureTrusted && audit.captureOwnedBefore,
              captureOwnedDuring: element.hasPointerCapture(event.pointerId),
            };
          },
          { once: true }
        );
    }, expectedType);
  }

  async function nativeTerminalInputFact(page, target, expectedType) {
    await page.waitForFunction(
      (terminalType) =>
        window.__stone1NativeInputAudit?.terminalEvent?.eventType ===
        terminalType,
      expectedType,
      { timeout: 10_000 }
    );
    const terminalEvent = await page.evaluate(() => {
      const audit = window.__stone1NativeInputAudit;
      if (!audit?.terminalEvent)
        throw Error('native terminal input event audit missing');
      return structuredClone(audit.terminalEvent);
    });
    await page.evaluate(
      () =>
        new Promise((resolveFrame) =>
          requestAnimationFrame(() => requestAnimationFrame(resolveFrame))
        )
    );
    const captureOwnedAfter = await target.evaluate(
      (element, pointerId) => element.hasPointerCapture(pointerId),
      terminalEvent.pointerId
    );
    return {
      eventType: terminalEvent.eventType,
      isTrusted: terminalEvent.isTrusted,
      captureOwnedBefore: terminalEvent.captureOwnedBefore,
      captureOwnedDuring: terminalEvent.captureOwnedDuring,
      captureOwnedAfter,
    };
  }

  async function grab(
    page,
    moves,
    outside = false,
    nativeTerminalType = undefined
  ) {
    const target = page
      .locator('[data-witness-role="roller"]')
      .getByRole('button', { name: 'Grab d20' });
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw Error('Roller grab target has no bounds');
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    if (nativeTerminalType)
      await installNativeInputAudit(target, nativeTerminalType);
    let cdp;
    if (nativeTerminalType === 'pointercancel') {
      cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: start.x, y: start.y }],
      });
      const touchMoves = moves.length > 0 ? moves : [[1, 1, 1]];
      for (const move of touchMoves)
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: start.x + move[0], y: start.y + move[1] }],
        });
    } else {
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      for (const move of moves)
        await page.mouse.move(start.x + move[0], start.y + move[1], {
          steps: move[2] ?? 1,
        });
      if (outside) await page.mouse.move(4, 4, { steps: 3 });
    }
    await page.waitForFunction(
      () => window.__stone1TrayEvidence?.rollerGrabbed === true
    );
    const capture = await target.evaluate(
      (element, terminalType) => ({
        captured:
          terminalType === 'pointercancel'
            ? window.__stone1NativeInputAudit?.captureOwnedBefore === true
            : element.hasPointerCapture(1),
        grabbed: element.getAttribute('data-grabbed') === 'true',
      }),
      nativeTerminalType
    );
    return { target, start, capture, cdp };
  }

  async function transferPointerCapture(page, grabState) {
    await grabState.target.evaluate((element) => {
      if (!element.hasPointerCapture(1))
        throw Error('lost-capture fixture did not own active pointer 1');
      const transferTarget = element.closest(
        '[data-testid="dice-tray-3d-renderer"]'
      );
      if (!(transferTarget instanceof HTMLElement))
        throw Error('lost-capture transfer target missing');
      transferTarget.setPointerCapture(1);
    });
    await page.mouse.move(grabState.start.x + 2, grabState.start.y + 2);
  }

  async function waitSettled(page, observations) {
    await page.waitForFunction(
      ({ expectedObservations }) => {
        const bridge = window.__stone1TrayEvidence;
        if (
          !bridge ||
          bridge.releaseCount !== 1 ||
          bridge.lifecyclePhase !== 'settled' ||
          bridge.rollerGrabbed ||
          bridge.spectatorGrabbed
        )
          return false;
        const witnesses = [bridge.witnesses.roller, bridge.witnesses.spectator];
        return expectedObservations
          ? witnesses.every(
              (witness) =>
                witness.finalTelemetry?.requestedResult === 10 &&
                witness.finalTelemetry?.observedUpwardResult === 10 &&
                witness.finalTelemetry?.exactTargetHeld === true &&
                witness.finalTelemetry?.motionRevision === 'choreographed-v1' &&
                witness.releaseProfile?.schemaVersion === 1
            )
          : witnesses.every(
              (witness) =>
                witness.finalTelemetry === undefined &&
                witness.releaseProfile?.schemaVersion === 1
            );
      },
      { expectedObservations: observations },
      { timeout: 30_000 }
    );
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }

  async function observationFacts(page) {
    return page.evaluate(() => {
      const bridge = window.__stone1TrayEvidence;
      if (!bridge) throw Error('Stone 1 observation bridge missing');
      const roller = bridge.witnesses.roller;
      const spectator = bridge.witnesses.spectator;
      const make = (witness, role) => {
        const final = witness.finalTelemetry;
        const profile = final?.throwProfile;
        if (
          !final ||
          !profile ||
          !witness.rendererContextId ||
          !witness.runtimeSourceId ||
          !witness.runtimeCloneId ||
          !bridge.shared.providerId
        )
          throw Error(`${role} final observation incomplete`);
        const region = document.querySelector(
          `[data-witness-role="${role}"] [role="region"]`
        );
        const canvas = region?.querySelector('.attack-die-3d__canvas canvas');
        const canvasRect = canvas?.getBoundingClientRect();
        const canvasVisible =
          canvas instanceof HTMLCanvasElement &&
          canvasRect &&
          canvasRect.width > 0 &&
          canvasRect.height > 0 &&
          getComputedStyle(canvas).visibility !== 'hidden';
        return {
          contextId: witness.rendererContextId,
          sourceId: witness.runtimeSourceId,
          cloneId: witness.runtimeCloneId,
          eventArrayId: bridge.shared.eventArrayId,
          providerId: bridge.shared.providerId,
          requestedResult: final.requestedResult,
          observedUpwardResult: final.observedUpwardResult,
          upwardDotThresholdPassed: final.observedUpDot > 0.999999,
          upwardMarginThresholdPassed: final.observedUpMargin > 0.2,
          angularThresholdPassed:
            final.angularErrorDegrees >= 0 && final.angularErrorDegrees <= 0.25,
          exactTargetHeld: final.exactTargetHeld,
          canvasVisible: Boolean(canvasVisible),
          motionRevision: final.motionRevision,
          profile: structuredClone(profile),
          profileObjectFrozen: Object.isFrozen(profile),
          profileTuplesFrozen:
            Object.isFrozen(profile.releasePosition) &&
            Object.isFrozen(profile.releaseDirection),
          observationObjectFrozen: Object.isFrozen(final),
        };
      };
      const rollerFact = make(roller, 'roller');
      const spectatorFact = make(spectator, 'spectator');
      return {
        profilesDeepEqual:
          JSON.stringify(rollerFact.profile) ===
          JSON.stringify(spectatorFact.profile),
        eventShared: rollerFact.eventArrayId === spectatorFact.eventArrayId,
        providerShared: rollerFact.providerId === spectatorFact.providerId,
        sourceShared: rollerFact.sourceId === spectatorFact.sourceId,
        contextsDistinct: rollerFact.contextId !== spectatorFact.contextId,
        clonesDistinct: rollerFact.cloneId !== spectatorFact.cloneId,
        observationsDistinct:
          roller.finalTelemetry !== spectator.finalTelemetry,
        roller: rollerFact,
        spectator: spectatorFact,
      };
    });
  }

  async function renderedMotionSamples(page) {
    return page.evaluate(() => {
      const bridge = window.__stone1TrayEvidence;
      if (!bridge) throw Error('Stone 1 motion bridge missing');
      return structuredClone(bridge.witnesses.roller.motionSamples);
    });
  }

  async function waitForReducedMotionSample(page, held) {
    await page.waitForFunction(
      (expectedHeld) =>
        window.__stone1TrayEvidence?.witnesses.roller.motionSamples.some(
          (sample) =>
            sample.phase === 'ready' &&
            sample.reducedMotion === true &&
            sample.held === expectedHeld
        ),
      held,
      { timeout: 10_000 }
    );
  }

  function changedTuple(first, second, indices) {
    return indices.some(
      (index) => Math.abs(first[index] - second[index]) > 1e-6
    );
  }

  function observedMotionCounts(samples, afterSequence = 0) {
    // The first rolling pose is the immediate phase handoff. Count only
    // subsequent rendered changes so reduced motion's instant settle is not
    // mislabeled as animation.
    const rolling = samples
      .filter(
        (sample) =>
          sample.sequence > afterSequence && sample.phase === 'rolling'
      )
      .slice(1);
    let tumble = 0;
    let shake = 0;
    let bounce = 0;
    for (let index = 1; index < rolling.length; index += 1) {
      if (
        changedTuple(
          rolling[index - 1].quaternion,
          rolling[index].quaternion,
          [0, 1, 2, 3]
        )
      )
        tumble += 1;
      if (
        changedTuple(
          rolling[index - 1].translation,
          rolling[index].translation,
          [0, 2]
        )
      )
        shake += 1;
      if (
        changedTuple(
          rolling[index - 1].translation,
          rolling[index].translation,
          [1]
        )
      )
        bounce += 1;
    }
    return { tumble, shake, bounce };
  }

  async function observedFallbackFacts(page, origin) {
    return page.evaluate((failureOrigin) => {
      const bridge = window.__stone1TrayEvidence;
      if (!bridge) throw Error('Stone 1 fallback bridge missing');
      const witnesses = [bridge.witnesses.roller, bridge.witnesses.spectator];
      const canvases = document.querySelectorAll(
        '[data-witness-role] .attack-die-3d__canvas canvas'
      );
      const svgs = [
        ...document.querySelectorAll(
          '[data-witness-role] [data-testid="d20-die"]'
        ),
      ].filter((svg) => {
        const rect = svg.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      const results = [
        ...document.querySelectorAll(
          '[data-witness-role] [data-testid="dice-face"]'
        ),
      ].map((node) => Number(node.textContent));
      if (
        svgs.length !== 2 ||
        results.length !== 2 ||
        !results.every((result) => result === results[0])
      )
        throw Error('live fallback renderer/result DOM mismatch');
      return {
        origin: failureOrigin,
        fallbackRenderer: 'svg',
        fallbackResult: results[0],
        affectedCanvasCount: canvases.length,
        heldStateCleared: !bridge.rollerGrabbed && !bridge.spectatorGrabbed,
        staleHeldTelemetry: bridge.rollerGrabbed || bridge.spectatorGrabbed,
        staleProfileTelemetry: witnesses.some(
          (witness) => witness.finalTelemetry?.throwProfile !== undefined
        ),
      };
    }, origin);
  }

  function witnessCloseupLocator(page, role) {
    return page.locator(`[data-witness-role="${role}"]`);
  }

  async function capturePhaseCloseups(page, phase) {
    const isolationStyle = await page.addStyleTag({
      content:
        '.dice-tray-encounter-preview__witnesses { z-index: 7 !important; } /* isolate wells above the dock only for diagnostic crops */',
    });
    try {
      for (const role of ['roller', 'spectator']) {
        const locator = witnessCloseupLocator(page, role);
        const filename = stone1PhaseCloseupScreenshot(phase, role);
        await locator.screenshot({ path: resolve(tempRoot, filename) });
        const bytes = new Uint8Array(
          await readFile(resolve(tempRoot, filename))
        );
        const dimensions = readPngDimensions(bytes, filename);
        phaseCloseups.push({
          phase,
          role,
          screenshot: filename,
          deviceScaleFactor: 1,
          physicalWidth: dimensions.width,
          physicalHeight: dimensions.height,
        });
      }
    } finally {
      await isolationStyle.evaluate((style) => style.remove());
    }
  }

  async function runScenario(id) {
    const providerFailure = id === 'provider-failure';
    const scenario = await createScenario(id, { providerFailure });
    const { page, context, viewport, requestRecords } = scenario;
    try {
      if (id === 'reduced-motion-held')
        await waitForReducedMotionSample(page, false);
      const before = timelineState(await bridgeState(page, 'before'));
      const motionBefore = await renderedMotionSamples(page);
      const motionSequenceBefore = motionBefore.at(-1)?.sequence ?? 0;
      const reducedBeforePose = motionBefore
        .filter((sample) => sample.phase === 'ready' && !sample.held)
        .at(-1);
      let held = before;
      let outsideCaptureObserved = false;
      let cancellationObserved = false;
      let terminalInput = null;
      let observations = null;
      let failure = null;
      let mainCaptured = false;
      let motionCounts = { tumble: 0, shake: 0, bounce: 0 };
      let reducedStaticLifted = false;

      if (providerFailure) {
        await page
          .locator('[data-witness-role="roller"]')
          .getByRole('button', { name: 'Roll d20' })
          .click();
        await waitSettled(page, false);
        failure = await observedFallbackFacts(page, 'provider');
      } else if (id === 'keyboard-neutral') {
        const roll = page
          .locator('[data-witness-role="roller"]')
          .getByRole('button', { name: 'Roll d20' });
        await roll.focus();
        await page.keyboard.press('Enter');
        await waitSettled(page, true);
        observations = await observationFacts(page);
        const neutral = observations.roller.profile;
        if (
          JSON.stringify(neutral.releasePosition) !== '[0.5,0.5]' ||
          JSON.stringify(neutral.releaseDirection) !== '[0,0]' ||
          neutral.releaseSpeed !== 0 ||
          neutral.shakeEnergy !== 0 ||
          neutral.spinBias !== 0
        )
          throw Error('keyboard scenario did not emit a neutral profile');
      } else {
        const repeated = id === 'repeated-shake';
        const outside = id === 'held-outside-capture';
        const moves = repeated
          ? [
              [25, 12, 2],
              [-20, -16, 2],
              [28, 18, 2],
              [-14, 20, 2],
            ]
          : id === 'quick-release'
            ? []
            : [[24, -18, 3]];
        const beforeRegion =
          id === 'reduced-motion-held'
            ? await page
                .locator('[data-witness-role="roller"] [role="region"]')
                .screenshot()
            : undefined;
        const nativeTerminalType =
          id === 'pointer-cancel'
            ? 'pointercancel'
            : id === 'lost-pointer-capture'
              ? 'lostpointercapture'
              : undefined;
        const grabState = await grab(page, moves, outside, nativeTerminalType);
        if (id === 'reduced-motion-held')
          await waitForReducedMotionSample(page, true);
        held = timelineState(await bridgeState(page, 'held'));
        outsideCaptureObserved = outside
          ? grabState.capture.captured && grabState.capture.grabbed
          : false;
        if (id === 'held-desktop') await capturePhaseCloseups(page, 'held');
        if (
          [
            'held-desktop',
            'held-outside-capture',
            'repeated-shake',
            'reduced-motion-held',
          ].includes(id)
        ) {
          await page.screenshot({ path: mainScreenshotPath(id) });
          mainCaptured = true;
        }
        if (id === 'reduced-motion-held') {
          const heldLocator = page.locator(
            '[data-witness-role="roller"] [role="region"]'
          );
          await page.waitForTimeout(100);
          const firstHeld = await heldLocator.screenshot();
          await page.waitForTimeout(100);
          const secondHeld = await heldLocator.screenshot();
          const heldMotion = (await renderedMotionSamples(page)).filter(
            (sample) =>
              sample.sequence > motionSequenceBefore &&
              sample.phase === 'ready' &&
              sample.held
          );
          const firstHeldPose = heldMotion[0];
          reducedStaticLifted =
            sha256(beforeRegion) !== sha256(firstHeld) &&
            sha256(firstHeld) === sha256(secondHeld) &&
            reducedBeforePose !== undefined &&
            firstHeldPose !== undefined &&
            heldMotion.length >= 1 &&
            firstHeldPose.reducedMotion === true &&
            firstHeldPose.translation[1] >
              reducedBeforePose.translation[1] + 0.05 &&
            heldMotion.every(
              (sample) =>
                JSON.stringify(sample.translation) ===
                  JSON.stringify(firstHeldPose.translation) &&
                JSON.stringify(sample.quaternion) ===
                  JSON.stringify(firstHeldPose.quaternion)
            );
          if (!reducedStaticLifted)
            throw Error(
              'reduced-motion held cue was not changed, static, and lifted'
            );
        }

        if (id === 'pointer-cancel') {
          await grabState.cdp.send('Input.dispatchTouchEvent', {
            type: 'touchCancel',
            touchPoints: [],
          });
          terminalInput = await nativeTerminalInputFact(
            page,
            grabState.target,
            'pointercancel'
          );
          cancellationObserved = terminalInput.isTrusted;
          await page.waitForFunction(
            () =>
              window.__stone1TrayEvidence?.rollerGrabbed === false &&
              window.__stone1TrayEvidence?.releaseCount === 0
          );
          await grabState.cdp.detach();
        } else if (id === 'lost-pointer-capture') {
          await transferPointerCapture(page, grabState);
          terminalInput = await nativeTerminalInputFact(
            page,
            grabState.target,
            'lostpointercapture'
          );
          cancellationObserved = terminalInput.isTrusted;
          await page.waitForFunction(
            () =>
              window.__stone1TrayEvidence?.rollerGrabbed === false &&
              window.__stone1TrayEvidence?.releaseCount === 0
          );
          await page.mouse.up();
        } else if (id === 'context-loss') {
          await page.evaluate(() => {
            const canvases = [
              ...document.querySelectorAll(
                '[data-witness-role] .attack-die-3d__canvas canvas'
              ),
            ];
            if (canvases.length !== 2)
              throw Error('context-loss fixture requires two canvases');
            for (const canvas of canvases) {
              const context =
                canvas.getContext('webgl2') ?? canvas.getContext('webgl');
              const extension = context?.getExtension('WEBGL_lose_context');
              if (!extension) throw Error('WEBGL_lose_context unavailable');
              extension.loseContext();
            }
          });
          await page.waitForFunction(
            () =>
              window.__stone1TrayEvidence?.rollerGrabbed === false &&
              document.querySelectorAll(
                '[data-witness-role] .attack-die-3d__canvas canvas'
              ).length === 0,
            undefined,
            { timeout: 15_000 }
          );
          await page
            .locator('[data-witness-role="roller"]')
            .getByRole('button', { name: 'Roll d20' })
            .click();
          await waitSettled(page, false);
          failure = await observedFallbackFacts(page, 'context-loss');
        } else {
          await page.mouse.up();
          if (id === 'held-desktop') {
            await page.waitForFunction(
              () => window.__stone1TrayEvidence?.releaseCount === 1
            );
            await capturePhaseCloseups(page, 'release');
          }
          await waitSettled(page, true);
          observations = await observationFacts(page);
          if (id === 'held-desktop')
            await capturePhaseCloseups(page, 'settled');
        }
      }

      const afterRaw = await bridgeState(page, 'after');
      const after = afterReleaseState(afterRaw);
      if (!mainCaptured)
        await page.screenshot({ path: mainScreenshotPath(id) });
      if (STONE1_SCENARIO_IDS.indexOf(id) < 8)
        motionCounts = observedMotionCounts(
          await renderedMotionSamples(page),
          motionSequenceBefore
        );
      const fact = {
        id,
        passed: true,
        screenshot: stone1ScenarioScreenshot(id),
        viewport,
        deviceScaleFactor: 1,
        authoritativeResult: 10,
        timeline: { beforeRelease: before, held, afterRelease: after },
        heldCue: {
          staticLifted: reducedStaticLifted,
          tumbleSampleCount: motionCounts.tumble,
          shakeSampleCount: motionCounts.shake,
          bounceSampleCount: motionCounts.bounce,
        },
        outsideCaptureObserved,
        cancellationObserved,
        terminalInput,
        observations,
        failure,
      };
      await page.waitForLoadState('networkidle', { timeout: 15_000 });
      if (
        [...requestRecords.values()].some(
          (request) => request.status === null || request.completed !== true
        )
      )
        throw Error(`${id} retained an incomplete network transfer`);
      scenarioFacts.push(fact);
    } finally {
      await context.close();
    }
  }

  for (const id of STONE1_SCENARIO_IDS) await runScenario(id);
  if (
    phaseCloseups.length !== 6 ||
    STONE1_PHASES.some((phase) =>
      ['roller', 'spectator'].some(
        (role) =>
          !phaseCloseups.some(
            (fact) => fact.phase === phase && fact.role === role
          )
      )
    )
  )
    throw Error('held/release/settled phase closeup matrix incomplete');
  phaseCloseups.sort((first, second) => {
    const phase =
      STONE1_PHASES.indexOf(first.phase) - STONE1_PHASES.indexOf(second.phase);
    return phase || (first.role === 'roller' ? -1 : 1);
  });

  const browserEvidence = {
    schemaVersion: 1,
    kind: 'stone1-tactile-roll-group-evidence',
    sourceSha,
    frozenBuildSourceSha: sourceSha,
    webBuildSha256: buildManifest.webBuildSha256,
    buildManifestSha256,
    provider: {
      manifestPath: ORIGINAL_D20_MANIFEST_PATH,
      manifestSha256: ORIGINAL_D20_MANIFEST_SHA256,
      sourceManifestSha256: ORIGINAL_D20_SOURCE_MANIFEST_SHA256,
      presetId: ORIGINAL_D20_PRESET_ID,
      glbPath: ORIGINAL_D20_GLB_PATH,
      glbSha256: ORIGINAL_D20_GLB_SHA256,
      glbSizeBytes: ORIGINAL_D20_SIZE_BYTES,
      bodyTriangleCount: ORIGINAL_D20_BODY_TRIANGLE_COUNT,
      numeralTriangleCount: ORIGINAL_D20_NUMERAL_TRIANGLE_COUNT,
    },
    scenarios: scenarioFacts,
    phaseCloseups,
    artifacts: {
      browserEvidence: 'browser-evidence.json',
      network: 'network.json',
      console: 'console.json',
    },
    validationFailures: [],
    unexpectedErrors: [],
  };
  const networkArtifact = {
    schemaVersion: 1,
    kind: 'stone1-network-log',
    contexts: networkContexts,
    requests: networkRequests,
    unexpectedErrors: networkUnexpectedErrors,
  };
  const consoleArtifact = {
    schemaVersion: 1,
    kind: 'stone1-console-log',
    entries: consoleEntries,
    pageErrors,
    unexpectedErrors: consoleUnexpectedErrors,
  };
  const identity = {
    sourceSha,
    frozenBuildSourceSha: sourceSha,
    webBuildSha256: buildManifest.webBuildSha256,
    buildManifestSha256,
    providerManifestSha256: ORIGINAL_D20_MANIFEST_SHA256,
    providerSourceManifestSha256: ORIGINAL_D20_SOURCE_MANIFEST_SHA256,
    providerGlbSha256: ORIGINAL_D20_GLB_SHA256,
  };
  assertStone1TrayEvidence(browserEvidence, identity);
  if (
    networkUnexpectedErrors.length ||
    consoleUnexpectedErrors.length ||
    pageErrors.length
  )
    throw Error(
      `unexpected browser/network errors: ${JSON.stringify({
        networkUnexpectedErrors,
        consoleUnexpectedErrors,
        pageErrors,
      })}`
    );
  await writeFile(
    resolve(tempRoot, 'browser-evidence.json'),
    `${JSON.stringify(browserEvidence, null, 2)}\n`
  );
  await writeFile(
    resolve(tempRoot, 'network.json'),
    `${JSON.stringify(networkArtifact, null, 2)}\n`
  );
  await writeFile(
    resolve(tempRoot, 'console.json'),
    `${JSON.stringify(consoleArtifact, null, 2)}\n`
  );

  const expectedScreenshotPaths = [
    ...STONE1_SCENARIO_IDS.map(stone1ScenarioScreenshot),
    ...STONE1_PHASES.flatMap((phase) =>
      ['roller', 'spectator'].map((role) =>
        stone1PhaseCloseupScreenshot(phase, role)
      )
    ),
  ];
  const packagePaths = [
    'build-manifest.json',
    sourceBindingPackagePath,
    'browser-evidence.json',
    'network.json',
    'console.json',
    ...expectedScreenshotPaths,
  ];
  const artifactBytes = new Map();
  for (const filename of packagePaths)
    artifactBytes.set(
      filename,
      filename === sourceBindingPackagePath
        ? sourceBindingAssetBytes
        : new Uint8Array(
            await readFile(
              filename === 'build-manifest.json'
                ? buildManifestPath
                : resolve(tempRoot, filename)
            )
          )
    );
  const packageManifest = {
    schemaVersion: 1,
    kind: 'stone1-tactile-roll-group-package',
    verdict: 'PASS',
    sourceSha,
    frozenBuildSourceSha: sourceSha,
    webBuildSha256: buildManifest.webBuildSha256,
    buildManifestSha256,
    providerManifestSha256: ORIGINAL_D20_MANIFEST_SHA256,
    providerSourceManifestSha256: ORIGINAL_D20_SOURCE_MANIFEST_SHA256,
    providerGlbSha256: ORIGINAL_D20_GLB_SHA256,
    sourceBindingAssetPath,
    scenarioCount: 12,
    contextCount: 12,
    screenshotCount: 18,
    validationRssLimitBytes: STONE1_VALIDATION_RSS_LIMIT_BYTES,
    validationPeakRssBytes: Math.max(1, process.resourceUsage().maxRSS * 1024),
    artifacts: packagePaths.map((path) => {
      const bytes = artifactBytes.get(path);
      return {
        path,
        kind:
          path === 'build-manifest.json'
            ? 'build-manifest'
            : path === sourceBindingPackagePath
              ? 'build-source-binding'
              : path.endsWith('.json')
                ? 'json'
                : 'screenshot',
        sha256: sha256(bytes),
        sizeBytes: bytes.byteLength,
      };
    }),
  };
  assertStone1TrayEvidencePackage(packageManifest, identity, artifactBytes, [
    'PASS',
  ]);

  for (const filename of packagePaths) {
    if (filename === 'build-manifest.json') continue;
    if (filename === sourceBindingPackagePath) {
      await mkdir(dirname(resolve(out, filename)), { recursive: true });
      await writeFile(resolve(out, filename), sourceBindingAssetBytes, {
        flag: 'wx',
      });
      continue;
    }
    await rename(resolve(tempRoot, filename), resolve(out, filename));
  }
  await rm(tempRoot, { recursive: true, force: true });
  const packageManifestTemporary = resolve(
    out,
    `.package-manifest-${process.pid}.tmp`
  );
  await writeFile(
    packageManifestTemporary,
    `${JSON.stringify(packageManifest, null, 2)}\n`
  );
  await rename(packageManifestTemporary, resolve(out, 'package-manifest.json'));
  const passTemporary = resolve(out, `.PASS-${process.pid}.tmp`);
  await writeFile(passTemporary, `${sourceSha}\n`);
  await rename(passTemporary, passPath);

  const publishedBytes = new Map();
  for (const filename of packagePaths)
    publishedBytes.set(
      filename,
      new Uint8Array(await readFile(resolve(out, filename)))
    );
  const publishedManifest = JSON.parse(
    await readFile(resolve(out, 'package-manifest.json'), 'utf8')
  );
  assertStone1TrayEvidencePackage(publishedManifest, identity, publishedBytes, [
    'PASS',
  ]);

  const montage = spawnSync(
    'montage',
    [
      ...STONE1_PHASES.flatMap((phase) =>
        ['roller', 'spectator'].map((role) =>
          resolve(out, stone1PhaseCloseupScreenshot(phase, role))
        )
      ),
      '-tile',
      '2x3',
      '-geometry',
      '520x380+24+36',
      '-background',
      '#111827',
      '-fill',
      'white',
      '-title',
      `Stone 1 ${sourceSha.slice(0, 12)} — held / release / settled`,
      resolve(out, 'contact-sheet-phases.png'),
    ],
    { cwd: ROOT, encoding: 'utf8' }
  );
  if (montage.status !== 0)
    throw Error(`phase contact sheet failed: ${montage.stderr}`);
  const scenarioMontage = spawnSync(
    'montage',
    [
      ...STONE1_SCENARIO_IDS.map((id) =>
        resolve(out, stone1ScenarioScreenshot(id))
      ),
      '-thumbnail',
      '480x360',
      '-tile',
      '3x4',
      '-geometry',
      '+18+30',
      '-background',
      '#111827',
      '-fill',
      'white',
      '-title',
      `Stone 1 exact scenarios ${sourceSha.slice(0, 12)}`,
      resolve(out, 'contact-sheet-scenarios.png'),
    ],
    { cwd: ROOT, encoding: 'utf8' }
  );
  if (scenarioMontage.status !== 0)
    throw Error(`scenario contact sheet failed: ${scenarioMontage.stderr}`);

  await cleanup();
  const probe = await fetch(baseUrl).then(
    () => true,
    () => false
  );
  if (probe) throw Error(`dedicated preview port ${port} remained open`);
  const trackedAfter = git('status', '--porcelain=v1', '--untracked-files=no');
  if (trackedAfter !== '')
    throw Error('tracked tree changed during Stone 1 evidence capture');
  const manifestHash = sha256(
    new Uint8Array(await readFile(resolve(out, 'package-manifest.json')))
  );
  console.log(`PASS Stone 1 exact-SHA evidence: ${out}`);
  console.log(`source SHA: ${sourceSha}`);
  console.log(`package manifest SHA-256: ${manifestHash}`);
  console.log(`scenarios: 12; screenshots: 18; contexts: 12`);
  console.log(
    `validation peak RSS declaration: ${packageManifest.validationPeakRssBytes} bytes (limit ${STONE1_VALIDATION_RSS_LIMIT_BYTES})`
  );
  console.log(`cleanup: browser/server closed; port ${port} closed`);
} catch (error) {
  await writeFile(failedPath, `${error.stack ?? error}\n`).catch(
    () => undefined
  );
  await rm(passPath, { force: true }).catch(() => undefined);
  await cleanup();
  console.error(error);
  process.exitCode = 1;
}
