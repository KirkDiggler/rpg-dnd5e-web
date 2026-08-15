import type { DiceTrayPhase } from './DiceTray';
import type { QuaternionTuple } from './attackDieContract';
import type { HeldRollGroupState } from './rollGroupGestureController';
import type { VisualThrowProfileV1 } from './visualThrowProfile';

export interface DiceMotionMemberDescriptor {
  readonly memberIndex: number;
  readonly memberCount: number;
}

export type DiceTranslation = readonly [number, number, number];

export interface DiceShadowPose {
  readonly translation: DiceTranslation;
  readonly scale: number;
  readonly opacity: number;
}

export interface DiceMotionPose {
  readonly quaternion: QuaternionTuple;
  readonly translation: DiceTranslation;
  readonly shadow: DiceShadowPose;
  readonly observeNow: boolean;
  readonly exactTargetHeld: boolean;
  readonly failed: boolean;
}

export interface DiceMotionSolverInput {
  readonly phase: DiceTrayPhase;
  readonly elapsedMs: number;
  readonly reducedMotion: boolean;
  readonly target: QuaternionTuple;
  readonly throwProfile: VisualThrowProfileV1;
  readonly member: DiceMotionMemberDescriptor;
  readonly held?: HeldRollGroupState;
}

export interface DiceMotionSolver {
  readonly revision: 'choreographed-v1';
  solve(input: DiceMotionSolverInput): DiceMotionPose;
}
