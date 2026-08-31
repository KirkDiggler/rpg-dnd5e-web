import type { Scene3D } from '@/components/session/atlasToScene3D';
import { act, render } from '@testing-library/react';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  type PropsWithChildren,
} from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalWorldDieCommand } from './localWorldDieCommand';
import {
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
});
