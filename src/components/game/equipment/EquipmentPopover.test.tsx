import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EquipmentPopover } from './EquipmentPopover';
import type { EquippedMap, ItemLike, SlotDefLike } from './equipmentTypes';

const SLOTS: SlotDefLike[] = [
  { key: 'main_hand', displayLabel: 'Main hand', accepts: ['weapon'] },
];
const ITEMS: ItemLike[] = [
  {
    ref: { module: 'dnd5e', type: 'item', id: 'longsword' },
    name: 'Longsword',
    statLine: '1d8 slashing',
    iconKey: '',
    kind: 'weapon',
    slotKeys: ['main_hand'],
  },
];
const EQUIPPED: EquippedMap = {
  main_hand: { module: 'dnd5e', type: 'item', id: 'longsword' },
};

describe('EquipmentPopover', () => {
  it('renders nothing when closed', () => {
    render(
      <EquipmentPopover
        open={false}
        characterName="Sir Aldric"
        classLabel="Fighter"
        slots={SLOTS}
        equipped={EQUIPPED}
        items={ITEMS}
        armorClass={{ total: 18, note: '16 chain mail + 2 shield' }}
        mainHandDamage="1d8 slashing"
        onIntent={vi.fn()}
      />
    );
    expect(screen.queryByTestId('equipment-popover')).toBeNull();
  });

  it('renders the character name, class, AC total+note, and damage when open', () => {
    render(
      <EquipmentPopover
        open
        characterName="Sir Aldric"
        classLabel="Fighter"
        slots={SLOTS}
        equipped={EQUIPPED}
        items={ITEMS}
        armorClass={{ total: 18, note: '16 chain mail + 2 shield' }}
        mainHandDamage="1d8 slashing"
        onIntent={vi.fn()}
      />
    );
    const text = screen.getByTestId('equipment-popover').textContent ?? '';
    expect(text).toContain('Sir Aldric');
    expect(text).toContain('Fighter');
    expect(text).toContain('18');
    expect(text).toContain('16 chain mail + 2 shield');
    expect(text).toContain('1d8 slashing');
  });

  it('renders the slots and inventory sub-panels', () => {
    render(
      <EquipmentPopover
        open
        characterName="Sir Aldric"
        classLabel="Fighter"
        slots={SLOTS}
        equipped={EQUIPPED}
        items={ITEMS}
        armorClass={{ total: 18, note: '16 chain mail + 2 shield' }}
        mainHandDamage="1d8 slashing"
        onIntent={vi.fn()}
      />
    );
    expect(screen.getByTestId('equipment-slots')).toBeTruthy();
    expect(screen.getByTestId('inventory-light')).toBeTruthy();
  });

  it('degrades gracefully when armorClass is undefined (e.g. non-encounter response gap)', () => {
    render(
      <EquipmentPopover
        open
        characterName="Sir Aldric"
        classLabel={undefined}
        slots={SLOTS}
        equipped={EQUIPPED}
        items={ITEMS}
        armorClass={undefined}
        mainHandDamage=""
        onIntent={vi.fn()}
      />
    );
    expect(screen.getByTestId('equipment-popover').textContent ?? '').toContain(
      'Sir Aldric'
    );
  });
});
