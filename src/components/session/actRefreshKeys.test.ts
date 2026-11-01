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
import { refreshKeysForAct } from './actRefreshKeys';

const VIEWER = 'p1';
const me = { kind: PartyKind.MEMBER, id: VIEWER };
const them = { kind: PartyKind.MEMBER, id: 'scout' };

type ActInit = MessageInitShape<typeof ActSchema>;

function act(family: Family, body: ActInit['body']) {
  return create(ActSchema, { id: 'id-1', family, body });
}

/**
 * Each act beside the keys it refreshes. The table was the v1 event
 * stream's (`sessionRefreshKeys.ts`) row for the beat each act replaced; it
 * is pinned here as literals since that stream left (rpg-dnd5e-web#1305).
 */

const PAIRS: [string, ReturnType<typeof act>, string[]][] = [
  [
    'own walk',
    act(Family.ACT, { case: 'walk', value: { mover: me } }),
    ['afford', 'turn', 'where'],
  ],
  [
    'their walk',
    act(Family.ACT, { case: 'walk', value: { mover: them } }),
    ['view'],
  ],
  [
    'hit',
    act(Family.ACT, { case: 'attack', value: { outcome: AttackOutcome.HIT } }),
    ['afford', 'characterData', 'view'],
  ],
  [
    'miss',
    act(Family.ACT, { case: 'attack', value: { outcome: AttackOutcome.MISS } }),
    ['afford', 'characterData', 'view'],
  ],
  [
    'warded',
    act(Family.ACT, {
      case: 'attack',
      value: { outcome: AttackOutcome.WARDED },
    }),
    ['afford', 'characterData', 'turn', 'view'],
  ],
  [
    'reaction',
    act(Family.REACTION, {
      case: 'attack',
      value: {
        outcome: AttackOutcome.HIT,
        reaction: { name: 'Opportunity Attack' },
      },
    }),
    ['afford', 'characterData', 'view'],
  ],
  [
    'cast',
    act(Family.ACT, {
      case: 'cast',
      value: { results: [{ outcome: CastOutcome.FAILED }] },
    }),
    ['afford', 'characterData', 'view'],
  ],
  [
    'cast warded',
    act(Family.ACT, {
      case: 'cast',
      value: { results: [{ outcome: CastOutcome.WARDED }] },
    }),
    ['afford', 'characterData', 'turn', 'view'],
  ],
  [
    'activated alone',
    act(Family.ACT, { case: 'activate', value: { by: me } }),
    [],
  ],
  [
    'activation',
    act(Family.ACT, {
      case: 'activate',
      value: { results: [{ kind: 'healed' }] },
    }),
    ['afford', 'characterData', 'view'],
  ],
  [
    'stabilized',
    act(Family.ACT, {
      case: 'activate',
      value: {
        results: [{ kind: 'stabilized', stabilization: { stabilized: true } }],
      },
    }),
    ['afford', 'characterData', 'turn', 'view'],
  ],
  [
    'own line',
    act(Family.ACT, { case: 'speak', value: { by: me } }),
    ['afford', 'characterData'],
  ],
  ['their line', act(Family.ACT, { case: 'speak', value: { by: them } }), []],
  [
    'death save',
    act(Family.ACT, { case: 'deathSave', value: { by: me } }),
    ['afford', 'characterData', 'view'],
  ],
  ['loot', act(Family.ACT, { case: 'loot', value: { by: me } }), []],
  ['hold', act(Family.ACT, { case: 'hold', value: { by: me } }), ['view']],
  ['drop', act(Family.ACT, { case: 'drop', value: { by: me } }), ['view']],
  [
    'door',
    act(Family.ACT, { case: 'door', value: { door: 'gate' } }),
    ['view'],
  ],
  [
    'equip',
    act(Family.ACT, { case: 'equip', value: { by: me } }),
    ['afford', 'characterData'],
  ],
  ['stay', act(Family.ACT, { case: 'stay', value: { member: them } }), []],
  ['sneak', act(Family.ACT, { case: 'sneak', value: { by: me } }), []],
  [
    'rest',
    act(Family.ACT, { case: 'rest', value: { by: me } }),
    ['afford', 'characterData', 'turn'],
  ],
  [
    'answer',
    act(Family.TABLE_ANSWER, { case: 'tableAnswer', value: { word: 'yield' } }),
    ['afford', 'view'],
  ],
  [
    'temper',
    act(Family.TABLE_ANSWER, {
      case: 'tableAnswer',
      value: { dealt: { temper: 'wary' } },
    }),
    [],
  ],
  [
    'downed',
    act(Family.STATE, { case: 'state', value: { change: StateKind.DOWNED } }),
    ['afford', 'characterData', 'turn', 'view'],
  ],
  [
    'stance',
    act(Family.STATE, { case: 'state', value: { change: StateKind.STANCE } }),
    ['afford', 'view'],
  ],
  [
    'concentration',
    act(Family.STATE, {
      case: 'state',
      value: { change: StateKind.CONCENTRATION_ENDED },
    }),
    ['characterData', 'turn'],
  ],
  [
    'condition lifted',
    act(Family.STATE, {
      case: 'state',
      value: { change: StateKind.CONDITION_REMOVED },
    }),
    ['afford', 'characterData', 'view'],
  ],
  [
    'experience',
    act(Family.STATE, {
      case: 'state',
      value: { change: StateKind.EXPERIENCE },
    }),
    ['characterData'],
  ],
  [
    'wake cut',
    act(Family.CLOCK, {
      case: 'clock',
      value: { mark: ClockMark.WAKE_CUT, wakeCut: { matched: 20, dropped: 3 } },
    }),
    [],
  ],
  [
    'machine moved',
    act(Family.STATE, {
      case: 'state',
      value: {
        change: StateKind.MACHINE,
        machine: { from: 'posted', to: 'alert', reason: 'heard something' },
      },
    }),
    [],
  ],
  [
    'sighted',
    act(Family.PERCEPTION, {
      case: 'perception',
      value: { sense: Sense.SIGHT },
    }),
    ['roster', 'view'],
  ],
  [
    'heard',
    act(Family.PERCEPTION, {
      case: 'perception',
      value: { sense: Sense.HEARING },
    }),
    [],
  ],
  [
    'discovery',
    act(Family.PERCEPTION, {
      case: 'perception',
      value: { sense: Sense.DISCOVERY, observer: me },
    }),
    ['afford', 'characterData'],
  ],
  [
    'revealed',
    act(Family.PERCEPTION, {
      case: 'perception',
      value: { sense: Sense.REVEAL },
    }),
    ['atlas', 'doors'],
  ],
  [
    'cells',
    act(Family.PERCEPTION, {
      case: 'perception',
      value: { sense: Sense.CELLS },
    }),
    ['roster', 'view'],
  ],
  [
    'tick',
    act(Family.CLOCK, { case: 'clock', value: { mark: ClockMark.TICK } }),
    [],
  ],
  [
    'turn ended',
    act(Family.CLOCK, { case: 'clock', value: { mark: ClockMark.TURN_ENDED } }),
    ['afford', 'characterData', 'turn', 'view'],
  ],
  [
    'fight formed',
    act(Family.CLOCK, {
      case: 'clock',
      value: { mark: ClockMark.FIGHT_FORMED },
    }),
    ['afford', 'characterData', 'turn', 'view'],
  ],
  [
    'fight dissolved',
    act(Family.CLOCK, {
      case: 'clock',
      value: { mark: ClockMark.FIGHT_DISSOLVED },
    }),
    ['afford', 'characterData', 'turn', 'view'],
  ],
  [
    'joined',
    act(Family.CLOCK, { case: 'clock', value: { mark: ClockMark.JOINED } }),
    ['roster'],
  ],
  [
    'exited',
    act(Family.CLOCK, { case: 'clock', value: { mark: ClockMark.EXITED } }),
    [],
  ],
  [
    'arrived monster',
    act(Family.CLOCK, {
      case: 'clock',
      value: { mark: ClockMark.ARRIVED, arrival: { kind: 'monster' } },
    }),
    ['roster', 'view'],
  ],
  [
    'arrived prop',
    act(Family.CLOCK, {
      case: 'clock',
      value: { mark: ClockMark.ARRIVED, arrival: { kind: 'prop' } },
    }),
    ['atlas', 'view'],
  ],
  [
    'ended',
    act(Family.CLOCK, { case: 'clock', value: { mark: ClockMark.ENDED } }),
    ['afford', 'characterData', 'turn', 'view'],
  ],
  [
    'window',
    act(Family.CLOCK, {
      case: 'clock',
      value: { mark: ClockMark.WINDOW_OPENED },
    }),
    ['afford', 'view'],
  ],
  [
    'roll window',
    act(Family.CLOCK, {
      case: 'clock',
      value: { mark: ClockMark.ROLL_WINDOW_OPENED },
    }),
    ['afford'],
  ],
  [
    'scene opened',
    act(Family.CLOCK, {
      case: 'clock',
      value: { mark: ClockMark.SCENE_OPENED },
    }),
    [],
  ],
];

describe('refreshKeysForAct', () => {
  it.each(PAIRS)('refresh keys for each family: %s', (_, a, keys) => {
    expect(new Set(refreshKeysForAct(a, VIEWER))).toEqual(new Set(keys));
  });

  it('a line with its answer folded in adds the answer’s row', () => {
    const line = act(Family.ACT, {
      case: 'speak',
      value: { by: me, answer: { word: 'yield' } },
    });
    expect(new Set(refreshKeysForAct(line, VIEWER))).toEqual(
      new Set(['characterData', 'afford', 'view'])
    );
  });

  it('a refused act names no keys', () => {
    const refused = create(ActSchema, {
      id: 'id-1',
      family: Family.ACT,
      refused: true,
      refusal: 'undecoded',
    });
    expect(refreshKeysForAct(refused, VIEWER)).toEqual([]);
  });
});
