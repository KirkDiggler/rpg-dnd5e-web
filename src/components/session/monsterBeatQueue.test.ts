// @vitest-environment node
import { create, type MessageInitShape } from '@bufbuild/protobuf';
import {
  ActSchema,
  AttackOutcome,
  ClockMark,
  Family,
  PartyKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { describe, expect, it } from 'vitest';
import {
  beatActor,
  needsPacing,
  nextBeatStep,
  type QueuedBeat,
} from './monsterBeatQueue';

const MEMBER = 'char-1';
const m = (id: string) => ({ kind: PartyKind.MEMBER, id });
type Body = MessageInitShape<typeof ActSchema>['body'];
const act = (family: Family, body: Body) =>
  create(ActSchema, { id: 'id-1', family, body });

const walk = (mover: string) =>
  act(Family.ACT, {
    case: 'walk',
    value: { mover: m(mover), path: [{ cell: { x: 1, y: 0 } }] },
  });
const swing = (by: string) =>
  act(Family.ACT, {
    case: 'attack',
    value: { by: m(by), to: m(MEMBER), outcome: AttackOutcome.HIT },
  });
const turnEnded = (member: string, next: string) =>
  act(Family.CLOCK, {
    case: 'clock',
    value: {
      mark: ClockMark.TURN_ENDED,
      turn: { member: m(member), next: m(next) },
    },
  });
const downed = () =>
  act(Family.STATE, { case: 'state', value: { party: m(MEMBER) } });
const beat = (a: ReturnType<typeof act>): QueuedBeat => ({ act: a, index: 0 });

describe('beatActor / needsPacing', () => {
  it('paces another member’s walk, swing and turn end', () => {
    expect(beatActor(walk('goblin'))).toBe('goblin');
    expect(beatActor(swing('goblin'))).toBe('goblin');
    expect(beatActor(turnEnded('goblin', MEMBER))).toBe('goblin');
    expect(needsPacing(walk('goblin'), MEMBER)).toBe(true);
    expect(needsPacing(swing('goblin'), MEMBER)).toBe(true);
    expect(needsPacing(turnEnded('goblin', MEMBER), MEMBER)).toBe(true);
  });

  it('never paces the local player, or an act with no paced actor', () => {
    expect(needsPacing(walk(MEMBER), MEMBER)).toBe(false);
    expect(needsPacing(swing(MEMBER), MEMBER)).toBe(false);
    expect(needsPacing(downed(), MEMBER)).toBe(false);
  });
});

describe('nextBeatStep', () => {
  it('idles on an empty queue', () => {
    expect(nextBeatStep([], null)).toEqual({ type: 'idle' });
  });

  it('announces a new actor before processing their first beat', () => {
    const queue = [beat(walk('goblin'))];
    expect(nextBeatStep(queue, null)).toEqual({
      type: 'announce',
      actor: 'goblin',
    });
    expect(nextBeatStep(queue, 'goblin')).toEqual({
      type: 'process',
      beat: queue[0],
      actor: 'goblin',
    });
  });

  it('announces again when a different actor takes the head', () => {
    const queue = [beat(swing('orc'))];
    expect(nextBeatStep(queue, 'goblin')).toEqual({
      type: 'announce',
      actor: 'orc',
    });
  });
});
