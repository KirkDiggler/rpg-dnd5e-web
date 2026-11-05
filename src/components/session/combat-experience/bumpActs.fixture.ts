/**
 * A bump as the act stream delivers it (rpg-project#842, protos v0.1.256):
 * Alice walks two cells toward the castle gate, her next step is refused by
 * the gate guard on his post, and he answers. Every act rides the Move's one
 * act tag: the walk, the `barred` act, then his table answer with his line.
 * A door bump carries the door and no cell.
 */
import { create, type MessageInitShape } from '@bufbuild/protobuf';
import {
  ActSchema,
  Family,
  PartyKind,
  type Act,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';

export const ALICE = { kind: PartyKind.MEMBER, id: 'alice' };
export const GATE = { kind: PartyKind.MEMBER, id: 'gate-1' };
export const MOVE_TAG = 'move:id-10';
export const DOOR_TAG = 'door:id-20';
export const LINE = 'Whoa there, buddy. Can I help you?';

const at = (
  id: string,
  family: Family,
  body: MessageInitShape<typeof ActSchema>['body'],
  verb: string,
  tag: string
): Act => create(ActSchema, { session: 's', id, family, verb, act: tag, body });

/** Alice's two steps toward the gate, before the refused one. */
export const walkToTheGate = at(
  'id-10',
  Family.ACT,
  {
    case: 'walk',
    value: {
      mover: ALICE,
      path: [{ cell: { x: 2, y: 2 } }, { cell: { x: 3, y: 2 } }],
    },
  },
  'move',
  MOVE_TAG
);

/** Her third step, refused into the guard's own cell. */
export const bumpTheGuard = at(
  'id-11',
  Family.ACT,
  {
    case: 'barred',
    value: { mover: ALICE, barrier: GATE, cell: { x: 4, y: 2 } },
  },
  'move',
  MOVE_TAG
);

/** His answer: the `barred` row of gate-patrol, under the Move's tag. */
export const theGuardAnswers = at(
  'id-12',
  Family.TABLE_ANSWER,
  {
    case: 'tableAnswer',
    value: { who: GATE, word: 'barred', say: LINE },
  },
  'move',
  MOVE_TAG
);

/** Alice tries the gate door his post holds: a door bump, no cell. */
export const bumpTheDoor = at(
  'id-20',
  Family.ACT,
  {
    case: 'barred',
    value: { mover: ALICE, barrier: GATE, door: 'gate-wall-door' },
  },
  'door',
  DOOR_TAG
);

/** His answer to the door bump. */
export const theGuardAnswersAtTheDoor = at(
  'id-21',
  Family.TABLE_ANSWER,
  {
    case: 'tableAnswer',
    value: { who: GATE, word: 'barred', say: LINE },
  },
  'door',
  DOOR_TAG
);
