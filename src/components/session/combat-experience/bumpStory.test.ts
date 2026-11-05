// @vitest-environment node
import type { Act } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { describe, expect, it } from 'vitest';
import { needsPacing } from '../monsterBeatQueue';
import { buildActStory } from './actStory';
import {
  bumpTheDoor,
  bumpTheGuard,
  GATE,
  LINE,
  theGuardAnswers,
  theGuardAnswersAtTheDoor,
  walkToTheGate,
} from './bumpActs.fixture';
import { foldLogRows } from './foldLogRows';
import { speechAtSpeakers } from './speechAtSpeakers';

const context = {
  viewerMember: 'alice',
  memberNames: { alice: 'Alice', 'gate-1': 'Gate Guard' },
};

function story(acts: readonly Act[], viewerMember = 'alice') {
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

describe('the bump and the guard’s answer (rpg-project#842)', () => {
  it('a bump with its answer: the bump line, then his line as speech at him', () => {
    const rows = story([walkToTheGate, bumpTheGuard, theGuardAnswers]);
    const bump = rows.find((r) => r.act?.id === 'id-11')!;
    const answer = rows.find((r) => r.act?.id === 'id-12')!;
    expect(bump.toastText).toBe(
      'Gate Guard bars the way — Alice stops short of (4, 2)'
    );
    // The walk's stop keeps its own notice: the bump line does not toast.
    expect(bump.toastRule).toBeUndefined();
    // His answer sits under the bump in the log and toasts as speech to her.
    expect(answer.group).toBe(bump.group);
    expect(answer.nested).toBe(true);
    expect(answer.headline).toBe(`Gate Guard: "${LINE}"`);
    expect(answer.toastRule?.case).toBe('answer-to-your-bump');
    // Speech, not a tooltip: the map is told the guard says his line.
    expect(speechAtSpeakers(rows.filter((r) => r.toastRule))).toEqual(
      new Map([['gate-1', LINE]])
    );
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

  it('a door bump reads beside the door, and his answer speaks the same', () => {
    const rows = story([bumpTheDoor, theGuardAnswersAtTheDoor]);
    expect(rows[0]?.toastText).toBe(
      'Gate Guard bars the door — Alice at the gate wall door'
    );
    expect(rows[1]?.headline).toBe(`Gate Guard: "${LINE}"`);
    expect(rows[1]?.nested).toBe(true);
    expect(rows[1]?.toastRule?.case).toBe('answer-to-your-bump');
    expect(speechAtSpeakers(rows)).toEqual(new Map([['gate-1', LINE]]));
  });

  it('another member who sees the answer is not spoken to', () => {
    const rows = story([walkToTheGate, bumpTheGuard, theGuardAnswers], 'bob');
    expect(rows.find((r) => r.act?.id === 'id-12')?.toastRule).toBeUndefined();
    expect(speechAtSpeakers(rows)).toEqual(new Map());
  });

  it('an answer under another tag is not his answer to the bump', () => {
    const elsewhere = { ...theGuardAnswers, act: 'move:id-99' } as Act;
    const rows = story([walkToTheGate, bumpTheGuard, elsewhere]);
    expect(rows.at(-1)?.toastRule).toBeUndefined();
  });

  it('another creature answering under the bump’s tag does not speak to her', () => {
    const other = {
      ...theGuardAnswers,
      id: 'id-13',
      body: {
        case: 'tableAnswer',
        value: {
          ...theGuardAnswers.body.value,
          who: { ...GATE, id: 'gate-2' },
        },
      },
    } as Act;
    const rows = story([walkToTheGate, bumpTheGuard, other]);
    expect(rows.find((r) => r.act?.id === 'id-13')?.toastRule).toBeUndefined();
    expect(speechAtSpeakers(rows)).toEqual(new Map());
  });

  it('his answer with a word and no line stays a pick: no toast, no speech', () => {
    const pick = {
      ...theGuardAnswers,
      body: {
        case: 'tableAnswer',
        value: { ...theGuardAnswers.body.value, say: '' },
      },
    } as Act;
    const rows = story([walkToTheGate, bumpTheGuard, pick]);
    expect(rows.find((r) => r.act?.id === 'id-12')?.toastRule).toBeUndefined();
    expect(speechAtSpeakers(rows)).toEqual(new Map());
  });

  it('the bump ends her walk stretch in the log, at her stop', () => {
    const rows = foldLogRows(story([walkToTheGate, bumpTheGuard]));
    expect(rows.map((r) => r.kind)).toEqual(['walks', 'entry']);
  });

  it('nothing in a bump is paced or held, so no window opens on it', () => {
    const fight = new Set(['alice', 'gate-1']);
    for (const act of [bumpTheGuard, theGuardAnswers, bumpTheDoor])
      expect(needsPacing(act, 'bob', fight)).toBe(false);
  });
});
