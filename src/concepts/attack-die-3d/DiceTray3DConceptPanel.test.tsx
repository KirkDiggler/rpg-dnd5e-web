import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DiceTray3DConceptPanel } from './DiceTray3DConceptPanel';

describe('DiceTray3DConceptPanel', () => {
  it('renders an honest, empty, non-interactive tray checkpoint', () => {
    render(<DiceTray3DConceptPanel />);

    expect(screen.getByText(/Empty tray checkpoint/)).toBeTruthy();
    expect(screen.getByText(/No interaction yet/)).toBeTruthy();
    expect(
      screen.getByRole('region', { name: 'Player attack tray' })
    ).toBeTruthy();
    expect(screen.getByText('Your d20 will appear here')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByTestId('attack-die')).toBeNull();
  });
});
