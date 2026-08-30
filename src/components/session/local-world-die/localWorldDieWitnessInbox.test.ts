import { create } from '@bufbuild/protobuf';
import { DiceThrowPlanSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/presentation/v1alpha1/service_pb';
import { describe, expect, it } from 'vitest';
import type { LocalWorldDiePlanTerminal } from './localWorldDiePreSimulation';
import { localWorldDieDraft } from './localWorldDiePublish';
import { LocalWorldDieWitnessInbox } from './localWorldDieWitnessInbox';

const fingerprint = new Uint8Array(32).fill(7);
const initialState = {
  position: { x: 1, y: 1.25, z: 2 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  linearVelocity: { x: 1, y: 0.8, z: 0 },
  angularVelocity: { x: 0, y: 0, z: -1 },
};
const terminal: LocalWorldDiePlanTerminal = {
  kind: 'settled',
  step: 42,
  elapsedMs: 4,
  fingerprint,
  initialState,
  terminalState: {
    ...initialState,
    linearVelocity: { x: 0, y: 0, z: 0 },
    angularVelocity: { x: 0, y: 0, z: 0 },
  },
};

function wirePlan(presentationId = 'session:session-1:42') {
  const draft = localWorldDieDraft({
    presentationId,
    authoritySeq: 42n,
    attempt: 1,
    plan: terminal,
  });
  return create(DiceThrowPlanSchema, {
    schemaVersion: draft.schemaVersion,
    session: 'session-1',
    presentationId: draft.presentationId,
    authoritySeq: draft.authoritySeq,
    roller: 'fighter-1',
    attempt: draft.attempt,
    physicsSchema: draft.physicsSchema,
    colliderFingerprint: draft.colliderFingerprint,
    bodies: draft.bodies,
    contacts: draft.contacts,
    terminal: draft.terminal,
  });
}

const expected = {
  session: 'session-1',
  presentationId: 'session:session-1:42',
  authoritySeq: 42n,
  roller: 'fighter-1',
  attempt: 1,
  viewerMember: 'wizard-1',
  fingerprint,
};

describe('LocalWorldDieWitnessInbox', () => {
  it('admits a live plan when its matching authoritative event arrives shortly afterward', () => {
    const inbox = new LocalWorldDieWitnessInbox({ ttlMs: 1_500, capacity: 4 });

    expect(inbox.offer(wirePlan(), undefined, 1_000)).toBeUndefined();

    expect(inbox.reconsider(expected, 1_100)).toMatchObject({
      presentationId: 'session:session-1:42',
      roller: 'fighter-1',
      attempt: 1,
    });
    expect(inbox.reconsider(expected, 1_101)).toBeUndefined();
  });

  it('never admits a buffered plan after the short receipt window', () => {
    const inbox = new LocalWorldDieWitnessInbox({ ttlMs: 1_500, capacity: 4 });

    inbox.offer(wirePlan(), undefined, 1_000);

    expect(inbox.reconsider(expected, 2_501)).toBeUndefined();
  });

  it('bounds unmatched future plans and retains the newest candidates', () => {
    const inbox = new LocalWorldDieWitnessInbox({ ttlMs: 1_500, capacity: 2 });

    inbox.offer(wirePlan('session:session-1:40'), undefined, 1_000);
    inbox.offer(wirePlan('session:session-1:41'), undefined, 1_001);
    inbox.offer(wirePlan(), undefined, 1_002);

    expect(inbox.size).toBe(2);
    expect(inbox.reconsider(expected, 1_100)?.presentationId).toBe(
      'session:session-1:42'
    );
  });
});
