/**
 * A selected creature lists the conversations it carries, each a way to
 * open it on the Conversations page (rpg-project#1059). The list is the
 * engine's, given through SharedLinesContext.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SharedLinesContext,
  type SharedLinesInForm,
} from '../world-building/sharedLinesContext';
import { CarriedConversations } from './CarriedConversations';

afterEach(cleanup);

const shown = (
  carried: { id: string; lines: number }[],
  open?: (id: string) => void
): SharedLinesInForm => ({
  lineCount: () => undefined,
  open,
  carriedBy: () => carried,
});

const renderWith = (value: SharedLinesInForm) =>
  render(
    <SharedLinesContext.Provider value={value}>
      <CarriedConversations kind="creature" id="captain" name="Guard Captain" />
    </SharedLinesContext.Provider>
  );

describe('CarriedConversations', () => {
  it('lists each conversation as a button that opens it', () => {
    const open = vi.fn();
    renderWith(
      shown(
        [
          { id: 'the-gate', lines: 3 },
          { id: 'past-the-gate', lines: 1 },
        ],
        open
      )
    );
    expect(screen.getByText('Conversations')).toBeTruthy();
    const gate = screen.getByRole('button', {
      name: 'Open the-gate in Conversations',
    });
    expect(gate.textContent).toBe('the-gate · 3 lines');
    expect(
      screen.getByRole('button', {
        name: 'Open past-the-gate in Conversations',
      }).textContent
    ).toBe('past-the-gate · 1 line');
    expect(screen.getAllByRole('button')).toHaveLength(2);
    fireEvent.click(gate);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('the-gate');
  });

  it('names the section for the carrier', () => {
    renderWith(shown([{ id: 'the-gate', lines: 3 }], vi.fn()));
    expect(
      screen.getByRole('region', {
        name: 'Conversations Guard Captain carries',
      })
    ).toBeTruthy();
  });

  it('renders nothing when the carrier carries none', () => {
    const { container } = renderWith(shown([], vi.fn()));
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when the context cannot say', () => {
    const { container } = renderWith({ lineCount: () => undefined });
    expect(container.innerHTML).toBe('');
  });

  it('shows plain text, no button, where there is no page to open', () => {
    renderWith(shown([{ id: 'the-gate', lines: 3 }]));
    expect(screen.getByText('the-gate · 3 lines')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
