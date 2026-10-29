import { create } from '@bufbuild/protobuf';
import {
  ActSchema,
  Family,
  PartyKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { act, renderHook } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actStoryId } from './combat-experience/actStory';
import type { CombatExperienceStoryExchange } from './combat-experience/types';
import {
  COMBAT_STORY_PACE_MS,
  useCombatStoryPacing,
} from './combat-experience/useCombatStoryPacing';
import { useMoveController } from './useMoveController';
import { useWalkPresentation } from './useWalkPresentation';

const walk = (actor: string, id = actor) =>
  create(ActSchema, {
    session: 's',
    id,
    family: Family.ACT,
    body: {
      case: 'walk',
      value: {
        mover: { kind: PartyKind.MEMBER, id: actor },
        path: [{ cell: { x: 1, y: 0 } }, { cell: { x: 2, y: 0 } }],
      },
    },
  });
const run = [walk('A'), walk('B')];
const story: CombatExperienceStoryExchange[] = run.map((item, index) => ({
  id: actStoryId(item, index),
  eyebrow: 'World',
  headline: item.id,
  detail: 'Walk',
  tone: 'neutral',
}));
const EMPTY: ReadonlySet<string> = new Set();

function harness(initialSighted = new Set(['A', 'B'])) {
  return renderHook(
    ({ sighted, canPresent }) => {
      const moves = useMoveController('s', 'viewer');
      useEffect(
        () => moves.forgetUnsighted(sighted),
        [moves.forgetUnsighted, sighted]
      );
      const bridge = useWalkPresentation({
        session: 's',
        member: 'viewer',
        liveSighted: sighted,
        canPresent,
        beginRoute: moves.beginRoute,
        forgetRoute: moves.forgetRoute,
      });
      const pacing = useCombatStoryPacing({
        session: 's',
        member: 'viewer',
        participants: [],
        story,
        onPresentWalk: bridge.presentWalk,
        presentableMembers: canPresent ? sighted : EMPTY,
      });
      return { moves, bridge, pacing };
    },
    { initialProps: { sighted: initialSighted, canPresent: true } }
  );
}

describe('queued walk lifecycle through the real cursor and movement bridge', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('retires queued motion across sight loss/reappearance without dropping its story or blocking fresh walks', () => {
    const { result, rerender } = harness();
    act(() => result.current.pacing.acceptActs(run, { source: 'live' }));
    expect(result.current.moves.movements.has('A')).toBe(true);
    expect(result.current.moves.movements.has('B')).toBe(false);
    rerender({ sighted: new Set(['A']), canPresent: true });
    rerender({ sighted: new Set(['A', 'B']), canPresent: true });
    expect(result.current.pacing.heldMovementMembers.has('B')).toBe(false);
    act(() => result.current.bridge.movementPainted('A', 1, 2));
    act(() => vi.advanceTimersByTime(COMBAT_STORY_PACE_MS));
    expect(result.current.moves.movements.has('B')).toBe(false);
    expect(result.current.pacing.story).toEqual(story);
    act(() =>
      result.current.pacing.acceptActs([walk('B', 'new-B')], { source: 'live' })
    );
    expect(result.current.moves.movements.has('B')).toBe(true);
  });

  it('does not bank a walk delivered before the actor was visible', () => {
    const { result, rerender } = harness(new Set(['A']));
    act(() => result.current.pacing.acceptActs(run, { source: 'live' }));
    rerender({ sighted: new Set(['A', 'B']), canPresent: true });
    act(() => result.current.bridge.movementPainted('A', 1, 2));
    act(() => vi.advanceTimersByTime(COMBAT_STORY_PACE_MS));
    expect(result.current.moves.movements.has('B')).toBe(false);
    expect(result.current.pacing.story).toEqual(story);
  });

  it('retires active and queued motion when the render surface disappears, even if it returns before release', () => {
    const { result, rerender } = harness();
    act(() => result.current.pacing.acceptActs(run, { source: 'live' }));
    rerender({ sighted: new Set(['A', 'B']), canPresent: false });
    expect(result.current.moves.movements.has('A')).toBe(false);
    rerender({ sighted: new Set(['A', 'B']), canPresent: true });
    act(() => vi.advanceTimersByTime(COMBAT_STORY_PACE_MS));
    expect(result.current.moves.movements.has('B')).toBe(false);
    expect(result.current.pacing.heldMovementMembers).toEqual(EMPTY);
    expect(result.current.pacing.story).toEqual(story);
  });
});
