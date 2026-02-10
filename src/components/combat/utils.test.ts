import { describe, expect, it } from 'vitest';
import type { CombatPanelPosition } from './utils';
import { getPanelPositionClasses } from './utils';

describe('getPanelPositionClasses', () => {
  const positions: CombatPanelPosition[] = [
    'bottom-center',
    'top-left',
    'top-right',
    'bottom-left',
    'bottom-right',
    'center',
  ];

  it.each(positions)('returns non-empty classes for %s', (pos) => {
    const classes = getPanelPositionClasses(pos);
    expect(classes.length).toBeGreaterThan(0);
    expect(classes).toContain('fixed');
  });

  it('returns default for unknown position', () => {
    const classes = getPanelPositionClasses('unknown' as CombatPanelPosition);
    expect(classes).toContain('fixed');
    expect(classes).toContain('bottom-4');
  });
});
