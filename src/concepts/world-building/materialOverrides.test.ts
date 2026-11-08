import { describe, expect, it } from 'vitest';
import { validateScene } from './serialization';
import { createWall, setWallAppearance } from './structuralWallEditing';
import { validateStructuralWalls } from './structuralWalls';

const selected = {
  surfaceId: 'atlas',
  materialRef: 'dnd5e:material:fantasy-kingdom:atlas_04_c',
};
const scene = (value: unknown) => ({
  version: 1,
  id: 'scene',
  name: 'Scene',
  groups: [],
  items: [
    {
      id: 'bag',
      kind: 'prop',
      assetRef: 'dnd5e:props:fantasy-kingdom:bag_explorer_01',
      label: 'Bag',
      transform: { x: 0, y: 0, z: 0, rotationY: 0 },
      materialOverrides: value,
    },
  ],
});
const walls = (value: unknown) => {
  const wall = createWall({
    id: 'wall',
    assetRef: 'dnd5e:env:fantasy-kingdom:house_wall_05',
    start: { x: 0, z: 0 },
    end: { x: 4, z: 0 },
    height: 3,
    thickness: 0.3,
    elevation: 0,
  });
  return [
    { ...wall, appearance: { ...wall.appearance, materialOverrides: value } },
  ];
};
describe('native material override owner values', () => {
  it.each(
    [
      null,
      'atlas',
      {},
      [null],
      [{ surfaceId: '', materialRef: 'look' }],
      [{ surfaceId: 'atlas', materialRef: ' ' }],
      [{ surfaceId: 3, materialRef: 'look' }],
      [selected, selected],
    ].map((value) => [value])
  )('refuses invalid %j at prop and wall appearance owners', (value) => {
    expect(() => validateScene(scene(value))).toThrow(/materialOverrides/);
    expect(() =>
      validateStructuralWalls({
        value: walls(value),
        horizontalLimit: 100,
        itemIds: new Set(),
      })
    ).toThrow(/materialOverrides/);
  });
  it('copies declared choices and preserves unknown authored metadata without aliasing', () => {
    const values = [{ ...selected, futureDetail: { hint: 'keep' } }];
    const prop = validateScene(scene(values)).items[0];
    const wall = validateStructuralWalls({
      value: walls(values),
      horizontalLimit: 100,
      itemIds: new Set(),
    })[0];
    expect(prop.materialOverrides).toEqual(values);
    expect(wall.appearance.materialOverrides).toEqual(values);
    values[0].materialRef = 'changed-input';
    expect(prop.materialOverrides?.[0].materialRef).toBe(selected.materialRef);
    expect(wall.appearance.materialOverrides?.[0].materialRef).toBe(
      selected.materialRef
    );
  });
  it('stages a detached wall appearance list and refuses invalid edits', () => {
    const wall = validateStructuralWalls({
      value: walls([]),
      horizontalLimit: 100,
      itemIds: new Set(),
    })[0];
    const values = [{ ...selected }];
    const edited = setWallAppearance(wall, {
      ...wall.appearance,
      materialOverrides: values,
    });
    values[0].materialRef = 'changed';
    expect(edited.appearance.materialOverrides?.[0].materialRef).toBe(
      selected.materialRef
    );
    expect(wall.appearance.materialOverrides).toEqual([]);
    expect(() =>
      setWallAppearance(wall, {
        ...wall.appearance,
        materialOverrides: [{ surfaceId: 'atlas', materialRef: '' }],
      })
    ).toThrow(/materialOverrides/);
  });
  it('accepts empty lists as Original without changing wall geometry', () => {
    const raw = walls([]);
    const wall = validateStructuralWalls({
      value: raw,
      horizontalLimit: 100,
      itemIds: new Set(),
    })[0];
    expect(wall.line).toEqual(raw[0].line);
    expect(wall.blocker).toEqual(raw[0].blocker);
    expect(wall.openings).toEqual([]);
    expect(validateScene(scene([])).items[0].materialOverrides).toEqual([]);
  });
});
