import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AttackDie3DProps,
  AttackDieTelemetry,
} from '../../components/ui/dice/AttackDie3D';
import type { DiceTrayPresentationProps } from '../../components/ui/dice/DiceTrayPresentation';
import { DiceTray3DConceptPanel } from './DiceTray3DConceptPanel';
import { MONSTER_FIXTURE_RELEASE_DELAY_MS } from './diceTrayWitnessFixture';

const attackDieProps: AttackDie3DProps[] = [];
const presentationCalls: DiceTrayPresentationProps[] = [];

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
      return <ActualDiceTrayPresentation {...props} />;
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
  });
});

afterEach(() => {
  vi.useRealTimers();
  delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).hasPointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).releasePointerCapture;
});

function observed(props: AttackDie3DProps): AttackDieTelemetry {
  return {
    presentationToken: props.presentationToken,
    requestedResult: 10,
    renderer: '3d',
    state: 'observed',
    exactTargetHeld: true,
  };
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

  it('publishes measured per-witness telemetry, context, shared-event, and request facts for private evidence', () => {
    render(<DiceTray3DConceptPanel token={90} reducedMotion={false} />);
    const roller = latestPresentation('Roller');
    const spectator = latestPresentation('Spectator');
    const rollerToken = tokenFor('Roller');
    const spectatorToken = tokenFor('Spectator');

    act(() => {
      roller.onTelemetry?.({
        presentationToken: rollerToken,
        requestedResult: 10,
        renderer: '3d',
        state: 'observed',
        exactTargetHeld: true,
        mappedTarget: [0, 0, 0, 1],
        angularErrorDegrees: 0,
        runtimeSourceId: 7,
        runtimeCloneId: 8,
      });
      spectator.onTelemetry?.({
        presentationToken: spectatorToken,
        requestedResult: 10,
        renderer: '3d',
        state: 'observed',
        exactTargetHeld: true,
        mappedTarget: [0, 0, 0, 1],
        angularErrorDegrees: 0,
        runtimeSourceId: 7,
        runtimeCloneId: 9,
      });
      roller.onRendererInfo?.({
        calls: 1,
        triangles: 1,
        geometries: 1,
        textures: 0,
        programs: 1,
        lifecycle: 'sampled',
        contextId: 11,
      });
      spectator.onRendererInfo?.({
        calls: 1,
        triangles: 1,
        geometries: 1,
        textures: 0,
        programs: 1,
        lifecycle: 'sampled',
        contextId: 12,
      });
    });

    const bridge = (
      window as unknown as {
        __stone0TrayEvidence?: Record<string, unknown>;
      }
    ).__stone0TrayEvidence as {
      requestIdentity: string;
      eventCount: number;
      witnesses: Record<
        string,
        {
          boundary: {
            eventArrayId: number;
            providerId: number;
            eventCount: number;
            eventsFrozen: boolean;
            providerFrozen: boolean;
          };
          telemetry: AttackDieTelemetry;
          rendererInfo: { contextId: number };
        }
      >;
    };
    expect(bridge).toMatchObject({
      requestIdentity: 'concept:witness:player:90:result:10',
      eventCount: 1,
      witnesses: {
        roller: {
          boundary: {
            eventCount: 1,
            eventsFrozen: true,
            providerFrozen: true,
          },
          telemetry: {
            presentationToken: rollerToken,
            runtimeSourceId: 7,
            runtimeCloneId: 8,
          },
          rendererInfo: { contextId: 11 },
        },
        spectator: {
          boundary: {
            eventCount: 1,
            eventsFrozen: true,
            providerFrozen: true,
          },
          telemetry: {
            presentationToken: spectatorToken,
            runtimeSourceId: 7,
            runtimeCloneId: 9,
          },
          rendererInfo: { contextId: 12 },
        },
      },
    });
    expect(bridge.witnesses.roller.boundary.eventArrayId).toBe(
      bridge.witnesses.spectator.boundary.eventArrayId
    );
    expect(bridge.witnesses.roller.boundary.providerId).toBe(
      bridge.witnesses.spectator.boundary.providerId
    );
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
    expect(rollingRoller.decorativeRelease).toEqual(
      rollingSpectator.decorativeRelease
    );
    expect(rollingRoller.decorativeRelease).not.toBe(
      rollingSpectator.decorativeRelease
    );
    expect(rollingRoller.decorativeRelease).toMatchObject({
      presentationId: 'concept:witness:player:12:result:10',
      presetId: 'dice.original.carved.d20',
      vector: [0.5, -0.25],
      shake: expect.any(Number),
    });

    act(() =>
      rollingSpectator.onTelemetry?.({
        ...observed(rollingSpectator),
        presentationToken: rollerToken,
      })
    );
    expectPhases('rolling', 'rolling');

    act(() => rollingRoller.onTelemetry?.(observed(rollingRoller)));
    expectPhases('settled', 'rolling');
    expect(face('Roller').textContent).toBe('10');
    expect(face('Spectator').textContent).not.toBe('10');

    act(() => rollingSpectator.onTelemetry?.(observed(rollingSpectator)));
    expectPhases('settled', 'settled');
    expect(face('Roller').textContent).toBe('10');
    expect(face('Spectator').textContent).toBe('10');
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
