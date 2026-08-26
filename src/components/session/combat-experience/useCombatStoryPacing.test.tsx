import { create } from '@bufbuild/protobuf';
import {
  MemberKind,
  ParticipantSchema,
  Standing,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
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

function storyEntry(seq: bigint): CombatExperienceStoryExchange {
  return {
    id: `9:crypt-run:${seq}`,
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
    }).event;
    const oldQueued = createAttackAuthorityFixture({
      seq: 24n,
      attacker: 'skeleton-guard',
    }).event;
    const nextEvent = createAttackAuthorityFixture({
      seq: 25n,
      attacker: 'aldric',
      target: 'skeleton-guard',
    }).event;
    const oldStory = [storyEntry(23n), storyEntry(24n)];
    const nextStory = [...oldStory, storyEntry(25n)];
    const { result, rerender, unmount } = renderHook(
      ({ member, story }) =>
        useCombatStoryPacing({ member, participants, story }),
      { initialProps: { member: 'aldric', story: oldStory } }
    );

    act(() => {
      result.current.acceptEvent(oldFirst, { source: 'live' });
      result.current.acceptEvent(oldQueued, { source: 'live' });
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

    act(() => result.current.acceptEvent(nextEvent, { source: 'live' }));
    expect(result.current.story).toEqual(oldStory);
    expect(result.current.notice).toBe("Aldric's turn.");

    clearTimeoutSpy.mockRestore();
    unmount();
  });
});
