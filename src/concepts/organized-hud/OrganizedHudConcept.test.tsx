import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../session-combat/SessionCombatMap', () => ({
  SessionCombatMap: () => <div data-testid="fixture-map" />,
}));

import { OrganizedHudConcept } from './OrganizedHudConcept';

describe('OrganizedHudConcept', () => {
  it('exercises target selection and visible cancellation without an RPC', () => {
    render(<OrganizedHudConcept />);
    fireEvent.click(screen.getByRole('button', { name: /spells 5/i }));
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
    fireEvent.click(screen.getByRole('button', { name: /spells 5/i }));
    fireEvent.click(screen.getByRole('button', { name: /command/i }));
    expect(screen.getByTestId('cast-options')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('cast-option-cancel'));
    expect(screen.queryByTestId('cast-options')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('selection cancelled');
  });
});
