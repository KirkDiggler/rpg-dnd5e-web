import type { VendorStockEntry } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { VendorStockMode } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VendorPopover } from './VendorPopover';

const INVENTORY: VendorStockEntry[] = [
  {
    equipmentType: 'weapon',
    equipmentId: 'longsword',
    displayName: 'Longsword',
    stockMode: VendorStockMode.LIMITED,
    quantity: 1,
  },
  {
    equipmentType: 'weapon',
    equipmentId: 'longbow',
    displayName: 'Longbow',
    stockMode: VendorStockMode.LIMITED,
    quantity: 1,
  },
  {
    equipmentType: 'ammunition',
    equipmentId: 'arrows',
    displayName: 'Arrows',
    stockMode: VendorStockMode.UNLIMITED,
  },
] as unknown as VendorStockEntry[];

describe('VendorPopover', () => {
  it('renders nothing when closed', () => {
    render(
      <VendorPopover
        open={false}
        displayName="Demo Merchant"
        inventory={INVENTORY}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByTestId('vendor-popover')).toBeNull();
  });

  it('shows the vendor name and every stock row with the correct label', () => {
    render(
      <VendorPopover
        open
        displayName="Demo Merchant"
        inventory={INVENTORY}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByTestId('vendor-popover').textContent).toContain(
      'Demo Merchant'
    );
    expect(screen.getByTestId('vendor-stock-longsword').textContent).toContain(
      'Longsword'
    );
    expect(screen.getByTestId('vendor-stock-longsword').textContent).toContain(
      '1 left'
    );
    expect(screen.getByTestId('vendor-stock-arrows').textContent).toContain(
      'Arrows'
    );
    expect(screen.getByTestId('vendor-stock-arrows').textContent).toContain(
      'Always in stock'
    );
  });

  it('shows an empty-stock message when the vendor has nothing for sale', () => {
    render(
      <VendorPopover
        open
        displayName="Demo Merchant"
        inventory={[]}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('Nothing for sale.')).toBeTruthy();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <VendorPopover
        open
        displayName="Demo Merchant"
        inventory={INVENTORY}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close vendor' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
