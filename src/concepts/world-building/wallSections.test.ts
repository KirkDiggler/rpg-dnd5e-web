import { describe, expect, it } from 'vitest';
import {
  createWall,
  resizeWallLength,
  setWallAppearance,
  translateWall,
} from './structuralWallEditing';
import { wallSolidIntervals } from './structuralWallGeometry';
import { validateStructuralWalls } from './structuralWalls';
import {
  assertWallSections,
  copyWallSections,
  wallSectionSolidIntervals,
  type WallSection,
} from './wallSections';

const feature: WallSection = {
  id: 'window',
  assetRef: 'dnd5e:env:fantasy-kingdom:castle_wall_window_03',
  position: 6,
  width: 3.75,
};
function wall() {
  return createWall({
    id: 'one-wall',
    start: { x: 0, z: 0 },
    end: { x: 12, z: 0 },
    assetRef: 'dnd5e:env:fantasy-kingdom:castle_wall_01',
    height: 6,
    thickness: 0.375,
    elevation: 0,
  });
}
function decorated() {
  const w = wall();
  w.appearance.sections = [structuredClone(feature)];
  return w;
}

describe('wall-owned visual sections', () => {
  it('replaces a visual span while leaving one wall and all mechanical geometry untouched', () => {
    const w = decorated(),
      before = structuredClone(w);
    assertWallSections(w);
    expect(wallSectionSolidIntervals(w)).toEqual([
      { start: 0, end: 4.125 },
      { start: 7.875, end: 12 },
    ]);
    expect(
      wallSolidIntervals({ wall: w, extent: { start: 0, end: 12 } })
    ).toEqual([{ start: 0, end: 12 }]);
    expect(w).toEqual(before);
    expect(w.openings).toEqual([]);
    expect(w.blocker).toEqual(wall().blocker);
  });
  it('preserves absence, explicit empty, opaque references and unknown nested author data in detached copies', () => {
    expect(copyWallSections(undefined)).toBeUndefined();
    expect(copyWallSections([])).toEqual([]);
    const input = [
      { ...feature, assetRef: 'future:appearance', future: { values: [1] } },
    ];
    const copied = copyWallSections(input)!;
    expect(copied).toEqual(input);
    (copied[0] as (typeof input)[0]).future.values.push(2);
    expect(input[0].future.values).toEqual([1]);
  });
  it.each([
    null,
    {},
    [{ ...feature, id: '' }],
    [feature, feature],
    [{ ...feature, assetRef: '' }],
    [{ ...feature, position: Infinity }],
    [{ ...feature, width: 0 }],
    [{ ...feature, width: NaN }],
  ])('refuses malformed section data: %j', (value) => {
    expect(() => copyWallSections(value)).toThrow(/section/i);
  });
  it('refuses out-of-wall and overlapping features but allows touching endpoints', () => {
    const w = decorated();
    w.appearance.sections = [{ ...feature, position: 1 }];
    expect(() => assertWallSections(w)).toThrow(/within|fit/);
    w.appearance.sections = [feature, { ...feature, id: 'other', position: 7 }];
    expect(() => assertWallSections(w)).toThrow(/overlap/);
    w.appearance.sections = [
      feature,
      { ...feature, id: 'other', position: 9.75 },
    ];
    expect(() => assertWallSections(w)).not.toThrow();
  });
  it('respects a permitted door surround, not just its narrower clear opening', () => {
    const w = decorated();
    w.openings = [
      {
        id: 'door-gap',
        position: 3,
        width: 1,
        door: {
          id: 'door',
          assetRef: 'door',
          framePresentation: {
            span: { before: 1.5, after: 1.5 },
            faceFinishes: [],
          },
        },
      },
    ];
    expect(() => assertWallSections(w)).toThrow(/overlap/);
  });
  it('decodes and round-trips the section list through the existing wall owner', () => {
    const w = decorated();
    const decoded = validateStructuralWalls({
      value: JSON.parse(JSON.stringify([w])),
      horizontalLimit: 100,
      itemIds: new Set(),
    });
    expect(decoded).toEqual([w]);
    decoded[0].appearance.sections![0].position = 8;
    expect(w.appearance.sections![0].position).toBe(6);
    expect(() =>
      validateStructuralWalls({
        value: [
          {
            ...w,
            appearance: {
              ...w.appearance,
              sections: [{ ...feature, width: 0 }],
            },
          },
        ],
        horizontalLimit: 100,
        itemIds: new Set(),
      })
    ).toThrow(/section/i);
  });
  it('moves the one owner without introducing a stored world pose for its section', () => {
    const w = decorated();
    const next = translateWall(w, { x: 2, z: 3 });
    expect(next.appearance.sections).toEqual([feature]);
    expect(next.appearance.sections).not.toBe(w.appearance.sections);
    expect(next.line.start).toEqual({ x: 2, z: 3 });
  });
  it('protects section edges during endpoint resize and retains world position when Start moves', () => {
    const w = decorated();
    const end = resizeWallLength({ wall: w, endpoint: 'end', length: 2 });
    expect(end.clamped).toBe(true);
    expect(end.appliedLength).toBe(7.875);
    expect(end.wall.appearance.sections![0].position).toBe(6);
    const start = resizeWallLength({ wall: w, endpoint: 'start', length: 2 });
    expect(start.clamped).toBe(true);
    expect(start.appliedLength).toBe(7.875);
    expect(
      start.wall.line.start.x + start.wall.appearance.sections![0].position
    ).toBe(6);
    expect(w.line.start.x).toBe(0);
  });
  it('copies sections when editing appearance and refuses a newly overlapping list', () => {
    const w = decorated();
    const next = setWallAppearance(w, { ...w.appearance, height: 7 });
    next.appearance.sections![0].position = 8;
    expect(w.appearance.sections![0].position).toBe(6);
    expect(() =>
      setWallAppearance(w, {
        ...w.appearance,
        sections: [feature, { ...feature, id: 'other' }],
      })
    ).toThrow(/overlap/);
  });
});
