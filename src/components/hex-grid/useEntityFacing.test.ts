import { act, renderHook } from '@testing-library/react';
import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock @react-three/fiber so useEntityFacing's useFrame/useThree calls work
// under plain renderHook (no real WebGL canvas) — same harness as
// useHexMovePath.test.ts, and for the same reason.
const hoisted = vi.hoisted(() => ({
  frameCallback: undefined as
    ((state: unknown, delta: number) => void) | undefined,
  invalidate: vi.fn(),
}));

vi.mock('@react-three/fiber', () => ({
  useFrame: (cb: (state: unknown, delta: number) => void) => {
    hoisted.frameCallback = cb;
  },
  useThree: () => ({ invalidate: hoisted.invalidate }),
}));

// Import AFTER vi.mock so useEntityFacing picks up the mocked module.
import { useEntityFacing } from './useEntityFacing';

const tick = (delta: number) =>
  act(() => {
    hoisted.frameCallback?.({}, delta);
  });

function setup(initialHeading: number) {
  const group = new THREE.Group();
  const ref = { current: group } as React.RefObject<THREE.Group | null>;
  const hook = renderHook(() => useEntityFacing(ref, initialHeading));
  return { group, hook };
}

beforeEach(() => {
  hoisted.invalidate.mockClear();
});

describe('useEntityFacing', () => {
  it('seeds the initial heading on mount as a snap, not an ease', () => {
    // A character should spawn already facing its staging direction rather
    // than spinning into it over the first few frames.
    const { group } = setup(Math.PI);
    expect(group.rotation.y).toBe(Math.PI);
  });

  it('does not invalidate while settled', () => {
    // frameloop="demand": a perpetual invalidate loop is a real cost. This
    // hook must go quiet once it has nothing to turn.
    const { group } = setup(0);
    hoisted.invalidate.mockClear();
    tick(0.016);
    tick(0.016);
    expect(group.rotation.y).toBe(0);
    expect(hoisted.invalidate).not.toHaveBeenCalled();
  });

  it('eases toward a requested heading over successive frames', () => {
    const { group, hook } = setup(0);
    act(() => hook.result.current.requestHeading(Math.PI / 2));
    tick(0.1); // 8 rad/s * 0.1s = 0.8 rad, short of PI/2 (1.5708)
    expect(group.rotation.y).toBeCloseTo(0.8, 6);
    expect(group.rotation.y).toBeLessThan(Math.PI / 2);
    tick(0.1);
    expect(group.rotation.y).toBeCloseTo(1.5708, 4);
  });

  it('settles exactly on the target and then stops invalidating', () => {
    const { group, hook } = setup(0);
    act(() => hook.result.current.requestHeading(0.5));
    tick(1); // one huge frame: well past the target
    expect(group.rotation.y).toBe(0.5);
    hoisted.invalidate.mockClear();
    tick(0.016);
    expect(hoisted.invalidate).not.toHaveBeenCalled();
  });

  it('takes the short way around the wrap boundary', () => {
    const { group, hook } = setup((350 * Math.PI) / 180);
    act(() => hook.result.current.requestHeading((10 * Math.PI) / 180));
    tick(0.01); // 0.08 rad of a 0.349 rad (+20 deg) turn
    // Must have increased past 350 deg, not swung back down toward 10.
    expect(group.rotation.y).toBeGreaterThan((350 * Math.PI) / 180);
  });

  it('invalidates when a heading is requested, to restart the loop', () => {
    const { hook } = setup(0);
    hoisted.invalidate.mockClear();
    act(() => hook.result.current.requestHeading(1));
    expect(hoisted.invalidate).toHaveBeenCalled();
  });

  it('holds the last heading indefinitely once a turn completes', () => {
    // "Idle should hold the last heading" (rpg-dnd5e-web#590) — nothing in
    // this hook resets to the seed once a request has moved it.
    const { group, hook } = setup(0);
    act(() => hook.result.current.requestHeading(1.2));
    tick(1);
    expect(group.rotation.y).toBe(1.2);
    tick(5);
    expect(group.rotation.y).toBe(1.2);
  });
});
