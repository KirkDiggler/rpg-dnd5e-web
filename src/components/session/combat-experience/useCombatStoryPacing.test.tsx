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
import { createAttackAuthorityFixture } from './presentation.test-fixtures';
import type { CombatExperienceStoryExchange } from './types';
import {
  COMBAT_STORY_PACE_MS,
  useCombatStoryPacing,
} from './useCombatStoryPacing';

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
        useCombatStoryPacing({ member, participants, story }),
      { initialProps: { member: 'aldric', story: oldStory } }
    );

    act(() => {
      result.current.acceptActs([oldFirst], { source: 'live', startIndex: 0 });
      result.current.acceptActs([oldQueued], { source: 'live', startIndex: 0 });
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

    act(() =>
      result.current.acceptActs([nextEvent], { source: 'live', startIndex: 0 })
    );
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
        result.current.acceptActs([a], { source: 'live', startIndex: 0 });
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
