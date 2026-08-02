import type { DungeonSummary } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DungeonPicker } from './DungeonPicker';

const dungeons = [
  { key: 'reference-tomb', name: 'The Reference Tomb' },
  { key: 'smoke-test', name: 'Smoke Test' },
] as DungeonSummary[];

describe('DungeonPicker', () => {
  it('renders one option per ListDungeons result', () => {
    render(<DungeonPicker dungeons={dungeons} value="" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /choose a dungeon/i }));

    // getByRole throws if no matching element exists — reaching these
    // lines is itself the assertion that both options rendered.
    screen.getByRole('button', { name: 'The Reference Tomb' });
    screen.getByRole('button', { name: 'Smoke Test' });
  });

  it('calls onChange with the selected dungeon key, not its display name', () => {
    const onChange = vi.fn();
    render(<DungeonPicker dungeons={dungeons} value="" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /choose a dungeon/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Smoke Test' }));

    expect(onChange).toHaveBeenCalledWith('smoke-test');
  });

  it('shows a loading placeholder and disables the trigger while dungeons are loading', () => {
    render(<DungeonPicker dungeons={[]} value="" onChange={vi.fn()} loading />);

    const trigger = screen.getByRole('button', {
      name: /loading dungeons/i,
    }) as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
  });

  it('shows no selectable dungeons when the list is empty and not loading', () => {
    render(<DungeonPicker dungeons={[]} value="" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /choose a dungeon/i }));

    screen.getByText('No options available');
  });

  it('respects an explicit disabled prop independent of loading', () => {
    render(
      <DungeonPicker dungeons={dungeons} value="" onChange={vi.fn()} disabled />
    );

    const trigger = screen.getByRole('button', {
      name: /choose a dungeon/i,
    }) as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
  });
});
