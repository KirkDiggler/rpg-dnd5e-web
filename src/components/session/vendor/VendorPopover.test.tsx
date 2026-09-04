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

  describe('Buy flow', () => {
    it('shows a Buy button for every row', () => {
      render(
        <VendorPopover
          open
          displayName="Demo Merchant"
          inventory={INVENTORY}
          onClose={vi.fn()}
          onBuy={vi.fn()}
        />
      );
      expect(
        screen.getByRole('button', { name: 'Buy Longsword' })
      ).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Buy Longbow' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Buy Arrows' })).toBeTruthy();
    });

    it('clicking Buy shows an inline confirm instead of calling onBuy immediately', () => {
      const onBuy = vi.fn();
      render(
        <VendorPopover
          open
          displayName="Demo Merchant"
          inventory={INVENTORY}
          onClose={vi.fn()}
          onBuy={onBuy}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Buy Longsword' }));
      expect(onBuy).not.toHaveBeenCalled();
      expect(
        screen.getByTestId('vendor-buy-confirm-longsword').textContent
      ).toContain('Buy Longsword?');
    });

    it('Confirm calls onBuy with the exact row entry and clears the pending state', () => {
      const onBuy = vi.fn();
      render(
        <VendorPopover
          open
          displayName="Demo Merchant"
          inventory={INVENTORY}
          onClose={vi.fn()}
          onBuy={onBuy}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Buy Longsword' }));
      fireEvent.click(
        screen.getByRole('button', { name: 'Confirm buy Longsword' })
      );
      expect(onBuy).toHaveBeenCalledOnce();
      expect(onBuy).toHaveBeenCalledWith(INVENTORY[0]);
      expect(screen.queryByTestId('vendor-buy-confirm-longsword')).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Buy Longsword' })
      ).toBeTruthy();
    });

    it('Cancel dismisses the confirm without calling onBuy', () => {
      const onBuy = vi.fn();
      render(
        <VendorPopover
          open
          displayName="Demo Merchant"
          inventory={INVENTORY}
          onClose={vi.fn()}
          onBuy={onBuy}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Buy Longsword' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel buy' }));
      expect(onBuy).not.toHaveBeenCalled();
      expect(screen.queryByTestId('vendor-buy-confirm-longsword')).toBeNull();
    });

    it('only one row is pending confirm at a time', () => {
      render(
        <VendorPopover
          open
          displayName="Demo Merchant"
          inventory={INVENTORY}
          onClose={vi.fn()}
          onBuy={vi.fn()}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Buy Longsword' }));
      fireEvent.click(screen.getByRole('button', { name: 'Buy Longbow' }));
      expect(screen.queryByTestId('vendor-buy-confirm-longsword')).toBeNull();
      expect(
        screen.getByTestId('vendor-buy-confirm-longbow').textContent
      ).toContain('Buy Longbow?');
    });

    it('disables Buy for a LIMITED row that has hit zero', () => {
      const exhausted: VendorStockEntry[] = [
        {
          equipmentType: 'weapon',
          equipmentId: 'longsword',
          displayName: 'Longsword',
          stockMode: VendorStockMode.LIMITED,
          quantity: 0,
        } as unknown as VendorStockEntry,
      ];
      render(
        <VendorPopover
          open
          displayName="Demo Merchant"
          inventory={exhausted}
          onClose={vi.fn()}
          onBuy={vi.fn()}
        />
      );
      expect(
        (
          screen.getByRole('button', {
            name: 'Buy Longsword',
          }) as HTMLButtonElement
        ).disabled
      ).toBe(true);
    });

    it('disables Buy/Confirm/Cancel while busy', () => {
      render(
        <VendorPopover
          open
          displayName="Demo Merchant"
          inventory={INVENTORY}
          onClose={vi.fn()}
          onBuy={vi.fn()}
          busy
        />
      );
      expect(
        (
          screen.getByRole('button', {
            name: 'Buy Longsword',
          }) as HTMLButtonElement
        ).disabled
      ).toBe(true);
    });
  });
});
