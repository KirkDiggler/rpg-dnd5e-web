import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TargetSurface } from './TargetSurface';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('measures the whole navigation/location/supplement stack so history can clear wrapped controls', () => {
  let measure: () => void = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        measure = callback;
      }
      observe() {}
      disconnect = disconnect;
    }
  );
  const changed = vi.fn();
  const view = render(
    <TargetSurface
      phase="fresh"
      selection={null}
      isViewerTurn={false}
      showTurnNotice={false}
      memberNames={new Map()}
      location={{ name: 'The castle', area: 'Outside' }}
      renderMap={() => null}
      onTargetClick={vi.fn()}
      navigationControls={
        <>
          <button>Back</button>
          <button>Short rest</button>
          <label>
            <input type="checkbox" />
            Share discoveries
          </label>
          <button>Sneak</button>
        </>
      }
      navigationSupplement={
        <div aria-label="sides">garrison · 3 / party · 1</div>
      }
      onHeaderBottomChange={changed}
    />
  );
  const header = screen.getByTestId('session-location-header');
  expect(header).toContainElement(screen.getByLabelText('sides'));
  expect(
    within(
      screen.getByRole('navigation', { name: 'Session navigation' })
    ).getByRole('button', { name: 'Sneak' })
  ).toBeVisible();
  let height = 90;
  Object.defineProperties(header, {
    offsetTop: { value: 12, configurable: true },
    offsetHeight: { get: () => height, configurable: true },
  });
  act(() => measure());
  expect(changed).toHaveBeenLastCalledWith(102);
  height = 180;
  act(() => measure());
  expect(changed).toHaveBeenLastCalledWith(192);
  view.unmount();
  expect(disconnect).toHaveBeenCalled();
});
