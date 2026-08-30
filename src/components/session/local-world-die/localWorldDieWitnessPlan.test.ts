import { create } from '@bufbuild/protobuf';
import {
  DiceBodyInitialSchema,
  DiceBodyTerminalSchema,
  DicePhysicsSchema,
  DiceShape,
  DiceTerminalKind,
  DiceThrowPlanSchema,
  RigidBodyStateSchema,
  ThrowTerminalSchema,
  type DiceThrowPlan,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/presentation/v1alpha1/service_pb';
import { describe, expect, it } from 'vitest';
import { admitLocalWorldDieWitnessPlan } from './localWorldDieWitnessPlan';

const fingerprint = new Uint8Array(32).fill(7);
const initialState = create(RigidBodyStateSchema, {
  position: { x: 1, y: 1.25, z: 2 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  linearVelocity: { x: 1, y: 0.8, z: 0 },
  angularVelocity: { x: 0, y: 0, z: -1 },
});
const terminalState = create(RigidBodyStateSchema, {
  position: { x: 2, y: 0.3, z: 2 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  linearVelocity: { x: 0, y: 0, z: 0 },
  angularVelocity: { x: 0, y: 0, z: 0 },
});

function acceptedPlan(overrides: Partial<DiceThrowPlan> = {}) {
  return create(DiceThrowPlanSchema, {
    schemaVersion: 1,
    session: 'session-1',
    presentationId: 'session:session-1:42',
    authoritySeq: 42n,
    roller: 'fighter-1',
    attempt: 1,
    physicsSchema: DicePhysicsSchema.RAPIER_DUNGEON_D20_V1,
    colliderFingerprint: fingerprint,
    bodies: [
      create(DiceBodyInitialSchema, {
        dieId: 'attack-d20',
        shape: DiceShape.D20,
        state: initialState,
      }),
    ],
    contacts: [],
    terminal: create(ThrowTerminalSchema, {
      dice: [
        create(DiceBodyTerminalSchema, {
          dieId: 'attack-d20',
          step: 42,
          kind: DiceTerminalKind.SETTLED,
          state: terminalState,
        }),
      ],
    }),
    ...overrides,
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

describe('admitLocalWorldDieWitnessPlan', () => {
  it('accepts the exact live nonlocal one-d20 plan as an immutable playback value', () => {
    const result = admitLocalWorldDieWitnessPlan(acceptedPlan(), expected);

    expect(result).toMatchObject({
      presentationId: expected.presentationId,
      authoritySeq: 42n,
      roller: 'fighter-1',
      attempt: 1,
      initialState: {
        position: { x: 1, y: 1.25, z: 2 },
        linearVelocity: { x: 1, y: 0.8, z: 0 },
      },
      terminal: {
        kind: 'settled',
        step: 42,
        terminalState: {
          position: { x: 2, y: 0.3, z: 2 },
        },
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(result?.fingerprint).not.toBe(fingerprint);
  });

  it.each([
    ['actor echo', { ...expected, viewerMember: 'fighter-1' }, {}],
    ['session mismatch', expected, { session: 'other-session' }],
    [
      'presentation mismatch',
      expected,
      { presentationId: 'session:session-1:43' },
    ],
    ['authority mismatch', expected, { authoritySeq: 43n }],
    ['roller mismatch', expected, { roller: 'rogue-1' }],
    ['attempt mismatch', expected, { attempt: 2 }],
    [
      'unknown schema',
      expected,
      { physicsSchema: DicePhysicsSchema.UNSPECIFIED },
    ],
    [
      'fingerprint mismatch',
      expected,
      { colliderFingerprint: new Uint8Array(32) },
    ],
  ] as const)('rejects %s', (_, context, overrides) => {
    expect(
      admitLocalWorldDieWitnessPlan(acceptedPlan(overrides), context)
    ).toBeUndefined();
  });

  it('rejects plans outside the playback subset supported by this checkpoint', () => {
    expect(
      admitLocalWorldDieWitnessPlan(
        acceptedPlan({
          bodies: [],
        }),
        expected
      )
    ).toBeUndefined();
    expect(
      admitLocalWorldDieWitnessPlan(
        acceptedPlan({
          contacts: [
            {
              $typeName:
                'dnd5e.api.session.presentation.v1alpha1.ContactCheckpoint',
              step: 1,
              primaryDieId: 'attack-d20',
              target: { case: 'otherDieId', value: 'another-die' },
              after: [],
            },
          ],
        }),
        expected
      )
    ).toBeUndefined();
    expect(
      admitLocalWorldDieWitnessPlan(
        acceptedPlan({
          terminal: create(ThrowTerminalSchema, {
            dice: [
              create(DiceBodyTerminalSchema, {
                dieId: 'attack-d20',
                step: 181,
                kind: DiceTerminalKind.SETTLED,
                state: terminalState,
              }),
            ],
          }),
        }),
        expected
      )
    ).toBeUndefined();
  });
});
