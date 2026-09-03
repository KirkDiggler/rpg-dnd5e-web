import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALL_DIAL_SPECS, defaultDialValues } from './dials';
import { resetAll } from './dialStore';
import { FeelDialsDrawer } from './FeelDialsDrawer';
import { FEEL_LAB_LAYER_Z } from './layer';

vi.mock('@/discord', () => ({
  DiscordDebugPanel: () => <div data-testid="stub-discord-debug-panel" />,
}));

afterEach(() => {
  resetAll();
  localStorage.clear();
});

describe('FeelDialsDrawer', () => {
  it('lists every registered dial', () => {
    render(<FeelDialsDrawer open onClose={() => {}} />);
    for (const spec of ALL_DIAL_SPECS) {
      expect(screen.getByTestId(`dial-${spec.key}`)).toBeTruthy();
    }
  });

  it('renders the Debug section second, after the Feel dials controls', () => {
    render(<FeelDialsDrawer open onClose={() => {}} />);
    const drawer = screen.getByTestId('feel-dials-drawer');
    const dialRow = screen.getByTestId(`dial-${ALL_DIAL_SPECS[0]!.key}`);
    const debugPanel = screen.getByTestId('stub-discord-debug-panel');
    const position = dialRow.compareDocumentPosition(debugPanel);
    expect(Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(drawer.contains(dialRow)).toBe(true);
    expect(drawer.contains(debugPanel)).toBe(true);
  });

  it('never resizes the stage — it is fixed/off-flow regardless of open state', () => {
    const { rerender } = render(
      <FeelDialsDrawer open={false} onClose={() => {}} />
    );
    expect(screen.getByTestId('feel-dials-drawer').className).toContain(
      'fixed'
    );
    rerender(<FeelDialsDrawer open onClose={() => {}} />);
    expect(screen.getByTestId('feel-dials-drawer').className).toContain(
      'fixed'
    );
  });

  it('uses the shared FEEL_LAB_LAYER_Z, not a private number — jsdom cannot check real paint order, so this pins identity with the constant instead', () => {
    // SessionEncounterView portals its whole view into document.body at
    // zIndex: 100 and its "run ended" overlay reaches zIndex: 1000; a
    // drawer z-index at or below either would render invisibly behind a
    // live session (found live, not by this suite — see FeelDialsDrawer's
    // own doc comment). The App.tsx wrench row lost the same fight once
    // already (#906 round 4) — pinning identity with the shared constant,
    // not just "some number above 1000", is what keeps both in sync.
    render(<FeelDialsDrawer open onClose={() => {}} />);
    const el = screen.getByTestId('feel-dials-drawer');
    expect(el.style.zIndex).toBe(String(FEEL_LAB_LAYER_Z));
    expect(FEEL_LAB_LAYER_Z).toBeGreaterThan(1000);
  });

  it('the close button calls onClose', () => {
    const onClose = vi.fn();
    render(<FeelDialsDrawer open onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close feel dials drawer'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a number dial slider change updates the store and is reflected back', () => {
    render(<FeelDialsDrawer open onClose={() => {}} />);
    const slider = screen.getByLabelText('Rotate speed') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '150' } });
    expect(screen.getByLabelText('Rotate speed value')).toHaveProperty(
      'value',
      '150'
    );
  });

  it('an enum dial button click updates the store', () => {
    render(<FeelDialsDrawer open onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'me' }));
    expect(
      screen.getByRole('button', { name: 'me' }).getAttribute('aria-pressed')
    ).toBe('true');
  });

  it('resetting a single dial restores just that dial to its default', () => {
    render(<FeelDialsDrawer open onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'me' }));
    fireEvent.click(screen.getByLabelText('Reset Orbit pivot'));
    expect(
      screen.getByRole('button', { name: 'auto' }).getAttribute('aria-pressed')
    ).toBe('true');
  });

  it('Copy as URL shows a URL containing only the non-default dials', () => {
    render(<FeelDialsDrawer open onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'me' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy as URL' }));
    const shown = screen.getByTestId('feel-dials-copied-url').textContent!;
    expect(shown).toContain('orbitPivot=me');
    for (const spec of ALL_DIAL_SPECS) {
      if (spec.key === 'orbitPivot') continue;
      expect(shown).not.toContain(`${spec.key}=`);
    }
  });

  it('shows nothing in Copy as URL beyond the base URL when every dial is default', () => {
    render(<FeelDialsDrawer open onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy as URL' }));
    const shown = screen.getByTestId('feel-dials-copied-url').textContent!;
    expect(shown).not.toContain('?');
  });

  it('Reset all restores every dial to its registered default', () => {
    render(<FeelDialsDrawer open onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'me' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset all' }));
    expect(
      screen.getByRole('button', { name: 'auto' }).getAttribute('aria-pressed')
    ).toBe('true');
    expect(defaultDialValues().orbitPivot).toBe('auto');
  });
});
