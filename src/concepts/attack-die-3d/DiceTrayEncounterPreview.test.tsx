import { render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { DiceTrayEncounterPreview } from './DiceTrayEncounterPreview';

beforeEach(() => localStorage.clear());

const trays = [
  { label: 'Roller' as const, content: <div>Roller tray stub</div> },
  { label: 'Spectator' as const, content: <div>Spectator tray stub</div> },
] as const;

function renderPreview() {
  return render(<DiceTrayEncounterPreview trays={trays} />);
}

function cssRuleBodies(source: string, exactSelector: string) {
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((match) =>
      match[1]
        .split(',')
        .map((selector) => selector.trim())
        .includes(exactSelector)
    )
    .map((match) => match[2]);
}

describe('DiceTrayEncounterPreview', () => {
  it('composes map, paired labelled drawers, generated real log, and dock in order', () => {
    renderPreview();

    const preview = screen.getByTestId('dice-tray-encounter-preview');
    const boundary = screen.getByTestId('dice-tray-map-boundary');
    const map = screen.getByTestId('dice-tray-neutral-map');
    const witnesses = screen.getByTestId('dice-tray-witness-drawers');
    const roller = screen.getByRole('complementary', {
      name: 'Roller dice drawer',
    });
    const spectator = screen.getByRole('complementary', {
      name: 'Spectator dice drawer',
    });
    const floatingLog = screen.getByTestId('floating-log');
    const dock = screen.getByTestId('encounter-dock');

    expect(preview.contains(boundary)).toBe(true);
    expect(boundary.contains(map)).toBe(true);
    expect(boundary.contains(witnesses)).toBe(true);
    expect(witnesses.contains(roller)).toBe(true);
    expect(witnesses.contains(spectator)).toBe(true);
    expect(
      map.compareDocumentPosition(roller) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      roller.compareDocumentPosition(spectator) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      spectator.compareDocumentPosition(floatingLog) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(dock.contains(floatingLog)).toBe(true);
    expect(
      spectator.compareDocumentPosition(dock) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      floatingLog.compareDocumentPosition(
        screen.getByTestId('encounter-dock-shell')
      ) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByLabelText(/Hide combat log/)).toBeTruthy();
    expect(screen.getByText('Roller · dice only')).toBeTruthy();
    expect(screen.getByText('Spectator · dice only')).toBeTruthy();
    expect(screen.getByText('Roller tray stub')).toBeTruthy();
    expect(screen.getByText('Spectator tray stub')).toBeTruthy();
    expect(screen.getByText(/CRIT \(20\+4 vs AC 14\)/)).toBeTruthy();
    expect(screen.getAllByText(/takes 7 .* damage/).length).toBeGreaterThan(0);
  });

  it('maps two exact accessible carcasses with floors and all approved planes', () => {
    renderPreview();

    const drawers = [
      screen.getByRole('complementary', { name: 'Roller dice drawer' }),
      screen.getByRole('complementary', { name: 'Spectator dice drawer' }),
    ];
    const carcasses = screen.getAllByTestId('dice-tray-drawer-carcass');
    const floors = screen.getAllByTestId('dice-tray-drawer-floor');
    const backWalls = screen.getAllByTestId('dice-tray-drawer-back-wall');
    const leftWalls = screen.getAllByTestId('dice-tray-drawer-left-wall');
    const rightWalls = screen.getAllByTestId('dice-tray-drawer-right-wall');
    const fronts = screen.getAllByTestId('dice-tray-drawer-front');
    const handles = screen.getAllByTestId('dice-tray-drawer-handle');

    for (const collection of [
      drawers,
      carcasses,
      floors,
      backWalls,
      leftWalls,
      rightWalls,
      fronts,
      handles,
    ])
      expect(collection).toHaveLength(2);

    drawers.forEach((drawer, index) => {
      expect(drawer.contains(carcasses[index])).toBe(true);
      expect(carcasses[index].contains(floors[index])).toBe(true);
      expect(carcasses[index].contains(backWalls[index])).toBe(true);
      expect(carcasses[index].contains(leftWalls[index])).toBe(true);
      expect(carcasses[index].contains(rightWalls[index])).toBe(true);
      expect(carcasses[index].contains(fronts[index])).toBe(true);
      expect(fronts[index].contains(handles[index])).toBe(true);
      expect(floors[index].getAttribute('aria-hidden')).toBeNull();
      expect(backWalls[index].getAttribute('aria-hidden')).toBe('true');
      expect(leftWalls[index].getAttribute('aria-hidden')).toBe('true');
      expect(rightWalls[index].getAttribute('aria-hidden')).toBe('true');
      expect(fronts[index].getAttribute('aria-hidden')).toBe('true');
      expect(handles[index].getAttribute('aria-hidden')).toBe('true');
    });
    expect(screen.queryByTestId('dice-tray-drawer-rail')).toBeNull();
    expect(
      within(drawers[0]).getByRole('heading', { name: 'Roller' })
    ).toBeTruthy();
    expect(
      within(drawers[1]).getByRole('heading', { name: 'Spectator' })
    ).toBeTruthy();
  });

  it('keeps verdict and damage prose in the real generated log, never either drawer', () => {
    renderPreview();

    for (const drawer of [
      screen.getByRole('complementary', { name: 'Roller dice drawer' }),
      screen.getByRole('complementary', { name: 'Spectator dice drawer' }),
    ])
      expect(drawer.textContent).not.toMatch(
        /\b(?:HIT|MISS|CRIT)\b|damage|total|(?:\d+\s*[+-]\s*\d+\s*=\s*\d+)/i
      );

    const log = screen.getByTestId('combat-log');
    expect(log.textContent).toMatch(/MISS \(8\+4 vs AC 14\)/);
    expect(log.textContent).toMatch(/HIT \(14\+5 vs AC 13\)/);
    expect(log.textContent).toMatch(/CRIT \(20\+4 vs AC 14\)/);
    expect(log.textContent).toMatch(/takes 7 slashing damage/);
  });

  it('stays fixture-only and passes the existing structured log directly to the real dock', () => {
    const source = readFileSync(
      'src/concepts/attack-die-3d/DiceTrayEncounterPreview.tsx',
      'utf8'
    );

    expect(source).not.toMatch(
      /EncounterView|CombatPresentation|projectDicePresentationEvents|DicePresentationEvent/
    );
    expect(source).not.toMatch(
      /useEncounter|productionState|description:|message:/
    );
    expect(source).toMatch(/combatLogEntries=\{CONCEPT_LOG_ENTRIES\}/);
  });

  it('locks exact desktop and stacked geometry without transforming renderer or Canvas', () => {
    const css = readFileSync('public/themes/base.css', 'utf8');
    const visualConfig = readFileSync(
      'src/components/ui/dice/attackDieVisualConfig.ts',
      'utf8'
    );

    expect(css).toMatch(
      /\.dice-tray-3d-concept-panel\s*>\s*header\s*\{[^}]*width:\s*min\(100%,\s*1200px\)/s
    );
    expect(css).toMatch(
      /\.dice-tray-encounter-preview\s*\{[^}]*width:\s*min\(100%,\s*1200px\)[^}]*height:\s*768px[^}]*min-height:\s*0[^}]*aspect-ratio:\s*auto/s
    );
    expect(css).toMatch(
      /\.dice-tray-encounter-preview__witnesses\s*\{[^}]*position:\s*absolute[^}]*bottom:\s*10px[^}]*grid-template-columns:\s*repeat\(2,\s*356px\)[^}]*gap:\s*12px/s
    );
    expect(css).toMatch(
      /\.dice-tray-left-drawer\s*\{[^}]*position:\s*relative[^}]*inset:\s*auto[^}]*width:\s*356px/s
    );
    expect(css).toMatch(/@media\s*\(max-width:\s*1240px\)/);
    expect(css).toMatch(
      /@media\s*\(max-width:\s*1240px\)[\s\S]*?\.dice-tray-encounter-preview__witnesses\s*\{[^}]*position:\s*relative[^}]*grid-template-columns:\s*minmax\(0,\s*356px\)[^}]*padding:\s*12px/s
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*1240px\)[\s\S]*?\.dice-tray-encounter-preview__dock\s*\{[^}]*margin-top:\s*250px/s
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*1240px\)[\s\S]*?\.dice-tray-left-drawer\s*\{[^}]*width:\s*100%[^}]*max-width:\s*356px/s
    );
    expect(css).toMatch(/content:\s*attr\(data-phase\)/);

    const protectedBodies = [
      ...cssRuleBodies(css, '.dice-tray-3d-renderer'),
      ...cssRuleBodies(css, '.attack-die-3d__canvas'),
    ];
    expect(protectedBodies.length).toBeGreaterThan(0);
    for (const body of protectedBodies)
      expect(body).not.toMatch(/(?:transform|scale|translate|filter)\s*:/);
    expect(visualConfig).toMatch(/dieScale:\s*1\.1/);
  });
});
