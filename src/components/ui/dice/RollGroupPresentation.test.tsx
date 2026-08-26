import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { StrictMode, useEffect, useLayoutEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiceRollGroupInput } from './diceRollGroup';
import type {
  DiceRollGroupEvent,
  DiceRollGroupReleasedEvent,
  DiceRollGroupRequestedEvent,
} from './diceRollGroupEvent';
import {
  DiceTrayPresentation,
  type DiceRollGroupPresentationProps,
} from './DiceTrayPresentation';
import type { RollGroupTray3DProps } from './RollGroupTray3D';
import { createVisualThrowProfile } from './visualThrowProfile';

const mocks = vi.hoisted(() => ({
  trays: [] as RollGroupTray3DProps[],
  semantic: [] as Array<Record<string, unknown>>,
  order: [] as string[],
  nextCloneId: 1,
  autoFinalFrame: true,
}));

vi.mock('./RollGroupTray3D', () => ({
  RollGroupTray3D: (props: RollGroupTray3DProps) => {
    mocks.trays.push(props);
    const { group, onReady, rendererGeneration, witnessRole } = props;
    const frameCallbacks = props as RollGroupTray3DProps & {
      readonly onRerollSettled?: () => void;
      readonly onFinalFrameRendered?: () => void;
    };
    useLayoutEffect(() => {
      mocks.order.push(`tray-ready:${witnessRole}`);
      group.dice.forEach((die) =>
        onReady?.({
          dieId: die.id,
          runtimeSourceId: die.kind === 'd20' ? 20 : 6,
          runtimeCloneId: mocks.nextCloneId++,
        })
      );
    }, [group.dice, onReady, rendererGeneration, witnessRole]);
    useEffect(() => {
      if (props.phase === 'complete' && mocks.autoFinalFrame)
        frameCallbacks.onFinalFrameRendered?.();
    }, [frameCallbacks, props.phase]);
    return (
      <div data-testid="mock-roll-group-tray" data-phase={props.phase}>
        {props.witnessRole === 'roller' && props.onReleaseRequest ? (
          <button
            type="button"
            onClick={() => props.onReleaseRequest?.(neutralProfile(17))}
          >
            Roll dice
          </button>
        ) : null}
        {props.group.dice.map((die) => (
          <div
            key={die.id}
            data-roll-group-die-id={die.id}
            data-renderer-generation={props.rendererGeneration}
            data-witness-role={props.witnessRole}
          />
        ))}
      </div>
    );
  },
}));
vi.mock('./SemanticRollGroup', () => ({
  SemanticRollGroup: (props: Record<string, unknown>) => {
    mocks.semantic.push(props);
    const group = props.group as DiceRollGroupInput;
    const presentation = props.presentation as { phase: string };
    const onReleaseRequest = props.onReleaseRequest as (() => void) | undefined;
    useLayoutEffect(() => {
      mocks.order.push('semantic-ready');
    }, []);
    return (
      <div
        data-testid="mock-semantic-roll-group"
        data-phase={presentation.phase}
      >
        {group.dice.map((die) => (
          <div key={die.id} data-roll-group-die-id={die.id} />
        ))}
        {presentation.phase === 'armed' && onReleaseRequest ? (
          <button type="button" onClick={() => onReleaseRequest()}>
            Roll dice
          </button>
        ) : null}
      </div>
    );
  },
}));

function neutralProfile(motionSeed: number) {
  return createVisualThrowProfile({
    releasePosition: [0.5, 0.5],
    releaseDirection: [0, 0],
    releaseSpeed: 0,
    shakeEnergy: 0,
    spinBias: 0,
    motionSeed,
  });
}

function die(id: string, rerolled = false) {
  return {
    id,
    kind: 'd20' as const,
    presetId: 'dice.original.carved.d20',
    setId: 'set:1',
    originalFace: 2,
    finalFace: rerolled ? 4 : 2,
    rerolls: rerolled
      ? [
          {
            before: 2,
            after: 4,
            reasonRef: 'reason:great-weapon',
            displayLabel: 'Great Weapon Fighting',
          },
        ]
      : [],
    disposition: 'counted' as const,
    sourceRef: 'source:base',
    sourceLabel: 'Base damage',
    contributorMemberId: 'member:roller',
    purpose: 'base' as const,
  };
}

const group: DiceRollGroupInput = {
  key: 'damage',
  dice: [
    die('die:one'),
    die('die:rerolled', true),
    die('die:rerolled-two', true),
  ],
  modifiers: [
    {
      id: 'modifier:ability',
      sourceRef: 'source:ability',
      displayLabel: 'Strength',
      order: 0,
      value: 3,
    },
    {
      id: 'modifier:weapon',
      sourceRef: 'source:weapon',
      displayLabel: 'Flame Tongue',
      order: 1,
      text: 'fire',
    },
  ],
  suppliedFinalTotal: 11,
};

function request(id = 'damage:1'): DiceRollGroupRequestedEvent {
  return {
    schemaVersion: 1,
    type: 'dice-roll-group-requested',
    eventId: `request:${id}`,
    presentationId: id,
    roller: { memberId: 'member:roller', role: 'player' },
    group,
  };
}

function release(id = 'damage:1', motionSeed = 17): DiceRollGroupReleasedEvent {
  return {
    schemaVersion: 1,
    type: 'dice-roll-group-released',
    eventId: `release:${id}:${motionSeed}`,
    presentationId: id,
    release: {
      schemaVersion: 1,
      presentationId: id,
      groupKey: 'damage',
      throwProfile: neutralProfile(motionSeed),
    },
  };
}

function props(
  events: readonly DiceRollGroupEvent[],
  overrides: Partial<DiceRollGroupPresentationProps> = {}
): DiceRollGroupPresentationProps {
  return {
    mode: 'roll-group',
    label: 'Damage dice',
    events,
    witnessRole: 'roller',
    feel: 'weighty',
    appearances: group.dice.map((item) => ({
      dieId: item.id,
      treatment: {
        bodyColor: '#15233b',
        numeralColor: '#f5eddc',
        roughness: 0.72,
        metalness: 0.08,
      },
    })),
    reducedMotion: true,
    ...overrides,
  };
}

type DesiredTrayProps = RollGroupTray3DProps & {
  readonly displayedFaces?: Readonly<Record<string, number>>;
  readonly rerollDieIds?: readonly string[];
  readonly rerollOccurrenceKey?: string;
  readonly onRerollSettled?: () => void;
  readonly onFinalFrameRendered?: () => void;
};

function latestTray(
  witnessRole: 'roller' | 'spectator' = 'roller'
): DesiredTrayProps {
  return [...mocks.trays]
    .reverse()
    .find((tray) => tray.witnessRole === witnessRole)!;
}

function runNextTimer() {
  act(() => vi.runOnlyPendingTimers());
}

beforeEach(() => {
  mocks.trays = [];
  mocks.semantic = [];
  mocks.order = [];
  mocks.nextCloneId = 1;
  mocks.autoFinalFrame = true;
});

describe('DiceTrayPresentation roll-group overload', () => {
  it('keeps a normal roller armed indefinitely and emits only one frozen append request', () => {
    vi.useFakeTimers();
    try {
      const onReleaseRequest = vi.fn();
      const onComplete = vi.fn();
      render(
        <DiceTrayPresentation
          {...props([request()], { onReleaseRequest, onComplete })}
        />
      );

      expect(latestTray().phase).toBe('armed');
      act(() => vi.advanceTimersByTime(60 * 60 * 1000));
      expect(onReleaseRequest).not.toHaveBeenCalled();
      expect(onComplete).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Roll dice' }));
      fireEvent.click(screen.getByRole('button', { name: 'Roll dice' }));
      expect(onReleaseRequest).toHaveBeenCalledTimes(1);
      const emitted = onReleaseRequest.mock.calls[0][0];
      expect(emitted).toMatchObject({
        type: 'dice-roll-group-released',
        presentationId: 'damage:1',
        release: {
          presentationId: 'damage:1',
          groupKey: 'damage',
        },
      });
      expect(Object.isFrozen(emitted)).toBe(true);
      expect(Object.isFrozen(emitted.release)).toBe(true);
      expect(Object.isFrozen(emitted.release.throwProfile)).toBe(true);
      expect(JSON.stringify(emitted)).not.toMatch(
        /pointer|clientX|clientY|timeMs|samples/i
      );
      expect(latestTray().phase).toBe('armed');
      expect(onComplete).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('changes phase only after the host appends the requested release event', () => {
    const onReleaseRequest = vi.fn();
    const view = render(
      <DiceTrayPresentation {...props([request()], { onReleaseRequest })} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Roll dice' }));
    const emitted = onReleaseRequest.mock.calls[0][0];
    expect(latestTray().phase).toBe('armed');

    view.rerender(
      <DiceTrayPresentation
        {...props([request(), structuredClone(emitted)], {
          onReleaseRequest,
        })}
      />
    );
    expect(latestTray().phase).toBe('rolling-originals');
    expect(latestTray().throwProfile).toEqual(emitted.release.throwProfile);
    expect(onReleaseRequest).toHaveBeenCalledTimes(1);
  });

  it('mounts equal frozen roller and spectator snapshots independently before either tray becomes ready', async () => {
    const mounted: Array<Record<string, unknown>> = [];
    const completed: Array<Record<string, unknown>> = [];
    const rollerEvents = Object.freeze([
      structuredClone(request()),
      structuredClone(release()),
    ]);
    const spectatorEvents = Object.freeze([
      structuredClone(request()),
      structuredClone(release()),
    ]);
    render(
      <>
        <DiceTrayPresentation
          {...props(rollerEvents, {
            onMount: (value) => {
              mocks.order.push('mount:roller');
              mounted.push(value);
            },
            onComplete: (value) => completed.push(value),
          })}
        />
        <DiceTrayPresentation
          {...props(spectatorEvents, {
            witnessRole: 'spectator',
            onMount: (value) => {
              mocks.order.push('mount:spectator');
              mounted.push(value);
            },
            onComplete: (value) => completed.push(value),
          })}
        />
      </>
    );

    await waitFor(() => expect(completed).toHaveLength(2));
    expect(mounted).toHaveLength(2);
    const rollerMount = mounted.find(
      (value) => value.witnessRole === 'roller'
    )!;
    const spectatorMount = mounted.find(
      (value) => value.witnessRole === 'spectator'
    )!;
    expect(rollerMount.rendererGeneration).not.toBe(
      spectatorMount.rendererGeneration
    );
    expect(mocks.order.indexOf('mount:roller')).toBeLessThan(
      mocks.order.indexOf('tray-ready:roller')
    );
    expect(mocks.order.indexOf('mount:spectator')).toBeLessThan(
      mocks.order.indexOf('tray-ready:spectator')
    );

    const roller = latestTray('roller');
    const spectator = latestTray('spectator');
    expect(roller.group).toEqual(spectator.group);
    expect(roller.group).not.toBe(spectator.group);
    expect(Object.isFrozen(roller.group)).toBe(true);
    expect(roller.throwProfile).toEqual(spectator.throwProfile);
    expect(roller.throwProfile).not.toBe(spectator.throwProfile);
    expect(Object.isFrozen(roller.throwProfile)).toBe(true);
    expect(completed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          presentationId: 'damage:1',
          groupKey: 'damage',
          witnessRole: 'roller',
          rendererGeneration: rollerMount.rendererGeneration,
          renderer: '3d',
        }),
        expect.objectContaining({
          presentationId: 'damage:1',
          groupKey: 'damage',
          witnessRole: 'spectator',
          rendererGeneration: spectatorMount.rendererGeneration,
          renderer: '3d',
        }),
      ])
    );
  });

  it.each(['provider', 'webgl', 'solver'] as const)(
    'emits mount before %s semantic fallback completion and no provider boundary diagnostic',
    async (forceFailure) => {
      const onComplete = vi.fn(() => mocks.order.push('complete'));
      const onBoundaryDiagnostic = vi.fn();
      const input = {
        ...props([request(), release()], {
          forceFailure,
          onMount: () => mocks.order.push('mount'),
          onComplete,
        }),
        onBoundaryDiagnostic,
      } as DiceRollGroupPresentationProps;

      render(<DiceTrayPresentation {...input} />);

      await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
      expect(mocks.order).toEqual(['mount', 'semantic-ready', 'complete']);
      const completion = (onComplete.mock.calls as unknown[][])[0]?.[0];
      expect(completion).toMatchObject({
        presentationId: 'damage:1',
        groupKey: 'damage',
        witnessRole: 'roller',
        renderer: 'semantic',
      });
      expect(onBoundaryDiagnostic).not.toHaveBeenCalled();
      expect(screen.getAllByTestId('mock-semantic-roll-group')).toHaveLength(1);
    }
  );

  it('retains an explicit append-only release control when failure occurs while armed', async () => {
    const onComplete = vi.fn();
    const onReleaseRequest = vi.fn();
    const view = render(
      <DiceTrayPresentation
        {...props([request()], {
          forceFailure: 'provider',
          onComplete,
          onReleaseRequest,
        })}
      />
    );

    expect(
      screen.getByTestId('mock-semantic-roll-group').getAttribute('data-phase')
    ).toBe('armed');
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Roll dice' }));
    fireEvent.click(screen.getByRole('button', { name: 'Roll dice' }));
    expect(onReleaseRequest).toHaveBeenCalledTimes(1);
    const emitted = onReleaseRequest.mock.calls[0][0];
    expect(
      screen.getByTestId('mock-semantic-roll-group').getAttribute('data-phase')
    ).toBe('armed');
    expect(onComplete).not.toHaveBeenCalled();

    view.rerender(
      <DiceTrayPresentation
        {...props([request(), structuredClone(emitted)], {
          forceFailure: 'provider',
          onComplete,
          onReleaseRequest,
        })}
      />
    );
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete.mock.calls[0][0]).toMatchObject({
      renderer: 'semantic',
    });
  });

  it('hydrates released history without replay and completes exactly once for that generation', async () => {
    const onReleaseRequest = vi.fn();
    const onMount = vi.fn();
    const onComplete = vi.fn();
    const view = render(
      <StrictMode>
        <DiceTrayPresentation
          {...props([request(), release()], {
            onReleaseRequest,
            onMount,
            onComplete,
          })}
        />
      </StrictMode>
    );

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onMount).toHaveBeenCalledTimes(1);
    expect(onReleaseRequest).not.toHaveBeenCalled();
    expect(onComplete.mock.calls[0][0]).toMatchObject({
      presentationId: 'damage:1',
      groupKey: 'damage',
      witnessRole: 'roller',
      rendererGeneration: onMount.mock.calls[0][0].rendererGeneration,
      renderer: '3d',
    });

    view.rerender(
      <StrictMode>
        <DiceTrayPresentation
          {...props([request(), release(), release()], {
            onReleaseRequest,
            onMount,
            onComplete,
          })}
        />
      </StrictMode>
    );
    expect(onMount).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onReleaseRequest).not.toHaveBeenCalled();
  });

  it('accepts the first compatible release and never replays duplicate or conflicting releases', () => {
    const onComplete = vi.fn();
    const conflicting = {
      ...release(),
      eventId: 'release:conflicting-group',
      release: { ...release().release, groupKey: 'attack' as const },
    };
    const first = release('damage:1', 17);
    const later = release('damage:1', 99);
    const view = render(
      <DiceTrayPresentation {...props([request()], { onComplete })} />
    );

    view.rerender(
      <DiceTrayPresentation
        {...props([request(), conflicting, first, first, later], {
          onComplete,
        })}
      />
    );
    expect(latestTray().phase).toBe('rolling-originals');
    expect(latestTray().throwProfile).toEqual(first.release.throwProfile);
    expect(latestTray().throwProfile).not.toEqual(later.release.throwProfile);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('settles originals before one matching-label reroll batch, reveals modifiers in supplied order, and renders only the supplied final total', () => {
    vi.useFakeTimers();
    try {
      const onComplete = vi.fn();
      const onDiagnostic = vi.fn();
      const view = render(
        <DiceTrayPresentation
          {...props([request()], { onComplete, onDiagnostic })}
        />
      );
      view.rerender(
        <DiceTrayPresentation
          {...props([request(), release()], { onComplete, onDiagnostic })}
        />
      );

      const statuses: string[] = [];
      const status = screen.getByRole('status');
      statuses.push(status.textContent ?? '');
      expect(latestTray().phase).toBe('rolling-originals');
      expect(latestTray().displayedFaces).toEqual({
        'die:one': 2,
        'die:rerolled': 2,
        'die:rerolled-two': 2,
      });
      expect(screen.queryByText('Strength')).toBeNull();
      expect(screen.queryByTestId('roll-group-total')).toBeNull();

      act(() => latestTray().onOriginalsSettled?.());
      expect(latestTray().phase).toBe('settled-originals');
      statuses.push(status.textContent ?? '');

      runNextTimer();
      expect(latestTray().phase).toBe('reroll-flash');
      expect(latestTray().rerollDieIds).toEqual([
        'die:rerolled',
        'die:rerolled-two',
      ]);
      statuses.push(status.textContent ?? '');

      runNextTimer();
      expect(latestTray().phase).toBe('rerolling');
      expect(latestTray().rerollDieIds).toEqual([
        'die:rerolled',
        'die:rerolled-two',
      ]);
      expect(status.textContent?.match(/Great Weapon Fighting/g)).toHaveLength(
        1
      );
      statuses.push(status.textContent ?? '');

      act(() => latestTray().onRerollSettled?.());
      expect(latestTray().phase).toBe('modifiers');
      expect(screen.queryByText('Strength')).toBeNull();
      expect(screen.queryByText('Flame Tongue')).toBeNull();
      expect(screen.queryByTestId('roll-group-total')).toBeNull();
      statuses.push(status.textContent ?? '');

      runNextTimer();
      expect(screen.getByText('Strength')).toBeTruthy();
      expect(screen.queryByText('Flame Tongue')).toBeNull();
      expect(screen.queryByTestId('roll-group-total')).toBeNull();

      runNextTimer();
      expect(latestTray().phase).toBe('complete');
      expect(screen.getByText('Strength')).toBeTruthy();
      expect(screen.getByText('Flame Tongue')).toBeTruthy();
      expect(
        screen
          .getByText('Strength')
          .compareDocumentPosition(screen.getByText('Flame Tongue')) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      expect(screen.getByTestId('roll-group-total').textContent).toBe('11');
      statuses.push(status.textContent ?? '');
      expect(new Set(statuses).size).toBe(statuses.length);
      expect(screen.getAllByRole('status')).toHaveLength(1);
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete.mock.calls[0][0]).toMatchObject({
        rendererGeneration: latestTray().rendererGeneration,
        renderer: '3d',
      });
      expect(onDiagnostic).toHaveBeenCalledWith(
        expect.objectContaining({
          releaseAccepted: true,
          originalsSettled: true,
          rerollsCompleted: 1,
          modifiersCompleted: 2,
          fallback: false,
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('carries a distinct occurrence key from each supplied same-face reroll step into the tray', () => {
    vi.useFakeTimers();
    try {
      const repeatedDie = {
        ...die('die:repeated'),
        finalFace: 4,
        rerolls: [
          {
            before: 2,
            after: 4,
            reasonRef: 'reason:repeat',
            displayLabel: 'Repeat reroll',
          },
          {
            before: 4,
            after: 4,
            reasonRef: 'reason:repeat',
            displayLabel: 'Repeat reroll',
          },
        ],
      };
      const repeatedGroup: DiceRollGroupInput = {
        key: 'damage',
        dice: [repeatedDie],
        modifiers: [],
        suppliedFinalTotal: 4,
      };
      const repeatedRequest: DiceRollGroupRequestedEvent = {
        ...request('damage:repeated'),
        group: repeatedGroup,
      };
      const repeatedAppearances = props([])
        .appearances.slice(0, 1)
        .map((appearance) => ({
          ...appearance,
          dieId: repeatedDie.id,
        }));
      const view = render(
        <DiceTrayPresentation
          {...props([repeatedRequest], {
            appearances: repeatedAppearances,
          })}
        />
      );
      view.rerender(
        <DiceTrayPresentation
          {...props([repeatedRequest, release('damage:repeated')], {
            appearances: repeatedAppearances,
          })}
        />
      );

      act(() => latestTray().onOriginalsSettled?.());
      runNextTimer();
      const firstOccurrence = latestTray().rerollOccurrenceKey;
      expect(typeof firstOccurrence).toBe('string');

      runNextTimer();
      act(() => latestTray().onRerollSettled?.());
      const secondOccurrence = latestTray().rerollOccurrenceKey;
      expect(typeof secondOccurrence).toBe('string');
      expect(secondOccurrence).not.toBe(firstOccurrence);

      runNextTimer();
      expect(latestTray().phase).toBe('rerolling');
      expect(latestTray().rerollOccurrenceKey).toBe(secondOccurrence);
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for the actual final rendered-frame witness after runtime preparation', () => {
    mocks.autoFinalFrame = false;
    const onComplete = vi.fn();
    render(
      <DiceTrayPresentation
        {...props([request(), release()], { onComplete })}
      />
    );

    expect(latestTray().phase).toBe('complete');
    expect(onComplete).not.toHaveBeenCalled();
    act(() => latestTray().onFinalFrameRendered?.());
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toMatchObject({ renderer: '3d' });
  });

  it('does not timer-complete rerolls before their rendered target witness', () => {
    vi.useFakeTimers();
    try {
      const view = render(<DiceTrayPresentation {...props([request()])} />);
      view.rerender(
        <DiceTrayPresentation {...props([request(), release()])} />
      );
      act(() => latestTray().onOriginalsSettled?.());
      runNextTimer();
      runNextTimer();
      expect(latestTray().phase).toBe('rerolling');

      act(() => vi.runAllTimers());
      expect(latestTray().phase).toBe('rerolling');
      act(() => latestTray().onRerollSettled?.());
      expect(latestTray().phase).toBe('modifiers');
    } finally {
      vi.useRealTimers();
    }
  });

  it('turns one runtime member failure into one semantic group completion without stalling', async () => {
    const onComplete = vi.fn();
    const view = render(
      <DiceTrayPresentation {...props([request()], { onComplete })} />
    );
    view.rerender(
      <DiceTrayPresentation
        {...props([request(), release()], { onComplete })}
      />
    );

    act(() => latestTray().onFailure?.('die:rerolled', 'provider failed'));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(screen.getAllByTestId('mock-semantic-roll-group')).toHaveLength(1);
    expect(onComplete.mock.calls[0][0]).toMatchObject({
      renderer: 'semantic',
    });
  });

  it('generation-fences late release, settlement, failure, and timer callbacks after presentation replacement', () => {
    vi.useFakeTimers();
    try {
      const onReleaseRequest = vi.fn();
      const onComplete = vi.fn();
      const onAttachmentDiagnostic = vi.fn();
      const firstRelease = release();
      const view = render(
        <DiceTrayPresentation
          {...props([request(), firstRelease], {
            onReleaseRequest,
            onComplete,
            onAttachmentDiagnostic,
          })}
        />
      );
      const oldTray = latestTray();
      act(() => oldTray.onOriginalsSettled?.());

      view.rerender(
        <DiceTrayPresentation
          {...props([request('damage:2')], {
            onReleaseRequest,
            onComplete,
            onAttachmentDiagnostic,
          })}
        />
      );
      const currentTray = latestTray();
      expect(currentTray.rendererGeneration).not.toBe(
        oldTray.rendererGeneration
      );

      act(() => {
        oldTray.onReleaseRequest?.(neutralProfile(44));
        oldTray.onOriginalsSettled?.();
        oldTray.onFailure?.('die:one', 'late failure');
        oldTray.onAttachmentDiagnostic?.({
          presentationId: oldTray.presentationId,
          rendererGeneration: oldTray.rendererGeneration,
          dieId: 'die:one',
          projectedAnchor: [10, 20],
          heldPoseApplied: true,
          frameSequence: 1,
        });
        vi.runAllTimers();
      });

      expect(onReleaseRequest).not.toHaveBeenCalled();
      expect(onAttachmentDiagnostic).not.toHaveBeenCalled();
      expect(currentTray.phase).toBe('armed');
      expect(onComplete).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('forwards only current-generation rendered attachment facts and strips raw pointer fields', () => {
    const onAttachmentDiagnostic = vi.fn();
    render(
      <DiceTrayPresentation
        {...props([request()], { onAttachmentDiagnostic })}
      />
    );
    const tray = latestTray();

    act(() => {
      tray.onAttachmentDiagnostic?.({
        presentationId: tray.presentationId,
        rendererGeneration: tray.rendererGeneration - 1,
        dieId: 'die:rerolled',
        projectedAnchor: [12, 34],
        heldPoseApplied: true,
        frameSequence: 1,
      });
    });
    expect(onAttachmentDiagnostic).not.toHaveBeenCalled();

    act(() => {
      tray.onAttachmentDiagnostic?.({
        presentationId: tray.presentationId,
        rendererGeneration: tray.rendererGeneration,
        dieId: 'die:rerolled',
        projectedAnchor: [12, 34],
        heldPoseApplied: true,
        frameSequence: 2,
        pointerId: 77,
        clientX: 12,
      } as Parameters<
        NonNullable<RollGroupTray3DProps['onAttachmentDiagnostic']>
      >[0]);
    });

    expect(onAttachmentDiagnostic).toHaveBeenCalledTimes(1);
    const diagnostic = onAttachmentDiagnostic.mock.calls[0][0];
    expect(diagnostic).toEqual({
      presentationId: 'damage:1',
      groupKey: 'damage',
      witnessRole: 'roller',
      rendererGeneration: tray.rendererGeneration,
      dieId: 'die:rerolled',
      projectedAnchor: [12, 34],
      heldPoseApplied: true,
      frameSequence: 2,
    });
    expect(JSON.stringify(diagnostic)).not.toMatch(
      /pointer|clientX|clientY|timeMs|samples/i
    );
  });
});
