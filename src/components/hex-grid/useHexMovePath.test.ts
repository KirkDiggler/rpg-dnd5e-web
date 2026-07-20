import { act, renderHook } from '@testing-library/react';
import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cubeToWorld, type CubeCoord } from './hexMath';

// Mock @react-three/fiber so useHexMovePath's useFrame/useThree calls work
// under plain renderHook (no real WebGL canvas). `useFrame` just captures
// the latest callback the hook registers each render, so tests can drive
// frames manually via `tick()` below; `useThree` returns a stub
// `invalidate`.
const hoisted = vi.hoisted(() => ({
  frameCallback: undefined as
    | ((state: unknown, delta: number) => void)
    | undefined,
  invalidate: vi.fn(),
}));

vi.mock('@react-three/fiber', () => ({
  useFrame: (cb: (state: unknown, delta: number) => void) => {
    hoisted.frameCallback = cb;
  },
  useThree: () => ({ invalidate: hoisted.invalidate }),
}));

// Import AFTER vi.mock so useHexMovePath picks up the mocked module.
import {
  advanceFrame,
  computeMoveStart,
  SECONDS_PER_HEX_STEP,
  useHexMovePath,
  type StepState,
} from './useHexMovePath';

const HEX_SIZE = 1;

describe('computeMoveStart', () => {
  it('is not a genuine move on initial mount (moveSeq undefined)', () => {
    const result = computeMoveStart(
      undefined,
      undefined,
      undefined,
      { x: 0, y: 0, z: 0 },
      HEX_SIZE,
      { x: 0, z: 0 }
    );
    expect(result.isGenuineMove).toBe(false);
    expect(result.points).toEqual([]);
    expect(result.nextSeenSeq).toBeUndefined();
  });

  it('is a genuine move the first time a defined moveSeq is seen', () => {
    const result = computeMoveStart(
      1,
      undefined,
      [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: -1, z: 0 },
      ],
      { x: 1, y: -1, z: 0 },
      HEX_SIZE,
      { x: 0, z: 0 }
    );
    expect(result.isGenuineMove).toBe(true);
    expect(result.nextSeenSeq).toBe(1);
  });

  it('is NOT a genuine move when moveSeq matches the already-seen value', () => {
    const result = computeMoveStart(
      1,
      1,
      [{ x: 1, y: -1, z: 0 }],
      { x: 1, y: -1, z: 0 },
      HEX_SIZE,
      { x: 0, z: 0 }
    );
    expect(result.isGenuineMove).toBe(false);
    expect(result.points).toEqual([]);
  });

  describe('normal multi-hex move', () => {
    it('walks every hex in the real path in order, not just start/end', () => {
      // A 3-hex path: (0,0,0) -> (1,-1,0) -> (2,-2,0) -> (3,-3,0).
      const path = [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: -1, z: 0 },
        { x: 2, y: -2, z: 0 },
        { x: 3, y: -3, z: 0 },
      ];
      const result = computeMoveStart(
        1,
        undefined,
        path,
        path[3],
        HEX_SIZE,
        cubeToWorldPoint(path[0])
      );

      expect(result.isGenuineMove).toBe(true);
      // Already starts exactly at the current rendered position, so no
      // synthesized extra point is prepended.
      expect(result.points).toHaveLength(4);
      expect(result.points.map((p) => roundPoint(p))).toEqual(
        path.map((p) => roundPoint(cubeToWorldPoint(p)))
      );
    });

    it('a 1-hex move produces exactly 2 points to animate between', () => {
      const path = [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: -1, z: 0 },
      ];
      const result = computeMoveStart(
        1,
        undefined,
        path,
        path[1],
        HEX_SIZE,
        cubeToWorldPoint(path[0])
      );
      expect(result.points).toHaveLength(2);
    });
  });

  describe('degenerate/single-element path (rpg-api#656 robustness)', () => {
    it('a single-element path still animates by synthesizing a step from the current rendered position', () => {
      const current = { x: 0, z: 0 };
      const destination = { x: 5, y: -5, z: 0 };
      const result = computeMoveStart(
        1,
        undefined,
        [destination],
        destination,
        HEX_SIZE,
        current
      );

      expect(result.isGenuineMove).toBe(true);
      // Not a bare snap: two points to interpolate between, current first.
      expect(result.points).toHaveLength(2);
      expect(result.points[0]).toEqual(current);
      expect(roundPoint(result.points[1])).toEqual(
        roundPoint(cubeToWorldPoint(destination))
      );
    });

    it('an empty path (movePath undefined) falls back to entityPosition alone and still animates', () => {
      const current = { x: 0, z: 0 };
      const destination = { x: 2, y: -2, z: 0 };
      const result = computeMoveStart(
        1,
        undefined,
        undefined,
        destination,
        HEX_SIZE,
        current
      );

      expect(result.isGenuineMove).toBe(true);
      expect(result.points).toHaveLength(2);
      expect(result.points[0]).toEqual(current);
    });

    it("the rpg-api#656 same-hex degenerate case (destination === current) still 'animates' as a harmless zero-distance step, not a special-cased snap", () => {
      // #656: a corner-spawn move gets wall-truncated to a same-hex no-op.
      // The path's single point already equals where the entity is
      // rendered -- computeMoveStart doesn't special-case this away, it
      // just produces a 2-point step whose two points happen to coincide.
      const current = cubeToWorldPoint({ x: 0, y: 0, z: 0 });
      const result = computeMoveStart(
        1,
        undefined,
        [{ x: 0, y: 0, z: 0 }],
        { x: 0, y: 0, z: 0 },
        HEX_SIZE,
        current
      );

      expect(result.isGenuineMove).toBe(true);
      expect(result.points).toHaveLength(1);
      // Single point because pathWorld[0] already equals `current` --
      // startsAtCurrent is true, so no extra point is prepended. A step
      // count of 1 means advanceFrame has nothing to animate (index >=
      // points.length - 1 immediately), which is the correct "arrived
      // instantly" degrade for a genuinely zero-distance move.
    });
  });

  describe('revive then first move (rpg-dnd5e-web#551 gate-review regression -- pure-function contract)', () => {
    // NOTE: these `computeMoveStart` calls hand-thread `nextSeenSeq` through
    // by hand, exactly mirroring what `useHexMovePath`'s `useLayoutEffect`
    // does with `seenSeqRef`. That makes this a test of `computeMoveStart`'s
    // CONTRACT ("callers must persist `nextSeenSeq` unconditionally"), not
    // proof that the hook itself honors it -- reverting the hook's one-line
    // fix does NOT make these fail, since they never call the real hook.
    // The actual hook-level regression coverage (the one that fails when
    // the real fix is reverted) is the "hook-level regression test" describe
    // block below, which renders the real `useHexMovePath` via
    // `renderHook`.
    it('seenSeq must be written unconditionally so a revive (moveSeq -> undefined) actually clears it', () => {
      // This is the exact sequence the gate review traced by hand:
      //   1. First real move: moveSeq 1, seenSeq (was undefined) -> 1.
      //   2. Ghost: moveSeq untouched (still 1).
      //   3. Revive: moveSeq -> undefined.
      //   4. First move after revive: mergeEntityPosition restarts the
      //      counter at 1 (existing.moveSeq ?? 0) + 1, since the revived
      //      record carries no moveSeq. This MUST still be genuine.
      let seenSeq: number | undefined = undefined;

      // 1. First real move.
      const firstMove = computeMoveStart(
        1,
        seenSeq,
        [{ x: 1, y: -1, z: 0 }],
        { x: 1, y: -1, z: 0 },
        HEX_SIZE,
        { x: 0, z: 0 }
      );
      expect(firstMove.isGenuineMove).toBe(true);
      seenSeq = firstMove.nextSeenSeq;
      expect(seenSeq).toBe(1);

      // 2. Ghost -- moveSeq is untouched by applyEntityDisappeared, still 1.
      const ghosted = computeMoveStart(
        1,
        seenSeq,
        [{ x: 1, y: -1, z: 0 }],
        { x: 1, y: -1, z: 0 },
        HEX_SIZE,
        { x: 1, z: -1 }
      );
      expect(ghosted.isGenuineMove).toBe(false);
      seenSeq = ghosted.nextSeenSeq; // must still be written (unconditional)
      expect(seenSeq).toBe(1);

      // 3. Revive -- moveSeq resets to undefined (applyEntityAppearedBatch
      // replaces the whole record with a fresh wire value).
      const revived = computeMoveStart(
        undefined,
        seenSeq,
        undefined,
        { x: 1, y: -1, z: 0 },
        HEX_SIZE,
        { x: 1, z: -1 }
      );
      expect(revived.isGenuineMove).toBe(false);
      seenSeq = revived.nextSeenSeq;
      // THE FIX: seenSeq must actually become undefined here, not stay 1.
      expect(seenSeq).toBeUndefined();

      // 4. First move after revive -- mergeEntityPosition's counter
      // restarts at 1. With the bug (seenSeq stuck at 1 from step 1),
      // `1 !== 1` would be false -- silently classified as NOT a genuine
      // move, snapping instead of animating. With the fix, seenSeq is
      // undefined going in, so this correctly reads as genuine.
      const firstMoveAfterRevive = computeMoveStart(
        1,
        seenSeq,
        [{ x: 2, y: -2, z: 0 }],
        { x: 2, y: -2, z: 0 },
        HEX_SIZE,
        { x: 1, z: -1 }
      );
      expect(firstMoveAfterRevive.isGenuineMove).toBe(true);
      expect(firstMoveAfterRevive.points.length).toBeGreaterThan(1);
    });

    it('a second move after revive always self-heals regardless of the bug (documents why it was easy to miss)', () => {
      // With the buggy conditional-write contract, moveSeq 2 still differs
      // from the stale seenSeq of 1, so the SECOND post-revive move always
      // animates correctly either way -- this is why the defect only
      // affected exactly one step and was easy to miss in manual testing.
      const staleSeenSeq = 1;
      const secondMoveAfterRevive = computeMoveStart(
        2,
        staleSeenSeq,
        [{ x: 3, y: -3, z: 0 }],
        { x: 3, y: -3, z: 0 },
        HEX_SIZE,
        { x: 2, z: -2 }
      );
      expect(secondMoveAfterRevive.isGenuineMove).toBe(true);
    });
  });

  it('two consecutive moves to the same destination (e.g. bounced off a wall) both animate', () => {
    const dest = { x: 1, y: -1, z: 0 };
    let seenSeq: number | undefined = undefined;

    const first = computeMoveStart(1, seenSeq, [dest], dest, HEX_SIZE, {
      x: 0,
      z: 0,
    });
    expect(first.isGenuineMove).toBe(true);
    seenSeq = first.nextSeenSeq;

    const second = computeMoveStart(
      2,
      seenSeq,
      [dest],
      dest,
      HEX_SIZE,
      cubeToWorldPoint(dest)
    );
    expect(second.isGenuineMove).toBe(true);
  });
});

describe('advanceFrame', () => {
  function makeStep(points: { x: number; z: number }[]): StepState {
    return { points, index: 0, elapsed: 0 };
  }

  it('returns undefined when there is nothing to animate (single point)', () => {
    const step = makeStep([{ x: 0, z: 0 }]);
    expect(advanceFrame(step, 0.1)).toBeUndefined();
  });

  it('produces an intermediate (non-endpoint) position partway through a step', () => {
    const step = makeStep([
      { x: 0, z: 0 },
      { x: 10, z: 0 },
    ]);
    const half = SECONDS_PER_HEX_STEP / 2;
    const result = advanceFrame(step, half);
    expect(result).toBeDefined();
    expect(result!.position.x).toBeGreaterThan(0);
    expect(result!.position.x).toBeLessThan(10);
    expect(result!.stepComplete).toBe(false);
  });

  it('marks the step complete once elapsed reaches secondsPerStep', () => {
    const step = makeStep([
      { x: 0, z: 0 },
      { x: 10, z: 0 },
    ]);
    const result = advanceFrame(step, SECONDS_PER_HEX_STEP);
    expect(result!.stepComplete).toBe(true);
    expect(result!.position.x).toBeCloseTo(10);
  });

  it('clamps at the endpoint for a delta larger than the whole step (no overshoot)', () => {
    const step = makeStep([
      { x: 0, z: 0 },
      { x: 10, z: 0 },
    ]);
    const result = advanceFrame(step, SECONDS_PER_HEX_STEP * 10);
    expect(result!.position.x).toBeCloseTo(10);
    expect(result!.stepComplete).toBe(true);
  });

  it('animates the SECOND leg of a multi-hex path once index advances', () => {
    const step: StepState = {
      points: [
        { x: 0, z: 0 },
        { x: 10, z: 0 },
        { x: 10, z: 10 },
      ],
      index: 1,
      elapsed: 0,
    };
    const result = advanceFrame(step, SECONDS_PER_HEX_STEP / 2);
    // Interpolating between points[1] and points[2], not points[0].
    expect(result!.position.x).toBeCloseTo(10);
    expect(result!.position.z).toBeGreaterThan(0);
    expect(result!.position.z).toBeLessThan(10);
  });
});

describe('useHexMovePath (hook-level regression test)', () => {
  const Y_OFFSET = 0.5;
  const posA: CubeCoord = { x: 0, y: 0, z: 0 };
  const posB: CubeCoord = { x: 1, y: -1, z: 0 };
  const posC: CubeCoord = { x: 2, y: -2, z: 0 };

  type Props = {
    entityPosition: CubeCoord;
    movePath: CubeCoord[] | undefined;
    moveSeq: number | undefined;
  };

  function renderMovePath() {
    return renderHook(
      ({ entityPosition, movePath, moveSeq }: Props) =>
        useHexMovePath(entityPosition, movePath, moveSeq, HEX_SIZE, Y_OFFSET),
      {
        initialProps: {
          entityPosition: posA,
          movePath: undefined,
          moveSeq: undefined,
        } as Props,
      }
    );
  }

  function tick(delta: number) {
    act(() => {
      hoisted.frameCallback?.({}, delta);
    });
  }

  beforeEach(() => {
    hoisted.frameCallback = undefined;
    hoisted.invalidate.mockReset();
  });

  it('treats the first move after a revive as a genuine move (animates), not a snap', () => {
    const { result, rerender } = renderMovePath();

    // renderHook has no real R3F canvas to attach `groupRef` for us, so
    // seed it directly at the already-settled initial-mount position --
    // the same state a real `<group ref={groupRef}>` would be in right
    // after mount.
    act(() => {
      result.current.groupRef.current = new THREE.Group();
      const start = cubeToWorld(posA, HEX_SIZE);
      result.current.groupRef.current.position.set(start.x, Y_OFFSET, start.z);
    });

    // 1. First real move: moveSeq 1, path posA -> posB. Must animate.
    rerender({
      entityPosition: { ...posB },
      movePath: [posA, posB],
      moveSeq: 1,
    });
    expect(result.current.isMoving).toBe(true);

    // Drive it to completion so the group is actually sitting at posB
    // before the revive, matching the real lifecycle.
    tick(SECONDS_PER_HEX_STEP);
    expect(result.current.isMoving).toBe(false);
    const posBWorld = cubeToWorld(posB, HEX_SIZE);
    expect(result.current.groupRef.current!.position.x).toBeCloseTo(
      posBWorld.x
    );
    expect(result.current.groupRef.current!.position.z).toBeCloseTo(
      posBWorld.z
    );

    // 2. Revive: applyEntityAppearedBatch replaces the entity record
    // wholesale -- moveSeq goes back to undefined.
    rerender({
      entityPosition: { ...posB },
      movePath: undefined,
      moveSeq: undefined,
    });
    expect(result.current.isMoving).toBe(false);

    // 3. First move after revive: mergeEntityPosition restarts moveSeq at
    // 1 (`(existing.moveSeq ?? 0) + 1`) on the fresh, moveSeq-less revived
    // record. This MUST be treated as genuine -- exactly the case
    // rpg-dnd5e-web#551's gate review caught snapping instead of
    // animating (an earlier version only wrote `seenSeqRef.current` when
    // `moveSeq !== undefined`, leaving it stale at 1 from step 1 so this
    // `1 !== 1` compare silently read as "not genuine").
    rerender({
      entityPosition: { ...posC },
      movePath: [posB, posC],
      moveSeq: 1,
    });

    // The crux assertion: a genuine move must be mid-flight (isMoving
    // true) and must NOT have already snapped straight to the
    // destination -- the genuine-move branch only arms `stepRef` and lets
    // `useFrame` interpolate; it never writes `groupRef.current.position`
    // directly (only the non-genuine/snap branch does that).
    expect(result.current.isMoving).toBe(true);
    expect(result.current.groupRef.current!.position.x).toBeCloseTo(
      posBWorld.x
    );
    expect(result.current.groupRef.current!.position.z).toBeCloseTo(
      posBWorld.z
    );

    // And it actually interpolates once a frame ticks, landing strictly
    // between posB and posC -- not jumping straight to either endpoint.
    tick(SECONDS_PER_HEX_STEP / 2);
    const posCWorld = cubeToWorld(posC, HEX_SIZE);
    const midX = result.current.groupRef.current!.position.x;
    expect(midX).not.toBeCloseTo(posBWorld.x);
    expect(midX).not.toBeCloseTo(posCWorld.x);
  });
});

// --- test-local helpers -----------------------------------------------
function cubeToWorldPoint(cube: { x: number; y: number; z: number }): {
  x: number;
  z: number;
} {
  return cubeToWorld(cube, HEX_SIZE);
}

function roundPoint(p: { x: number; z: number }): { x: number; z: number } {
  return { x: Math.round(p.x * 1e6) / 1e6, z: Math.round(p.z * 1e6) / 1e6 };
}
