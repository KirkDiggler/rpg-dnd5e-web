import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useHoverCardWheel } from './useHoverCardWheel';
afterEach(cleanup);
function Fixture({ open = true }: { open?: boolean }) {
  const trigger = useRef<HTMLButtonElement>(null),
    card = useRef<HTMLDivElement>(null);
  useHoverCardWheel(open, trigger, card);
  return (
    <>
      <button ref={trigger}>Trigger</button>
      <div ref={card} data-testid="card" style={{ lineHeight: '20px' }}>
        Details
      </div>
      <button>Elsewhere</button>
    </>
  );
}
it('scrolls the visible card over either surface, normalizes wheel units and contains boundaries', () => {
  render(<Fixture />);
  const trigger = screen.getByRole('button', { name: 'Trigger' }),
    card = screen.getByTestId('card');
  Object.defineProperties(card, {
    scrollHeight: { value: 700 },
    clientHeight: { value: 200 },
    scrollWidth: { value: 500 },
    clientWidth: { value: 200 },
  });
  const outside = vi.fn();
  window.addEventListener('wheel', outside);
  try {
    const wheel = (target: Element, init: WheelEventInit) => {
      const event = new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        ...init,
      });
      fireEvent(target, event);
      return event;
    };
    expect(wheel(trigger, { deltaY: 80 }).defaultPrevented).toBe(true);
    expect(card.scrollTop).toBe(80);
    wheel(card, { deltaY: 2, deltaMode: 1 });
    expect(card.scrollTop).toBe(120);
    wheel(trigger, { deltaY: 1, deltaMode: 2 });
    expect(card.scrollTop).toBe(320);
    wheel(trigger, { deltaY: 999 });
    expect(card.scrollTop).toBe(500);
    wheel(card, { deltaY: 50 });
    expect(card.scrollTop).toBe(500);
    expect(outside).not.toHaveBeenCalled();
    wheel(trigger, { deltaY: 40, shiftKey: true });
    expect(card.scrollLeft).toBe(40);
    expect(wheel(trigger, { deltaY: 20, ctrlKey: true }).defaultPrevented).toBe(
      false
    );
    expect(
      wheel(screen.getByRole('button', { name: 'Elsewhere' }), { deltaY: 20 })
        .defaultPrevented
    ).toBe(false);
  } finally {
    window.removeEventListener('wheel', outside);
  }
});
it('releases wheel handling when the hover closes', () => {
  const { rerender } = render(<Fixture />);
  rerender(<Fixture open={false} />);
  const event = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY: 60,
  });
  fireEvent(screen.getByRole('button', { name: 'Trigger' }), event);
  expect(event.defaultPrevented).toBe(false);
});
