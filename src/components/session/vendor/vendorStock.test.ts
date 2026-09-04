import type { VendorStockEntry } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { VendorStockMode } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { describe, expect, it } from 'vitest';
import { vendorStockLabel } from './vendorStock';

function entry(overrides: Partial<VendorStockEntry>): VendorStockEntry {
  return {
    equipmentType: 'weapon',
    equipmentId: 'longsword',
    displayName: 'Longsword',
    stockMode: VendorStockMode.UNSPECIFIED,
    ...overrides,
  } as VendorStockEntry;
}

describe('vendorStockLabel', () => {
  it('shows the remaining count for LIMITED stock', () => {
    expect(
      vendorStockLabel(
        entry({ stockMode: VendorStockMode.LIMITED, quantity: 1 })
      )
    ).toBe('1 left');
  });

  it('never carries a quantity into the UNLIMITED label, even if one is set', () => {
    expect(
      vendorStockLabel(
        entry({ stockMode: VendorStockMode.UNLIMITED, quantity: 20 })
      )
    ).toBe('Always in stock');
  });

  it('falls back to "Always in stock" for an unspecified mode (defensive, not primary)', () => {
    expect(
      vendorStockLabel(entry({ stockMode: VendorStockMode.UNSPECIFIED }))
    ).toBe('Always in stock');
  });

  it('reads a LIMITED entry with no quantity as 0 left rather than throwing', () => {
    expect(
      vendorStockLabel(entry({ stockMode: VendorStockMode.LIMITED }))
    ).toBe('0 left');
  });
});
