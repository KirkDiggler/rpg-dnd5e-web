import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
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
    expect(screen.getByText('Choose 1–2 targets')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('no RPC');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel action' }));
    expect(screen.queryByText('Choose 1–2 targets')).not.toBeInTheDocument();
  });
  it('routes Command through shared cast options and then targeting', () => {
    render(<DesktopHotbarConcept />);
    fireEvent.click(screen.getByRole('button', { name: 'Command' }));
    expect(screen.getByTestId('cast-options')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('cast-option-grovel'));
    expect(screen.queryByTestId('cast-options')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'grovel option selected'
    );
    expect(screen.getByRole('button', { name: 'Command' })).toHaveAttribute(
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
