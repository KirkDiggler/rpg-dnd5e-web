import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { DiceTrayEncounterPreview } from './DiceTrayEncounterPreview';

beforeEach(() => localStorage.clear());

describe('DiceTrayEncounterPreview', () => {
  it('composes a neutral map, left dice drawer, and current dock with default-open right log', () => {
    render(<DiceTrayEncounterPreview tray={<div>Tray stub</div>} />);

    const preview = screen.getByTestId('dice-tray-encounter-preview');
    const boundary = screen.getByTestId('dice-tray-map-boundary');
    const map = screen.getByTestId('dice-tray-neutral-map');
    const drawer = screen.getByTestId('dice-tray-left-drawer');
    const dock = screen.getByTestId('encounter-dock');
    const floatingLog = screen.getByTestId('floating-log');

    expect(preview.contains(boundary)).toBe(true);
    expect(boundary.contains(map)).toBe(true);
    expect(boundary.contains(drawer)).toBe(true);
    expect(map.contains(drawer)).toBe(false);
    expect(map.parentElement).toBe(drawer.parentElement);
    expect(drawer.contains(screen.getByText('Tray stub'))).toBe(true);
    expect(screen.getByLabelText(/Hide combat log/)).toBeTruthy();
    expect(floatingLog).toBeTruthy();
    expect(
      drawer.compareDocumentPosition(dock) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByText('Always visible · dice only')).toBeTruthy();
    expect(drawer.textContent).not.toMatch(
      /\b(?:HIT|MISS|CRIT)\b|damage total|(?:\d+\s*[+-]\s*\d+\s*=\s*\d+)/i
    );
  });

  it('builds an accessible open drawer from a floor and angled wall planes', () => {
    render(<DiceTrayEncounterPreview tray={<div>Tray stub</div>} />);

    const drawer = screen.getByRole('complementary', {
      name: 'Always visible dice drawer',
    });
    const carcass = screen.getByTestId('dice-tray-drawer-carcass');
    const floor = screen.getByTestId('dice-tray-drawer-floor');
    const backWall = screen.getByTestId('dice-tray-drawer-back-wall');
    const leftWall = screen.getByTestId('dice-tray-drawer-left-wall');
    const rightWall = screen.getByTestId('dice-tray-drawer-right-wall');
    const front = screen.getByTestId('dice-tray-drawer-front');
    const handle = screen.getByTestId('dice-tray-drawer-handle');

    expect(drawer.contains(carcass)).toBe(true);
    expect(carcass.contains(floor)).toBe(true);
    expect(floor.contains(screen.getByText('Tray stub'))).toBe(true);
    expect(floor.getAttribute('aria-hidden')).toBeNull();
    expect(carcass.contains(backWall)).toBe(true);
    expect(carcass.contains(leftWall)).toBe(true);
    expect(carcass.contains(rightWall)).toBe(true);
    expect(carcass.contains(front)).toBe(true);
    expect(front.contains(handle)).toBe(true);
    expect(backWall.getAttribute('aria-hidden')).toBe('true');
    expect(leftWall.getAttribute('aria-hidden')).toBe('true');
    expect(rightWall.getAttribute('aria-hidden')).toBe('true');
    expect(front.getAttribute('aria-hidden')).toBe('true');
    expect(handle.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByTestId('dice-tray-drawer-rail')).toBeNull();
  });

  it('stays fixture-only instead of importing production encounter/presentation surfaces', () => {
    const source = readFileSync(
      'src/concepts/attack-die-3d/DiceTrayEncounterPreview.tsx',
      'utf8'
    );

    expect(source).not.toMatch(/EncounterView|CombatPresentation/);
  });
});
