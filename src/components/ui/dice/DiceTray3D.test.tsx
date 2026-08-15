import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttackDie3DProps } from './AttackDie3D';
import type { AttackDieRuntimeSidecar } from './attackDieContract';
import type { DicePresentationRelease } from './dicePresentationRelease';
import {
  DiceTray3D,
  type DiceTray3DItem,
  type DiceTray3DProps,
} from './DiceTray3D';

const attackDieProps: AttackDie3DProps[] = [];
const controllerMocks = vi.hoisted(() => ({ creates: vi.fn() }));
vi.mock('./AttackDie3D', () => ({
  AttackDie3D: (props: AttackDie3DProps) => {
    attackDieProps.push(props);
    return <div data-testid="attack-die-3d-mock">{props.fallback}</div>;
  },
}));
vi.mock('./rollGroupGestureController', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./rollGroupGestureController')>();
  return {
    ...actual,
    createRollGroupGestureController: () => {
      controllerMocks.creates();
      return actual.createRollGroupGestureController();
    },
  };
});

const die: DiceTray3DItem = {
  kind: 'd20',
  presetId: 'lightning',
  authoritativeResult: 10,
};
const originalDie: DiceTray3DItem = {
  kind: 'd20',
  presetId: 'dice.original.carved.d20',
  authoritativeResult: 10,
};
const release: DicePresentationRelease = Object.freeze({
  schemaVersion: 2,
  presentationId: 'attack:7',
  presetId: 'lightning',
  throwProfile: Object.freeze({
    schemaVersion: 1,
    releasePosition: Object.freeze([0.5, 0.5] as const),
    releaseDirection: Object.freeze([0, 0] as const),
    releaseSpeed: 0,
    shakeEnergy: 0,
    spinBias: 0,
    motionSeed: 0x755,
  }),
});
const sceneOverride = {} as AttackDie3DProps['sceneOverride'];
const sidecarOverride = {} as AttackDieRuntimeSidecar;
const calibrationPose = [0.1, 0.2, 0.3, 0.4] as const;

let capturedPointers: WeakMap<HTMLElement, Set<number>>;
let setPointerCapture: ReturnType<typeof vi.fn>;
let hasPointerCapture: ReturnType<typeof vi.fn>;
let releasePointerCapture: ReturnType<typeof vi.fn>;
let emitLostCaptureOnRelease: boolean;

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
  if (emitLostCaptureOnRelease)
    fireEvent.lostPointerCapture(this, { pointerId });
}

beforeEach(() => {
  controllerMocks.creates.mockClear();
  capturedPointers = new WeakMap();
  emitLostCaptureOnRelease = false;
  setPointerCapture = vi.fn(capturePointer);
  hasPointerCapture = vi.fn(pointerIsCaptured);
  releasePointerCapture = vi.fn(releaseCapturedPointer);
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: { configurable: true, value: setPointerCapture },
    hasPointerCapture: { configurable: true, value: hasPointerCapture },
    releasePointerCapture: { configurable: true, value: releasePointerCapture },
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
  delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).hasPointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).releasePointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).getBoundingClientRect;
});

function renderTray(
  dice: readonly DiceTray3DItem[] = [die],
  overrides: Partial<DiceTray3DProps> = {}
) {
  attackDieProps.length = 0;
  return render(
    <DiceTray3D
      label="Player attack tray"
      presentationId="attack:7"
      rendererGeneration={-7}
      motionSeed={0x755}
      rollerRole="player"
      witnessRole="roller"
      phase="settled"
      dice={dice}
      reducedMotion
      sceneOverride={sceneOverride}
      sidecarOverride={sidecarOverride}
      calibrationPose={calibrationPose}
      {...overrides}
    />
  );
}

describe('DiceTray3D', () => {
  it('renders exactly one allowlisted d20 and passes authoritative inputs unchanged', () => {
    renderTray();

    expect(screen.getByTestId('dice-tray-3d-renderer')).toBeTruthy();
    expect(screen.getByTestId('attack-die-3d-mock')).toBeTruthy();
    expect(attackDieProps).toHaveLength(1);
    expect(attackDieProps[0]).toMatchObject({
      result: 10,
      presentationToken: -7,
      phase: 'settled',
      reducedMotion: true,
      materialMode: 'magical',
      sceneOverride,
      sidecarOverride,
      calibrationPose,
    });
    expect(screen.getByTestId('dice-face').textContent).toBe('10');
  });

  it('allowlists Original carved d20 through one shared provider identity', () => {
    const firstTelemetry = vi.fn();
    const secondTelemetry = vi.fn();
    const first = renderTray([originalDie], {
      rendererGeneration: -101,
      onTelemetry: firstTelemetry,
      sceneOverride: undefined,
      sidecarOverride: undefined,
      calibrationPose: undefined,
    });
    const firstProps = attackDieProps.at(-1)! as AttackDie3DProps & {
      provider?: unknown;
    };
    expect(firstProps).toMatchObject({
      result: 10,
      presentationToken: -101,
      materialMode: 'raw',
      provider: {
        kind: 'dice-runtime-preset',
        presetId: 'dice.original.carved.d20',
      },
      sceneOverride: undefined,
      sidecarOverride: undefined,
      calibrationPose: undefined,
    });

    first.unmount();
    renderTray([originalDie], {
      rendererGeneration: -102,
      witnessRole: 'spectator',
      onTelemetry: secondTelemetry,
      sceneOverride: undefined,
      sidecarOverride: undefined,
      calibrationPose: undefined,
    });
    const secondProps = attackDieProps.at(-1)! as AttackDie3DProps & {
      provider?: unknown;
    };
    expect(secondProps.presentationToken).not.toBe(
      firstProps.presentationToken
    );
    expect(secondProps.provider).toBe(firstProps.provider);
    expect(firstProps.onTelemetry).not.toBe(secondProps.onTelemetry);
    firstProps.onTelemetry?.({
      presentationToken: -101,
      requestedResult: 10,
      renderer: '3d',
      state: 'held',
      exactTargetHeld: false,
    });
    secondProps.onTelemetry?.({
      presentationToken: -102,
      requestedResult: 10,
      renderer: '3d',
      state: 'held',
      exactTargetHeld: false,
    });
    expect(firstTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({ presentationToken: -101 })
    );
    expect(secondTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({ presentationToken: -102 })
    );
  });

  it('forwards optional diagnostics and development-only renderer failure exercises', () => {
    const onRendererInfo = vi.fn();
    renderTray([originalDie], {
      sceneOverride: undefined,
      sidecarOverride: undefined,
      calibrationPose: undefined,
      forceFailure: 'unmapped',
      onRendererInfo,
    });

    expect(attackDieProps.at(-1)).toMatchObject({
      forceFailure: 'unmapped',
      onRendererInfo,
    });
  });

  it('keeps historical Lightning only for explicit development injection', () => {
    renderTray([die], {
      sceneOverride: undefined,
      sidecarOverride: undefined,
      calibrationPose: undefined,
    });

    expect(attackDieProps).toHaveLength(0);
    expect(screen.getByTestId('dice-face').textContent).toBe('10');
  });

  it('uses a die-sized hit target and lazily creates held state only after an eligible begin', () => {
    const onReleaseRequest = vi.fn();
    renderTray([die], { phase: 'armed', onReleaseRequest });

    expect(
      screen
        .getByRole('button', { name: 'Roll d20' })
        .closest('.dice-tray-3d-shell--compact .dice-tray-3d-shell__controls')
    ).toBeTruthy();
    const renderer = screen.getByTestId('dice-tray-3d-renderer');
    const grab = screen.getByRole('button', { name: 'Grab d20' });
    expect(grab.closest('.dice-tray-3d-renderer')).toBe(renderer);
    expect(grab.getBoundingClientRect().width).toBeLessThan(
      renderer.getBoundingClientRect().width
    );
    expect(grab.getBoundingClientRect().height).toBeLessThan(
      renderer.getBoundingClientRect().height
    );
    expect(controllerMocks.creates).not.toHaveBeenCalled();

    fireEvent.pointerDown(grab, {
      pointerId: 16,
      pointerType: 'mouse',
      clientX: 150,
      clientY: 50,
    });
    expect(setPointerCapture).not.toHaveBeenCalled();
    expect(controllerMocks.creates).toHaveBeenCalledTimes(1);
    expect(attackDieProps.at(-1)?.heldRollGroup).toBeUndefined();

    fireEvent.pointerDown(grab, {
      pointerId: 17,
      pointerType: 'mouse',
      clientX: 10,
      clientY: 20,
    });
    expect(setPointerCapture).toHaveBeenCalledWith(17);
    expect(grab.getAttribute('data-grabbed')).toBe('true');
    expect(attackDieProps.at(-1)).toMatchObject({
      result: 10,
      phase: 'ready',
      heldRollGroup: {
        normalizedPosition: [10 / 240, 20 / 220],
        normalizedTilt: [0, 0],
        shakeEnergy: 0,
        wobblePhase: 0,
      },
    });
    expect(screen.getByTestId('dice-face').textContent).toBe('?');
    expect(onReleaseRequest).not.toHaveBeenCalled();
  });

  it('uses 14px mouse padding and 24px touch padding at the snapshotted hit bounds', () => {
    const mouseRequest = vi.fn();
    const mouse = renderTray([die], {
      phase: 'armed',
      onReleaseRequest: mouseRequest,
    });
    let grab = screen.getByRole('button', { name: 'Grab d20' });
    fireEvent.pointerDown(grab, {
      pointerId: 18,
      pointerType: 'mouse',
      clientX: -20,
      clientY: 50,
    });
    expect(setPointerCapture).not.toHaveBeenCalled();
    mouse.unmount();

    renderTray([die], { phase: 'armed', onReleaseRequest: vi.fn() });
    grab = screen.getByRole('button', { name: 'Grab d20' });
    fireEvent.pointerDown(grab, {
      pointerId: 19,
      pointerType: 'touch',
      clientX: -20,
      clientY: 50,
    });
    expect(setPointerCapture).toHaveBeenCalledWith(19);
    expect(grab.getAttribute('data-grabbed')).toBe('true');
  });

  it('hides Roll without a host callback and preserves authority when one is installed later', () => {
    const view = renderTray([die], { phase: 'armed' });

    expect(screen.queryByRole('button', { name: 'Roll d20' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Grab d20' })).toBeNull();

    const onReleaseRequest = vi.fn();
    view.rerender(
      <DiceTray3D
        label="Player attack tray"
        presentationId="attack:7"
        rendererGeneration={-7}
        motionSeed={0x755}
        rollerRole="player"
        witnessRole="roller"
        phase="armed"
        dice={[die]}
        onReleaseRequest={onReleaseRequest}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));

    expect(onReleaseRequest).toHaveBeenCalledTimes(1);
  });

  it('requests release once and does not synthesize delivery or settlement', () => {
    const onReleaseRequest = vi.fn();
    const view = renderTray([die], { phase: 'armed', onReleaseRequest });

    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));

    expect(onReleaseRequest).toHaveBeenCalledTimes(1);
    expect(onReleaseRequest).toHaveBeenCalledWith(undefined);
    expect(attackDieProps.at(-1)?.phase).toBe('ready');
    view.rerender(
      <DiceTray3D
        label="Player attack tray"
        presentationId="attack:7"
        rendererGeneration={-7}
        motionSeed={0x755}
        rollerRole="player"
        witnessRole="roller"
        phase="rolling"
        dice={[die]}
        release={release}
        onReleaseRequest={onReleaseRequest}
        sceneOverride={sceneOverride}
        sidecarOverride={sidecarOverride}
        calibrationPose={calibrationPose}
      />
    );
    expect(attackDieProps.at(-1)).toMatchObject({
      result: 10,
      presentationToken: -7,
      phase: 'rolling',
      throwProfile: release.throwProfile,
    });
    expect(screen.queryByRole('button', { name: 'Grab d20' })).toBeNull();
    expect(onReleaseRequest).toHaveBeenCalledTimes(1);
  });

  it('passes held motion to the actual die, keeps events absent during moves, and commits one frozen profile', () => {
    const onReleaseRequest = vi.fn();
    renderTray([die], {
      phase: 'armed',
      reducedMotion: false,
      onReleaseRequest,
    });
    const renderer = screen.getByTestId('dice-tray-3d-renderer');
    const grab = screen.getByRole('button', { name: 'Grab d20' });
    const dieNode = screen.getByTestId('attack-die-3d-mock');
    const initialProps = attackDieProps.at(-1)!;

    fireEvent.pointerDown(grab, { pointerId: 4, clientX: 10, clientY: 20 });
    fireEvent.pointerMove(grab, { pointerId: 4, clientX: 40, clientY: 60 });

    expect(renderer.getAttribute('data-grabbed')).toBe('true');
    expect(grab.getAttribute('data-grabbed')).toBe('true');
    expect(onReleaseRequest).not.toHaveBeenCalled();
    expect(screen.getByTestId('attack-die-3d-mock')).toBe(dieNode);
    expect(attackDieProps.at(-1)).toMatchObject({
      result: 10,
      presentationToken: initialProps.presentationToken,
      onTelemetry: initialProps.onTelemetry,
      heldRollGroup: {
        normalizedPosition: [40 / 240, 60 / 220],
        normalizedTilt: [expect.any(Number), expect.any(Number)],
        shakeEnergy: expect.any(Number),
        wobblePhase: expect.any(Number),
      },
    });

    fireEvent.pointerUp(grab, { pointerId: 4, clientX: 90, clientY: 60 });

    expect(onReleaseRequest).toHaveBeenCalledTimes(1);
    const profile = onReleaseRequest.mock.calls[0][0];
    expect(profile).toMatchObject({
      schemaVersion: 1,
      releasePosition: [90 / 240, 60 / 220],
      releaseDirection: [expect.any(Number), expect.any(Number)],
      releaseSpeed: expect.any(Number),
      shakeEnergy: expect.any(Number),
      spinBias: expect.any(Number),
      motionSeed: 0x755,
    });
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.releasePosition)).toBe(true);
    expect(Object.isFrozen(profile.releaseDirection)).toBe(true);
    expect(attackDieProps.at(-1)?.heldRollGroup).toBeUndefined();
    expect(renderer.getAttribute('data-grabbed')).toBe('false');
    expect(releasePointerCapture).toHaveBeenCalledWith(4);
    expect(attackDieProps.at(-1)?.phase).toBe('ready');
  });

  it('commits pointerup before capture loss and ignores compatibility click and duplicate up', () => {
    const onReleaseRequest = vi.fn();
    renderTray([die], { phase: 'armed', onReleaseRequest });
    const grab = screen.getByRole('button', { name: 'Grab d20' });
    emitLostCaptureOnRelease = true;

    fireEvent.pointerDown(grab, { pointerId: 5, clientX: 0, clientY: 0 });
    fireEvent.pointerUp(grab, { pointerId: 5, clientX: 20, clientY: 10 });
    fireEvent.click(grab, { detail: 1 });
    fireEvent.pointerUp(grab, { pointerId: 5, clientX: 30, clientY: 20 });

    expect(onReleaseRequest).toHaveBeenCalledTimes(1);
    expect(onReleaseRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 1,
        releasePosition: [20 / 240, 10 / 220],
        motionSeed: 0x755,
      })
    );
    expect(grab.getAttribute('data-grabbed')).toBe('false');
  });

  it('ignores unrelated pointer ids without mutating or cancelling the active gesture', () => {
    const onReleaseRequest = vi.fn();
    renderTray([die], { phase: 'armed', onReleaseRequest });
    const grab = screen.getByRole('button', { name: 'Grab d20' });

    fireEvent.pointerDown(grab, { pointerId: 1, clientX: 10, clientY: 20 });
    fireEvent.pointerDown(grab, { pointerId: 2, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(grab, { pointerId: 2, clientX: 200, clientY: 200 });
    fireEvent.pointerUp(grab, { pointerId: 2, clientX: 300, clientY: 300 });
    fireEvent.click(grab, { detail: 1 });
    fireEvent.pointerCancel(grab, { pointerId: 2 });
    fireEvent.lostPointerCapture(grab, { pointerId: 2 });

    expect(grab.getAttribute('data-grabbed')).toBe('true');
    expect(onReleaseRequest).not.toHaveBeenCalled();
    expect(setPointerCapture).toHaveBeenCalledTimes(1);

    fireEvent.pointerUp(grab, { pointerId: 1, clientX: 30, clientY: 40 });
    expect(onReleaseRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 1,
        releasePosition: [30 / 240, 40 / 220],
        motionSeed: 0x755,
      })
    );
  });

  it.each(['cancel', 'lost capture'] as const)(
    'returns to armed without release after matching %s',
    (ending) => {
      const onReleaseRequest = vi.fn();
      renderTray([die], { phase: 'armed', onReleaseRequest });
      const grab = screen.getByRole('button', { name: 'Grab d20' });

      fireEvent.pointerDown(grab, {
        pointerId: 6,
        clientX: 10,
        clientY: 20,
      });
      fireEvent.pointerMove(grab, {
        pointerId: 6,
        clientX: 40,
        clientY: 50,
      });
      if (ending === 'cancel') fireEvent.pointerCancel(grab, { pointerId: 6 });
      else fireEvent.lostPointerCapture(grab, { pointerId: 6 });
      fireEvent.click(grab, { detail: 1 });

      expect(grab.getAttribute('data-grabbed')).toBe('false');
      expect(attackDieProps.at(-1)?.heldRollGroup).toBeUndefined();
      expect(onReleaseRequest).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Roll d20' })).toBeTruthy();
    }
  );

  it('rejects compatibility click after pointer capture throws', () => {
    const onReleaseRequest = vi.fn();
    setPointerCapture.mockImplementationOnce(() => {
      throw Error('capture unavailable');
    });
    renderTray([die], { phase: 'armed', onReleaseRequest });
    const grab = screen.getByRole('button', { name: 'Grab d20' });

    expect(() =>
      fireEvent.pointerDown(grab, {
        pointerId: 9,
        clientX: 10,
        clientY: 20,
      })
    ).not.toThrow();
    fireEvent.pointerUp(grab, { pointerId: 9, clientX: 90, clientY: 90 });
    fireEvent.click(grab, { detail: 1 });

    expect(grab.getAttribute('data-grabbed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Roll d20' })).toBeTruthy();
    expect(onReleaseRequest).not.toHaveBeenCalled();
  });

  it('attempts release when capture inspection throws after acquisition', () => {
    const onReleaseRequest = vi.fn();
    hasPointerCapture.mockImplementation(() => {
      throw Error('capture inspection unavailable');
    });
    renderTray([die], { phase: 'armed', onReleaseRequest });
    const grab = screen.getByRole('button', { name: 'Grab d20' });

    expect(() =>
      fireEvent.pointerDown(grab, {
        pointerId: 22,
        clientX: 10,
        clientY: 20,
      })
    ).not.toThrow();

    expect(setPointerCapture).toHaveBeenCalledWith(22);
    expect(releasePointerCapture).toHaveBeenCalledWith(22);
    expect(grab.getAttribute('data-grabbed')).toBe('false');
    fireEvent.pointerUp(grab, { pointerId: 22, clientX: 30, clientY: 40 });
    fireEvent.click(grab, { detail: 1 });
    expect(onReleaseRequest).not.toHaveBeenCalled();
  });

  it('clears a failed uncertain capture so a later pointer can begin', () => {
    const onReleaseRequest = vi.fn();
    hasPointerCapture.mockImplementation(() => {
      throw Error('capture inspection unavailable');
    });
    releasePointerCapture.mockImplementation(() => {
      throw Error('capture release unavailable');
    });
    renderTray([die], { phase: 'armed', onReleaseRequest });
    const grab = screen.getByRole('button', { name: 'Grab d20' });

    expect(() =>
      fireEvent.pointerDown(grab, {
        pointerId: 23,
        clientX: 10,
        clientY: 20,
      })
    ).not.toThrow();
    fireEvent.pointerDown(grab, {
      pointerId: 24,
      clientX: 30,
      clientY: 40,
    });

    expect(setPointerCapture).toHaveBeenCalledTimes(2);
    expect(grab.getAttribute('data-grabbed')).toBe('false');
    expect(onReleaseRequest).not.toHaveBeenCalled();

    expect(() =>
      fireEvent.pointerUp(grab, {
        pointerId: 23,
        clientX: 20,
        clientY: 30,
      })
    ).not.toThrow();
    fireEvent.click(grab, { detail: 1 });
    hasPointerCapture.mockImplementation(pointerIsCaptured);
    releasePointerCapture.mockImplementation(releaseCapturedPointer);
    fireEvent.pointerDown(grab, {
      pointerId: 24,
      clientX: 30,
      clientY: 40,
    });

    expect(setPointerCapture).toHaveBeenCalledTimes(3);
    expect(setPointerCapture).toHaveBeenLastCalledWith(24);
    expect(grab.getAttribute('data-grabbed')).toBe('true');
    expect(onReleaseRequest).not.toHaveBeenCalled();
  });

  it('cleans held capture on unmount without emitting', () => {
    const onReleaseRequest = vi.fn();
    const view = renderTray([die], { phase: 'armed', onReleaseRequest });
    const grab = screen.getByRole('button', { name: 'Grab d20' });
    fireEvent.pointerDown(grab, { pointerId: 10, clientX: 10, clientY: 20 });

    view.unmount();

    expect(releasePointerCapture).toHaveBeenCalledTimes(1);
    expect(releasePointerCapture).toHaveBeenCalledWith(10);
    expect(onReleaseRequest).not.toHaveBeenCalled();
  });

  it('cleans held capture and local state on provider failure without emitting', () => {
    const onReleaseRequest = vi.fn();
    const onTelemetry = vi.fn();
    renderTray([originalDie], {
      phase: 'armed',
      onReleaseRequest,
      onTelemetry,
      sceneOverride: undefined,
      sidecarOverride: undefined,
      calibrationPose: undefined,
    });
    const grab = screen.getByRole('button', { name: 'Grab d20' });
    fireEvent.pointerDown(grab, { pointerId: 15, clientX: 10, clientY: 20 });
    expect(attackDieProps.at(-1)?.heldRollGroup).toBeDefined();

    act(() =>
      attackDieProps.at(-1)?.onTelemetry?.({
        presentationToken: -7,
        requestedResult: 10,
        renderer: 'svg',
        state: 'failed',
        exactTargetHeld: false,
        failureCode: 'provider-load',
      })
    );

    expect(releasePointerCapture).toHaveBeenCalledWith(15);
    expect(attackDieProps.at(-1)?.heldRollGroup).toBeUndefined();
    expect(onReleaseRequest).not.toHaveBeenCalled();
    expect(onTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'failed' })
    );
  });

  it('cleans held capture on authority loss without emitting', () => {
    const onReleaseRequest = vi.fn();
    const view = renderTray([die], { phase: 'armed', onReleaseRequest });
    const grab = screen.getByRole('button', { name: 'Grab d20' });
    fireEvent.pointerDown(grab, { pointerId: 13, clientX: 10, clientY: 20 });

    view.rerender(
      <DiceTray3D
        label="Player attack tray"
        presentationId="attack:7"
        rendererGeneration={-7}
        motionSeed={0x755}
        rollerRole="player"
        witnessRole="spectator"
        phase="armed"
        dice={[die]}
        onReleaseRequest={onReleaseRequest}
      />
    );

    expect(releasePointerCapture).toHaveBeenCalledTimes(1);
    expect(releasePointerCapture).toHaveBeenCalledWith(13);
    expect(onReleaseRequest).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Grab d20' })).toBeNull();
    expect(
      screen.getByTestId('dice-tray-3d-renderer').getAttribute('data-grabbed')
    ).toBe('false');
  });

  it('keeps held-capture cleanup idempotent under StrictMode', () => {
    const onReleaseRequest = vi.fn();
    const view = render(
      <StrictMode>
        <DiceTray3D
          label="Player attack tray"
          presentationId="attack:7"
          rendererGeneration={-7}
          motionSeed={0x755}
          rollerRole="player"
          witnessRole="roller"
          phase="armed"
          dice={[die]}
          onReleaseRequest={onReleaseRequest}
        />
      </StrictMode>
    );
    const grab = screen.getByRole('button', { name: 'Grab d20' });
    fireEvent.pointerDown(grab, { pointerId: 14, clientX: 10, clientY: 20 });

    view.unmount();

    expect(releasePointerCapture).toHaveBeenCalledTimes(1);
    expect(releasePointerCapture).toHaveBeenCalledWith(14);
    expect(onReleaseRequest).not.toHaveBeenCalled();
  });

  it('cleans held capture on request identity change without emitting', () => {
    const onReleaseRequest = vi.fn();
    const view = renderTray([die], { phase: 'armed', onReleaseRequest });
    const grab = screen.getByRole('button', { name: 'Grab d20' });
    fireEvent.pointerDown(grab, { pointerId: 11, clientX: 10, clientY: 20 });

    view.rerender(
      <DiceTray3D
        label="Player attack tray"
        presentationId="attack:8"
        rendererGeneration={-8}
        motionSeed={0x755}
        rollerRole="player"
        witnessRole="roller"
        phase="armed"
        dice={[die]}
        onReleaseRequest={onReleaseRequest}
      />
    );

    expect(releasePointerCapture).toHaveBeenCalledTimes(1);
    expect(releasePointerCapture).toHaveBeenCalledWith(11);
    expect(onReleaseRequest).not.toHaveBeenCalled();
    expect(
      screen
        .getByRole('button', { name: 'Grab d20' })
        .getAttribute('data-grabbed')
    ).toBe('false');
  });

  it('resets held state and capture on phase interruption without releasing', () => {
    const onReleaseRequest = vi.fn();
    const view = renderTray([originalDie], {
      phase: 'armed',
      onReleaseRequest,
      sceneOverride: undefined,
      sidecarOverride: undefined,
      calibrationPose: undefined,
    });
    const grab = screen.getByRole('button', { name: 'Grab d20' });
    fireEvent.pointerDown(grab, { pointerId: 26, clientX: 10, clientY: 20 });
    expect(attackDieProps.at(-1)?.heldRollGroup).toBeDefined();

    view.rerender(
      <DiceTray3D
        label="Player attack tray"
        presentationId="attack:7"
        rendererGeneration={-7}
        motionSeed={0x755}
        rollerRole="player"
        witnessRole="roller"
        phase="rolling"
        dice={[originalDie]}
        onReleaseRequest={onReleaseRequest}
      />
    );

    expect(releasePointerCapture).toHaveBeenCalledWith(26);
    expect(attackDieProps.at(-1)?.heldRollGroup).toBeUndefined();
    expect(onReleaseRequest).not.toHaveBeenCalled();
  });

  it.each(['unmount', 'identity', 'authority'] as const)(
    'keeps throwing capture cleanup exception-free for %s',
    (cleanup) => {
      const onReleaseRequest = vi.fn();
      const view = renderTray([die], { phase: 'armed', onReleaseRequest });
      const grab = screen.getByRole('button', { name: 'Grab d20' });
      fireEvent.pointerDown(grab, {
        pointerId: 25,
        clientX: 10,
        clientY: 20,
      });
      hasPointerCapture.mockImplementation(() => {
        throw Error('capture inspection unavailable');
      });
      releasePointerCapture.mockImplementation(() => {
        throw Error('capture release unavailable');
      });

      const runCleanup = () => {
        if (cleanup === 'unmount') {
          view.unmount();
          return;
        }
        view.rerender(
          <DiceTray3D
            label="Player attack tray"
            presentationId={cleanup === 'identity' ? 'attack:8' : 'attack:7'}
            rendererGeneration={cleanup === 'identity' ? -8 : -7}
            motionSeed={0x755}
            rollerRole="player"
            witnessRole={cleanup === 'authority' ? 'spectator' : 'roller'}
            phase="armed"
            dice={[die]}
            onReleaseRequest={onReleaseRequest}
          />
        );
      };

      expect(runCleanup).not.toThrow();
      expect(releasePointerCapture).toHaveBeenCalledWith(25);
      expect(onReleaseRequest).not.toHaveBeenCalled();
    }
  );

  it('preserves explicit grab release in reduced motion and detail-zero Grab activation', () => {
    const pointerRequest = vi.fn();
    renderTray([die], {
      phase: 'armed',
      reducedMotion: true,
      onReleaseRequest: pointerRequest,
    });
    let grab = screen.getByRole('button', { name: 'Grab d20' });
    fireEvent.pointerDown(grab, { pointerId: 12, clientX: 10, clientY: 20 });
    fireEvent.pointerUp(grab, { pointerId: 12, clientX: 30, clientY: 40 });
    expect(pointerRequest).toHaveBeenCalledTimes(1);
    expect(pointerRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 1,
        releasePosition: [30 / 240, 40 / 220],
        motionSeed: 0x755,
      })
    );

    const clickRequest = vi.fn();
    renderTray([die], { phase: 'armed', onReleaseRequest: clickRequest });
    grab = screen.getAllByRole('button', { name: 'Grab d20' }).at(-1)!;
    fireEvent.click(grab, { detail: 1 });
    expect(clickRequest).not.toHaveBeenCalled();
    fireEvent.click(grab, { detail: 0 });
    expect(clickRequest).toHaveBeenCalledTimes(1);
    expect(clickRequest).toHaveBeenCalledWith(undefined);
  });

  it('never automatically requests release for a monster roller', () => {
    const onReleaseRequest = vi.fn();
    renderTray([die], {
      phase: 'armed',
      rollerRole: 'monster',
      onReleaseRequest,
    });

    expect(screen.queryByRole('button', { name: 'Roll d20' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Grab d20' })).toBeNull();
    expect(controllerMocks.creates).not.toHaveBeenCalled();
    expect(onReleaseRequest).not.toHaveBeenCalled();
  });

  it.each(['player', 'monster'] as const)(
    'never gives a spectator control or release authority for a %s roll',
    (rollerRole) => {
      const onReleaseRequest = vi.fn();
      renderTray([die], {
        phase: 'armed',
        rollerRole,
        witnessRole: 'spectator',
        onReleaseRequest,
      });

      expect(screen.queryByRole('button', { name: /roll/i })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Grab d20' })).toBeNull();
      expect(controllerMocks.creates).not.toHaveBeenCalled();
      expect(onReleaseRequest).not.toHaveBeenCalled();
    }
  );

  it('passes renderer telemetry through without synthesizing settlement', () => {
    const onTelemetry = vi.fn();
    renderTray([die], { phase: 'rolling', onTelemetry });
    const event = {
      presentationToken: -7,
      requestedResult: 10,
      renderer: '3d' as const,
      state: 'observed' as const,
      observedUpwardResult: 10,
      observedUpDot: 1,
      observedUpMargin: 0.25,
      angularErrorDegrees: 0,
      exactTargetHeld: true,
    };

    attackDieProps[0].onTelemetry?.(event);

    expect(onTelemetry).toHaveBeenCalledTimes(1);
    expect(onTelemetry).toHaveBeenCalledWith(event);
  });

  it('does not pass a release for another presentation or preset to the renderer', () => {
    renderTray([die], {
      phase: 'rolling',
      release: { ...release, presentationId: 'attack:8' },
    });
    expect(attackDieProps.at(-1)?.throwProfile).toBeUndefined();

    renderTray([die], {
      phase: 'rolling',
      release: { ...release, presetId: 'newer-safe-preset' },
    });
    expect(attackDieProps.at(-1)?.throwProfile).toBeUndefined();
  });

  it('renders an unknown safe preset as semantic SVG without invoking the allowlisted renderer', () => {
    vi.useFakeTimers();
    try {
      const unknown = { ...die, presetId: 'newer-safe-preset' };
      const onReleaseRequest = vi.fn();
      const onFallbackPresentationComplete = vi.fn();
      const view = renderTray([unknown], {
        phase: 'armed',
        reducedMotion: false,
        onReleaseRequest,
        onFallbackPresentationComplete,
      });

      expect(attackDieProps).toHaveLength(0);
      expect(screen.getByTestId('dice-face').textContent).toBe('?');
      fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
      expect(onReleaseRequest).toHaveBeenCalledTimes(1);

      view.rerender(
        <DiceTray3D
          label="Player attack tray"
          presentationId="attack:7"
          rendererGeneration={-7}
          motionSeed={0x755}
          rollerRole="player"
          witnessRole="roller"
          phase="rolling"
          dice={[unknown]}
          release={{ ...release, presetId: 'newer-safe-preset' }}
          reducedMotion={false}
          onFallbackPresentationComplete={onFallbackPresentationComplete}
        />
      );
      expect(screen.getByTestId('dice-tray').className).toContain(
        'dice-tray--rolling'
      );
      expect(screen.getByTestId('dice-face').textContent).not.toBe('10');
      act(() => vi.advanceTimersByTime(3000));
      expect(onFallbackPresentationComplete).toHaveBeenCalledTimes(1);
      expect(attackDieProps).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('signals one local fallback completion when an unknown safe preset hydrates settled', () => {
    const unknown = { ...die, presetId: 'newer-safe-preset' };
    const onFallbackPresentationComplete = vi.fn();
    const view = renderTray([unknown], {
      onFallbackPresentationComplete,
    });

    expect(screen.getByTestId('dice-face').textContent).toBe('10');
    expect(attackDieProps).toHaveLength(0);
    expect(onFallbackPresentationComplete).toHaveBeenCalledTimes(1);

    view.rerender(
      <DiceTray3D
        label="Player attack tray"
        presentationId="attack:7"
        rendererGeneration={-7}
        motionSeed={0x755}
        rollerRole="player"
        witnessRole="roller"
        phase="settled"
        dice={[unknown]}
        reducedMotion
        onFallbackPresentationComplete={onFallbackPresentationComplete}
      />
    );
    expect(onFallbackPresentationComplete).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['empty', []],
    ['two items', [die, die]],
    ['non-d20', [{ ...die, kind: 'd12' }]],
    ['unsafe preset', [{ ...die, presetId: 'https://evil.test/die.glb' }]],
    ['result below range', [{ ...die, authoritativeResult: 0 }]],
    ['result above range', [{ ...die, authoritativeResult: 21 }]],
  ])('renders unavailable copy and no renderer for %s input', (_name, dice) => {
    renderTray(dice as DiceTray3DItem[]);

    expect(screen.getByText(/Unable to display this dice tray/)).toBeTruthy();
    expect(screen.queryByTestId('attack-die-3d-mock')).toBeNull();
    expect(attackDieProps).toHaveLength(0);
  });

  it('fails closed for an invalid external presentation id or renderer generation', () => {
    const view = renderTray([die], { presentationId: '../attack' });
    expect(screen.getByText(/Unable to display this dice tray/)).toBeTruthy();

    view.rerender(
      <DiceTray3D
        label="Player attack tray"
        presentationId="attack:7"
        rendererGeneration={Number.NaN}
        motionSeed={0x755}
        rollerRole="player"
        witnessRole="roller"
        phase="settled"
        dice={[die]}
      />
    );
    expect(screen.getByText(/Unable to display this dice tray/)).toBeTruthy();
  });
});
