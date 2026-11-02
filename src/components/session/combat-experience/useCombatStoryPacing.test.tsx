import { resetDial, setDial } from '@/feel/dialStore';
import { create } from '@bufbuild/protobuf';
import {
  MemberKind,
  ParticipantSchema,
  Standing,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  ActSchema,
  AttackOutcome,
  ClockMark,
  Family,
  PartyKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actStoryId, buildActStory } from './actStory';
import { createAttackAuthorityFixture } from './presentation.test-fixtures';
import type { CombatExperienceStoryExchange } from './types';
import {
  COMBAT_STORY_PACE_MS,
  useCombatStoryPacing,
} from './useCombatStoryPacing';
import { useStoryNotices } from './useStoryNotices';

const participants = [
  create(ParticipantSchema, {
    member: 'aldric',
    name: 'Aldric',
    kind: MemberKind.PLAYER,
    standing: Standing.UP,
  }),
  create(ParticipantSchema, {
    member: 'skeleton-guard',
    name: 'Skeleton Guard',
    kind: MemberKind.MONSTER,
    standing: Standing.UP,
  }),
];

/** A row with the id the act stream gives the fixture's swing (actStory). */
function storyEntry(seq: bigint): CombatExperienceStoryExchange {
  return {
    id: `9:crypt-run:id-${String(seq).padStart(8, '0')}#0`,
    eyebrow: 'Combat',
    headline: `Story ${seq}`,
    detail: `Sequence ${seq}`,
    tone: 'neutral',
  };
}

describe('useCombatStoryPacing scope', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each(['cast', 'activate', 'speak'] as const)(
    'follows the real %s-to-viewer notice policy in both toggle modes',
    (kind) => {
      const by = { kind: PartyKind.MEMBER, id: 'skeleton-guard' };
      const to = { kind: PartyKind.MEMBER, id: 'aldric' };
      const event = create(ActSchema, {
        id: 'monster-effect',
        session: 'crypt-run',
        family: Family.ACT,
        body:
          kind === 'cast'
            ? {
                case: 'cast',
                value: {
                  by,
                  spell: { name: 'Monster spell' },
                  results: [{ target: to }],
                },
              }
            : kind === 'activate'
              ? {
                  case: 'activate',
                  value: {
                    by,
                    ability: { name: 'Monster ability' },
                    results: [{ target: to, kind: 'damaged', amount: 2 }],
                  },
                }
              : { case: 'speak', value: { by, to, line: 'Stand aside.' } },
      });
      for (const follow of ['off', 'on']) {
        setDial('followMonsterTurns', follow);
        const view = renderHook(
          ({ story }) => {
            const pacing = useCombatStoryPacing({
              session: 'crypt-run',
              member: 'aldric',
              participants,
              story,
            });
            const notices = useStoryNotices({
              story: pacing.story,
              monsterTurnIds: pacing.monsterTurnIds,
              scope: 'crypt-run:aldric',
              enabled: true,
              streamState: 'live',
            });
            return { ...pacing, notices };
          },
          {
            initialProps: {
              story: [] as readonly CombatExperienceStoryExchange[],
            },
          }
        );
        try {
          const ended = create(ActSchema, {
            id: 'monster-end',
            session: 'crypt-run',
            family: Family.CLOCK,
            body: {
              case: 'clock',
              value: {
                mark: ClockMark.TURN_ENDED,
                turn: { member: by, next: to },
              },
            },
          });
          act(() =>
            view.result.current.acceptActs([event, ended], { source: 'live' })
          );
          const story = buildActStory(
            [{ act: event, index: 0, seq: 1n, source: 'live', visible: true }],
            {
              viewerMember: 'aldric',
              memberNames: {
                aldric: 'Aldric',
                'skeleton-guard': 'Skeleton Guard',
              },
            }
          );
          expect(story[0]?.toastRule?.case).toBe(
            kind === 'speak' ? 'speech-to-you' : 'done-to-you'
          );
          view.rerender({ story });
          expect(view.result.current.story).toEqual([]);
          expect([...view.result.current.monsterTurnIds]).toContain(
            actStoryId(event, 0)
          );
          act(() => vi.advanceTimersByTime(COMBAT_STORY_PACE_MS));
          expect(view.result.current.story).toEqual(story);
          expect(view.result.current.notices).toHaveLength(
            follow === 'on' ? 1 : 0
          );
          act(() => vi.advanceTimersByTime(COMBAT_STORY_PACE_MS));
          expect(view.result.current.notice).toBeNull();
        } finally {
          view.unmount();
          resetDial('followMonsterTurns');
        }
      }
    }
  );

  it('marks monster-turn story IDs without marking player turns or changing history', () => {
    const event = createAttackAuthorityFixture({
      seq: 23n,
      attacker: 'skeleton-guard',
    }).act;
    const story = [storyEntry(23n)];
    const view = renderHook(
      ({ kind, session }) =>
        useCombatStoryPacing({
          session,
          member: 'aldric',
          participants: participants.map((p) =>
            p.member === 'skeleton-guard' ? { ...p, kind } : p
          ),
          story,
        }),
      { initialProps: { kind: MemberKind.MONSTER, session: 'crypt-run' } }
    );
    act(() => view.result.current.acceptActs([event], { source: 'live' }));
    expect([...view.result.current.monsterTurnIds]).toEqual([
      actStoryId(event, 0),
    ]);
    act(() => vi.advanceTimersByTime(1000));
    expect(view.result.current.story).toEqual(story);
    expect([...view.result.current.monsterTurnIds]).toEqual([
      actStoryId(event, 0),
    ]);
    view.rerender({ kind: MemberKind.PLAYER, session: 'next-session' });
    act(() => view.result.current.acceptActs([event], { source: 'live' }));
    expect([...view.result.current.monsterTurnIds]).toEqual([]);
    view.unmount();
  });

  it('holds local playback while paused, accepts events, and resumes without dropping them', () => {
    const event = createAttackAuthorityFixture({
      seq: 23n,
      attacker: 'skeleton-guard',
    }).act;
    const story = [storyEntry(23n)];
    const view = renderHook(
      ({ paused }) =>
        useCombatStoryPacing({
          session: 'crypt-run',
          member: 'aldric',
          participants,
          story,
          paused,
        }),
      { initialProps: { paused: true } }
    );
    act(() => view.result.current.acceptActs([event], { source: 'live' }));
    act(() => vi.advanceTimersByTime(10_000));
    expect(view.result.current.story).toEqual([]);
    expect(view.result.current.notice).toBeNull();
    view.rerender({ paused: false });
    expect(view.result.current.notice).toBe("Skeleton Guard's turn.");
    view.rerender({ paused: true });
    act(() => vi.advanceTimersByTime(10_000));
    expect(view.result.current.story).toEqual([]);
    view.rerender({ paused: false });
    act(() => vi.advanceTimersByTime(COMBAT_STORY_PACE_MS));
    expect(view.result.current.story).toEqual(story);
    view.unmount();
  });

  it('reveals queued Story and fences an old timer and notice when member changes', () => {
    const oldFirst = createAttackAuthorityFixture({
      seq: 23n,
      attacker: 'skeleton-guard',
    }).act;
    const oldQueued = createAttackAuthorityFixture({
      seq: 24n,
      attacker: 'skeleton-guard',
    }).act;
    const nextEvent = createAttackAuthorityFixture({
      seq: 25n,
      attacker: 'aldric',
      target: 'skeleton-guard',
    }).act;
    const oldStory = [storyEntry(23n), storyEntry(24n)];
    const nextStory = [...oldStory, storyEntry(25n)];
    const { result, rerender, unmount } = renderHook(
      ({ member, story }) =>
        useCombatStoryPacing({
          session: 'crypt-run',
          member,
          participants,
          story,
        }),
      { initialProps: { member: 'aldric', story: oldStory } }
    );

    act(() => {
      result.current.acceptActs([oldFirst], { source: 'live' });
      result.current.acceptActs([oldQueued], { source: 'live' });
    });
    expect(result.current.story).toEqual([]);
    expect(result.current.notice).toBe("Skeleton Guard's turn.");

    // Keep the old fake timer runnable so this test proves the callback fence,
    // rather than relying only on clearTimeout removing it.
    const clearTimeoutSpy = vi
      .spyOn(globalThis, 'clearTimeout')
      .mockImplementation(() => undefined);
    rerender({ member: 'skeleton-guard', story: nextStory });

    expect(result.current.story).toEqual(nextStory);
    expect(result.current.notice).toBeNull();

    act(() => vi.advanceTimersByTime(COMBAT_STORY_PACE_MS));
    expect(result.current.story).toEqual(nextStory);
    expect(result.current.notice).toBeNull();

    act(() => result.current.acceptActs([nextEvent], { source: 'live' }));
    expect(result.current.story).toEqual(oldStory);
    expect(result.current.notice).toBe("Aldric's turn.");

    clearTimeoutSpy.mockRestore();
    unmount();
  });
});

describe('useCombatStoryPacing over whole driven turns', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const roster = [
    ...participants,
    create(ParticipantSchema, {
      member: 'goblin',
      name: 'Goblin',
      kind: MemberKind.MONSTER,
      standing: Standing.UP,
    }),
  ];
  const party = (id: string) => ({ kind: PartyKind.MEMBER, id });
  const swing = (id: string, by: string) =>
    create(ActSchema, {
      session: 'crypt-run',
      id,
      family: Family.ACT,
      body: {
        case: 'attack',
        value: {
          by: party(by),
          to: party('aldric'),
          outcome: AttackOutcome.MISS,
        },
      },
    });
  const turnEnd = (id: string, member: string) =>
    create(ActSchema, {
      session: 'crypt-run',
      id,
      family: Family.CLOCK,
      body: {
        case: 'clock',
        value: { mark: ClockMark.TURN_ENDED, turn: { member: party(member) } },
      },
    });

  it('announces each driven turn, the same monster again after its turn ends', () => {
    const { result } = renderHook(() =>
      useCombatStoryPacing({
        session: 'crypt-run',
        member: 'aldric',
        participants: roster,
        story: [],
      })
    );
    const notices: (string | null)[] = [];
    const record = () => {
      const notice = result.current.notice;
      if (notice !== notices.at(-1)) notices.push(notice);
    };
    act(() => {
      for (const a of [
        swing('id-01', 'skeleton-guard'),
        turnEnd('id-02', 'skeleton-guard'),
        swing('id-03', 'goblin'),
        turnEnd('id-04', 'goblin'),
        // The goblin's next turn comes straight after its last.
        swing('id-05', 'goblin'),
        turnEnd('id-06', 'goblin'),
      ]) {
        result.current.acceptActs([a], { source: 'live' });
      }
    });
    record();
    for (let step = 0; step < 20; step += 1) {
      act(() => vi.advanceTimersByTime(COMBAT_STORY_PACE_MS));
      record();
    }

    expect(notices.filter((notice) => notice !== null)).toEqual([
      "Skeleton Guard's turn.",
      "Goblin's turn.",
      "Goblin's turn.",
    ]);
    expect(notices.at(-1)).toBeNull();
  });
});

describe('useCombatStoryPacing tells the turn order what it plays (rpg-project#685)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const party = (id: string) => ({ kind: PartyKind.MEMBER, id });
  const walkBy = (id: string, mover: string) =>
    create(ActSchema, {
      session: 'castle',
      id,
      family: Family.ACT,
      body: {
        case: 'walk',
        value: { mover: party(mover), path: [{ cell: { x: 1, y: 0 } }] },
      },
    });
  const passed = (id: string, member: string, next: string) =>
    create(ActSchema, {
      session: 'castle',
      id,
      family: Family.CLOCK,
      body: {
        case: 'clock',
        value: {
          mark: ClockMark.TURN_ENDED,
          turn: { member: party(member), next: party(next) },
        },
      },
    });

  it('a commoner walking at world pace outside the fight is never announced as a turn', () => {
    const onTurnBeat = vi.fn();
    const { result } = renderHook(() =>
      useCombatStoryPacing({
        session: 'castle',
        member: 'aldric',
        participants,
        story: [],
        onTurnBeat,
      })
    );
    act(() =>
      result.current.acceptActs([walkBy('id-w', 'commoner')], {
        source: 'live',
      })
    );
    expect(result.current.notice).toBeNull();
    act(() => vi.advanceTimersByTime(COMBAT_STORY_PACE_MS * 4));
    expect(result.current.notice).toBeNull();
    expect(onTurnBeat).not.toHaveBeenCalled();
  });

  it('plays each driven turn, passes it on in order, then rests', () => {
    const beats: string[] = [];
    const { result } = renderHook(() =>
      useCombatStoryPacing({
        session: 'castle',
        member: 'aldric',
        participants,
        story: [],
        onTurnBeat: (beat) =>
          beats.push(
            beat.type === 'playing'
              ? `playing ${beat.actor}`
              : beat.type === 'passed'
                ? `passed ${beat.act.body.case === 'clock' ? beat.act.body.value.turn?.next?.id : ''}`
                : 'idle'
          ),
      })
    );
    act(() =>
      result.current.acceptActs(
        [
          walkBy('id-1', 'skeleton-guard'),
          passed('id-2', 'skeleton-guard', 'aldric'),
        ],
        { source: 'live' }
      )
    );
    for (let step = 0; step < 10; step += 1) {
      act(() => vi.advanceTimersByTime(COMBAT_STORY_PACE_MS));
    }
    expect(beats).toEqual(['playing skeleton-guard', 'passed aldric', 'idle']);
  });
});

describe('completion-driven walk presentation', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  type Complete = (outcome: 'painted' | 'unavailable' | 'cancelled') => void;
  const presentableMembers = new Set(['skeleton-guard', 'commoner', 'pedlar']);
  const walk = (id: string, mover = 'skeleton-guard') =>
    create(ActSchema, {
      session: 'crypt-run',
      id,
      family: Family.ACT,
      body: {
        case: 'walk',
        value: {
          mover: { kind: PartyKind.MEMBER, id: mover },
          path: [{ cell: { x: 1, y: 0 } }, { cell: { x: 2, y: 0 } }],
        },
      },
    });

  it('holds the next attack and turn marker until the exact walk completes, not a timer', () => {
    const walking = walk('walk-1');
    const attack = createAttackAuthorityFixture({
      seq: 2n,
      attacker: 'skeleton-guard',
    }).act;
    const passed = create(ActSchema, {
      session: 'crypt-run',
      id: 'turn-3',
      family: Family.CLOCK,
      body: {
        case: 'clock',
        value: {
          mark: ClockMark.TURN_ENDED,
          turn: {
            member: { kind: PartyKind.MEMBER, id: 'skeleton-guard' },
            next: { kind: PartyKind.MEMBER, id: 'aldric' },
          },
        },
      },
    });
    const run = [walking, attack, passed];
    const story = run.map((item, index) => ({
      ...storyEntry(BigInt(index)),
      id: actStoryId(item, index),
    }));
    let complete: Complete | undefined;
    const unsubscribe = vi.fn();
    const onPresentWalk = vi.fn((input: { complete: Complete }) => {
      complete = input.complete;
      return unsubscribe;
    });
    const onTurnBeat = vi.fn();
    const { result } = renderHook(() =>
      useCombatStoryPacing({
        session: 'crypt-run',
        member: 'aldric',
        participants,
        story,
        onTurnBeat,
        onPresentWalk,
        presentableMembers,
      })
    );
    act(() => result.current.acceptActs(run, { source: 'live' }));
    expect(result.current.heldMovementMembers).toEqual(
      new Set(['skeleton-guard'])
    );
    act(() => vi.advanceTimersByTime(COMBAT_STORY_PACE_MS));
    expect(onPresentWalk).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current.story).toEqual([story[0]]);
    expect(onTurnBeat.mock.calls.map(([beat]) => beat.type)).toEqual([
      'playing',
    ]);
    expect(complete).toBeTypeOf('function');
    act(() => complete!('painted'));
    act(() => vi.advanceTimersByTime(COMBAT_STORY_PACE_MS * 3));
    expect(result.current.story).toEqual(story);
    expect(result.current.heldMovementMembers).toEqual(new Set());
    expect(onTurnBeat.mock.calls.map(([beat]) => beat.type)).toEqual([
      'playing',
      'passed',
      'idle',
    ]);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('orders world walks by completion without announcing a combat turn', () => {
    const completions: Complete[] = [];
    const onPresentWalk = vi.fn((input: { complete: Complete }) => {
      completions.push(input.complete);
      return () => {};
    });
    const onTurnBeat = vi.fn();
    const { result } = renderHook(() =>
      useCombatStoryPacing({
        session: 'crypt-run',
        member: 'aldric',
        participants,
        story: [],
        onPresentWalk,
        onTurnBeat,
        presentableMembers,
      })
    );
    act(() =>
      result.current.acceptActs(
        [walk('world-1', 'commoner'), walk('world-2', 'pedlar')],
        { source: 'live' }
      )
    );
    expect(onPresentWalk).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(10_000));
    expect(onPresentWalk).toHaveBeenCalledOnce();
    expect(result.current.notice).toBeNull();
    expect(onTurnBeat).not.toHaveBeenCalled();
    act(() => completions[0]!('painted'));
    act(() => vi.advanceTimersByTime(COMBAT_STORY_PACE_MS));
    expect(onPresentWalk).toHaveBeenCalledTimes(2);
    act(() => completions[1]!('painted'));
    act(() => vi.advanceTimersByTime(COMBAT_STORY_PACE_MS));
    expect(onTurnBeat).not.toHaveBeenCalled();
    expect(result.current.heldMovementMembers).toEqual(new Set());
  });

  it('fences a previous session completion even when the viewing member id stays the same', () => {
    let stale: Complete | undefined;
    const unsubscribe = vi.fn();
    const onPresentWalk = vi.fn((input: { complete: Complete }) => {
      stale = input.complete;
      return unsubscribe;
    });
    const { result, rerender } = renderHook(
      ({ session }) =>
        useCombatStoryPacing({
          session,
          member: 'aldric',
          participants,
          story: [],
          onPresentWalk,
          presentableMembers,
        }),
      { initialProps: { session: 'first-run' } }
    );
    act(() =>
      result.current.acceptActs([walk('world-1', 'commoner')], {
        source: 'live',
      })
    );
    expect(stale).toBeTypeOf('function');
    rerender({ session: 'second-run' });
    expect(unsubscribe).toHaveBeenCalledOnce();
    act(() => stale!('painted'));
    act(() => vi.advanceTimersByTime(10_000));
    expect(onPresentWalk).toHaveBeenCalledOnce();
    expect(result.current.heldMovementMembers).toEqual(new Set());
    expect(result.current.notice).toBeNull();
  });

  it('accepts synchronous unavailable completion without leaving a stuck hold', () => {
    const unsubscribe = vi.fn();
    const onPresentWalk = vi.fn((input: { complete: Complete }) => {
      input.complete('unavailable');
      return unsubscribe;
    });
    const { result } = renderHook(() =>
      useCombatStoryPacing({
        session: 'crypt-run',
        member: 'aldric',
        participants,
        story: [],
        onPresentWalk,
        presentableMembers,
      })
    );
    act(() =>
      result.current.acceptActs([walk('world-1', 'commoner')], {
        source: 'live',
      })
    );
    act(() => vi.advanceTimersByTime(COMBAT_STORY_PACE_MS));
    expect(onPresentWalk).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(result.current.heldMovementMembers).toEqual(new Set());
  });

  it('does not animate catch-up history', () => {
    const onPresentWalk = vi.fn();
    const { result } = renderHook(() =>
      useCombatStoryPacing({
        session: 'crypt-run',
        member: 'aldric',
        participants,
        story: [],
        onPresentWalk,
        presentableMembers,
      })
    );
    act(() =>
      result.current.acceptActs([walk('old-walk')], { source: 'catchup' })
    );
    act(() => vi.advanceTimersByTime(10_000));
    expect(onPresentWalk).not.toHaveBeenCalled();
    expect(result.current.heldMovementMembers).toEqual(new Set());
  });
});
