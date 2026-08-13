import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performanceExitCode } from '../../src/dev/attackDiePerfProtocol';

export interface PairedOutcome {
  status: 'pass' | 'failed';
  category: string;
  error?: { name: string; message: string };
  artifactWritten?: boolean;
}
export async function writeProfileArtifact(
  out: string,
  category: string,
  artifact: unknown
) {
  await mkdir(out, { recursive: true });
  await writeFile(
    resolve(out, `performance-${category}.json`),
    `${JSON.stringify(artifact, null, 2)}\n`
  );
}
export async function runProfileAttempts<T extends { category: string }>(
  profiles: T[],
  out: string,
  run: (profile: T) => Promise<PairedOutcome>,
  options: {
    writeArtifact?: typeof writeProfileArtifact;
    onDiagnostic?: (message: string) => void;
  } = {}
): Promise<{ outcomes: PairedOutcome[]; exitCode: 0 | 1 }> {
  const outcomes: PairedOutcome[] = [];
  for (const profile of profiles) {
    try {
      outcomes.push(await run(profile));
    } catch (value) {
      const error = value instanceof Error ? value : Error(String(value));
      const failed: PairedOutcome = {
        status: 'failed',
        category: profile.category,
        error: { name: error.name, message: error.message },
      };
      try {
        await (options.writeArtifact ?? writeProfileArtifact)(
          out,
          profile.category,
          { schemaVersion: 1, kind: 'attack-die-paired-performance', ...failed }
        );
        failed.artifactWritten = true;
      } catch (writeError) {
        failed.artifactWritten = false;
        options.onDiagnostic?.(
          `failed to write ${profile.category} artifact: ${writeError instanceof Error ? writeError.message : String(writeError)}`
        );
      }
      outcomes.push(failed);
    }
  }
  return { outcomes, exitCode: performanceExitCode(outcomes) };
}

export interface PerfCountersSnapshot {
  readyAtMs: number | null;
  activeContextIds: number[];
  rendererInfo: { geometries: number; textures: number; programs: number };
}
export function releasedCounters(counters: {
  activeContextIds: number[];
  rendererInfo: {
    geometries: number | null;
    textures: number | null;
    programs: number | null;
  };
  contextLifecycles: Record<
    number,
    import('../../src/dev/attackDiePerfProtocol').AttackDieContextLifecycle
  >;
}) {
  return {
    contextsActive: counters.activeContextIds.length,
    geometries: counters.rendererInfo.geometries,
    textures: counters.rendererInfo.textures,
    programs: counters.rendererInfo.programs,
  };
}
export async function measurePostUnmount(
  page: { evaluate<T, A>(fn: (arg: A) => T | Promise<T>, arg: A): Promise<T> },
  input: { mode: 'svg' | '3d'; token: number; windowMs: number }
) {
  return page.evaluate(async ({ mode, token, windowMs }) => {
    const perf = window.__attackDiePerf;
    if (!perf) throw Error('attack die performance driver unavailable');
    perf.runSample({ mode, result: 20, reducedMotion: false, token });
    await new Promise((done) => setTimeout(done, 100));
    perf.unmountDie();
    const deltas: number[] = [];
    let last = performance.now();
    const start = last;
    await new Promise<void>((done) => {
      const frame = (now: number) => {
        deltas.push(now - last);
        last = now;
        if (now - start >= windowMs) done();
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    deltas.sort((a, b) => a - b);
    const counters = perf.readCounters();
    return {
      p95FrameTimeMs: deltas[Math.ceil(deltas.length * 0.95) - 1] ?? 0,
      frameCount: deltas.length,
      counters,
      readyMs: counters.readyAtMs,
      decodeMs: null,
      decodeMsLimitation:
        'Three.js loader does not expose a separate portable decode interval through this harness.',
      heapBytes:
        (performance as Performance & { memory?: { usedJSHeapSize: number } })
          .memory?.usedJSHeapSize ?? null,
    };
  }, input);
}
