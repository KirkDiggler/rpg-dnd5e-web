import { create } from '@bufbuild/protobuf';
import {
  DiceThrowPlanSchema,
  type DiceThrowDraft,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/presentation/v1alpha1/service_pb';
import { describe, expect, it, vi } from 'vitest';
import type { LocalWorldDiePlanTerminal } from './localWorldDiePreSimulation';
import { publishLocalWorldDie } from './localWorldDiePublish';

const state = {
  position: { x: 1, y: 1.25, z: 2 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  linearVelocity: { x: 1, y: 0.8, z: 0 },
  angularVelocity: { x: 0, y: 0, z: -1 },
};

function acceptedPlan(draft: DiceThrowDraft, session: string, roller: string) {
  return create(DiceThrowPlanSchema, {
    schemaVersion: draft.schemaVersion,
    session,
    presentationId: draft.presentationId,
    authoritySeq: draft.authoritySeq,
    roller,
    attempt: draft.attempt,
    physicsSchema: draft.physicsSchema,
    colliderFingerprint: draft.colliderFingerprint,
    bodies: draft.bodies,
    contacts: draft.contacts,
    terminal: draft.terminal,
  });
}

function plan(): LocalWorldDiePlanTerminal {
  return {
    kind: 'settled',
    step: 42,
    elapsedMs: 4,
    fingerprint: new Uint8Array(32).fill(7),
    initialState: state,
    terminalState: {
      ...state,
      linearVelocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
    },
  };
}

describe('publishLocalWorldDie', () => {
  it('publishes one bounded one-d20 draft and accepts the server-bound plan', async () => {
    let sent: DiceThrowDraft | undefined;
    const publishDiceThrow = vi.fn(async (input) => {
      sent = input.draft;
      return {
        plan: acceptedPlan(input.draft!, input.session, input.member),
      };
    });

    const result = await publishLocalWorldDie(
      {
        session: 'session-1',
        member: 'fighter-1',
        presentationId: 'session:session-1:42',
        authoritySeq: 42n,
        attempt: 1,
        plan: plan(),
      },
      { publishDiceThrow }
    );

    expect(publishDiceThrow).toHaveBeenCalledTimes(1);
    expect(sent).toMatchObject({
      schemaVersion: 1,
      presentationId: 'session:session-1:42',
      authoritySeq: 42n,
      attempt: 1,
    });
    expect(sent?.colliderFingerprint).toHaveLength(32);
    expect(sent?.bodies).toHaveLength(1);
    expect(sent?.contacts).toHaveLength(0);
    expect(sent?.terminal?.dice).toHaveLength(1);
    expect(result.accepted.session).toBe('session-1');
    expect(result.accepted.roller).toBe('fighter-1');
    expect(result.roundTripMs).toBeGreaterThanOrEqual(0);
  });

  it('rejects a response bound to another roller', async () => {
    await expect(
      publishLocalWorldDie(
        {
          session: 'session-1',
          member: 'fighter-1',
          presentationId: 'session:session-1:42',
          authoritySeq: 42n,
          attempt: 1,
          plan: plan(),
        },
        {
          publishDiceThrow: async (input) => ({
            plan: acceptedPlan(input.draft!, input.session, 'someone-else'),
          }),
        }
      )
    ).rejects.toThrow(/mismatched/);
  });
});
