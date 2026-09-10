// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  beginRoute,
  emptyMovements,
  forgetUnsighted,
  movementPainted,
  stepArrived,
} from './moveController';

describe('moveController — a remote actor moving', () => {
  it('turns a first arriving step into a one-cell route with sequence 1', () => {
    const next = stepArrived(emptyMovements(), 'bob', { x: 1, y: -1, z: 0 });

    expect(next.get('bob')).toEqual({
      route: [{ x: 1, y: -1, z: 0 }],
      seq: 1,
      reached: 0,
    });
  });

  it('extends the same in-flight route as further steps arrive', () => {
    let state = stepArrived(emptyMovements(), 'bob', { x: 1, y: -1, z: 0 });
    state = stepArrived(state, 'bob', { x: 2, y: -2, z: 0 });

    const movement = state.get('bob');
    expect(movement?.route).toEqual([
      { x: 1, y: -1, z: 0 },
      { x: 2, y: -2, z: 0 },
    ]);
  });

  it('bumps the sequence on every arriving step so a growing route re-animates', () => {
    let state = stepArrived(emptyMovements(), 'bob', { x: 1, y: -1, z: 0 });
    state = stepArrived(state, 'bob', { x: 2, y: -2, z: 0 });

    expect(state.get('bob')?.seq).toBe(2);
  });

  it('starts a fresh route once the previous one has been painted to its end', () => {
    let state = stepArrived(emptyMovements(), 'bob', { x: 1, y: -1, z: 0 });
    state = movementPainted(state, 'bob', 1, 1);
    state = stepArrived(state, 'bob', { x: 2, y: -2, z: 0 });

    const movement = state.get('bob');
    expect(movement?.route).toEqual([{ x: 2, y: -2, z: 0 }]);
    expect(movement?.reached).toBe(0);
  });

  it('leaves other actors untouched', () => {
    let state = stepArrived(emptyMovements(), 'bob', { x: 1, y: -1, z: 0 });
    const bobBefore = state.get('bob');
    state = stepArrived(state, 'zara', { x: 5, y: -5, z: 0 });

    expect(state.get('bob')).toBe(bobBefore);
  });
});

describe('moveController — the local player moving', () => {
  const route = [
    { x: 1, y: -1, z: 0 },
    { x: 2, y: -2, z: 0 },
  ];

  it('takes a whole known route in one go', () => {
    const state = beginRoute(emptyMovements(), 'me', route);

    expect(state.get('me')).toEqual({ route, seq: 1, reached: 0 });
  });

  it('is always a new journey, never a continuation of an in-flight one', () => {
    let state = beginRoute(emptyMovements(), 'me', route);
    state = beginRoute(state, 'me', [{ x: 3, y: -3, z: 0 }]);

    const movement = state.get('me');
    expect(movement?.route).toEqual([{ x: 3, y: -3, z: 0 }]);
    expect(movement?.seq).toBe(2);
  });

  it('ignores an empty route — a refused move has nothing to animate', () => {
    const before = emptyMovements();

    expect(beginRoute(before, 'me', [])).toBe(before);
  });
});

describe('moveController — both feeds make the same thing', () => {
  it('produces an identical movement whether the route arrived whole or a cell at a time', () => {
    const cells = [
      { x: 1, y: -1, z: 0 },
      { x: 2, y: -2, z: 0 },
    ];

    const whole = beginRoute(emptyMovements(), 'actor', cells).get('actor');
    let piecemeal = stepArrived(emptyMovements(), 'actor', cells[0]);
    piecemeal = stepArrived(piecemeal, 'actor', cells[1]);

    expect(piecemeal.get('actor')?.route).toEqual(whole?.route);
    expect(piecemeal.get('actor')?.reached).toBe(whole?.reached);
  });
});

describe('moveController — only what the viewer can actually see', () => {
  // The wire sends a movement beat for every roster member, visible or not
  // (audience is the whole roster; only a concealed-region step is withheld).
  // So an actor the viewer cannot see still accumulates a route here — and
  // `useHexMovePath` would replay it the moment that actor became visible
  // again, walking a ghost across the map where it should simply be at its
  // new cell. Kirk, 2026-09-07: "I saw the skeleton move when it was a ghost,
  // which is when we would teleport."
  it('drops a member the viewer no longer sees live', () => {
    let state = stepArrived(emptyMovements(), 'skeleton-1', {
      x: 1,
      y: -1,
      z: 0,
    });
    state = stepArrived(state, 'me', { x: 5, y: -5, z: 0 });

    const next = forgetUnsighted(state, new Set(['me']));

    expect(next.has('skeleton-1')).toBe(false);
    expect(next.get('me')?.route).toHaveLength(1);
  });

  it('keeps everyone still sighted, and is the same object when nothing is dropped', () => {
    const state = stepArrived(emptyMovements(), 'scout', { x: 1, y: -1, z: 0 });

    expect(forgetUnsighted(state, new Set(['scout']))).toBe(state);
  });

  it('a re-sighted member starts a fresh route rather than replaying the old one', () => {
    let state = stepArrived(emptyMovements(), 'skeleton-1', {
      x: 1,
      y: -1,
      z: 0,
    });
    state = stepArrived(state, 'skeleton-1', { x: 2, y: -2, z: 0 });
    const seqWhileSighted = state.get('skeleton-1')?.seq;

    // Out of sight: forgotten. Back in sight: one new beat.
    state = forgetUnsighted(state, new Set());
    state = stepArrived(state, 'skeleton-1', { x: 9, y: -9, z: 0 });

    const back = state.get('skeleton-1');
    expect(back?.route).toEqual([{ x: 9, y: -9, z: 0 }]);
    expect(back?.seq).toBe(1);
    expect(back?.seq).not.toBe(seqWhileSighted);
  });
});
