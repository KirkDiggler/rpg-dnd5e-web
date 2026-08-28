import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AttackDie3DProps,
  AttackDieTelemetry,
} from '../../components/ui/dice/AttackDie3D';
import { ChoreographedSolverV1 } from '../../components/ui/dice/choreographedDiceMotion';
import type { DiceTrayPresentationProps } from '../../components/ui/dice/DiceTrayPresentation';
import {
  createVisualThrowProfile,
  parseVisualThrowProfile,
} from '../../components/ui/dice/visualThrowProfile';
import { DiceTray3DConceptPanel } from './DiceTray3DConceptPanel';
import { MONSTER_FIXTURE_RELEASE_DELAY_MS } from './diceTrayWitnessFixture';

const attackDieProps: AttackDie3DProps[] = [];
const presentationCalls: DiceTrayPresentationProps[] = [];
let suppressSpectatorBoundary = false;
const originalGetContext = Object.getOwnPropertyDescriptor(
  HTMLCanvasElement.prototype,
  'getContext'
);

vi.mock('../../components/ui/dice/DiceTrayPresentation', async (original) => {
  const actual =
    await original<
      typeof import('../../components/ui/dice/DiceTrayPresentation')
    >();
  const ActualDiceTrayPresentation = actual.DiceTrayPresentation;
  return {
    ...actual,
    DiceTrayPresentation: (props: DiceTrayPresentationProps) => {
      presentationCalls.push(props);
      return (
        <ActualDiceTrayPresentation
          {...props}
          onBoundaryDiagnostic={
            suppressSpectatorBoundary && props.witnessRole === 'spectator'
              ? undefined
              : props.onBoundaryDiagnostic
          }
        />
      );
    },
  };
});

vi.mock('../../components/ui/dice/AttackDie3D', () => ({
  AttackDie3D: (props: AttackDie3DProps) => {
    attackDieProps.push(props);
    return (
      <div
        data-testid="attack-die"
        data-presentation-token={props.presentationToken}
      >
        {props.fallback}
      </div>
    );
  },
}));

let capturedPointers: WeakMap<HTMLElement, Set<number>>;

function capturePointer(this: HTMLElement, pointerId: number) {
  const captured = capturedPointers.get(this) ?? new Set<number>();
  captured.add(pointerId);
  capturedPointers.set(this, captured);
}

function pointerIsCaptured(this: HTMLElement, pointerId: number) {
  return capturedPointers.get(this)?.has(pointerId) ?? false;
}

function releaseCapturedPointer(this: HTMLElement, pointerId: number) {
  capturedPointers.get(this)?.delete(pointerId);
}

beforeEach(() => {
  localStorage.clear();
  attackDieProps.length = 0;
  presentationCalls.length = 0;
  capturedPointers = new WeakMap();
  suppressSpectatorBoundary = false;
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => null),
  });
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: {
      configurable: true,
      value: vi.fn(capturePointer),
    },
    hasPointerCapture: {
      configurable: true,
      value: vi.fn(pointerIsCaptured),
    },
    releasePointerCapture: {
      configurable: true,
      value: vi.fn(releaseCapturedPointer),
    },
    getBoundingClientRect: {
      configurable: true,
      value(this: HTMLElement) {
        const bounds = this.classList.contains('dice-tray-3d-grab-target')
          ? { left: 0, top: 0, width: 100, height: 100 }
          : { left: 0, top: 0, width: 240, height: 220 };
        return {
          ...bounds,
          right: bounds.left + bounds.width,
          bottom: bounds.top + bounds.height,
          x: bounds.left,
          y: bounds.top,
          toJSON: () => bounds,
        };
      },
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).hasPointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).releasePointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).getBoundingClientRect;
  if (originalGetContext)
    Object.defineProperty(
      HTMLCanvasElement.prototype,
      'getContext',
      originalGetContext
    );
});

function observed(props: AttackDie3DProps): AttackDieTelemetry {
  return {
    presentationToken: props.presentationToken,
    requestedResult: 10,
    renderer: '3d',
    state: 'observed',
    observedUpwardResult: 10,
    observedUpDot: 1,
    observedUpMargin: 0.25,
    angularErrorDegrees: 0,
    exactTargetHeld: true,
    motionRevision: 'choreographed-v1',
    throwProfile: props.throwProfile,
  };
}

const safeRollingMotionAggregate = (presentationToken: number) => ({
  presentationToken,
  motionRevision: 'choreographed-v1' as const,
  heldPoseApplied: false,
  heldPoseMoved: false,
  heldPoseRepeated: false,
  rollingPoseApplied: true,
  rollingPoseMoved: true,
  reducedHeldPoseRepeated: false,
  unexpectedMotion: false,
});

const publishedMotionAggregate = () => ({
  motionRevision: 'choreographed-v1' as const,
  heldPoseApplied: false,
  heldPoseMoved: false,
  heldPoseRepeated: false,
  rollingPoseApplied: true,
  rollingPoseMoved: true,
  reducedHeldPoseRepeated: false,
  unexpectedMotion: false,
});

function expectRecursivelyFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectRecursivelyFrozen(child);
}

function recursivelyCollectKeys(value: unknown, keys = new Set<string>()) {
  if (value === null || typeof value !== 'object') return keys;
  for (const [key, child] of Object.entries(value)) {
    keys.add(key.toLowerCase());
    recursivelyCollectKeys(child, keys);
  }
  return keys;
}

function drawer(label: 'Roller' | 'Spectator') {
  return screen.getByRole('complementary', {
    name: `${label} dice drawer`,
  });
}

function region(label: 'Roller' | 'Spectator') {
  return within(drawer(label)).getByRole('region', {
    name: `${label} attack dice`,
  });
}

function renderer(label: 'Roller' | 'Spectator') {
  return within(region(label)).getByTestId('dice-tray-3d-renderer');
}

function face(label: 'Roller' | 'Spectator') {
  return within(region(label)).getByTestId('dice-face');
}

function tokenFor(label: 'Roller' | 'Spectator') {
  return Number(
    within(region(label))
      .getByTestId('attack-die')
      .getAttribute('data-presentation-token')
  );
}

function latestAttack(token: number) {
  return [...attackDieProps]
    .reverse()
    .find((props) => props.presentationToken === token)!;
}

function latestPresentation(label: 'Roller' | 'Spectator') {
  return [...presentationCalls]
    .reverse()
    .find((props) => props.label === `${label} attack dice`)!;
}

function expectPhases(roller: string, spectator: string) {
  expect(region('Roller').getAttribute('data-phase')).toBe(roller);
  expect(region('Spectator').getAttribute('data-phase')).toBe(spectator);
}

describe('DiceTray3DConceptPanel', () => {
  it('renders mode controls, exact delivery copy, and two literal shared consumers of one array/provider', () => {
    const scene = {} as NonNullable<AttackDie3DProps['sceneOverride']>;
    const sidecar = {} as NonNullable<AttackDie3DProps['sidecarOverride']>;

    const view = render(
      <DiceTray3DConceptPanel
        token={9}
        reducedMotion={true}
        sceneOverride={scene}
        sidecarOverride={sidecar}
      />
    );

    expect(screen.getByText('Gameplay placement checkpoint')).toBeTruthy();
    expect(
      screen.getByText(
        'Fixture event delivery · shared component contract · no production transport'
      )
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Shared table dice feel lab' })
    ).toBeTruthy();
    expect(screen.getAllByTestId('roll-group-presentation')).toHaveLength(2);
    expect(
      (screen.getByRole('radio', { name: 'Player' }) as HTMLInputElement)
        .checked
    ).toBe(true);
    expect(
      (screen.getByRole('radio', { name: 'Monster' }) as HTMLInputElement)
        .checked
    ).toBe(false);
    expect(
      screen.getByRole('heading', { name: 'Roller', level: 4 })
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Spectator', level: 4 })
    ).toBeTruthy();
    expect(region('Roller')).toBeTruthy();
    expect(region('Spectator')).toBeTruthy();

    const rollerCall = latestPresentation('Roller');
    const spectatorCall = latestPresentation('Spectator');
    expect(rollerCall).not.toHaveProperty('mode');
    expect(spectatorCall).not.toHaveProperty('mode');
    expect(rollerCall.reducedMotion).toBe(true);
    expect(spectatorCall.reducedMotion).toBe(true);
    expect(rollerCall.events).toBe(spectatorCall.events);
    expect(Object.isFrozen(rollerCall.events)).toBe(true);
    expect(rollerCall.events).toEqual([
      expect.objectContaining({
        presentationId: 'concept:witness:player:9:result:10',
        roller: { entityId: 'concept:player', role: 'player' },
        die: {
          kind: 'd20',
          presetId: 'dice.original.carved.d20',
          authoritativeResult: 10,
        },
      }),
    ]);
    expect(rollerCall.witnessRole).toBe('roller');
    expect(rollerCall.onReleaseRequest).toEqual(expect.any(Function));
    expect(rollerCall.onTelemetry).toEqual(expect.any(Function));
    expect(rollerCall.onRendererInfo).toEqual(expect.any(Function));
    expect(spectatorCall.witnessRole).toBe('spectator');
    expect(spectatorCall.onReleaseRequest).toBeUndefined();
    expect(spectatorCall.onTelemetry).toEqual(expect.any(Function));
    expect(spectatorCall.onRendererInfo).toEqual(expect.any(Function));
    expect(rollerCall.developmentOnlyRenderer).toBeUndefined();
    expect(spectatorCall.developmentOnlyRenderer).toBeUndefined();

    const rollerToken = tokenFor('Roller');
    const spectatorToken = tokenFor('Spectator');
    expect(Number.isSafeInteger(rollerToken)).toBe(true);
    expect(Number.isSafeInteger(spectatorToken)).toBe(true);
    expect(rollerToken).not.toBe(spectatorToken);
    expect(latestAttack(rollerToken)).toMatchObject({
      result: 10,
      phase: 'ready',
      reducedMotion: true,
      provider: {
        kind: 'dice-runtime-preset',
        presetId: 'dice.original.carved.d20',
      },
      sceneOverride: undefined,
      sidecarOverride: undefined,
      calibrationPose: undefined,
    });
    expect(latestAttack(spectatorToken)).toMatchObject({
      result: 10,
      phase: 'ready',
      reducedMotion: true,
      provider: {
        kind: 'dice-runtime-preset',
        presetId: 'dice.original.carved.d20',
      },
      sceneOverride: undefined,
      sidecarOverride: undefined,
      calibrationPose: undefined,
    });
    expect(latestAttack(rollerToken).provider).toBe(
      latestAttack(spectatorToken).provider
    );

    view.rerender(
      <DiceTray3DConceptPanel
        token={9}
        reducedMotion={false}
        sceneOverride={scene}
        sidecarOverride={sidecar}
      />
    );
    const normalRollerCall = latestPresentation('Roller');
    const normalSpectatorCall = latestPresentation('Spectator');
    expect(normalRollerCall.reducedMotion).toBe(false);
    expect(normalSpectatorCall.reducedMotion).toBe(false);
    expect(normalRollerCall.events).toBe(rollerCall.events);
    expect(normalSpectatorCall.events).toBe(rollerCall.events);
    expect(normalRollerCall.developmentOnlyRenderer).toBeUndefined();
    expect(normalSpectatorCall.developmentOnlyRenderer).toBeUndefined();
    expect(tokenFor('Roller')).toBe(rollerToken);
    expect(tokenFor('Spectator')).toBe(spectatorToken);
    expect(latestAttack(rollerToken).reducedMotion).toBe(false);
    expect(latestAttack(spectatorToken).reducedMotion).toBe(false);

    expect(face('Roller').textContent).toBe('?');
    expect(face('Spectator').textContent).toBe('?');
    expect(
      within(drawer('Roller')).getByRole('button', { name: 'Roll d20' })
    ).toBeTruthy();
    expect(
      within(drawer('Roller')).getByRole('button', { name: 'Grab d20' })
    ).toBeTruthy();
    expect(
      within(drawer('Spectator')).queryByRole('button', { name: /d20/ })
    ).toBeNull();
  });

  it('withholds shared provider identity until exactly two defined equal witness contributions exist', () => {
    suppressSpectatorBoundary = true;
    render(<DiceTray3DConceptPanel token={89} reducedMotion={false} />);

    const bridge = window.__stone1TrayEvidence;
    expect(latestPresentation('Roller').onBoundaryDiagnostic).toBeDefined();
    expect(latestPresentation('Spectator').onBoundaryDiagnostic).toBeDefined();
    expect(bridge?.shared.eventArrayId).toBeGreaterThan(0);
    expect(bridge?.shared).not.toHaveProperty('providerId');
  });

  it('publishes only safe final Stone 1 evidence after a valid shared release', () => {
    render(<DiceTray3DConceptPanel token={90} reducedMotion={false} />);
    const rollerToken = tokenFor('Roller');
    const spectatorToken = tokenFor('Spectator');

    const roll = within(drawer('Roller')).getByRole('button', {
      name: 'Roll d20',
    });
    roll.focus();
    fireEvent.click(roll);
    expect(document.activeElement).toBe(roll);

    const rollerAttack = latestAttack(rollerToken);
    const spectatorAttack = latestAttack(spectatorToken);
    expect(rollerAttack.throwProfile).toEqual(spectatorAttack.throwProfile);

    act(() => {
      rollerAttack.onRendererInfo?.({
        presentationToken: rollerToken,
        calls: 1,
        triangles: 1,
        geometries: 1,
        textures: 0,
        programs: 1,
        lifecycle: 'sampled',
        contextId: 11,
      });
      spectatorAttack.onRendererInfo?.({
        presentationToken: spectatorToken,
        calls: 1,
        triangles: 1,
        geometries: 1,
        textures: 0,
        programs: 1,
        lifecycle: 'sampled',
        contextId: 12,
      });
      rollerAttack.onTelemetry?.({
        ...observed(rollerAttack),
        runtimeSourceId: 7,
        runtimeCloneId: 8,
      });
      spectatorAttack.onTelemetry?.({
        ...observed(spectatorAttack),
        runtimeSourceId: 7,
        runtimeCloneId: 9,
      });
      rollerAttack.onMotionDiagnostic?.(
        safeRollingMotionAggregate(rollerToken)
      );
      spectatorAttack.onMotionDiagnostic?.(
        safeRollingMotionAggregate(spectatorToken)
      );
    });

    const bridge = (
      window as unknown as {
        __stone1TrayEvidence?: Record<string, unknown>;
      }
    ).__stone1TrayEvidence as {
      request: { identity: string; result: number; presetId: string };
      shared: { eventArrayId: number; providerId: number };
      releaseCount: number;
      releaseSchemaVersion: number;
      lifecyclePhase: string;
      rollerGrabbed: boolean;
      spectatorGrabbed: boolean;
      witnesses: Record<
        'roller' | 'spectator',
        {
          rendererContextId: number;
          runtimeSourceId: number;
          runtimeCloneId: number;
          releaseProfile: unknown;
          finalTelemetry: Record<string, unknown>;
          motion: Record<string, unknown>;
        }
      >;
    };
    expect(bridge).toMatchObject({
      request: {
        identity: 'concept:witness:player:90:result:10',
        result: 10,
        presetId: 'dice.original.carved.d20',
      },
      releaseCount: 1,
      releaseSchemaVersion: 2,
      lifecyclePhase: 'settled',
      rollerGrabbed: false,
      spectatorGrabbed: false,
      witnesses: {
        roller: {
          rendererContextId: 11,
          runtimeSourceId: 7,
          runtimeCloneId: 8,
          finalTelemetry: {
            motionRevision: 'choreographed-v1',
            requestedResult: 10,
            observedUpwardResult: 10,
            observedUpDot: 1,
            observedUpMargin: 0.25,
            angularErrorDegrees: 0,
            exactTargetHeld: true,
            contextId: 11,
            cloneId: 8,
          },
        },
        spectator: {
          rendererContextId: 12,
          runtimeSourceId: 7,
          runtimeCloneId: 9,
          finalTelemetry: {
            motionRevision: 'choreographed-v1',
            requestedResult: 10,
            observedUpwardResult: 10,
            observedUpDot: 1,
            observedUpMargin: 0.25,
            angularErrorDegrees: 0,
            exactTargetHeld: true,
            contextId: 12,
            cloneId: 9,
          },
        },
      },
    });
    expect(bridge.witnesses.roller.motion).toEqual(publishedMotionAggregate());
    expect(bridge.witnesses.spectator.motion).toEqual(
      publishedMotionAggregate()
    );
    expectRecursivelyFrozen(bridge.witnesses.roller.motion);
    expectRecursivelyFrozen(bridge.witnesses.spectator.motion);
    expect(bridge.shared.eventArrayId).toBeGreaterThan(0);
    expect(bridge.shared.providerId).toBeGreaterThan(0);
    expect(bridge.witnesses.roller.releaseProfile).toEqual(
      bridge.witnesses.spectator.releaseProfile
    );
    expect(
      parseVisualThrowProfile(bridge.witnesses.roller.releaseProfile)
    ).toEqual(bridge.witnesses.roller.releaseProfile);
    expectRecursivelyFrozen(bridge.witnesses.roller.releaseProfile);
    expectRecursivelyFrozen(bridge.witnesses.roller.finalTelemetry);

    const forbidden = [
      'pointerid',
      'pointertype',
      'clientx',
      'clienty',
      'timems',
      'timestamp',
      'history',
      'pathlength',
      'translation',
      'quaternion',
      'velocity',
      'tilt',
      'sequence',
      'sample',
      'motionsamples',
      'domrect',
      'normalizedposition',
      'normalizedtilt',
      'wobblephase',
      'mappedtarget',
      'observedquaternion',
      'presentationtoken',
      'failurereason',
    ];
    const keys = recursivelyCollectKeys(bridge);
    for (const key of forbidden) expect(keys.has(key)).toBe(false);
    expect(
      (window as unknown as { __stone0TrayEvidence?: unknown })
        .__stone0TrayEvidence
    ).toBeUndefined();
  });

  it('rejects malformed renderer and runtime ownership scalars without changing the safe bridge', () => {
    render(<DiceTray3DConceptPanel token={902} reducedMotion={false} />);
    fireEvent.click(
      within(drawer('Roller')).getByRole('button', { name: 'Roll d20' })
    );
    const roller = latestPresentation('Roller');
    const rollerAttack = latestAttack(tokenFor('Roller'));
    const before = window.__stone1TrayEvidence;
    const smuggledOwnership = Object.freeze({
      pointerId: 73,
      history: Object.freeze([{ clientX: 10, clientY: 20 }]),
    }) as unknown as number;

    act(() => {
      roller.onRendererInfo?.({
        presentationToken: rollerAttack.presentationToken,
        calls: 1,
        triangles: 1,
        geometries: 1,
        textures: 0,
        programs: 1,
        lifecycle: 'sampled',
        contextId: smuggledOwnership,
      });
      roller.onTelemetry?.({
        ...observed(rollerAttack),
        runtimeSourceId: smuggledOwnership,
        runtimeCloneId: Number.MAX_SAFE_INTEGER + 1,
      });
      roller.onRendererInfo?.({
        presentationToken: rollerAttack.presentationToken,
        calls: 1,
        triangles: 1,
        geometries: 1,
        textures: 0,
        programs: 1,
        lifecycle: 'sampled',
        contextId: 0,
      });
      roller.onTelemetry?.({
        ...observed(rollerAttack),
        runtimeSourceId: 0,
        runtimeCloneId: -1,
      });
    });

    expect(window.__stone1TrayEvidence).toBe(before);
    expect(window.__stone1TrayEvidence?.witnesses.roller).toEqual({
      releaseProfile: rollerAttack.throwProfile,
    });
    const keys = recursivelyCollectKeys(window.__stone1TrayEvidence);
    for (const key of ['pointerid', 'history', 'clientx', 'clienty'])
      expect(keys.has(key)).toBe(false);
  });

  it('rejects final telemetry whose canonical profile differs from the accepted shared release', () => {
    render(<DiceTray3DConceptPanel token={903} reducedMotion={false} />);
    fireEvent.click(
      within(drawer('Roller')).getByRole('button', { name: 'Roll d20' })
    );
    const roller = latestPresentation('Roller');
    const rollerAttack = latestAttack(tokenFor('Roller'));
    const acceptedProfile = rollerAttack.throwProfile!;
    const mismatchedProfile = createVisualThrowProfile({
      releasePosition: acceptedProfile.releasePosition,
      releaseDirection: acceptedProfile.releaseDirection,
      releaseSpeed: acceptedProfile.releaseSpeed,
      shakeEnergy: acceptedProfile.shakeEnergy,
      spinBias: acceptedProfile.spinBias,
      motionSeed: acceptedProfile.motionSeed ^ 1,
    });
    const before = window.__stone1TrayEvidence;

    act(() =>
      roller.onTelemetry?.({
        ...observed(rollerAttack),
        throwProfile: mismatchedProfile,
        runtimeSourceId: 21,
        runtimeCloneId: 22,
      })
    );

    expect(window.__stone1TrayEvidence).toBe(before);
    expect(
      window.__stone1TrayEvidence?.witnesses.roller.finalTelemetry
    ).toBeUndefined();
    expect(
      window.__stone1TrayEvidence?.witnesses.roller.releaseProfile
    ).toEqual(acceptedProfile);

    act(() =>
      roller.onTelemetry?.({
        ...observed(rollerAttack),
        runtimeSourceId: 21,
        runtimeCloneId: 22,
      })
    );
    expect(
      window.__stone1TrayEvidence?.witnesses.roller.finalTelemetry
    ).toMatchObject({
      throwProfile: acceptedProfile,
      cloneId: 22,
    });
  });

  it('clears prior witness ownership and final facts before publishing a new renderer generation', () => {
    render(<DiceTray3DConceptPanel token={904} reducedMotion={false} />);
    fireEvent.click(
      within(drawer('Roller')).getByRole('button', { name: 'Roll d20' })
    );
    const roller = latestPresentation('Roller');
    const rollerAttack = latestAttack(tokenFor('Roller'));

    act(() => {
      roller.onRendererInfo?.({
        presentationToken: rollerAttack.presentationToken,
        calls: 1,
        triangles: 1,
        geometries: 1,
        textures: 0,
        programs: 1,
        lifecycle: 'sampled',
        contextId: 31,
      });
      roller.onTelemetry?.({
        ...observed(rollerAttack),
        runtimeSourceId: 30,
        runtimeCloneId: 32,
      });
    });
    expect(window.__stone1TrayEvidence?.witnesses.roller).toMatchObject({
      rendererContextId: 31,
      runtimeSourceId: 30,
      runtimeCloneId: 32,
      finalTelemetry: { cloneId: 32 },
    });

    const nextGeneration = rollerAttack.presentationToken - 1000;
    act(() =>
      roller.onBoundaryDiagnostic?.({
        events: roller.events,
        provider: rollerAttack.provider!,
        rendererGeneration: nextGeneration,
      })
    );
    const clearedBridge = window.__stone1TrayEvidence;
    expect(clearedBridge?.witnesses.roller).toEqual({
      releaseProfile: rollerAttack.throwProfile,
    });

    act(() => {
      roller.onRendererInfo?.({
        presentationToken: rollerAttack.presentationToken,
        calls: 0,
        triangles: 0,
        geometries: 0,
        textures: 0,
        programs: 0,
        lifecycle: 'release-observed',
        contextId: 41,
      });
      roller.onTelemetry?.({
        ...observed(rollerAttack),
        runtimeSourceId: 40,
        runtimeCloneId: 42,
      });
    });
    expect(window.__stone1TrayEvidence).toBe(clearedBridge);
    expect(window.__stone1TrayEvidence?.witnesses.roller).toEqual({
      releaseProfile: rollerAttack.throwProfile,
    });
  });

  it('rejects stale motion generations and ORs regressive exact-key callbacks monotonically without publishing the token', () => {
    render(<DiceTray3DConceptPanel token={905} reducedMotion={false} />);
    const roller = latestPresentation('Roller');
    const rollerAttack = latestAttack(tokenFor('Roller'));
    const oldGeneration = rollerAttack.presentationToken;
    const nextGeneration = oldGeneration - 1000;

    act(() =>
      roller.onBoundaryDiagnostic?.({
        events: roller.events,
        provider: rollerAttack.provider!,
        rendererGeneration: nextGeneration,
      })
    );

    const currentTruth = {
      presentationToken: nextGeneration,
      motionRevision: 'choreographed-v1' as const,
      heldPoseApplied: true,
      heldPoseMoved: true,
      heldPoseRepeated: true,
      rollingPoseApplied: false,
      rollingPoseMoved: false,
      reducedHeldPoseRepeated: false,
      unexpectedMotion: false,
    };
    act(() => rollerAttack.onMotionDiagnostic?.(currentTruth));
    expect(window.__stone1TrayEvidence?.witnesses.roller.motion).toEqual({
      motionRevision: 'choreographed-v1',
      heldPoseApplied: true,
      heldPoseMoved: true,
      heldPoseRepeated: true,
      rollingPoseApplied: false,
      rollingPoseMoved: false,
      reducedHeldPoseRepeated: false,
      unexpectedMotion: false,
    });
    expect(
      window.__stone1TrayEvidence?.witnesses.roller.motion
    ).not.toHaveProperty('presentationToken');
    expectRecursivelyFrozen(
      window.__stone1TrayEvidence?.witnesses.roller.motion
    );

    act(() =>
      rollerAttack.onMotionDiagnostic?.({
        presentationToken: nextGeneration,
        motionRevision: 'choreographed-v1',
        heldPoseApplied: false,
        heldPoseMoved: false,
        heldPoseRepeated: false,
        rollingPoseApplied: true,
        rollingPoseMoved: true,
        reducedHeldPoseRepeated: false,
        unexpectedMotion: false,
      })
    );
    expect(window.__stone1TrayEvidence?.witnesses.roller.motion).toEqual({
      motionRevision: 'choreographed-v1',
      heldPoseApplied: true,
      heldPoseMoved: true,
      heldPoseRepeated: true,
      rollingPoseApplied: true,
      rollingPoseMoved: true,
      reducedHeldPoseRepeated: false,
      unexpectedMotion: false,
    });

    const afterRegression = window.__stone1TrayEvidence;
    act(() =>
      rollerAttack.onMotionDiagnostic?.({
        presentationToken: oldGeneration,
        motionRevision: 'choreographed-v1',
        heldPoseApplied: false,
        heldPoseMoved: false,
        heldPoseRepeated: false,
        rollingPoseApplied: false,
        rollingPoseMoved: false,
        reducedHeldPoseRepeated: true,
        unexpectedMotion: true,
      })
    );
    expect(window.__stone1TrayEvidence).toBe(afterRegression);
    expect(window.__stone1TrayEvidence?.witnesses.roller.motion).toMatchObject({
      heldPoseApplied: true,
      rollingPoseApplied: true,
      reducedHeldPoseRepeated: false,
      unexpectedMotion: false,
    });
  });

  it('keeps the current diagnostic bridge when a disposed witness publishes late telemetry', () => {
    render(<DiceTray3DConceptPanel token={901} reducedMotion={false} />);
    const oldRoller = latestPresentation('Roller');
    const oldToken = tokenFor('Roller');

    fireEvent.change(screen.getByLabelText('Authoritative fixture result'), {
      target: { value: '11' },
    });
    const currentBridge = (
      window as unknown as { __stone1TrayEvidence?: object }
    ).__stone1TrayEvidence;
    expect(currentBridge).toBeTruthy();

    act(() => {
      oldRoller.onTelemetry?.({
        presentationToken: oldToken,
        requestedResult: 10,
        renderer: '3d',
        state: 'disposed',
        exactTargetHeld: false,
      });
      oldRoller.onRendererInfo?.({
        presentationToken: oldToken,
        calls: 0,
        triangles: 0,
        geometries: 0,
        textures: 0,
        programs: 0,
        lifecycle: 'release-observed',
        contextId: 901,
      });
    });

    expect(
      (window as unknown as { __stone1TrayEvidence?: object })
        .__stone1TrayEvidence
    ).toBe(currentBridge);
  });

  it('keeps synthetic renderer exercises explicit and never routes Tray through Lightning', () => {
    render(<DiceTray3DConceptPanel token={91} reducedMotion={false} />);
    const exercise = screen.getByLabelText('Evidence-only renderer exercise');

    fireEvent.change(exercise, { target: { value: 'unknown-safe-preset' } });
    expect(latestPresentation('Roller').events[0]).toMatchObject({
      die: { presetId: 'stone0.unknown.safe.d20' },
    });
    expect(
      attackDieProps.every(
        (value) => value.provider?.kind !== 'lightning-development'
      )
    ).toBe(true);

    fireEvent.change(exercise, { target: { value: 'unmapped-result' } });
    expect(latestAttack(tokenFor('Roller')).forceFailure).toBe('unmapped');

    fireEvent.change(exercise, { target: { value: 'shader-failure' } });
    expect(latestAttack(tokenFor('Roller')).forceFailure).toBe('shader');
  });

  it('accepts fixture results 1–20 and replaces request identity before any delivery', () => {
    render(<DiceTray3DConceptPanel token={10} reducedMotion={false} />);
    const input = screen.getByLabelText('Authoritative fixture result');
    let previousIdentity = '';

    for (const result of Array.from({ length: 20 }, (_, index) => index + 1)) {
      fireEvent.change(input, { target: { value: String(result) } });
      const roller = latestPresentation('Roller');
      const spectator = latestPresentation('Spectator');
      expect(roller.events).toBe(spectator.events);
      expect(roller.events).toHaveLength(1);
      expect(roller.events[0]).toMatchObject({
        presentationId: `concept:witness:player:10:result:${result}`,
        die: {
          presetId: 'dice.original.carved.d20',
          authoritativeResult: result,
        },
      });
      expect(roller.events[0].presentationId).not.toBe(previousIdentity);
      previousIdentity = roller.events[0].presentationId;
      expect(face('Roller').textContent).toBe('?');
      expect(face('Spectator').textContent).toBe('?');
    }
  });

  it('releases a quick pointer down/up with no move exactly once', () => {
    render(<DiceTray3DConceptPanel token={111} reducedMotion={false} />);
    const grab = within(drawer('Roller')).getByRole('button', {
      name: 'Grab d20',
    });

    fireEvent.pointerDown(grab, { pointerId: 31, clientX: 50, clientY: 50 });
    fireEvent.pointerUp(grab, { pointerId: 31, clientX: 50, clientY: 50 });
    fireEvent.pointerUp(grab, { pointerId: 31, clientX: 50, clientY: 50 });

    const events = latestPresentation('Roller').events;
    const releases = events.filter(
      (event) => event.type === 'dice-presentation-released'
    );
    expect(releases).toHaveLength(1);
    expect(releases[0]).toMatchObject({
      release: {
        throwProfile: {
          releaseDirection: [0, 0],
          releaseSpeed: 0,
          shakeEnergy: 0,
        },
      },
    });
  });

  it('compacts repeated shake and an outside-capture release into one bounded profile', () => {
    render(<DiceTray3DConceptPanel token={112} reducedMotion={false} />);
    const grab = within(drawer('Roller')).getByRole('button', {
      name: 'Grab d20',
    });

    fireEvent.pointerDown(grab, { pointerId: 32, clientX: 50, clientY: 50 });
    for (const [clientX, clientY] of [
      [-100, 300],
      [300, -100],
      [-100, 300],
      [300, -100],
    ])
      fireEvent.pointerMove(grab, { pointerId: 32, clientX, clientY });
    fireEvent.pointerUp(grab, {
      pointerId: 32,
      clientX: 400,
      clientY: -200,
    });

    const release = latestPresentation('Roller').events.find(
      (event) => event.type === 'dice-presentation-released'
    );
    expect(release?.type).toBe('dice-presentation-released');
    if (release?.type !== 'dice-presentation-released') return;
    expect(release.release.throwProfile.releasePosition).toEqual([1, 0]);
    expect(release.release.throwProfile.shakeEnergy).toBe(1);
    expect(parseVisualThrowProfile(release.release.throwProfile)).toEqual(
      release.release.throwProfile
    );
    expect(latestPresentation('Roller').events).toHaveLength(2);
  });

  it.each(['cancel', 'lost capture'] as const)(
    'clears local held state without release on pointer %s',
    (ending) => {
      render(<DiceTray3DConceptPanel token={113} reducedMotion={false} />);
      const grab = within(drawer('Roller')).getByRole('button', {
        name: 'Grab d20',
      });
      fireEvent.pointerDown(grab, {
        pointerId: 33,
        clientX: 20,
        clientY: 30,
      });
      if (ending === 'cancel') fireEvent.pointerCancel(grab, { pointerId: 33 });
      else fireEvent.lostPointerCapture(grab, { pointerId: 33 });

      expect(renderer('Roller').getAttribute('data-grabbed')).toBe('false');
      expect(latestPresentation('Roller').events).toHaveLength(1);
      expectPhases('armed', 'armed');
    }
  );

  it('clears a failed held renderer and reveals truthful SVG only after release semantics', () => {
    render(<DiceTray3DConceptPanel token={114} reducedMotion={false} />);
    const grab = within(drawer('Roller')).getByRole('button', {
      name: 'Grab d20',
    });
    fireEvent.pointerDown(grab, { pointerId: 34, clientX: 20, clientY: 30 });
    const armed = latestAttack(tokenFor('Roller'));

    act(() =>
      armed.onTelemetry?.({
        presentationToken: armed.presentationToken,
        requestedResult: 10,
        renderer: 'svg',
        state: 'failed',
        exactTargetHeld: false,
        failureCode: 'provider-load',
      })
    );

    expect(renderer('Roller').getAttribute('data-grabbed')).toBe('false');
    expect(face('Roller').textContent).toBe('?');
    expect(latestPresentation('Roller').events).toHaveLength(1);

    fireEvent.click(
      within(drawer('Roller')).getByRole('button', { name: 'Roll d20' })
    );
    expect(latestPresentation('Roller').events).toHaveLength(2);
    expect(region('Roller').getAttribute('data-phase')).toBe('settled');
    expect(face('Roller').textContent).toBe('10');
  });

  it('keeps keyboard Roll focused and emits a deeply frozen neutral profile', () => {
    render(<DiceTray3DConceptPanel token={115} reducedMotion={false} />);
    const roll = within(drawer('Roller')).getByRole('button', {
      name: 'Roll d20',
    });
    roll.focus();
    fireEvent.click(roll, { detail: 0 });

    expect(document.activeElement).toBe(roll);
    const release = latestPresentation('Roller').events.find(
      (event) => event.type === 'dice-presentation-released'
    );
    expect(release?.type).toBe('dice-presentation-released');
    if (release?.type !== 'dice-presentation-released') return;
    expect(release.release.throwProfile).toMatchObject({
      releasePosition: [0.5, 0.5],
      releaseDirection: [0, 0],
      releaseSpeed: 0,
      shakeEnergy: 0,
      spinBias: 0,
    });
    expectRecursivelyFrozen(release.release.throwProfile);
  });

  it('keeps pointer motion Roller-local, then shares one deep-equal release and settles telemetry independently', () => {
    render(
      <DiceTray3DConceptPanel
        token={12}
        reducedMotion={false}
        sceneOverride={{} as NonNullable<AttackDie3DProps['sceneOverride']>}
        sidecarOverride={{} as NonNullable<AttackDie3DProps['sidecarOverride']>}
      />
    );

    const originalEvents = latestPresentation('Roller').events;
    const callsBeforeMove = presentationCalls.length;
    const grab = within(drawer('Roller')).getByRole('button', {
      name: 'Grab d20',
    });
    fireEvent.pointerDown(grab, { pointerId: 4, clientX: 10, clientY: 20 });
    fireEvent.pointerMove(grab, { pointerId: 4, clientX: 90, clientY: -20 });

    expect(renderer('Roller').getAttribute('data-grabbed')).toBe('true');
    expect(renderer('Spectator').getAttribute('data-grabbed')).toBe('false');
    expect(latestPresentation('Roller').events).toBe(originalEvents);
    expect(presentationCalls).toHaveLength(callsBeforeMove);
    expect(originalEvents).toHaveLength(1);
    expectPhases('armed', 'armed');
    const heldBridge = (
      window as unknown as {
        __stone1TrayEvidence?: {
          rollerGrabbed: boolean;
          spectatorGrabbed: boolean;
          releaseCount: number;
          lifecyclePhase: string;
          witnesses: Record<string, { finalTelemetry?: unknown }>;
        };
      }
    ).__stone1TrayEvidence!;
    expect(heldBridge.rollerGrabbed).toBe(true);
    expect(heldBridge.spectatorGrabbed).toBe(false);
    expect(heldBridge.releaseCount).toBe(0);
    expect(heldBridge.lifecyclePhase).toBe('armed');
    expect(heldBridge.witnesses.roller.finalTelemetry).toBeUndefined();
    expect(heldBridge.witnesses.spectator.finalTelemetry).toBeUndefined();

    fireEvent.pointerUp(grab, {
      pointerId: 4,
      clientX: 90,
      clientY: -20,
    });
    fireEvent.pointerUp(grab, {
      pointerId: 4,
      clientX: 90,
      clientY: -20,
    });

    const rollerCall = latestPresentation('Roller');
    const spectatorCall = latestPresentation('Spectator');
    expect(rollerCall.events).toBe(spectatorCall.events);
    expect(rollerCall.events).toHaveLength(2);
    expect(
      rollerCall.events.filter(
        (event) => event.type === 'dice-presentation-released'
      )
    ).toHaveLength(1);
    expectPhases('rolling', 'rolling');

    const rollerToken = tokenFor('Roller');
    const spectatorToken = tokenFor('Spectator');
    const rollingRoller = latestAttack(rollerToken);
    const rollingSpectator = latestAttack(spectatorToken);
    expect(rollingRoller.throwProfile).toEqual(rollingSpectator.throwProfile);
    expect(rollingRoller.throwProfile).not.toBe(rollingSpectator.throwProfile);
    expect(rollingRoller.throwProfile).toMatchObject({
      schemaVersion: 1,
      releasePosition: [90 / 240, 0],
      releaseDirection: [expect.any(Number), expect.any(Number)],
      releaseSpeed: expect.any(Number),
      shakeEnergy: expect.any(Number),
      spinBias: expect.any(Number),
      motionSeed: expect.any(Number),
    });
    expect(parseVisualThrowProfile(rollingRoller.throwProfile)).toEqual(
      rollingRoller.throwProfile
    );
    expect(parseVisualThrowProfile(rollingSpectator.throwProfile)).toEqual(
      rollingSpectator.throwProfile
    );
    expectRecursivelyFrozen(rollingRoller.throwProfile);
    expectRecursivelyFrozen(rollingSpectator.throwProfile);

    const target = [0, 0, 0, 1] as const;
    for (const elapsedMs of [0, 333, 1200, 1900]) {
      const rollerPose = ChoreographedSolverV1.solve({
        phase: 'rolling',
        elapsedMs,
        reducedMotion: false,
        target,
        throwProfile: rollingRoller.throwProfile!,
        member: { memberIndex: 0, memberCount: 1 },
      });
      const spectatorPose = ChoreographedSolverV1.solve({
        phase: 'rolling',
        elapsedMs,
        reducedMotion: false,
        target,
        throwProfile: rollingSpectator.throwProfile!,
        member: { memberIndex: 0, memberCount: 1 },
      });
      expect(rollerPose).toEqual(spectatorPose);
    }

    act(() => {
      rollingRoller.onRendererInfo?.({
        presentationToken: rollerToken,
        calls: 1,
        triangles: 1,
        geometries: 1,
        textures: 0,
        programs: 1,
        lifecycle: 'sampled',
        contextId: 1201,
      });
      rollingSpectator.onRendererInfo?.({
        presentationToken: spectatorToken,
        calls: 1,
        triangles: 1,
        geometries: 1,
        textures: 0,
        programs: 1,
        lifecycle: 'sampled',
        contextId: 1202,
      });
    });

    act(() =>
      rollingSpectator.onTelemetry?.({
        ...observed(rollingSpectator),
        presentationToken: rollerToken,
      })
    );
    expectPhases('rolling', 'rolling');

    act(() =>
      rollingRoller.onTelemetry?.({
        ...observed(rollingRoller),
        runtimeSourceId: 1200,
        runtimeCloneId: 1201,
      })
    );
    expectPhases('settled', 'rolling');
    expect(face('Roller').textContent).toBe('10');
    expect(face('Spectator').textContent).not.toBe('10');

    act(() =>
      rollingSpectator.onTelemetry?.({
        ...observed(rollingSpectator),
        runtimeSourceId: 1200,
        runtimeCloneId: 1202,
      })
    );
    expectPhases('settled', 'settled');
    expect(face('Roller').textContent).toBe('10');
    expect(face('Spectator').textContent).toBe('10');

    const settledBridge = (
      window as unknown as {
        __stone1TrayEvidence?: {
          releaseCount: number;
          lifecyclePhase: string;
          witnesses: Record<
            'roller' | 'spectator',
            {
              rendererContextId: number;
              runtimeSourceId: number;
              runtimeCloneId: number;
              finalTelemetry: { observedUpwardResult: number };
            }
          >;
        };
      }
    ).__stone1TrayEvidence!;
    expect(settledBridge.releaseCount).toBe(1);
    expect(settledBridge.lifecyclePhase).toBe('settled');
    expect(settledBridge.witnesses.roller.runtimeSourceId).toBe(
      settledBridge.witnesses.spectator.runtimeSourceId
    );
    expect(settledBridge.witnesses.roller.runtimeCloneId).not.toBe(
      settledBridge.witnesses.spectator.runtimeCloneId
    );
    expect(settledBridge.witnesses.roller.rendererContextId).not.toBe(
      settledBridge.witnesses.spectator.rendererContextId
    );
    expect(
      settledBridge.witnesses.roller.finalTelemetry.observedUpwardResult
    ).toBe(10);
    expect(
      settledBridge.witnesses.spectator.finalTelemetry.observedUpwardResult
    ).toBe(10);
  });

  it('admits at most one Roll delivery and rejects old telemetry after mode/token resets', () => {
    const view = render(
      <DiceTray3DConceptPanel
        token={30}
        reducedMotion={false}
        sceneOverride={{} as NonNullable<AttackDie3DProps['sceneOverride']>}
        sidecarOverride={{} as NonNullable<AttackDie3DProps['sidecarOverride']>}
      />
    );

    const rollerButton = within(drawer('Roller')).getByRole('button', {
      name: 'Roll d20',
    });
    const oldRollerToken = tokenFor('Roller');
    const oldSpectatorToken = tokenFor('Spectator');
    fireEvent.click(rollerButton);
    fireEvent.click(rollerButton);
    expect(latestPresentation('Roller').events).toHaveLength(2);
    expect(
      latestPresentation('Roller').events.filter(
        (event) => event.type === 'dice-presentation-released'
      )
    ).toHaveLength(1);

    const oldRoller = latestAttack(oldRollerToken);
    const oldSpectator = latestAttack(oldSpectatorToken);
    fireEvent.click(screen.getByRole('radio', { name: 'Monster' }));

    expectPhases('armed', 'armed');
    const newRollerToken = tokenFor('Roller');
    const newSpectatorToken = tokenFor('Spectator');
    expect(newRollerToken).not.toBe(oldRollerToken);
    expect(newRollerToken).not.toBe(oldSpectatorToken);
    expect(newSpectatorToken).not.toBe(oldRollerToken);
    expect(newSpectatorToken).not.toBe(oldSpectatorToken);
    expect(latestPresentation('Roller').events).toEqual([
      expect.objectContaining({
        presentationId: 'concept:witness:monster:30:result:10',
        roller: { entityId: 'concept:monster', role: 'monster' },
      }),
    ]);

    act(() => oldRoller.onTelemetry?.(observed(oldRoller)));
    act(() => oldSpectator.onTelemetry?.(observed(oldSpectator)));
    const newRoller = latestAttack(newRollerToken);
    const newSpectator = latestAttack(newSpectatorToken);
    act(() =>
      newRoller.onTelemetry?.({
        ...observed(newRoller),
        presentationToken: oldRollerToken,
      })
    );
    act(() =>
      newSpectator.onTelemetry?.({
        ...observed(newSpectator),
        presentationToken: oldSpectatorToken,
      })
    );
    expectPhases('armed', 'armed');

    view.rerender(
      <DiceTray3DConceptPanel
        token={31}
        reducedMotion={false}
        sceneOverride={{} as NonNullable<AttackDie3DProps['sceneOverride']>}
        sidecarOverride={{} as NonNullable<AttackDie3DProps['sidecarOverride']>}
      />
    );
    expectPhases('armed', 'armed');
    expect(latestPresentation('Roller').events).toEqual([
      expect.objectContaining({
        presentationId: 'concept:witness:player:31:result:10',
        roller: { entityId: 'concept:player', role: 'player' },
      }),
    ]);
    expect(tokenFor('Roller')).not.toBe(newRollerToken);
    expect(tokenFor('Spectator')).not.toBe(newSpectatorToken);
  });

  it('gives Monster consumers no authority and one StrictMode-safe host release after 250ms', () => {
    vi.useFakeTimers();
    render(
      <StrictMode>
        <DiceTray3DConceptPanel
          token={41}
          reducedMotion={false}
          sceneOverride={{} as NonNullable<AttackDie3DProps['sceneOverride']>}
          sidecarOverride={
            {} as NonNullable<AttackDie3DProps['sidecarOverride']>
          }
        />
      </StrictMode>
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Monster' }));

    expectPhases('armed', 'armed');
    expect(latestPresentation('Roller').onReleaseRequest).toBeUndefined();
    expect(latestPresentation('Spectator').onReleaseRequest).toBeUndefined();
    expect(latestPresentation('Roller').events).toBe(
      latestPresentation('Spectator').events
    );
    expect(latestPresentation('Roller').events).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Roll d20' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Grab d20' })).toBeNull();

    act(() => vi.advanceTimersByTime(MONSTER_FIXTURE_RELEASE_DELAY_MS - 1));
    expectPhases('armed', 'armed');
    expect(latestPresentation('Roller').events).toHaveLength(1);

    act(() => vi.advanceTimersByTime(1));
    expectPhases('rolling', 'rolling');
    const delivered = latestPresentation('Roller').events;
    expect(delivered).toBe(latestPresentation('Spectator').events);
    expect(delivered.map((event) => event.type)).toEqual([
      'dice-presentation-requested',
      'dice-presentation-released',
    ]);
    expect(
      delivered.filter((event) => event.type === 'dice-presentation-released')
    ).toHaveLength(1);

    act(() => vi.advanceTimersByTime(MONSTER_FIXTURE_RELEASE_DELAY_MS * 4));
    expect(latestPresentation('Roller').events).toBe(delivered);
    expect(latestPresentation('Roller').events).toHaveLength(2);
  });
});
