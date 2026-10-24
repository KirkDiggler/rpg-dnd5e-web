import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnswerEntryRow } from './SitePolicies';

const entry = {
  when: { attacked: { within: 3 } },
  attack: 'attacker',
  weight: 3,
  say: 'Back off!',
};

describe('answer-entry sentence', () => {
  it('orders condition, action and target before secondary dialogue and weight', () => {
    render(
      <ul>
        <AnswerEntryRow
          trigger="time"
          entry={entry}
          onCommit={() => {}}
          onRemove={() => {}}
        />
      </ul>
    );
    const controls = [
      screen.getByLabelText('When for time entry'),
      screen.getByLabelText('Within for time entry'),
      screen.getByRole('combobox', { name: 'Do for time entry' }),
      screen.getByRole('combobox', { name: 'To for time entry' }),
      screen.getByLabelText('Say (optional) for time entry'),
      screen.getByLabelText('Weight for time entry'),
    ];
    for (let i = 1; i < controls.length; i++) {
      expect(
        controls[i - 1].compareDocumentPosition(controls[i]) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).not.toBe(0);
    }
    expect(screen.getByText('Do')).toBeTruthy();
    expect(screen.getByText('To')).toBeTruthy();
    expect(screen.getByText('rounds')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Attack' })).toBeTruthy();
  });

  it('keeps numeric weight secondary without changing its authored meaning', () => {
    const commit = vi.fn();
    render(
      <ul>
        <AnswerEntryRow
          trigger="time"
          entry={entry}
          onCommit={commit}
          onRemove={() => {}}
        />
      </ul>
    );
    fireEvent.change(screen.getByLabelText('Weight for time entry'), {
      target: { value: '5' },
    });
    expect(commit).toHaveBeenLastCalledWith({ ...entry, weight: 5 });
    expect(screen.getByText(/not execution order/)).toBeTruthy();
  });

  it('shows a search’s cells, the engine’s six when none is written, and commits a new distance', () => {
    const commit = vi.fn();
    const searching = { when: { enemy: 'lost' as const }, search: {} };
    render(
      <ul>
        <AnswerEntryRow
          trigger="time"
          entry={searching}
          onCommit={commit}
          onRemove={() => {}}
        />
      </ul>
    );
    const cells = screen.getByLabelText(
      'Cells for time entry'
    ) as HTMLInputElement;
    expect(cells.value).toBe('6');
    fireEvent.change(cells, { target: { value: '4' } });
    expect(commit).toHaveBeenLastCalledWith({
      ...searching,
      search: { distance: 4 },
    });
    commit.mockClear();
    fireEvent.change(cells, { target: { value: '0' } });
    expect(commit).not.toHaveBeenCalled();
  });

  it('shows a search’s heading, went when none is written, and edits it without dropping the cells (rpg-project#679)', () => {
    const commit = vi.fn();
    const searching = {
      when: { enemy: 'lost' as const },
      search: { distance: 6 },
    };
    render(
      <ul>
        <AnswerEntryRow
          trigger="time"
          entry={searching}
          onCommit={commit}
          onRemove={() => {}}
        />
      </ul>
    );
    const heading = screen.getByRole('combobox', {
      name: 'Heading for time entry',
    }) as HTMLSelectElement;
    expect(heading.value).toBe('went');
    expect(Array.from(heading.options).map((option) => option.value)).toEqual([
      'went',
      'faced',
      'left',
      'right',
    ]);
    fireEvent.change(heading, { target: { value: 'left' } });
    expect(commit).toHaveBeenLastCalledWith({
      ...searching,
      search: { distance: 6, heading: 'left' },
    });
  });

  it('keeps a written heading when the cells change', () => {
    const commit = vi.fn();
    const searching = {
      when: { enemy: 'lost' as const },
      search: { distance: 6, heading: 'went' as const },
    };
    render(
      <ul>
        <AnswerEntryRow
          trigger="time"
          entry={searching}
          onCommit={commit}
          onRemove={() => {}}
        />
      </ul>
    );
    fireEvent.change(screen.getByLabelText('Cells for time entry'), {
      target: { value: '4' },
    });
    expect(commit).toHaveBeenLastCalledWith({
      ...searching,
      search: { distance: 4, heading: 'went' },
    });
  });
});
