import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { startTransition, StrictMode, Suspense, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttackDie3DProps, AttackDieTelemetry } from './AttackDie3D';
import { parseDicePresentationEvent } from './dicePresentationEvent';
import type { DicePresentationRelease } from './dicePresentationRelease';
import { DiceTrayPresentation } from './DiceTrayPresentation';

const attackDieProps: AttackDie3DProps[] = [];
vi.mock('./AttackDie3D', () => ({
  AttackDie3D: (props: AttackDie3DProps) => {
    attackDieProps.push(props);
    return <div data-testid="attack-die-3d-mock">{props.fallback}</div>;
  },
}));

let capturedPointers: WeakMap<HTMLElement, Set<number>>;

beforeEach(() => {
  capturedPointers = new WeakMap();
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: {
      configurable: true,
      value(this: HTMLElement, pointerId: number) {
        const captured = capturedPointers.get(this) ?? new Set<number>();
        captured.add(pointerId);
        capturedPointers.set(this, captured);
      },
    },
    hasPointerCapture: {
      configurable: true,
      value(this: HTMLElement, pointerId: number) {
        return capturedPointers.get(this)?.has(pointerId) ?? false;
      },
    },
    releasePointerCapture: {
      configurable: true,
      value(this: HTMLElement, pointerId: number) {
        capturedPointers.get(this)?.delete(pointerId);
      },
    },
  });
});

afterEach(() => {
  delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).hasPointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).releasePointerCapture;
});

function requested(
  presentationId = 'attack:7',
  overrides: Record<string, unknown> = {}
) {
  return {
    schemaVersion: 1 as const,
    type: 'dice-presentation-requested' as const,
    eventId: `request:${presentationId}`,
    presentationId,
    roller: { entityId: 'character:1', role: 'player' as const },
    die: {
      kind: 'd20' as const,
      presetId: 'dice.original.carved.d20',
      authoritativeResult: 10,
    },
    ...overrides,
  };
}

function released(
  presentationId = 'attack:7',
  releaseOverrides: Partial<DicePresentationRelease> = {}
) {
  return {
    schemaVersion: 1 as const,
    type: 'dice-presentation-released' as const,
    eventId: `release:${presentationId}`,
    presentationId,
    release: {
      schemaVersion: 1 as const,
      presentationId,
      presetId: 'dice.original.carved.d20',
      variation: 7,
      vector: [0, 0] as const,
      shake: 0,
      ...releaseOverrides,
    },
  };
}

function lightningRequested(presentationId = 'attack:lightning') {
  return requested(presentationId, {
    die: {
      kind: 'd20',
      presetId: 'lightning',
      authoritativeResult: 10,
    },
  });
}

function originalRequested(presentationId = 'attack:original') {
  return requested(presentationId, {
    die: {
      kind: 'd20',
      presetId: 'dice.original.carved.d20',
      authoritativeResult: 10,
    },
  });
}

function originalReleased(presentationId = 'attack:original') {
  return released(presentationId, {
    presetId: 'dice.original.carved.d20',
  });
}

function renderPresentation(
  events: readonly unknown[],
  overrides: Partial<React.ComponentProps<typeof DiceTrayPresentation>> = {}
) {
  attackDieProps.length = 0;
  return render(
    <DiceTrayPresentation
      label="Player attack dice"
      events={
        events as React.ComponentProps<typeof DiceTrayPresentation>['events']
      }
      witnessRole="roller"
      reducedMotion
      {...overrides}
    />
  );
}

function matchingTelemetry(
  props: AttackDie3DProps,
  overrides: Partial<AttackDieTelemetry> = {}
): AttackDieTelemetry {
  return {
    presentationToken: props.presentationToken,
    requestedResult: props.result,
    renderer: '3d',
    state: 'observed',
    exactTargetHeld: true,
    ...overrides,
  };
}

describe('DiceTrayPresentation', () => {
  it('reports the actual event-array and provider objects observed inside each presentation boundary', async () => {
    const rollerEvents = Object.freeze([originalRequested('attack:boundary')]);
    const spectatorEvents = Object.freeze([...rollerEvents]);
    const rollerDiagnostic = vi.fn();
    const spectatorDiagnostic = vi.fn();

    render(
      <>
        <DiceTrayPresentation
          label="Roller attack dice"
          events={rollerEvents}
          witnessRole="roller"
          onBoundaryDiagnostic={rollerDiagnostic}
        />
        <DiceTrayPresentation
          label="Spectator attack dice"
          events={spectatorEvents}
          witnessRole="spectator"
          onBoundaryDiagnostic={spectatorDiagnostic}
        />
      </>
    );

    await waitFor(() => {
      expect(rollerDiagnostic).toHaveBeenCalled();
      expect(spectatorDiagnostic).toHaveBeenCalled();
    });
    const roller = rollerDiagnostic.mock.calls.at(-1)?.[0];
    const spectator = spectatorDiagnostic.mock.calls.at(-1)?.[0];
    expect(roller.events).toBe(rollerEvents);
    expect(spectator.events).toBe(spectatorEvents);
    expect(roller.events).not.toBe(spectator.events);
    expect(roller.provider).toBe(spectator.provider);
    expect(Object.isFrozen(roller.provider)).toBe(true);
  });

  it('renders no tray without a valid request', () => {
    renderPresentation([]);

    expect(screen.queryByRole('region')).toBeNull();
    expect(attackDieProps).toHaveLength(0);
  });

  it('keeps a player roller armed indefinitely without release delivery', () => {
    vi.useFakeTimers();
    try {
      const onReleaseRequest = vi.fn();
      renderPresentation([requested()], { onReleaseRequest });

      expect(attackDieProps.at(-1)).toMatchObject({
        result: 10,
        phase: 'ready',
      });
      expect(screen.getByTestId('dice-face').textContent).toBe('?');
      expect(screen.getByRole('button', { name: 'Roll d20' })).toBeTruthy();
      act(() => vi.advanceTimersByTime(60 * 60 * 1000));
      expect(onReleaseRequest).not.toHaveBeenCalled();
      expect(attackDieProps.at(-1)?.phase).toBe('ready');
    } finally {
      vi.useRealTimers();
    }
  });

  it('exposes no Roll authority without a host callback and permits it when one is installed later', () => {
    const view = renderPresentation([requested()]);

    expect(screen.queryByRole('button', { name: 'Roll d20' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Grab d20' })).toBeNull();

    const onReleaseRequest = vi.fn();
    view.rerender(
      <DiceTrayPresentation
        label="Player attack dice"
        events={[requested()]}
        witnessRole="roller"
        reducedMotion
        onReleaseRequest={onReleaseRequest}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));

    expect(onReleaseRequest).toHaveBeenCalledTimes(1);
  });

  it('requests one frozen release event without mutating props or leaving armed before delivery', () => {
    const events = Object.freeze([requested()]);
    const before = JSON.stringify(events);
    const onReleaseRequest = vi.fn();
    renderPresentation(events, { onReleaseRequest });

    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));

    expect(onReleaseRequest).toHaveBeenCalledTimes(1);
    const event = onReleaseRequest.mock.calls[0][0];
    expect(parseDicePresentationEvent(event)).toEqual(event);
    expect(event).toMatchObject({
      schemaVersion: 1,
      type: 'dice-presentation-released',
      presentationId: 'attack:7',
      release: {
        presentationId: 'attack:7',
        presetId: 'dice.original.carved.d20',
        vector: [0, 0],
        shake: 0,
      },
    });
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.release)).toBe(true);
    expect(Object.isFrozen(event.release.vector)).toBe(true);
    expect(JSON.stringify(event)).not.toMatch(
      /presentationToken|renderer|result|hit|damage|target|https?:\/\//i
    );
    expect(JSON.stringify(events)).toBe(before);
    expect(attackDieProps.at(-1)?.phase).toBe('ready');
    expect(screen.getByRole('button', { name: 'Roll d20' })).toBeTruthy();
  });

  it('wraps one local gesture as one compact frozen event and forwards it unchanged only after append', () => {
    const events = Object.freeze([requested()]);
    const before = JSON.stringify(events);
    const onReleaseRequest = vi.fn();
    const view = renderPresentation(events, {
      reducedMotion: false,
      onReleaseRequest,
    });
    const grab = screen.getByRole('button', { name: 'Grab d20' });
    const armed = attackDieProps.at(-1)!;

    fireEvent.pointerDown(grab, {
      pointerId: 21,
      clientX: 10,
      clientY: 20,
    });
    fireEvent.pointerMove(grab, {
      pointerId: 21,
      clientX: 90,
      clientY: 20,
    });

    expect(onReleaseRequest).not.toHaveBeenCalled();
    expect(attackDieProps.at(-1)?.phase).toBe('ready');
    expect(attackDieProps.at(-1)?.presentationToken).toBe(
      armed.presentationToken
    );
    expect(attackDieProps.at(-1)?.onTelemetry).toBe(armed.onTelemetry);

    fireEvent.pointerUp(grab, {
      pointerId: 21,
      clientX: 90,
      clientY: -20,
    });

    expect(onReleaseRequest).toHaveBeenCalledTimes(1);
    const event = onReleaseRequest.mock.calls[0][0];
    expect(parseDicePresentationEvent(event)).toEqual(event);
    expect(event.release).toEqual({
      schemaVersion: 1,
      presentationId: 'attack:7',
      presetId: 'dice.original.carved.d20',
      variation: event.release.variation,
      vector: [0.5, -0.25],
      shake: 0.5,
    });
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.release)).toBe(true);
    expect(Object.isFrozen(event.release.vector)).toBe(true);
    expect(JSON.stringify(event)).not.toMatch(
      /"(?:origin|current|distance|pointer|presentationToken|renderer|authoritativeResult|hit|damage|target|transport)"|https?:\/\//i
    );
    expect(JSON.stringify(events)).toBe(before);
    expect(attackDieProps.at(-1)?.phase).toBe('ready');
    expect(screen.getByRole('button', { name: 'Grab d20' })).toBeTruthy();

    view.rerender(
      <DiceTrayPresentation
        label="Player attack dice"
        events={[structuredClone(requested()), structuredClone(event)]}
        witnessRole="roller"
        reducedMotion={false}
        onReleaseRequest={onReleaseRequest}
      />
    );

    expect(attackDieProps.at(-1)).toMatchObject({
      result: 10,
      phase: 'rolling',
      decorativeRelease: event.release,
      presentationToken: armed.presentationToken,
      onTelemetry: armed.onTelemetry,
    });
    expect(attackDieProps.at(-1)?.decorativeRelease).toEqual(event.release);
    expect(onReleaseRequest).toHaveBeenCalledTimes(1);
  });

  it('starts rolling only when an immutable accepted append delivers the requested event', () => {
    const onReleaseRequest = vi.fn();
    const view = renderPresentation([structuredClone(requested())], {
      onReleaseRequest,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
    const event = onReleaseRequest.mock.calls[0][0];

    view.rerender(
      <DiceTrayPresentation
        label="Player attack dice"
        events={[structuredClone(requested()), structuredClone(event)]}
        witnessRole="roller"
        reducedMotion
        onReleaseRequest={onReleaseRequest}
      />
    );

    expect(attackDieProps.at(-1)).toMatchObject({
      result: 10,
      phase: 'rolling',
      decorativeRelease: event.release,
    });
    expect(screen.queryByRole('button', { name: 'Roll d20' })).toBeNull();

    view.rerender(
      <DiceTrayPresentation
        label="Player attack dice"
        events={[requested(), event, released('stale:1')]}
        witnessRole="roller"
        reducedMotion
        onReleaseRequest={onReleaseRequest}
      />
    );
    const stillRolling = attackDieProps.at(-1)!;
    expect(stillRolling.phase).toBe('rolling');

    act(() => stillRolling.onTelemetry?.(matchingTelemetry(stillRolling)));
    expect(attackDieProps.at(-1)?.phase).toBe('settled');
  });

  it('keeps the renderer telemetry sink stable across armed-to-released delivery', () => {
    const view = renderPresentation([requested()]);
    const armedTelemetry = attackDieProps.at(-1)?.onTelemetry;

    view.rerender(
      <DiceTrayPresentation
        label="Player attack dice"
        events={[requested(), released()]}
        witnessRole="roller"
        reducedMotion={false}
      />
    );

    expect(attackDieProps.at(-1)?.phase).toBe('rolling');
    expect(attackDieProps.at(-1)?.onTelemetry).toBe(armedTelemetry);
  });

  it('keeps one token and telemetry sink under StrictMode across same-presentation delivery', () => {
    attackDieProps.length = 0;
    const view = render(
      <StrictMode>
        <DiceTrayPresentation
          label="Player attack dice"
          events={[requested()]}
          witnessRole="roller"
          reducedMotion={false}
          onReleaseRequest={vi.fn()}
        />
      </StrictMode>
    );
    const armed = attackDieProps.at(-1)!;

    expect(
      new Set(attackDieProps.map((props) => props.presentationToken)).size
    ).toBe(1);
    view.rerender(
      <StrictMode>
        <DiceTrayPresentation
          label="Player attack dice"
          events={[requested(), released()]}
          witnessRole="roller"
          reducedMotion={false}
          onReleaseRequest={vi.fn()}
        />
      </StrictMode>
    );
    const rolling = attackDieProps.at(-1)!;

    expect(rolling.presentationToken).toBe(armed.presentationToken);
    expect(rolling.onTelemetry).toBe(armed.onTelemetry);
    expect(rolling.phase).toBe('rolling');
  });

  it('does not let an abandoned presentation update corrupt committed telemetry acceptance', async () => {
    const never = new Promise<never>(() => undefined);
    let deliverCurrent!: () => void;
    let interruptWithNext!: () => void;

    function Blocker({ active }: { active: boolean }) {
      if (active) throw never;
      return null;
    }
    function Harness() {
      const [input, setInput] = useState<{
        events: readonly unknown[];
        blocked: boolean;
      }>({ events: [requested()], blocked: false });
      deliverCurrent = () =>
        setInput({ events: [requested(), released()], blocked: false });
      interruptWithNext = () =>
        startTransition(() =>
          setInput({ events: [requested('attack:8')], blocked: true })
        );
      return (
        <Suspense fallback={<p>Suspended update</p>}>
          <DiceTrayPresentation
            label="Player attack dice"
            events={
              input.events as React.ComponentProps<
                typeof DiceTrayPresentation
              >['events']
            }
            witnessRole="roller"
            reducedMotion
          />
          <Blocker active={input.blocked} />
        </Suspense>
      );
    }

    attackDieProps.length = 0;
    render(<Harness />);
    act(() => deliverCurrent());
    const committed = attackDieProps.at(-1)!;
    expect(committed.phase).toBe('rolling');

    await act(async () => interruptWithNext());
    expect(screen.queryByText('Suspended update')).toBeNull();
    expect(screen.getByRole('region').getAttribute('data-phase')).toBe(
      'rolling'
    );
    expect(attackDieProps.at(-1)?.presentationToken).toBe(
      committed.presentationToken
    );
    expect(attackDieProps.at(-1)?.onTelemetry).toBe(committed.onTelemetry);

    act(() => committed.onTelemetry?.(matchingTelemetry(committed)));

    expect(screen.getByTestId('dice-face').textContent).toBe('10');
    expect(screen.getByRole('region').getAttribute('data-phase')).toBe(
      'settled'
    );
  });

  it('settles only from matching local-generation and result observation', () => {
    const view = renderPresentation([requested()]);
    view.rerender(
      <DiceTrayPresentation
        label="Player attack dice"
        events={[requested(), released()]}
        witnessRole="roller"
        reducedMotion
      />
    );
    const rolling = attackDieProps.at(-1)!;

    act(() =>
      rolling.onTelemetry?.(
        matchingTelemetry(rolling, { presentationToken: 999 })
      )
    );
    expect(attackDieProps.at(-1)?.phase).toBe('rolling');
    act(() =>
      rolling.onTelemetry?.(matchingTelemetry(rolling, { requestedResult: 9 }))
    );
    expect(attackDieProps.at(-1)?.phase).toBe('rolling');
    act(() =>
      rolling.onTelemetry?.(matchingTelemetry(rolling, { state: 'held' }))
    );
    expect(attackDieProps.at(-1)?.phase).toBe('rolling');

    act(() => rolling.onTelemetry?.(matchingTelemetry(rolling)));

    expect(attackDieProps.at(-1)?.phase).toBe('settled');
    expect(screen.getByTestId('dice-face').textContent).toBe('10');
  });

  it('drives settled accessibility truth from matching Original renderer observation, not preset name', () => {
    const request = originalRequested();
    const release = originalReleased();
    const view = renderPresentation([request]);
    const armed = attackDieProps.at(-1)!;

    view.rerender(
      <DiceTrayPresentation
        label="Player attack dice"
        events={[request, release]}
        witnessRole="roller"
        reducedMotion
      />
    );
    const rolling = attackDieProps.at(-1)!;
    expect(rolling.presentationToken).toBe(armed.presentationToken);
    expect(screen.getByRole('status').textContent).toMatch(/rolling/i);

    act(() =>
      rolling.onTelemetry?.(
        matchingTelemetry(rolling, { renderer: 'svg', state: 'observed' })
      )
    );
    expect(attackDieProps.at(-1)?.phase).toBe('rolling');

    act(() => rolling.onTelemetry?.(matchingTelemetry(rolling)));
    expect(attackDieProps.at(-1)?.phase).toBe('settled');
    expect(screen.getByRole('status').textContent).toMatch(
      /result 10 presented · roll settled/i
    );
    expect(screen.getByRole('status').textContent).not.toMatch(/SVG/i);
  });

  it('records matching Original renderer failure as semantic fallback but conceals it until release', () => {
    const request = originalRequested('attack:original-failed');
    const release = originalReleased('attack:original-failed');
    const view = renderPresentation([request]);
    const armed = attackDieProps.at(-1)!;

    act(() =>
      armed.onTelemetry?.(
        matchingTelemetry(armed, {
          renderer: 'svg',
          state: 'failed',
          exactTargetHeld: false,
          failureCode: 'provider-load',
        })
      )
    );
    expect(screen.getByTestId('dice-face').textContent).toBe('?');
    expect(screen.getByRole('status').textContent).not.toContain('10');

    view.rerender(
      <DiceTrayPresentation
        label="Player attack dice"
        events={[request, release]}
        witnessRole="roller"
        reducedMotion
      />
    );
    expect(screen.getByTestId('dice-face').textContent).toBe('10');
    expect(screen.getByRole('status').textContent).toMatch(
      /truthful SVG settled/i
    );
  });

  it('gives roller and spectator one provider identity with independent generations and telemetry sinks', () => {
    const request = originalRequested('attack:shared-witness');
    attackDieProps.length = 0;
    render(
      <>
        <DiceTrayPresentation
          label="Roller dice"
          events={[request]}
          witnessRole="roller"
          reducedMotion
        />
        <DiceTrayPresentation
          label="Spectator dice"
          events={[request]}
          witnessRole="spectator"
          reducedMotion
        />
      </>
    );

    expect(attackDieProps).toHaveLength(2);
    const [roller, spectator] = attackDieProps as Array<
      AttackDie3DProps & { provider?: unknown }
    >;
    expect(roller.provider).toBe(spectator.provider);
    expect(roller.presentationToken).not.toBe(spectator.presentationToken);
    expect(roller.onTelemetry).not.toBe(spectator.onTelemetry);
  });

  it('allocates collision-free renderer generations and resets for a new presentation id', () => {
    const scene = {} as AttackDie3DProps['sceneOverride'];
    const sidecar = {} as NonNullable<AttackDie3DProps['sidecarOverride']>;
    const calibrationPose = [0.1, 0.2, 0.3, 0.9] as const;
    const first = renderPresentation([lightningRequested()], {
      developmentOnlyRenderer: { scene, sidecar, calibrationPose },
    });
    const firstToken = attackDieProps.at(-1)!.presentationToken;

    first.rerender(
      <DiceTrayPresentation
        label="Player attack dice"
        events={[lightningRequested('attack:8')]}
        witnessRole="roller"
        reducedMotion
        developmentOnlyRenderer={{ scene, sidecar, calibrationPose }}
      />
    );
    const secondProps = attackDieProps.at(-1)!;
    expect(secondProps.presentationToken).not.toBe(firstToken);
    expect(secondProps).toMatchObject({
      phase: 'ready',
      sceneOverride: scene,
      sidecarOverride: sidecar,
      calibrationPose,
    });

    renderPresentation([requested('attack:9')]);
    expect(attackDieProps.at(-1)?.presentationToken).not.toBe(
      secondProps.presentationToken
    );
  });

  it('binds development renderer injection to lightning result 10 only', () => {
    const developmentOnlyRenderer = {
      scene: {} as AttackDie3DProps['sceneOverride'],
      sidecar: {} as NonNullable<AttackDie3DProps['sidecarOverride']>,
      calibrationPose: [0.1, 0.2, 0.3, 0.9] as const,
    };
    renderPresentation(
      [
        requested('attack:9', {
          die: {
            kind: 'd20',
            presetId: 'lightning',
            authoritativeResult: 9,
          },
        }),
      ],
      { developmentOnlyRenderer }
    );

    expect(attackDieProps).toHaveLength(0);
    expect(screen.getByTestId('dice-face').textContent).toBe('?');
  });

  it('hydrates request plus release directly as settled without replay', () => {
    const onReleaseRequest = vi.fn();
    renderPresentation([requested(), released()], { onReleaseRequest });

    expect(attackDieProps.at(-1)?.phase).toBe('settled');
    expect(screen.getByTestId('dice-face').textContent).toBe('10');
    expect(onReleaseRequest).not.toHaveBeenCalled();
  });

  it('hydrates an unknown safe preset directly as truthful settled SVG', () => {
    const presentationId = 'attack:hydrated-unknown';
    const request = requested(presentationId, {
      die: {
        kind: 'd20',
        presetId: 'newer-safe-preset',
        authoritativeResult: 14,
      },
    });
    const release = released(presentationId, {
      presetId: 'newer-safe-preset',
    });

    renderPresentation([request, release]);

    expect(attackDieProps).toHaveLength(0);
    expect(screen.getByTestId('dice-face').textContent).toBe('14');
    expect(screen.getByRole('status').textContent).toMatch(
      /result 14 released · truthful SVG settled/i
    );
    expect(document.body.innerHTML).not.toMatch(/https?:\/\/|\.glb/i);
  });

  it('rejects an initial release before its request but rolls for a later post-request release', () => {
    const onReleaseRequest = vi.fn();
    const earlyRelease = {
      ...released(),
      eventId: 'release:attack:7:early',
    };
    const laterRelease = {
      ...released('attack:7', { variation: 11 }),
      eventId: 'release:attack:7:later',
    };
    const requestA = requested();
    const view = renderPresentation([earlyRelease, requestA], {
      onReleaseRequest,
    });
    const armed = attackDieProps.at(-1)!;

    expect(armed.phase).toBe('ready');
    expect(armed.decorativeRelease).toBeUndefined();
    expect(screen.getByTestId('dice-face').textContent).toBe('?');
    expect(onReleaseRequest).not.toHaveBeenCalled();

    view.rerender(
      <DiceTrayPresentation
        label="Player attack dice"
        events={[earlyRelease, requestA, laterRelease]}
        witnessRole="roller"
        reducedMotion
        onReleaseRequest={onReleaseRequest}
      />
    );

    expect(attackDieProps.at(-1)).toMatchObject({
      presentationToken: armed.presentationToken,
      phase: 'rolling',
      decorativeRelease: laterRelease.release,
    });
    expect(screen.getByTestId('dice-face').textContent).not.toBe('10');
    expect(onReleaseRequest).not.toHaveBeenCalled();
  });

  it('retains armed request authority across a conflicting same-id request-only delivery', () => {
    const scene = {} as AttackDie3DProps['sceneOverride'];
    const sidecar = {} as NonNullable<AttackDie3DProps['sidecarOverride']>;
    const calibrationPose = [0.1, 0.2, 0.3, 0.9] as const;
    const developmentOnlyRenderer = { scene, sidecar, calibrationPose };
    const onReleaseRequest = vi.fn();
    const requestA = requested();
    const requestB = requested('attack:7', {
      eventId: 'request:attack:7:replacement',
      roller: { entityId: 'monster:2', role: 'monster' },
      die: {
        kind: 'd20',
        presetId: 'newer-safe-preset',
        authoritativeResult: 20,
      },
    });
    const view = renderPresentation([requestA], {
      onReleaseRequest,
      developmentOnlyRenderer,
    });
    const armed = attackDieProps.at(-1)!;
    const renderCount = attackDieProps.length;

    view.rerender(
      <DiceTrayPresentation
        label="Player attack dice"
        events={[requestB]}
        witnessRole="roller"
        reducedMotion
        onReleaseRequest={onReleaseRequest}
        developmentOnlyRenderer={developmentOnlyRenderer}
      />
    );

    expect(attackDieProps.length).toBeGreaterThan(renderCount);
    expect(attackDieProps.at(-1)).toMatchObject({
      presentationToken: armed.presentationToken,
      onTelemetry: armed.onTelemetry,
      result: 10,
      phase: 'ready',
      sceneOverride: undefined,
      sidecarOverride: undefined,
      calibrationPose: undefined,
    });
    expect(attackDieProps.at(-1)?.sceneOverride).toBeUndefined();
    expect(attackDieProps.at(-1)?.sidecarOverride).toBeUndefined();
    expect(attackDieProps.at(-1)?.calibrationPose).toBeUndefined();
    expect(screen.getByTestId('dice-face').textContent).toBe('?');
    expect(screen.getByRole('status').textContent).toMatch(
      /waiting for release/i
    );
    expect(screen.getByRole('button', { name: 'Roll d20' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));

    expect(onReleaseRequest).toHaveBeenCalledTimes(1);
    const emittedReleaseA = onReleaseRequest.mock.calls[0][0];
    expect(emittedReleaseA).toMatchObject({
      eventId: 'attack:7:release',
      presentationId: 'attack:7',
      release: {
        presentationId: 'attack:7',
        presetId: 'dice.original.carved.d20',
      },
    });
    expect(Object.isFrozen(emittedReleaseA)).toBe(true);

    const appendRenderCount = attackDieProps.length;
    view.rerender(
      <DiceTrayPresentation
        label="Player attack dice"
        events={[requestB, emittedReleaseA]}
        witnessRole="roller"
        reducedMotion
        onReleaseRequest={onReleaseRequest}
        developmentOnlyRenderer={developmentOnlyRenderer}
      />
    );

    expect(attackDieProps.at(-1)).toMatchObject({
      presentationToken: armed.presentationToken,
      onTelemetry: armed.onTelemetry,
      result: 10,
      phase: 'settled',
      decorativeRelease: emittedReleaseA.release,
      sceneOverride: undefined,
      sidecarOverride: undefined,
      calibrationPose: undefined,
    });
    expect(attackDieProps.at(-1)?.sceneOverride).toBeUndefined();
    expect(attackDieProps.at(-1)?.sidecarOverride).toBeUndefined();
    expect(attackDieProps.at(-1)?.calibrationPose).toBeUndefined();
    expect(
      attackDieProps
        .slice(appendRenderCount)
        .every((props) => props.phase !== 'rolling')
    ).toBe(true);
    expect(screen.getByTestId('dice-face').textContent).toBe('10');
    expect(screen.getByRole('status').textContent).toMatch(
      /result 10 released/i
    );
    expect(screen.queryByRole('button', { name: 'Roll d20' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Grab d20' })).toBeNull();
    expect(onReleaseRequest).toHaveBeenCalledTimes(1);
  });

  it('rejects a release matching only a conflicting same-id replacement preset', () => {
    const requestA = requested();
    const releaseA = released();
    const requestB = requested('attack:7', {
      eventId: 'request:attack:7:replacement',
      roller: { entityId: 'monster:2', role: 'monster' },
      die: {
        kind: 'd20',
        presetId: 'newer-safe-preset',
        authoritativeResult: 20,
      },
    });
    const releaseB = {
      ...released('attack:7', { presetId: 'newer-safe-preset' }),
      eventId: 'release:attack:7:replacement',
    };
    const onReleaseRequest = vi.fn();
    const view = renderPresentation([requestA], { onReleaseRequest });
    const generation = attackDieProps.at(-1)!.presentationToken;

    view.rerender(
      <DiceTrayPresentation
        label="Player attack dice"
        events={[requestB, releaseB]}
        witnessRole="roller"
        reducedMotion
        onReleaseRequest={onReleaseRequest}
      />
    );

    expect(attackDieProps.at(-1)).toMatchObject({
      presentationToken: generation,
      result: 10,
      phase: 'ready',
      decorativeRelease: undefined,
    });
    expect(screen.getByTestId('dice-face').textContent).toBe('?');
    expect(screen.getByRole('status').textContent).not.toContain('10');
    expect(screen.getByRole('button', { name: 'Roll d20' })).toBeTruthy();

    const redeliveryRenderCount = attackDieProps.length;
    view.rerender(
      <DiceTrayPresentation
        label="Player attack dice"
        events={[requestA, releaseA]}
        witnessRole="roller"
        reducedMotion
        onReleaseRequest={onReleaseRequest}
      />
    );

    expect(attackDieProps.at(-1)).toMatchObject({
      presentationToken: generation,
      result: 10,
      phase: 'settled',
      decorativeRelease: releaseA.release,
    });
    expect(
      attackDieProps
        .slice(redeliveryRenderCount)
        .every((props) => props.phase !== 'rolling')
    ).toBe(true);
    expect(screen.getByTestId('dice-face').textContent).toBe('10');
  });

  it('retains original result and roller facts when a same-preset conflicting request releases', () => {
    const scene = {} as AttackDie3DProps['sceneOverride'];
    const sidecar = {} as NonNullable<AttackDie3DProps['sidecarOverride']>;
    const calibrationPose = [0.1, 0.2, 0.3, 0.9] as const;
    const developmentOnlyRenderer = { scene, sidecar, calibrationPose };
    const requestA = requested();
    const requestC = requested('attack:7', {
      eventId: 'request:attack:7:same-preset-conflict',
      roller: { entityId: 'monster:2', role: 'monster' },
      die: {
        kind: 'd20',
        presetId: 'dice.original.carved.d20',
        authoritativeResult: 20,
      },
    });
    const releaseC = {
      ...released(),
      eventId: 'release:attack:7:same-preset-conflict',
    };
    const view = renderPresentation([requestA], {
      developmentOnlyRenderer,
    });
    const armed = attackDieProps.at(-1)!;

    view.rerender(
      <DiceTrayPresentation
        label="Player attack dice"
        events={[requestC, releaseC]}
        witnessRole="roller"
        reducedMotion
        developmentOnlyRenderer={developmentOnlyRenderer}
      />
    );

    const settled = attackDieProps.at(-1)!;
    expect(settled).toMatchObject({
      presentationToken: armed.presentationToken,
      result: 10,
      phase: 'settled',
      sceneOverride: undefined,
      sidecarOverride: undefined,
      calibrationPose: undefined,
    });
    expect(settled.sceneOverride).toBeUndefined();
    expect(settled.sidecarOverride).toBeUndefined();
    expect(settled.calibrationPose).toBeUndefined();
    expect(screen.getByTestId('dice-face').textContent).toBe('10');
    expect(screen.getByRole('status').textContent).toMatch(
      /result 10 released/i
    );

    act(() =>
      settled.onTelemetry?.(
        matchingTelemetry(settled, {
          requestedResult: 20,
          renderer: 'svg',
          state: 'failed',
          exactTargetHeld: false,
        })
      )
    );
    expect(screen.getByRole('status').textContent).toMatch(
      /result 10 released/i
    );
  });

  it('retains settled request and release authority across same-id replacement', () => {
    const scene = {} as AttackDie3DProps['sceneOverride'];
    const sidecar = {} as NonNullable<AttackDie3DProps['sidecarOverride']>;
    const calibrationPose = [0.1, 0.2, 0.3, 0.9] as const;
    const developmentOnlyRenderer = { scene, sidecar, calibrationPose };
    const requestA = requested();
    const releaseA = released();
    const requestB = requested('attack:7', {
      eventId: 'request:attack:7:replacement',
      roller: { entityId: 'monster:2', role: 'monster' },
      die: {
        kind: 'd20',
        presetId: 'newer-safe-preset',
        authoritativeResult: 20,
      },
    });
    const releaseB = {
      ...released('attack:7', { presetId: 'newer-safe-preset' }),
      eventId: 'release:attack:7:replacement',
    };
    const view = renderPresentation([requestA, releaseA], {
      developmentOnlyRenderer,
    });
    const settled = attackDieProps.at(-1)!;

    view.rerender(
      <DiceTrayPresentation
        label="Player attack dice"
        events={[requestB, releaseB]}
        witnessRole="roller"
        reducedMotion
        developmentOnlyRenderer={developmentOnlyRenderer}
      />
    );

    expect(attackDieProps.at(-1)).toMatchObject({
      presentationToken: settled.presentationToken,
      result: 10,
      phase: 'settled',
      decorativeRelease: releaseA.release,
      sceneOverride: undefined,
      sidecarOverride: undefined,
      calibrationPose: undefined,
    });
    expect(attackDieProps.at(-1)?.sceneOverride).toBeUndefined();
    expect(attackDieProps.at(-1)?.sidecarOverride).toBeUndefined();
    expect(attackDieProps.at(-1)?.calibrationPose).toBeUndefined();
    expect(screen.getByTestId('dice-face').textContent).toBe('10');
    expect(screen.getByRole('status').textContent).toMatch(
      /result 10 released/i
    );
    expect(screen.queryByRole('button', { name: 'Roll d20' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Grab d20' })).toBeNull();
  });

  it('accepts new request facts only when a new presentation id resets the keyed lifecycle', () => {
    const scene = {} as AttackDie3DProps['sceneOverride'];
    const sidecar = {} as NonNullable<AttackDie3DProps['sidecarOverride']>;
    const calibrationPose = [0.1, 0.2, 0.3, 0.9] as const;
    const developmentOnlyRenderer = { scene, sidecar, calibrationPose };
    const view = renderPresentation([requested()], {
      developmentOnlyRenderer,
    });
    const firstGeneration = attackDieProps.at(-1)!.presentationToken;
    const nextRequest = requested('attack:8', {
      eventId: 'request:attack:8:monster',
      roller: { entityId: 'monster:2', role: 'monster' },
      die: {
        kind: 'd20',
        presetId: 'dice.original.carved.d20',
        authoritativeResult: 12,
      },
    });

    view.rerender(
      <DiceTrayPresentation
        label="Monster attack dice"
        events={[nextRequest]}
        witnessRole="roller"
        reducedMotion
        developmentOnlyRenderer={developmentOnlyRenderer}
      />
    );

    expect(attackDieProps.at(-1)).toMatchObject({
      result: 12,
      phase: 'ready',
      sceneOverride: undefined,
      sidecarOverride: undefined,
      calibrationPose: undefined,
    });
    expect(attackDieProps.at(-1)?.presentationToken).not.toBe(firstGeneration);
    expect(screen.getByTestId('dice-face').textContent).toBe('?');
    expect(screen.queryByRole('button', { name: 'Roll d20' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Grab d20' })).toBeNull();
  });

  it('retains a live accepted release through observation, truncation, and same redelivery without replay', () => {
    const onReleaseRequest = vi.fn();
    const view = renderPresentation([requested()], { onReleaseRequest });
    const armed = attackDieProps.at(-1)!;
    const generation = armed.presentationToken;

    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
    const event = onReleaseRequest.mock.calls[0][0];
    view.rerender(
      <DiceTrayPresentation
        label="Player attack dice"
        events={[requested(), event]}
        witnessRole="roller"
        reducedMotion
        onReleaseRequest={onReleaseRequest}
      />
    );
    const rolling = attackDieProps.at(-1)!;
    expect(rolling).toMatchObject({
      presentationToken: generation,
      phase: 'rolling',
    });

    act(() => rolling.onTelemetry?.(matchingTelemetry(rolling)));
    expect(attackDieProps.at(-1)).toMatchObject({
      presentationToken: generation,
      phase: 'settled',
    });
    const settledRenderCount = attackDieProps.length;

    view.rerender(
      <DiceTrayPresentation
        label="Player attack dice"
        events={[requested()]}
        witnessRole="roller"
        reducedMotion
        onReleaseRequest={onReleaseRequest}
      />
    );
    expect(attackDieProps.at(-1)).toMatchObject({
      presentationToken: generation,
      phase: 'settled',
      decorativeRelease: event.release,
    });
    expect(screen.getByTestId('dice-face').textContent).toBe('10');
    expect(screen.getByRole('status').textContent).toContain('10');
    expect(screen.queryByRole('button', { name: 'Roll d20' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Grab d20' })).toBeNull();
    expect(onReleaseRequest).toHaveBeenCalledTimes(1);

    view.rerender(
      <DiceTrayPresentation
        label="Player attack dice"
        events={[requested(), event]}
        witnessRole="roller"
        reducedMotion
        onReleaseRequest={onReleaseRequest}
      />
    );
    expect(attackDieProps.at(-1)).toMatchObject({
      presentationToken: generation,
      phase: 'settled',
      decorativeRelease: event.release,
    });
    expect(
      attackDieProps
        .slice(settledRenderCount)
        .every((props) => props.phase === 'settled')
    ).toBe(true);
    expect(onReleaseRequest).toHaveBeenCalledTimes(1);
  });

  it('retains a hydrated release through truncation, reorder, and same redelivery', () => {
    const firstRelease = released();
    const view = renderPresentation([requested(), firstRelease]);
    const generation = attackDieProps.at(-1)!.presentationToken;
    expect(attackDieProps.at(-1)).toMatchObject({
      phase: 'settled',
      decorativeRelease: firstRelease.release,
    });

    for (const events of [
      [requested()],
      [firstRelease, requested()],
      [requested(), firstRelease],
    ]) {
      view.rerender(
        <DiceTrayPresentation
          label="Player attack dice"
          events={events}
          witnessRole="roller"
          reducedMotion
        />
      );
      expect(attackDieProps.at(-1)).toMatchObject({
        presentationToken: generation,
        phase: 'settled',
        decorativeRelease: firstRelease.release,
      });
      expect(screen.getByTestId('dice-face').textContent).toBe('10');
    }
  });

  it('retains the first accepted release when a conflicting later release replaces discontinuous delivery', () => {
    const firstRelease = released();
    const conflictingRelease = {
      ...released('attack:7', {
        variation: 19,
        vector: [1, -1],
        shake: 1,
      }),
      eventId: 'release:attack:7:conflict',
    };
    const view = renderPresentation([requested(), firstRelease]);
    const generation = attackDieProps.at(-1)!.presentationToken;

    view.rerender(
      <DiceTrayPresentation
        label="Player attack dice"
        events={[requested()]}
        witnessRole="roller"
        reducedMotion
      />
    );
    view.rerender(
      <DiceTrayPresentation
        label="Player attack dice"
        events={[requested(), conflictingRelease]}
        witnessRole="roller"
        reducedMotion
      />
    );

    expect(attackDieProps.at(-1)).toMatchObject({
      presentationToken: generation,
      phase: 'settled',
      decorativeRelease: firstRelease.release,
    });
    expect(attackDieProps.at(-1)?.decorativeRelease).not.toEqual(
      conflictingRelease.release
    );
    expect(screen.getByTestId('dice-face').textContent).toBe('10');
  });

  it('resets sticky release state only for a new presentation id', () => {
    const onReleaseRequest = vi.fn();
    const view = renderPresentation([requested(), released()], {
      onReleaseRequest,
    });
    const settledGeneration = attackDieProps.at(-1)!.presentationToken;

    view.rerender(
      <DiceTrayPresentation
        label="Player attack dice"
        events={[requested('attack:8')]}
        witnessRole="roller"
        reducedMotion
        onReleaseRequest={onReleaseRequest}
      />
    );

    expect(attackDieProps.at(-1)?.presentationToken).not.toBe(
      settledGeneration
    );
    expect(attackDieProps.at(-1)?.phase).toBe('ready');
    expect(screen.getByTestId('dice-face').textContent).toBe('?');
    expect(screen.getByRole('button', { name: 'Roll d20' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Grab d20' })).toBeTruthy();
    expect(onReleaseRequest).not.toHaveBeenCalled();
  });

  it.each([
    ['monster roller', 'roller', 'monster'],
    ['player spectator', 'spectator', 'player'],
    ['monster spectator', 'spectator', 'monster'],
  ] as const)(
    'never grants append authority to a %s',
    (_name, witnessRole, rollerRole) => {
      const onReleaseRequest = vi.fn();
      renderPresentation(
        [
          requested('attack:7', {
            roller: { entityId: 'entity:1', role: rollerRole },
          }),
        ],
        { witnessRole, onReleaseRequest }
      );

      expect(screen.queryByRole('button', { name: /roll/i })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Grab d20' })).toBeNull();
      expect(onReleaseRequest).not.toHaveBeenCalled();
    }
  );

  it('snapshots each original accessor once and fails closed on hostile input', () => {
    const reads = new Map<string, number>();
    const defineOneRead = (
      target: Record<string, unknown>,
      path: string,
      value: unknown
    ) =>
      Object.defineProperty(target, path.split('.').at(-1)!, {
        enumerable: true,
        get() {
          const count = (reads.get(path) ?? 0) + 1;
          reads.set(path, count);
          if (count > 1) throw new Error(`${path} read more than once`);
          return value;
        },
      });

    const releaseValue: Record<string, unknown> = {};
    defineOneRead(releaseValue, 'release.schemaVersion', 1);
    defineOneRead(releaseValue, 'release.presentationId', 'attack:7');
    defineOneRead(releaseValue, 'release.presetId', 'lightning');
    defineOneRead(releaseValue, 'release.variation', 7);
    defineOneRead(releaseValue, 'release.vector', [0, 0]);
    defineOneRead(releaseValue, 'release.shake', 0);
    const releaseEvent: Record<string, unknown> = {};
    defineOneRead(releaseEvent, 'early.schemaVersion', 1);
    defineOneRead(releaseEvent, 'early.type', 'dice-presentation-released');
    defineOneRead(releaseEvent, 'early.eventId', 'release:attack:7:early');
    defineOneRead(releaseEvent, 'early.presentationId', 'attack:7');
    defineOneRead(releaseEvent, 'early.release', releaseValue);

    const roller: Record<string, unknown> = {};
    defineOneRead(roller, 'roller.entityId', 'character:1');
    defineOneRead(roller, 'roller.role', 'player');
    const die: Record<string, unknown> = {};
    defineOneRead(die, 'die.kind', 'd20');
    defineOneRead(die, 'die.presetId', 'dice.original.carved.d20');
    defineOneRead(die, 'die.authoritativeResult', 10);
    const requestEvent: Record<string, unknown> = {};
    defineOneRead(requestEvent, 'request.schemaVersion', 1);
    defineOneRead(requestEvent, 'request.type', 'dice-presentation-requested');
    defineOneRead(requestEvent, 'request.eventId', 'request:attack:7');
    defineOneRead(requestEvent, 'request.presentationId', 'attack:7');
    defineOneRead(requestEvent, 'request.roller', roller);
    defineOneRead(requestEvent, 'request.die', die);

    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('hostile get');
        },
        ownKeys() {
          throw new Error('hostile ownKeys');
        },
        getOwnPropertyDescriptor() {
          throw new Error('hostile descriptor');
        },
      }
    );

    renderPresentation([releaseEvent, requestEvent, hostile]);

    expect([...reads.values()].every((count) => count === 1)).toBe(true);
    expect(reads).toHaveProperty('size', 22);
    expect(attackDieProps.at(-1)).toMatchObject({ result: 10, phase: 'ready' });
    expect(screen.getByTestId('dice-face').textContent).toBe('?');
  });

  it('keeps fixed request facts active despite malformed, duplicate, conflicting, and stale events', () => {
    renderPresentation([
      requested(),
      requested('attack:7', {
        eventId: 'request:conflict',
        die: {
          kind: 'd20',
          presetId: 'lightning',
          authoritativeResult: 20,
        },
      }),
      { ...requested(), target: 'monster:1' },
      released('stale:1'),
      { ...requested(), eventId: '../malformed' },
    ]);

    expect(attackDieProps.at(-1)).toMatchObject({ result: 10, phase: 'ready' });
  });

  it('conceals an armed renderer failure and reveals truthful settled SVG only after matching release delivery', () => {
    const onReleaseRequest = vi.fn();
    const view = renderPresentation([requested()], { onReleaseRequest });
    const armed = attackDieProps.at(-1)!;

    act(() =>
      armed.onTelemetry?.(
        matchingTelemetry(armed, {
          renderer: 'svg',
          state: 'failed',
          exactTargetHeld: false,
          failureCode: 'shader-failure',
        })
      )
    );
    expect(attackDieProps.at(-1)?.phase).toBe('ready');
    expect(screen.getByTestId('dice-face').textContent).toBe('?');

    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
    const event = onReleaseRequest.mock.calls[0][0];
    view.rerender(
      <DiceTrayPresentation
        label="Player attack dice"
        events={[requested(), event]}
        witnessRole="roller"
        reducedMotion
        onReleaseRequest={onReleaseRequest}
      />
    );

    expect(attackDieProps.at(-1)?.phase).toBe('settled');
    expect(screen.getByTestId('dice-face').textContent).toBe('10');
  });

  it('preserves terminal failure through release truncation and same-release redelivery', () => {
    const onReleaseRequest = vi.fn();
    const view = renderPresentation([requested()], { onReleaseRequest });
    const armed = attackDieProps.at(-1)!;
    const token = armed.presentationToken;

    act(() =>
      armed.onTelemetry?.(
        matchingTelemetry(armed, {
          renderer: 'svg',
          state: 'failed',
          exactTargetHeld: false,
          failureCode: 'shader-failure',
        })
      )
    );
    expect(attackDieProps.at(-1)?.phase).toBe('ready');
    expect(screen.getByTestId('dice-face').textContent).toBe('?');
    expect(screen.getByRole('status').textContent).not.toContain('10');

    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
    const event = onReleaseRequest.mock.calls[0][0];
    view.rerender(
      <DiceTrayPresentation
        label="Player attack dice"
        events={[requested(), event]}
        witnessRole="roller"
        reducedMotion
        onReleaseRequest={onReleaseRequest}
      />
    );
    expect(attackDieProps.at(-1)).toMatchObject({
      presentationToken: token,
      phase: 'settled',
    });
    expect(screen.getByTestId('dice-face').textContent).toBe('10');

    view.rerender(
      <DiceTrayPresentation
        label="Player attack dice"
        events={[requested()]}
        witnessRole="roller"
        reducedMotion
        onReleaseRequest={onReleaseRequest}
      />
    );
    expect(attackDieProps.at(-1)).toMatchObject({
      presentationToken: token,
      phase: 'settled',
      decorativeRelease: event.release,
    });
    expect(screen.getByTestId('dice-face').textContent).toBe('10');
    expect(screen.getByRole('status').textContent).toContain('10');
    expect(screen.queryByRole('button', { name: 'Roll d20' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Grab d20' })).toBeNull();

    view.rerender(
      <DiceTrayPresentation
        label="Player attack dice"
        events={[requested(), event]}
        witnessRole="roller"
        reducedMotion
        onReleaseRequest={onReleaseRequest}
      />
    );
    expect(attackDieProps.at(-1)).toMatchObject({
      presentationToken: token,
      phase: 'settled',
    });
    expect(screen.getByTestId('dice-face').textContent).toBe('10');
  });

  it('resets terminal failure and renderer generation for a new presentation', () => {
    const view = renderPresentation([requested()]);
    const failed = attackDieProps.at(-1)!;
    act(() =>
      failed.onTelemetry?.(
        matchingTelemetry(failed, {
          renderer: 'svg',
          state: 'failed',
          exactTargetHeld: false,
        })
      )
    );

    view.rerender(
      <DiceTrayPresentation
        label="Player attack dice"
        events={[requested('attack:8')]}
        witnessRole="roller"
        reducedMotion
      />
    );
    const next = attackDieProps.at(-1)!;
    expect(next.presentationToken).not.toBe(failed.presentationToken);
    expect(next.phase).toBe('ready');

    view.rerender(
      <DiceTrayPresentation
        label="Player attack dice"
        events={[requested('attack:8'), released('attack:8')]}
        witnessRole="roller"
        reducedMotion
      />
    );
    expect(attackDieProps.at(-1)?.phase).toBe('rolling');
  });

  it('renders an unknown safe preset as neutral, rolling, then settled SVG without loading a renderer URL', () => {
    vi.useFakeTimers();
    try {
      const unknownRequest = requested('attack:unknown', {
        die: {
          kind: 'd20',
          presetId: 'newer-safe-preset',
          authoritativeResult: 14,
        },
      });
      const onReleaseRequest = vi.fn();
      const view = renderPresentation([unknownRequest], {
        reducedMotion: false,
        onReleaseRequest,
      });

      expect(attackDieProps).toHaveLength(0);
      expect(screen.getByTestId('dice-face').textContent).toBe('?');
      fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
      const event = onReleaseRequest.mock.calls[0][0];
      view.rerender(
        <DiceTrayPresentation
          label="Player attack dice"
          events={[unknownRequest, event]}
          witnessRole="roller"
          reducedMotion={false}
          onReleaseRequest={onReleaseRequest}
        />
      );

      expect(screen.getByTestId('dice-tray').className).toContain(
        'dice-tray--rolling'
      );
      expect(screen.getByTestId('dice-face').textContent).not.toBe('14');
      act(() => vi.advanceTimersByTime(3000));
      expect(screen.getByTestId('dice-face').textContent).toBe('14');
      expect(screen.getByRole('status').textContent).toMatch(
        /truthful SVG settled/i
      );
      expect(attackDieProps).toHaveLength(0);
      expect(document.body.innerHTML).not.toMatch(/https?:\/\/|\.glb/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it('announces phase politely without revealing the result before settlement', () => {
    const view = renderPresentation([requested()]);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toMatch(/waiting for release/i);
    expect(status.textContent).not.toContain('10');

    view.rerender(
      <DiceTrayPresentation
        label="Player attack dice"
        events={[requested(), released()]}
        witnessRole="roller"
        reducedMotion
      />
    );
    const rolling = attackDieProps.at(-1)!;
    expect(screen.getByRole('status').textContent).toMatch(/rolling/i);
    expect(screen.getByRole('status').textContent).not.toContain('10');

    act(() => rolling.onTelemetry?.(matchingTelemetry(rolling)));
    expect(screen.getByRole('status').textContent).toContain('10');
  });
});
