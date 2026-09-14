import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../session-combat/SessionCombatMap', () => ({
  SessionCombatMap: () => <div data-testid="fixture-map" />,
}));

import { OrganizedHudConcept } from './OrganizedHudConcept';

describe('OrganizedHudConcept', () => {
  it('requests fullscreen only on tap, reports refusal, and restores the page title', async () => {
    const previous = Object.getOwnPropertyDescriptor(
      document.documentElement,
      'requestFullscreen'
    );
    const title = document.title;
    const request = vi.fn().mockRejectedValue(new Error('Denied'));
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: request,
    });
    try {
      const view = render(<OrganizedHudConcept />);
      expect(document.title).toBe('RPG — HUD Preview');
      expect(request).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
      expect(request).toHaveBeenCalledOnce();
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Full screen could not start'
      );
      view.unmount();
      expect(document.title).toBe(title);
    } finally {
      if (previous)
        Object.defineProperty(
          document.documentElement,
          'requestFullscreen',
          previous
        );
      else
        Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
    }
  });
  it('keeps a crowded initiative available through the bounded tracker', () => {
    render(<OrganizedHudConcept />);
    fireEvent.click(screen.getByRole('button', { name: 'Crowded initiative' }));
    const order = screen.getByRole('group', { name: 'Initiative order' });
    expect(order.querySelectorAll('[data-active]')).toHaveLength(12);
    fireEvent.click(screen.getByRole('button', { name: 'Next in initiative' }));
    expect(order.scrollLeft).toBeGreaterThan(0);
    fireEvent.click(
      screen.getByRole('button', { name: 'Previous in initiative' })
    );
    expect(order.scrollLeft).toBe(0);
  });
  it('keeps one equipment entry and puts exploration behind its own toggle', () => {
    render(<OrganizedHudConcept />);
    expect(screen.getAllByRole('button', { name: /Equipment/i })).toHaveLength(
      1
    );
    const explore = screen.getByText('Explore', { selector: 'summary' });
    expect(explore.closest('details')).not.toHaveAttribute('open');
    const collections = screen.getByRole('group', {
      name: 'Action collections',
    });
    expect(collections).toContainElement(explore);
    expect(collections).toContainElement(
      screen.getByRole('button', { name: /Equipment/i })
    );
    expect(screen.getByRole('group', { name: 'Your status' })).toContainElement(
      screen.getByRole('button', { name: /End turn/i })
    );
  });
  it('offers caster shortcuts and a martial profile with one direct feature', () => {
    render(<OrganizedHudConcept />);
    expect(
      within(screen.getByRole('group', { name: 'Quick actions' })).getByRole(
        'button',
        { name: /vicious mockery/i }
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Martial' }));
    expect(
      screen.getByRole('button', { name: /^Second Wind\./i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Abilities /i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Spells /i })
    ).not.toBeInTheDocument();
  });

  it('keeps a cantrip directly accessible in the smaller phone shortcut set', () => {
    render(<OrganizedHudConcept />);
    fireEvent.click(screen.getByRole('button', { name: 'Landscape phone' }));
    const quick = within(screen.getByRole('group', { name: 'Quick actions' }));
    expect(
      quick.getByRole('button', { name: /vicious mockery/i })
    ).toBeInTheDocument();
    expect(
      quick.queryByRole('button', { name: /longsword/i })
    ).not.toBeInTheDocument();
  });
  it('exercises target selection and visible cancellation without an RPC', () => {
    render(<OrganizedHudConcept />);
    fireEvent.click(screen.getByRole('button', { name: /spells \d/i }));
    fireEvent.click(screen.getByRole('button', { name: /bane/i }));
    expect(screen.getByText('Choose 1–2 targets')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel action' }));
    expect(screen.queryByText('Choose 1–2 targets')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('selection cancelled');
  });

  it('cancels the fixture selection with Escape', () => {
    render(<OrganizedHudConcept />);
    fireEvent.click(screen.getByRole('button', { name: /move\. /i }));
    expect(
      screen.getByRole('button', { name: 'Cancel action' })
    ).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(
      screen.queryByRole('button', { name: 'Cancel action' })
    ).not.toBeInTheDocument();
  });

  it('uses the shared cast option group and its existing cancel callback', () => {
    render(<OrganizedHudConcept />);
    fireEvent.click(screen.getByRole('button', { name: /spells \d/i }));
    fireEvent.click(screen.getByRole('button', { name: /command/i }));
    expect(screen.getByTestId('cast-options')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('cast-option-cancel'));
    expect(screen.queryByTestId('cast-options')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('selection cancelled');
  });
});
