import { act, cleanup, renderHook } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CombatExperienceStoryExchange,
  CombatExperienceStreamState,
} from './types';
import { STORY_NOTICE_TTL_MS, useStoryNotices } from './useStoryNotices';

const entry = (id: string): CombatExperienceStoryExchange => ({
  id,
  eyebrow: 'Mira · Move',
  headline: `Mira moves ${id}`,
  detail: 'Reaches the southern aisle.',
  tone: 'neutral',
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
