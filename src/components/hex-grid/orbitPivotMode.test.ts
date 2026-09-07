import { describe, expect, it } from 'vitest';
import {
  INITIAL_ORBIT_PIVOT_AUTO_STATE,
  reduceOrbitPivotAutoState,
  resolveOrbitPivot,
} from './orbitPivotMode';

describe('reduceOrbitPivotAutoState', () => {
  it('starts un-panned — pivot on the mini by default', () => {
    expect(INITIAL_ORBIT_PIVOT_AUTO_STATE.pannedSinceMove).toBe(false);
  });

  it('a pan switches to panned', () => {
    const next = reduceOrbitPivotAutoState(
      INITIAL_ORBIT_PIVOT_AUTO_STATE,
      'pan'
    );
    expect(next.pannedSinceMove).toBe(true);
  });

  it('the mini moving after a pan switches back to un-panned', () => {
    const panned = reduceOrbitPivotAutoState(
      INITIAL_ORBIT_PIVOT_AUTO_STATE,
      'pan'
    );
    const next = reduceOrbitPivotAutoState(panned, 'miniMoved');
    expect(next.pannedSinceMove).toBe(false);
  });

  it('pressing F after a pan switches back to un-panned, same as the mini moving', () => {
    const panned = reduceOrbitPivotAutoState(
      INITIAL_ORBIT_PIVOT_AUTO_STATE,
      'pan'
    );
    const next = reduceOrbitPivotAutoState(panned, 'focusKey');
    expect(next.pannedSinceMove).toBe(false);
  });

  it('miniMoved/focusKey while already un-panned is a no-op — same instance back', () => {
    const state = INITIAL_ORBIT_PIVOT_AUTO_STATE;
    expect(reduceOrbitPivotAutoState(state, 'miniMoved')).toBe(state);
    expect(reduceOrbitPivotAutoState(state, 'focusKey')).toBe(state);
  });

  it('pan while already panned is a no-op — same instance back', () => {
    const panned = reduceOrbitPivotAutoState(
      INITIAL_ORBIT_PIVOT_AUTO_STATE,
      'pan'
    );
    expect(reduceOrbitPivotAutoState(panned, 'pan')).toBe(panned);
  });

  it('a realistic sequence: pan, pan again, mini moves, pan, F', () => {
    let state = INITIAL_ORBIT_PIVOT_AUTO_STATE;
    state = reduceOrbitPivotAutoState(state, 'pan');
    expect(state.pannedSinceMove).toBe(true);
    state = reduceOrbitPivotAutoState(state, 'pan'); // still panned, no-op
    expect(state.pannedSinceMove).toBe(true);
    state = reduceOrbitPivotAutoState(state, 'miniMoved');
    expect(state.pannedSinceMove).toBe(false);
    state = reduceOrbitPivotAutoState(state, 'pan');
    expect(state.pannedSinceMove).toBe(true);
    state = reduceOrbitPivotAutoState(state, 'focusKey');
    expect(state.pannedSinceMove).toBe(false);
  });
});

describe('resolveOrbitPivot', () => {
  it('auto resolves to me when un-panned', () => {
    expect(resolveOrbitPivot('auto', { pannedSinceMove: false })).toBe('me');
  });

  it('auto resolves to view when panned since the mini last moved', () => {
    expect(resolveOrbitPivot('auto', { pannedSinceMove: true })).toBe('view');
  });

  it('me is unconditional — ignores pannedSinceMove either way', () => {
    expect(resolveOrbitPivot('me', { pannedSinceMove: false })).toBe('me');
    expect(resolveOrbitPivot('me', { pannedSinceMove: true })).toBe('me');
  });

  it('view is unconditional — ignores pannedSinceMove either way', () => {
    expect(resolveOrbitPivot('view', { pannedSinceMove: false })).toBe('view');
    expect(resolveOrbitPivot('view', { pannedSinceMove: true })).toBe('view');
  });
});
