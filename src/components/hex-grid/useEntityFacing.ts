/**
 * Owns one entity's world-space heading and eases it onto the group's
 * `rotation.y` (rpg-dnd5e-web#590 — "characters don't face their direction of
 * travel").
 *
 * This is deliberately NOT part of `useHexMovePath`. #590 noted that facing is
 * not only about movement — an attack wants the attacker turned toward its
 * target, which has nothing to do with a move path — and then proposed two
 * shapes that both made the movement hook the owner of facing. That is
 * structurally the one place attack-facing can never come from. So the movement
 * hook only REPORTS its current segment heading (see `segmentHeading` there),
 * and this hook owns the heading and accepts requests from any source. Movement
 * is the only source wired today; attack-facing is a second caller of
 * `requestHeading`, not a change to this file.
 *
 * No priority/arbitration between sources: last request wins. With one source
 * that rule is unfalsifiable, so building anything richer now would be
 * designing against an imagined conflict.
 *
 * Ownership contract, shared with `useHexMovePath`: that hook owns the group's
 * `.position` and ONLY `.position`; this hook owns `.rotation.y` and ONLY
 * `.rotation.y`. The two are disjoint, so both can drive the same object every
 * frame without fighting. As with position, the group must NOT also carry a
 * declarative `rotation` prop, or React would re-apply a stale value on renders
 * neither hook caused.
 *
 * Heading here is world-space only. The correction for a rig whose forward axis
 * is not +Z is a separate, composed term applied by the model component itself
 * (see the forward-offset constants in `facing.ts`) — the two were fused into a
 * single hardcoded `Math.PI` before #590, which is exactly why nobody could
 * tell them apart.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { easeHeading } from './facing';

export interface UseEntityFacingResult {
  /** Ask the entity to turn to a world-space heading (radians). Safe to call
   * from anywhere — an effect, an event handler, or a frame callback. */
  requestHeading: (radians: number) => void;
}

export function useEntityFacing(
  groupRef: React.RefObject<THREE.Group | null>,
  initialHeading: number
): UseEntityFacingResult {
  const { invalidate } = useThree();
  const currentRef = useRef(initialHeading);
  const targetRef = useRef(initialHeading);
  const seededRef = useRef(false);

  // Layout effect, not a plain effect: the seed must land before the first
  // paint or the entity renders one frame at heading 0 and visibly snaps.
  // Guarded to run once — re-seeding on a later render would yank a mid-turn
  // character back to its spawn pose.
  useLayoutEffect(() => {
    if (seededRef.current || !groupRef.current) return;
    seededRef.current = true;
    currentRef.current = initialHeading;
    targetRef.current = initialHeading;
    groupRef.current.rotation.y = initialHeading;
  }, [groupRef, initialHeading]);

  const requestHeading = useCallback(
    (radians: number) => {
      targetRef.current = radians;
      // Kick the demand-driven frameloop; the useFrame below will not run on
      // its own once things have settled.
      invalidate();
    },
    [invalidate]
  );

  useFrame((_state, delta) => {
    const group = groupRef.current;
    if (!group) return;
    // Exact equality is the settle condition, which is why easeHeading returns
    // `target` itself rather than something merely very close.
    if (currentRef.current === targetRef.current) return;
    currentRef.current = easeHeading(
      currentRef.current,
      targetRef.current,
      delta
    );
    group.rotation.y = currentRef.current;
    invalidate();
  });

  return { requestHeading };
}
