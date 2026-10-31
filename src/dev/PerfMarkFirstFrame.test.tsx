import { advance, flushGlobalEffects } from '@react-three/fiber';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { PerfMarkFirstFrame } from './PerfMarkFirstFrame';

const url = window.location.href;
afterEach(() => {
  window.history.replaceState(null, '', url);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// Drives R3F's real loop step (`advance`: every root's useFrame subscribers
// and render, then the global after-effects), the same step the browser's
// requestAnimationFrame loop runs.
it('marks once, after the first frame its own Canvas renders', async () => {
  vi.stubEnv('MODE', 'bench');
  window.history.replaceState(null, '', '/?perfMarks');
  const spy = vi.spyOn(performance, 'mark');
  const renderer = await ReactThreeTestRenderer.create(
    <PerfMarkFirstFrame name="play:first-frame" />
  );
  spy.mockClear();
  // After-effects with no frame from this root (another Canvas rendering
  // first) mark nothing.
  flushGlobalEffects('after', 1);
  expect(spy).not.toHaveBeenCalled();
  advance(2);
  expect(spy.mock.calls).toEqual([['play:first-frame']]);
  advance(3);
  expect(spy.mock.calls).toEqual([['play:first-frame']]);
  await renderer.unmount();
});

it('subscribes to nothing without ?perfMarks', async () => {
  vi.stubEnv('MODE', 'bench');
  const spy = vi.spyOn(performance, 'mark');
  const renderer = await ReactThreeTestRenderer.create(
    <PerfMarkFirstFrame name="play:first-frame" />
  );
  advance(1);
  expect(spy).not.toHaveBeenCalled();
  await renderer.unmount();
});
