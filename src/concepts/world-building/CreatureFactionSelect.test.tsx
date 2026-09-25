import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreatureOrders } from './SitePolicies';
import { createRoomDraft } from './roomDraft';
import { createEmptyScene } from './sceneState';

const room = createRoomDraft(createEmptyScene('scene'), 'room').room;
const monster = {
  id: 'guard',
  ref: 'dnd5e:monsters:thug',
  startingCell: { location: { q: 0, r: 0 } },
};

describe('Creature faction selector', () => {
  it('offers declared factions and default, with no arbitrary membership text', () => {
    const change = vi.fn();
    render(
      <CreatureOrders
        scope={{ factions: [{ id: 'watch' }, { id: 'wolves' }] }}
        room={room}
        monster={monster}
        onFactionChange={change}
      />
    );
    const picker = screen.getByRole('combobox', { name: 'Creature faction' });
    expect(
      within(picker)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['Kind’s default', 'watch', 'wolves']);
    fireEvent.change(picker, { target: { value: 'watch' } });
    expect(change).toHaveBeenLastCalledWith('watch');
    fireEvent.change(picker, { target: { value: '' } });
    expect(change).toHaveBeenLastCalledWith(undefined);
  });

  it('shows an unknown imported reference without silently replacing it', () => {
    const change = vi.fn();
    render(
      <CreatureOrders
        scope={{}}
        room={room}
        monster={monster}
        binding={{ faction: 'missing' }}
        onFactionChange={change}
      />
    );
    const picker = screen.getByRole('combobox', {
      name: 'Creature faction',
    }) as HTMLSelectElement;
    expect(picker.value).toBe('missing');
    expect(
      within(picker).getByRole('option', { name: 'missing (not declared)' })
    ).toBeTruthy();
    expect(change).not.toHaveBeenCalled();
  });
});
