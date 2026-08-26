import type { Event as SessionEvent } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { describe, expect, it } from 'vitest';
import { beatActor, needsPacing, nextBeatStep } from './monsterBeatQueue';

const MEMBER = 'char-1';

function moved(member: string): SessionEvent {
  return {
    body: { case: 'moved', value: { member, to: { x: 0, y: 0 } } },
  } as SessionEvent;
}

function struck(attacker: string, target = MEMBER): SessionEvent {
  return {
    body: {
      case: 'struck',
      value: {
        attacker,
        target,
        roll: 15,
        total: 20,
        against: 13,
        damage: 5,
        critical: false,
      },
    },
  } as SessionEvent;
}

function missed(attacker: string, target = MEMBER): SessionEvent {
  return {
    body: {
      case: 'missed',
      value: { attacker, target, roll: 5, total: 10, against: 13 },
    },
  } as SessionEvent;
}

function turnEnded(member: string, next: string): SessionEvent {
  return {
    body: { case: 'turnEnded', value: { member, next } },
  } as SessionEvent;
}

function downed(member: string): SessionEvent {
  return { body: { case: 'downed', value: { member } } } as SessionEvent;
}

function untypedMoved(): SessionEvent {
  // A legacy/untyped fixture — kind set, no body. beatActor must not
  // throw on it (this module reads `event.body?.case`, never `.kind`).
  return { body: { case: undefined } } as SessionEvent;
}

describe('beatActor', () => {
  it("reads moved's member", () => {
    expect(beatActor(moved('skeleton-1'))).toBe('skeleton-1');
  });

  it("reads struck/missed's attacker, not their target", () => {
    expect(beatActor(struck('skeleton-1', MEMBER))).toBe('skeleton-1');
    expect(beatActor(missed('skeleton-1', MEMBER))).toBe('skeleton-1');
  });

  it("reads turnEnded's member (whose turn ended), not next", () => {
    expect(beatActor(turnEnded('skeleton-1', MEMBER))).toBe('skeleton-1');
  });

  it('has no opinion on a kind it does not narrate as a turn — downed is a victim, not a turn owner', () => {
    expect(beatActor(downed('skeleton-1'))).toBeUndefined();
  });

  it('returns undefined for an untyped/legacy fixture rather than throwing', () => {
    expect(beatActor(untypedMoved())).toBeUndefined();
  });
});

describe('needsPacing', () => {
  it("is true for another member's moved/struck/missed/turnEnded", () => {
    expect(needsPacing(moved('skeleton-1'), MEMBER)).toBe(true);
    expect(needsPacing(struck('skeleton-1'), MEMBER)).toBe(true);
    expect(needsPacing(missed('skeleton-1'), MEMBER)).toBe(true);
    expect(needsPacing(turnEnded('skeleton-1', MEMBER), MEMBER)).toBe(true);
  });

  it("is false for the LOCAL PLAYER's own moved/struck/missed/turnEnded — player-initiated beats stay immediate", () => {
    expect(needsPacing(moved(MEMBER), MEMBER)).toBe(false);
    expect(needsPacing(struck(MEMBER, 'skeleton-1'), MEMBER)).toBe(false);
    expect(needsPacing(missed(MEMBER, 'skeleton-1'), MEMBER)).toBe(false);
    expect(needsPacing(turnEnded(MEMBER, 'skeleton-1'), MEMBER)).toBe(false);
  });

  it('is false for kinds this module never paces, even for another member', () => {
    expect(needsPacing(downed('skeleton-1'), MEMBER)).toBe(false);
    expect(
      needsPacing(
        {
          body: { case: 'fightStarted', value: { members: [] as string[] } },
        } as SessionEvent,
        MEMBER
      )
    ).toBe(false);
    expect(
      needsPacing(
        {
          body: { case: 'fightEnded', value: { cause: 0 } },
        } as SessionEvent,
        MEMBER
      )
    ).toBe(false);
  });

  it('is false for an untyped/legacy fixture', () => {
    expect(needsPacing(untypedMoved(), MEMBER)).toBe(false);
  });
});

describe('nextBeatStep', () => {
  it('is idle on an empty queue', () => {
    expect(nextBeatStep([], null)).toEqual({ type: 'idle' });
  });

  it("announces a NEW actor's turn without consuming the queue's head", () => {
    const queue = [moved('skeleton-1')];
    expect(nextBeatStep(queue, null)).toEqual({
      type: 'announce',
      actor: 'skeleton-1',
    });
    // Not mutated — a caller can call this again and again while it
    // decides whether to announce.
    expect(queue).toHaveLength(1);
  });

  it('re-announces if the head belongs to a DIFFERENT actor than the one already announced', () => {
    const queue = [moved('skeleton-2')];
    expect(nextBeatStep(queue, 'skeleton-1')).toEqual({
      type: 'announce',
      actor: 'skeleton-2',
    });
  });

  it('processes the head once its actor is already the announced one', () => {
    const head = moved('skeleton-1');
    const queue = [head, struck('skeleton-1')];
    expect(nextBeatStep(queue, 'skeleton-1')).toEqual({
      type: 'process',
      event: head,
      actor: 'skeleton-1',
    });
    // Still not mutated — the CALLER shifts on a 'process' step, per
    // this module's own doc comment.
    expect(queue).toHaveLength(2);
  });

  it('walks a full turn: announce once, then process every queued beat in order without re-announcing', () => {
    const m1 = moved('skeleton-1');
    const m2 = moved('skeleton-1');
    const s = struck('skeleton-1');
    const t = turnEnded('skeleton-1', MEMBER);
    const queue = [m1, m2, s, t];
    let announced: string | null = null;

    const step1 = nextBeatStep(queue, announced);
    expect(step1).toEqual({ type: 'announce', actor: 'skeleton-1' });
    announced = 'skeleton-1';

    const step2 = nextBeatStep(queue, announced);
    expect(step2).toEqual({ type: 'process', event: m1, actor: 'skeleton-1' });
    queue.shift();

    const step3 = nextBeatStep(queue, announced);
    expect(step3).toEqual({ type: 'process', event: m2, actor: 'skeleton-1' });
    queue.shift();

    const step4 = nextBeatStep(queue, announced);
    expect(step4).toEqual({ type: 'process', event: s, actor: 'skeleton-1' });
    queue.shift();

    const step5 = nextBeatStep(queue, announced);
    expect(step5).toEqual({ type: 'process', event: t, actor: 'skeleton-1' });
    queue.shift();

    expect(nextBeatStep(queue, null)).toEqual({ type: 'idle' });
  });

  it('re-announces the NEXT actor once the caller resets announcedActor after a turnEnded', () => {
    const t2 = moved('skeleton-2');
    const queue = [t2];
    // Caller resets announcedActor to null after processing skeleton-1's
    // own turnEnded (the pacing hook's job) — the next actor's first
    // beat announces exactly like the first ever did.
    expect(nextBeatStep(queue, null)).toEqual({
      type: 'announce',
      actor: 'skeleton-2',
    });
  });
});
