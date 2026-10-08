import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RestDialog } from './RestDialog';

const members = [
  { id: 'a', name: 'Lyric' },
  { id: 'b', name: 'Brask' },
];

describe('the short-rest dialog', () => {
  it('names every seated member in one call, defaulting to no hit dice', async () => {
    const onRest = vi.fn().mockResolvedValue(undefined);
    render(
      <RestDialog
        open
        onOpenChange={() => undefined}
        members={members}
        onRest={onRest}
      />
    );
    fireEvent.change(screen.getByLabelText('Hit dice for Brask'), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rest' }));
    await waitFor(() =>
      expect(onRest).toHaveBeenCalledWith([
        { member: 'a', hitDice: 0 },
        { member: 'b', hitDice: 2 },
      ])
    );
  });

  it('shows the server’s refusal', () => {
    render(
      <RestDialog
        open
        onOpenChange={() => undefined}
        members={members}
        onRest={vi.fn()}
        error="Brask is in a fight"
      />
    );
    expect(screen.getByRole('alert').textContent).toBe('Brask is in a fight');
  });
});
