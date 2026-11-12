/**
 * A bump as the act stream delivered it (rpg-project#842), recorded from the
 * real wire (`bumpActs.recorded.json`): in castle free roam the sandbox
 * fighter clicks the gate guard on his post (rpg-project#835 R8, a Move whose
 * goal is his cell), then tries the gate door he holds. Each bump's acts share its verb's act tag, as GetStory returned
 * them to the member who bumped:
 *
 * - the Move: the walk's last steps, the `barred` act (the step refused into
 *   his cell), his machine moving to `challenged`, his table answer (the
 *   pick), and the Speech carrying his line to the mover;
 * - the OpenDoor: the `barred` act naming the qualified door and no cell, his
 *   pick, and the Speech with the shorter line.
 *
 * REBUILT FOR rpg-project#934 from the same recording, in the shapes the
 * server sends now (see `recorded` in the JSON): the answers' retired
 * `say`/`to` are gone, and each retired voice Sound is replaced, at its own
 * record id, by the Speech that carries his line.
 *
 * Ids are kept as on the wire; the record's rolls are trimmed away.
 */
import { fromJson, type JsonValue } from '@bufbuild/protobuf';
import {
  ActSchema,
  PartyKind,
  type Act,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import recorded from './bumpActs.recorded.json';

const acts: Act[] = recorded.acts.map((json) =>
  fromJson(ActSchema, json as unknown as JsonValue)
);
/**
 * One recorded act, found by what it is, never by its tag: a fixture whose
 * answer lands under another tag still loads, so the tests see the tag.
 */
const one = (what: string, is: (act: Act) => boolean): Act => {
  const found = acts.find(is);
  if (!found) throw new Error(`recorded fixture has no ${what}`);
  return found;
};
const answer = (key: string) => (a: Act) =>
  a.body.case === 'tableAnswer' && a.body.value.key === key;
const line = (verb: string) => (a: Act) =>
  a.body.case === 'speech' && a.verb === verb;

export const MOVE_TAG = 'move:01M6PQE7VH7EXF27EZ6A274QWN';
export const DOOR_TAG = 'open_door:01M6PQFGAY6G474300TDHXG8CS';
export const ALICE = {
  kind: PartyKind.MEMBER,
  id: 'char_ae557118-9ef5-4d7e-940b-ce983b05363b',
};
export const GATE = { kind: PartyKind.MEMBER, id: 'gate-1' };
/** His `barred` row. */
export const LINE = 'Whoa there, buddy. Can I help you?';
/** His `challenged` row, the answer to the second bump. */
export const SHORTER_LINE = 'I said, can I help you?';

/** The walk's last steps toward the gate, before the refused one. */
export const walkToTheGate = one('walk', (a) => a.body.case === 'walk');
/** The step refused into his cell. */
export const bumpTheGuard = one(
  'step bump',
  (a) => a.body.case === 'barred' && !a.body.value.door
);
/** His machine: posted → challenged, "walked into him". */
export const theGuardIsChallenged = one(
  'machine',
  (a) => a.body.case === 'state'
);
/** His pick: gate-patrol's `barred` row. */
export const theGuardAnswers = one('barred answer', answer('barred'));
/** His line, as the mover sees and hears it: said to her. */
export const hisLine = one('line at the bump', line('move'));
/** The gate door he holds, tried: a door bump, no cell. */
export const bumpTheDoor = one(
  'door bump',
  (a) => a.body.case === 'barred' && !!a.body.value.door
);
/** His pick at the door: the `challenged` row. */
export const theGuardAnswersAtTheDoor = one(
  'challenged answer',
  answer('challenged')
);
/** His shorter line at the door. */
export const hisLineAtTheDoor = one('line at the door', line('open_door'));
