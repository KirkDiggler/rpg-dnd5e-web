import { sessionPresentationClient } from '@/api/client';
import { create } from '@bufbuild/protobuf';
import {
  DiceBodyInitialSchema,
  DiceBodyTerminalSchema,
  DicePhysicsSchema,
  DiceShape,
  DiceTerminalKind,
  DiceThrowDraftSchema,
  RigidBodyStateSchema,
  ThrowTerminalSchema,
  type DiceThrowDraft,
  type DiceThrowPlan,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/presentation/v1alpha1/service_pb';
import type {
  LocalWorldDiePlanTerminal,
  LocalWorldDieRigidBodyState,
} from './localWorldDiePreSimulation';

interface PublishClient {
  publishDiceThrow(input: {
    session: string;
    member: string;
    draft?: DiceThrowDraft;
  }): Promise<{ plan?: DiceThrowPlan }>;
}

function wireState(state: LocalWorldDieRigidBodyState) {
  return create(RigidBodyStateSchema, {
    position: state.position,
    rotation: state.rotation,
    linearVelocity: state.linearVelocity,
    angularVelocity: state.angularVelocity,
  });
}

export function localWorldDieDraft(
  input: Readonly<{
    presentationId: string;
    authoritySeq: bigint;
    attempt: number;
    plan: LocalWorldDiePlanTerminal;
  }>
): DiceThrowDraft {
  return create(DiceThrowDraftSchema, {
    schemaVersion: 1,
    presentationId: input.presentationId,
    authoritySeq: input.authoritySeq,
    attempt: input.attempt,
    physicsSchema: DicePhysicsSchema.RAPIER_DUNGEON_D20_V1,
    colliderFingerprint: new Uint8Array(input.plan.fingerprint),
    bodies: [
      create(DiceBodyInitialSchema, {
        dieId: 'attack-d20',
        shape: DiceShape.D20,
        state: wireState(input.plan.initialState),
      }),
    ],
    contacts: [],
    terminal: create(ThrowTerminalSchema, {
      dice: [
        create(DiceBodyTerminalSchema, {
          dieId: 'attack-d20',
          step: input.plan.step,
          kind:
            input.plan.kind === 'settled'
              ? DiceTerminalKind.SETTLED
              : DiceTerminalKind.OFF_TABLE,
          state: wireState(input.plan.terminalState),
        }),
      ],
    }),
  });
}

export async function publishLocalWorldDie(
  input: Readonly<{
    session: string;
    member: string;
    presentationId: string;
    authoritySeq: bigint;
    attempt: number;
    plan: LocalWorldDiePlanTerminal;
  }>,
  client: PublishClient = sessionPresentationClient
): Promise<Readonly<{ roundTripMs: number; accepted: DiceThrowPlan }>> {
  const draft = localWorldDieDraft(input);
  const started = performance.now();
  const response = await client.publishDiceThrow({
    session: input.session,
    member: input.member,
    draft,
  });
  const accepted = response.plan;
  if (
    !accepted ||
    accepted.session !== input.session ||
    accepted.roller !== input.member ||
    accepted.presentationId !== input.presentationId ||
    accepted.authoritySeq !== input.authoritySeq ||
    accepted.attempt !== input.attempt
  ) {
    throw new Error('mismatched accepted local dice plan');
  }
  return Object.freeze({
    roundTripMs: performance.now() - started,
    accepted,
  });
}
