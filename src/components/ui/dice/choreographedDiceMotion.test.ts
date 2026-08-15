import { describe, expect, it } from 'vitest';
import {
  angularDistanceDegrees,
  ChoreographedSolverV1,
  CONVERGENCE_START_MS,
  HOLD_LIFT,
  NEUTRAL_QUATERNION,
  RESTING_TRANSLATION,
  ROLL_DURATION_MS,
} from './choreographedDiceMotion';
import type { DiceMotionPose, DiceMotionSolverInput } from './diceMotionSolver';
import type { HeldRollGroupState } from './rollGroupGestureController';
import {
  createNeutralVisualThrowProfile,
  createVisualThrowProfile,
  type VisualThrowProfileV1,
} from './visualThrowProfile';

const TARGET = Object.freeze([0, 0, 0, 1] as const);
const MEMBER = Object.freeze({ memberIndex: 0, memberCount: 1 } as const);

function profileA(): VisualThrowProfileV1 {
  return createVisualThrowProfile({
    releasePosition: [0.25, 0.75],
    releaseDirection: [0.6, 0.8],
    releaseSpeed: 0.7,
    shakeEnergy: 0.55,
    spinBias: -0.3,
    motionSeed: 0x1234_5678,
  });
}

function profileB(): VisualThrowProfileV1 {
  return createVisualThrowProfile({
    releasePosition: [0.8, 0.2],
    releaseDirection: [-0.8, 0.6],
    releaseSpeed: 0.3,
    shakeEnergy: 0.2,
    spinBias: 0.65,
    motionSeed: 0x8765_4321,
  });
}

function rollingInput(
  overrides: Partial<DiceMotionSolverInput> = {}
): DiceMotionSolverInput {
  return {
    phase: 'rolling',
    elapsedMs: 0,
    reducedMotion: false,
    target: TARGET,
    throwProfile: profileA(),
    member: MEMBER,
    ...overrides,
  };
}

function heldState(
  overrides: Partial<HeldRollGroupState> = {}
): HeldRollGroupState {
  return {
    normalizedPosition: [0.9, 0.2],
    normalizedTilt: [0.7, -0.4],
    shakeEnergy: 0.65,
    wobblePhase: 0.3,
    ...overrides,
  };
}

function expectFiniteTuple(tuple: readonly number[], length: number): void {
  expect(tuple).toHaveLength(length);
  for (let index = 0; index < length; index += 1) {
    expect(Object.hasOwn(tuple, index)).toBe(true);
    expect(typeof tuple[index]).toBe('number');
    expect(Number.isFinite(tuple[index])).toBe(true);
  }
}

function expectFinitePose(pose: DiceMotionPose): void {
  expectFiniteTuple(pose.quaternion, 4);
  expectFiniteTuple(pose.translation, 3);
  expectFiniteTuple(pose.shadow.translation, 3);
  expect(Number.isFinite(pose.shadow.scale)).toBe(true);
  expect(Number.isFinite(pose.shadow.opacity)).toBe(true);
}

describe('ChoreographedSolverV1', () => {
  it('publishes the exact v1 constants and revision', () => {
    expect(ChoreographedSolverV1.revision).toBe('choreographed-v1');
    expect(ROLL_DURATION_MS).toBe(1900);
    expect(CONVERGENCE_START_MS).toBe(1200);
    expect(HOLD_LIFT).toBe(0.16);
    expect(RESTING_TRANSLATION).toEqual([-0.23, 0, 0]);
    expect(NEUTRAL_QUATERNION).toEqual([0.31, -0.47, 0.19, 0.805]);
  });

  it.each([0, 120, 600, 1199, 1200, 1500, 1899, 1900, 2200])(
    'is deterministic at elapsed %d ms',
    (elapsedMs) => {
      const input = rollingInput({ elapsedMs });
      const first = ChoreographedSolverV1.solve(input);

      expect(ChoreographedSolverV1.solve(input)).toEqual(first);
      expect(ChoreographedSolverV1.solve({ ...input })).toEqual(first);
      expectFinitePose(first);
    }
  );

  it.each([
    { memberIndex: -1, memberCount: 1 },
    { memberIndex: 1, memberCount: 1 },
    { memberIndex: 0, memberCount: 0 },
    { memberIndex: 0, memberCount: 2 },
  ])('fails safely for unsupported Stone 1 descriptor %j', (member) => {
    const pose = ChoreographedSolverV1.solve(rollingInput({ member }));

    expect(pose.failed).toBe(true);
    expect(pose.observeNow).toBe(false);
    expect(pose.exactTargetHeld).toBe(false);
    expectFinitePose(pose);
  });

  it('uses profile facts in flight and the identical target at settlement', () => {
    const firstMidFlight = ChoreographedSolverV1.solve(
      rollingInput({ elapsedMs: 600, throwProfile: profileA() })
    );
    const secondMidFlight = ChoreographedSolverV1.solve(
      rollingInput({ elapsedMs: 600, throwProfile: profileB() })
    );

    expect(firstMidFlight.translation).not.toEqual(secondMidFlight.translation);
    expect(firstMidFlight.quaternion).not.toEqual(secondMidFlight.quaternion);
    expect(firstMidFlight.shadow).not.toEqual(secondMidFlight.shadow);

    for (const throwProfile of [profileA(), profileB()]) {
      const settled = ChoreographedSolverV1.solve(
        rollingInput({ elapsedMs: ROLL_DURATION_MS, throwProfile })
      );
      expect(settled.quaternion).toBe(TARGET);
      expect(settled.translation).toEqual(RESTING_TRANSLATION);
      expect(settled.observeNow).toBe(true);
      expect(settled.exactTargetHeld).toBe(true);
      expect(settled.failed).toBe(false);
    }
  });

  it('starts at profile release position plus lift and continuously reaches rest', () => {
    const start = ChoreographedSolverV1.solve(rollingInput({ elapsedMs: 0 }));
    const justBeforeRest = ChoreographedSolverV1.solve(
      rollingInput({ elapsedMs: ROLL_DURATION_MS - 1 })
    );
    const rest = ChoreographedSolverV1.solve(
      rollingInput({ elapsedMs: ROLL_DURATION_MS })
    );

    expect(start.translation[0]).toBeCloseTo(-0.2, 15);
    expect(start.translation[1]).toBe(HOLD_LIFT);
    expect(start.translation[2]).toBeCloseTo(-0.1375, 15);
    expect(rest.translation).toBe(RESTING_TRANSLATION);
    expect(
      Math.hypot(
        ...justBeforeRest.translation.map(
          (value, index) => value - RESTING_TRANSLATION[index]
        )
      )
    ).toBeLessThan(0.001);
  });

  it('uses the exact 1200 ms tumble pose as spherical-convergence start', () => {
    const atBoundary = ChoreographedSolverV1.solve(
      rollingInput({ elapsedMs: CONVERGENCE_START_MS })
    );
    const immediatelyAfter = ChoreographedSolverV1.solve(
      rollingInput({ elapsedMs: CONVERGENCE_START_MS + 0.001 })
    );

    expect(atBoundary.exactTargetHeld).toBe(false);
    expect(atBoundary.observeNow).toBe(false);
    expect(
      angularDistanceDegrees(atBoundary.quaternion, immediatelyAfter.quaternion)
    ).toBeLessThan(0.001);
  });

  it.each([1900, 2200, 50_000])(
    'holds the exact target after the rolling deadline at %d ms',
    (elapsedMs) => {
      const pose = ChoreographedSolverV1.solve(rollingInput({ elapsedMs }));

      expect(pose.quaternion).toBe(TARGET);
      expect(pose.translation).toBe(RESTING_TRANSLATION);
      expect(pose.observeNow).toBe(true);
      expect(pose.exactTargetHeld).toBe(true);
      expect(pose.failed).toBe(false);
    }
  );

  it.each(['settled', 'exiting'] as const)(
    'holds target and rest throughout %s',
    (phase) => {
      for (const elapsedMs of [0, 5000]) {
        const pose = ChoreographedSolverV1.solve(
          rollingInput({ phase, elapsedMs })
        );
        expect(pose.quaternion).toBe(TARGET);
        expect(pose.translation).toBe(RESTING_TRANSLATION);
        expect(pose.exactTargetHeld).toBe(true);
        expect(pose.failed).toBe(false);
      }
    }
  );

  it.each(['entering', 'ready'] as const)(
    'maps held state into tray-plane pose during %s',
    (phase) => {
      const pose = ChoreographedSolverV1.solve(
        rollingInput({ phase, held: heldState() })
      );

      expect(pose.translation[0]).toBeCloseTo(0.32, 15);
      expect(pose.translation[1]).toBe(HOLD_LIFT);
      expect(pose.translation[2]).toBeCloseTo(0.165, 15);
      expect(pose.quaternion).not.toEqual(NEUTRAL_QUATERNION);
      expect(pose.shadow.translation[0]).toBeCloseTo(0.32, 15);
      expect(pose.shadow.translation[1]).toBe(0);
      expect(pose.shadow.translation[2]).toBeCloseTo(0.165, 15);
      expect(pose.shadow.scale).toBeGreaterThanOrEqual(0.82);
      expect(pose.shadow.scale).toBeLessThanOrEqual(1.12);
      expect(pose.shadow.opacity).toBeGreaterThanOrEqual(0.14);
      expect(pose.shadow.opacity).toBeLessThanOrEqual(0.34);
      expect(pose.observeNow).toBe(false);
      expect(pose.exactTargetHeld).toBe(false);
      expect(pose.failed).toBe(false);
    }
  );

  it('uses a centered neutral ready pose when there is no held state', () => {
    const pose = ChoreographedSolverV1.solve(
      rollingInput({ phase: 'ready', held: undefined })
    );

    expect(pose.quaternion).toBe(NEUTRAL_QUATERNION);
    expect(pose.translation).toEqual([0, HOLD_LIFT, 0]);
    expect(pose.shadow.translation).toEqual([0, 0, 0]);
  });

  it('uses one centered static held pose for reduced motion regardless of samples', () => {
    const first = ChoreographedSolverV1.solve(
      rollingInput({
        phase: 'ready',
        reducedMotion: true,
        held: heldState(),
      })
    );
    const second = ChoreographedSolverV1.solve(
      rollingInput({
        phase: 'ready',
        reducedMotion: true,
        held: heldState({
          normalizedPosition: [0.1, 0.95],
          normalizedTilt: [-1, 1],
          shakeEnergy: 1,
          wobblePhase: 0.9,
        }),
      })
    );

    expect(first).toEqual(second);
    expect(first.translation).toEqual([0, HOLD_LIFT, 0]);
    expect(first.quaternion).toBe(NEUTRAL_QUATERNION);
  });

  it('settles reduced rolling on the first positive elapsed frame', () => {
    const initial = ChoreographedSolverV1.solve(
      rollingInput({ reducedMotion: true, elapsedMs: 0 })
    );
    const firstPositive = ChoreographedSolverV1.solve(
      rollingInput({ reducedMotion: true, elapsedMs: Number.MIN_VALUE })
    );

    expect(initial.exactTargetHeld).toBe(false);
    expect(firstPositive.quaternion).toBe(TARGET);
    expect(firstPositive.translation).toBe(RESTING_TRANSLATION);
    expect(firstPositive.observeNow).toBe(true);
    expect(firstPositive.exactTargetHeld).toBe(true);
    expect(firstPositive.failed).toBe(false);
  });

  it.each([
    rollingInput({ elapsedMs: Number.NaN }),
    rollingInput({ target: [0, Number.POSITIVE_INFINITY, 0, 1] }),
    rollingInput({
      throwProfile: {
        ...profileA(),
        releaseSpeed: Number.NEGATIVE_INFINITY,
      },
    }),
    rollingInput({
      phase: 'ready',
      held: heldState({ normalizedPosition: [Number.NaN, 0.5] }),
    }),
  ])('fails malformed non-finite input without leaking NaN', (input) => {
    const pose = ChoreographedSolverV1.solve(input);

    expect(pose.failed).toBe(true);
    expect(pose.observeNow).toBe(false);
    expect(pose.exactTargetHeld).toBe(false);
    expectFinitePose(pose);
  });

  it.each([
    {
      label: 'target',
      input: rollingInput({
        elapsedMs: 1500,
        target: Object.assign(new Array<number>(4), {
          3: 1,
        }) as unknown as DiceMotionSolverInput['target'],
      }),
    },
    {
      label: 'profile release position',
      input: rollingInput({
        elapsedMs: 600,
        throwProfile: {
          ...profileA(),
          releasePosition: Object.assign(new Array<number>(2), {
            0: 0.25,
          }) as unknown as VisualThrowProfileV1['releasePosition'],
        },
      }),
    },
    {
      label: 'profile release direction',
      input: rollingInput({
        elapsedMs: 600,
        throwProfile: {
          ...profileA(),
          releaseDirection: Object.assign(new Array<number>(2), {
            0: 1,
          }) as unknown as VisualThrowProfileV1['releaseDirection'],
        },
      }),
    },
    {
      label: 'held position',
      input: rollingInput({
        phase: 'ready',
        held: heldState({
          normalizedPosition: Object.assign(new Array<number>(2), {
            0: 0.5,
          }) as unknown as HeldRollGroupState['normalizedPosition'],
        }),
      }),
    },
    {
      label: 'held tilt',
      input: rollingInput({
        phase: 'ready',
        held: heldState({
          normalizedTilt: Object.assign(new Array<number>(2), {
            0: 0,
          }) as unknown as HeldRollGroupState['normalizedTilt'],
        }),
      }),
    },
  ])(
    'rejects a sparse $label tuple with a structurally finite failed pose',
    ({ input }) => {
      const pose = ChoreographedSolverV1.solve(input);

      expect(pose.failed).toBe(true);
      expectFinitePose(pose);
    }
  );

  it.each([
    {
      label: 'schema version',
      throwProfile: { ...profileA(), schemaVersion: 2 },
    },
    {
      label: 'release position range',
      throwProfile: { ...profileA(), releasePosition: [-0.01, 0.5] },
    },
    {
      label: 'release direction unit length',
      throwProfile: { ...profileA(), releaseDirection: [0.6, 0.7] },
    },
    {
      label: 'speed with zero direction',
      throwProfile: {
        ...profileA(),
        releaseDirection: [0, 0],
        releaseSpeed: 0.5,
      },
    },
    {
      label: 'release speed range',
      throwProfile: { ...profileA(), releaseSpeed: -0.01 },
    },
    {
      label: 'shake energy range',
      throwProfile: { ...profileA(), shakeEnergy: 1.01 },
    },
    {
      label: 'spin bias range',
      throwProfile: { ...profileA(), spinBias: -1.01 },
    },
    {
      label: 'motion seed integer',
      throwProfile: { ...profileA(), motionSeed: 1.5 },
    },
    {
      label: 'motion seed uint32 range',
      throwProfile: { ...profileA(), motionSeed: 0x1_0000_0000 },
    },
  ])('rejects an out-of-domain profile $label', ({ throwProfile }) => {
    const pose = ChoreographedSolverV1.solve(
      rollingInput({
        elapsedMs: 600,
        throwProfile: throwProfile as VisualThrowProfileV1,
      })
    );

    expect(pose.failed).toBe(true);
    expectFinitePose(pose);
  });

  it('rejects a finite extreme profile before it can emit non-finite output', () => {
    const pose = ChoreographedSolverV1.solve(
      rollingInput({
        elapsedMs: 600,
        throwProfile: {
          ...profileA(),
          releaseSpeed: Number.MAX_VALUE,
        },
      })
    );

    expect(pose.failed).toBe(true);
    expectFinitePose(pose);
  });

  it.each([
    {
      label: 'position range',
      held: heldState({ normalizedPosition: [1.01, 0.5] }),
    },
    {
      label: 'tilt range',
      held: heldState({ normalizedTilt: [-1.01, 0] }),
    },
    {
      label: 'shake energy range',
      held: heldState({ shakeEnergy: Number.MAX_VALUE }),
    },
    {
      label: 'wobble phase range',
      held: heldState({ wobblePhase: 1 }),
    },
  ])('rejects an out-of-domain held-state $label', ({ held }) => {
    const pose = ChoreographedSolverV1.solve(
      rollingInput({ phase: 'ready', held })
    );

    expect(pose.failed).toBe(true);
    expectFinitePose(pose);
  });

  it('computes quaternion angular distance without sign ambiguity', () => {
    expect(angularDistanceDegrees([0, 0, 0, 1], [0, 0, 0, -1])).toBe(0);
    expect(angularDistanceDegrees([0, 0, 0, 1], [1, 0, 0, 0])).toBe(180);
  });

  it('keeps neutral profiles deterministic without external state', () => {
    const input = rollingInput({
      elapsedMs: 600,
      throwProfile: createNeutralVisualThrowProfile(42),
    });
    const before = ChoreographedSolverV1.solve(input);

    expect(ChoreographedSolverV1.solve(input)).toEqual(before);
  });

  it('runtime-freezes shared pose tuples so one result cannot corrupt later results', () => {
    const resting = ChoreographedSolverV1.solve(
      rollingInput({ elapsedMs: ROLL_DURATION_MS })
    );
    const neutral = ChoreographedSolverV1.solve(
      rollingInput({ phase: 'ready' })
    );

    const restingMutation = Reflect.set(resting.translation, 0, 99);
    const neutralQuaternionMutation = Reflect.set(neutral.quaternion, 0, 99);
    const centeredLiftMutation = Reflect.set(neutral.translation, 0, 99);
    const nextResting = ChoreographedSolverV1.solve(
      rollingInput({ elapsedMs: ROLL_DURATION_MS })
    );
    const nextNeutral = ChoreographedSolverV1.solve(
      rollingInput({ phase: 'ready' })
    );

    expect(restingMutation).toBe(false);
    expect(neutralQuaternionMutation).toBe(false);
    expect(centeredLiftMutation).toBe(false);
    expect(nextResting.translation).toEqual([-0.23, 0, 0]);
    expect(nextNeutral.quaternion).toEqual([0.31, -0.47, 0.19, 0.805]);
    expect(nextNeutral.translation).toEqual([0, HOLD_LIFT, 0]);
    expectFinitePose(nextResting);
    expectFinitePose(nextNeutral);
  });
});
