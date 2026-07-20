/**
 * Behavioral tests for the equipment fixture reducer — the reducer is the
 * acceptance spec for CONTRACT.md §6 (occupancy semantics the server must
 * implement), so these pin the semantics, not implementation details.
 */

import { describe, expect, it } from 'vitest';
import type { EquipIntent } from './fixtures';
import { applyIntent, EQUIP_CASTS, targetSlotFor } from './fixtures';

const fighter = EQUIP_CASTS[0];
const equip = (id: string, slotKey: string): EquipIntent => ({
  kind: 'EquipItem',
  ref: { module: 'dnd5e', type: 'item', id },
  slotKey,
});

describe('equipment fixture reducer (CONTRACT.md §6 semantics)', () => {
  it('equips a carried item into an empty compatible slot', () => {
    const next = applyIntent(
      {},
      fighter.items,
      equip('longsword', 'main_hand')
    );
    expect(next.main_hand).toBe('longsword');
  });

  it('two-handed equip clears the off hand', () => {
    const start = { main_hand: 'longsword', off_hand: 'shield' };
    const next = applyIntent(
      start,
      fighter.items,
      equip('greatsword', 'main_hand')
    );
    expect(next.main_hand).toBe('greatsword');
    expect(next.off_hand).toBeUndefined();
  });

  it('equipping the off hand while a two-hander is held frees the main hand', () => {
    const start = { main_hand: 'greatsword' };
    const next = applyIntent(start, fighter.items, equip('shield', 'off_hand'));
    expect(next.off_hand).toBe('shield');
    expect(next.main_hand).toBeUndefined();
  });

  it('unequip empties only the named slot', () => {
    const start = { main_hand: 'longsword', armor: 'chain-mail' };
    const next = applyIntent(start, fighter.items, {
      kind: 'UnequipItem',
      slotKey: 'main_hand',
    });
    expect(next.main_hand).toBeUndefined();
    expect(next.armor).toBe('chain-mail');
  });

  it('rejects an incompatible slot (no state change)', () => {
    const start = { armor: 'chain-mail' };
    const next = applyIntent(
      start,
      fighter.items,
      equip('chain-mail', 'main_hand')
    );
    expect(next).toEqual(start);
  });

  it('moving an equipped item between slots vacates its old slot', () => {
    const start = { main_hand: 'longsword' };
    const next = applyIntent(
      start,
      fighter.items,
      equip('longsword', 'off_hand')
    );
    expect(next.off_hand).toBe('longsword');
    expect(next.main_hand).toBeUndefined();
  });
});

describe('targetSlotFor (inventory-light click targeting)', () => {
  it('prefers an empty compatible slot', () => {
    const handaxe = fighter.items.find((i) => i.ref.id === 'handaxe')!;
    expect(
      targetSlotFor(handaxe, fighter.slots, { main_hand: 'longsword' })
    ).toBe('off_hand');
  });

  it('falls back to an occupied compatible slot (swap)', () => {
    const greatsword = fighter.items.find((i) => i.ref.id === 'greatsword')!;
    expect(
      targetSlotFor(greatsword, fighter.slots, {
        main_hand: 'longsword',
        off_hand: 'shield',
        armor: 'chain-mail',
      })
    ).toBe('main_hand');
  });

  it('returns undefined for slotless gear', () => {
    const torch = fighter.items.find((i) => i.ref.id === 'torch')!;
    expect(targetSlotFor(torch, fighter.slots, {})).toBeUndefined();
  });
});
