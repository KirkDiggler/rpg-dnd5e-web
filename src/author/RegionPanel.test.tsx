import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RegionPanel } from './RegionPanel';

const region = {
  id: 'hall',
  name: 'Hall',
  archetype: 'crypt',
  lighting: { intensity: 0.4 },
  cells: [],
};

describe('RegionPanel', () => {
  it('edits id, name, archetype and the intensity slider', () => {
    const onChange = vi.fn();
    render(
      <RegionPanel
        region={region}
        takenIds={new Set(['tomb'])}
        onChange={onChange}
        onRemove={() => {}}
      />
    );
    fireEvent.change(screen.getByLabelText('name'), {
      target: { value: 'Great Hall' },
    });
    expect(onChange).toHaveBeenLastCalledWith({ name: 'Great Hall' });
    fireEvent.change(screen.getByLabelText('archetype'), {
      target: { value: 'cave' },
    });
    expect(onChange).toHaveBeenLastCalledWith({ archetype: 'cave' });
    fireEvent.change(screen.getByLabelText('lighting intensity'), {
      target: { value: '0.15' },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      lighting: { intensity: 0.15 },
    });
    fireEvent.change(screen.getByLabelText('id'), {
      target: { value: 'tomb' },
    });
    expect(onChange).not.toHaveBeenCalledWith({ id: 'tomb' });
    fireEvent.change(screen.getByLabelText('id'), {
      target: { value: 'hall-2' },
    });
    expect(onChange).toHaveBeenLastCalledWith({ id: 'hall-2' });
  });
});
