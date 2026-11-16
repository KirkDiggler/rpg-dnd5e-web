import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { stringify } from 'yaml';
import { StatesEditor } from './StatesEditor';
import { TablesPanel } from './TablesPanel';
import type { CreatureStates } from './creatureStates';

const asleep: CreatureStates = {
  initial: 'asleep',
  asleep: {
    transitions: [
      { on: 'heard', within: 2, to: 'awake', reason: 'heard a crash' },
    ],
  },
  awake: { transitions: [{ on: 'time', do: [{ pick: 'march' }] }] },
};

describe('S6b recipe authoring', () => {
  it('applies atomically, cancels uncommitted text, and clears an override to inherit', () => {
    const commit = vi.fn();
    function Harness() {
      const [value, setValue] = useState<CreatureStates>();
      return (
        <StatesEditor
          owner="guard"
          value={value}
          inherited={asleep}
          onChange={(next) => {
            commit(next);
            setValue(next);
          }}
        />
      );
    }
    render(<Harness />);
    expect(screen.getByText(/Inherits its faction/)).toBeTruthy();
    const input = screen.getByLabelText('States YAML for guard');
    fireEvent.change(input, { target: { value: stringify(asleep) } });
    expect(commit).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Cancel states for guard' })
    );
    expect(
      (screen.getByLabelText('States YAML for guard') as HTMLTextAreaElement)
        .value
    ).toBe('');
    fireEvent.change(screen.getByLabelText('States YAML for guard'), {
      target: { value: stringify(asleep) },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Apply states for guard' })
    );
    expect(commit).toHaveBeenLastCalledWith(asleep);
    fireEvent.click(
      screen.getByRole('button', { name: 'Use inherited states for guard' })
    );
    expect(commit).toHaveBeenLastCalledWith(undefined);
  });
  it('shows a pathed refusal without saving invalid or duplicate-key YAML', () => {
    const commit = vi.fn();
    render(<StatesEditor owner="guard" value={asleep} onChange={commit} />);
    fireEvent.change(screen.getByLabelText('States YAML for guard'), {
      target: { value: 'initial: missing\nasleep: {}\n' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Apply states for guard' })
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'guard.states.initial'
    );
    expect(commit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('States YAML for guard'), {
      target: { value: 'initial: asleep\nasleep: {}\nasleep: {}\n' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Apply states for guard' })
    );
    expect(screen.getByRole('alert').textContent).toMatch(/unique|duplicate/i);
    expect(commit).not.toHaveBeenCalled();
  });
  it('shows custom table rows with the time vocabulary, and offers recipe-picked keys', () => {
    const commit = vi.fn();
    render(
      <TablesPanel
        scope={{
          factions: [{ id: 'garrison', states: asleep }],
          tables: {
            drill: { march: [{ hold: {} }] },
            spare: { time: [{ hold: {} }] },
          },
        }}
        onChange={commit}
      />
    );
    expect(screen.getAllByText('march').length).toBeGreaterThan(0);
    const picker = screen.getByLabelText('Add trigger to spare');
    fireEvent.change(picker, { target: { value: 'march' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Add entry on march to spare' })
    );
    expect(commit.mock.lastCall?.[0].tables.spare.march).toEqual([
      { hold: {} },
    ]);
  });
});
