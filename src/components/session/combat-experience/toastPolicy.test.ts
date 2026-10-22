// @vitest-environment node
import { create, type MessageInitShape } from '@bufbuild/protobuf';
import {
  ActSchema,
  AttackOutcome,
  CastOutcome,
  ClockMark,
  Family,
  PartyKind,
  Sense,
  StateKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { describe, expect, it } from 'vitest';
import { toastDurationMs, toastFor } from './toastPolicy';

const alice = { kind: PartyKind.MEMBER, id: 'alice' };
const bob = { kind: PartyKind.MEMBER, id: 'bob' };
const captain = { kind: PartyKind.MEMBER, id: 'captain' };
type Body = MessageInitShape<typeof ActSchema>['body'];
function act(family: Family, body: Body, verb = '', tag = '') {
  return create(ActSchema, { id: 'id-1', family, verb, act: tag, body });
}
const swing = (by: typeof alice, to: typeof alice, outcome: AttackOutcome) =>
  act(Family.ACT, {
    case: 'attack',
    value: {
      by,
      to,
      attack: { name: 'Longsword' },
      outcome,
      roll: { total: 12, against: 13, beaten: false },
    },
  });

describe('toasts own outcome', () => {
  it('your swing toasts for you, not for another member', () => {
    const cut = swing(alice, captain, AttackOutcome.HIT);
    expect(toastFor(cut, 'alice', true)?.case).toBe('own-outcome');
    expect(toastFor(cut, 'bob', true)).toBeNull();
  });

  it('your deed with no outcome or roll does not toast', () => {
    const loot = act(Family.ACT, {
      case: 'loot',
      value: { by: alice, from: captain },
    });
    expect(toastFor(loot, 'alice', false)).toBeNull();
  });

  it('your own line with its answer folded in is your outcome', () => {
    const line = act(Family.ACT, {
      case: 'speak',
      value: { by: alice, to: captain, line: 'Stand aside.', answer: {} },
    });
    expect(toastFor(line, 'alice', false)?.case).toBe('own-outcome');
  });
});

describe('toasts a miss against you, not another’s miss', () => {
  it('a miss at you toasts as done to you', () => {
    const miss = swing(captain, alice, AttackOutcome.MISS);
    expect(toastFor(miss, 'alice', true)?.case).toBe('done-to-you');
  });

  it('a miss at another does not toast for you', () => {
    const miss = swing(captain, bob, AttackOutcome.MISS);
    expect(toastFor(miss, 'alice', true)).toBeNull();
  });

  it('a warded reaction at you toasts as done to you', () => {
    const warded = create(ActSchema, {
      ...swing(captain, alice, AttackOutcome.WARDED),
      family: Family.REACTION,
    });
    expect(toastFor(warded, 'alice', true)?.case).toBe('done-to-you');
  });

  it('a cast you saved against toasts as done to you', () => {
    const cast = act(Family.ACT, {
      case: 'cast',
      value: {
        by: captain,
        results: [{ target: alice, outcome: CastOutcome.SAVED }],
      },
    });
    expect(toastFor(cast, 'alice', true)?.case).toBe('done-to-you');
    expect(toastFor(cast, 'bob', true)).toBeNull();
  });

  it('a state change on you toasts; on another it does not', () => {
    const down = act(Family.STATE, {
      case: 'state',
      value: { party: alice, change: StateKind.DOWNED },
    });
    expect(toastFor(down, 'alice', true)?.case).toBe('done-to-you');
    expect(toastFor(down, 'bob', true)).toBeNull();
  });
});

describe('a save an ability forces on you', () => {
  const ogre = { kind: PartyKind.MEMBER, id: 'ogre' };
  it('toasts as done to you, as a spell’s save does', () => {
    const fear = act(Family.ACT, {
      case: 'activate',
      value: {
        by: ogre,
        ability: { name: 'Frightful Presence' },
        saves: [
          {
            saver: alice,
            ability: 'wis',
            roll: { total: 8, against: 14, beaten: false },
          },
        ],
      },
    });
    expect(toastFor(fear, 'alice', true)?.case).toBe('done-to-you');
    expect(toastFor(fear, 'bob', true)).toBeNull();
  });

  it('an ability’s result on you toasts as done to you', () => {
    const heal = act(Family.ACT, {
      case: 'activate',
      value: {
        by: bob,
        ability: { name: 'Healing Word' },
        results: [{ target: alice, kind: 'healing', amount: 4 }],
      },
    });
    expect(toastFor(heal, 'alice', false)?.case).toBe('done-to-you');
  });
});

describe('toasts your window', () => {
  it('a reaction window offered to you toasts; to another it does not', () => {
    const window = act(Family.CLOCK, {
      case: 'clock',
      value: {
        mark: ClockMark.WINDOW_OPENED,
        window: { member: captain, windows: [{ audience: alice }] },
      },
    });
    expect(toastFor(window, 'alice', true)?.case).toBe('your-window');
    expect(toastFor(window, 'bob', true)).toBeNull();
  });

  it('a roll window for you toasts', () => {
    const rollWindow = act(Family.CLOCK, {
      case: 'clock',
      value: {
        mark: ClockMark.ROLL_WINDOW_OPENED,
        rollWindow: { audience: alice },
      },
    });
    expect(toastFor(rollWindow, 'alice', true)?.case).toBe('your-window');
    expect(toastFor(rollWindow, 'bob', true)).toBeNull();
  });
});

describe('toasts fight formed and dissolved', () => {
  const formed = act(Family.CLOCK, {
    case: 'clock',
    value: { mark: ClockMark.FIGHT_FORMED, fight: { order: [alice, captain] } },
  });
  const ended = act(Family.CLOCK, {
    case: 'clock',
    value: {
      mark: ClockMark.FIGHT_DISSOLVED,
      dissolved: { members: [alice, captain] },
    },
  });

  it('for a member in the fight', () => {
    expect(toastFor(formed, 'alice', true)?.case).toBe('fight-formed');
    expect(toastFor(ended, 'alice', false)?.case).toBe('fight-ended');
  });

  it('not for a member outside it', () => {
    expect(toastFor(formed, 'bob', false)).toBeNull();
    expect(toastFor(ended, 'bob', false)).toBeNull();
  });

  it('a dissolve naming no members counts for everyone', () => {
    const unnamed = act(Family.CLOCK, {
      case: 'clock',
      value: { mark: ClockMark.FIGHT_DISSOLVED },
    });
    expect(toastFor(unnamed, 'alice', false)?.case).toBe('fight-ended');
    expect(toastFor(unnamed, 'bob', false)?.case).toBe('fight-ended');
  });

  it('a turn passing does not toast', () => {
    const turn = act(Family.CLOCK, {
      case: 'clock',
      value: { mark: ClockMark.TURN_ENDED, turn: { member: bob, next: alice } },
    });
    expect(toastFor(turn, 'alice', true)).toBeNull();
  });
});

describe('a creature’s answer to your line', () => {
  const answer = act(
    Family.TABLE_ANSWER,
    { case: 'tableAnswer', value: { who: captain, word: 'refuses' } },
    'speak',
    'speak:id-0'
  );

  it('toasts for the member who spoke the line', () => {
    expect(toastFor(answer, 'alice', false, 'alice')?.case).toBe(
      'answer-to-your-line'
    );
  });

  it('does not toast for another member', () => {
    expect(toastFor(answer, 'bob', false, 'alice')).toBeNull();
  });
});

describe('never toasts a walk or a table pick', () => {
  it('your own walk does not toast', () => {
    const walk = act(Family.ACT, {
      case: 'walk',
      value: { mover: alice, path: [{}, {}] },
    });
    expect(toastFor(walk, 'alice', false)).toBeNull();
  });

  it('a table pick does not toast, even with a roll', () => {
    const pick = act(
      Family.TABLE_ANSWER,
      {
        case: 'tableAnswer',
        value: { who: captain, word: 'patrol', roll: { total: 4, of: 6 } },
      },
      'time'
    );
    expect(toastFor(pick, 'alice', false)).toBeNull();
  });

  it('a perception does not toast, even your own', () => {
    const heard = act(Family.PERCEPTION, {
      case: 'perception',
      value: { observer: alice, sense: Sense.HEARING },
    });
    expect(toastFor(heard, 'alice', false)).toBeNull();
  });
});

describe('a combat toast holds', () => {
  it('holds when it fires while a fight is formed, not otherwise', () => {
    const miss = swing(captain, alice, AttackOutcome.MISS);
    expect(toastFor(miss, 'alice', true)?.hold).toBe(true);
    expect(toastFor(miss, 'alice', false)?.hold).toBe(false);
  });
});

describe('duration scales with length', () => {
  it('2.5 s plus 60 ms per character, between 3 and 9 s', () => {
    expect(toastDurationMs('x'.repeat(20))).toBe(3700);
    expect(toastDurationMs('x'.repeat(80))).toBe(7300);
    expect(toastDurationMs('x'.repeat(200))).toBe(9000);
    expect(toastDurationMs('')).toBe(3000);
  });
});
