import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EncounterDockProps } from './EncounterDock';
import { EncounterDock } from './EncounterDock';

function baseProps(): EncounterDockProps {
  return {
    entityId: 'char-dockaudit',
    displayName: 'DockAudit',
    classRefId: undefined,
    hp: { current: 12, max: 12 },
    ac: 12,
    statuses: [],
    economy: null,
    actions: [],
    actionsEnabled: false,
    actionsLoading: false,
    onSelectAction: vi.fn(),
    armedActionKey: undefined,
    reactionReadiness: undefined,
    reactionLoading: false,
    reactionDisabled: false,
    onToggleReaction: vi.fn(),
    onEndTurn: vi.fn(),
    endTurnDisabled: true,
    endTurnLoading: false,
    combatLogEntries: [],
  };
}

// rpg-dnd5e-web#519 — the combat log is a closed-by-default overlay now
// (replacing the old always-reserved third column), and it was live-caught
// during verification that the overlay could render in the DOM with zero
// visible pixels if it lived inside the row it's anchored to (that row
// clips overflow for the 16vh safety net). These tests cover the toggle
// contract; the "does it actually paint" question isn't jsdom-testable and
// was verified live via Chrome DevTools MCP instead (see PR evidence).
describe('EncounterDock combat log overlay (rpg-dnd5e-web#519)', () => {
  it('does not render the log overlay by default', () => {
    render(<EncounterDock {...baseProps()} />);
    expect(screen.queryByTestId('encounter-dock-log-overlay')).toBeNull();
    expect(
      screen
        .getByTestId('encounter-dock-log-toggle')
        .getAttribute('aria-expanded')
    ).toBe('false');
  });

  it('opens the overlay on toggle click and closes it on a second click', () => {
    render(<EncounterDock {...baseProps()} />);
    const toggle = screen.getByTestId('encounter-dock-log-toggle');

    fireEvent.click(toggle);
    expect(screen.getByTestId('encounter-dock-log-overlay')).toBeTruthy();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(toggle);
    expect(screen.queryByTestId('encounter-dock-log-overlay')).toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('reflects entry count and open/closed state in the toggle aria-label', () => {
    render(
      <EncounterDock
        {...baseProps()}
        combatLogEntries={[
          {
            id: 1,
            round: 1,
            kind: 'turnStarted',
            event: {} as never,
          },
        ]}
      />
    );
    const toggle = screen.getByTestId('encounter-dock-log-toggle');
    expect(toggle.getAttribute('aria-label')).toBe(
      'Combat log, 1 entries — show'
    );
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-label')).toBe(
      'Combat log, 1 entries — hide'
    );
  });

  it('places the overlay as a sibling of the scrolling row, not inside it', () => {
    // Regression guard for the overflow-clipping bug caught live during
    // #519 verification: overflowY:'auto' on the row that also contained
    // the overlay clipped it to 0 visible pixels. The overlay must be a
    // sibling of `encounter-dock-row`, both children of the outer
    // `encounter-dock` anchor.
    render(<EncounterDock {...baseProps()} />);
    fireEvent.click(screen.getByTestId('encounter-dock-log-toggle'));
    const row = screen.getByTestId('encounter-dock-row');
    const overlay = screen.getByTestId('encounter-dock-log-overlay');
    expect(row.contains(overlay)).toBe(false);
    expect(overlay.parentElement).toBe(row.parentElement);
  });
});
