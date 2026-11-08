// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { CubeCoord } from '../hex-grid/hexMath';
import {
  beginRoute,
  continuedWalk,
  continueRoute,
  emptyContinuations,
  emptyMovements,
  facingWhileWalking,
  forgetUnsighted,
  isWalking,
  moveAnswered,
  moveDispatched,
  moveFailed,
  movementPainted,
  stepArrived,
  type Continuations,
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

describe('isWalking / facingWhileWalking — the end facing waits for the token (rpg-project#630)', () => {
  const cell = { x: 1, y: -1, z: 0 };
  it('a token mid-walk takes no wire facing, so it faces its path', () => {
    const walking = beginRoute(emptyMovements(), 'scout', [cell, cell]).get(
      'scout'
    );
    expect(isWalking(walking)).toBe(true);
    expect(facingWhileWalking(90, walking)).toBeUndefined();
  });
  it('once the walk is painted to its end, the wire facing lands', () => {
    const begun = beginRoute(emptyMovements(), 'scout', [cell]);
    const painted = movementPainted(
      begun,
      'scout',
      begun.get('scout')!.seq,
      1
    ).get('scout');
    expect(isWalking(painted)).toBe(false);
    expect(facingWhileWalking(90, painted)).toBe(90);
    expect(facingWhileWalking(90, undefined)).toBe(90);
  });
});

describe('moveController — the walk goes on after the answer (rpg-project#890)', () => {
  const a = { x: 1, y: -1, z: 0 };
  const b = { x: 2, y: -2, z: 0 };
  const c = { x: 3, y: -3, z: 0 };
  const d = { x: 4, y: -4, z: 0 };
  const e = { x: 5, y: -5, z: 0 };
  const answer = { route: [a, b], continues: true, through: '01J0000000B' };
  const walk = (id: string, cells: CubeCoord[], act = 'move:1') => ({
    id,
    act,
    cells,
  });
  const answered = (
    state: Continuations,
    given: typeof answer,
    member = 'me'
  ) => moveAnswered(state, member, given).continuations;
  const start = () => answered(emptyContinuations(), answer);

  it('continues the walk with an own walk act after through', () => {
    const continued = continuedWalk(start(), 'me', walk('01J0000000C', [c]));

    expect(continued.cells).toEqual([c]);
    expect(continued.continuations.get('me')).toMatchObject({
      after: '01J0000000C',
      act: 'move:1',
      walked: [a, b, c],
    });
  });

  it('ignores own walk acts at or before through', () => {
    expect(
      continuedWalk(start(), 'me', walk('01J0000000B', [a, b])).cells
    ).toEqual([]);
    expect(
      continuedWalk(start(), 'me', walk('01J0000000A', [a])).cells
    ).toEqual([]);
  });

  it('plays only the new cells of a segment that straddles through', () => {
    const continued = continuedWalk(
      start(),
      'me',
      walk('01J0000000D', [a, b, c, d])
    );

    expect(continued.cells).toEqual([c, d]);
  });

  it('drops the cell a later segment restates as its start', () => {
    const state = continuedWalk(
      start(),
      'me',
      walk('01J0000000C', [a, b, c])
    ).continuations;

    const continued = continuedWalk(
      state,
      'me',
      walk('01J0000000E', [c, d, e])
    );

    expect(continued.cells).toEqual([d, e]);
  });

  it('advances past each continued act so the same act never plays twice', () => {
    const state = continuedWalk(
      start(),
      'me',
      walk('01J0000000C', [c])
    ).continuations;

    expect(continuedWalk(state, 'me', walk('01J0000000C', [c])).cells).toEqual(
      []
    );
  });

  it('does not continue with an own walk under another act', () => {
    const state = continuedWalk(
      start(),
      'me',
      walk('01J0000000C', [c])
    ).continuations;

    expect(
      continuedWalk(state, 'me', walk('01J0000000D', [d], 'move:2')).cells
    ).toEqual([]);
  });

  it('has no continuation when the answer does not continue', () => {
    const state = answered(emptyContinuations(), {
      ...answer,
      continues: false,
    });

    expect(continuedWalk(state, 'me', walk('01J0000000C', [c])).cells).toEqual(
      []
    );
  });

  it('a second Move answer starts a new journey and clears the continuation', () => {
    const state = answered(start(), {
      route: [d],
      continues: false,
      through: '01J0000000Z',
    });

    expect(continuedWalk(state, 'me', walk('01J0000000C', [c])).cells).toEqual(
      []
    );
  });

  it('a second continuing answer replaces the first after its own through', () => {
    const state = answered(start(), {
      route: [d],
      continues: true,
      through: '01J0000000Y',
    });

    expect(continuedWalk(state, 'me', walk('01J0000000C', [c])).cells).toEqual(
      []
    );
    expect(
      continuedWalk(state, 'me', walk('01J0000000Z', [d, e], 'move:2')).cells
    ).toEqual([e]);
  });

  it('continues an answer that carried no steps from the first own walk', () => {
    const state = answered(emptyContinuations(), {
      route: [],
      continues: true,
      through: '',
    });

    expect(continuedWalk(state, 'me', walk('01J0000000A', [a])).cells).toEqual([
      a,
    ]);
  });

  // Review finding 1: the first step pays the round, so the answer has no
  // steps and no through, while the last journey's segments are still queued.
  it('a continuing answer with no steps never adopts the previous journey act', () => {
    let state = moveDispatched(start(), 'me');
    state = continuedWalk(
      state,
      'me',
      walk('01J0000000C', [c], 'move:old')
    ).continuations;
    state = answered(state, { route: [], continues: true, through: '' });

    const old = continuedWalk(
      state,
      'me',
      walk('01J0000000D', [c, d], 'move:old')
    );
    expect(old.cells).toEqual([]);
    const fresh = continuedWalk(
      old.continuations,
      'me',
      walk('01J0000000E', [e], 'move:new')
    );
    expect(fresh.cells).toEqual([e]);
  });

  it('an own walk seen with no Move in flight and no walk going on is never adopted later', () => {
    let state = answered(emptyContinuations(), {
      ...answer,
      continues: false,
    });
    state = continuedWalk(
      state,
      'me',
      walk('01J0000000C', [c], 'move:done')
    ).continuations;
    state = answered(moveDispatched(state, 'me'), {
      route: [],
      continues: true,
      through: '',
    });

    expect(
      continuedWalk(state, 'me', walk('01J0000000D', [d], 'move:done')).cells
    ).toEqual([]);
  });

  // Review finding 2: the stream can deliver the walk before its answer.
  it('holds own acts that arrive before the answer and replays those after through', () => {
    let state = moveDispatched(emptyContinuations(), 'me');
    state = continuedWalk(
      state,
      'me',
      walk('01J0000000D', [a, b, c, d])
    ).continuations;
    state = continuedWalk(
      state,
      'me',
      walk('01J0000000B', [a, b])
    ).continuations;

    const result = moveAnswered(state, 'me', answer);

    expect(result.cells).toEqual([c, d]);
    expect(result.continuations.get('me')).toMatchObject({
      after: '01J0000000D',
      act: 'move:1',
      held: [],
      inFlight: false,
    });
  });

  it('with no through, replays only the last act held, never an older walk held before it', () => {
    let state = moveDispatched(emptyContinuations(), 'me');
    state = continuedWalk(
      state,
      'me',
      walk('01J0000000C', [c], 'move:old')
    ).continuations;
    state = continuedWalk(
      state,
      'me',
      walk('01J0000000D', [d], 'move:new')
    ).continuations;

    const result = moveAnswered(state, 'me', {
      route: [],
      continues: true,
      through: '',
    });

    expect(result.cells).toEqual([d]);
  });

  it('a held act that does not continue the answer is dropped', () => {
    let state = moveDispatched(emptyContinuations(), 'me');
    state = continuedWalk(state, 'me', walk('01J0000000C', [c])).continuations;

    const result = moveAnswered(state, 'me', { ...answer, continues: false });

    expect(result.cells).toEqual([]);
    expect(
      continuedWalk(result.continuations, 'me', walk('01J0000000D', [d])).cells
    ).toEqual([]);
  });

  it('a failed Move drops what it held', () => {
    let state = moveDispatched(emptyContinuations(), 'me');
    state = continuedWalk(
      state,
      'me',
      walk('01J0000000C', [c], 'move:x')
    ).continuations;
    state = moveFailed(state, 'me');
    expect(state.get('me')).toMatchObject({ inFlight: false, held: [] });

    const result = moveAnswered(moveDispatched(state, 'me'), 'me', {
      route: [],
      continues: true,
      through: '',
    });
    expect(result.cells).toEqual([]);
    expect(
      continuedWalk(
        result.continuations,
        'me',
        walk('01J0000000D', [d], 'move:x')
      ).cells
    ).toEqual([]);
  });

  it('keeps playing the current journey while the next Move is in flight', () => {
    const state = moveDispatched(start(), 'me');

    expect(continuedWalk(state, 'me', walk('01J0000000C', [c])).cells).toEqual([
      c,
    ]);
  });

  it('appends continued cells to the route still being painted', () => {
    let state = beginRoute(emptyMovements(), 'me', [a, b]);
    state = continueRoute(state, 'me', [c, d]);

    expect(state.get('me')).toEqual({
      route: [a, b, c, d],
      seq: 2,
      reached: 0,
      continuedFrom: 2,
    });
  });

  it('walks continued cells as a route of their own once the answer is painted', () => {
    let state = beginRoute(emptyMovements(), 'me', [a, b]);
    state = movementPainted(state, 'me', 1, 2);
    state = continueRoute(state, 'me', [c]);

    expect(state.get('me')).toEqual({ route: [c], seq: 2, reached: 0 });
  });

  it('ignores an empty continuation', () => {
    const state = beginRoute(emptyMovements(), 'me', [a]);

    expect(continueRoute(state, 'me', [])).toBe(state);
  });
});
