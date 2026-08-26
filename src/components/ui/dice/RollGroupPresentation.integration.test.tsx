import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiceRollGroupEvent } from './diceRollGroupEvent';
import {
  DiceTrayPresentation,
  type DiceRollGroupPresentationProps,
} from './DiceTrayPresentation';

const originalGetContext = Object.getOwnPropertyDescriptor(
  HTMLCanvasElement.prototype,
  'getContext'
);

function request(): DiceRollGroupEvent {
  return {
    schemaVersion: 1,
    type: 'dice-roll-group-requested',
    eventId: 'request:actual-webgl-failure',
    presentationId: 'damage:actual-webgl-failure',
    roller: { memberId: 'member:roller', role: 'player' },
    group: {
      key: 'damage',
      dice: [
        {
          id: 'die:webgl-failure',
          kind: 'd20',
          presetId: 'dice.original.carved.d20',
          setId: 'set:1',
          originalFace: 7,
          finalFace: 7,
          rerolls: [],
          disposition: 'counted',
          sourceRef: 'source:weapon',
          sourceLabel: 'Weapon damage',
          contributorMemberId: 'member:roller',
          purpose: 'base',
        },
      ],
      modifiers: [],
      suppliedFinalTotal: 7,
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
    appearances: [
      {
        dieId: 'die:webgl-failure',
        treatment: {
          bodyColor: '#15233b',
          numeralColor: '#f5eddc',
          roughness: 0.72,
          metalness: 0.08,
        },
      },
    ],
    reducedMotion: true,
    ...overrides,
  };
}

beforeEach(() => {
  class TestResizeObserver {
    private readonly callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element) {
      this.callback(
        [
          {
            target,
            contentRect: {
              x: 0,
              y: 0,
              top: 0,
              right: 320,
              bottom: 220,
              left: 0,
              width: 320,
              height: 220,
              toJSON: () => ({}),
            },
          } as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver
      );
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => null),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalGetContext)
    Object.defineProperty(
      HTMLCanvasElement.prototype,
      'getContext',
      originalGetContext
    );
});

describe('RollGroupPresentation actual renderer failure integration', () => {
  it('converts real WebGL unavailability to an armed semantic release path and append-only completion', async () => {
    const requested = request();
    const onReleaseRequest = vi.fn();
    const onComplete = vi.fn();
    const view = render(
      <DiceTrayPresentation
        {...props([requested], { onReleaseRequest, onComplete })}
      />
    );

    await waitFor(() =>
      expect(screen.getByTestId('semantic-roll-group')).toBeTruthy()
    );
    expect(screen.getByText('d20 ?')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Roll dice' }));
    expect(onReleaseRequest).toHaveBeenCalledTimes(1);
    expect(screen.getByText('d20 ?')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();

    const released = structuredClone(onReleaseRequest.mock.calls[0][0]);
    view.rerender(
      <DiceTrayPresentation
        {...props([requested, released], { onReleaseRequest, onComplete })}
      />
    );

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete.mock.calls[0][0]).toMatchObject({
      presentationId: 'damage:actual-webgl-failure',
      groupKey: 'damage',
      witnessRole: 'roller',
      renderer: 'semantic',
    });
    expect(screen.getByText('d20 7')).toBeTruthy();
  });
});
