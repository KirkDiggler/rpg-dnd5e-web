// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { quickOverflow, type QuickOverflowInput } from './quickOverflow';
const widths: Omit<QuickOverflowInput, 'available'> = {
  fixed: [30, 100, 100, 70], // Quick label, weapon, Move, Cancel
  cantrips: [120, 120],
  features: [160],
  menuWidths: { cantrips: 80, features: 80 },
  gap: 5,
};
describe('quick action overflow', () => {
  it.each([
    [730, []],
    [729, ['cantrips']],
    [565, ['cantrips']],
    [564, ['cantrips', 'features']],
    [100, ['cantrips', 'features']],
  ])(
    'fits measured controls in %s pixels without shrinking or dropping them',
    (available, expected) => {
      expect(quickOverflow({ ...widths, available })).toEqual(expected);
    }
  );
  it('expands again when space returns, without hysteresis from a collapsed measurement', () => {
    expect(quickOverflow({ ...widths, available: 500 })).toEqual([
      'cantrips',
      'features',
    ]);
    expect(quickOverflow({ ...widths, available: 900 })).toEqual([]);
  });
  it('does not replace a short singleton with a larger menu', () => {
    expect(
      quickOverflow({
        available: 170,
        fixed: [50],
        cantrips: [20],
        features: [150],
        menuWidths: { cantrips: 80, features: 80 },
        gap: 5,
      })
    ).toEqual(['features']);
  });
  it('does not invent empty group menus', () => {
    expect(
      quickOverflow({ ...widths, available: 200, cantrips: [], features: [] })
    ).toEqual([]);
  });
});
