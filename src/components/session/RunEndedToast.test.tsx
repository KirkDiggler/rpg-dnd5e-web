/**
 * The run's end on screen (rpg-project#733): which ending fired, what it
 * meant, and who came with the party.
 */
import { EndingResult } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RunEndedToast } from './RunEndedToast';

describe('RunEndedToast', () => {
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
