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
  const FIGHT = new Set([MEMBER, 'goblin']);

  it('paces another fight member’s walk, swing and turn end', () => {
    expect(beatActor(walk('goblin'))).toBe('goblin');
    expect(beatActor(swing('goblin'))).toBe('goblin');
    expect(beatActor(turnEnded('goblin', MEMBER))).toBe('goblin');
    expect(needsPacing(walk('goblin'), MEMBER, FIGHT)).toBe(true);
    expect(needsPacing(swing('goblin'), MEMBER, FIGHT)).toBe(true);
    expect(needsPacing(turnEnded('goblin', MEMBER), MEMBER, FIGHT)).toBe(true);
  });

  it('never paces the local player, or an act with no paced actor', () => {
    expect(needsPacing(walk(MEMBER), MEMBER, FIGHT)).toBe(false);
    expect(needsPacing(swing(MEMBER), MEMBER, FIGHT)).toBe(false);
    expect(needsPacing(downed(), MEMBER, FIGHT)).toBe(false);
  });

  it('a world-pace walk or swing by somebody outside the fight is not a turn (rpg-project#685)', () => {
    expect(needsPacing(walk('commoner'), MEMBER, FIGHT)).toBe(false);
    expect(needsPacing(swing('commoner'), MEMBER, FIGHT)).toBe(false);
    // A turn end is the fight's own clock: it is always a turn.
    expect(needsPacing(turnEnded('commoner', MEMBER), MEMBER, FIGHT)).toBe(
      true
    );
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

  it('processes the head once its actor is announced, never consuming the queue', () => {
    const head = beat(walk('goblin'));
    const queue = [head, beat(swing('goblin'))];
    expect(nextBeatStep(queue, 'goblin')).toEqual({
      type: 'process',
      beat: head,
      actor: 'goblin',
    });
    // The CALLER shifts on a process step.
    expect(queue).toHaveLength(2);
  });

  it('walks a full turn: one announce, then walk, swing and turn end in order', () => {
    const w = beat(walk('goblin'));
    const s = beat(swing('goblin'));
    const t = beat(turnEnded('goblin', MEMBER));
    const queue = [w, s, t];

    expect(nextBeatStep(queue, null)).toEqual({
      type: 'announce',
      actor: 'goblin',
    });
    const announced = 'goblin';
    for (const expected of [w, s, t]) {
      expect(nextBeatStep(queue, announced)).toEqual({
        type: 'process',
        beat: expected,
        actor: 'goblin',
      });
      queue.shift();
    }
    expect(nextBeatStep(queue, announced)).toEqual({ type: 'idle' });
  });

  it('announces the next actor once the caller resets after a turn end', () => {
    // The pacing hook resets the announced actor to null after processing
    // goblin's turn end; the next actor's first beat announces.
    const queue = [beat(walk('orc'))];
    expect(nextBeatStep(queue, null)).toEqual({
      type: 'announce',
      actor: 'orc',
    });
  });
});
