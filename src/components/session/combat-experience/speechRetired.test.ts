// @vitest-environment node
/**
 * Right without the retired speech messages (rpg-project#934): the shapes the
 * server WILL send once the SpeakAct, the table answer's `say`/`to` and the
 * voice Sound stop — a Speech act per spoken thing, and the creature's pick
 * as a standalone TableAnswer under the same `speak:` tag with its key, word,
 * roll and activity and an empty `say`/`to`.
 */
import { sayActivityFromAct } from '@/npc-activities/sayActivityPresentation';
import { create } from '@bufbuild/protobuf';
import {
  ActSchema,
  Family,
  Loudness,
  PartyKind,
  Sense,
  type Act,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { describe, expect, it } from 'vitest';
import { beatActor, needsPacing } from '../monsterBeatQueue';
import { buildActStory, type CombatStoryFact } from './actStory';
import { isKeptRollAct } from './selection';
import { actorOf, toastFor } from './toastPolicy';

const bard = 'char_bard';
const tag = 'speak:01M7RETIRE0000000000000001';
const bardParty = { kind: PartyKind.MEMBER, id: bard };
const guard = { kind: PartyKind.MEMBER, id: 'gate-1' };
const check = { total: 17, against: 13, beaten: true };

function speechAct(
  id: string,
  value: Record<string, unknown>,
  senses = [Sense.SIGHT, Sense.HEARING]
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
      value: { place: { x: 1, y: 1 }, loudness: Loudness.SPEAK, ...value },
    },
  } as never);
}

/** The bard's own line with its check, as the bard reads it. */
const line = speechAct('r1', {
  utterance: 'u1',
  speaker: bardParty,
  spokenTo: guard,
  words: 'We’re the troupe for tonight’s feast.',
  option: 'troupe',
  roll: check,
  skill: 'performance',
});

/** The guard's pick, standing alone: no SpeakAct to fold into, no say/to. */
const pick = create(ActSchema, {
  session: 's',
  id: 'r2',
  act: tag,
  verb: 'speak',
  family: Family.TABLE_ANSWER,
  body: {
    case: 'tableAnswer',
    value: {
      who: guard,
      key: 'success',
      word: 'admit',
      roll: { total: 41, of: 100, dice: [41] },
      activity: { ref: 'dnd5e:activities:thoughtful', cycles: 2 },
      say: '',
    },
  },
} as never);

/** The guard's words, to the bard. */
const reply = speechAct('r3', {
  utterance: 'u3',
  speaker: guard,
  spokenTo: bardParty,
  words: 'Through to the hall, then.',
});

const fact = (act: Act, seq: number): CombatStoryFact => ({
  act,
  index: 0,
  seq: BigInt(seq),
  source: 'live',
  visible: true,
});

describe('without the retired messages', () => {
  it('one exchange toasts once per line: the own line, the answer to it — never the pick', () => {
    const story = buildActStory(
      [fact(line, 1), fact(pick, 2), fact(reply, 3)],
      {
        viewerMember: bard,
        memberNames: { [bard]: 'Bree', 'gate-1': 'Gate guard' },
      }
    );
    expect(story.map((row) => [row.headline, row.toastRule?.case])).toEqual([
      [
        'Bree says to Gate guard: “We’re the troupe for tonight’s feast.”',
        'own-outcome',
      ],
      ['Gate guard: admit', undefined],
      [
        'Gate guard says to Bree: “Through to the hall, then.”',
        'answer-to-your-line',
      ],
    ]);
  });

  it('the creature’s activity cue plays from its pick, with no say', () => {
    expect(sayActivityFromAct({ act: pick, id: 'row-2' })).toEqual({
      member: 'gate-1',
      cue: {
        id: 'row-2',
        activityRef: 'dnd5e:activities:thoughtful',
        cycles: 2,
      },
    });
  });

  it('a line is its speaker’s beat and deed; an unseen speaker is nobody’s', () => {
    expect(beatActor(line)).toBe(bard);
    expect(actorOf(line)?.id).toBe(bard);
    expect(needsPacing(line, 'char_barb', new Set([bard]))).toBe(true);
    expect(needsPacing(line, bard, new Set([bard]))).toBe(false);
    const unseen = speechAct('r4', { utterance: 'u4', hops: 1 }, [
      Sense.HEARING,
    ]);
    expect(beatActor(unseen)).toBeUndefined();
    expect(actorOf(unseen)).toBeUndefined();
    expect(toastFor(line, bard, false)?.case).toBe('own-outcome');
  });

  it('a kept roll is read off the viewer’s own Speech inside another verb’s act', () => {
    const kept = create(ActSchema, {
      ...line,
      act: 'move:01M7X',
      verb: 'move',
    });
    expect(isKeptRollAct(kept, bard)).toBe(true);
    expect(isKeptRollAct(kept, 'char_barb')).toBe(false);
    expect(isKeptRollAct(line, bard)).toBe(false);
    const noRoll = create(ActSchema, {
      ...speechAct('r5', { utterance: 'u5', speaker: bardParty, words: 'Hm.' }),
      act: 'move:01M7Y',
      verb: 'move',
    });
    expect(isKeptRollAct(noRoll, bard)).toBe(false);
  });
});

describe('with both sets still sent (today)', () => {
  it('the retired SpeakAct steps aside, its folded pick stays quiet, and the Speech rows toast', () => {
    const retired = create(ActSchema, {
      session: 's',
      id: 'r1',
      act: tag,
      verb: 'speak',
      family: Family.ACT,
      body: {
        case: 'speak',
        value: {
          by: bardParty,
          to: guard,
          line: 'We’re the troupe for tonight’s feast.',
          roll: check,
          answer: {
            who: guard,
            word: 'admit',
            say: 'Through to the hall, then.',
          },
        },
      },
    } as never);
    const story = buildActStory(
      [fact(retired, 1), { ...fact(line, 2), index: 1 }, fact(reply, 3)],
      {
        viewerMember: bard,
        memberNames: { [bard]: 'Bree', 'gate-1': 'Gate guard' },
      }
    );
    expect(story.map((row) => [row.headline, row.toastRule?.case])).toEqual([
      ['Gate guard: admit', undefined],
      [
        'Bree says to Gate guard: “We’re the troupe for tonight’s feast.”',
        'own-outcome',
      ],
      [
        'Gate guard says to Bree: “Through to the hall, then.”',
        'answer-to-your-line',
      ],
    ]);
    // The cue still plays from the folded answer while it is sent.
    expect(
      sayActivityFromAct({
        act: create(ActSchema, {
          ...retired,
          body: {
            case: 'speak',
            value: {
              by: bardParty,
              answer: {
                who: guard,
                say: 'Through to the hall, then.',
                activity: { ref: 'dnd5e:activities:thoughtful', cycles: 1 },
              },
            },
          },
        } as never),
        id: 'row-1',
      })?.member
    ).toBe('gate-1');
  });
});
