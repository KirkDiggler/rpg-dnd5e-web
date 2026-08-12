import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AttackDie3DConcept } from './AttackDie3DConcept';
vi.mock('../../components/ui/dice/AttackDie3D', () => ({
  AttackDie3D: ({ fallback }: { fallback: React.ReactNode }) => (
    <div data-testid="attack-die">{fallback}</div>
  ),
}));
describe('AttackDie3D concept shell', () => {
  it('offers keyboard-operable four-stage tabs and fixture', () => {
    render(<AttackDie3DConcept />);
    for (const name of ['Appearance', 'Calibrate', 'Roll', 'Verify'])
      expect(screen.getByRole('tab', { name })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Appearance' }), {
      key: 'ArrowRight',
    });
    const calibrate = screen.getByRole('tab', { name: 'Calibrate' });
    expect(calibrate.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(calibrate);
    expect(screen.getByTestId('attack-die')).toBeTruthy();
    expect(screen.getByTestId('dice-tray')).toBeTruthy();
  });
});
