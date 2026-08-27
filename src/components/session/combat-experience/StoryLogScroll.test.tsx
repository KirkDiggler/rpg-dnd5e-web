/**
 * Auto-follow for the live session log.
 *
 * jsdom computes no layout, so `scrollHeight`/`clientHeight` are always 0 and
 * `scrollTop` is inert. These tests install real, settable versions of all
 * three on the prototype for the duration of the file — that is the whole
 * reason the *predicate* lives in `combatLogScroll.ts` as a pure function, but
 * the wiring (does the effect actually fire, on the right container, and does
 * a scroll-up really release the pin) can only be asserted here.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { StoryLog, type StoryLogProps } from './StoryLog';
import type { CombatExperienceStoryExchange } from './types';

const CONTENT_HEIGHT = 1000;
const VIEWPORT_HEIGHT = 200;
const MAX_SCROLL = CONTENT_HEIGHT - VIEWPORT_HEIGHT;

const originals = new Map<string, PropertyDescriptor | undefined>();

beforeAll(() => {
  for (const prop of ['scrollTop', 'scrollHeight', 'clientHeight']) {
    originals.set(
      prop,
      Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop)
    );
  }
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      return CONTENT_HEIGHT;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return VIEWPORT_HEIGHT;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get(): number {
      return (this as { _scrollTop?: number })._scrollTop ?? 0;
    },
    set(value: number) {
      // Mirror the browser's clamp, so "scroll to the bottom" lands on the
      // same number a real element would report back.
      (this as { _scrollTop?: number })._scrollTop = Math.min(
        value,
        MAX_SCROLL
      );
    },
  });
});

afterAll(() => {
  for (const [prop, descriptor] of originals) {
    if (descriptor)
      Object.defineProperty(HTMLElement.prototype, prop, descriptor);
    else
      delete (HTMLElement.prototype as unknown as Record<string, unknown>)[
        prop
      ];
  }
});

function exchange(id: string): CombatExperienceStoryExchange {
  return {
    id,
    eyebrow: 'Aldric Vale',
    headline: `beat ${id}`,
    detail: 'something happened',
    tone: 'neutral',
  };
}

function props(
  story: CombatExperienceStoryExchange[],
  overrides: Partial<StoryLogProps> = {}
): StoryLogProps {
  return {
    story,
    debug: [],
    mode: 'story',
    streamState: 'live',
    onModeChange: () => {},
    ...overrides,
  };
}

function feed() {
  return screen.getByTestId('session-combat-log-scroll');
}

describe('StoryLog auto-follow', () => {
  it('pins to the newest beat as events arrive', () => {
    const { rerender } = render(<StoryLog {...props([exchange('1')])} />);
    expect(feed().scrollTop).toBe(MAX_SCROLL);

    feed().scrollTop = 0;
    rerender(<StoryLog {...props([exchange('1'), exchange('2')])} />);

    expect(feed().scrollTop).toBe(MAX_SCROLL);
  });

  it('releases the pin while the player is reading back, then re-pins at the bottom', () => {
    const { rerender } = render(<StoryLog {...props([exchange('1')])} />);

    // Scroll up to re-read an earlier beat.
    feed().scrollTop = 0;
    fireEvent.scroll(feed());

    rerender(<StoryLog {...props([exchange('1'), exchange('2')])} />);
    expect(feed().scrollTop).toBe(0);

    // Scroll back to the bottom: following resumes for the NEXT beat.
    feed().scrollTop = MAX_SCROLL;
    fireEvent.scroll(feed());
    feed().scrollTop = 0;
    rerender(
      <StoryLog {...props([exchange('1'), exchange('2'), exchange('3')])} />
    );
    expect(feed().scrollTop).toBe(MAX_SCROLL);
  });

  it('follows a result that lands without a new story entry', () => {
    const story = [exchange('1')];
    const { rerender } = render(<StoryLog {...props(story)} />);
    feed().scrollTop = 0;

    rerender(
      <StoryLog
        {...props(story, {
          result: {
            attackId: 'atk-1',
            actor: 'Aldric Vale',
            target: 'skeleton-1',
            action: 'Longsword',
            d20: 17,
            total: 22,
            against: 13,
            hit: true,
            critical: false,
            damage: 7,
            targetIsViewer: false,
          },
        })}
      />
    );

    expect(feed().scrollTop).toBe(MAX_SCROLL);
  });
});
