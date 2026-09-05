import { describe, expect, it } from 'vitest';
import { centeredFloorOffset } from './previewTransform';

describe('centeredFloorOffset', () => {
  it('centers scaled X/Z bounds and grounds the minimum Y before fine adjustment', () => {
    expect(
      centeredFloorOffset(
        { min: [1, -2, -3], max: [5, 4, 7] },
        1.125,
        [0.1, -0.01, -0.2]
      )
    ).toEqual([-3.275, 2.24, -2.45]);
  });
});
