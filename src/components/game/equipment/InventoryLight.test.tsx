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
    equipmentType: 'weapon',
    slotKeys: ['main_hand', 'off_hand'],
    quantity: 2,
  },
  {
    ref: { module: 'dnd5e', type: 'item', id: 'greatsword' },
    name: 'Greatsword',
    statLine: '2d6 slashing · two-handed',
    iconKey: '',
    kind: 'weapon',
    equipmentType: 'weapon',
    slotKeys: ['main_hand'],
    quantity: 1,
  },
  {
    ref: { module: 'dnd5e', type: 'item', id: 'torch' },
    name: 'Torch',
    statLine: 'light, 20 ft radius',
    iconKey: '',
    kind: 'gear',
    equipmentType: 'item',
    slotKeys: [],
    quantity: 1,
  },
];

const EXPLORERS_PACK: ItemLike = {
  ref: { module: 'dnd5e', type: 'item', id: 'explorers-pack' },
  name: "Explorer's Pack",
  statLine: '',
  iconKey: '',
  kind: 'gear',
  equipmentType: 'pack',
  slotKeys: [],
  quantity: 1,
};

describe('InventoryLight', () => {
  it('shows ×1 carried and targets the empty hand when one of two copies is equipped', () => {
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
    const longswordRow = screen.getByTestId(invTestId('longsword'));
    expect(longswordRow.textContent).toContain('×1');
    expect(longswordRow.getAttribute('aria-label')).toContain('Off hand');
    expect(screen.getByTestId(invTestId('greatsword'))).toBeTruthy();
    expect(screen.getByTestId(invTestId('torch'))).toBeTruthy();
  });

  it('removes the carried row after both owned copies are equipped', () => {
    const equipped: EquippedMap = {
      main_hand: { module: 'dnd5e', type: 'item', id: 'longsword' },
      off_hand: { module: 'dnd5e', type: 'item', id: 'longsword' },
    };
    render(
      <InventoryLight
        slots={SLOTS}
        equipped={equipped}
        items={ITEMS.slice(0, 1)}
        onIntent={vi.fn()}
      />
    );
    expect(screen.queryByTestId(invTestId('longsword'))).toBeNull();
    expect(screen.getByText('Nothing carried.')).toBeTruthy();
  });

  it('renders the declared count for an unequipped multi-copy stack', () => {
    render(
      <InventoryLight
        slots={SLOTS}
        equipped={{}}
        items={ITEMS.slice(0, 1)}
        onIntent={vi.fn()}
      />
    );
    expect(screen.getByTestId(invTestId('longsword')).textContent).toContain(
      '×2'
    );
  });

  it('does not subtract an equipped item that only shares the bare ref id', () => {
    const equipped: EquippedMap = {
      main_hand: { module: 'homebrew', type: 'item', id: 'longsword' },
    };
    render(
      <InventoryLight
        slots={SLOTS}
        equipped={equipped}
        items={ITEMS.slice(0, 1)}
        onIntent={vi.fn()}
      />
    );
    expect(screen.getByTestId(invTestId('longsword')).textContent).toContain(
      '×2'
    );
  });

  it('falls back to one carried copy for a legacy zero-quantity owner item', () => {
    render(
      <InventoryLight
        slots={SLOTS}
        equipped={{}}
        items={[{ ...ITEMS[1], quantity: 0 }]}
        onIntent={vi.fn()}
      />
    );
    const row = screen.getByTestId(invTestId('greatsword'));
    expect(row.textContent).not.toMatch(/×\d+/);
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

  it('resolves a canonical icon for a carried item when icon_key is empty (rpg-dnd5e-web#576)', () => {
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
    const row = screen.getByTestId(invTestId('greatsword'));
    const img = row.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe(
      '/models/synty/ui/library/icons/inventory/ICON_FantasyWarrior_Inventory_Swords01_Clean.png'
    );
    expect(img?.getAttribute('alt')).toBe('');
    expect(row.getAttribute('title')).toContain('Greatsword');
    expect(row.getAttribute('aria-label')).toContain('Greatsword');
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

  describe('a pack row (rpg-toolkit#1546)', () => {
    it('shows an Unpack button instead of an unclickable gear row', () => {
      render(
        <InventoryLight
          slots={SLOTS}
          equipped={{}}
          items={[EXPLORERS_PACK]}
          onIntent={vi.fn()}
        />
      );
      expect(
        screen.getByRole('button', { name: "Unpack Explorer's Pack" })
      ).toBeTruthy();
    });

    it('clicking Unpack shows an inline confirm instead of emitting the intent immediately', () => {
      const onIntent = vi.fn();
      render(
        <InventoryLight
          slots={SLOTS}
          equipped={{}}
          items={[EXPLORERS_PACK]}
          onIntent={onIntent}
        />
      );
      fireEvent.click(
        screen.getByRole('button', { name: "Unpack Explorer's Pack" })
      );
      expect(onIntent).not.toHaveBeenCalled();
      expect(
        screen.getByTestId(`unpack-confirm-${refKey(EXPLORERS_PACK.ref)}`)
          .textContent
      ).toContain("Unpack Explorer's Pack?");
    });

    it('Confirm emits a single-instance Unpack intent and clears the pending state', () => {
      const onIntent = vi.fn();
      render(
        <InventoryLight
          slots={SLOTS}
          equipped={{}}
          items={[EXPLORERS_PACK]}
          onIntent={onIntent}
        />
      );
      fireEvent.click(
        screen.getByRole('button', { name: "Unpack Explorer's Pack" })
      );
      fireEvent.click(
        screen.getByRole('button', { name: "Confirm unpack Explorer's Pack" })
      );
      expect(onIntent).toHaveBeenCalledOnce();
      expect(onIntent).toHaveBeenCalledWith({
        kind: 'Unpack',
        ref: EXPLORERS_PACK.ref,
        name: "Explorer's Pack",
        quantity: 1,
      });
      expect(
        screen.queryByTestId(`unpack-confirm-${refKey(EXPLORERS_PACK.ref)}`)
      ).toBeNull();
    });

    it('Cancel dismisses the confirm without emitting an intent', () => {
      const onIntent = vi.fn();
      render(
        <InventoryLight
          slots={SLOTS}
          equipped={{}}
          items={[EXPLORERS_PACK]}
          onIntent={onIntent}
        />
      );
      fireEvent.click(
        screen.getByRole('button', { name: "Unpack Explorer's Pack" })
      );
      fireEvent.click(screen.getByRole('button', { name: 'Cancel unpack' }));
      expect(onIntent).not.toHaveBeenCalled();
      expect(
        screen.queryByTestId(`unpack-confirm-${refKey(EXPLORERS_PACK.ref)}`)
      ).toBeNull();
    });

    it('disables Unpack/Confirm/Cancel while `busy`', () => {
      render(
        <InventoryLight
          slots={SLOTS}
          equipped={{}}
          items={[EXPLORERS_PACK]}
          onIntent={vi.fn()}
          busy
        />
      );
      expect(
        (
          screen.getByRole('button', {
            name: "Unpack Explorer's Pack",
          }) as HTMLButtonElement
        ).disabled
      ).toBe(true);
    });
  });
});
