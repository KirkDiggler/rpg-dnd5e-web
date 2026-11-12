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

describe('one line shows once while the retired messages still arrive', () => {
  function fact(act: Act, seq: number, index = 0): CombatStoryFact {
    return { act, index, seq: BigInt(seq), source: 'live', visible: true };
  }

  it('the retired speak act and the voice sound step aside; a pick keeps its word, not its words', () => {
    const retiredLine = create(ActSchema, {
      session: 's',
      id: 'r-1',
      act: 'speak:1',
      verb: 'speak',
      family: Family.ACT,
      body: {
        case: 'speak',
        value: {
          by: aldric,
          to: guard,
          line: 'Open the gate!',
          answer: { who: guard, word: 'refuse', say: 'No.' },
        },
      },
    });
    const voice = create(ActSchema, {
      session: 's',
      id: 'r-2',
      act: 'speak:1',
      verb: 'speak',
      family: Family.PERCEPTION,
      body: {
        case: 'perception',
        value: {
          observer: { kind: PartyKind.MEMBER, id: viewer },
          sense: Sense.HEARING,
          heard: { kind: 'voice', hops: 0 },
        },
      },
    });
    const said = speech({
      speaker: aldric,
      spokenTo: guard,
      words: 'Open the gate!',
      loudness: Loudness.SHOUT,
    });
    const answer = speech(
      { speaker: guard, words: 'No.', loudness: Loudness.SPEAK },
      [Sense.SIGHT, Sense.HEARING],
      { id: 'r-3' }
    );
    const story = buildActStory(
      [fact(retiredLine, 1), fact(voice, 2), fact(said, 3, 1), fact(answer, 4)],
      context
    );
    const heads = story.map((row) => row.headline);
    expect(heads).toEqual([
      'Gate guard: refuse',
      'Aldric shouts to Gate guard: “Open the gate!”',
      'Gate guard says: “No.”',
    ]);
    // The kept pick is quiet: the Speech rows carry the line's notices.
    expect(story[0]!.toastRule).toBeUndefined();
    expect(heads.filter((h) => h.includes('Open the gate!'))).toHaveLength(1);
  });

  it('without a Speech, the retired messages still show as before', () => {
    const retiredLine = create(ActSchema, {
      session: 's',
      id: 'r-1',
      act: 'speak:9',
      verb: 'speak',
      family: Family.ACT,
      body: {
        case: 'speak',
        value: { by: aldric, to: guard, line: 'Evening.' },
      },
    });
    const story = buildActStory([fact(retiredLine, 1)], context);
    expect(story.map((row) => row.headline)).toEqual([
      'Aldric to Gate guard: "Evening."',
    ]);
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
