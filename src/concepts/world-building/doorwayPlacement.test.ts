import { expect, it } from 'vitest';
import { placeDoorFrame } from './doorwayPlacement';
import { createWall } from './structuralWallEditing';
const ref = 'dnd5e:env:fantasy-kingdom:castle_wall_doorway_single_01';
const wall = createWall({
  id: 'wall',
  start: { x: 0, z: 0 },
  end: { x: 12, z: 0 },
  assetRef: 'dnd5e:env:fantasy-kingdom:castle_wall_fit_01',
  height: 3.75,
  thickness: 0.375,
  elevation: 0,
});
const chart = {
  surfaceId: 'front',
  phase: 0,
  direction: 1 as const,
  repeat: [3.3, 3.3] as const,
  elevation: 0,
};
const width = 0.7687937021255493;
it('keeps free placement exact, but snaps the visual frame start rather than the aperture center when requested', () => {
  const free = placeDoorFrame(wall, 5.4, width, ref, false, chart);
  expect(free.position).toBe(5.4);
  expect(free.snapped).toBe(false);
  const snapped = placeDoorFrame(wall, 5.4, width, ref, true, chart);
  expect(snapped.position).toBeCloseTo(3.3 + 1.875, 4);
  expect(snapped.snapped).toBe(true);
  expect(wall.openings).toEqual([]);
});
it('keeps snapping on a repeat at the ends and honors phase/direction', () => {
  expect(
    placeDoorFrame(wall, 100, width, ref, true, chart).position
  ).toBeCloseTo(6.6 + 1.875, 4);
  const reversed = { ...chart, phase: 0.4, direction: -1 as const };
  expect(
    placeDoorFrame(wall, 5.4, width, ref, true, reversed).position
  ).toBeCloseTo(3.7 + 1.875, 4);
});
it('refuses unsupported snapping instead of silently claiming a free placement was snapped', () => {
  expect(() => placeDoorFrame(wall, 5, width, ref, true)).toThrow(/finish/);
  expect(() =>
    placeDoorFrame(wall, 5, width, ref, true, { ...chart, repeat: [0, 1] })
  ).toThrow(/repeat/);
});
