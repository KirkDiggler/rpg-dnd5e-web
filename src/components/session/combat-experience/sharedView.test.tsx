/**
 * The sharing dial (rpg-project#935): what reached the viewer through a
 * friend's senses is SHOWN like their own — logged, toasted, detailed, on the
 * map as a bubble or a voice cue — and marked with whose senses it came
 * through. It is never KNOWN: no refresh of the viewer's own state, no kept
 * roll. (The map's knowledge is pinned in `useSessionKnowledge.test.ts`.)
 */
import { create } from '@bufbuild/protobuf';
import {
  ActSchema,
  Family,
  Loudness,
  MoveKind,
  PartyKind,
  PartySchema,
  PerceivedSchema,
  Sense,
  type Act,
  type Party,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { refreshKeysForAct } from '../actRefreshKeys';
import { arrivingWalk, ownWalk } from '../arrivingWalk';
import { friendNames, throughMark } from '../sharedVia';
import { buildActStory, type CombatStoryFact } from './actStory';
import { foldLogRows } from './foldLogRows';
import { isKeptRollAct } from './selection';
import { speechAtSpeakers, voicesAtPlaces } from './speechAtSpeakers';
import { StoryNoticeContent } from './StoryNoticeContent';

afterEach(cleanup);

const viewer = 'tam';
const bea = create(PartySchema, { kind: PartyKind.MEMBER, id: 'bea' });
const rin = create(PartySchema, { kind: PartyKind.MEMBER, id: 'rin' });
const guard = create(PartySchema, { kind: PartyKind.MEMBER, id: 'gate-1' });
const member = (id: string) =>
  create(PartySchema, { kind: PartyKind.MEMBER, id });
const names = { tam: 'Tam', bea: 'Bea', rin: 'Rin', 'gate-1': 'Gate guard' };
const context = { viewerMember: viewer, memberNames: names };

function withVia(act: Act, via: Party[]): Act {
  return create(ActSchema, {
    ...act,
    perceived: create(PerceivedSchema, {
      senses: act.perceived?.senses ?? [],
      via,
    }),
  });
}

function speech(id: string, value: Record<string, unknown>, senses: Sense[]) {
  return create(ActSchema, {
    session: 's',
    id,
    act: 'speak:1',
    verb: 'speak',
    family: Family.ACT,
    perceived: { senses },
    body: {
      case: 'speech',
      value: { place: { x: 2, y: 3 }, loudness: Loudness.SPEAK, ...value },
    },
  } as never);
}

function perception(id: string, value: Record<string, unknown>): Act {
  return create(ActSchema, {
    session: 's',
    id,
    family: Family.PERCEPTION,
    body: { case: 'perception', value },
  } as never);
}

const fact = (act: Act, seq = 1): CombatStoryFact => ({
  act,
  index: 0,
  seq: BigInt(seq),
  source: 'live',
  visible: true,
});

describe('the mark', () => {
  it('names friends plainly, never the viewer, never a guessed name', () => {
    expect(friendNames([bea], names)).toBe('Bea');
    expect(friendNames([bea, rin], names)).toBe('Bea and Rin');
    expect(friendNames([bea, rin, guard], names)).toBe(
      'Bea, Rin and Gate guard'
    );
    expect(friendNames([member('x')], names)).toBe('a party member');
    const line = speech('r1', { words: 'Hi' }, [Sense.HEARING]);
    expect(throughMark(withVia(line, [bea]), viewer, names)).toBe(
      'through Bea'
    );
    expect(throughMark(withVia(line, [member(viewer)]), viewer, names)).toBe(
      ''
    );
    expect(throughMark(line, viewer, names)).toBe('');
  });
});

describe('shown like own', () => {
  const shout = withVia(
    speech('r1', { speaker: guard, words: 'Halt!', loudness: Loudness.SHOUT }, [
      Sense.SIGHT,
      Sense.HEARING,
    ]),
    [bea]
  );

  it('a friend’s caught words toast as the viewer’s own would, marked in the log row and the toast', () => {
    const [row] = buildActStory([fact(shout)], context);
    expect(row!.headline).toBe('Gate guard shouts: “Halt!”');
    expect(row!.detail).toBe('through Bea');
    expect(row!.toastText).toBe('Gate guard shouts: “Halt!” — through Bea');
    expect(row!.toastRule?.case).toBe('heard-speech');
  });

  it('a friend’s roll travels with the words and keeps its toast', () => {
    const checked = withVia(
      speech(
        'r2',
        {
          words: 'We are expected.',
          hops: 1,
          roll: { total: 15, against: 12, beaten: true },
          skill: 'deception',
        },
        [Sense.HEARING]
      ),
      [bea, rin]
    );
    const [row] = buildActStory([fact(checked)], context);
    expect(row!.detail).toBe(
      '1 room away · someone rolled 15 · through Bea and Rin'
    );
    expect(row!.toastRule?.case).toBe('heard-speech');
  });

  it('a friend’s heard sound is the same secondary cue', () => {
    const clang = withVia(
      perception('r3', {
        observer: bea,
        sense: Sense.HEARING,
        heard: { kind: 'clang', hops: 1 },
      }),
      [bea]
    );
    const [row] = buildActStory([fact(clang)], context);
    expect(row!.headline).toBe('Bea hears clang');
    expect(row!.detail).toBe('1 room away · through Bea');
    expect(row!.toastRule?.case).toBe('heard-sound');
    // Another member's sound that did NOT reach the viewer is still not news.
    const notShared = perception('r4', {
      observer: bea,
      sense: Sense.HEARING,
      heard: { kind: 'clang', hops: 1 },
    });
    expect(buildActStory([fact(notShared)], context)[0]!.toastRule).toBe(
      undefined
    );
  });

  it('a friend’s discovery stays in the log, marked', () => {
    const found = withVia(
      perception('r5', {
        observer: bea,
        sense: Sense.REVEAL,
        revealed: { concealment: 'hidden-door' },
      }),
      [bea]
    );
    const [row] = buildActStory([fact(found)], context);
    expect(row!.detail).toBe('through Bea');
    expect(row!.toastRule).toBeUndefined();
  });

  it('one utterance shows once, whoever’s version arrives second', () => {
    const own = speech('r6', { utterance: 'u9', words: 'Halt!' }, [
      Sense.HEARING,
    ]);
    const friends = withVia(
      speech('r7', { utterance: 'u9', speaker: guard, words: 'Halt!' }, [
        Sense.SIGHT,
        Sense.HEARING,
      ]),
      [bea]
    );
    const story = buildActStory([fact(own, 1), fact(friends, 2)], context);
    expect(story).toHaveLength(1);
    expect(story.filter((row) => row.toastRule)).toHaveLength(1);
  });

  it('the bubble and the voice cue say whose senses they came through', () => {
    const [row] = buildActStory([fact(shout)], context);
    expect(speechAtSpeakers([row!]).get('gate-1')).toBe('Halt! — through Bea');
    const voice = withVia(
      speech('r8', { hops: 1, loudness: Loudness.SHOUT }, [Sense.HEARING]),
      [bea]
    );
    const [voiceRow] = buildActStory([fact(voice)], context);
    expect(voicesAtPlaces([voiceRow!])).toEqual([
      { id: voiceRow!.id, x: 2, y: 3, line: 'a voice shouting — through Bea' },
    ]);
  });

  it('Details lists whose senses it came through as a row', () => {
    const [row] = buildActStory([fact(shout)], context);
    render(<StoryNoticeContent entry={row!} showDescription={false} />);
    expect(screen.getByTestId('speech-facts')).toHaveTextContent('ThroughBea');
    cleanup();
    const found = withVia(
      perception('r9', {
        observer: bea,
        sense: Sense.REVEAL,
        revealed: { concealment: 'hidden-door' },
      }),
      [bea, rin]
    );
    const [foundRow] = buildActStory([fact(found)], context);
    render(<StoryNoticeContent entry={foundRow!} showDescription={false} />);
    expect(screen.getByTestId('through-facts')).toHaveTextContent(
      'ThroughBea and Rin'
    );
  });
});

describe('known never', () => {
  it('a friend’s entry refreshes none of the viewer’s own reads', () => {
    const discovered = perception('r10', {
      observer: { kind: PartyKind.MEMBER, id: viewer },
      sense: Sense.DISCOVERY,
    });
    expect(refreshKeysForAct(discovered, viewer)).toEqual([
      'characterData',
      'afford',
    ]);
    expect(refreshKeysForAct(withVia(discovered, [bea]), viewer)).toEqual([]);
    const reveal = perception('r11', {
      observer: bea,
      sense: Sense.REVEAL,
    });
    expect(refreshKeysForAct(withVia(reveal, [bea]), viewer)).toEqual([]);
  });

  it('a kept roll is the viewer’s own, never one shown through a friend', () => {
    const kept = create(ActSchema, {
      ...speech(
        'r12',
        {
          speaker: { kind: PartyKind.MEMBER, id: viewer },
          words: 'I fell behind.',
          roll: { total: 14, against: 12, beaten: true },
        },
        [Sense.SIGHT, Sense.HEARING]
      ),
      act: 'move:1',
      verb: 'move',
    });
    expect(isKeptRollAct(kept, viewer)).toBe(true);
    expect(isKeptRollAct(withVia(kept, [bea]), viewer)).toBe(false);
  });
});

describe('a move that came through a friend (rpg-project#935)', () => {
  // Bea steps onto a concealed cell Rin knows about and the viewer does not:
  // a separate move segment, via Rin, no senses, cells the viewer's map lacks.
  const viaMove = withVia(
    create(ActSchema, {
      session: 's',
      id: 'r20',
      act: 'move:9',
      verb: 'move',
      family: Family.ACT,
      body: {
        case: 'walk',
        value: {
          mover: bea,
          path: [
            { cell: { x: 7, y: -3 } },
            { cell: { x: 8, y: -3 }, doors: ['hidden-door'] },
          ],
          kind: MoveKind.OWN,
        },
      },
    }),
    [rin]
  );

  it('logs with the mark, on its own row, and toasts nothing', () => {
    const story = buildActStory([fact(viaMove)], context);
    expect(story[0]!.headline).toBe('Bea moves');
    expect(story[0]!.detail).toMatch(/· through Rin$/);
    expect(story[0]!.toastRule).toBeUndefined();
    expect(foldLogRows(story).map((row) => row.kind)).toEqual(['entry']);
  });

  it('is never animated: no route for the canvas, whoever moved', () => {
    expect(arrivingWalk(viaMove, viewer)).toBeUndefined();
    const ownViaMove = create(ActSchema, {
      ...viaMove,
      body: {
        case: 'walk',
        value: { ...viaMove.body.value, mover: member(viewer) },
      },
    } as never);
    expect(ownWalk(ownViaMove, viewer)).toBeUndefined();
    // The same walk seen with the viewer's own senses still animates.
    const seen = create(ActSchema, { ...viaMove, perceived: undefined });
    expect(arrivingWalk(seen, viewer)?.cells).toHaveLength(2);
  });

  it('asks for no refetch of the viewer’s own reads', () => {
    expect(refreshKeysForAct(viaMove, viewer)).toEqual([]);
  });
});
