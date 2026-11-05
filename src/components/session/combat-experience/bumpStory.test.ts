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
  hisVoice,
  hisVoiceAtTheDoor,
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
  hisVoice,
];
/** The door bump's OpenDoor, likewise. */
const theDoor = [bumpTheDoor, theGuardAnswersAtTheDoor, hisVoiceAtTheDoor];
const rowOf = (rows: ReturnType<typeof story>, act: Act) =>
  rows.find((r) => r.act?.id === act.id)!;
/** The same act under another tag: the engine's old fresh `time:` act. */
const retagged = (act: Act, tag: string) => ({ ...act, act: tag }) as Act;
/** The same answer with its body changed. */
const answerWith = (
  over: Partial<Extract<Act['body'], { case: 'tableAnswer' }>['value']>
) =>
  ({
    ...theGuardAnswers,
    body: {
      case: 'tableAnswer',
      value: { ...theGuardAnswers.body.value, ...over },
    },
  }) as Act;

describe('the bump and the guard’s answer, from the wire (rpg-project#842)', () => {
  it('a step bump: the bump line, then his line as speech at him, one toast', () => {
    const rows = story(theMove);
    const bump = rowOf(rows, bumpTheGuard);
    const answer = rowOf(rows, theGuardAnswers);
    expect(bump.toastText).toBe(
      'Gate Guard bars the way — Alice stops short of (-3, 7)'
    );
    // The walk's stop keeps its own notice: the bump line does not toast.
    expect(bump.toastRule).toBeUndefined();
    // His answer sits under the bump in the log and toasts as speech to her.
    expect(answer.group).toBe(bump.group);
    expect(answer.nested).toBe(true);
    expect(answer.headline).toBe(`Gate Guard: "${LINE}"`);
    expect(answer.toastRule?.case).toBe('answer-to-your-bump');
    // His voice, which she also hears, does not toast beside his line.
    expect(rowOf(rows, hisVoice)).toBeDefined();
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
    const answer = rowOf(rows, theGuardAnswersAtTheDoor);
    expect(answer.headline).toBe(`Gate Guard: "${SHORTER_LINE}"`);
    expect(answer.nested).toBe(true);
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

  it('an answer under another act tag is not his answer to the bump', () => {
    const rows = story([
      walkToTheGate,
      bumpTheGuard,
      retagged(theGuardAnswers, 'time:01M6PNBCFZ2F5NMPE7V0F2WK2M'),
      hisVoice,
    ]);
    expect(rowOf(rows, theGuardAnswers).toastRule).toBeUndefined();
    expect(speechAtSpeakers(rows)).toEqual(new Map());
    // With no answer under the tag, the voice still toasts as a sound.
    expect(rowOf(rows, hisVoice).toastRule?.case).toBe('heard-sound');
  });

  it('another member who sees the answer is not spoken to', () => {
    const rows = story(theMove, 'bob');
    expect(rowOf(rows, theGuardAnswers).toastRule).toBeUndefined();
    expect(speechAtSpeakers(rows)).toEqual(new Map());
  });

  it('another creature answering under the bump’s tag does not speak to her', () => {
    const other = answerWith({
      who: create(PartySchema, { ...GATE, id: 'gate-2' }),
    });
    const rows = story([walkToTheGate, bumpTheGuard, other]);
    expect(rowOf(rows, other).toastRule).toBeUndefined();
    expect(speechAtSpeakers(rows)).toEqual(new Map());
  });

  it('his answer with no line stays a pick: no toast, no speech', () => {
    const pick = answerWith({ say: '', word: 'barred' });
    const rows = story([walkToTheGate, bumpTheGuard, pick]);
    expect(rowOf(rows, pick).toastRule).toBeUndefined();
    expect(speechAtSpeakers(rows)).toEqual(new Map());
  });

  it('the voice is suppressed whichever order the wire sends it in', () => {
    const rows = story([
      walkToTheGate,
      bumpTheGuard,
      hisVoice,
      theGuardAnswers,
    ]);
    expect(rows.map((r) => r.toastRule?.case).filter(Boolean)).toEqual([
      'answer-to-your-bump',
    ]);
  });

  it('the bump ends her walk stretch in the log, at her stop', () => {
    const rows = foldLogRows(story([walkToTheGate, bumpTheGuard]));
    expect(rows.map((r) => r.kind)).toEqual(['walks', 'entry']);
  });

  it('nothing in a bump is paced or held, so no window opens on it', () => {
    const fight = new Set([ALICE.id, 'gate-1']);
    for (const act of [...theMove.slice(1), ...theDoor])
      expect(needsPacing(act, 'bob', fight)).toBe(false);
  });
});
