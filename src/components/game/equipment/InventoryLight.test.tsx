import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InventoryLight } from './InventoryLight';
import type { EquippedMap, ItemLike, SlotDefLike } from './equipmentTypes';
import { refKey } from './equipmentTypes';

const SLOTS: SlotDefLike[] = [
  { key: 'main_hand', displayLabel: 'Main hand', accepts: ['weapon'] },
  { key: 'off_hand', displayLabel: 'Off hand', accepts: ['weapon', 'shield'] },
  { key: 'armor', displayLabel: 'Armor', accepts: ['armor'] },
];

/** Matches InventoryLight's `data-testid={inv-${refKey(item.ref)}}`. */
const invTestId = (id: string) =>
  `inv-${refKey({ module: 'dnd5e', type: 'item', id })}`;

const ITEMS: ItemLike[] = [
  {
    ref: { module: 'dnd5e', type: 'item', id: 'longsword' },
    name: 'Longsword',
    statLine: '1d8 slashing · versatile',
    iconKey: '',
    kind: 'weapon',
    slotKeys: ['main_hand', 'off_hand'],
  },
  {
    ref: { module: 'dnd5e', type: 'item', id: 'greatsword' },
    name: 'Greatsword',
    statLine: '2d6 slashing · two-handed',
    iconKey: '',
    kind: 'weapon',
    slotKeys: ['main_hand'],
  },
  {
    ref: { module: 'dnd5e', type: 'item', id: 'torch' },
    name: 'Torch',
    statLine: 'light, 20 ft radius',
    iconKey: '',
    kind: 'gear',
    slotKeys: [],
  },
];

describe('InventoryLight', () => {
  it('lists only items NOT referenced by `equipped`', () => {
    const equipped: EquippedMap = {
      main_hand: { module: 'dnd5e', type: 'item', id: 'longsword' },
    };
    render(
      <InventoryLight
        slots={SLOTS}
        equipped={equipped}
        items={ITEMS}
        onIntent={vi.fn()}
      />
    );
    expect(screen.queryByTestId(invTestId('longsword'))).toBeNull();
    expect(screen.getByTestId(invTestId('greatsword'))).toBeTruthy();
    expect(screen.getByTestId(invTestId('torch'))).toBeTruthy();
  });

  it('shows the empty-carried message when everything is equipped', () => {
    const equipped: EquippedMap = {
      main_hand: { module: 'dnd5e', type: 'item', id: 'longsword' },
      off_hand: { module: 'dnd5e', type: 'item', id: 'greatsword' },
    };
    render(
      <InventoryLight
        slots={SLOTS}
        equipped={equipped}
        items={ITEMS.slice(0, 2)}
        onIntent={vi.fn()}
      />
    );
    expect(screen.getByText('Nothing carried.')).toBeTruthy();
  });

  it('renders slotless gear unclickable, with a "gear" badge', () => {
    render(
      <InventoryLight
        slots={SLOTS}
        equipped={{}}
        items={ITEMS}
        onIntent={vi.fn()}
      />
    );
    const torchRow = screen.getByTestId(invTestId('torch'));
    expect((torchRow as HTMLButtonElement).disabled).toBe(true);
    expect(torchRow.textContent).toContain('gear');
  });

  it('emits an EquipItem intent targeting the first compatible slot on click', () => {
    const onIntent = vi.fn();
    render(
      <InventoryLight
        slots={SLOTS}
        equipped={{}}
        items={ITEMS}
        onIntent={onIntent}
      />
    );
    fireEvent.click(screen.getByTestId(invTestId('longsword')));
    expect(onIntent).toHaveBeenCalledWith({
      kind: 'EquipItem',
      ref: { module: 'dnd5e', type: 'item', id: 'longsword' },
      slotKey: 'main_hand',
    });
  });

  it('targets the first compatible slot as a swap when nothing is empty', () => {
    const onIntent = vi.fn();
    const equipped: EquippedMap = {
      main_hand: { module: 'dnd5e', type: 'item', id: 'longsword' },
      off_hand: { module: 'dnd5e', type: 'item', id: 'longsword' },
    };
    render(
      <InventoryLight
        slots={SLOTS}
        equipped={equipped}
        items={ITEMS}
        onIntent={onIntent}
      />
    );
    fireEvent.click(screen.getByTestId(invTestId('greatsword')));
    expect(onIntent).toHaveBeenCalledWith({
      kind: 'EquipItem',
      ref: { module: 'dnd5e', type: 'item', id: 'greatsword' },
      slotKey: 'main_hand',
    });
  });

  it('disables every row while `busy`', () => {
    render(
      <InventoryLight
        slots={SLOTS}
        equipped={{}}
        items={ITEMS}
        onIntent={vi.fn()}
        busy
      />
    );
    expect(
      (screen.getByTestId(invTestId('longsword')) as HTMLButtonElement).disabled
    ).toBe(true);
  });
});
