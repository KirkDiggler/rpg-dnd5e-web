// @vitest-environment node
import { create } from '@bufbuild/protobuf';
import {
  PartySchema,
  type Act,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { describe, expect, it } from 'vitest';
import { needsPacing } from '../monsterBeatQueue';
import { buildActStory } from './actStory';
import {
  ALICE,
  bumpTheDoor,
  bumpTheGuard,
  GATE,
  hisLine,
  hisLineAtTheDoor,
  LINE,
  SHORTER_LINE,
  theGuardAnswers,
  theGuardAnswersAtTheDoor,
  theGuardIsChallenged,
  walkToTheGate,
} from './bumpActs.fixture';
import { foldLogRows } from './foldLogRows';
import { speechAtSpeakers } from './speechAtSpeakers';

const context = {
  viewerMember: ALICE.id,
  memberNames: { [ALICE.id]: 'Alice', 'gate-1': 'Gate Guard' },
};

function story(acts: readonly Act[], viewerMember = ALICE.id) {
  return buildActStory(
    acts.map((act) => ({
      act,
      index: 0,
      seq: 1n,
      source: 'live' as const,
      visible: true,
    })),
    { ...context, viewerMember }
  );
}

/** The step bump's Move, every act the wire sent under its tag. */
const theMove = [
  walkToTheGate,
  bumpTheGuard,
  theGuardIsChallenged,
  theGuardAnswers,
  hisLine,
];
/** The door bump's OpenDoor, likewise. */
const theDoor = [bumpTheDoor, theGuardAnswersAtTheDoor, hisLineAtTheDoor];
const rowOf = (rows: ReturnType<typeof story>, act: Act) =>
  rows.find((r) => r.act?.id === act.id)!;
/** The same act under another tag: the engine's old fresh `time:` act. */
const retagged = (act: Act, tag: string) => ({ ...act, act: tag }) as Act;
/** His line with some of its parts changed. */
const lineWith = (
  over: Partial<Extract<Act['body'], { case: 'speech' }>['value']>
) =>
  ({
    ...hisLine,
    body: {
      case: 'speech',
      value: { ...hisLine.body.value, ...over },
    },
  }) as Act;

describe('the bump and the guard’s answer, from the wire (rpg-project#842)', () => {
  it('a step bump: the bump line, then his line as speech at him, one toast', () => {
    const rows = story(theMove);
    const bump = rowOf(rows, bumpTheGuard);
    const said = rowOf(rows, hisLine);
    expect(bump.toastText).toBe(
      'Gate Guard bars the way — Alice stops short of (-3, 7)'
    );
    // The walk's stop keeps its own notice: the bump line does not toast.
    expect(bump.toastRule).toBeUndefined();
    // His line sits under the bump in the log and toasts as speech to her;
    // his pick is a quiet row beside it.
    expect(said.group).toBe(bump.group);
    expect(said.nested).toBe(true);
    expect(said.headline).toBe(`Gate Guard says to you: “${LINE}”`);
    expect(said.toastRule?.case).toBe('answer-to-your-bump');
    expect(rowOf(rows, theGuardAnswers).toastRule).toBeUndefined();
    expect(rows.map((r) => r.toastRule?.case).filter(Boolean)).toEqual([
      'answer-to-your-bump',
    ]);
    // Speech, not a tooltip: the map is told the guard says his line.
    expect(speechAtSpeakers(rows)).toEqual(new Map([['gate-1', LINE]]));
  });

  it('a door bump reads beside the door, and his shorter line speaks', () => {
    const rows = story(theDoor);
    expect(rowOf(rows, bumpTheDoor).toastText).toBe(
      'Gate Guard bars the door — Alice at the gate wall door'
    );
    const said = rowOf(rows, hisLineAtTheDoor);
    expect(said.headline).toBe(`Gate Guard says to you: “${SHORTER_LINE}”`);
    expect(said.nested).toBe(true);
    expect(rows.map((r) => r.toastRule?.case).filter(Boolean)).toEqual([
      'answer-to-your-bump',
    ]);
    expect(speechAtSpeakers(rows)).toEqual(new Map([['gate-1', SHORTER_LINE]]));
  });

  it('a bump with no answer is the bump line only, and nobody speaks', () => {
    const rows = story([walkToTheGate, bumpTheGuard]);
    expect(rows.map((r) => r.headline)).toEqual([
      'Alice moves',
      'Gate Guard bars the way',
    ]);
    expect(rows.some((r) => r.toastRule)).toBe(false);
    expect(speechAtSpeakers(rows)).toEqual(new Map());
  });

  it('his line under another act tag is a line to her, not his answer to the bump', () => {
    const rows = story([
      walkToTheGate,
      bumpTheGuard,
      retagged(hisLine, 'time:01M6PNBCFZ2F5NMPE7V0F2WK2M'),
    ]);
    expect(rowOf(rows, hisLine).toastRule?.case).toBe('line-to-you');
  });

  it('another member who catches his line is not spoken to', () => {
    const rows = story(theMove, 'bob');
    expect(rowOf(rows, hisLine).toastRule?.case).toBe('heard-speech');
  });

  it('another creature speaking under the bump’s tag is not his answer to the bump', () => {
    const other = lineWith({
      speaker: create(PartySchema, { ...GATE, id: 'gate-2' }),
    });
    const rows = story([walkToTheGate, bumpTheGuard, other]);
    expect(rowOf(rows, other).toastRule?.case).toBe('line-to-you');
  });

  it('his pick with no line stays a pick: no toast, no speech', () => {
    const rows = story([walkToTheGate, bumpTheGuard, theGuardAnswers]);
    expect(rowOf(rows, theGuardAnswers).toastRule).toBeUndefined();
    expect(speechAtSpeakers(rows)).toEqual(new Map());
  });

  it('his line toasts once whichever order the wire sends it in', () => {
    const rows = story([walkToTheGate, bumpTheGuard, hisLine, theGuardAnswers]);
    expect(rows.map((r) => r.toastRule?.case).filter(Boolean)).toEqual([
      'answer-to-your-bump',
    ]);
  });

  it('the bump ends her walk stretch in the log, at her stop', () => {
    const rows = foldLogRows(story([walkToTheGate, bumpTheGuard]));
    expect(rows.map((r) => r.kind)).toEqual(['walks', 'entry']);
  });

  it('nothing in a bump but his line is paced; his line is his beat in a fight', () => {
    const fight = new Set([ALICE.id, 'gate-1']);
    for (const act of [
      bumpTheGuard,
      theGuardIsChallenged,
      theGuardAnswers,
      bumpTheDoor,
      theGuardAnswersAtTheDoor,
    ])
      expect(needsPacing(act, 'bob', fight)).toBe(false);
    expect(needsPacing(hisLine, 'bob', fight)).toBe(true);
  });
});

/**
 * THE HAIL (rpg-project#923): the guard speaks first when a visitor walks up.
 * His Speech names who it is said to (`spoken_to`). One toast: his line, as
 * speech at him.
 */
describe('the hail, spoken to the viewer by name (rpg-project#923)', () => {
  const HAIL = 'You there. State your business.';
  const hail = lineWith({ words: HAIL });
  const theHail = [walkToTheGate, theGuardAnswers, hail];

  it('his hail toasts once, as speech to her', () => {
    const rows = story(theHail);
    const said = rowOf(rows, hail);
    expect(said.toastRule?.case).toBe('line-to-you');
    expect(said.toastText).toContain(`Gate Guard says to you: “${HAIL}”`);
    expect(rows.map((r) => r.toastRule?.case).filter(Boolean)).toEqual([
      'line-to-you',
    ]);
    expect(speechAtSpeakers(rows)).toEqual(new Map([['gate-1', HAIL]]));
  });

  it('a voice heard under another tag is not this line, and still toasts', () => {
    const elsewhere = lineWith({
      utterance: 'u-elsewhere',
      speaker: undefined,
      spokenTo: undefined,
      words: undefined,
      hops: 1,
    });
    const rows = story([
      walkToTheGate,
      hail,
      { ...retagged(elsewhere, 'time:other'), id: 'other-voice' } as Act,
    ]);
    expect(rows.map((r) => r.toastRule?.case).filter(Boolean)).toEqual([
      'line-to-you',
      'heard-sound',
    ]);
  });

  it('a viewer the line is not said to hears it, but is not spoken to', () => {
    const rows = story(theHail, 'bram');
    expect(rowOf(rows, hail).toastRule?.case).toBe('heard-speech');
  });

  it('`spoken_to` decides over the act tag: a bump line said to someone else is not her bump answer', () => {
    const elsewhere = lineWith({
      spokenTo: create(PartySchema, { ...ALICE, id: 'bram' }),
    });
    const rows = story([walkToTheGate, bumpTheGuard, elsewhere]);
    expect(rowOf(rows, elsewhere).toastRule?.case).toBe('heard-speech');
  });
});
