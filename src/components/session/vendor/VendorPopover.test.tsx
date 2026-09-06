import type { VendorStockEntry } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { VendorStockMode } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CarriedStack } from '../../game/equipment/equipmentTypes';
import { VendorPopover } from './VendorPopover';

const INVENTORY: VendorStockEntry[] = [
  {
    equipmentType: 'weapon',
    equipmentId: 'longsword',
    displayName: 'Longsword',
    stockMode: VendorStockMode.LIMITED,
    quantity: 1,
    price: { copper: 1500 },
  },
  {
    equipmentType: 'weapon',
    equipmentId: 'longbow',
    displayName: 'Longbow',
    stockMode: VendorStockMode.LIMITED,
    quantity: 1,
    price: { copper: 5000 },
  },
  {
    equipmentType: 'ammunition',
    equipmentId: 'arrows',
    displayName: 'Arrows',
    stockMode: VendorStockMode.UNLIMITED,
    price: { copper: 100 },
  },
] as unknown as VendorStockEntry[];

const CARRIED_ITEMS: CarriedStack[] = [
  {
    item: {
      ref: { module: 'dnd5e', type: 'item', id: 'dagger' },
      name: 'Dagger',
      statLine: '1d4 piercing · finesse',
      iconKey: '',
      kind: 'weapon',
      equipmentType: 'weapon',
      slotKeys: ['main_hand', 'off_hand'],
      quantity: 1,
      price: { copper: 200 },
    },
    carriedCount: 1,
    showCount: false,
  },
  {
    item: {
      ref: { module: 'dnd5e', type: 'item', id: 'chain-shirt' },
      name: 'Chain Shirt',
      statLine: 'AC 13 + Dex',
      iconKey: '',
      kind: 'armor',
      equipmentType: 'armor',
      slotKeys: ['armor'],
      quantity: 1,
      price: { copper: 5000 },
    },
    carriedCount: 1,
    showCount: false,
  },
];

describe('VendorPopover', () => {
  it('renders nothing when closed', () => {
    render(
      <VendorPopover
        open={false}
        displayName="Demo Merchant"
        inventory={INVENTORY}
        onClose={vi.fn()}
        carriedItems={[]}
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
        carriedItems={[]}
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
    expect(screen.getByTestId('vendor-stock-longsword').textContent).toContain(
      '1 pp 5 gp'
    );
    expect(screen.getByTestId('vendor-stock-arrows').textContent).toContain(
      'Arrows'
    );
    expect(screen.getByTestId('vendor-stock-arrows').textContent).toContain(
      'Always in stock'
    );
    expect(screen.getByTestId('vendor-stock-arrows').textContent).toContain(
      '1 gp'
    );
  });

  it('shows the player wallet in the header when provided, and nothing when omitted', () => {
    const { rerender } = render(
      <VendorPopover
        open
        displayName="Demo Merchant"
        inventory={INVENTORY}
        onClose={vi.fn()}
        carriedItems={[]}
      />
    );
    expect(screen.queryByTestId('vendor-wallet')).toBeNull();

    rerender(
      <VendorPopover
        open
        displayName="Demo Merchant"
        inventory={INVENTORY}
        onClose={vi.fn()}
        carriedItems={[]}
        walletCopper={235}
      />
    );
    expect(screen.getByTestId('vendor-wallet').textContent).toContain(
      '2 gp 3 sp 5 cp'
    );
  });

  it('shows an empty-stock message when the vendor has nothing for sale', () => {
    render(
      <VendorPopover
        open
        displayName="Demo Merchant"
        inventory={[]}
        onClose={vi.fn()}
        carriedItems={[]}
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
        carriedItems={[]}
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
          carriedItems={[]}
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
          carriedItems={[]}
          onBuy={onBuy}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Buy Longsword' }));
      expect(onBuy).not.toHaveBeenCalled();
      expect(
        screen.getByTestId('vendor-buy-confirm-longsword').textContent
      ).toContain('Buy Longsword for 1 pp 5 gp?');
    });

    it('Confirm calls onBuy with the exact row entry and clears the pending state', () => {
      const onBuy = vi.fn();
      render(
        <VendorPopover
          open
          displayName="Demo Merchant"
          inventory={INVENTORY}
          onClose={vi.fn()}
          carriedItems={[]}
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
          carriedItems={[]}
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
          carriedItems={[]}
          onBuy={vi.fn()}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Buy Longsword' }));
      fireEvent.click(screen.getByRole('button', { name: 'Buy Longbow' }));
      expect(screen.queryByTestId('vendor-buy-confirm-longsword')).toBeNull();
      expect(
        screen.getByTestId('vendor-buy-confirm-longbow').textContent
      ).toContain('Buy Longbow for 5 pp?');
    });

    it('disables Buy for a LIMITED row that has hit zero', () => {
      const exhausted: VendorStockEntry[] = [
        {
          equipmentType: 'weapon',
          equipmentId: 'longsword',
          displayName: 'Longsword',
          stockMode: VendorStockMode.LIMITED,
          quantity: 0,
          price: { copper: 1500 },
        } as unknown as VendorStockEntry,
      ];
      render(
        <VendorPopover
          open
          displayName="Demo Merchant"
          inventory={exhausted}
          onClose={vi.fn()}
          carriedItems={[]}
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

    it('disables Buy for a row with no server-computed price, even with stock', () => {
      const unpriced: VendorStockEntry[] = [
        {
          equipmentType: 'ammunition',
          equipmentId: 'arrows',
          displayName: 'Arrows',
          stockMode: VendorStockMode.UNLIMITED,
        } as unknown as VendorStockEntry,
      ];
      render(
        <VendorPopover
          open
          displayName="Demo Merchant"
          inventory={unpriced}
          onClose={vi.fn()}
          carriedItems={[]}
          onBuy={vi.fn()}
        />
      );
      expect(
        (
          screen.getByRole('button', {
            name: 'Buy Arrows',
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
          carriedItems={[]}
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

    it('marks a player-sold row without disturbing its normal price/stock label', () => {
      const soldBack: VendorStockEntry[] = [
        {
          equipmentType: 'weapon',
          equipmentId: 'dagger',
          displayName: 'Dagger',
          stockMode: VendorStockMode.LIMITED,
          quantity: 1,
          price: { copper: 200 },
          playerSold: true,
        } as unknown as VendorStockEntry,
      ];
      render(
        <VendorPopover
          open
          displayName="Demo Merchant"
          inventory={soldBack}
          onClose={vi.fn()}
          carriedItems={[]}
        />
      );
      const text = screen.getByTestId('vendor-stock-dagger').textContent;
      expect(text).toContain('2 gp');
      expect(text).toContain('1 left');
      expect(text).toContain('sold back');
    });
  });

  describe('Sell flow', () => {
    it('defaults to the Buy tab', () => {
      render(
        <VendorPopover
          open
          displayName="Demo Merchant"
          inventory={INVENTORY}
          onClose={vi.fn()}
          carriedItems={CARRIED_ITEMS}
        />
      );
      expect(screen.getByTestId('vendor-stock')).toBeTruthy();
      expect(screen.queryByTestId('vendor-sell-stock')).toBeNull();
    });

    it('clicking the Sell tab shows the carried items with their price and count', () => {
      render(
        <VendorPopover
          open
          displayName="Demo Merchant"
          inventory={INVENTORY}
          onClose={vi.fn()}
          carriedItems={CARRIED_ITEMS}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Sell' }));
      expect(screen.queryByTestId('vendor-stock')).toBeNull();
      const daggerRow = screen.getByTestId('vendor-sell-dagger');
      expect(daggerRow.textContent).toContain('Dagger');
      expect(daggerRow.textContent).toContain('2 gp');
      expect(daggerRow.textContent).toContain('×1');
    });

    it('shows a Sell button per carried item and an inline confirm on click', () => {
      const onSell = vi.fn();
      render(
        <VendorPopover
          open
          displayName="Demo Merchant"
          inventory={INVENTORY}
          onClose={vi.fn()}
          carriedItems={CARRIED_ITEMS}
          onSell={onSell}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Sell' }));
      fireEvent.click(screen.getByRole('button', { name: 'Sell Dagger' }));
      expect(onSell).not.toHaveBeenCalled();
      expect(
        screen.getByTestId('vendor-sell-confirm-dagger').textContent
      ).toContain('Sell Dagger for 2 gp?');
    });

    it('Confirm calls onSell with just the item — one unit per click, not the full carried count — and clears the pending state', () => {
      const onSell = vi.fn();
      render(
        <VendorPopover
          open
          displayName="Demo Merchant"
          inventory={INVENTORY}
          onClose={vi.fn()}
          carriedItems={CARRIED_ITEMS}
          onSell={onSell}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Sell' }));
      fireEvent.click(screen.getByRole('button', { name: 'Sell Dagger' }));
      fireEvent.click(
        screen.getByRole('button', { name: 'Confirm sell Dagger' })
      );
      expect(onSell).toHaveBeenCalledOnce();
      expect(onSell).toHaveBeenCalledWith(CARRIED_ITEMS[0].item);
      expect(screen.queryByTestId('vendor-sell-confirm-dagger')).toBeNull();
      expect(screen.getByRole('button', { name: 'Sell Dagger' })).toBeTruthy();
    });

    it('Cancel dismisses the confirm without calling onSell', () => {
      const onSell = vi.fn();
      render(
        <VendorPopover
          open
          displayName="Demo Merchant"
          inventory={INVENTORY}
          onClose={vi.fn()}
          carriedItems={CARRIED_ITEMS}
          onSell={onSell}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Sell' }));
      fireEvent.click(screen.getByRole('button', { name: 'Sell Dagger' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel sell' }));
      expect(onSell).not.toHaveBeenCalled();
      expect(screen.queryByTestId('vendor-sell-confirm-dagger')).toBeNull();
    });

    it('switching tabs mid-confirm clears the pending row on both sides', () => {
      render(
        <VendorPopover
          open
          displayName="Demo Merchant"
          inventory={INVENTORY}
          onClose={vi.fn()}
          carriedItems={CARRIED_ITEMS}
          onBuy={vi.fn()}
          onSell={vi.fn()}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Buy Longsword' }));
      fireEvent.click(screen.getByRole('button', { name: 'Sell' }));
      expect(screen.queryByTestId('vendor-buy-confirm-longsword')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Sell Dagger' }));
      fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
      expect(screen.queryByTestId('vendor-sell-confirm-dagger')).toBeNull();
    });

    it('shows an empty-sell message when nothing is carried', () => {
      render(
        <VendorPopover
          open
          displayName="Demo Merchant"
          inventory={INVENTORY}
          onClose={vi.fn()}
          carriedItems={[]}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Sell' }));
      expect(screen.getByText('Nothing to sell.')).toBeTruthy();
    });

    it('disables Sell for an item with no server-computed price', () => {
      const unpriced: CarriedStack[] = [
        {
          item: {
            ref: { module: 'dnd5e', type: 'item', id: 'torch' },
            name: 'Torch',
            statLine: 'light, 20 ft radius',
            iconKey: '',
            kind: 'gear',
            equipmentType: 'item',
            slotKeys: [],
            quantity: 1,
          },
          carriedCount: 1,
          showCount: false,
        },
      ];
      render(
        <VendorPopover
          open
          displayName="Demo Merchant"
          inventory={INVENTORY}
          onClose={vi.fn()}
          carriedItems={unpriced}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Sell' }));
      expect(
        (
          screen.getByRole('button', {
            name: 'Sell Torch',
          }) as HTMLButtonElement
        ).disabled
      ).toBe(true);
    });

    it('disables Sell/Confirm/Cancel while busy', () => {
      render(
        <VendorPopover
          open
          displayName="Demo Merchant"
          inventory={INVENTORY}
          onClose={vi.fn()}
          carriedItems={CARRIED_ITEMS}
          onSell={vi.fn()}
          busy
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Sell' }));
      expect(
        (
          screen.getByRole('button', {
            name: 'Sell Dagger',
          }) as HTMLButtonElement
        ).disabled
      ).toBe(true);
    });
  });
});
