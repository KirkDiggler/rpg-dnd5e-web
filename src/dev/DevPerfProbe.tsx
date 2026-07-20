/**
 * DevPerfProbe — dev-only runtime performance probe for the real game
 * route (rpg-dnd5e-web#537's "performance measurement foundation": mesh
 * budgets in the asset pipeline + a runtime probe here, so future asset
 * PRs can diff their impact against a committed baseline instead of
 * guessing).
 *
 * Mounted via `EncounterMap`'s `<HexGrid>` `children` slot (the same slot
 * `PlaytestHarness`'s Synty showcase already uses) -- this is the ONLY
 * wiring point this feature touches; everything else lives in this one
 * new file. Gated behind `import.meta.env.MODE === 'development'` (the
 * same gate `App.tsx`'s `showPlaytestHarness`/`isDevelopment` flags use)
 * AND a `?perfProbe` query flag, read the exact same way HexGrid's
 * existing `?syntyDungeon=0` flag is (`EncounterMap.tsx`: raw
 * `new URLSearchParams(window.location.search).get(...)`, read once via
 * `useMemo`, no router/useSearchParams -- this app has neither).
 *
 * WHY IT NEEDS `invalidate()` EVERY FRAME
 * ----------------------------------------
 * HexGrid's `<Canvas>` runs `frameloop="demand"` -- it only renders (and
 * only updates `gl.info`) when something calls `invalidate()`. Without
 * this probe forcing a render every frame for the sampling window, the
 * canvas would sit idle and `renderer.info`/frame-time samples would be
 * empty or stale. Same trick `ClassCharacterModel.tsx`'s idle-clip
 * playback already uses (`useFrame((state) => { if (hasIdleClip)
 * state.invalidate(); })`) -- copied verbatim, not reinvented.
 *
 * WHAT GETS MEASURED
 * -------------------
 * Every frame during a fixed sampling window (`windowMs`, default 8000ms):
 *   - wall-clock frame-to-frame delta (via `performance.now()`, not
 *     r3f's `delta` arg, so results are comparable to the browser's own
 *     frame-timing APIs a human would sanity-check against)
 *   - `gl.info.render.{calls,triangles,lines,points}` -- these are the
 *     LAST-COMPLETED-RENDER counters (three.js resets them at the start
 *     of each `render()` call), so sampling them every frame and
 *     reporting mean/max captures any true frame-to-frame variance
 *     (e.g. future frustum culling) rather than a single point-in-time
 *     snapshot.
 * At window end, also snapshots the cumulative resource counts that
 * DON'T reset per frame: `gl.info.memory.{geometries,textures}` and
 * `gl.info.programs?.length` (compiled WebGL program count -- a materials/
 * shader-variety proxy).
 *
 * OUTPUT
 * ------
 * On completion: (1) `console.log`s a single JSON-stringified line
 * prefixed `PERF_PROBE_RESULT:` (a driver script can grep this straight
 * out of Playwright's console listener without any page.evaluate
 * round-trip), (2) stashes the result on `window.__rpgPerfProbeResults`
 * (array, latest-last) AND `window.__rpgPerfProbeLatest` for a driver
 * script that prefers `page.evaluate()`, and (3) triggers a same-page
 * file download of the JSON (a real `<a download>` click, standard
 * browser download trick -- satisfies "downloadable" for interactive/
 * manual use, not just automated driving).
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';

export interface PerfProbeFrameStats {
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
}

export interface PerfProbeRendererCounterStats {
  mean: number;
  max: number;
}

export interface PerfProbeResult {
  probeVersion: 1;
  /** Free-form label the caller supplies (e.g. sweep stage name) so a
   * driver script's captured results are self-describing without
   * needing to correlate against navigation order. */
  label: string | null;
  startedAt: string;
  url: string;
  requestedWindowMs: number;
  actualDurationMs: number;
  frameCount: number;
  frameTimeMs: PerfProbeFrameStats;
  fpsMean: number;
  rendererInfo: {
    calls: PerfProbeRendererCounterStats;
    triangles: PerfProbeRendererCounterStats;
    lines: PerfProbeRendererCounterStats;
    points: PerfProbeRendererCounterStats;
    geometries: number;
    textures: number;
    programs: number;
  };
}

export interface DevPerfProbeProps {
  /** Sampling window length in ms. Default 8000ms -- long enough at a
   * healthy ~60fps (~480 frames) for a meaningful p95/p99, short enough
   * a driver script's sweep doesn't stall for minutes. */
  windowMs?: number;
  /** Free-form label stamped onto the result (see PerfProbeResult.label). */
  label?: string;
  /** Fires once, in addition to the automatic console/window/download
   * dump -- lets a caller inside the app react to completion (unused by
   * the sweep driver, which reads the console line / window global from
   * outside the page instead, but kept for parity with the codebase's
   * callback-prop convention). */
  onComplete?: (result: PerfProbeResult) => void;
}

declare global {
  interface Window {
    __rpgPerfProbeResults?: PerfProbeResult[];
    __rpgPerfProbeLatest?: PerfProbeResult;
  }
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function percentile(sortedAscending: number[], p: number): number {
  if (sortedAscending.length === 0) return 0;
  const idx = (sortedAscending.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, sortedAscending.length - 1);
  const frac = idx - lo;
  return (
    sortedAscending[lo] + (sortedAscending[hi] - sortedAscending[lo]) * frac
  );
}

function frameStats(deltasMs: number[]): PerfProbeFrameStats {
  const sorted = [...deltasMs].sort((a, b) => a - b);
  return {
    mean: mean(deltasMs),
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    min: sorted.length ? sorted[0] : 0,
    max: sorted.length ? sorted[sorted.length - 1] : 0,
  };
}

function counterStats(values: number[]): PerfProbeRendererCounterStats {
  return { mean: mean(values), max: values.length ? Math.max(...values) : 0 };
}

function emitResult(result: PerfProbeResult): void {
  // Grep-able by a Playwright console listener without a page.evaluate
  // round-trip.
  console.log('PERF_PROBE_RESULT:' + JSON.stringify(result));

  window.__rpgPerfProbeResults = window.__rpgPerfProbeResults ?? [];
  window.__rpgPerfProbeResults.push(result);
  window.__rpgPerfProbeLatest = result;

  try {
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stageSlug = (result.label ?? 'window').replace(/[^a-z0-9-]+/gi, '-');
    a.download = `perf-probe-${stageSlug}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    // Downloadable dump is a convenience for manual/interactive use --
    // never let a download failure (e.g. a locked-down headless browser)
    // take down the probe's console/window-global output, which the
    // automated sweep driver actually depends on.
  }
}

interface ProbeState {
  done: boolean;
  startPerf: number | null;
  lastFrameAt: number | null;
  frameDeltasMs: number[];
  calls: number[];
  triangles: number[];
  lines: number[];
  points: number[];
}

function freshState(): ProbeState {
  return {
    done: false,
    startPerf: null,
    lastFrameAt: null,
    frameDeltasMs: [],
    calls: [],
    triangles: [],
    lines: [],
    points: [],
  };
}

export function DevPerfProbe({
  windowMs = 8000,
  label,
  onComplete,
}: DevPerfProbeProps) {
  const { gl } = useThree();
  const stateRef = useRef<ProbeState>(freshState());

  useFrame((r3fState) => {
    const s = stateRef.current;
    if (s.done) return;

    const now = performance.now();
    if (s.startPerf === null) s.startPerf = now;
    if (s.lastFrameAt !== null) s.frameDeltasMs.push(now - s.lastFrameAt);
    s.lastFrameAt = now;

    const info = gl.info;
    s.calls.push(info.render.calls);
    s.triangles.push(info.render.triangles);
    s.lines.push(info.render.lines);
    s.points.push(info.render.points);

    const elapsed = now - s.startPerf;
    if (elapsed >= windowMs) {
      s.done = true;
      const ft = frameStats(s.frameDeltasMs);
      const result: PerfProbeResult = {
        probeVersion: 1,
        label: label ?? null,
        startedAt: new Date(Date.now() - elapsed).toISOString(),
        url: window.location.href,
        requestedWindowMs: windowMs,
        actualDurationMs: elapsed,
        frameCount: s.calls.length,
        frameTimeMs: ft,
        fpsMean: ft.mean > 0 ? 1000 / ft.mean : 0,
        rendererInfo: {
          calls: counterStats(s.calls),
          triangles: counterStats(s.triangles),
          lines: counterStats(s.lines),
          points: counterStats(s.points),
          geometries: info.memory.geometries,
          textures: info.memory.textures,
          programs: info.programs?.length ?? 0,
        },
      };
      emitResult(result);
      onComplete?.(result);
      return;
    }

    // Force the demand-frameloop canvas to keep rendering for the
    // duration of the sampling window -- see module docstring.
    r3fState.invalidate();
  });

  return null;
}
