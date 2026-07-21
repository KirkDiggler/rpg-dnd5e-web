import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EquipmentSlots } from './EquipmentSlots';
import type { EquippedMap, ItemLike, SlotDefLike } from './equipmentTypes';

const SLOTS: SlotDefLike[] = [
  { key: 'main_hand', displayLabel: 'Main hand', accepts: ['weapon'] },
  { key: 'off_hand', displayLabel: 'Off hand', accepts: ['weapon', 'shield'] },
  { key: 'armor', displayLabel: 'Armor', accepts: ['armor'] },
];

const ITEMS: ItemLike[] = [
  {
    ref: { module: 'dnd5e', type: 'item', id: 'longsword' },
    name: 'Longsword',
    statLine: '1d8 slashing · versatile',
    iconKey: 'icons/weapons/longsword.png',
    kind: 'weapon',
    slotKeys: ['main_hand', 'off_hand'],
  },
];

describe('EquipmentSlots', () => {
  it('renders an empty hint for a socket with no Ref in `equipped`', () => {
    render(
      <EquipmentSlots
        slots={SLOTS}
        equipped={{}}
        items={ITEMS}
        onIntent={vi.fn()}
      />
    );
    const socket = screen.getByTestId('equip-socket-main_hand');
    expect(socket.textContent).toContain('— empty —');
    expect((socket as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders the equipped item looked up by Ref.id from `items`', () => {
    const equipped: EquippedMap = {
      main_hand: { module: 'dnd5e', type: 'item', id: 'longsword' },
    };
    render(
      <EquipmentSlots
        slots={SLOTS}
        equipped={equipped}
        items={ITEMS}
        onIntent={vi.fn()}
      />
    );
    const socket = screen.getByTestId('equip-socket-main_hand');
    expect(socket.textContent).toContain('Longsword');
    expect(socket.textContent).toContain('1d8 slashing · versatile');
    expect((socket as HTMLButtonElement).disabled).toBe(false);
  });

  it('emits an UnequipItem intent when an occupied socket is clicked', () => {
    const onIntent = vi.fn();
    const equipped: EquippedMap = {
      main_hand: { module: 'dnd5e', type: 'item', id: 'longsword' },
    };
    render(
      <EquipmentSlots
        slots={SLOTS}
        equipped={equipped}
        items={ITEMS}
        onIntent={onIntent}
      />
    );
    fireEvent.click(screen.getByTestId('equip-socket-main_hand'));
    expect(onIntent).toHaveBeenCalledWith({
      kind: 'UnequipItem',
      slotKey: 'main_hand',
    });
  });

  it('skips the <img> entirely for an empty icon_key (graceful fallback, rpg-api#680)', () => {
    const noIconItems: ItemLike[] = [{ ...ITEMS[0], iconKey: '' }];
    const equipped: EquippedMap = {
      main_hand: { module: 'dnd5e', type: 'item', id: 'longsword' },
    };
    render(
      <EquipmentSlots
        slots={SLOTS}
        equipped={equipped}
        items={noIconItems}
        onIntent={vi.fn()}
      />
    );
    expect(
      screen.getByTestId('equip-socket-main_hand').querySelector('img')
    ).toBeNull();
  });

  it('disables every socket while `busy`', () => {
    const equipped: EquippedMap = {
      main_hand: { module: 'dnd5e', type: 'item', id: 'longsword' },
    };
    render(
      <EquipmentSlots
        slots={SLOTS}
        equipped={equipped}
        items={ITEMS}
        onIntent={vi.fn()}
        busy
      />
    );
    expect(
      (screen.getByTestId('equip-socket-main_hand') as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });
});
