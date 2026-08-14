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

  it('builds an accessible drawer carcass around visible decorative hardware', () => {
    render(<DiceTrayEncounterPreview tray={<div>Tray stub</div>} />);

    const drawer = screen.getByRole('complementary', {
      name: 'Always visible dice drawer',
    });
    const carcass = screen.getByTestId('dice-tray-drawer-carcass');
    const front = screen.getByTestId('dice-tray-drawer-front');
    const handle = screen.getByTestId('dice-tray-drawer-handle');
    const rail = screen.getByTestId('dice-tray-drawer-rail');

    expect(drawer.contains(carcass)).toBe(true);
    expect(drawer.contains(rail)).toBe(true);
    expect(carcass.contains(screen.getByText('Tray stub'))).toBe(true);
    expect(carcass.contains(front)).toBe(true);
    expect(front.contains(handle)).toBe(true);
    expect(front.getAttribute('aria-hidden')).toBe('true');
    expect(handle.getAttribute('aria-hidden')).toBe('true');
    expect(rail.getAttribute('aria-hidden')).toBe('true');
  });

  it('stays fixture-only instead of importing production encounter/presentation surfaces', () => {
    const source = readFileSync(
      'src/concepts/attack-die-3d/DiceTrayEncounterPreview.tsx',
      'utf8'
    );

    expect(source).not.toMatch(/EncounterView|CombatPresentation/);
  });
});
