import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { DiceTrayEncounterPreview } from './DiceTrayEncounterPreview';

beforeEach(() => localStorage.clear());

describe('DiceTrayEncounterPreview', () => {
  it('composes a neutral map, left dice drawer, and current dock with default-open right log', () => {
    render(<DiceTrayEncounterPreview tray={<div>Tray stub</div>} />);

    const preview = screen.getByTestId('dice-tray-encounter-preview');
    const map = screen.getByTestId('dice-tray-neutral-map');
    const drawer = screen.getByTestId('dice-tray-left-drawer');
    const dock = screen.getByTestId('encounter-dock');
    const floatingLog = screen.getByTestId('floating-log');

    expect(preview.contains(map)).toBe(true);
    expect(map.contains(drawer)).toBe(true);
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

  it('stays fixture-only instead of importing production encounter/presentation surfaces', () => {
    const source = readFileSync(
      'src/concepts/attack-die-3d/DiceTrayEncounterPreview.tsx',
      'utf8'
    );

    expect(source).not.toMatch(/EncounterView|CombatPresentation/);
  });
});
