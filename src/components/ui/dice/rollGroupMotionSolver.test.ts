import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import type { AnchoredHeldRollGroupState } from './anchoredRollGroupGestureController';
import type { QuaternionTuple } from './attackDieContract';
import {
  angularDistanceDegrees,
  ChoreographedSolverV1,
} from './choreographedDiceMotion';
import type { DiceMotionPose } from './diceMotionSolver';
import type { RollGroupMemberLayout } from './rollGroupLayout';
import {
  ROLL_GROUP_FEEL_PROFILES,
  solveRollGroupMemberMotion,
  type RollGroupFeelProfile,
} from './rollGroupMotionSolver';
import { createTrayPlaneProjection } from './trayPlaneProjection';
import { createVisualThrowProfile } from './visualThrowProfile';

const TARGET = Object.freeze([0, 0, 0, 1] as const);
const THROW_PROFILE = createVisualThrowProfile({
  releasePosition: [0.25, 0.75],
  releaseDirection: [0.6, 0.8],
  releaseSpeed: 0.7,
  shakeEnergy: 0.55,
  spinBias: -0.3,
  motionSeed: 0x1234_5678,
});
const HELD = Object.freeze({
  anchor: [0.1, -0.05],
  pointerPlane: [0.1, -0.05],
  planePosition: [0.0576, -0.0416],
  normalizedPosition: [0.58, 0.42],
  normalizedTilt: [0.6, -0.35],
  shakeEnergy: 0.4,
  wobblePhase: 0.3,
  grabbedDieId: 'die:2',
} satisfies AnchoredHeldRollGroupState);
const HELD_LAYOUT = Object.freeze({
  dieId: 'die:2',
  center: [0.12, -0.04],
  radius: 0.12,
} satisfies RollGroupMemberLayout);
const RESTING_LAYOUT = Object.freeze({
  dieId: 'die:2',
  center: [-0.28, 0.09],
  radius: 0.12,
} satisfies RollGroupMemberLayout);

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

function translationDistance(first: DiceMotionPose, second: DiceMotionPose) {
  return Math.hypot(
    first.translation[0] - second.translation[0],
    first.translation[1] - second.translation[1],
    first.translation[2] - second.translation[2]
  );
}

function expectedRestTranslation(layout: RollGroupMemberLayout) {
  return [layout.center[0], 0, layout.center[1]] as const;
}

function motionInput(
  profile: RollGroupFeelProfile,
  overrides: Partial<Parameters<typeof solveRollGroupMemberMotion>[0]> = {}
): Parameters<typeof solveRollGroupMemberMotion>[0] {
  return {
    profile,
    phase: 'rolling-originals',
    elapsedMs: profile.durationMs * 0.5,
    reducedMotion: false,
    target: TARGET,
    throwProfile: THROW_PROFILE,
    memberIndex: 1,
    memberCount: 3,
    held: HELD,
    affectedByCurrentReroll: true,
    heldLayout: HELD_LAYOUT,
    restingLayout: RESTING_LAYOUT,
    ...overrides,
  };
}

describe('rollGroupMotionSolver', () => {
  it.each(Object.values(ROLL_GROUP_FEEL_PROFILES))(
    'returns byte-equal deterministic poses for %s',
    (profile) => {
      const input = motionInput(profile);
      const first = solveRollGroupMemberMotion(input);

      expect(solveRollGroupMemberMotion(input)).toEqual(first);
      expect(solveRollGroupMemberMotion({ ...input })).toEqual(first);
      expectFinitePose(first);
    }
  );

  it.each(Object.values(ROLL_GROUP_FEEL_PROFILES))(
    'settles %s to the supplied quaternion and exact resting layout',
    (profile) => {
      const pose = solveRollGroupMemberMotion(
        motionInput(profile, {
          phase: 'settled-final',
          elapsedMs: profile.durationMs + 1,
        })
      );

      expect(pose.quaternion).toBe(TARGET);
      expect(pose.translation).toEqual(expectedRestTranslation(RESTING_LAYOUT));
      expect(pose.observeNow).toBe(true);
      expect(pose.exactTargetHeld).toBe(true);
      expect(pose.failed).toBe(false);
    }
  );

  it.each([0.25, 0.5, 0.75])(
    'keeps Weighty, Energetic, and Physical materially separated at %.0f%% elapsed',
    (progress) => {
      const weighty = solveRollGroupMemberMotion(
        motionInput(ROLL_GROUP_FEEL_PROFILES.weighty, {
          elapsedMs: ROLL_GROUP_FEEL_PROFILES.weighty.durationMs * progress,
        })
      );
      const energetic = solveRollGroupMemberMotion(
        motionInput(ROLL_GROUP_FEEL_PROFILES.energetic, {
          elapsedMs: ROLL_GROUP_FEEL_PROFILES.energetic.durationMs * progress,
        })
      );
      const physical = solveRollGroupMemberMotion(
        motionInput(ROLL_GROUP_FEEL_PROFILES.physical, {
          elapsedMs: ROLL_GROUP_FEEL_PROFILES.physical.durationMs * progress,
        })
      );

      expect(
        translationDistance(weighty, energetic) > 0.03 ||
          angularDistanceDegrees(weighty.quaternion, energetic.quaternion) > 4
      ).toBe(true);
      expect(
        translationDistance(weighty, physical) > 0.03 ||
          angularDistanceDegrees(weighty.quaternion, physical.quaternion) > 4
      ).toBe(true);
      expect(
        translationDistance(energetic, physical) > 0.03 ||
          angularDistanceDegrees(energetic.quaternion, physical.quaternion) > 4
      ).toBe(true);
    }
  );

  it('uses the retained group plane position instead of reconstructing it from fixed extents', () => {
    const pose = solveRollGroupMemberMotion(
      motionInput(ROLL_GROUP_FEEL_PROFILES.weighty, {
        phase: 'held',
        elapsedMs: 0,
        held: {
          ...HELD,
          planePosition: [0.2, -0.1],
          pointerPlane: [0.3, -0.2],
        } as AnchoredHeldRollGroupState,
      })
    );

    expect(pose.translation[0]).toBeCloseTo(0.32, 12);
    expect(pose.translation[2]).toBeCloseTo(-0.14, 12);
  });

  it('maps exact tray-plane held extents to the same solver position and direction', () => {
    const camera = new PerspectiveCamera(35, 720 / 520, 0.1, 100);
    camera.position.set(0, 3, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const projection = createTrayPlaneProjection({
      camera,
      viewport: { left: 0, top: 0, width: 720, height: 520 },
      origin: [0, 0, 0],
      xAxis: [1, 0, 0],
      yAxis: [0, 0, 1],
      width: 0.72,
      height: 0.52,
    })!;
    const screen = projection.planeToScreen([0.36, 0.26])!;
    const plane = projection.screenToPlane(screen[0], screen[1])!;
    const normalized = projection.planeToNormalized(plane)!;
    expect(normalized[0]).toBeCloseTo(1, 12);
    expect(normalized[1]).toBeCloseTo(1, 12);

    const heldPose = solveRollGroupMemberMotion(
      motionInput(ROLL_GROUP_FEEL_PROFILES.weighty, {
        phase: 'held',
        elapsedMs: 0,
        held: {
          ...HELD,
          planePosition: [0.36, 0.26],
          normalizedPosition: normalized,
        },
      })
    );
    expect(heldPose.translation[0] - HELD_LAYOUT.center[0]).toBeCloseTo(
      0.36,
      8
    );
    expect(heldPose.translation[2] - HELD_LAYOUT.center[1]).toBeCloseTo(
      0.26,
      8
    );
  });

  it('keeps release-position and direction Y aligned with tray-plane Z', () => {
    const downward = createVisualThrowProfile({
      releasePosition: [0.5, 1],
      releaseDirection: [0, 1],
      releaseSpeed: 1,
      shakeEnergy: 0,
      spinBias: 0,
      motionSeed: 17,
    });
    const start = solveRollGroupMemberMotion(
      motionInput(ROLL_GROUP_FEEL_PROFILES.weighty, {
        elapsedMs: 0,
        memberIndex: 0,
        memberCount: 1,
        heldLayout: { ...HELD_LAYOUT, center: [0, 0] },
        restingLayout: { ...RESTING_LAYOUT, center: [0, 0] },
        held: { ...HELD, planePosition: [0, 0] },
        throwProfile: downward,
      })
    );

    expect(start.translation[2]).toBeGreaterThan(0);
  });

  it('settles reduced-motion rolling directly without travel or tumble', () => {
    const pose = solveRollGroupMemberMotion(
      motionInput(ROLL_GROUP_FEEL_PROFILES.energetic, {
        reducedMotion: true,
        elapsedMs: 1,
      })
    );

    expect(pose.quaternion).toBe(TARGET);
    expect(pose.translation).toEqual(expectedRestTranslation(RESTING_LAYOUT));
    expect(pose.observeNow).toBe(true);
    expect(pose.exactTargetHeld).toBe(true);
    expect(pose.failed).toBe(false);
  });

  it('moves only rerolled members and leaves unaffected members at their exact current pose', () => {
    const unaffected = solveRollGroupMemberMotion(
      motionInput(ROLL_GROUP_FEEL_PROFILES.physical, {
        phase: 'rerolling',
        elapsedMs: ROLL_GROUP_FEEL_PROFILES.physical.rerollDurationMs * 0.5,
        affectedByCurrentReroll: false,
      })
    );
    const affected = solveRollGroupMemberMotion(
      motionInput(ROLL_GROUP_FEEL_PROFILES.physical, {
        phase: 'rerolling',
        elapsedMs: ROLL_GROUP_FEEL_PROFILES.physical.rerollDurationMs * 0.5,
        affectedByCurrentReroll: true,
      })
    );

    expect(unaffected.quaternion).toBe(TARGET);
    expect(unaffected.translation).toEqual(
      expectedRestTranslation(RESTING_LAYOUT)
    );
    expect(unaffected.observeNow).toBe(true);
    expect(unaffected.exactTargetHeld).toBe(true);
    expect(affected.translation).not.toEqual(unaffected.translation);
    expect(affected.quaternion).not.toEqual(unaffected.quaternion);
    expect(affected.failed).toBe(false);
  });

  it.each([
    motionInput(ROLL_GROUP_FEEL_PROFILES.weighty, { memberIndex: -1 }),
    motionInput(ROLL_GROUP_FEEL_PROFILES.weighty, { memberIndex: 3 }),
    motionInput(ROLL_GROUP_FEEL_PROFILES.weighty, { memberCount: 0 }),
    motionInput(ROLL_GROUP_FEEL_PROFILES.weighty, { elapsedMs: Number.NaN }),
    motionInput(ROLL_GROUP_FEEL_PROFILES.weighty, { elapsedMs: -1 }),
    motionInput({
      ...ROLL_GROUP_FEEL_PROFILES.weighty,
      durationMs: 0,
    } as RollGroupFeelProfile),
    motionInput(ROLL_GROUP_FEEL_PROFILES.weighty, {
      target: [0, 0, 0, Number.POSITIVE_INFINITY] as QuaternionTuple,
    }),
  ])(
    'fails malformed motion input without leaking non-finite output',
    (input) => {
      const pose = solveRollGroupMemberMotion(input);

      expect(pose.failed).toBe(true);
      expect(pose.observeNow).toBe(false);
      expect(pose.exactTargetHeld).toBe(false);
      expectFinitePose(pose);
    }
  );

  it('keeps ChoreographedSolverV1 exact for the existing one-d20 rolling mid-flight pose', () => {
    const pose = ChoreographedSolverV1.solve({
      phase: 'rolling',
      elapsedMs: 600,
      reducedMotion: false,
      target: TARGET,
      throwProfile: THROW_PROFILE,
      member: { memberIndex: 0, memberCount: 1 },
    });

    expect(pose).toEqual({
      quaternion: [
        -0.11595819313480168, 0.3828783130939157, -0.08111676936353353,
        0.9128953743640577,
      ],
      translation: [
        -0.16413314017205713, 0.3156138498492469, -0.10967635080232838,
      ],
      shadow: {
        translation: [-0.16413314017205713, 0, -0.10967635080232838],
        scale: 0.8832896126130648,
        opacity: 0.18219307507537658,
      },
      observeNow: false,
      exactTargetHeld: false,
      failed: false,
    });
  });
});
