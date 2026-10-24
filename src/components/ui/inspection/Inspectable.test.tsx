import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Inspectable } from './Inspectable';

// JSDOM has no layout observer; placement and pointer grace are browser-checked.
beforeEach(() =>
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function fixture() {
  render(
    <Inspectable
      label="Test item"
      description="Item detail"
      trigger={<span>Item</span>}
      summary={<p>Short information</p>}
      details={<button>Explicit action</button>}
    />
  );
  return screen.getByRole('button', { name: 'Inspect Test item' });
}

describe('Inspectable', () => {
  it('shows a summary on focus and replaces it with details on activation', async () => {
    const trigger = fixture();
    act(() => trigger.focus());
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Short information'
    );
    fireEvent.click(trigger);
    expect(
      screen.getByRole('dialog', { name: 'Test item' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('restores focus without immediately reopening the tooltip after dismissal', async () => {
    const trigger = fixture();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Close inspection' }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
