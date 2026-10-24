import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useHoverCardDismiss } from './useHoverCardDismiss';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function Fixture() {
  const [open, setOpen] = useState(true);
  const trigger = useRef<HTMLButtonElement>(null),
    card = useRef<HTMLDivElement>(null);
  useHoverCardDismiss(open, trigger, card, setOpen);
  return (
    <>
      <button ref={trigger}>Trigger</button>
      {open && <div ref={card}>Card</div>}
      <div>Map</div>
    </>
  );
}
it('closes after a single outside pointer move instead of waiting for another movement', () => {
  vi.useFakeTimers();
  render(<Fixture />);
  fireEvent.pointerMove(screen.getByText('Map'));
  act(() => vi.advanceTimersByTime(150));
  expect(screen.queryByText('Card')).toBeNull();
});
it('allows brief travel into the card, then closes when the pointer leaves it', () => {
  vi.useFakeTimers();
  render(<Fixture />);
  fireEvent.pointerMove(screen.getByText('Map'));
  act(() => vi.advanceTimersByTime(50));
  fireEvent.pointerMove(screen.getByText('Card'));
  act(() => vi.advanceTimersByTime(150));
  expect(screen.getByText('Card')).toBeTruthy();
  fireEvent.pointerMove(screen.getByText('Map'));
  act(() => vi.advanceTimersByTime(150));
  expect(screen.queryByText('Card')).toBeNull();
});
