import {
  DicePhysicsSchema,
  DiceShape,
  DiceTerminalKind,
  type DiceThrowPlan,
  type RigidBodyState,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/presentation/v1alpha1/service_pb';
import type {
  LocalWorldDiePlanTerminal,
  LocalWorldDieRigidBodyState,
} from './localWorldDiePreSimulation';

export interface LocalWorldDieWitnessPlan {
  readonly presentationId: string;
  readonly authoritySeq: bigint;
  readonly roller: string;
  readonly attempt: number;
  readonly fingerprint: Uint8Array;
  readonly initialState: LocalWorldDieRigidBodyState;
  readonly terminal: LocalWorldDiePlanTerminal;
}

export interface LocalWorldDieWitnessExpectation {
  readonly session: string;
  readonly presentationId: string;
  readonly roller: string;
  readonly attempt: number;
  readonly viewerMember: string;
  readonly fingerprint: Uint8Array;
}

function finiteVector(value: RigidBodyState['position']) {
  if (
    !value ||
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z)
  ) {
    return undefined;
  }
  return Object.freeze({ x: value.x, y: value.y, z: value.z });
}

function finiteState(
  value: RigidBodyState | undefined
): LocalWorldDieRigidBodyState | undefined {
  const position = finiteVector(value?.position);
  const linearVelocity = finiteVector(value?.linearVelocity);
  const angularVelocity = finiteVector(value?.angularVelocity);
  const rotation = value?.rotation;
  if (
    !position ||
    !linearVelocity ||
    !angularVelocity ||
    !rotation ||
    !Number.isFinite(rotation.x) ||
    !Number.isFinite(rotation.y) ||
    !Number.isFinite(rotation.z) ||
    !Number.isFinite(rotation.w)
  ) {
    return undefined;
  }
  const norm = Math.hypot(rotation.x, rotation.y, rotation.z, rotation.w);
  if (Math.abs(norm - 1) > 0.001) return undefined;
  return Object.freeze({
    position,
    rotation: Object.freeze({
      x: rotation.x,
      y: rotation.y,
      z: rotation.z,
      w: rotation.w,
    }),
    linearVelocity,
    angularVelocity,
  });
}

function sameFingerprint(left: Uint8Array, right: Uint8Array) {
  if (left.length !== 32 || right.length !== 32) return false;
  let difference = 0;
  for (let index = 0; index < 32; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
}

/**
 * Strictly narrows a server-bound plan to the visual-only playback subset
 * implemented by the current one-d20 witness checkpoint.
 */
export function admitLocalWorldDieWitnessPlan(
  plan: DiceThrowPlan,
  expected: LocalWorldDieWitnessExpectation
): LocalWorldDieWitnessPlan | undefined {
  if (
    expected.viewerMember === expected.roller ||
    plan.schemaVersion !== 1 ||
    plan.session !== expected.session ||
    plan.presentationId !== expected.presentationId ||
    plan.roller !== expected.roller ||
    plan.attempt !== expected.attempt ||
    plan.physicsSchema !== DicePhysicsSchema.RAPIER_DUNGEON_D20_V1 ||
    !sameFingerprint(plan.colliderFingerprint, expected.fingerprint) ||
    plan.contacts.length !== 0 ||
    plan.bodies.length !== 1 ||
    plan.terminal?.dice.length !== 1
  ) {
    return undefined;
  }

  const body = plan.bodies[0]!;
  const terminalBody = plan.terminal.dice[0]!;
  const kind =
    terminalBody.kind === DiceTerminalKind.SETTLED
      ? 'settled'
      : terminalBody.kind === DiceTerminalKind.OFF_TABLE
        ? 'off-table'
        : undefined;
  const initialState = finiteState(body.state);
  const terminalState = finiteState(terminalBody.state);
  if (
    body.dieId !== 'attack-d20' ||
    body.shape !== DiceShape.D20 ||
    terminalBody.dieId !== body.dieId ||
    !Number.isInteger(terminalBody.step) ||
    terminalBody.step < 1 ||
    terminalBody.step > 180 ||
    !kind ||
    !initialState ||
    !terminalState
  ) {
    return undefined;
  }

  const fingerprint = new Uint8Array(plan.colliderFingerprint);
  const terminal: LocalWorldDiePlanTerminal = Object.freeze({
    kind,
    step: terminalBody.step,
    elapsedMs: 0,
    fingerprint,
    initialState,
    terminalState,
  });
  return Object.freeze({
    presentationId: plan.presentationId,
    authoritySeq: plan.authoritySeq,
    roller: plan.roller,
    attempt: plan.attempt,
    fingerprint,
    initialState,
    terminal,
  });
}
