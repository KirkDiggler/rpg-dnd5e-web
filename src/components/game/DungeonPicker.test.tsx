import {
  DungeonSource,
  type DungeonSummary,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/lobby/v1alpha1/service_pb';
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

  it("DungeonPicker labels yours, another member's and reference in server order", () => {
    const listed = [
      {
        key: 'the-cells',
        name: 'The cells',
        source: DungeonSource.WORLD,
        owner: 'player-a',
      },
      {
        key: 'b-keep',
        name: 'The keep',
        source: DungeonSource.WORLD,
        owner: 'walk-player-b',
      },
      {
        key: 'castle-kitchen',
        name: 'The castle kitchen',
        source: DungeonSource.SHIPPED,
        owner: '',
      },
    ] as DungeonSummary[];
    const onChange = vi.fn();
    render(
      <DungeonPicker
        dungeons={listed}
        value=""
        onChange={onChange}
        playerId="player-a"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /choose a dungeon/i }));
    const labels = [
      'The cells (yours)',
      'The keep (walk-player-b)',
      'The castle kitchen (reference)',
    ];
    const options = screen
      .getAllByRole('button')
      .map((button) => button.textContent)
      .filter((text) => labels.includes(text ?? ''));
    expect(options).toEqual(labels);
    fireEvent.click(
      screen.getByRole('button', { name: 'The keep (walk-player-b)' })
    );
    expect(onChange).toHaveBeenCalledWith('b-keep');
  });

  it('a server that lists no source keeps the bare names', () => {
    render(<DungeonPicker dungeons={dungeons} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /choose a dungeon/i }));
    screen.getByRole('button', { name: 'The Reference Tomb' });
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
