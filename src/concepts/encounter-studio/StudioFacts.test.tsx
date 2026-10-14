import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createCastleReadBackDocument } from './fixtures/castleReadBack';
import { StudioFacts } from './StudioFacts';

describe('StudioFacts', () => {
  const row = (fact: string) =>
    document.querySelector(`[data-fact="${fact}"]`) as HTMLElement;

  it('reads each fact with its writers and readers, and marks the lonely ones', () => {
    render(
      <StudioFacts document={createCastleReadBackDocument()} onOpen={vi.fn()} />
    );
    expect(row('feast-tonight').textContent).toBe(
      'feast-tonight · written by cook: gossip, cook: bribe · read by captain: troupe, cook: ashford'
    );
    expect(row('king-is-cultist').textContent).toContain(
      'read by nothing · written, never read'
    );
  });

  it('clicking a writer selects the cook', () => {
    const onOpen = vi.fn();
    render(
      <StudioFacts document={createCastleReadBackDocument()} onOpen={onOpen} />
    );
    fireEvent.click(
      within(row('feast-tonight')).getByRole('button', {
        name: 'cook: gossip',
      })
    );
    expect(onOpen).toHaveBeenCalledWith({ kind: 'creature', id: 'cook' });
    expect(screen.getByRole('region', { name: 'Facts' })).toBeTruthy();
  });
});
