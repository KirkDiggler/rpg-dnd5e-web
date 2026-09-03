import type { Scene3D } from '@/components/session/atlasToScene3D';
import { act, render, screen } from '@testing-library/react';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  type PropsWithChildren,
} from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalWorldDieCommand } from './localWorldDieCommand';
import {
  DIE_FLASH_TOTAL_MS,
  LOCAL_WORLD_DIE_RESULT_HOLD_MS,
  LocalWorldDieLayer,
  type LocalWorldDieLayerProps,
} from './LocalWorldDieLayer';

const mocks = vi.hoisted(() => ({
  afterPhysicsSteps: [] as Array<() => void>,
  frames: [] as Array<(state: unknown, delta: number) => void>,
  rigidBodyType: Object.freeze({
    Dynamic: 'dynamic',
    Fixed: 'fixed',
    KinematicPositionBased: 'kinematic',
  }),
  body: {
    rotation: vi.fn(() => ({ x: 0, y: 0, z: 0, w: 1 })),
    translation: vi.fn(() => ({ x: 0, y: 0.275, z: 0 })),
    linvel: vi.fn(() => ({ x: 0, y: 0, z: 0 })),
    angvel: vi.fn(() => ({ x: 0, y: 0, z: 0 })),
    setBodyType: vi.fn(),
    setLinvel: vi.fn(),
    setAngvel: vi.fn(),
    setTranslation: vi.fn(),
    setRotation: vi.fn(),
    setNextKinematicTranslation: vi.fn(),
    setNextKinematicRotation: vi.fn(),
    wakeUp: vi.fn(),
  },
}));

vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: (state: unknown, delta: number) => void) => {
    mocks.frames.push(callback);
  },
}));

vi.mock('@react-three/rapier', () => {
  const RigidBody = forwardRef(
    ({ children }: PropsWithChildren, ref: React.ForwardedRef<unknown>) => {
      useImperativeHandle(ref, () => mocks.body);
      return <>{children}</>;
    }
  );
  return {
    ConvexHullCollider: () => null,
    CuboidCollider: () => null,
    Physics: ({ children }: PropsWithChildren) => <>{children}</>,
    RigidBody,
    useAfterPhysicsStep: (callback: () => void) => {
      mocks.afterPhysicsSteps.push(callback);
    },
    useRapier: () => ({
      rapier: { RigidBodyType: mocks.rigidBodyType },
    }),
  };
});

vi.mock('@/components/ui/dice/diceRuntimeProvider', () => ({
  getDiceRuntimePresetSnapshot: () => ({
    status: 'ready',
    preset: {},
    scene: {},
    binding: {},
  }),
  preloadDiceRuntimePreset: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/components/ui/dice/diceSettlementResolver', () => ({
  resolveRuntimeDiceSettlement: () => ({ target: [0, 0, 0, 1] }),
}));

vi.mock('@/components/ui/dice/RuntimeDiceMesh', () => ({
  RuntimeDiceMesh: ({ onReady }: { readonly onReady: () => void }) => {
    useEffect(() => onReady(), [onReady]);
    return null;
  },
}));

vi.mock('@/components/ui/dice/TrayPlaneProjectionBridge', () => ({
  TrayPlaneProjectionBridge: () => null,
}));

// RollFlashDie's <Html> needs a real R3F/@react-three/fiber context
// (useThree) that this file's own useFrame/useAfterPhysicsStep-only mock
// deliberately doesn't provide (see its own `vi.mock('@react-three/fiber'...)`
// above). Rendering just the children is enough to assert on the flash's
// presence/absence and content by testid without needing that context.
vi.mock('@react-three/drei', () => ({
  Html: ({ children }: PropsWithChildren) => <>{children}</>,
}));

const releasedCommand: LocalWorldDieCommand = Object.freeze({
  id: 1,
  kind: 'released',
  held: Object.freeze({
    position: Object.freeze([0, 0] as const),
    height: 1.25,
  }),
  profile: Object.freeze({
    schemaVersion: 1,
    releasePosition: Object.freeze([0.5, 0.5] as const),
    releaseDirection: Object.freeze([1, 0] as const),
    releaseSpeed: 0.5,
    shakeEnergy: 0.25,
    spinBias: 0,
    motionSeed: 1,
  }),
  plannedTerminal: Object.freeze({
    kind: 'settled',
    step: 1,
    elapsedMs: 16,
    fingerprint: new Uint8Array(32).fill(0xaa),
    initialState: Object.freeze({
      position: Object.freeze({ x: 0, y: 1.25, z: 0 }),
      rotation: Object.freeze({ x: 0, y: 0, z: 0, w: 1 }),
      linearVelocity: Object.freeze({ x: 1, y: 0, z: 0 }),
      angularVelocity: Object.freeze({ x: 0, y: 1, z: 0 }),
    }),
    terminalState: Object.freeze({
      position: Object.freeze({ x: 0, y: 0.275, z: 0 }),
      rotation: Object.freeze({ x: 0, y: 0, z: 0, w: 1 }),
      linearVelocity: Object.freeze({ x: 0, y: 0, z: 0 }),
      angularVelocity: Object.freeze({ x: 0, y: 0, z: 0 }),
    }),
  }),
});

const resetCommand: LocalWorldDieCommand = Object.freeze({
  id: 2,
  kind: 'reset',
});

const emptyScene = {
  floorTiles: new Map(),
  wallRuns: [],
  doorGaps: [],
} as unknown as Scene3D;

function layerProps(
  onTerminal: LocalWorldDieLayerProps['onTerminal'],
  command: LocalWorldDieCommand = releasedCommand
): LocalWorldDieLayerProps {
  return {
    command,
    scene: emptyScene,
    colliders: [],
    authoritativeFace: 17,
    projectionRef: { current: undefined },
    onReadyChange: vi.fn(),
    onTerminal,
  };
}

function reachLandedResultHold() {
  act(() => mocks.afterPhysicsSteps.at(-1)?.());
  act(() => mocks.frames.at(-1)?.({}, 0.32));
}

describe('LocalWorldDieLayer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.afterPhysicsSteps.length = 0;
    mocks.frames.length = 0;
    for (const method of Object.values(mocks.body)) method.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('still reports settlement when its parent rerenders during the landed-result hold', () => {
    const onTerminal = vi.fn();
    const props = layerProps(onTerminal);
    const view = render(<LocalWorldDieLayer {...props} />);
    reachLandedResultHold();

    view.rerender(<LocalWorldDieLayer {...props} />);
    act(() => vi.advanceTimersByTime(LOCAL_WORLD_DIE_RESULT_HOLD_MS));

    expect(onTerminal).toHaveBeenCalledOnce();
    expect(onTerminal).toHaveBeenCalledWith('settled');
  });

  it('does not report stale settlement after the command changes', () => {
    const onTerminal = vi.fn();
    const view = render(<LocalWorldDieLayer {...layerProps(onTerminal)} />);
    reachLandedResultHold();

    view.rerender(
      <LocalWorldDieLayer {...layerProps(onTerminal, resetCommand)} />
    );
    act(() => vi.advanceTimersByTime(LOCAL_WORLD_DIE_RESULT_HOLD_MS));

    expect(onTerminal).not.toHaveBeenCalled();
  });

  it('does not report stale settlement after unmount', () => {
    const onTerminal = vi.fn();
    const view = render(<LocalWorldDieLayer {...layerProps(onTerminal)} />);
    reachLandedResultHold();

    view.unmount();
    act(() => vi.advanceTimersByTime(LOCAL_WORLD_DIE_RESULT_HOLD_MS));

    expect(onTerminal).not.toHaveBeenCalled();
  });

  describe('rollFlashEnabled — round 3 fix', () => {
    // The bug this whole describe block exists to pin: the flash USED to be
    // gated on a view-level `localWorldDieSettled` that only flipped true at
    // the END of the hold, by which point the layer was already tearing
    // down — the flash never rendered. It has to be up DURING the
    // correction spin, not just after.
    it('shows nothing while still tumbling', () => {
      const props = { ...layerProps(vi.fn()), rollFlashEnabled: true };
      render(<LocalWorldDieLayer {...props} />);
      expect(screen.queryByTestId('roll-flash-die')).toBeNull();
    });

    it('shows the natural roll the instant physics settles — DURING the correction spin, not after it', () => {
      const props = { ...layerProps(vi.fn()), rollFlashEnabled: true };
      render(<LocalWorldDieLayer {...props} />);

      // physicsStep reaches the planned terminal: beginAssist runs. The
      // correction spin (the `useFrame` slerp) has NOT run yet at this point.
      act(() => mocks.afterPhysicsSteps.at(-1)?.());

      expect(screen.getByTestId('roll-flash-die').textContent).toBe('17');
    });

    it('stays up through the correction spin and the settle hold, then clears', () => {
      const props = { ...layerProps(vi.fn()), rollFlashEnabled: true };
      render(<LocalWorldDieLayer {...props} />);
      act(() => mocks.afterPhysicsSteps.at(-1)?.());
      expect(screen.getByTestId('roll-flash-die')).toBeTruthy();

      // Drive the correction spin (0.32s) to completion. This is a manual
      // `delta` passed straight to the mocked useFrame callback — it does
      // NOT advance the fake timer clock, so the flash's own real-time
      // window (DIE_FLASH_TOTAL_MS, started at beginAssist above) is
      // unaffected by it.
      act(() => mocks.frames.at(-1)?.({}, 0.32));
      expect(screen.getByTestId('roll-flash-die')).toBeTruthy();

      // Still up partway through the FULL total window (spin + hold).
      act(() => vi.advanceTimersByTime(DIE_FLASH_TOTAL_MS / 2));
      expect(screen.getByTestId('roll-flash-die')).toBeTruthy();

      // Cleared once the full correction-plus-hold window has elapsed.
      act(() => vi.advanceTimersByTime(DIE_FLASH_TOTAL_MS / 2 + 1));
      expect(screen.queryByTestId('roll-flash-die')).toBeNull();
    });

    it('never shows anything when the dial is off', () => {
      const props = { ...layerProps(vi.fn()), rollFlashEnabled: false };
      render(<LocalWorldDieLayer {...props} />);
      act(() => mocks.afterPhysicsSteps.at(-1)?.());
      act(() => mocks.frames.at(-1)?.({}, 0.32));
      act(() => vi.advanceTimersByTime(LOCAL_WORLD_DIE_RESULT_HOLD_MS));
      expect(screen.queryByTestId('roll-flash-die')).toBeNull();
    });

    it('a new command (reroll) clears a flash left over from the previous throw', () => {
      const props = { ...layerProps(vi.fn()), rollFlashEnabled: true };
      const view = render(<LocalWorldDieLayer {...props} />);
      act(() => mocks.afterPhysicsSteps.at(-1)?.());
      expect(screen.getByTestId('roll-flash-die')).toBeTruthy();

      view.rerender(
        <LocalWorldDieLayer
          {...layerProps(vi.fn(), resetCommand)}
          rollFlashEnabled
        />
      );
      expect(screen.queryByTestId('roll-flash-die')).toBeNull();
    });
  });
});
