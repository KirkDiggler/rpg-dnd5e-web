import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JustRollConcept } from './JustRollConcept';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('JustRollConcept', () => {
  it('settles repeated local rolls in one tray and dismisses it', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.3).mockReturnValueOnce(0.7);
    render(<JustRollConcept />);
    fireEvent.click(screen.getByRole('button', { name: 'Roll local d20' }));
    const tray = screen.getByTestId('dice-tray');

    act(() => vi.advanceTimersByTime(180));
    act(() => vi.advanceTimersByTime(1740));
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toBe('Local result: 7');

    fireEvent.click(screen.getByRole('button', { name: 'Roll again' }));
    expect(screen.getByTestId('dice-tray')).toBe(tray);
    act(() => vi.advanceTimersByTime(1740));
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toBe('Local result: 15');

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('dice-tray')).toBeNull();
  });

  it('provides grouped control and tray styling hooks', () => {
    render(<JustRollConcept />);

    expect(
      screen.getByRole('button', { name: 'Roll local d20' }).className
    ).toContain('just-roll-concept__button');
    fireEvent.click(screen.getByRole('button', { name: 'Roll local d20' }));
    expect(screen.getByTestId('dice-tray').className).toContain(
      'just-roll-concept__tray'
    );
    expect(screen.getByRole('button', { name: 'Dismiss' }).className).toContain(
      'just-roll-concept__dismiss'
    );
  });
});
