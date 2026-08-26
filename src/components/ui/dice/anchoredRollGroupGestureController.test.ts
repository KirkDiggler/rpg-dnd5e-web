import { describe, expect, it } from 'vitest';
import {
  createAnchoredRollGroupGestureController,
  type AnchoredRollGroupGestureController,
} from './anchoredRollGroupGestureController';
import type {
  ClientBounds,
  PointerCaptureOwner,
  RollGroupPointerSample,
} from './rollGroupGestureController';
import type { TrayPlaneProjection } from './trayPlaneProjection';
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
    if (this.releaseError) throw this.releaseError;
  }

  lose(pointerId: number): void {
    this.captured.delete(pointerId);
  }
}

const projectionShape: TrayPlaneProjection = {
  screenToPlane(clientX: number, clientY: number) {
    return [clientX, clientY] as const;
  },
  planeToScreen(point: readonly [number, number]) {
    return [point[0], point[1]] as const;
  },
  planeToNormalized(point: readonly [number, number]) {
    return [point[0] / 100, point[1] / 100] as const;
  },
};
const projection = Object.freeze(projectionShape);

type TestHitRegion = Readonly<{
  dieId: string;
  bounds: ClientBounds;
  memberAnchor: readonly [number, number];
  stableIndex: number;
}>;

const bounds = (
  left: number,
  top: number,
  width = 20,
  height = 20
): ClientBounds => ({
  left,
  top,
  width,
  height,
});

const hitRegions: readonly TestHitRegion[] = [
  {
    dieId: 'die:a',
    bounds: bounds(10, 10),
    memberAnchor: [20, 20] as const,
    stableIndex: 0,
  },
  {
    dieId: 'die:b',
    bounds: bounds(100, 10),
    memberAnchor: [110, 20] as const,
    stableIndex: 1,
  },
] as const;

const startSample: RollGroupPointerSample = {
  pointerId: 7,
  clientX: 20,
  clientY: 20,
  timeMs: 0,
};

function beginInput(
  captureTarget: PointerCaptureOwner,
  overrides: Partial<{
    sample: RollGroupPointerSample;
    projection: TrayPlaneProjection;
    hitRegions: readonly TestHitRegion[];
    hitPaddingPx: number;
    motionSeed: number;
  }> = {}
) {
  return {
    sample: startSample,
    captureTarget,
    projection,
    hitRegions,
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

function begin(
  controller: AnchoredRollGroupGestureController,
  captureTarget: PointerCaptureOwner,
  overrides: Parameters<typeof beginInput>[1] = {}
) {
  return controller.begin(beginInput(captureTarget, overrides));
}

describe('createAnchoredRollGroupGestureController', () => {
  it('preserves the exact pointer-minus-member anchor while moving the whole group', () => {
    const controller = createAnchoredRollGroupGestureController();
    const captureTarget = new FakePointerCaptureOwner();
    const held = begin(controller, captureTarget, {
      sample: { ...startSample, clientX: 27, clientY: 23 },
    });

    expect(held).toMatchObject({
      anchor: [7, 3],
      grabbedDieId: 'die:a',
      normalizedPosition: [0.2, 0.2],
      normalizedTilt: [0, 0],
      shakeEnergy: 0,
      wobblePhase: 0,
    });

    const moved = controller.move({
      pointerId: 7,
      clientX: 40,
      clientY: 30,
      timeMs: 16,
    });

    expect(moved?.anchor).toEqual([7, 3]);
    expect(moved?.grabbedDieId).toBe('die:a');
    expect(moved?.normalizedPosition).toEqual([0.33, 0.27]);
    expect(Object.isFrozen(moved)).toBe(true);
    expect(Object.isFrozen(moved?.anchor)).toBe(true);
    expect(Object.isFrozen(moved?.normalizedPosition)).toBe(true);
  });

  it.each([
    ['first member', 20, 20, 'die:a'],
    ['second member', 110, 20, 'die:b'],
  ] as const)(
    'can begin from every keyed hit region: %s',
    (_label, x, y, dieId) => {
      const controller = createAnchoredRollGroupGestureController();
      const captureTarget = new FakePointerCaptureOwner();

      const held = begin(controller, captureTarget, {
        sample: { ...startSample, clientX: x, clientY: y },
      });

      expect(held?.grabbedDieId).toBe(dieId);
      expect(captureTarget.setCalls).toEqual([7]);
    }
  );

  it.each([
    ['mouse', 14, 44, true],
    ['mouse', 14, 44.001, false],
    ['touch', 24, 54, true],
    ['touch', 24, 54.001, false],
  ] as const)(
    'uses the exact caller-provided %s hit padding',
    (_kind, padding, x, accepted) => {
      const controller = createAnchoredRollGroupGestureController();
      const captureTarget = new FakePointerCaptureOwner();

      const held = begin(controller, captureTarget, {
        sample: { ...startSample, clientX: x, clientY: 20 },
        hitPaddingPx: padding,
      });

      expect(held !== undefined).toBe(accepted);
    }
  );

  it('prefers an unpadded member hit, then nearest projected center, then stable index', () => {
    const controller = createAnchoredRollGroupGestureController();
    const captureTarget = new FakePointerCaptureOwner();
    const overlapping = [
      {
        dieId: 'die:far',
        bounds: bounds(0, 0, 10, 10),
        memberAnchor: [20, 20] as const,
        stableIndex: 0,
      },
      {
        dieId: 'die:near',
        bounds: bounds(20, 20, 20, 20),
        memberAnchor: [40, 40] as const,
        stableIndex: 1,
      },
    ] as const;

    expect(
      begin(controller, captureTarget, {
        sample: { ...startSample, clientX: 20, clientY: 20 },
        hitRegions: overlapping,
        hitPaddingPx: 14,
      })?.grabbedDieId
    ).toBe('die:near');

    const nearestController = createAnchoredRollGroupGestureController();
    const nearestTarget = new FakePointerCaptureOwner();
    const paddedOnly = [
      {
        dieId: 'die:nearest',
        bounds: bounds(0, 0, 10, 10),
        memberAnchor: [19, 20] as const,
        stableIndex: 9,
      },
      {
        dieId: 'die:other',
        bounds: bounds(30, 30, 10, 10),
        memberAnchor: [31, 31] as const,
        stableIndex: 1,
      },
    ] as const;
    expect(
      begin(nearestController, nearestTarget, {
        sample: { ...startSample, clientX: 20, clientY: 20 },
        hitRegions: paddedOnly,
        hitPaddingPx: 14,
      })?.grabbedDieId
    ).toBe('die:nearest');

    const tieController = createAnchoredRollGroupGestureController();
    const tieTarget = new FakePointerCaptureOwner();
    const tied = [
      {
        dieId: 'die:stable-7',
        bounds: bounds(0, 0, 10, 10),
        memberAnchor: [10, 10] as const,
        stableIndex: 7,
      },
      {
        dieId: 'die:stable-2',
        bounds: bounds(30, 30, 10, 10),
        memberAnchor: [30, 30] as const,
        stableIndex: 2,
      },
    ] as const;
    expect(
      begin(tieController, tieTarget, {
        sample: { ...startSample, clientX: 20, clientY: 20 },
        hitRegions: tied,
        hitPaddingPx: 14,
      })?.grabbedDieId
    ).toBe('die:stable-2');
  });

  it('snapshots hit regions and projection at pointer-down', () => {
    const mutableProjection = {
      screenToPlane: (x: number, y: number) => [x, y] as const,
      planeToScreen: (point: readonly [number, number]) =>
        [point[0], point[1]] as const,
      planeToNormalized: (point: readonly [number, number]) =>
        [point[0] / 100, point[1] / 100] as const,
    } as {
      -readonly [Key in keyof TrayPlaneProjection]: TrayPlaneProjection[Key];
    };
    const mutableRegions: Array<{
      dieId: string;
      bounds: ClientBounds;
      memberAnchor: readonly [number, number];
      stableIndex: number;
    }> = [
      {
        dieId: 'die:a',
        bounds: bounds(10, 10),
        memberAnchor: [20, 20] as const,
        stableIndex: 0,
      },
    ];
    const controller = createAnchoredRollGroupGestureController();
    const captureTarget = new FakePointerCaptureOwner();
    const held = controller.begin({
      sample: startSample,
      captureTarget,
      projection: mutableProjection,
      hitRegions: mutableRegions,
      hitPaddingPx: 14,
      motionSeed: 0x1234,
    });
    mutableRegions[0] = {
      ...mutableRegions[0],
      dieId: 'die:changed',
      memberAnchor: [99, 99],
    };
    mutableProjection.screenToPlane = (x: number, y: number) =>
      [x + 100, y] as const;

    expect(held?.grabbedDieId).toBe('die:a');
    expect(
      controller.move({ pointerId: 7, clientX: 30, clientY: 30, timeMs: 16 })
    ).toMatchObject({
      grabbedDieId: 'die:a',
      normalizedPosition: [0.3, 0.3],
    });
  });

  it('owns outside movement and release through pointer capture exactly once', () => {
    const controller = createAnchoredRollGroupGestureController();
    const captureTarget = new FakePointerCaptureOwner();
    begin(controller, captureTarget);

    expect(
      controller.move({ pointerId: 7, clientX: 500, clientY: -400, timeMs: 16 })
    ).toBeDefined();
    const profile = controller.release({
      pointerId: 7,
      clientX: 700,
      clientY: -500,
      timeMs: 32,
    });

    expect(profile).toBeDefined();
    expect(parseVisualThrowProfile(profile)).toEqual(profile);
    expect(captureTarget.releaseCalls).toEqual([7]);
    expect(controller.held()).toBeUndefined();
    expect(
      controller.release({ pointerId: 7, clientX: 1, clientY: 1, timeMs: 48 })
    ).toBeUndefined();
    expect(captureTarget.releaseCalls).toEqual([7]);
  });

  it('ignores wrong pointer IDs without mutating the active gesture', () => {
    const controller = createAnchoredRollGroupGestureController();
    const captureTarget = new FakePointerCaptureOwner();
    const initial = begin(controller, captureTarget);
    const hasCalls = captureTarget.hasCalls.length;

    expect(
      controller.move({ pointerId: 8, clientX: 90, clientY: 90, timeMs: 16 })
    ).toBeUndefined();
    expect(
      controller.release({ pointerId: 8, clientX: 90, clientY: 90, timeMs: 16 })
    ).toBeUndefined();
    expect(controller.held()).toBe(initial);
    expect(captureTarget.hasCalls).toHaveLength(hasCalls);
    expect(captureTarget.releaseCalls).toEqual([]);
  });

  it.each([
    ['move', Number.NaN],
    ['move', Number.POSITIVE_INFINITY],
    ['release', Number.NaN],
    ['release', Number.NEGATIVE_INFINITY],
  ] as const)(
    'cleans up when the sample has a non-finite pointer ID: %s/%s',
    (method, pointerId) => {
      const controller = createAnchoredRollGroupGestureController();
      const captureTarget = new FakePointerCaptureOwner();
      begin(controller, captureTarget);

      expect(
        controller[method]({ pointerId, clientX: 30, clientY: 30, timeMs: 16 })
      ).toBeUndefined();
      expect(controller.held()).toBeUndefined();
      expect(captureTarget.releaseCalls).toEqual([7]);
    }
  );

  it('releases capture if a stateful sample getter throws after acquisition', () => {
    let timeReads = 0;
    const sample = {
      pointerId: 7,
      clientX: 20,
      clientY: 20,
      get timeMs() {
        timeReads += 1;
        if (timeReads > 1) throw new Error('sample changed while copying');
        return 0;
      },
    } as RollGroupPointerSample;
    const controller = createAnchoredRollGroupGestureController();
    const captureTarget = new FakePointerCaptureOwner();

    const held = begin(controller, captureTarget, { sample });
    if (held) controller.reset();

    expect(captureTarget.setCalls).toEqual([7]);
    expect(captureTarget.releaseCalls).toEqual([7]);
    expect(controller.held()).toBeUndefined();
  });

  it.each(['cancel', 'reset', 'lost capture'] as const)(
    'cleans up on %s without emitting',
    (ending) => {
      const controller = createAnchoredRollGroupGestureController();
      const captureTarget = new FakePointerCaptureOwner();
      begin(controller, captureTarget);

      if (ending === 'cancel') expect(controller.cancel(7)).toBe(true);
      else if (ending === 'reset') controller.reset();
      else {
        captureTarget.lose(7);
        expect(
          controller.move({
            pointerId: 7,
            clientX: 30,
            clientY: 30,
            timeMs: 16,
          })
        ).toBeUndefined();
      }

      expect(controller.held()).toBeUndefined();
      expect(
        controller.release({
          pointerId: 7,
          clientX: 30,
          clientY: 30,
          timeMs: 32,
        })
      ).toBeUndefined();
      expect(captureTarget.releaseCalls).toHaveLength(
        ending === 'lost capture' ? 0 : 1
      );
    }
  );

  it('fails closed on non-finite samples and capture API failures', () => {
    for (const method of ['move', 'release'] as const) {
      const controller = createAnchoredRollGroupGestureController();
      const captureTarget = new FakePointerCaptureOwner();
      begin(controller, captureTarget);
      const sample = {
        pointerId: 7,
        clientX: method === 'move' ? Number.NaN : 30,
        clientY: 30,
        timeMs: method === 'release' ? Number.POSITIVE_INFINITY : 16,
      };

      expect(() => controller[method](sample)).not.toThrow();
      expect(controller.held()).toBeUndefined();
      expect(captureTarget.releaseCalls).toEqual([7]);
    }

    const setFailure = createAnchoredRollGroupGestureController();
    const setTarget = new FakePointerCaptureOwner();
    setTarget.setError = Error('set failed');
    expect(() => begin(setFailure, setTarget)).not.toThrow();
    expect(setFailure.held()).toBeUndefined();

    const hasFailure = createAnchoredRollGroupGestureController();
    const hasTarget = new FakePointerCaptureOwner();
    begin(hasFailure, hasTarget);
    hasTarget.hasError = Error('has failed');
    expect(() =>
      hasFailure.move({ pointerId: 7, clientX: 30, clientY: 30, timeMs: 16 })
    ).not.toThrow();
    expect(hasFailure.held()).toBeUndefined();
  });

  it('emits one deeply frozen sanitized profile and no raw interaction data', () => {
    const controller = createAnchoredRollGroupGestureController();
    const captureTarget = new FakePointerCaptureOwner();
    const held = begin(controller, captureTarget);
    controller.move({ pointerId: 7, clientX: 30, clientY: 30, timeMs: 16 });
    const profile = controller.release({
      pointerId: 7,
      clientX: 40,
      clientY: 20,
      timeMs: 32,
    });

    expect(profile).toBeDefined();
    expect(Object.isFrozen(held)).toBe(true);
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile?.releasePosition)).toBe(true);
    expect(Object.isFrozen(profile?.releaseDirection)).toBe(true);
    expect(Object.keys(held ?? {})).toEqual([
      'anchor',
      'normalizedPosition',
      'normalizedTilt',
      'shakeEnergy',
      'wobblePhase',
      'grabbedDieId',
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
    const serializedKeys = collectKeys(
      JSON.parse(JSON.stringify({ held, profile }))
    );
    expect(JSON.stringify({ held, profile })).not.toMatch(
      /pointerId|clientX|clientY|timeMs|path|samples/
    );
    for (const denied of [
      'pointerId',
      'clientX',
      'clientY',
      'timeMs',
      'path',
      'samples',
      'captureTarget',
      'projection',
      'hitRegions',
    ]) {
      expect(serializedKeys.has(denied)).toBe(false);
    }
  });
});
