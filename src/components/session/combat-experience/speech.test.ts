// @vitest-environment node
/**
 * The one speech message, rendered (rpg-project#934, slice two of
 * rpg-project#930): every row the viewer can perceive, built from the proto
 * message itself, and what the client does NOT do — infer a speaker, an
 * addressee or words — pinned beside it.
 */
import { create, type MessageInitShape } from '@bufbuild/protobuf';
import {
  ActSchema,
  Family,
  Loudness,
  PartyKind,
  Sense,
  SpeechSchema,
  type Act,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { describe, expect, it } from 'vitest';
import { refreshKeysForAct } from '../actRefreshKeys';
import { speechSound } from '../heardBeat';
import { buildActStory, type CombatStoryFact } from './actStory';
import { describeAct, type DescribeContext } from './describeAct';
import { speechAtSpeakers, voicesAtPlaces } from './speechAtSpeakers';
import { toastFor } from './toastPolicy';

const aldric = { kind: PartyKind.MEMBER, id: 'aldric' };
const guard = { kind: PartyKind.MEMBER, id: 'gate-guard' };
const viewer = 'bree';
const context: DescribeContext = {
  viewerMember: viewer,
  memberNames: { aldric: 'Aldric', 'gate-guard': 'Gate guard', bree: 'Bree' },
};
const check = {
  total: 15,
  against: 12,
  beaten: true,
  expression: '1d20+3',
};

type SpeechInit = Omit<MessageInitShape<typeof SpeechSchema>, '$typeName'>;

function speech(
  value: SpeechInit,
  senses: Sense[] = [Sense.SIGHT, Sense.HEARING],
  { id = 'r-2', tag = 'speak:1' } = {}
): Act {
  return create(ActSchema, {
    session: 's',
    id,
    act: tag,
    verb: 'speak',
    family: Family.ACT,
    perceived: { senses },
    body: {
      case: 'speech',
      value: { utterance: 'u1', place: { x: 4, y: 2 }, ...value },
    },
  });
}

const line = (act: Act) => describeAct(act, context)!;

describe('each row a viewer can perceive reads as the message says', () => {
  it('speaker seen, words caught: named, the loudness as a verb, the roll theirs', () => {
    const act = speech({
      speaker: aldric,
      spokenTo: guard,
      words: 'Open the gate!',
      option: 'demand',
      loudness: Loudness.SHOUT,
      roll: check,
      skill: 'intimidation',
    });
    expect(line(act).headline).toBe(
      'Aldric shouts to Gate guard: “Open the gate!”'
    );
    expect(line(act).detail).toBe('intimidation check, 1d20+3 = 15 vs 12');
    // The toast line is roll-free.
    expect(line(act).text).toBe(
      'Aldric shouts to Gate guard: “Open the gate!”'
    );
  });

  it('words heard, speaker unseen: "Someone", where it came from, nobody named', () => {
    const act = speech(
      { words: 'To arms!', loudness: Loudness.SHOUT, hops: 1 },
      [Sense.HEARING]
    );
    expect(line(act).headline).toBe('Someone shouts: “To arms!”');
    expect(line(act).detail).toBe('1 room away');
  });

  it('a voice only, no words: "You hear a voice", with the loudness when not speech', () => {
    expect(
      line(speech({ loudness: Loudness.SPEAK, hops: 2 }, [Sense.HEARING]))
        .headline
    ).toBe('You hear a voice');
    const shout = line(
      speech({ loudness: Loudness.SHOUT, hops: 2 }, [Sense.HEARING])
    );
    expect(shout.headline).toBe('You hear a voice shouting');
    expect(shout.detail).toBe('2 rooms away');
    expect(
      line(speech({ loudness: Loudness.SCREAM, hops: 0 }, [Sense.HEARING]))
        .headline
    ).toBe('You hear a scream');
  });

  it('a whisper watched, not heard: who to whom, no words, no roll', () => {
    const d = line(
      speech({ speaker: aldric, spokenTo: guard, loudness: Loudness.WHISPER }, [
        Sense.SIGHT,
      ])
    );
    expect(d.headline).toBe('Aldric whispers to Gate guard');
    expect(d.detail).toBe('');
    expect(d.roll).toBeUndefined();
  });

  it('a roll heard without sight is someone’s roll', () => {
    const d = line(
      speech(
        {
          words: 'We are expected.',
          loudness: Loudness.SPEAK,
          hops: 0,
          roll: check,
          skill: 'deception',
        },
        [Sense.HEARING]
      )
    );
    expect(d.headline).toBe('Someone says: “We are expected.”');
    expect(d.detail).toBe('in this room · someone rolled 15');
    // The toast line stays roll-free.
    expect(d.text).toBe('Someone says: “We are expected.” — in this room');
  });

  it('spoken_to absent names no addressee', () => {
    expect(
      line(speech({ speaker: aldric, words: 'Hm.', loudness: Loudness.SPEAK }))
        .headline
    ).toBe('Aldric says: “Hm.”');
  });

  it('the viewer’s own line is theirs, by the name they go by', () => {
    const own = speech({
      speaker: { kind: PartyKind.MEMBER, id: viewer },
      spokenTo: guard,
      words: 'Evening.',
      loudness: Loudness.SPEAK,
    });
    expect(line(own).headline).toBe('Bree says to Gate guard: “Evening.”');
    expect(toastFor(own, viewer, false)?.case).toBe('own-speech');
  });

  it('never infers a speaker: the place, the option and the words name nobody', () => {
    const d = line(
      speech(
        {
          words: 'Aldric here.',
          option: 'aldric-intro',
          loudness: Loudness.SPEAK,
          hops: 0,
        },
        [Sense.HEARING]
      )
    );
    expect(d.headline.startsWith('Someone says')).toBe(true);
    expect(d.headline).not.toMatch(/^Aldric/);
  });
});

describe('toasts', () => {
  it('words caught by a viewer out of a fight, not the addressee, toast (the operator’s test)', () => {
    const shout = speech(
      { words: 'To arms!', loudness: Loudness.SHOUT, hops: 1 },
      [Sense.HEARING]
    );
    const rule = toastFor(shout, viewer, false);
    expect(rule?.case).toBe('heard-speech');
    expect(rule?.hold).toBe(false);
  });

  it('a line said to the viewer is a line to you', () => {
    const hail = speech({
      speaker: guard,
      spokenTo: { kind: PartyKind.MEMBER, id: viewer },
      words: 'Halt.',
      loudness: Loudness.SPEAK,
    });
    expect(toastFor(hail, viewer, false)?.case).toBe('line-to-you');
    expect(toastFor(hail, viewer, false, viewer)?.case).toBe(
      'answer-to-your-line'
    );
  });

  it('a voice only is a secondary cue; a whisper watched stays in the log', () => {
    expect(
      toastFor(
        speech({ loudness: Loudness.SHOUT, hops: 2 }, [Sense.HEARING]),
        viewer,
        false
      )?.case
    ).toBe('heard-sound');
    expect(
      toastFor(
        speech({ speaker: aldric, loudness: Loudness.WHISPER }, [Sense.SIGHT]),
        viewer,
        false
      )
    ).toBeNull();
  });
});

describe('on the map', () => {
  const notice = (act: Act, id: string) => ({
    id,
    eyebrow: '',
    headline: '',
    detail: '',
    tone: 'neutral' as const,
    act,
    toastRule: { case: 'heard-speech' as const, hold: false },
  });

  it('a seen speaker’s caught words sit over the speaker', () => {
    const said = speech({
      speaker: aldric,
      words: 'Over here!',
      loudness: Loudness.SHOUT,
    });
    expect(speechAtSpeakers([notice(said, 'n1')]).get('aldric')).toBe(
      'Over here!'
    );
    expect(voicesAtPlaces([notice(said, 'n1')])).toEqual([]);
  });

  it('an unseen speaker is a voice cue at the place, naming nobody', () => {
    const words = speech(
      { words: 'Over here!', loudness: Loudness.SHOUT, hops: 1 },
      [Sense.HEARING]
    );
    const voiceOnly = speech(
      { loudness: Loudness.SHOUT, hops: 2, place: { x: 7, y: 1 } },
      [Sense.HEARING]
    );
    expect(speechAtSpeakers([notice(words, 'n1')]).size).toBe(0);
    expect(
      voicesAtPlaces([notice(words, 'n1'), notice(voiceOnly, 'n2')])
    ).toEqual([
      { id: 'n1', x: 4, y: 2, line: 'Over here!' },
      { id: 'n2', x: 7, y: 1, line: 'a voice shouting' },
    ]);
  });

  it('heardBeat reads an unseen speaker’s Speech as a voice, and a seen one as none', () => {
    const unseen = speech({ words: 'Hey', loudness: Loudness.SPEAK, hops: 1 }, [
      Sense.HEARING,
    ]).body.value;
    expect(speechSound(unseen as never)).toEqual({
      kind: 'voice',
      position: { x: 4, y: 2 },
      hops: 1,
    });
    const seen = speech({
      speaker: aldric,
      words: 'Hey',
      loudness: Loudness.SPEAK,
    }).body.value;
    expect(speechSound(seen as never)).toBeUndefined();
  });
});

describe('refresh keys', () => {
  it('the speaker re-reads their own sheet; anyone else what an answer changed', () => {
    const own = speech({
      speaker: { kind: PartyKind.MEMBER, id: viewer },
      words: 'Hi',
      loudness: Loudness.SPEAK,
    });
    expect(refreshKeysForAct(own, viewer)).toEqual(['characterData', 'afford']);
    const heard = speech({ words: 'Hi', loudness: Loudness.SPEAK, hops: 0 }, [
      Sense.HEARING,
    ]);
    expect(refreshKeysForAct(heard, viewer)).toEqual(['afford', 'view']);
  });
});

describe('one exchange heard through a wall is one notice (the operator’s run on rpg-dnd5e-web#1416)', () => {
  // The bard's versions, as the castle record holds them: the barbarian's
  // line to gate-1 and gate-1's answer, each a voice one room off with no
  // speaker and no words (record entries 526 and 532 of that run, one act).
  const tag = 'speak:01M78DPCF640K5SM7VP2BT1V8W';
  const bard = 'char_c1243ea4-09c4-450a-bb25-3e9e01ea7c20';
  const voiceOf = (id: string, utterance: string, x: number, y: number) =>
    speech(
      { utterance, loudness: Loudness.SPEAK, hops: 1, place: { x, y } },
      [Sense.HEARING],
      { id, tag }
    );
  const fact = (act: Act, seq: number, index: number): CombatStoryFact => ({
    act,
    index,
    seq: BigInt(seq),
    source: 'live',
    visible: true,
  });

  it('the line and its answer toast once, as voices; one notice for the pair', () => {
    const lineId = '01M78DPCF6ZZ0DZ57C';
    const answerId = '01M78DPCF6ZZG7035X';
    const story = buildActStory(
      [
        fact(voiceOf(lineId, 'u525', -5, 9), 2, 1),
        fact(voiceOf(answerId, 'u531', -3, 7), 4, 1),
      ],
      { viewerMember: bard }
    );
    // Both voices stay in the log.
    expect(story.map((row) => row.headline)).toEqual([
      'You hear a voice',
      'You hear a voice',
    ]);
    const toasts = story.filter((row) => row.toastRule);
    expect(toasts).toHaveLength(1);
    expect(toasts[0]!.noticeHeadline).toBe('You hear voices');
    expect(toasts[0]!.detail).toBe('1 room away');
    // One voice cue on the map, at the first voice's place.
    expect(voicesAtPlaces(toasts)).toEqual([
      { id: toasts[0]!.id, x: -5, y: 9, line: 'a voice' },
    ]);
  });

  it('words caught still notify per line', () => {
    const story = buildActStory(
      [
        fact(
          speech(
            { words: 'Who goes?', loudness: Loudness.SPEAK, hops: 1 },
            [Sense.HEARING],
            { id: 'a', tag }
          ),
          1,
          0
        ),
        fact(
          speech(
            { words: 'A friend.', loudness: Loudness.SPEAK, hops: 1 },
            [Sense.HEARING],
            { id: 'b', tag }
          ),
          2,
          0
        ),
      ],
      { viewerMember: bard }
    );
    expect(story.filter((row) => row.toastRule)).toHaveLength(2);
    expect(story.every((row) => row.noticeHeadline === undefined)).toBe(true);
  });
});

describe('a shout caught through a wall keeps its words (the operator’s run on rpg-dnd5e-web#1416, bade8743)', () => {
  // The barbarian's versions, as the castle record holds them (session
  // 3b24f584…, seq 952 and 957 under one act): the bard's shout to the
  // pedlar with its words, one room off, no speaker, no addressee; and the
  // pedlar's reply as a voice only.
  const tag = 'speak:01M78FGHHV78EWWRWPNWDNF0NV';
  const barbarian = 'char_724d38a3-a34f-4535-9083-85abab79322b';
  const shoutId = '01M78FGHJ06DQ1TCHHP1FEZY2W';
  const replyId = '01M78FGHJ35J2A5W3Z97SK78FN';
  const shout = speech(
    {
      utterance: 'u952',
      words: 'Oi! Pedlar! What have you got to sell?',
      option: 'hail-the-pedlar',
      hops: 1,
      loudness: Loudness.SHOUT,
      place: { x: -2, y: 14 },
    },
    [Sense.HEARING],
    { id: shoutId, tag }
  );
  const reply = speech(
    {
      utterance: 'u957',
      hops: 1,
      loudness: Loudness.SPEAK,
      place: { x: 0, y: 14 },
    },
    [Sense.HEARING],
    { id: replyId, tag }
  );
  const fact = (act: Act, seq: number, index: number): CombatStoryFact => ({
    act,
    index,
    seq: BigInt(seq),
    source: 'live',
    visible: true,
  });
  const context = { viewerMember: barbarian };
  const toasts = (story: ReturnType<typeof buildActStory>) =>
    story.filter((row) => row.toastRule);

  it('in record order, the words are the exchange’s one notice; the reply is a log row and a map cue', () => {
    const story = buildActStory(
      [fact(shout, 2, 1), fact(reply, 4, 1)],
      context
    );
    expect(story.map((row) => row.headline)).toEqual([
      'Someone shouts: “Oi! Pedlar! What have you got to sell?”',
      'You hear a voice',
    ]);
    const shown = toasts(story);
    expect(shown).toHaveLength(1);
    expect(shown[0]!.toastRule?.case).toBe('heard-speech');
    expect(shown[0]!.detail).toBe('1 room away');
    expect(shown[0]!.noticeHeadline).toBeUndefined();
    // The reply still marks its place, for as long as the shout's notice shows.
    expect(voicesAtPlaces(shown, story)).toEqual([
      {
        id: shown[0]!.id,
        x: -2,
        y: 14,
        line: 'Oi! Pedlar! What have you got to sell?',
      },
      { id: story[1]!.id, x: 0, y: 14, line: 'a voice' },
    ]);
  });

  it('in separate stream messages, the same: each rebuild keeps the words as the notice', () => {
    const first = buildActStory([fact(shout, 2, 1)], context);
    expect(toasts(first).map((row) => row.headline)).toEqual([
      'Someone shouts: “Oi! Pedlar! What have you got to sell?”',
    ]);
    const second = buildActStory(
      [fact(shout, 2, 1), fact(reply, 4, 1)],
      context
    );
    expect(toasts(second).map((row) => row.headline)).toEqual([
      'Someone shouts: “Oi! Pedlar! What have you got to sell?”',
    ]);
  });

  it('the other order: a voice-only line, then an answer with words — the words take the notice', () => {
    const line = speech(
      {
        utterance: 'u1',
        hops: 1,
        loudness: Loudness.SPEAK,
        place: { x: 0, y: 14 },
      },
      [Sense.HEARING],
      { id: 'a1', tag }
    );
    const answer = speech(
      {
        utterance: 'u2',
        words: 'Get off my gate!',
        hops: 1,
        loudness: Loudness.SHOUT,
        place: { x: -2, y: 14 },
      },
      [Sense.HEARING],
      { id: 'a2', tag }
    );
    // Alone, the voice is the notice…
    expect(
      toasts(buildActStory([fact(line, 1, 0)], context)).map(
        (row) => row.headline
      )
    ).toEqual(['You hear a voice']);
    // …and once the words arrive, they are, never merged into "voices".
    const story = buildActStory(
      [fact(line, 1, 0), fact(answer, 2, 0)],
      context
    );
    const shown = toasts(story);
    expect(shown.map((row) => row.headline)).toEqual([
      'Someone shouts: “Get off my gate!”',
    ]);
    expect(story.every((row) => row.noticeHeadline === undefined)).toBe(true);
  });
});
