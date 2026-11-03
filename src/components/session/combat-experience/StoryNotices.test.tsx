import { RECENT_IDENTITY_SAMPLES } from '@/concepts/desktop-hotbar/recentStoryFixtures';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { StoryNotices } from './StoryNotices';

afterEach(cleanup);
it('uses shared identity, collapses details and offers dismissal', () => {
  const dismiss = vi.fn();
  const setPaused = vi.fn();
  const dismissAll = vi.fn();
  const entry = RECENT_IDENTITY_SAMPLES.find(
    (e) => e.act?.body.case === 'speak'
  )!;
  render(
    <StoryNotices
      entries={[
        {
          ...entry,
          notice: {
            durationMs: 6000,
            held: false,
            dismiss,
            setPaused,
            dismissAll,
          },
        },
      ]}
    />
  );
  expect(screen.getByText('Speech')).toBeTruthy();
  expect(screen.getByText('Mira')).toBeTruthy();
  expect(screen.getByText('Details').closest('details')?.open).toBe(false);
  const button = screen.getByRole('button', {
    name: 'Dismiss Speech notification',
  });
  const card = button.closest('article')!;
  fireEvent.pointerEnter(card);
  expect(setPaused).toHaveBeenLastCalledWith('pointer', true);
  fireEvent.pointerLeave(card);
  expect(setPaused).toHaveBeenLastCalledWith('pointer', false);
  act(() => button.focus());
  expect(setPaused).toHaveBeenLastCalledWith('focus', true);
  act(() => button.blur());
  expect(setPaused).toHaveBeenLastCalledWith('focus', false);
  fireEvent.pointerDown(button);
  expect(dismissAll).not.toHaveBeenCalled();
  fireEvent.pointerDown(document.body);
  expect(dismissAll).toHaveBeenCalledOnce();
  fireEvent.click(button);
  expect(dismiss).toHaveBeenCalledOnce();
});
