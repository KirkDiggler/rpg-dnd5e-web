import { create, type MessageInitShape } from '@bufbuild/protobuf';
import {
  EventKind,
  EventSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { PlacementKind } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
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
import { refreshKeysFor } from './sessionRefreshKeys';

const VIEWER = 'p1';
const me = { kind: PartyKind.MEMBER, id: VIEWER };
const them = { kind: PartyKind.MEMBER, id: 'scout' };

type ActInit = MessageInitShape<typeof ActSchema>;
type EventInit = MessageInitShape<typeof EventSchema>;

function act(family: Family, body: ActInit['body']) {
  return create(ActSchema, { id: 'id-1', family, body });
}
function v1(body: EventInit['body'], kind = EventKind.UNSPECIFIED) {
  return create(EventSchema, { kind, body });
}

/**
 * Each act beside the v1 event it replaces. The act stream folds several v1
 * beats into one act in places (a cast and its results, a line and its
 * answer); the v1 side names the beat whose row the act must reproduce.
 */
const PAIRS: [string, ReturnType<typeof act>, ReturnType<typeof v1>][] = [
  [
    'own walk',
    act(Family.ACT, { case: 'walk', value: { mover: me } }),
    v1({ case: 'moved', value: { member: VIEWER } }),
  ],
  [
    'their walk',
    act(Family.ACT, { case: 'walk', value: { mover: them } }),
    v1({ case: 'moved', value: { member: 'scout' } }),
  ],
  [
    'hit',
    act(Family.ACT, { case: 'attack', value: { outcome: AttackOutcome.HIT } }),
    v1({ case: 'struck', value: {} }),
  ],
  [
    'miss',
    act(Family.ACT, { case: 'attack', value: { outcome: AttackOutcome.MISS } }),
    v1({ case: 'missed', value: {} }),
  ],
  [
    'warded',
    act(Family.ACT, {
      case: 'attack',
      value: { outcome: AttackOutcome.WARDED },
    }),
    v1({ case: 'warded', value: {} }),
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
    v1({ case: 'struck', value: {} }),
  ],
  [
    'cast',
    act(Family.ACT, {
      case: 'cast',
      value: { results: [{ outcome: CastOutcome.FAILED }] },
    }),
    v1({ case: 'cast', value: {} }),
  ],
  [
    'cast warded',
    act(Family.ACT, {
      case: 'cast',
      value: { results: [{ outcome: CastOutcome.WARDED }] },
    }),
    v1({ case: 'castWarded', value: {} }),
  ],
  [
    'activated alone',
    act(Family.ACT, { case: 'activate', value: { by: me } }),
    v1({ case: 'activated', value: {} }),
  ],
  [
    'activation',
    act(Family.ACT, {
      case: 'activate',
      value: { results: [{ kind: 'healed' }] },
    }),
    v1({ case: 'activationResult', value: {} }),
  ],
  [
    'stabilized',
    act(Family.ACT, {
      case: 'activate',
      value: {
        results: [{ kind: 'stabilized', stabilization: { stabilized: true } }],
      },
    }),
    v1({
      case: 'activationResult',
      value: { result: { case: 'stabilized', value: {} } },
    }),
  ],
  [
    'own line',
    act(Family.ACT, { case: 'speak', value: { by: me } }),
    v1({ case: 'spoke', value: { actor: VIEWER } }),
  ],
  [
    'their line',
    act(Family.ACT, { case: 'speak', value: { by: them } }),
    v1({ case: 'spoke', value: { actor: 'scout' } }),
  ],
  [
    'death save',
    act(Family.ACT, { case: 'deathSave', value: { by: me } }),
    v1({ case: 'deathSaveRolled', value: {} }),
  ],
  [
    'loot',
    act(Family.ACT, { case: 'loot', value: { by: me } }),
    v1({ case: 'looted', value: {} }),
  ],
  [
    'hold',
    act(Family.ACT, { case: 'hold', value: { by: me } }),
    v1({ case: 'held', value: {} }),
  ],
  [
    'drop',
    act(Family.ACT, { case: 'drop', value: { by: me } }),
    v1({ case: 'dropped', value: {} }),
  ],
  [
    'door',
    act(Family.ACT, { case: 'door', value: { door: 'gate' } }),
    v1({ case: 'door', value: {} }),
  ],
  [
    'equip',
    act(Family.ACT, { case: 'equip', value: { by: me } }),
    v1({ case: 'equipmentChanged', value: {} }),
  ],
  [
    'stay',
    act(Family.ACT, { case: 'stay', value: { member: them } }),
    v1({ case: 'stayed', value: {} }),
  ],
  [
    'sneak',
    act(Family.ACT, { case: 'sneak', value: { by: me } }),
    v1({ case: 'snuck', value: {} }),
  ],
  [
    'rest',
    act(Family.ACT, { case: 'rest', value: { by: me } }),
    v1({ case: 'rested', value: {} }),
  ],
  [
    'answer',
    act(Family.TABLE_ANSWER, { case: 'tableAnswer', value: { word: 'yield' } }),
    v1({ case: 'answered', value: {} }),
  ],
  [
    'temper',
    act(Family.TABLE_ANSWER, {
      case: 'tableAnswer',
      value: { dealt: { temper: 'wary' } },
    }),
    v1({ case: 'tempered', value: {} }),
  ],
  [
    'downed',
    act(Family.STATE, { case: 'state', value: { change: StateKind.DOWNED } }),
    v1({ case: 'downed', value: {} }),
  ],
  [
    'stance',
    act(Family.STATE, { case: 'state', value: { change: StateKind.STANCE } }),
    v1({ case: 'stanceChanged', value: {} }),
  ],
  [
    'concentration',
    act(Family.STATE, {
      case: 'state',
      value: { change: StateKind.CONCENTRATION_ENDED },
    }),
    v1({ case: 'concentrationEnded', value: {} }),
  ],
  [
    'condition lifted',
    act(Family.STATE, {
      case: 'state',
      value: { change: StateKind.CONDITION_REMOVED },
    }),
    v1({ case: 'activationResult', value: {} }),
  ],
  [
    'experience',
    act(Family.STATE, {
      case: 'state',
      value: { change: StateKind.EXPERIENCE },
    }),
    v1({ case: 'experienceGained', value: {} }),
  ],
  [
    'sighted',
    act(Family.PERCEPTION, {
      case: 'perception',
      value: { sense: Sense.SIGHT },
    }),
    v1({ case: 'sighted', value: {} }),
  ],
  [
    'heard',
    act(Family.PERCEPTION, {
      case: 'perception',
      value: { sense: Sense.HEARING },
    }),
    v1({ case: 'heard', value: {} }),
  ],
  [
    'discovery',
    act(Family.PERCEPTION, {
      case: 'perception',
      value: { sense: Sense.DISCOVERY, observer: me },
    }),
    v1({ case: 'discoveryChecked', value: { member: VIEWER } }),
  ],
  [
    'revealed',
    act(Family.PERCEPTION, {
      case: 'perception',
      value: { sense: Sense.REVEAL },
    }),
    v1({ case: 'concealmentRevealed', value: {} }),
  ],
  [
    'cells',
    act(Family.PERCEPTION, {
      case: 'perception',
      value: { sense: Sense.CELLS },
    }),
    v1({ case: 'cellsRevealed', value: {} }),
  ],
  [
    'tick',
    act(Family.CLOCK, { case: 'clock', value: { mark: ClockMark.TICK } }),
    v1(undefined as never, EventKind.TICK),
  ],
  [
    'turn ended',
    act(Family.CLOCK, { case: 'clock', value: { mark: ClockMark.TURN_ENDED } }),
    v1({ case: 'turnEnded', value: {} }),
  ],
  [
    'fight formed',
    act(Family.CLOCK, {
      case: 'clock',
      value: { mark: ClockMark.FIGHT_FORMED },
    }),
    v1({ case: 'fightStarted', value: {} }),
  ],
  [
    'fight dissolved',
    act(Family.CLOCK, {
      case: 'clock',
      value: { mark: ClockMark.FIGHT_DISSOLVED },
    }),
    v1({ case: 'fightEnded', value: {} }),
  ],
  [
    'joined',
    act(Family.CLOCK, { case: 'clock', value: { mark: ClockMark.JOINED } }),
    v1({ case: 'joined', value: {} }),
  ],
  [
    'exited',
    act(Family.CLOCK, { case: 'clock', value: { mark: ClockMark.EXITED } }),
    v1({ case: 'exited', value: {} }),
  ],
  [
    'arrived monster',
    act(Family.CLOCK, {
      case: 'clock',
      value: { mark: ClockMark.ARRIVED, arrival: { kind: 'monster' } },
    }),
    v1({ case: 'arrived', value: { kind: PlacementKind.MONSTER } }),
  ],
  [
    'arrived prop',
    act(Family.CLOCK, {
      case: 'clock',
      value: { mark: ClockMark.ARRIVED, arrival: { kind: 'prop' } },
    }),
    v1({ case: 'arrived', value: { kind: PlacementKind.PROP } }),
  ],
  [
    'ended',
    act(Family.CLOCK, { case: 'clock', value: { mark: ClockMark.ENDED } }),
    v1({ case: 'ended', value: {} }),
  ],
  [
    'window',
    act(Family.CLOCK, {
      case: 'clock',
      value: { mark: ClockMark.WINDOW_OPENED },
    }),
    v1({ case: 'windowOpened', value: {} }),
  ],
  [
    'roll window',
    act(Family.CLOCK, {
      case: 'clock',
      value: { mark: ClockMark.ROLL_WINDOW_OPENED },
    }),
    v1({ case: 'rollWindowOpened', value: {} }),
  ],
  [
    'scene opened',
    act(Family.CLOCK, {
      case: 'clock',
      value: { mark: ClockMark.SCENE_OPENED },
    }),
    v1(undefined as never, EventKind.SCENE_OPENED),
  ],
];

describe('refreshKeysForAct', () => {
  it.each(PAIRS)('refresh keys match v1 for each family: %s', (_, a, e) => {
    expect(new Set(refreshKeysForAct(a, VIEWER))).toEqual(
      new Set(refreshKeysFor(e, VIEWER))
    );
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
