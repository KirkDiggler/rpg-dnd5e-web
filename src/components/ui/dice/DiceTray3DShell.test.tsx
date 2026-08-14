import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DiceTray3DShell } from './DiceTray3DShell';

describe('DiceTray3DShell', () => {
  it('renders an accessible empty tray checkpoint', () => {
    render(<DiceTray3DShell label="Player attack tray" phase="empty" />);

    expect(
      screen.getByRole('region', { name: 'Player attack tray' })
    ).toBeTruthy();
    expect(screen.getByText('Your d20 will appear here')).toBeTruthy();
  });

  it('places children on the motion surface without removing the distinct well', () => {
    render(
      <DiceTray3DShell label="Player attack tray" phase="armed">
        <span>Future die</span>
      </DiceTray3DShell>
    );

    const motionSurface = screen.getByTestId('dice-tray-3d-motion-surface');
    const well = screen.getByTestId('dice-tray-3d-well');
    expect(screen.queryByText('Your d20 will appear here')).toBeNull();
    expect(motionSurface.contains(screen.getByText('Future die'))).toBe(true);
    expect(well).not.toBe(motionSurface);
    expect(well.contains(screen.getByText('Future die'))).toBe(false);
  });
});
