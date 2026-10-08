import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopHotbarConcept } from './DesktopHotbarConcept';

vi.mock('../session-combat/SessionCombatMap', () => ({
  SessionCombatMap: () => <div data-testid="fixture-map" />,
}));

let resize: ((width: number, height: number) => void) | undefined;
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element): void {
        if (target.getAttribute('data-testid') === 'organized-hud-frame') {
          resize = (width, height) =>
            this.callback(
              [{ contentRect: { width, height } } as ResizeObserverEntry],
              this as unknown as ResizeObserver
            );
          resize(1600, 900);
        } else if (target.hasAttribute('data-section-grid')) {
          this.callback(
            [{ contentRect: { width: 396 } } as ResizeObserverEntry],
            this as unknown as ResizeObserver
          );
        }
      }
      unobserve(): void {}
      disconnect(): void {}
    }
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resize = undefined;
});

describe('DesktopHotbarConcept', () => {
  it('opens the real multi-target surface directly and cancels without RPC', () => {
    render(<DesktopHotbarConcept />);
    expect(screen.getByTestId('desktop-action-surface')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bane' }));
    expect(screen.getByText('0/2 selected')).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Bane targets' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('no RPC');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel action' }));
    expect(screen.queryByTestId('map-first-targeting')).not.toBeInTheDocument();
  });
  it('defaults to one row with paging, and exposes all 36 distinct offers at four rows', () => {
    render(<DesktopHotbarConcept />);
    fireEvent.click(
      screen.getByRole('button', { name: '36 icons (layout only)' })
    );
    const surface = screen.getByTestId('desktop-action-surface');
    expect(surface).toHaveAttribute('data-rows', '1');
    expect(
      screen.getByRole('button', { name: 'Next Spells page' })
    ).toBeEnabled();
    expect(surface.querySelectorAll('[data-offer-id]').length).toBeLessThan(36);
    fireEvent.change(screen.getByRole('combobox', { name: 'Hotbar rows' }), {
      target: { value: '4' },
    });
    const offers = Array.from(surface.querySelectorAll('[data-offer-id]'));
    expect(offers).toHaveLength(36);
    expect(
      new Set(offers.map((offer) => offer.getAttribute('data-offer-id'))).size
    ).toBe(36);
    expect(surface).toHaveAttribute('data-rows', '4');
    fireEvent.focus(
      screen.getByRole('button', { name: 'Layout sample 25 — Stealth' })
    );
    expect(screen.getByRole('tooltip')).toHaveTextContent('Layout sample 25');
    expect(screen.getByRole('status')).toHaveTextContent('No intent sent');
    expect(screen.getByRole('button', { name: 'Dodge' })).toHaveAttribute(
      'data-tone',
      'gold'
    );
    expect(
      screen.getByRole('button', { name: 'Dodge' }).querySelector('img')
    ).toHaveAttribute('src', expect.stringContaining('Stealthy_01'));
  });

  it('retains row count and profile-local favorites across scenarios, compact fallback and comparison', () => {
    render(<DesktopHotbarConcept />);
    const firstLeveled = () =>
      screen
        .getByRole('region', { name: 'Spells' })
        .querySelector('[data-band="leveled"] [data-offer-id]');
    fireEvent.change(screen.getByRole('combobox', { name: 'Hotbar rows' }), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit bar' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Favorite Cure Wounds' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Done editing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Action spent' }));
    expect(firstLeveled()).toHaveAttribute('data-offer-id', 'cure-wounds');
    expect(firstLeveled()).toHaveAttribute('data-favorite', 'true');
    act(() => resize!(844, 390));
    expect(
      screen.queryByTestId('desktop-action-surface')
    ).not.toBeInTheDocument();
    act(() => resize!(1280, 720));
    fireEvent.click(screen.getByRole('button', { name: 'Current layout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Icon hotbar' }));
    expect(screen.getByRole('combobox', { name: 'Hotbar rows' })).toHaveValue(
      '3'
    );
    expect(firstLeveled()).toHaveAttribute('data-offer-id', 'cure-wounds');
    fireEvent.click(screen.getByRole('button', { name: 'Martial' }));
    expect(screen.getByRole('combobox', { name: 'Hotbar rows' })).toHaveValue(
      '3'
    );
    expect(
      screen.queryByRole('button', { name: 'Cure Wounds' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cleric' }));
    expect(firstLeveled()).toHaveAttribute('data-offer-id', 'cure-wounds');
  });

  it('offers a real retained debug event and expands its formatted JSON', async () => {
    render(<DesktopHotbarConcept />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand combat log' }));
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }));
    fireEvent.click(
      screen.getByRole('button', { name: /Inspect event Fixture turn ended/ })
    );
    const json = await screen.findByLabelText('Formatted event JSON');
    expect(json).toHaveTextContent('skeleton-archer');
    fireEvent.focus(json);
    expect(
      screen.getByRole('button', { name: 'Narrow debug panel' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('desktop-action-surface')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('No intent sent');
  });

  it('shows who acted temporarily, then keeps the same entry in optional history', () => {
    vi.useFakeTimers();
    try {
      render(<DesktopHotbarConcept />);
      const notices = screen.getByTestId('story-notices');
      expect(notices).toBeEmptyDOMElement();
      expect(
        screen.getByRole('button', { name: 'Expand combat log' })
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Next event' }));
      expect(
        within(notices).getByText('Skeleton Guard attacks Aldric')
      ).toBeInTheDocument();
      expect(notices).toHaveTextContent('Aldric turns the blow aside. Miss.');
      act(() => vi.advanceTimersByTime(6000));
      expect(notices).toBeEmptyDOMElement();
      fireEvent.click(
        screen.getByRole('button', { name: 'Expand combat log' })
      );
      const history = screen.getByTestId('session-combat-log');
      expect(
        within(history).getByText('Skeleton Guard attacks Aldric')
      ).toBeInTheDocument();
      expect(within(history).getByRole('log')).toHaveAttribute(
        'aria-live',
        'off'
      );
      fireEvent.click(screen.getByRole('button', { name: 'Action spent' }));
      expect(notices).toBeEmptyDOMElement();
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });

  it('routes Command through shared cast options and then targeting', () => {
    render(<DesktopHotbarConcept />);
    const status = screen.getByTestId('desktop-status-section');
    const bar = screen.getByTestId('desktop-action-surface');
    fireEvent.click(screen.getByRole('button', { name: 'Command' }));
    expect(screen.getByTestId('cast-options')).toBeInTheDocument();
    expect(screen.getByTestId('desktop-status-section')).toBe(status);
    expect(screen.getByTestId('desktop-action-surface')).toBe(bar);
    expect(screen.getByRole('button', { name: 'Bane' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('cast-option-grovel'));
    expect(screen.queryByTestId('cast-options')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'grovel option selected'
    );
    expect(screen.getByRole('button', { name: 'Command' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(
      screen.getByText('Command · Grovel', { exact: true })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change choice' }));
    expect(
      screen.getByRole('dialog', { name: 'Command choices' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('cast-option-cancel'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('keeps the read-only Status section outside Edit, row and page changes', () => {
    render(<DesktopHotbarConcept />);
    const status = screen.getByTestId('desktop-status-section');
    fireEvent.click(screen.getByRole('button', { name: 'Edit bar' }));
    expect(
      within(status).queryByRole('button', { name: /Favorite|Unfavorite|Edit/ })
    ).not.toBeInTheDocument();
    expect(status.querySelector('[draggable="true"]')).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Hotbar rows' }), {
      target: { value: '4' },
    });
    expect(screen.getByTestId('desktop-status-section')).toBe(status);
    fireEvent.click(screen.getByRole('button', { name: 'Done editing' }));
    fireEvent.click(
      screen.getByRole('button', { name: '36 icons (layout only)' })
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Hotbar rows' }), {
      target: { value: '1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next Spells page' }));
    expect(screen.getByTestId('desktop-status-section')).toBe(status);
    expect(status).toHaveTextContent('22/28');
    expect(status).toHaveTextContent('25 ft');
    act(() => resize!(844, 390));
    expect(
      screen.queryByTestId('desktop-status-section')
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Your status' })).getByText(
        '22/28'
      )
    ).toBeInTheDocument();
  });

  it('mounts only offered command categories and separates them from contextual Effects and Traits', () => {
    render(<DesktopHotbarConcept />);
    expect(
      screen.queryByRole('region', { name: 'Features' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Spells' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Martial' }));
    expect(
      screen.queryByRole('region', { name: 'Spells' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Items' })
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Features' })).getByRole(
        'button',
        { name: 'Second Wind' }
      )
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Actions' })).getByRole(
        'button',
        { name: 'Unarmed Strike' }
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Inspect Sneak Attack' })
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Longsword' }));
    const selectedIntent = screen.getByRole('status').textContent;
    fireEvent.click(
      screen.getByRole('button', { name: 'Inspect Sneak Attack' })
    );
    expect(
      screen.getByRole('region', { name: 'Sneak Attack information' })
    ).toHaveTextContent('For Longsword');
    expect(screen.getByRole('status').textContent).toBe(selectedIntent);
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Raging' }));
    expect(
      screen.getByRole('region', { name: 'Raging information' })
    ).toHaveTextContent('Applies');
    expect(screen.getByRole('status').textContent).toBe(selectedIntent);
    expect(screen.getByRole('button', { name: 'Longsword' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('keeps refused spells inspectable and does not arm them', () => {
    render(<DesktopHotbarConcept />);
    fireEvent.click(screen.getByRole('button', { name: 'Action spent' }));
    const cure = screen.getByRole('button', { name: 'Cure Wounds' });
    fireEvent.focus(cure);
    fireEvent.click(cure);
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'action: 1 needed, 0 left'
    );
    expect(cure).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.getByRole('button', { name: 'Healing Word' })
    ).toHaveAttribute('aria-disabled', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Slots spent' }));
    expect(
      screen.getByRole('button', { name: 'Healing Word' })
    ).toHaveAttribute('aria-disabled', 'true');
  });
  it('retains stale and spectator gates from the shared shell', () => {
    render(<DesktopHotbarConcept />);
    fireEvent.click(screen.getByRole('button', { name: 'Stale authority' }));
    expect(screen.getByRole('button', { name: 'Bane' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Spectator' }));
    expect(
      screen.queryByTestId('desktop-action-surface')
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Your commands return/)).toBeInTheDocument();
  });
  it('compares the original layout on identical fixtures and uses it automatically in compact frames', () => {
    render(<DesktopHotbarConcept />);
    fireEvent.click(screen.getByRole('button', { name: 'Current layout' }));
    expect(
      screen.getByRole('button', { name: /^Spells 5/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('desktop-action-surface')
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Icon hotbar' }));
    expect(screen.getByTestId('desktop-action-surface')).toBeInTheDocument();
    act(() => resize!(844, 390));
    expect(
      screen.queryByTestId('desktop-action-surface')
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Spells 5/ })
    ).toBeInTheDocument();
    act(() => resize!(1280, 720));
    expect(screen.getByTestId('desktop-action-surface')).toBeInTheDocument();
  });
});
