import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { armMark, mark, markIfArmed, takeArmedMark } from './perfMarks';

describe('perf marks', () => {
  const url = window.location.href;
  let spy: MockInstance<Performance['mark']>;
  beforeEach(() => {
    spy = vi.spyOn(performance, 'mark');
  });
  afterEach(() => {
    // Drain anything a test left armed so tests stay independent.
    takeArmedMark('studio:open:first-paint');
    spy.mockRestore();
    window.history.replaceState(null, '', url);
    vi.unstubAllEnvs();
  });

  it('marks under bench with ?perfMarks', () => {
    vi.stubEnv('MODE', 'bench');
    window.history.replaceState(null, '', '/?perfMarks');
    mark('play:first-frame');
    expect(spy).toHaveBeenCalledWith('play:first-frame');
  });

  it('marks nothing under bench without ?perfMarks', () => {
    vi.stubEnv('MODE', 'bench');
    mark('play:first-frame');
    expect(spy).not.toHaveBeenCalled();
  });

  it('marks nothing in production even with ?perfMarks', () => {
    vi.stubEnv('MODE', 'production');
    window.history.replaceState(null, '', '/?perfMarks');
    mark('play:first-frame');
    armMark('studio:open:first-paint');
    markIfArmed('studio:open:first-paint');
    expect(spy).not.toHaveBeenCalled();
  });

  it('an armed mark fires once, and only when armed', () => {
    vi.stubEnv('MODE', 'development');
    window.history.replaceState(null, '', '/?perfMarks');
    markIfArmed('studio:open:first-paint');
    expect(spy).not.toHaveBeenCalled();
    armMark('studio:open:first-paint');
    markIfArmed('studio:open:first-paint');
    markIfArmed('studio:open:first-paint');
    expect(spy.mock.calls).toEqual([['studio:open:first-paint']]);
  });
});
