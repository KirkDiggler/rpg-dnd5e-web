import { describe, expect, it } from 'vitest';
import type { EquippedMap, ItemLike } from './equipmentTypes';
import { computeCarried } from './equipmentTypes';

const LONGSWORD: ItemLike = {
  ref: { module: 'dnd5e', type: 'item', id: 'longsword' },
  name: 'Longsword',
  statLine: '1d8 slashing · versatile',
  iconKey: '',
  kind: 'weapon',
  equipmentType: 'weapon',
  slotKeys: ['main_hand', 'off_hand'],
  quantity: 2,
};

describe('computeCarried', () => {
  it('subtracts equipped copies from the owned count', () => {
    const equipped: EquippedMap = {
      main_hand: { module: 'dnd5e', type: 'item', id: 'longsword' },
    };
    const carried = computeCarried([LONGSWORD], equipped);
    expect(carried).toEqual([
      { item: LONGSWORD, carriedCount: 1, showCount: true },
    ]);
  });

  it('drops a stack entirely once every owned copy is equipped', () => {
    const equipped: EquippedMap = {
      main_hand: { module: 'dnd5e', type: 'item', id: 'longsword' },
      off_hand: { module: 'dnd5e', type: 'item', id: 'longsword' },
    };
    expect(computeCarried([LONGSWORD], equipped)).toEqual([]);
  });

  it('does not subtract an equipped item that only shares the bare ref id', () => {
    const equipped: EquippedMap = {
      main_hand: { module: 'homebrew', type: 'item', id: 'longsword' },
    };
    expect(computeCarried([LONGSWORD], equipped)).toEqual([
      { item: LONGSWORD, carriedCount: 2, showCount: true },
    ]);
  });

  it('treats a legacy zero-quantity owner item as one carried copy', () => {
    const zeroQty: ItemLike = { ...LONGSWORD, quantity: 0 };
    expect(computeCarried([zeroQty], {})).toEqual([
      { item: zeroQty, carriedCount: 1, showCount: false },
    ]);
  });

  it('does not flag showCount for a single unequipped copy', () => {
    const single: ItemLike = { ...LONGSWORD, quantity: 1 };
    expect(computeCarried([single], {})).toEqual([
      { item: single, carriedCount: 1, showCount: false },
    ]);
  });
});
