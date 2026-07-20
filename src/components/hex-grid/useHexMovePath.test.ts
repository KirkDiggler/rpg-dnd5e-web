import { describe, expect, it } from 'vitest';
import { cubeToWorld } from './hexMath';
import {
  advanceFrame,
  computeMoveStart,
  SECONDS_PER_HEX_STEP,
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

  describe('revive then first move (rpg-dnd5e-web#551 gate-review regression)', () => {
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

    it('regression guard: reproduces the bug when seenSeq is (incorrectly) written conditionally, proving the test would have caught it', () => {
      // Mirrors the OLD, buggy caller contract: only persist seenSeq when
      // moveSeq !== undefined (i.e. skip the write on revive). Confirms
      // this test suite actually distinguishes the fixed contract from
      // the broken one, rather than passing either way.
      let seenSeqBuggy: number | undefined = undefined;

      const firstMove = computeMoveStart(
        1,
        seenSeqBuggy,
        [{ x: 1, y: -1, z: 0 }],
        { x: 1, y: -1, z: 0 },
        HEX_SIZE,
        { x: 0, z: 0 }
      );
      if (firstMove.nextSeenSeq !== undefined)
        seenSeqBuggy = firstMove.nextSeenSeq;

      const revived = computeMoveStart(
        undefined,
        seenSeqBuggy,
        undefined,
        { x: 1, y: -1, z: 0 },
        HEX_SIZE,
        { x: 1, z: -1 }
      );
      // BUGGY caller skips this write because moveSeq is undefined:
      if (revived.nextSeenSeq !== undefined) seenSeqBuggy = revived.nextSeenSeq;
      expect(seenSeqBuggy).toBe(1); // stale -- the bug

      const firstMoveAfterRevive = computeMoveStart(
        1,
        seenSeqBuggy,
        [{ x: 2, y: -2, z: 0 }],
        { x: 2, y: -2, z: 0 },
        HEX_SIZE,
        { x: 1, z: -1 }
      );
      // With the buggy conditional-write contract, this incorrectly reads
      // as NOT genuine -- exactly the reported "silently snaps" defect.
      expect(firstMoveAfterRevive.isGenuineMove).toBe(false);
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
