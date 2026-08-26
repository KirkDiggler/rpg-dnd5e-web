#!/usr/bin/env node
import { constants } from 'node:fs';
import { access, mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const TARGET_SELECTOR =
  '[data-witness-role="roller"][data-roll-group-die-id][data-renderer-generation]';
const ATTACHMENT_LIMIT_CSS_PX = 2;
const TIMEOUTS = Object.freeze({
  globalMs: 12 * 60_000,
  stepMs: 20_000,
  stageMs: 30_000,
  scenarioMs: 35_000,
  cleanupMs: 10_000,
});
// Two WebGL workers keep the narrow tabbed critical pool within its deadline;
// three concurrent canvases caused renderer starvation without changing state.
const SCENARIO_WORKER_COUNT = 2;
const MEASUREMENT_SCENARIO = 'bless-mixed-attack';
const MEASUREMENT_CANDIDATE = 'physical';
const VIEWPORTS = Object.freeze([
  Object.freeze({ id: 'desktop', width: 1280, height: 800, touch: false }),
  Object.freeze({
    id: 'stack-boundary',
    width: 1024,
    height: 768,
    touch: false,
  }),
  Object.freeze({ id: 'narrow-touch', width: 390, height: 844, touch: true }),
]);
const CANDIDATES = Object.freeze([
  Object.freeze({ id: 'weighty', label: 'Weighty' }),
  Object.freeze({ id: 'energetic', label: 'Energetic' }),
  Object.freeze({ id: 'physical', label: 'Physical' }),
]);
const SCENARIOS = Object.freeze([
  'single-d20',
  'bless-mixed-attack',
  'ordinary-damage',
  'critical-damage',
  'great-weapon-fighting',
  'duplicate-release',
  'missing-release',
  'reduced-motion',
  'provider-failure',
]);
const GRAB_POINTS = Object.freeze([
  Object.freeze({ id: 'center', x: 0.5, y: 0.5 }),
  Object.freeze({ id: 'off-center', x: 0.58, y: 0.44 }),
]);
const TRAY_SAMPLES = Object.freeze([
  Object.freeze({
    id: 'center',
    point: (box) => [box.x + box.width / 2, box.y + box.height / 2],
  }),
  Object.freeze({
    id: 'quarter',
    point: (box) => [box.x + box.width / 4, box.y + box.height / 2],
  }),
  Object.freeze({
    id: 'edge',
    point: (box) => [
      box.x + box.width - Math.min(24, box.width * 0.05),
      box.y + box.height / 2,
    ],
  }),
]);

const [urlArgument, outputArgument, ...extraArguments] = process.argv.slice(2);
if (!urlArgument || !outputArgument || extraArguments.length > 0) {
  console.error(
    'usage: node scripts/attack-die/measure-shared-table-attachment.mjs <url> <output-json>'
  );
  process.exit(2);
}

let targetUrl;
try {
  targetUrl = new URL(urlArgument);
  if (!['http:', 'https:'].includes(targetUrl.protocol))
    throw Error('URL must use HTTP or HTTPS');
} catch (error) {
  console.error(
    `invalid measurement URL: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(2);
}
const outputPath = resolve(outputArgument);

function round(value) {
  return Number(value.toFixed(6));
}

function safeMessage(value) {
  const text = value instanceof Error ? value.message : String(value);
  return text.length <= 2_000 ? text : `${text.slice(0, 1_997)}...`;
}

class GlobalDeadlineError extends Error {}

const measurementStartedAt = Date.now();
const interrupt = new AbortController();

function globalTimeRemainingMs() {
  return Math.max(0, TIMEOUTS.globalMs - (Date.now() - measurementStartedAt));
}

function assertGlobalTimeRemaining(label) {
  if (interrupt.signal.aborted)
    throw new GlobalDeadlineError(`measurement interrupted during ${label}`);
  if (globalTimeRemainingMs() === 0)
    throw new GlobalDeadlineError(
      `global measurement deadline (${TIMEOUTS.globalMs}ms) exceeded during ${label}`
    );
}

async function withTimeout(label, timeoutMs, operation) {
  assertGlobalTimeRemaining(label);
  const remainingMs = globalTimeRemainingMs();
  const effectiveTimeoutMs = Math.min(timeoutMs, remainingMs);
  const isGlobalDeadline = remainingMs <= timeoutMs;
  let timer;
  let removeAbortListener = () => undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              isGlobalDeadline
                ? new GlobalDeadlineError(
                    `global measurement deadline (${TIMEOUTS.globalMs}ms) exceeded during ${label}`
                  )
                : new Error(`step timeout (${timeoutMs}ms) during ${label}`)
            ),
          effectiveTimeoutMs
        );
        const abort = () =>
          reject(
            new GlobalDeadlineError(`measurement interrupted during ${label}`)
          );
        interrupt.signal.addEventListener('abort', abort, { once: true });
        removeAbortListener = () =>
          interrupt.signal.removeEventListener('abort', abort);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    removeAbortListener();
  }
}

async function closeWithinTimeout(label, operation) {
  try {
    await Promise.race([
      operation(),
      new Promise((resolve) => setTimeout(resolve, TIMEOUTS.cleanupMs)),
    ]);
  } catch {
    // Cleanup is best-effort; the enclosing browser close is the final fallback.
  }
}

function configurePage(page) {
  page.setDefaultTimeout(TIMEOUTS.stepMs);
  page.setDefaultNavigationTimeout(TIMEOUTS.stepMs);
}

function selectorAttribute(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function exactTargetSelector(dieId, rendererGeneration) {
  return `${TARGET_SELECTOR}[data-roll-group-die-id="${selectorAttribute(
    dieId
  )}"][data-renderer-generation="${selectorAttribute(rendererGeneration)}"]`;
}

async function systemChromiumExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next system browser candidate.
    }
  }
  throw Error(
    'system Chromium was not found; set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'
  );
}

async function waitAnimationFrames(page, count = 2) {
  await withTimeout(`wait for ${count} animation frames`, TIMEOUTS.stepMs, () =>
    page.evaluate(
      (frameCount) =>
        new Promise((resolveFrame) => {
          let remaining = frameCount;
          const advance = () => {
            remaining -= 1;
            if (remaining === 0) resolveFrame();
            else requestAnimationFrame(advance);
          };
          requestAnimationFrame(advance);
        }),
      count
    )
  );
}

function createPageDiagnostics(page, records) {
  let context = 'unassigned';
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    records.consoleErrors.push({
      context,
      message: safeMessage(message.text()),
    });
  });
  page.on('pageerror', (error) => {
    records.pageErrors.push({ context, message: safeMessage(error) });
  });
  page.on('requestfailed', (request) => {
    let path = 'unparseable';
    try {
      path = new URL(request.url()).pathname;
    } catch {
      // Keep the safe fallback rather than retaining an arbitrary URL.
    }
    records.requestFailures.push({
      context,
      resourceType: request.resourceType(),
      path,
      message: safeMessage(
        request.failure()?.errorText ?? 'unknown request failure'
      ),
    });
  });
  return (nextContext) => {
    context = nextContext;
  };
}

async function openStage(
  page,
  setDiagnosticContext,
  viewport,
  candidate,
  scenario
) {
  await withTimeout(
    `open ${viewport.id}/${candidate.id}/${scenario}`,
    TIMEOUTS.stageMs,
    async () => {
      setDiagnosticContext(`${viewport.id}/${candidate.id}/${scenario}`);
      await page.goto(targetUrl.href, {
        waitUntil: 'networkidle',
        timeout: TIMEOUTS.stepMs,
      });
      await page
        .getByRole('heading', {
          name: 'Shared table dice feel lab',
          exact: true,
        })
        .waitFor({ state: 'visible', timeout: TIMEOUTS.stepMs });

      const radio = page.getByRole('radio', {
        name: candidate.label,
        exact: true,
      });
      if (!(await radio.isChecked())) await radio.check();
      const scenarioSelect = page.getByLabel('Scenario', { exact: true });
      if ((await scenarioSelect.inputValue()) !== scenario)
        await scenarioSelect.selectOption(scenario);

      await page
        .locator(
          '[data-testid="roll-group-presentation"][data-witness-role="roller"]'
        )
        .waitFor({ state: 'attached', timeout: TIMEOUTS.stepMs });
      await page.waitForLoadState('networkidle', { timeout: TIMEOUTS.stepMs });
      await waitAnimationFrames(page);
    }
  );
}

async function inspectResponsiveState(page, viewport) {
  const state = await withTimeout(
    `inspect ${viewport.id} responsive state`,
    TIMEOUTS.stepMs,
    () =>
      page.evaluate(() => {
        const tabs = document.querySelector(
          '.shared-table-dice-stage__witness-tabs'
        );
        const controls = document.querySelector(
          '.shared-table-dice-stage__controls'
        );
        const witnesses = document.querySelector(
          '.shared-table-dice-stage__witnesses'
        );
        const roller = document.querySelector('[data-witness-pane="roller"]');
        const spectator = document.querySelector(
          '[data-witness-pane="spectator"]'
        );
        const header = document.querySelector(
          '.shared-table-dice-stage__header'
        );
        if (
          !tabs ||
          !controls ||
          !witnesses ||
          !roller ||
          !spectator ||
          !header
        )
          return { failure: 'responsive stage elements are missing' };
        const visible = (element) =>
          getComputedStyle(element).display !== 'none';
        const controlsRect = controls.getBoundingClientRect();
        const witnessesRect = witnesses.getBoundingClientRect();
        return {
          tabsVisible: visible(tabs),
          rollerVisible: visible(roller),
          spectatorVisible: visible(spectator),
          controlsAboveWitnesses: controlsRect.bottom <= witnessesRect.top,
          headerColumns:
            getComputedStyle(header).gridTemplateColumns.split(' ').length,
        };
      })
  );
  if ('failure' in state) throw Error(state.failure);
  if (!state.controlsAboveWitnesses)
    throw Error(
      `${viewport.id} controls do not remain above the witness trays`
    );

  if (viewport.id === 'desktop') {
    if (state.tabsVisible || !state.rollerVisible || !state.spectatorVisible)
      throw Error(
        'desktop must show both panes without the narrow tab switcher'
      );
    if (state.headerColumns < 2)
      throw Error('desktop header did not retain two columns');
  } else if (viewport.id === 'stack-boundary') {
    if (state.tabsVisible || !state.rollerVisible || !state.spectatorVisible)
      throw Error(
        '1024px boundary must show both panes without the narrow tab switcher'
      );
    if (state.headerColumns !== 1)
      throw Error('1024px boundary header did not stack');
  } else {
    if (!state.tabsVisible || !state.rollerVisible || state.spectatorVisible)
      throw Error(
        'narrow touch state must initially show only the Roller pane and tabs'
      );
    await page.getByRole('tab', { name: 'Witness', exact: true }).click();
    const switched = await withTimeout(
      'inspect narrow witness tab state',
      TIMEOUTS.stepMs,
      () =>
        page.evaluate(() => ({
          roller: getComputedStyle(
            document.querySelector('[data-witness-pane="roller"]')
          ).display,
          spectator: getComputedStyle(
            document.querySelector('[data-witness-pane="spectator"]')
          ).display,
        }))
    );
    if (switched.roller !== 'none' || switched.spectator === 'none')
      throw Error('narrow Witness tab did not swap the visible pane');
    await page.getByRole('tab', { name: 'Roller', exact: true }).click();
  }

  return {
    viewport: viewport.id,
    passed: true,
    mode: viewport.id === 'narrow-touch' ? 'tabbed-single-pane' : 'two-pane',
  };
}

async function enumerateTargets(page) {
  const targets = await withTimeout(
    'enumerate stable Roller die targets',
    TIMEOUTS.stepMs,
    () =>
      page.locator(TARGET_SELECTOR).evaluateAll((nodes) =>
        nodes.map((node) => ({
          dieId: node.getAttribute('data-roll-group-die-id'),
          rendererGeneration: node.getAttribute('data-renderer-generation'),
          tagName: node.tagName.toLowerCase(),
        }))
      )
  );
  if (targets.length === 0) throw Error('no Roller die targets were rendered');
  const identities = new Set();
  for (const target of targets) {
    if (!target.dieId || !target.rendererGeneration)
      throw Error(
        'Roller die target is missing a stable die/generation identity'
      );
    if (target.tagName !== 'button')
      throw Error(`interactive Roller target ${target.dieId} is not a button`);
    const key = `${target.rendererGeneration}:${target.dieId}`;
    if (identities.has(key))
      throw Error(`duplicate Roller target identity ${key}`);
    identities.add(key);
  }
  return targets;
}

async function readAttachmentObservation(page, identity, previous) {
  return withTimeout(
    `read rendered attachment evidence for ${identity.dieId}`,
    TIMEOUTS.stepMs,
    () =>
      page.evaluate(
        async ({ expected, prior }) => {
          await new Promise((resolveFrame) =>
            requestAnimationFrame(() => requestAnimationFrame(resolveFrame))
          );
          const evidence = window.__sharedTableDiceEvidence;
          if (!evidence) return { status: 'missing' };
          if (
            evidence.dieId !== expected.dieId ||
            String(evidence.rendererGeneration) !==
              expected.rendererGeneration ||
            evidence.witnessRole !== 'roller'
          )
            return {
              status: 'stale',
              observedDieId: evidence.dieId,
              observedRendererGeneration: String(evidence.rendererGeneration),
            };
          if (
            !Number.isSafeInteger(evidence.revision) ||
            !Number.isSafeInteger(evidence.frameSequence) ||
            !Array.isArray(evidence.projectedAnchor) ||
            evidence.projectedAnchor.length !== 2 ||
            !evidence.projectedAnchor.every(Number.isFinite)
          )
            return { status: 'invalid' };
          if (
            evidence.revision <= prior.revision ||
            evidence.frameSequence <= prior.frameSequence
          )
            return { status: 'stale' };
          return {
            status: 'ok',
            revision: evidence.revision,
            frameSequence: evidence.frameSequence,
            heldPoseApplied: evidence.heldPoseApplied,
            projectedAnchor: [...evidence.projectedAnchor],
          };
        },
        { expected: identity, prior: previous }
      )
  );
}

async function attachmentEvidenceWatermark(page, identity) {
  return withTimeout(
    `read attachment watermark for ${identity.dieId}`,
    TIMEOUTS.stepMs,
    () =>
      page.evaluate((expected) => {
        const evidence = window.__sharedTableDiceEvidence;
        return evidence &&
          evidence.dieId === expected.dieId &&
          String(evidence.rendererGeneration) === expected.rendererGeneration &&
          evidence.witnessRole === 'roller' &&
          Number.isSafeInteger(evidence.revision) &&
          Number.isSafeInteger(evidence.frameSequence)
          ? {
              revision: evidence.revision,
              frameSequence: evidence.frameSequence,
            }
          : { revision: 0, frameSequence: 0 };
      }, identity)
  );
}

async function replayStage(
  page,
  setDiagnosticContext,
  viewport,
  candidate,
  scenario
) {
  await withTimeout(
    `replay ${viewport.id}/${candidate.id}/${scenario}`,
    TIMEOUTS.stageMs,
    async () => {
      setDiagnosticContext(`${viewport.id}/${candidate.id}/${scenario}`);
      await page.getByRole('button', { name: 'Replay', exact: true }).click();
      await page
        .locator(
          '[data-testid="roll-group-presentation"][data-witness-role="roller"]'
        )
        .waitFor({ state: 'attached', timeout: TIMEOUTS.stepMs });
      await waitAnimationFrames(page);
    }
  );
}

async function measureProbe({
  page,
  setDiagnosticContext,
  viewport,
  candidate,
  dieId,
  grabPoint,
  samples,
}) {
  // Replay the mounted fixture instead of navigating. Navigation can cancel an
  // in-flight provisional asset fetch and report a harness-induced ERR_ABORTED.
  await replayStage(
    page,
    setDiagnosticContext,
    viewport,
    candidate,
    MEASUREMENT_SCENARIO
  );
  setDiagnosticContext(`${viewport.id}/attachment/${dieId}/${grabPoint.id}`);
  const currentTargets = await enumerateTargets(page);
  const identity = currentTargets.find((target) => target.dieId === dieId);
  if (!identity) throw Error(`measurement rerender omitted die ${dieId}`);

  const target = page.locator(
    exactTargetSelector(identity.dieId, identity.rendererGeneration)
  );
  if ((await target.count()) !== 1)
    throw Error(
      `stable target selector did not resolve exactly once for ${dieId}`
    );
  await target.scrollIntoViewIfNeeded();
  await waitAnimationFrames(page);
  const targetBox = await target.boundingBox();
  const surface = target.locator(
    'xpath=ancestor::*[@data-testid="roll-group-tray-surface"]'
  );
  const surfaceBox = await surface.boundingBox();
  if (!targetBox || !surfaceBox)
    throw Error(`${dieId} has no measurable browser bounds`);

  const start = {
    x: targetBox.x + targetBox.width * grabPoint.x,
    y: targetBox.y + targetBox.height * grabPoint.y,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  let previous = await attachmentEvidenceWatermark(page, identity);
  try {
    if ((await surface.getAttribute('data-grabbed')) !== 'true')
      throw Error(
        `${dieId} ${grabPoint.id} pointer-down did not acquire the tray`
      );
    for (const traySample of TRAY_SAMPLES) {
      const [clientX, clientY] = traySample.point(surfaceBox);
      // This is probe-owned and intentionally stays local: output contains only
      // aggregate/sample error, never pointer coordinates or pointer history.
      const probePointer = Object.freeze({ clientX, clientY });
      await page.mouse.move(probePointer.clientX, probePointer.clientY);
      const observation = await readAttachmentObservation(
        page,
        identity,
        previous
      );
      const sample = {
        viewport: viewport.id,
        dieId,
        rendererGeneration: Number(identity.rendererGeneration),
        grabPoint: grabPoint.id,
        traySample: traySample.id,
        errorCssPx: null,
      };
      if (observation.status !== 'ok') {
        samples.push({ ...sample, failure: observation.status });
        continue;
      }
      previous = {
        revision: observation.revision,
        frameSequence: observation.frameSequence,
      };
      if (observation.heldPoseApplied !== true) {
        samples.push({ ...sample, failure: 'held-pose-not-applied' });
        continue;
      }
      const error = Math.hypot(
        observation.projectedAnchor[0] - probePointer.clientX,
        observation.projectedAnchor[1] - probePointer.clientY
      );
      samples.push({ ...sample, errorCssPx: round(error) });
    }
  } finally {
    await page.mouse.up().catch(() => undefined);
  }
}

async function runAttachmentMeasurements({
  page,
  setDiagnosticContext,
  viewport,
  candidate,
  samples,
}) {
  await openStage(
    page,
    setDiagnosticContext,
    viewport,
    candidate,
    MEASUREMENT_SCENARIO
  );
  const targets = await enumerateTargets(page);
  for (const target of targets) {
    for (const grabPoint of GRAB_POINTS) {
      await measureProbe({
        page,
        setDiagnosticContext,
        viewport,
        candidate,
        dieId: target.dieId,
        grabPoint,
        samples,
      });
    }
  }
  return targets.length;
}

async function advanceNarrowWitnessFrame(page, phase, scenario) {
  await withTimeout(
    `render narrow Witness completion for ${scenario}`,
    TIMEOUTS.stepMs,
    async () => {
      await page.getByRole('tab', { name: 'Witness', exact: true }).click();
      const deadline = Date.now() + TIMEOUTS.stepMs;
      while (Date.now() < deadline) {
        const text =
          (await phase.textContent())?.replace(/\s+/g, ' ').trim() ?? '';
        if (!text.includes('1 of 2 witnesses complete')) return;
        await page.waitForTimeout(50);
      }
      throw Error(`${scenario} Witness completion did not render`);
    }
  );
  await page.getByRole('tab', { name: 'Roller', exact: true }).click();
}

async function runScenario(page, viewport, scenario) {
  const phase = page.getByTestId('shared-table-dice-phase');
  const rollerPane = page.locator('[data-witness-pane="roller"]');
  const deadline = Date.now() + TIMEOUTS.scenarioMs;
  const clickedGenerations = new Set();
  let releaseActions = 0;

  while (Date.now() < deadline) {
    const text = (await phase.textContent())?.replace(/\s+/g, ' ').trim() ?? '';
    if (text.includes('playback complete')) {
      const totals = await page
        .getByTestId('roll-group-total')
        .allTextContents();
      if (totals.length !== 2 || totals[0] !== totals[1])
        throw Error(
          `${scenario} did not preserve equal supplied totals for both witnesses`
        );

      if (viewport.id === 'narrow-touch') {
        if (!(await rollerPane.getByTestId('roll-group-total').isVisible()))
          throw Error(
            `${scenario} Roller total is not visible in narrow state`
          );
        await page.getByRole('tab', { name: 'Witness', exact: true }).click();
        const spectatorTotal = page
          .locator('[data-witness-pane="spectator"]')
          .getByTestId('roll-group-total');
        if (!(await spectatorTotal.isVisible()))
          throw Error(
            `${scenario} Witness total is not visible after tab switch`
          );
      } else if ((await page.getByTestId('roll-group-total').count()) !== 2) {
        throw Error(`${scenario} desktop witness totals are incomplete`);
      }

      const semanticCount = await page
        .getByTestId('semantic-roll-group')
        .count();
      const renderer = semanticCount > 0 ? 'semantic' : '3d';
      if (scenario === 'provider-failure' && renderer !== 'semantic')
        throw Error('provider-failure did not use truthful semantic fallback');
      if (scenario !== 'provider-failure' && renderer !== '3d')
        throw Error(`${scenario} unexpectedly fell back from the 3D renderer`);
      return { releaseActions, renderer };
    }

    if (
      viewport.id === 'narrow-touch' &&
      text.includes('1 of 2 witnesses complete')
    ) {
      await advanceNarrowWitnessFrame(page, phase, scenario);
      continue;
    }

    const presentation = rollerPane.locator(
      '[data-testid="roll-group-presentation"][data-renderer-generation]'
    );
    const generation = await presentation.getAttribute(
      'data-renderer-generation'
    );
    if (generation && !clickedGenerations.has(generation)) {
      const dieTarget = rollerPane.locator(TARGET_SELECTOR).first();
      if (await dieTarget.isVisible().catch(() => false)) {
        try {
          await dieTarget.scrollIntoViewIfNeeded();
          const box = await dieTarget.boundingBox();
          if (!box) throw Error(`${scenario} Roller die target has no bounds`);
          const start = {
            x: box.x + box.width / 2,
            y: box.y + box.height / 2,
          };
          await page.mouse.move(start.x, start.y);
          await page.mouse.down();
          await page.mouse.move(start.x + 8, start.y + 4);
          await page.mouse.up();
          clickedGenerations.add(generation);
          releaseActions += 1;
          continue;
        } catch (error) {
          if (!safeMessage(error).includes('not attached to the DOM'))
            throw error;
          continue;
        }
      }
      const rollButton = rollerPane.getByRole('button', {
        name: 'Roll dice',
        exact: true,
      });
      if (await rollButton.isVisible().catch(() => false)) {
        await rollButton.press('Enter');
        clickedGenerations.add(generation);
        releaseActions += 1;
        continue;
      }
    }
    assertGlobalTimeRemaining(`run ${scenario}`);
    await page.waitForTimeout(50);
  }
  throw Error(
    `${scenario} did not reach playback complete within ${TIMEOUTS.scenarioMs}ms`
  );
}

async function sweepScenarios({
  context,
  page,
  setDiagnosticContext,
  viewport,
  records,
  results,
  failures,
}) {
  const pending = CANDIDATES.flatMap((candidate) =>
    SCENARIOS.map((scenario) => ({ candidate, scenario }))
  );
  const workers = [
    { page, setDiagnosticContext, closeWhenDone: false },
    ...(await Promise.all(
      Array.from(
        { length: Math.min(SCENARIO_WORKER_COUNT - 1, pending.length - 1) },
        async () => {
          const workerPage = await withTimeout(
            `create ${viewport.id} scenario worker page`,
            TIMEOUTS.stepMs,
            () => context.newPage()
          );
          configurePage(workerPage);
          return {
            page: workerPage,
            setDiagnosticContext: createPageDiagnostics(workerPage, records),
            closeWhenDone: true,
          };
        }
      )
    )),
  ];

  await Promise.all(
    workers.map(async (worker) => {
      try {
        while (pending.length > 0) {
          assertGlobalTimeRemaining(`schedule ${viewport.id} scenario sweep`);
          const next = pending.shift();
          if (!next) return;
          const identity = {
            viewport: viewport.id,
            candidate: next.candidate.id,
            scenario: next.scenario,
          };
          try {
            await openStage(
              worker.page,
              worker.setDiagnosticContext,
              viewport,
              next.candidate,
              next.scenario
            );
            const outcome = await withTimeout(
              `run ${viewport.id}/${next.candidate.id}/${next.scenario}`,
              TIMEOUTS.scenarioMs,
              () => runScenario(worker.page, viewport, next.scenario)
            );
            results.push({ ...identity, passed: true, ...outcome });
          } catch (error) {
            if (error instanceof GlobalDeadlineError) throw error;
            const failure = { ...identity, message: safeMessage(error) };
            failures.push(failure);
            results.push({ ...identity, passed: false });
          }
        }
      } finally {
        if (worker.closeWhenDone)
          await closeWithinTimeout(
            `close ${viewport.id} scenario worker page`,
            () => worker.page.close()
          );
      }
    })
  );
}

async function writeResult(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.task9-${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

const generatedAt = new Date().toISOString();
const records = {
  consoleErrors: [],
  pageErrors: [],
  requestFailures: [],
};
const attachmentSamples = [];
const responsiveStates = [];
const sweepResults = [];
const sweepFailures = [];
const fatalErrors = [];
const measuredMemberCounts = [];
let browser;
let executablePath;
let browserVersion;
const signalHandlers = new Map();
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  const handler = () => interrupt.abort();
  signalHandlers.set(signal, handler);
  process.once(signal, handler);
}

try {
  executablePath = await systemChromiumExecutable();
  browser = await withTimeout('launch system Chromium', TIMEOUTS.stepMs, () =>
    chromium.launch({
      executablePath,
      headless: true,
      timeout: TIMEOUTS.stepMs,
    })
  );
  browserVersion = browser.version();

  for (const viewport of VIEWPORTS) {
    assertGlobalTimeRemaining(`start ${viewport.id} viewport`);
    const context = await withTimeout(
      `create ${viewport.id} browser context`,
      TIMEOUTS.stepMs,
      () =>
        browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: 1,
          hasTouch: viewport.touch,
          isMobile: viewport.touch,
        })
    );
    const page = await withTimeout(
      `create ${viewport.id} browser page`,
      TIMEOUTS.stepMs,
      () => context.newPage()
    );
    configurePage(page);
    const setDiagnosticContext = createPageDiagnostics(page, records);
    try {
      const measurementCandidate = CANDIDATES.find(
        (candidate) => candidate.id === MEASUREMENT_CANDIDATE
      );
      if (!measurementCandidate)
        throw Error(`missing measurement candidate ${MEASUREMENT_CANDIDATE}`);
      await openStage(
        page,
        setDiagnosticContext,
        viewport,
        measurementCandidate,
        'single-d20'
      );
      responsiveStates.push(await inspectResponsiveState(page, viewport));
      const memberCount = await runAttachmentMeasurements({
        page,
        setDiagnosticContext,
        viewport,
        candidate: measurementCandidate,
        samples: attachmentSamples,
      });
      measuredMemberCounts.push({ viewport: viewport.id, memberCount });
      await sweepScenarios({
        context,
        page,
        setDiagnosticContext,
        viewport,
        records,
        results: sweepResults,
        failures: sweepFailures,
      });
    } catch (error) {
      fatalErrors.push({ viewport: viewport.id, message: safeMessage(error) });
    } finally {
      await closeWithinTimeout(`close ${viewport.id} browser context`, () =>
        context.close()
      );
    }
  }
} catch (error) {
  fatalErrors.push({ viewport: 'harness', message: safeMessage(error) });
} finally {
  for (const [signal, handler] of signalHandlers)
    process.removeListener(signal, handler);
  if (browser)
    await closeWithinTimeout('close system Chromium', () => browser.close());
}

const scenarioOrder = new Map(
  CANDIDATES.flatMap((candidate, candidateIndex) =>
    SCENARIOS.map((scenario, scenarioIndex) => [
      `${candidate.id}:${scenario}`,
      candidateIndex * SCENARIOS.length + scenarioIndex,
    ])
  )
);
const compareScenarioEntries = (first, second) =>
  first.viewport.localeCompare(second.viewport) ||
  (scenarioOrder.get(`${first.candidate}:${first.scenario}`) ?? Infinity) -
    (scenarioOrder.get(`${second.candidate}:${second.scenario}`) ?? Infinity);
sweepResults.sort(compareScenarioEntries);
sweepFailures.sort(compareScenarioEntries);

const finiteErrors = attachmentSamples
  .map((sample) => sample.errorCssPx)
  .filter((value) => typeof value === 'number' && Number.isFinite(value));
const maximumErrorCssPx =
  finiteErrors.length > 0 ? round(Math.max(...finiteErrors)) : null;
const failedAttachmentSamples = attachmentSamples.filter(
  (sample) =>
    sample.failure !== undefined ||
    sample.errorCssPx === null ||
    sample.errorCssPx > ATTACHMENT_LIMIT_CSS_PX
);
const expectedSweepRuns =
  VIEWPORTS.length * CANDIDATES.length * SCENARIOS.length;
const attachmentPassed =
  fatalErrors.length === 0 &&
  attachmentSamples.length > 0 &&
  failedAttachmentSamples.length === 0 &&
  maximumErrorCssPx !== null &&
  maximumErrorCssPx <= ATTACHMENT_LIMIT_CSS_PX;
const sweepPassed =
  sweepResults.length === expectedSweepRuns && sweepFailures.length === 0;
const responsivePassed =
  responsiveStates.length === VIEWPORTS.length &&
  responsiveStates.every((state) => state.passed);
const runtimePassed =
  records.consoleErrors.length === 0 &&
  records.pageErrors.length === 0 &&
  records.requestFailures.length === 0;
const passed =
  attachmentPassed &&
  sweepPassed &&
  responsivePassed &&
  runtimePassed &&
  fatalErrors.length === 0;

const result = {
  schemaVersion: 1,
  generatedAt,
  url: targetUrl.href,
  browser: {
    engine: 'Chromium',
    version: browserVersion ?? null,
    executablePath: executablePath ?? null,
  },
  timeouts: {
    globalMs: TIMEOUTS.globalMs,
    stepMs: TIMEOUTS.stepMs,
    stageMs: TIMEOUTS.stageMs,
    scenarioMs: TIMEOUTS.scenarioMs,
    cleanupMs: TIMEOUTS.cleanupMs,
    scenarioWorkerCount: SCENARIO_WORKER_COUNT,
    elapsedMs: Date.now() - measurementStartedAt,
  },
  viewports: VIEWPORTS.map(({ id, width, height, touch }) => ({
    id,
    width,
    height,
    touch,
    deviceScaleFactor: 1,
  })),
  attachment: {
    scenario: MEASUREMENT_SCENARIO,
    candidate: MEASUREMENT_CANDIDATE,
    selector: TARGET_SELECTOR,
    limitCssPx: ATTACHMENT_LIMIT_CSS_PX,
    grabPoints: GRAB_POINTS.map(({ id }) => id),
    traySamples: TRAY_SAMPLES.map(({ id }) => id),
    measuredMemberCounts,
    sampleCount: attachmentSamples.length,
    failedSampleCount: failedAttachmentSamples.length,
    maximumErrorCssPx,
    passed: attachmentPassed,
    samples: attachmentSamples,
  },
  responsive: {
    passed: responsivePassed,
    states: responsiveStates,
  },
  sweep: {
    candidates: CANDIDATES.map(({ id }) => id),
    scenarios: [...SCENARIOS],
    expectedRunCount: expectedSweepRuns,
    runCount: sweepResults.length,
    passedRunCount: sweepResults.filter((entry) => entry.passed).length,
    passed: sweepPassed,
    failures: sweepFailures,
    results: sweepResults,
  },
  runtime: {
    passed: runtimePassed,
    consoleErrors: records.consoleErrors,
    pageErrors: records.pageErrors,
    requestFailures: records.requestFailures,
  },
  fatalErrors,
  passed,
};

await writeResult(outputPath, result);
console.log(
  `browser: Chromium ${browserVersion ?? 'unavailable'} (${executablePath ?? 'unavailable'})`
);
console.log(
  `attachment: ${attachmentSamples.length} samples; maximum ${
    maximumErrorCssPx === null ? 'unavailable' : maximumErrorCssPx
  } CSS px; limit ${ATTACHMENT_LIMIT_CSS_PX}; ${attachmentPassed ? 'PASS' : 'FAIL'}`
);
console.log(
  `scenario sweep: ${result.sweep.passedRunCount}/${expectedSweepRuns}; responsive ${responsiveStates.length}/${VIEWPORTS.length}; ${
    sweepPassed && responsivePassed ? 'PASS' : 'FAIL'
  }`
);
console.log(
  `runtime errors: ${records.consoleErrors.length} console, ${records.pageErrors.length} page, ${records.requestFailures.length} request`
);
console.log(`output: ${outputPath}`);
if (!passed) process.exitCode = 1;
