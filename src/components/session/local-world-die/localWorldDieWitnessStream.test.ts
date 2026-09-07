import { create } from '@bufbuild/protobuf';
import {
  DicePhysicsSchema,
  DiceThrowPlanSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/presentation/v1alpha1/service_pb';
import { describe, expect, it } from 'vitest';
import { consumeLocalWorldDieWitnessStream } from './localWorldDieWitnessStream';

function plan(presentationId: string) {
  return create(DiceThrowPlanSchema, {
    schemaVersion: 1,
    session: 'session-1',
    presentationId,
    authoritySeq: 42n,
    roller: 'fighter-1',
    attempt: 1,
    physicsSchema: DicePhysicsSchema.RAPIER_DUNGEON_D20_V1,
    colliderFingerprint: new Uint8Array(32),
    bodies: [],
    contacts: [],
  });
}

describe('consumeLocalWorldDieWitnessStream', () => {
  it('forwards live plans and stops forwarding immediately after cancellation', async () => {
    const first = plan('session:session-1:42');
    const afterCancellation = plan('session:session-1:43');
    const controller = new AbortController();
    const received: string[] = [];

    await consumeLocalWorldDieWitnessStream(
      {
        session: 'session-1',
        member: 'wizard-1',
        signal: controller.signal,
        onPlan: (value) => {
          received.push(value.presentationId);
          controller.abort();
        },
        onUnavailable: () => {
          throw new Error('cancelled stream must not report unavailable');
        },
      },
      {
        streamDiceThrows: async function* () {
          yield first;
          yield afterCancellation;
        },
      }
    );

    expect(received).toEqual(['session:session-1:42']);
  });

  it('reports a live transport failure without throwing into the view', async () => {
    let unavailable = 0;

    await expect(
      consumeLocalWorldDieWitnessStream(
        {
          session: 'session-1',
          member: 'wizard-1',
          signal: new AbortController().signal,
          onPlan: () => {
            throw new Error('no plan should be delivered');
          },
          onUnavailable: () => {
            unavailable += 1;
          },
        },
        {
          streamDiceThrows: async function* () {
            await Promise.reject(new Error('transport unavailable'));
            yield plan('unreachable');
          },
        }
      )
    ).resolves.toBeUndefined();
    expect(unavailable).toBe(1);
  });
});
