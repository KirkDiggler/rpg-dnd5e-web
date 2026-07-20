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
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { cubeToWorld, type CubeCoord } from './hexMath';

/** Seconds to walk ONE hex step (not the whole path). Tuned by eye against
 * Walk_Forward's ~1.03s loop (rpg-game-assets#20) so a step reads as "a
 * stride or two," not a dash or a crawl — the clip free-loops
 * independently of how long a single step takes, so this isn't tied 1:1
 * to the clip's own duration. Flagged as a judgment call / playtest-tuning
 * knob in the PR body. */
const SECONDS_PER_HEX_STEP = 0.45;

interface WorldPoint {
  x: number;
  z: number;
}

interface StepState {
  points: WorldPoint[];
  index: number;
  elapsed: number;
}

export interface UseHexMovePathResult {
  /** Attach to the group whose position should reflect the entity's
   * (possibly-interpolating) board position. */
  groupRef: React.RefObject<THREE.Group | null>;
  /** True while stepping through a real move — pass straight through to
   * ClassCharacterModel to pick the walk clip over idle. */
  isMoving: boolean;
}

export function useHexMovePath(
  entityPosition: CubeCoord,
  movePath: CubeCoord[] | undefined,
  moveSeq: number | undefined,
  hexSize: number,
  yOffset: number
): UseHexMovePathResult {
  const groupRef = useRef<THREE.Group>(null);
  const [isMoving, setIsMoving] = useState(false);
  const { invalidate } = useThree();

  const seenSeqRef = useRef<number | undefined>(undefined);
  const stepRef = useRef<StepState>({ points: [], index: 0, elapsed: 0 });

  const destination = cubeToWorld(entityPosition, hexSize);

  useLayoutEffect(() => {
    if (!groupRef.current) return;
    const isGenuineMove =
      moveSeq !== undefined && moveSeq !== seenSeqRef.current;
    if (moveSeq !== undefined) seenSeqRef.current = moveSeq;

    if (!isGenuineMove) {
      // Initial mount, non-move position change (initial placement,
      // ghost/revive), or a re-render where moveSeq hasn't advanced since
      // we last saw it — snap straight to the destination, matching
      // pre-#542 behavior exactly. Also clears any in-flight step so a
      // stale useFrame tick from a just-superseded move can't keep nudging
      // the position after a non-move update resets it.
      stepRef.current = { points: [], index: 0, elapsed: 0 };
      groupRef.current.position.set(destination.x, yOffset, destination.z);
      setIsMoving(false);
      return;
    }

    const current = {
      x: groupRef.current.position.x,
      z: groupRef.current.position.z,
    };
    const pathWorld = (
      movePath && movePath.length > 0 ? movePath : [entityPosition]
    ).map((p) => cubeToWorld(p, hexSize));
    const startsAtCurrent =
      pathWorld.length > 0 &&
      pathWorld[0].x === current.x &&
      pathWorld[0].z === current.z;
    const points = startsAtCurrent ? pathWorld : [current, ...pathWorld];

    stepRef.current = { points, index: 0, elapsed: 0 };
    setIsMoving(points.length > 1);
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
  ]);

  useFrame((_state, delta) => {
    const s = stepRef.current;
    if (!groupRef.current || s.index >= s.points.length - 1) return;
    s.elapsed += delta;
    const t = Math.min(1, s.elapsed / SECONDS_PER_HEX_STEP);
    const a = s.points[s.index];
    const b = s.points[s.index + 1];
    groupRef.current.position.x = THREE.MathUtils.lerp(a.x, b.x, t);
    groupRef.current.position.z = THREE.MathUtils.lerp(a.z, b.z, t);
    invalidate();
    if (t >= 1) {
      s.index += 1;
      s.elapsed = 0;
      if (s.index >= s.points.length - 1) {
        setIsMoving(false);
      }
    }
  });

  return { groupRef, isMoving };
}
