import { describe, expect, it } from 'vitest';
import {
  beginRoute,
  emptyMovements,
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
