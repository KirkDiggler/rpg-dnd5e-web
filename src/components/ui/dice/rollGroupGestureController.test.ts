import { describe, expect, it, vi } from 'vitest';
import {
  createRollGroupGestureController,
  type PointerCaptureOwner,
  type RollGroupGestureStart,
} from './rollGroupGestureController';
import { parseVisualThrowProfile } from './visualThrowProfile';

class FakePointerCaptureOwner implements PointerCaptureOwner {
  readonly setCalls: number[] = [];
  readonly hasCalls: number[] = [];
  readonly releaseCalls: number[] = [];
  readonly captured = new Set<number>();
  acceptCapture = true;
  setError: Error | undefined;
  hasError: Error | undefined;
  releaseError: Error | undefined;
  onRelease: (() => void) | undefined;

  setPointerCapture(pointerId: number): void {
    this.setCalls.push(pointerId);
    if (this.setError) throw this.setError;
    if (this.acceptCapture) this.captured.add(pointerId);
  }

  hasPointerCapture(pointerId: number): boolean {
    this.hasCalls.push(pointerId);
    if (this.hasError) throw this.hasError;
    return this.captured.has(pointerId);
  }

  releasePointerCapture(pointerId: number): void {
    this.releaseCalls.push(pointerId);
    this.captured.delete(pointerId);
    this.onRelease?.();
    if (this.releaseError) throw this.releaseError;
  }

  lose(pointerId: number): void {
    this.captured.delete(pointerId);
  }
}

const START_SAMPLE = {
  pointerId: 7,
  clientX: 100,
  clientY: 100,
  timeMs: 0,
} as const;

function gestureStart(
  captureTarget: PointerCaptureOwner,
  overrides: Partial<RollGroupGestureStart> = {}
): RollGroupGestureStart {
  return {
    sample: START_SAMPLE,
    captureTarget,
    trayBounds: { left: 0, top: 0, width: 200, height: 160 },
    hitBounds: { left: 60, top: 40, width: 80, height: 80 },
    hitPaddingPx: 14,
    motionSeed: 0x1234,
    ...overrides,
  };
}

function collectKeys(value: unknown, found = new Set<string>()): Set<string> {
  if (value === null || typeof value !== 'object') return found;
  for (const [key, nested] of Object.entries(value)) {
    found.add(key);
    collectKeys(nested, found);
  }
  return found;
}

describe('createRollGroupGestureController', () => {
  it('rejects a start outside expanded hit bounds without requesting capture', () => {
    const controller = createRollGroupGestureController();
    const captureTarget = new FakePointerCaptureOwner();

    const held = controller.begin(
      gestureStart(captureTarget, {
        sample: { ...START_SAMPLE, clientX: 45.999 },
      })
    );

    expect(held).toBeUndefined();
    expect(controller.held()).toBeUndefined();
    expect(captureTarget.setCalls).toEqual([]);
    expect(captureTarget.hasCalls).toEqual([]);
    expect(captureTarget.releaseCalls).toEqual([]);
  });

  it.each([
    ['mouse', 14, 46, 45.999],
    ['touch', 24, 36, 35.999],
  ] as const)(
    'honors the caller-selected %s padding of exactly %s px',
    (_pointerKind, hitPaddingPx, acceptedX, rejectedX) => {
      const acceptedController = createRollGroupGestureController();
      const acceptedTarget = new FakePointerCaptureOwner();
      const rejectedController = createRollGroupGestureController();
      const rejectedTarget = new FakePointerCaptureOwner();

      expect(
        acceptedController.begin(
          gestureStart(acceptedTarget, {
            sample: { ...START_SAMPLE, clientX: acceptedX },
            hitPaddingPx,
          })
        )
      ).toBeDefined();
      expect(acceptedTarget.setCalls).toEqual([7]);

      expect(
        rejectedController.begin(
          gestureStart(rejectedTarget, {
            sample: { ...START_SAMPLE, clientX: rejectedX },
            hitPaddingPx,
          })
        )
      ).toBeUndefined();
      expect(rejectedTarget.setCalls).toEqual([]);
    }
  );

  it('accepts begin only when capture ownership is confirmed after capture is requested', () => {
    const controller = createRollGroupGestureController();
    const captureTarget = new FakePointerCaptureOwner();
    captureTarget.acceptCapture = false;

    expect(controller.begin(gestureStart(captureTarget))).toBeUndefined();
    expect(captureTarget.setCalls).toEqual([7]);
    expect(captureTarget.hasCalls).toEqual([7]);
    expect(controller.held()).toBeUndefined();
  });

  it.each([
    [
      'zero tray width',
      {
        trayBounds: { left: 100, top: 0, width: 0, height: 160 },
      },
    ],
    [
      'zero tray height',
      {
        trayBounds: { left: 0, top: 100, width: 200, height: 0 },
      },
    ],
    [
      'negative tray width',
      {
        trayBounds: { left: 0, top: 0, width: -200, height: 160 },
      },
    ],
    [
      'non-finite tray origin',
      {
        trayBounds: {
          left: Number.NaN,
          top: 0,
          width: 200,
          height: 160,
        },
      },
    ],
    [
      'zero hit width',
      {
        sample: { ...START_SAMPLE, clientX: 60 },
        hitBounds: { left: 60, top: 40, width: 0, height: 80 },
      },
    ],
    [
      'zero hit height',
      {
        sample: { ...START_SAMPLE, clientY: 40 },
        hitBounds: { left: 60, top: 40, width: 80, height: 0 },
      },
    ],
    [
      'non-finite hit origin',
      {
        hitBounds: {
          left: 60,
          top: Number.POSITIVE_INFINITY,
          width: 80,
          height: 80,
        },
      },
    ],
    ['negative padding', { hitPaddingPx: -1 }],
    ['non-finite padding', { hitPaddingPx: Number.NaN }],
    [
      'non-finite pointer ID',
      { sample: { ...START_SAMPLE, pointerId: Number.POSITIVE_INFINITY } },
    ],
    [
      'non-finite client X',
      { sample: { ...START_SAMPLE, clientX: Number.NaN } },
    ],
    [
      'non-finite client Y',
      { sample: { ...START_SAMPLE, clientY: Number.NEGATIVE_INFINITY } },
    ],
    [
      'non-finite sample time',
      { sample: { ...START_SAMPLE, timeMs: Number.NaN } },
    ],
    ['non-finite motion seed', { motionSeed: Number.POSITIVE_INFINITY }],
  ] satisfies ReadonlyArray<readonly [string, Partial<RollGroupGestureStart>]>)(
    'rejects invalid begin input: %s',
    (_label, overrides) => {
      const controller = createRollGroupGestureController();
      const captureTarget = new FakePointerCaptureOwner();

      let held: ReturnType<typeof controller.begin> = undefined;
      expect(() => {
        held = controller.begin(gestureStart(captureTarget, overrides));
      }).not.toThrow();
      expect(held).toBeUndefined();
      expect(controller.held()).toBeUndefined();
      expect(captureTarget.setCalls).toEqual([]);
      expect(captureTarget.hasCalls).toEqual([]);
      expect(captureTarget.releaseCalls).toEqual([]);
    }
  );

  it('returns a deeply frozen centered initial held state with zero motion', () => {
    const controller = createRollGroupGestureController();
    const captureTarget = new FakePointerCaptureOwner();

    const held = controller.begin(
      gestureStart(captureTarget, {
        sample: { ...START_SAMPLE, clientY: 80 },
      })
    );

    expect(held).toEqual({
      normalizedPosition: [0.5, 0.5],
      normalizedTilt: [0, 0],
      shakeEnergy: 0,
      wobblePhase: 0,
    });
    expect(Object.isFrozen(held)).toBe(true);
    expect(Object.isFrozen(held?.normalizedPosition)).toBe(true);
    expect(Object.isFrozen(held?.normalizedTilt)).toBe(true);
    expect(controller.held()).toBe(held);
  });

  it('updates position, filtered tilt, wobble, and monotonically bounded energy', () => {
    const controller = createRollGroupGestureController();
    const captureTarget = new FakePointerCaptureOwner();
    controller.begin(gestureStart(captureTarget));

    const first = controller.move({
      pointerId: 7,
      clientX: 132,
      clientY: 84,
      timeMs: 16,
    });
    const second = controller.move({
      pointerId: 7,
      clientX: 148,
      clientY: 92,
      timeMs: 32,
    });

    const firstDistance = Math.hypot(0.16, -0.1);
    const secondDistance = Math.hypot(0.08, 0.05);
    expect(first?.normalizedPosition[0]).toBeCloseTo(0.66, 12);
    expect(first?.normalizedPosition[1]).toBeCloseTo(0.525, 12);
    expect(first?.normalizedTilt[0]).toBeCloseTo(0.4375, 12);
    expect(first?.normalizedTilt[1]).toBeCloseTo(0.4375, 12);
    expect(first?.shakeEnergy).toBeCloseTo(firstDistance * 0.9, 12);
    expect(first?.wobblePhase).toBeCloseTo((firstDistance * 3) % 1, 12);

    expect(second?.normalizedPosition[0]).toBeCloseTo(0.74, 12);
    expect(second?.normalizedPosition[1]).toBeCloseTo(0.575, 12);
    expect(second?.normalizedTilt[0]).toBeCloseTo(-0.153125, 12);
    expect(second?.normalizedTilt[1]).toBeCloseTo(0.721875, 12);
    expect(second?.shakeEnergy).toBeCloseTo(
      (firstDistance + secondDistance) * 0.9,
      12
    );
    expect(second?.shakeEnergy).toBeGreaterThanOrEqual(
      first?.shakeEnergy ?? Number.POSITIVE_INFINITY
    );
    expect(second?.shakeEnergy).toBeLessThanOrEqual(1);
    expect(second?.wobblePhase).toBeCloseTo(
      ((firstDistance + secondDistance) * 3) % 1,
      12
    );
    expect(Object.isFrozen(second)).toBe(true);
    expect(Object.isFrozen(second?.normalizedPosition)).toBe(true);
    expect(Object.isFrozen(second?.normalizedTilt)).toBe(true);
  });

  it('accumulates more energy for repeated back-and-forth movement than one straight segment', () => {
    const straight = createRollGroupGestureController();
    const straightTarget = new FakePointerCaptureOwner();
    straight.begin(gestureStart(straightTarget));
    const straightHeld = straight.move({
      pointerId: 7,
      clientX: 140,
      clientY: 100,
      timeMs: 48,
    });

    const shaken = createRollGroupGestureController();
    const shakenTarget = new FakePointerCaptureOwner();
    shaken.begin(gestureStart(shakenTarget));
    shaken.move({ pointerId: 7, clientX: 120, clientY: 100, timeMs: 16 });
    shaken.move({ pointerId: 7, clientX: 80, clientY: 100, timeMs: 32 });
    const shakenHeld = shaken.move({
      pointerId: 7,
      clientX: 140,
      clientY: 100,
      timeMs: 48,
    });

    expect(shakenHeld?.normalizedPosition).toEqual(
      straightHeld?.normalizedPosition
    );
    expect(shakenHeld?.shakeEnergy).toBeGreaterThan(
      straightHeld?.shakeEnergy ?? Number.POSITIVE_INFINITY
    );
    expect(shakenHeld?.shakeEnergy).toBeLessThanOrEqual(1);
  });

  it('ignores wrong-pointer move and release without mutating the active gesture', () => {
    const controller = createRollGroupGestureController();
    const captureTarget = new FakePointerCaptureOwner();
    const initial = controller.begin(gestureStart(captureTarget));
    const hasCallsAfterBegin = captureTarget.hasCalls.length;

    expect(
      controller.move({
        pointerId: 8,
        clientX: 132,
        clientY: 84,
        timeMs: 16,
      })
    ).toBeUndefined();
    expect(
      controller.release({
        pointerId: 8,
        clientX: 148,
        clientY: 92,
        timeMs: 32,
      })
    ).toBeUndefined();

    expect(controller.held()).toBe(initial);
    expect(captureTarget.hasCalls).toHaveLength(hasCallsAfterBegin);
    expect(captureTarget.releaseCalls).toEqual([]);
  });

  it.each(['move', 'release'] as const)(
    'terminates matching %s with non-finite sample data without throwing',
    (method) => {
      const controller = createRollGroupGestureController();
      const captureTarget = new FakePointerCaptureOwner();
      controller.begin(gestureStart(captureTarget));
      const invalidSample = {
        pointerId: 7,
        clientX: method === 'move' ? Number.NaN : 148,
        clientY: 92,
        timeMs: method === 'release' ? Number.POSITIVE_INFINITY : 16,
      };
      let result: ReturnType<(typeof controller)[typeof method]> = undefined;

      expect(() => {
        result = controller[method](invalidSample);
      }).not.toThrow();
      expect(result).toBeUndefined();
      expect(controller.held()).toBeUndefined();
      expect(captureTarget.releaseCalls).toEqual([7]);
      controller.reset();
      expect(captureTarget.releaseCalls).toEqual([7]);
    }
  );

  it('ignores an invalid sample from the wrong pointer', () => {
    const controller = createRollGroupGestureController();
    const captureTarget = new FakePointerCaptureOwner();
    const initial = controller.begin(gestureStart(captureTarget));
    const hasCallsAfterBegin = captureTarget.hasCalls.length;

    expect(
      controller.move({
        pointerId: 8,
        clientX: Number.NaN,
        clientY: Number.POSITIVE_INFINITY,
        timeMs: Number.NaN,
      })
    ).toBeUndefined();
    expect(
      controller.release({
        pointerId: 8,
        clientX: Number.NaN,
        clientY: Number.NEGATIVE_INFINITY,
        timeMs: Number.POSITIVE_INFINITY,
      })
    ).toBeUndefined();
    expect(controller.held()).toBe(initial);
    expect(captureTarget.hasCalls).toHaveLength(hasCallsAfterBegin);
    expect(captureTarget.releaseCalls).toEqual([]);
  });

  it('returns a valid deeply frozen profile and releases matching capture exactly once', () => {
    const controller = createRollGroupGestureController();
    const captureTarget = new FakePointerCaptureOwner();
    controller.begin(gestureStart(captureTarget));
    controller.move({
      pointerId: 7,
      clientX: 132,
      clientY: 84,
      timeMs: 16,
    });

    const profile = controller.release({
      pointerId: 7,
      clientX: 148,
      clientY: 92,
      timeMs: 32,
    });

    expect(profile).toBeDefined();
    expect(parseVisualThrowProfile(profile)).toEqual(profile);
    expect(profile?.releasePosition[0]).toBeCloseTo(0.74, 12);
    expect(profile?.releasePosition[1]).toBeCloseTo(0.575, 12);
    expect(profile?.releaseDirection[0]).toBeCloseTo(
      1.7325 / Math.hypot(1.7325, 0.3675),
      12
    );
    expect(profile?.releaseDirection[1]).toBeCloseTo(
      0.3675 / Math.hypot(1.7325, 0.3675),
      12
    );
    expect(profile?.releaseSpeed).toBeCloseTo(
      Math.hypot(1.7325, 0.3675) / 2.4,
      12
    );
    expect(profile?.shakeEnergy).toBeCloseTo(
      (Math.hypot(0.16, -0.1) + Math.hypot(0.08, 0.05)) * 0.9,
      12
    );
    expect(profile?.spinBias).toBeCloseTo(
      0.016 * 6 + (1.7325 / Math.hypot(1.7325, 0.3675)) * 0.2,
      12
    );
    expect(profile?.motionSeed).toBe(0x1234);
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile?.releasePosition)).toBe(true);
    expect(Object.isFrozen(profile?.releaseDirection)).toBe(true);
    expect(controller.held()).toBeUndefined();
    expect(captureTarget.releaseCalls).toEqual([7]);
    expect(
      controller.release({
        pointerId: 7,
        clientX: 148,
        clientY: 92,
        timeMs: 32,
      })
    ).toBeUndefined();
    expect(captureTarget.releaseCalls).toEqual([7]);
  });

  it('uses canonical zero direction below speed 0.02', () => {
    const controller = createRollGroupGestureController();
    const captureTarget = new FakePointerCaptureOwner();
    controller.begin(gestureStart(captureTarget));

    const profile = controller.release({
      pointerId: 7,
      clientX: 100.01,
      clientY: 100,
      timeMs: 100,
    });

    expect(profile?.releaseDirection).toEqual([0, 0]);
    expect(profile?.releaseSpeed).toBe(0);
  });

  it('clears and releases capture when profile creation throws', () => {
    const controller = createRollGroupGestureController();
    const captureTarget = new FakePointerCaptureOwner();
    controller.begin(gestureStart(captureTarget));
    const realHypot = Math.hypot;
    const hypot = vi
      .spyOn(Math, 'hypot')
      .mockImplementationOnce((...values) => realHypot(...values))
      .mockReturnValueOnce(Number.NaN);

    try {
      expect(() =>
        controller.release({
          pointerId: 7,
          clientX: 148,
          clientY: 92,
          timeMs: 32,
        })
      ).toThrow(RangeError);
    } finally {
      hypot.mockRestore();
    }
    expect(controller.held()).toBeUndefined();
    expect(captureTarget.releaseCalls).toEqual([7]);
  });

  it('keeps an active gesture untouched when a duplicate or competing begin arrives', () => {
    const controller = createRollGroupGestureController();
    const firstTarget = new FakePointerCaptureOwner();
    const competingTarget = new FakePointerCaptureOwner();
    const initial = controller.begin(gestureStart(firstTarget));

    expect(
      controller.begin(
        gestureStart(competingTarget, {
          sample: { ...START_SAMPLE, pointerId: 8 },
        })
      )
    ).toBeUndefined();
    expect(controller.held()).toBe(initial);
    expect(firstTarget.releaseCalls).toEqual([]);
    expect(competingTarget.setCalls).toEqual([]);
  });

  it('cancel and presentation-identity reset clear and release active capture once', () => {
    const cancelled = createRollGroupGestureController();
    const cancelledTarget = new FakePointerCaptureOwner();
    cancelled.begin(gestureStart(cancelledTarget));

    expect(cancelled.cancel(8)).toBe(false);
    expect(cancelled.held()).toBeDefined();
    expect(cancelled.cancel(7)).toBe(true);
    expect(cancelled.cancel(7)).toBe(false);
    expect(cancelled.held()).toBeUndefined();
    expect(cancelledTarget.releaseCalls).toEqual([7]);

    const reset = createRollGroupGestureController();
    const resetTarget = new FakePointerCaptureOwner();
    reset.begin(gestureStart(resetTarget));
    reset.reset();
    reset.reset();
    expect(reset.held()).toBeUndefined();
    expect(resetTarget.releaseCalls).toEqual([7]);
  });

  it('clears silently when matching movement observes lost pointer capture', () => {
    const controller = createRollGroupGestureController();
    const captureTarget = new FakePointerCaptureOwner();
    controller.begin(gestureStart(captureTarget));
    captureTarget.lose(7);

    expect(() =>
      controller.move({
        pointerId: 7,
        clientX: 132,
        clientY: 84,
        timeMs: 16,
      })
    ).not.toThrow();
    expect(
      controller.move({
        pointerId: 7,
        clientX: 132,
        clientY: 84,
        timeMs: 16,
      })
    ).toBeUndefined();
    expect(controller.held()).toBeUndefined();
    expect(captureTarget.releaseCalls).toEqual([]);
  });

  it('contains capture API exceptions and always leaves terminal state cleared', () => {
    const setFailure = createRollGroupGestureController();
    const setFailureTarget = new FakePointerCaptureOwner();
    setFailureTarget.setError = new Error('set failed');
    expect(() =>
      setFailure.begin(gestureStart(setFailureTarget))
    ).not.toThrow();
    expect(setFailure.held()).toBeUndefined();

    const hasFailure = createRollGroupGestureController();
    const hasFailureTarget = new FakePointerCaptureOwner();
    hasFailureTarget.hasError = new Error('has failed');
    expect(() =>
      hasFailure.begin(gestureStart(hasFailureTarget))
    ).not.toThrow();
    expect(hasFailure.held()).toBeUndefined();

    const moveFailure = createRollGroupGestureController();
    const moveFailureTarget = new FakePointerCaptureOwner();
    moveFailure.begin(gestureStart(moveFailureTarget));
    moveFailureTarget.hasError = new Error('has failed during move');
    expect(() =>
      moveFailure.move({
        pointerId: 7,
        clientX: 132,
        clientY: 84,
        timeMs: 16,
      })
    ).not.toThrow();
    expect(moveFailure.held()).toBeUndefined();

    const releaseFailure = createRollGroupGestureController();
    const releaseFailureTarget = new FakePointerCaptureOwner();
    releaseFailure.begin(gestureStart(releaseFailureTarget));
    releaseFailureTarget.releaseError = new Error('release failed');
    expect(() =>
      releaseFailure.release({
        pointerId: 7,
        clientX: 148,
        clientY: 92,
        timeMs: 32,
      })
    ).not.toThrow();
    expect(releaseFailure.held()).toBeUndefined();
    expect(releaseFailureTarget.releaseCalls).toEqual([7]);
  });

  it('clears before capture release so reentrant terminal APIs cannot release twice', () => {
    const controller = createRollGroupGestureController();
    const captureTarget = new FakePointerCaptureOwner();
    controller.begin(gestureStart(captureTarget));
    captureTarget.onRelease = () => {
      expect(controller.held()).toBeUndefined();
      expect(controller.cancel(7)).toBe(false);
      controller.reset();
    };

    expect(() =>
      controller.release({
        pointerId: 7,
        clientX: 148,
        clientY: 92,
        timeMs: 32,
      })
    ).not.toThrow();
    expect(captureTarget.releaseCalls).toEqual([7]);
  });

  it('serializes held state and profiles without raw coordinates, time, paths, or pointer identity', () => {
    const controller = createRollGroupGestureController();
    const captureTarget = new FakePointerCaptureOwner();
    controller.begin(gestureStart(captureTarget));
    const held = controller.move({
      pointerId: 7,
      clientX: 132,
      clientY: 84,
      timeMs: 16,
    });
    const profile = controller.release({
      pointerId: 7,
      clientX: 148,
      clientY: 92,
      timeMs: 32,
    });

    const serializedKeys = collectKeys(
      JSON.parse(JSON.stringify({ held, profile }))
    );
    for (const denied of [
      'pointerId',
      'clientX',
      'clientY',
      'timeMs',
      'time',
      'path',
      'sample',
      'captureTarget',
      'trayBounds',
      'hitBounds',
    ]) {
      expect(serializedKeys.has(denied)).toBe(false);
    }
    expect(Object.keys(held ?? {})).toEqual([
      'normalizedPosition',
      'normalizedTilt',
      'shakeEnergy',
      'wobblePhase',
    ]);
    expect(Object.keys(profile ?? {})).toEqual([
      'schemaVersion',
      'releasePosition',
      'releaseDirection',
      'releaseSpeed',
      'shakeEnergy',
      'spinBias',
      'motionSeed',
    ]);
  });
});
