/**
 * The run's end on screen (rpg-project#733): which ending fired, what it
 * meant, and who came with the party.
 */
import { EndingResult } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { RunEndedToast } from './RunEndedToast';
import { RUN_ENDED_TOAST_MS } from './runEnding';

describe('RunEndedToast', () => {
  it('keeps a dismissal made before passive mount effects run', () => {
    function DismissOnCommit() {
      useLayoutEffect(() => {
        // The DOM is interactive, but the toast's passive effect has not run.
        // Reproduce that ordering without relying on CI scheduler timing.
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
      }, []);
      return <RunEndedToast ending="boss-down" onLeave={vi.fn()} />;
    }

    render(<DismissOnCommit />);
    expect(screen.queryByTestId('run-ended-toast')).toBeNull();
  });

  it('retains dismissal for the same ending but resets for a different ending', () => {
    const onLeave = vi.fn();
    const view = render(<RunEndedToast ending="boss-down" onLeave={onLeave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('run-ended-toast')).toBeNull();

    view.rerender(
      <RunEndedToast
        ending="boss-down"
        result={EndingResult.SUCCESS}
        companionsLine="the veteran came with you."
        onLeave={onLeave}
      />
    );
    expect(screen.queryByTestId('run-ended-toast')).toBeNull();

    view.rerender(<RunEndedToast ending="party_defeated" onLeave={onLeave} />);
    expect(screen.getByTestId('run-ended-toast').dataset.outcome).toBe('lost');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('run-ended-toast')).toBeNull();
    view.rerender(<RunEndedToast ending="boss-down" onLeave={onLeave} />);
    expect(screen.getByTestId('run-ended-toast').dataset.outcome).toBe('won');
    expect(onLeave).not.toHaveBeenCalled();
  });

  it('owns one fade timer per ending and never navigates on a timer', () => {
    vi.useFakeTimers();
    const onLeave = vi.fn();
    const view = render(<RunEndedToast ending="boss-down" onLeave={onLeave} />);
    try {
      act(() => vi.advanceTimersByTime(RUN_ENDED_TOAST_MS));
      expect(screen.getByTestId('run-ended-toast').dataset.faded).toBe('true');
      view.rerender(
        <RunEndedToast ending="party_defeated" onLeave={onLeave} />
      );
      expect(screen.getByTestId('run-ended-toast').dataset.faded).toBe('false');
      act(() => vi.advanceTimersByTime(RUN_ENDED_TOAST_MS / 2));
      view.rerender(<RunEndedToast ending="boss-down" onLeave={onLeave} />);
      expect(vi.getTimerCount()).toBe(1);
      act(() => vi.advanceTimersByTime(RUN_ENDED_TOAST_MS / 2));
      expect(screen.getByTestId('run-ended-toast').dataset.faded).toBe('false');
      act(() => vi.advanceTimersByTime(RUN_ENDED_TOAST_MS / 2));
      expect(screen.getByTestId('run-ended-toast').dataset.faded).toBe('true');
      expect(onLeave).not.toHaveBeenCalled();
      view.unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });

  it('reads "captain slain — success" when the captain fell', () => {
    render(
      <RunEndedToast
        ending="captain-slain"
        result={EndingResult.SUCCESS}
        onLeave={vi.fn()}
      />
    );
    expect(screen.getByTestId('run-ended-result').textContent).toBe(
      'captain slain — success'
    );
    expect(screen.getByTestId('run-ended-toast').dataset.outcome).toBe('won');
    expect(screen.getByText('You won')).toBeTruthy();
  });

  it('reads "captain lives — failure" when the party left him standing', () => {
    render(
      <RunEndedToast
        ending="captain-lives"
        result={EndingResult.FAILURE}
        onLeave={vi.fn()}
      />
    );
    expect(screen.getByTestId('run-ended-result').textContent).toBe(
      'captain lives — failure'
    );
    expect(screen.getByTestId('run-ended-toast').dataset.outcome).toBe('lost');
  });

  it('shows no result for a run recorded before results existed', () => {
    render(<RunEndedToast ending="captain-slain" onLeave={vi.fn()} />);
    expect(screen.queryByTestId('run-ended-result')).toBeNull();
    expect(screen.getByTestId('run-ended-toast').dataset.outcome).toBe(
      'undecided'
    );
  });

  it('names who came with the party, and nothing when nobody did', () => {
    const { rerender } = render(
      <RunEndedToast
        ending="captain-slain"
        result={EndingResult.SUCCESS}
        companionsLine="the veteran came with you."
        onLeave={vi.fn()}
      />
    );
    expect(screen.getByTestId('run-ended-companions').textContent).toBe(
      'the veteran came with you.'
    );
    rerender(<RunEndedToast ending="captain-slain" onLeave={vi.fn()} />);
    expect(screen.queryByTestId('run-ended-companions')).toBeNull();
  });
});
