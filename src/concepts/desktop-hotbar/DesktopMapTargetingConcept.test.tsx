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
const capturedMap = vi.hoisted(() => ({
  click: undefined as ((id: string) => void) | undefined,
}));
vi.mock('../session-combat/SessionCombatMap', () => ({
  SessionCombatMap: ({
    attackableTargets,
    selectedTargets,
    onTargetClick,
  }: {
    attackableTargets?: readonly string[];
    selectedTargets?: readonly string[];
    onTargetClick?: (id: string) => void;
  }) => {
    capturedMap.click = onTargetClick;
    return (
      <div data-testid="fixture-map" data-selected={selectedTargets?.join(',')}>
        {attackableTargets?.map((id) => (
          <button type="button" key={id} onClick={() => onTargetClick?.(id)}>
            Map {id}
          </button>
        ))}
      </div>
    );
  },
}));
beforeEach(() =>
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element): void {
        if (
          target.getAttribute('data-testid') !== 'organized-hud-frame' &&
          !target.hasAttribute('data-section-grid')
        )
          return;
        const width =
          target.getAttribute('data-testid') === 'organized-hud-frame'
            ? 1600
            : 396;
        this.callback(
          [{ contentRect: { width, height: 900 } } as ResizeObserverEntry],
          this as unknown as ResizeObserver
        );
      }
      disconnect(): void {}
    }
  )
);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('desktop map-first concept integration', () => {
  it.each([
    ['Bane', 'skeleton-guard', 'skeleton-archer'],
    ['Bless', 'aldric', 'mira'],
  ])(
    '%s toggles supplied targets without casting, preserves picks on icon re-click, and confirms explicitly',
    (spell, first, second) => {
      render(<DesktopHotbarConcept />);
      const map = screen.getByTestId('fixture-map');
      fireEvent.click(screen.getByRole('button', { name: spell }));
      expect(screen.getByTestId('fixture-map')).toBe(map);
      expect(
        screen.queryByRole('region', { name: `${spell} targets` })
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: `Cast ${spell}` })
      ).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: `Map ${first}` }));
      fireEvent.click(screen.getByRole('button', { name: `Map ${second}` }));
      expect(map).toHaveAttribute('data-selected', `${first},${second}`);
      expect(screen.getByText('2/2 selected')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Selection only');
      fireEvent.click(screen.getByRole('button', { name: spell }));
      expect(map).toHaveAttribute('data-selected', `${first},${second}`);
      expect(screen.getByRole('status')).toHaveTextContent('Selection only');
      fireEvent.click(screen.getByRole('button', { name: `Cast ${spell}` }));
      expect(
        screen.queryByTestId('map-first-targeting')
      ).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(`cast ${spell}`);
      expect(screen.getByRole('status')).toHaveTextContent('requested; no RPC');
      expect(screen.getByTestId('fixture-map')).toBe(map);
    }
  );
  it('keeps the optional checklist, map and removal chips synchronized for allies/self', () => {
    render(<DesktopHotbarConcept />);
    fireEvent.click(screen.getByRole('button', { name: 'Bless' }));
    fireEvent.click(screen.getByRole('button', { name: 'Map aldric' }));
    fireEvent.click(screen.getByRole('button', { name: 'Targets (2)' }));
    expect(screen.getByRole('checkbox', { name: /Aldric/ })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mira' }));
    expect(screen.getByTestId('fixture-map')).toHaveAttribute(
      'data-selected',
      'aldric,mira'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove Mira' }));
    expect(screen.getByRole('checkbox', { name: 'Mira' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Map aldric' }));
    expect(screen.getByText('0/2 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cast Bless' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Selection only');
  });
  it('ignores an old canvas callback after cancellation or switching to an incompatible action', () => {
    render(<DesktopHotbarConcept />);
    fireEvent.click(screen.getByRole('button', { name: 'Bane' }));
    const oldClick = capturedMap.click!;
    fireEvent.click(screen.getByRole('button', { name: 'Cancel action' }));
    const cancelled = screen.getByRole('status').textContent;
    act(() => oldClick('skeleton-guard'));
    expect(screen.getByRole('status').textContent).toBe(cancelled);
    expect(screen.queryByTestId('map-first-targeting')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bless' }));
    const before = screen.getByRole('status').textContent;
    act(() => oldClick('skeleton-guard'));
    expect(screen.getByRole('status').textContent).toBe(before);
    expect(screen.getByText('0/2 selected')).toBeInTheDocument();
  });

  it('records a single-target intent without adding a second confirmation step', () => {
    render(<DesktopHotbarConcept />);
    fireEvent.click(screen.getByRole('button', { name: 'Mace' }));
    expect(
      screen.queryByRole('button', { name: 'Confirm Mace' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Map skeleton-guard' }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Mace → Skeleton Guard requested'
    );
    expect(screen.queryByTestId('map-first-targeting')).not.toBeInTheDocument();
  });
});
