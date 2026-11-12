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

it('a click on a notice, or on its Details, never reaches the map beneath (rpg-dnd5e-web#1416)', () => {
  const entry = RECENT_IDENTITY_SAMPLES.find(
    (e) => e.act?.body.case === 'speak'
  )!;
  // The map's own handlers, as the HUD sits over it.
  const mapClick = vi.fn();
  const mapPointerDown = vi.fn();
  render(
    <div onClick={mapClick} onPointerDown={mapPointerDown}>
      <StoryNotices
        entries={[
          {
            ...entry,
            notice: {
              durationMs: 6000,
              held: false,
              dismiss: vi.fn(),
              setPaused: vi.fn(),
              dismissAll: vi.fn(),
            },
          },
        ]}
      />
    </div>
  );
  const summary = screen.getByText('Details');
  const card = summary.closest('article')!;
  fireEvent.pointerDown(card);
  fireEvent.click(card);
  fireEvent.pointerDown(summary);
  fireEvent.click(summary);
  expect(mapPointerDown).not.toHaveBeenCalled();
  expect(mapClick).not.toHaveBeenCalled();
  // Details still does what it does: it opens the act's details.
  expect(summary.closest('details')?.open).toBe(true);
});
