import { act, cleanup, renderHook } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toastDurationMs, type ToastRule } from './toastPolicy';
import type {
  CombatExperienceStoryExchange,
  CombatExperienceStreamState,
} from './types';
import { STORY_NOTICE_LIMIT, useStoryNotices } from './useStoryNotices';

const LINE = 'Mira moves into the southern aisle.';
/** The fixture line's time on screen (2.5 s + 60 ms a character). */
const STORY_NOTICE_TTL_MS = toastDurationMs(LINE);
const timed: ToastRule = { case: 'own-outcome', hold: false };
const held: ToastRule = { case: 'done-to-you', hold: true };

const entry = (id: string): CombatExperienceStoryExchange => ({
  id,
  deliverySource: 'live',
  eyebrow: 'Mira · Move',
  headline: `Mira moves ${id}`,
  detail: 'Reaches the southern aisle.',
  tone: 'neutral',
  toastRule: timed,
  toastText: LINE,
});
const old = entry('old');
const props = {
  story: [old] as readonly CombatExperienceStoryExchange[],
  scope: 'encounter-a',
  enabled: true,
  streamState: 'live' as CombatExperienceStreamState,
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useStoryNotices', () => {
  it('toasts only rows the toast policy named a case for (#1301)', () => {
    const view = renderHook(useStoryNotices, { initialProps: props });
    view.rerender({
      ...props,
      story: [
        old,
        { ...entry('turn'), toastRule: undefined },
        { ...entry('swing'), toastRule: timed },
      ],
    });
    expect(view.result.current.map(({ id }) => id)).toEqual(['swing']);
  });

  it('duration scales with length', () => {
    const view = renderHook(useStoryNotices, { initialProps: props });
    const short = { ...entry('short'), toastText: 'x'.repeat(20) };
    const long = { ...entry('long'), toastText: 'x'.repeat(80) };
    view.rerender({ ...props, story: [old, short, long] });
    expect(view.result.current.map((n) => n.notice.durationMs)).toEqual([
      3700, 7300,
    ]);
    act(() => vi.advanceTimersByTime(3700));
    expect(view.result.current.map(({ id }) => id)).toEqual(['long']);
    act(() => vi.advanceTimersByTime(7300 - 3700));
    expect(view.result.current).toEqual([]);
  });

  it('combat toast holds until your next act', () => {
    const view = renderHook(useStoryNotices, { initialProps: props });
    const swing = { ...entry('swing'), toastRule: held };
    view.rerender({ ...props, story: [old, swing] });
    expect(view.result.current[0]?.notice.held).toBe(true);
    act(() => vi.advanceTimersByTime(60_000));
    expect(view.result.current.map(({ id }) => id)).toEqual(['swing']);
    // Another creature's act does not release it.
    const other = { ...entry('other'), toastRule: undefined };
    view.rerender({ ...props, story: [old, swing, other] });
    expect(view.result.current.map(({ id }) => id)).toEqual(['swing']);
    // The viewer's own act does, and its own toast takes the place.
    const mine = { ...entry('mine'), byViewer: true, toastRule: held };
    view.rerender({ ...props, story: [old, swing, other, mine] });
    expect(view.result.current.map(({ id }) => id)).toEqual(['mine']);
  });

  it('a held toast runs its timer once the fight ends', () => {
    const view = renderHook(useStoryNotices, { initialProps: props });
    const swing = { ...entry('swing'), toastRule: held };
    view.rerender({ ...props, story: [old, swing] });
    const ended = {
      ...entry('ended'),
      fightEdge: 'dissolved' as const,
      toastRule: undefined,
    };
    view.rerender({ ...props, story: [old, swing, ended] });
    expect(view.result.current[0]?.notice.held).toBe(false);
    act(() => vi.advanceTimersByTime(STORY_NOTICE_TTL_MS));
    expect(view.result.current).toEqual([]);
  });

  it('at most three', () => {
    const view = renderHook(useStoryNotices, { initialProps: props });
    const burst = ['a', 'b', 'c', 'd'].map((id) => ({
      ...entry(id),
      toastRule: held,
    }));
    view.rerender({ ...props, story: [old, ...burst] });
    expect(STORY_NOTICE_LIMIT).toBe(3);
    expect(view.result.current.map(({ id }) => id)).toEqual(['b', 'c', 'd']);
  });

  it('keeps background catch-up and unknown provenance quiet even while the stream is live', () => {
    const view = renderHook(useStoryNotices, { initialProps: props });
    const history = [
      old,
      { ...entry('recovered'), deliverySource: 'catchup' as const },
      { ...entry('unknown'), deliverySource: undefined },
    ];
    view.rerender({ ...props, story: history });
    expect(view.result.current).toEqual([]);
    view.rerender({
      ...props,
      story: [old, entry('recovered'), entry('unknown'), entry('new')],
    });
    expect(view.result.current.map(({ id }) => id)).toEqual(['new']);
  });

  it('starts the lifetime at released visibility, not arrival of a withheld live event', () => {
    const view = renderHook(useStoryNotices, { initialProps: props });
    act(() => vi.advanceTimersByTime(20000));
    view.rerender({ ...props, story: [old, entry('released')] });
    expect(view.result.current.map(({ id }) => id)).toEqual(['released']);
    act(() => vi.advanceTimersByTime(STORY_NOTICE_TTL_MS));
    expect(view.result.current).toEqual([]);
  });

  it('baselines history and expires only the temporary view, not the source entries', () => {
    const view = renderHook(useStoryNotices, { initialProps: props });
    expect(view.result.current).toEqual([]);
    const story = [old, entry('new')];
    view.rerender({ ...props, story });
    expect(view.result.current.map((row) => row.id)).toEqual(['new']);
    act(() => vi.advanceTimersByTime(STORY_NOTICE_TTL_MS - 1));
    expect(view.result.current).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(view.result.current).toEqual([]);
    expect(story.map((row) => row.id)).toEqual(['old', 'new']);
    view.rerender({ ...props, story: [...story] });
    expect(view.result.current).toEqual([]);
  });
  it('does not extend older notices when another entry arrives or current copy updates', () => {
    const view = renderHook(useStoryNotices, { initialProps: props });
    view.rerender({ ...props, story: [old, entry('a')] });
    act(() => vi.advanceTimersByTime(3000));
    view.rerender({
      ...props,
      story: [
        old,
        { ...entry('a'), detail: 'Updated provider text' },
        entry('b'),
      ],
    });
    expect(view.result.current[0]?.detail).toBe('Updated provider text');
    act(() => vi.advanceTimersByTime(3000));
    expect(view.result.current.map((row) => row.id)).toEqual(['b']);
    act(() => vi.advanceTimersByTime(3000));
    expect(view.result.current).toEqual([]);
  });
  it('bounds a burst to three unique recent rows and keeps removed IDs remembered', () => {
    const view = renderHook(useStoryNotices, { initialProps: props });
    view.rerender({
      ...props,
      story: [old, entry('a'), entry('b'), entry('c'), entry('d'), entry('d')],
    });
    expect(view.result.current.map((row) => row.id)).toEqual(['b', 'c', 'd']);
    view.rerender({ ...props, story: [old] });
    expect(view.result.current).toEqual([]);
    act(() => vi.advanceTimersByTime(STORY_NOTICE_TTL_MS));
    view.rerender({ ...props, story: [old, entry('a'), entry('b')] });
    expect(view.result.current).toEqual([]);
  });
  it('baselines resync/catch-up and the transition back to live before announcing new activity', () => {
    const view = renderHook(useStoryNotices, { initialProps: props });
    view.rerender({ ...props, story: [old, entry('a')] });
    view.rerender({
      ...props,
      story: [old, entry('a'), entry('missed')],
      streamState: 'resyncing',
    });
    expect(view.result.current).toEqual([]);
    view.rerender({
      ...props,
      story: [old, entry('missed'), entry('restored')],
      streamState: 'caught-up',
    });
    view.rerender({
      ...props,
      story: [old, entry('missed'), entry('restored')],
    });
    expect(view.result.current).toEqual([]);
    view.rerender({
      ...props,
      story: [old, entry('missed'), entry('restored'), entry('live')],
    });
    expect(view.result.current.map((row) => row.id)).toEqual(['live']);
  });
  it('resets on a scope or enable transition and cleans timers on unmount', () => {
    const view = renderHook(useStoryNotices, { initialProps: props });
    view.rerender({ ...props, story: [old, entry('a')] });
    expect(vi.getTimerCount()).toBe(1);
    view.rerender({ ...props, story: [entry('a')], scope: 'encounter-b' });
    expect(view.result.current).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    view.rerender({ ...props, enabled: false });
    view.rerender({ ...props, story: [old, entry('a')] });
    expect(view.result.current).toEqual([]);
    view.rerender({ ...props, story: [old, entry('a'), entry('b')] });
    expect(view.result.current.map((row) => row.id)).toEqual(['b']);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('announces once and still expires under StrictMode', () => {
    const view = renderHook(useStoryNotices, {
      initialProps: props,
      wrapper: ({ children }: { children: ReactNode }) => (
        <StrictMode>{children}</StrictMode>
      ),
    });
    view.rerender({ ...props, story: [old, entry('a')] });
    expect(view.result.current).toHaveLength(1);
    act(() => vi.advanceTimersByTime(STORY_NOTICE_TTL_MS));
    expect(view.result.current).toEqual([]);
  });
});
