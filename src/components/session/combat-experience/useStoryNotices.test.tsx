import { resetDial, setDial } from '@/feel/dialStore';
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
  resetDial('notificationDuration');
  resetDial('followMonsterTurns');
  vi.useRealTimers();
});

describe('useStoryNotices', () => {
  it('hides monster-turn notices when follow is off but keeps own results, sound and history', () => {
    setDial('followMonsterTurns', 'off');
    const monsterTurnIds = new Set(['monster', 'next-monster']);
    const base = { ...props, monsterTurnIds };
    const view = renderHook(useStoryNotices, { initialProps: base });
    const monster = entry('monster');
    const own = { ...entry('own'), byViewer: true };
    const sound = {
      ...entry('sound'),
      toastRule: { case: 'heard-sound' as const, hold: false },
    };
    const story = [old, monster, own, sound];
    view.rerender({ ...base, story });
    expect(view.result.current.map((row) => row.id)).toEqual(['own', 'sound']);
    expect(story).toHaveLength(4);
    act(() => setDial('followMonsterTurns', 'on'));
    expect(view.result.current.map((row) => row.id)).toEqual(['own', 'sound']);
    view.rerender({
      ...base,
      story: [...story, { ...monster, id: 'next-monster' }],
    });
    expect(view.result.current.map((row) => row.id)).toContain('next-monster');
  });

  it('turning follow off dismisses current monster notices and releases a reading hold', () => {
    const onInteractionChange = vi.fn();
    const base = {
      ...props,
      onInteractionChange,
      monsterTurnIds: new Set(['monster']),
    };
    const view = renderHook(useStoryNotices, { initialProps: base });
    view.rerender({ ...base, story: [old, entry('monster')] });
    expect(view.result.current).toHaveLength(1);
    act(() => view.result.current[0]!.notice.setPaused!('pointer', true));
    act(() => setDial('followMonsterTurns', 'off'));
    expect(view.result.current).toEqual([]);
    expect(onInteractionChange).toHaveBeenLastCalledWith(false);
  });

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

  it('uses the duration control for new notices without restarting existing deadlines', () => {
    const view = renderHook(useStoryNotices, { initialProps: props });
    view.rerender({ ...props, story: [old, entry('a')] });
    act(() => setDial('notificationDuration', 2));
    view.rerender({ ...props, story: [old, entry('a'), entry('b')] });
    expect(view.result.current.map((n) => n.notice.durationMs)).toEqual([
      STORY_NOTICE_TTL_MS,
      STORY_NOTICE_TTL_MS * 2,
    ]);
    act(() => vi.advanceTimersByTime(STORY_NOTICE_TTL_MS));
    expect(view.result.current.map((n) => n.id)).toEqual(['b']);
  });

  it('releases the playback interaction signal on dismiss and unmount', () => {
    const onInteractionChange = vi.fn();
    const view = renderHook(useStoryNotices, {
      initialProps: { ...props, onInteractionChange },
    });
    view.rerender({ ...props, onInteractionChange, story: [old, entry('a')] });
    act(() => view.result.current[0]!.notice.setPaused!('pointer', true));
    expect(onInteractionChange).toHaveBeenLastCalledWith(true);
    act(() => view.result.current[0]!.notice.dismissAll!());
    expect(onInteractionChange).toHaveBeenLastCalledWith(false);
    view.unmount();
    expect(onInteractionChange).toHaveBeenLastCalledWith(false);
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

  it('combat toast expires even without another action', () => {
    const view = renderHook(useStoryNotices, { initialProps: props });
    const swing = { ...entry('swing'), toastRule: held };
    view.rerender({ ...props, story: [old, swing] });
    expect(view.result.current[0]?.notice.held).toBe(false);
    act(() => vi.advanceTimersByTime(STORY_NOTICE_TTL_MS - 1));
    expect(view.result.current.map(({ id }) => id)).toEqual(['swing']);
    // Another creature's act does not release it.
    const other = { ...entry('other'), toastRule: undefined };
    view.rerender({ ...props, story: [old, swing, other] });
    expect(view.result.current.map(({ id }) => id)).toEqual(['swing']);
    act(() => vi.advanceTimersByTime(1));
    expect(view.result.current).toEqual([]);
    // A later act gets its own finite lifetime.
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

  it('dismisses without deleting history or reannouncing the same entry', () => {
    const view = renderHook(useStoryNotices, { initialProps: props });
    const story = [old, entry('dismiss-me')];
    view.rerender({ ...props, story });
    act(() => view.result.current[0]!.notice.dismiss!());
    expect(view.result.current).toEqual([]);
    expect(story).toHaveLength(2);
    view.rerender({ ...props, story: [...story] });
    expect(view.result.current).toEqual([]);
  });

  it('pauses while hovered and resumes only the remaining lifetime', () => {
    const view = renderHook(useStoryNotices, { initialProps: props });
    view.rerender({ ...props, story: [old, entry('reading')] });
    act(() => vi.advanceTimersByTime(1000));
    act(() => view.result.current[0]!.notice.setPaused!('pointer', true));
    act(() => vi.advanceTimersByTime(60_000));
    expect(view.result.current.map(({ id }) => id)).toEqual(['reading']);
    expect(vi.getTimerCount()).toBe(0);
    act(() => view.result.current[0]!.notice.setPaused!('pointer', false));
    act(() => vi.advanceTimersByTime(STORY_NOTICE_TTL_MS - 1001));
    expect(view.result.current).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(view.result.current).toEqual([]);
  });

  it('keeps focus and hover independent and lets paused notices be dismissed', () => {
    const view = renderHook(useStoryNotices, { initialProps: props });
    view.rerender({ ...props, story: [old, entry('reading')] });
    act(() => view.result.current[0]!.notice.setPaused!('pointer', true));
    act(() => view.result.current[0]!.notice.setPaused!('focus', true));
    act(() => view.result.current[0]!.notice.setPaused!('pointer', false));
    act(() => vi.advanceTimersByTime(60_000));
    expect(view.result.current).toHaveLength(1);
    act(() => view.result.current[0]!.notice.dismiss!());
    expect(view.result.current).toEqual([]);
  });

  it('protects the entire stack from expiry and burst eviction while reading', () => {
    const view = renderHook(useStoryNotices, { initialProps: props });
    const reading = entry('reading');
    view.rerender({ ...props, story: [old, reading, entry('timed')] });
    act(() => view.result.current[0]!.notice.setPaused!('focus', true));
    act(() => vi.advanceTimersByTime(STORY_NOTICE_TTL_MS));
    view.rerender({
      ...props,
      story: [old, reading, entry('timed'), ...['a', 'b', 'c', 'd'].map(entry)],
    });
    expect(view.result.current.map(({ id }) => id)).toEqual([
      'reading',
      'timed',
      'a',
    ]);
    act(() => view.result.current[0]!.notice.setPaused!('focus', false));
    act(() => vi.advanceTimersByTime(STORY_NOTICE_TTL_MS));
    expect(view.result.current).toEqual([]);
  });

  it('dismisses the whole stack without losing history', () => {
    const view = renderHook(useStoryNotices, { initialProps: props });
    const story = [old, entry('a'), entry('b')];
    view.rerender({ ...props, story });
    act(() => view.result.current[0]!.notice.dismissAll!());
    expect(view.result.current).toEqual([]);
    expect(story).toHaveLength(3);
    view.rerender({ ...props, story: [...story] });
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
