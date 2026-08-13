// @vitest-environment node
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  measurePostUnmount,
  releasedCounters,
  runProfileAttempts,
} from './attackDiePairedDriver';

describe('paired driver boundaries', () => {
  it('executes the formerly crashing post-unmount path with explicit boundaries/counters', async () => {
    const page = {
      evaluate: async (
        fn: (arg: unknown) => unknown | Promise<unknown>,
        arg: unknown
      ) => {
        const old = {
          performance: globalThis.performance,
          requestAnimationFrame: globalThis.requestAnimationFrame,
          window: (globalThis as never as { window: unknown }).window,
        };
        let now = 0;
        const counters = {
          readyAtMs: 12,
          activeContextIds: [],
          rendererInfo: { geometries: 0, textures: 0, programs: 0 },
        };
        (globalThis as never as { window: unknown }).window = {
          __attackDiePerf: {
            runSample() {},
            unmountDie() {},
            readCounters: () => counters,
          },
        };
        Object.defineProperty(globalThis, 'performance', {
          configurable: true,
          value: { now: () => now, getEntriesByType: () => [] },
        });
        (
          globalThis as never as {
            requestAnimationFrame: (callback: (time: number) => void) => void;
          }
        ).requestAnimationFrame = (cb) => {
          now += 10;
          cb(now);
        };
        try {
          return await fn(arg);
        } finally {
          Object.defineProperty(globalThis, 'performance', {
            configurable: true,
            value: old.performance,
          });
          (
            globalThis as never as { requestAnimationFrame: unknown }
          ).requestAnimationFrame = old.requestAnimationFrame;
          (globalThis as never as { window: unknown }).window = old.window;
        }
      },
    };
    const result = await measurePostUnmount(page as never, {
      mode: '3d',
      token: 2,
      windowMs: 20,
    });
    expect(result).toMatchObject({
      frameCount: 2,
      readyMs: 12,
      counters: { activeContextIds: [] },
    });
  });
  it('writes a truthful failed artifact and aggregates nonzero after an exception', async () => {
    const out = await mkdtemp(join(tmpdir(), 'attack-die-driver-'));
    const result = await runProfileAttempts(
      [{ category: 'desktop-chromium' }],
      out,
      async () => {
        throw Error('post-unmount exploded');
      }
    );
    expect(result.exitCode).toBe(1);
    expect(
      JSON.parse(
        await readFile(join(out, 'performance-desktop-chromium.json'), 'utf8')
      )
    ).toMatchObject({
      status: 'failed',
      error: { message: 'post-unmount exploded' },
    });
  });
});

it('preserves leaking, stale nonzero, unknown, lost, and healthy disposal observations without inferred zeros', () => {
  expect(
    releasedCounters({
      activeContextIds: [],
      rendererInfo: { geometries: 1, textures: 0, programs: 0 },
    }).geometries
  ).toBe(1);
  expect(
    releasedCounters({
      activeContextIds: [],
      rendererInfo: { geometries: null, textures: null, programs: null },
    }).geometries
  ).toBeNull();
  expect(
    releasedCounters({
      activeContextIds: [7],
      rendererInfo: { geometries: 0, textures: 0, programs: 0 },
    }).contextsActive
  ).toBe(1);
  expect(
    releasedCounters({
      activeContextIds: [],
      rendererInfo: { geometries: 0, textures: 0, programs: 0 },
    })
  ).toMatchObject({
    contextsActive: 0,
    geometries: 0,
    textures: 0,
    programs: 0,
  });
});
