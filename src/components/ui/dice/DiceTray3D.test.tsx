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
vi.mock('./AttackDie3D', () => ({
  AttackDie3D: (props: AttackDie3DProps) => {
    attackDieProps.push(props);
    return <div data-testid="attack-die-3d-mock">{props.fallback}</div>;
  },
}));

const die: DiceTray3DItem = {
  kind: 'd20',
  presetId: 'lightning',
  authoritativeResult: 10,
};
const release: DicePresentationRelease = Object.freeze({
  schemaVersion: 1,
  presentationId: 'attack:7',
  presetId: 'lightning',
  variation: 7,
  vector: Object.freeze([0, 0] as const),
  shake: 0,
});
const sceneOverride = {} as AttackDie3DProps['sceneOverride'];
const sidecarOverride = {} as AttackDieRuntimeSidecar;
const calibrationPose = [0.1, 0.2, 0.3, 0.4] as const;

let capturedPointers: WeakMap<HTMLElement, Set<number>>;
let setPointerCapture: ReturnType<typeof vi.fn>;
let hasPointerCapture: ReturnType<typeof vi.fn>;
let releasePointerCapture: ReturnType<typeof vi.fn>;
let emitLostCaptureOnRelease: boolean;

beforeEach(() => {
  capturedPointers = new WeakMap();
  emitLostCaptureOnRelease = false;
  setPointerCapture = vi.fn(function (this: HTMLElement, pointerId: number) {
    const captured = capturedPointers.get(this) ?? new Set<number>();
    captured.add(pointerId);
    capturedPointers.set(this, captured);
  });
  hasPointerCapture = vi.fn(function (this: HTMLElement, pointerId: number) {
    return capturedPointers.get(this)?.has(pointerId) ?? false;
  });
  releasePointerCapture = vi.fn(function (
    this: HTMLElement,
    pointerId: number
  ) {
    capturedPointers.get(this)?.delete(pointerId);
    if (emitLostCaptureOnRelease)
      fireEvent.lostPointerCapture(this, { pointerId });
  });
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: { configurable: true, value: setPointerCapture },
    hasPointerCapture: { configurable: true, value: hasPointerCapture },
    releasePointerCapture: { configurable: true, value: releasePointerCapture },
  });
});

afterEach(() => {
  delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).hasPointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).releasePointerCapture;
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

  it('arms a player roller with separate Roll and Grab controls without revealing the result', () => {
    const onReleaseRequest = vi.fn();
    renderTray([die], { phase: 'armed', onReleaseRequest });

    expect(
      screen
        .getByRole('button', { name: 'Roll d20' })
        .closest('.dice-tray-3d-shell--compact .dice-tray-3d-shell__controls')
    ).toBeTruthy();
    const grab = screen.getByRole('button', { name: 'Grab d20' });
    expect(grab.closest('.dice-tray-3d-renderer')).toBeTruthy();
    fireEvent.pointerDown(grab, { pointerId: 17, clientX: 10, clientY: 20 });
    expect(setPointerCapture).toHaveBeenCalledWith(17);
    expect(grab.getAttribute('data-grabbed')).toBe('true');
    expect(attackDieProps[0]).toMatchObject({ result: 10, phase: 'ready' });
    expect(screen.getByTestId('dice-face').textContent).toBe('?');
    expect(onReleaseRequest).not.toHaveBeenCalled();
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
    expect(onReleaseRequest).toHaveBeenCalledWith();
    expect(attackDieProps.at(-1)?.phase).toBe('ready');
    view.rerender(
      <DiceTray3D
        label="Player attack tray"
        presentationId="attack:7"
        rendererGeneration={-7}
        rollerRole="player"
        witnessRole="roller"
        phase="rolling"
        dice={[die]}
        release={release}
        onReleaseRequest={onReleaseRequest}
      />
    );
    expect(attackDieProps.at(-1)).toMatchObject({
      result: 10,
      presentationToken: -7,
      phase: 'rolling',
      decorativeRelease: release,
    });
    expect(screen.queryByRole('button', { name: 'Grab d20' })).toBeNull();
    expect(onReleaseRequest).toHaveBeenCalledTimes(1);
  });

  it('keeps moves local, accumulates path distance, and commits one plain outside release', () => {
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
    });

    fireEvent.pointerUp(grab, { pointerId: 4, clientX: 90, clientY: 60 });

    expect(onReleaseRequest).toHaveBeenCalledTimes(1);
    expect(onReleaseRequest).toHaveBeenCalledWith({
      origin: [10, 20],
      current: [90, 60],
      distance: 100,
    });
    expect(onReleaseRequest.mock.calls[0][0]).toEqual({
      origin: [10, 20],
      current: [90, 60],
      distance: 100,
    });
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
    fireEvent.click(grab);
    fireEvent.pointerUp(grab, { pointerId: 5, clientX: 30, clientY: 20 });

    expect(onReleaseRequest).toHaveBeenCalledTimes(1);
    expect(onReleaseRequest).toHaveBeenCalledWith({
      origin: [0, 0],
      current: [20, 10],
      distance: Math.hypot(20, 10),
    });
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
    fireEvent.pointerCancel(grab, { pointerId: 2 });
    fireEvent.lostPointerCapture(grab, { pointerId: 2 });

    expect(grab.getAttribute('data-grabbed')).toBe('true');
    expect(onReleaseRequest).not.toHaveBeenCalled();
    expect(setPointerCapture).toHaveBeenCalledTimes(1);

    fireEvent.pointerUp(grab, { pointerId: 1, clientX: 30, clientY: 40 });
    expect(onReleaseRequest).toHaveBeenCalledWith({
      origin: [10, 20],
      current: [30, 40],
      distance: Math.hypot(20, 20),
    });
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

      expect(grab.getAttribute('data-grabbed')).toBe('false');
      expect(onReleaseRequest).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Roll d20' })).toBeTruthy();
    }
  );

  it('fails pointer capture into a deterministic armed and not-grabbed state', () => {
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

    expect(grab.getAttribute('data-grabbed')).toBe('false');
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

  it('preserves explicit grab release in reduced motion and plain Grab activation', () => {
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
    expect(pointerRequest).toHaveBeenCalledWith({
      origin: [10, 20],
      current: [30, 40],
      distance: Math.hypot(20, 20),
    });

    const clickRequest = vi.fn();
    renderTray([die], { phase: 'armed', onReleaseRequest: clickRequest });
    grab = screen.getAllByRole('button', { name: 'Grab d20' }).at(-1)!;
    fireEvent.click(grab);
    expect(clickRequest).toHaveBeenCalledTimes(1);
    expect(clickRequest).toHaveBeenCalledWith();
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
    expect(attackDieProps.at(-1)?.decorativeRelease).toBeUndefined();

    renderTray([die], {
      phase: 'rolling',
      release: { ...release, presetId: 'newer-safe-preset' },
    });
    expect(attackDieProps.at(-1)?.decorativeRelease).toBeUndefined();
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

  it('renders the truthful settled SVG result for an unknown safe preset', () => {
    renderTray([{ ...die, presetId: 'newer-safe-preset' }]);

    expect(screen.getByTestId('dice-face').textContent).toBe('10');
    expect(attackDieProps).toHaveLength(0);
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
        rollerRole="player"
        witnessRole="roller"
        phase="settled"
        dice={[die]}
      />
    );
    expect(screen.getByText(/Unable to display this dice tray/)).toBeTruthy();
  });
});
