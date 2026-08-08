/**
 * Drives a group's world position through an entity's real hex-by-hex
 * `movePath` (rpg-dnd5e-web#542's fix for "characters glide across the map
 * in their idle pose" — until now `HexEntity` just snapped straight to
 * `cubeToWorld(entity.position)` every time the entity's server position
 * changed, whether that was a genuine move, initial placement, or a
 * ghost/revive reconciliation, so no walk clip ever had anything to key
 * off of).
 *
 * Only animates on a genuine move: `moveSeq` (see useEncounterState.ts's
 * `mergeEntityPosition`) is bumped ONLY by a real `EntityMoved`-driven
 * position update, never by initial placement (`applyEntityAppearedBatch`)
 * or ghost/revive (`applyEntityDisappeared`/re-appear) — both of those
 * replace the entity record wholesale with a fresh value off the wire, so
 * they never carry a stale `moveSeq` forward. Watching `moveSeq` change
 * (not just "movePath is present") is what makes this "genuine move only":
 * two moves that happen to land on the same destination hex in a row
 * (e.g. bounced back by a wall) still each bump `moveSeq` and so still
 * each animate, while mount/reconciliation never bumps it at all.
 *
 * `isGenuineMove`'s `seenSeq` comparison (below) MUST be updated
 * unconditionally every time this runs, including when `moveSeq` itself is
 * `undefined` — gate review on rpg-dnd5e-web#551 (independently confirmed
 * by a live Copilot review comment) caught a real regression where an
 * earlier version only wrote `seenSeqRef.current` when `moveSeq !==
 * undefined`. That let the stale pre-revive value survive a revive (where
 * `moveSeq` legitimately goes back to `undefined`), and because
 * `mergeEntityPosition`'s counter also restarts at `1` on the first move
 * after a revive (`(existing.moveSeq ?? 0) + 1` with a fresh, `moveSeq`-
 * less record), that first post-revive move's `moveSeq` of `1` could
 * collide with the still-stale `seenSeqRef` of `1` left over from BEFORE
 * the revive — silently classified as "not a genuine move" and snapped
 * instead of animated. Self-healed on the very next move (`moveSeq` 2
 * always differs from the stale `1`), which is exactly why it slipped
 * through manual review and 864 passing tests that never happened to
 * check a revive's FIRST subsequent move specifically. Fixed by writing
 * `seenSeq` unconditionally (see `computeMoveStart` below) so a revive's
 * `undefined` genuinely clears it, not just skips updating it. Covered by
 * `useHexMovePath.test.ts`'s "revive then first move" case — that
 * regression test is the actual fix here, not the one-line diff alone.
 *
 * Per-hex pacing, not a fixed total duration: each hex step takes
 * `SECONDS_PER_HEX_STEP`, so a 1-hex and a 5-hex move take proportionally
 * different total time instead of the same fixed duration stretched (or
 * compressed) across however many hexes — a fixed-duration tween would
 * either teleport-slide a long move or crawl a short one.
 *
 * Degenerate/single-element path (rpg-api#656's corner-spawn bug can
 * produce exactly this — a same-hex "move" that never actually goes
 * anywhere): still animates the one step per the coordinator's explicit
 * ask, by synthesizing it from wherever the group is CURRENTLY rendered to
 * the single path point, rather than special-casing length===1 to a bare
 * snap. If that single point already equals the current position (the
 * #656 case), the synthesized step is zero-distance and resolves in under
 * a frame — a harmless, correct degrade, not a special case to detect.
 *
 * Caller contract: attach `groupRef` to the group whose position should
 * track the entity. This hook owns every write to that ref's
 * `position.x`/`.y`/`.z` — do not also pass a declarative `position` prop
 * on the same object, since React would then re-apply the (stale,
 * destination-only) declarative value on renders this hook didn't cause,
 * fighting the interpolation mid-step.
 *
 * `computeMoveStart`/`advanceFrame` below are pulled out as plain,
 * dependency-free functions (no `bpy`... er, no `@react-three/fiber`
 * imports) specifically so `useHexMovePath.test.ts` can exercise the
 * genuine-move detection and per-frame lerp math directly, without a
 * WebGL canvas or an R3F test renderer — this codebase has no existing
 * precedent for testing `useFrame`-based components (no `HexDoor.test.tsx`
 * either), and standing one up was more machinery than this bug warranted.
 * The hook itself is a thin wrapper gluing these pure functions to
 * `useThree`/`useFrame`/refs.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { headingFromDelta } from './facing';
import { cubeToWorld, type CubeCoord } from './hexMath';

/** Seconds to walk ONE hex step (not the whole path). Tuned by eye against
 * Walk_Forward's ~1.03s loop (rpg-game-assets#20) so a step reads as "a
 * stride or two," not a dash or a crawl — the clip free-loops
 * independently of how long a single step takes, so this isn't tied 1:1
 * to the clip's own duration. Flagged as a judgment call / playtest-tuning
 * knob in the PR body. */
export const SECONDS_PER_HEX_STEP = 0.45;

export interface WorldPoint {
  x: number;
  z: number;
}

export interface StepState {
  points: WorldPoint[];
  index: number;
  elapsed: number;
}

export interface UseHexMovePathResult {
  /** True while stepping through a real move — pass straight through to
   * ClassCharacterModel to pick the walk clip over idle. */
  isMoving: boolean;
}

export interface MoveStartResult {
  /** Whether `moveSeq` represents a real, not-yet-seen move. */
  isGenuineMove: boolean;
  /** The new value to store as `seenSeq` for the NEXT call — always
   * `moveSeq` itself (see the module doc comment on why this must be
   * written unconditionally, including when it's `undefined`). */
  nextSeenSeq: number | undefined;
  /** World-space points to walk through, oldest first. Empty when
   * `isGenuineMove` is false (nothing to animate). */
  points: WorldPoint[];
}

/**
 * Decide whether `moveSeq` represents a genuine, not-yet-animated move
 * (vs. the initial mount, a non-move position change, or a re-render
 * where `moveSeq` hasn't advanced since we last saw it), and if so, build
 * the world-space point sequence to walk through.
 *
 * Pure and stateless — the caller (the `useHexMovePath` hook) owns
 * `seenSeq` (typically in a `useRef`) and MUST persist `nextSeenSeq` back
 * into it after every call, unconditionally, even when `isGenuineMove` is
 * false. That "even when false" part is exactly the bug rpg-dnd5e-web#551's
 * gate review caught: an earlier version only persisted the new value
 * when `moveSeq !== undefined`, which let a revive's `undefined` fail to
 * clear a stale prior value — see the module doc comment for the full
 * trace. Returning `nextSeenSeq` from here (rather than mutating a ref
 * inside this function) is what makes that contract testable without any
 * React/R3F machinery: a test can just call this repeatedly and thread
 * the return value through by hand, exactly mirroring what the hook does.
 */
export function computeMoveStart(
  moveSeq: number | undefined,
  seenSeq: number | undefined,
  movePath: CubeCoord[] | undefined,
  entityPosition: CubeCoord,
  hexSize: number,
  current: WorldPoint
): MoveStartResult {
  const isGenuineMove = moveSeq !== undefined && moveSeq !== seenSeq;

  if (!isGenuineMove) {
    return { isGenuineMove: false, nextSeenSeq: moveSeq, points: [] };
  }

  const pathWorld = (
    movePath && movePath.length > 0 ? movePath : [entityPosition]
  ).map((p) => cubeToWorld(p, hexSize));
  const startsAtCurrent =
    pathWorld.length > 0 &&
    pathWorld[0].x === current.x &&
    pathWorld[0].z === current.z;
  const points = startsAtCurrent ? pathWorld : [current, ...pathWorld];

  return { isGenuineMove: true, nextSeenSeq: moveSeq, points };
}

export interface FrameAdvanceResult {
  /** The lerped world-space position for THIS frame. */
  position: WorldPoint;
  /** True once this step's `elapsed` has reached `secondsPerStep` — the
   * caller should advance `index` and reset `elapsed`. */
  stepComplete: boolean;
}

/**
 * Advance one step of a `StepState` by `delta` seconds and return the
 * lerped position for this frame. Pure — does not mutate `step`; the
 * caller (the hook's `useFrame` callback) applies `elapsedAfterDelta` and
 * `stepComplete` itself. Returns `undefined` when there's no in-flight
 * step to advance (already at the final point).
 */
export function advanceFrame(
  step: StepState,
  delta: number,
  secondsPerStep: number = SECONDS_PER_HEX_STEP
): FrameAdvanceResult | undefined {
  if (step.index >= step.points.length - 1) return undefined;
  const elapsed = step.elapsed + delta;
  const t = Math.min(1, elapsed / secondsPerStep);
  const a = step.points[step.index];
  const b = step.points[step.index + 1];
  return {
    position: {
      x: THREE.MathUtils.lerp(a.x, b.x, t),
      z: THREE.MathUtils.lerp(a.z, b.z, t),
    },
    stepComplete: t >= 1,
  };
}

/**
 * The world heading of the leg currently being walked, or `undefined` when
 * there is no in-flight leg (already at the final point) or the leg has zero
 * length (rpg-api#656's same-hex move).
 *
 * Pure and stateless, like `computeMoveStart` and `advanceFrame` above, and for
 * the same reason — it is directly unit-testable with no R3F machinery.
 *
 * This hook REPORTS the heading; it does not own facing. See
 * `useEntityFacing.ts` for why that separation matters (short version: #590
 * wants attacks to turn the attacker toward its target, and that heading can
 * never come from a move path).
 */
export function segmentHeading(step: StepState): number | undefined {
  if (step.index >= step.points.length - 1) return undefined;
  const a = step.points[step.index];
  const b = step.points[step.index + 1];
  return headingFromDelta(b.x - a.x, b.z - a.z);
}

export function useHexMovePath(
  entityPosition: CubeCoord,
  movePath: CubeCoord[] | undefined,
  moveSeq: number | undefined,
  hexSize: number,
  yOffset: number,
  // Caller-owned as of rpg-dnd5e-web#590: `useEntityFacing` drives
  // `.rotation.y` on this same object while this hook drives `.position`. If
  // this hook created the ref, the two hooks would be circular at the call
  // site. The two writes are disjoint by property, so they cannot fight.
  groupRef: React.RefObject<THREE.Group | null>,
  onHeading?: (radians: number) => void,
  /** Reports completion of the exact move instance that finished painting.
   * Presentation-only: callers must not treat this as game-state completion. */
  onPresentationComplete?: (moveSeq: number) => void
): UseHexMovePathResult {
  const [isMoving, setIsMoving] = useState(false);
  const { invalidate } = useThree();

  // Read through a ref so a caller passing an inline closure cannot re-run the
  // move effect below — its dependency list must track the MOVE, not the
  // identity of a callback.
  //
  // Assigned during render rather than in an effect, deliberately: the move
  // useLayoutEffect below reports the FIRST leg's heading, and a plain
  // useEffect assignment would not have run yet at that point, so the very
  // first leg of every move would report through a stale callback.
  const onHeadingRef = useRef(onHeading);
  onHeadingRef.current = onHeading;
  const onPresentationCompleteRef = useRef(onPresentationComplete);
  onPresentationCompleteRef.current = onPresentationComplete;

  const seenSeqRef = useRef<number | undefined>(undefined);
  const activeMoveSeqRef = useRef<number | undefined>(undefined);
  const stepRef = useRef<StepState>({ points: [], index: 0, elapsed: 0 });

  const destination = cubeToWorld(entityPosition, hexSize);

  useLayoutEffect(() => {
    if (!groupRef.current) return;
    const current = {
      x: groupRef.current.position.x,
      z: groupRef.current.position.z,
    };
    const result = computeMoveStart(
      moveSeq,
      seenSeqRef.current,
      movePath,
      entityPosition,
      hexSize,
      current
    );
    // Unconditional, per computeMoveStart's doc comment — this is the
    // rpg-dnd5e-web#551 gate-review fix. Do not gate this on
    // `moveSeq !== undefined`.
    seenSeqRef.current = result.nextSeenSeq;

    if (!result.isGenuineMove) {
      // A canonical/knowledge refresh can replace position/path objects while
      // the same streamed moveSeq is still painting. That is the SAME move,
      // not a snap/reset: keep its frame loop alive so its exact completion
      // can satisfy the presentation gate. This applies identically to player
      // and NPC actors.
      if (
        moveSeq !== undefined &&
        activeMoveSeqRef.current === moveSeq &&
        stepRef.current.points.length > 1
      ) {
        return;
      }
      // Initial mount, non-move position change (initial placement,
      // ghost/revive), or a settled re-render where moveSeq hasn't advanced
      // since we last saw it — snap straight to the destination, matching
      // pre-#542 behavior exactly. Also clears any in-flight step so a stale
      // useFrame tick from a reset can't keep nudging the position.
      activeMoveSeqRef.current = undefined;
      stepRef.current = { points: [], index: 0, elapsed: 0 };
      groupRef.current.position.set(destination.x, yOffset, destination.z);
      setIsMoving(false);
      return;
    }

    stepRef.current = { points: result.points, index: 0, elapsed: 0 };
    activeMoveSeqRef.current = moveSeq;
    setIsMoving(result.points.length > 1);
    if (result.points.length <= 1 && moveSeq !== undefined) {
      onPresentationCompleteRef.current?.(moveSeq);
    }
    // Report the first leg's heading. `undefined` for a zero-length leg (the
    // #656 same-hex move) means "no opinion" — the entity holds whatever it
    // was already facing rather than snapping to due north.
    const startHeading = segmentHeading(stepRef.current);
    if (startHeading !== undefined) onHeadingRef.current?.(startHeading);
    invalidate();
  }, [
    moveSeq,
    movePath,
    entityPosition,
    hexSize,
    destination.x,
    destination.z,
    yOffset,
    invalidate,
    groupRef,
  ]);

  useFrame((_state, delta) => {
    if (!groupRef.current) return;
    const s = stepRef.current;
    const advanced = advanceFrame(s, delta);
    if (!advanced) return;
    s.elapsed += delta;
    groupRef.current.position.x = advanced.position.x;
    groupRef.current.position.z = advanced.position.z;
    invalidate();
    if (advanced.stepComplete) {
      s.index += 1;
      s.elapsed = 0;
      // Once per segment, not once per frame — the heading only changes when
      // the leg does.
      const nextHeading = segmentHeading(s);
      if (nextHeading !== undefined) onHeadingRef.current?.(nextHeading);
      if (s.index >= s.points.length - 1) {
        setIsMoving(false);
        const completedSeq = activeMoveSeqRef.current;
        activeMoveSeqRef.current = undefined;
        if (completedSeq !== undefined) {
          onPresentationCompleteRef.current?.(completedSeq);
        }
      }
    }
  });

  return { isMoving };
}
