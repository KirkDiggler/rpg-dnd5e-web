import { describe, expect, it } from 'vitest';
import { addRepeatedProps, layoutRepeatedProps } from './repeatPlacement';
import { createEmptyScene } from './sceneState';
import { stringifyScene } from './serialization';

const REF = 'dnd5e:props:dark-fortress:barricade_02';

describe('layoutRepeatedProps', () => {
  it('snaps a cardinal run to whole copies', () => {
    const layout = layoutRepeatedProps({
      start: { x: 0, z: 0 },
      end: { x: 6.2, z: 0 },
      step: 2,
      originOffset: 1,
      maxCount: 10,
    });
    expect(layout.count).toBe(3);
    expect(layout.transforms.map((point) => point.x)).toEqual([1, 3, 5]);
    expect(
      layout.transforms.every((point) => point.y === 0 && point.z === 0)
    ).toBe(true);
    expect(layout.snappedEnd).toEqual({ x: 6, z: 0 });
  });

  it('supports reverse and diagonal free-world directions', () => {
    const reverse = layoutRepeatedProps({
      start: { x: 5, z: 0 },
      end: { x: 1, z: 0 },
      step: 2,
      originOffset: 1,
      maxCount: 5,
    });
    expect(reverse.transforms.map(({ x }) => x)).toEqual([4, 2]);
    expect(Math.abs(reverse.transforms[0]!.rotationY)).toBeCloseTo(Math.PI);

    const diagonal = layoutRepeatedProps({
      start: { x: 0, z: 0 },
      end: { x: 3, z: 4 },
      step: 2.5,
      originOffset: 1.25,
      maxCount: 5,
    });
    expect(diagonal.count).toBe(2);
    expect(diagonal.transforms[0]).toMatchObject({ x: 0.75, y: 0, z: 1 });
    expect(diagonal.snappedEnd).toEqual({ x: 3, z: 4 });
  });

  it('uses +X for a one-copy zero drag', () => {
    const layout = layoutRepeatedProps({
      start: { x: 2, z: 3 },
      end: { x: 2, z: 3 },
      step: 2,
      originOffset: 1,
      maxCount: 1,
    });
    expect(layout.transforms[0]).toMatchObject({ x: 3, y: 0, z: 3 });
    expect(layout.transforms[0]!.rotationY).toBeCloseTo(0);
    expect(layout.snappedEnd).toEqual({ x: 4, z: 3 });
  });

  it.each([
    { step: 0, originOffset: 1, maxCount: 2 },
    { step: Number.NaN, originOffset: 1, maxCount: 2 },
    { step: 2, originOffset: -1, maxCount: 2 },
    { step: 2, originOffset: 1, maxCount: 0 },
    { step: 2, originOffset: 1, maxCount: 1.5 },
    { step: 2, originOffset: 1, maxCount: 201 },
  ])(
    'rejects malformed bounded input %#',
    ({ step, originOffset, maxCount }) => {
      expect(() =>
        layoutRepeatedProps({
          start: { x: 0, z: 0 },
          end: { x: 1, z: 0 },
          step,
          originOffset,
          maxCount,
        })
      ).toThrow();
    }
  );

  it('rejects capacity overflow before allocating transforms', () => {
    expect(() =>
      layoutRepeatedProps({
        start: { x: 0, z: 0 },
        end: { x: 1000, z: 0 },
        step: 2,
        originOffset: 1,
        maxCount: 2,
      })
    ).toThrow(/capacity/i);
  });
});

describe('addRepeatedProps', () => {
  it('creates one ordinary selected prop without a group and preserves the input', () => {
    const scene = createEmptyScene('scene');
    const before = structuredClone(scene);
    const result = addRepeatedProps({
      scene,
      assetRef: REF,
      transforms: [{ x: 1, y: 0, z: 0, rotationY: 0 }],
      idFactory: () => 'piece',
      label: 'Repeated pieces',
    });
    expect(scene).toEqual(before);
    expect(result.selectedIds).toEqual(['piece']);
    expect(result.scene.items).toMatchObject([{ id: 'piece' }]);
    expect(result.scene.items[0]!.parentId).toBeUndefined();
    expect(result.scene.groups).toEqual([]);
    expect(() => stringifyScene(result.scene)).not.toThrow();
  });

  it('creates fresh props parented to one ordinary selected group', () => {
    const ids = ['piece-a', 'piece-b', 'run-group'];
    const result = addRepeatedProps({
      scene: createEmptyScene('scene'),
      assetRef: REF,
      transforms: [
        { x: 1, y: 0, z: 0, rotationY: 0 },
        { x: 3, y: 0, z: 0, rotationY: 0 },
      ],
      idFactory: () => ids.shift()!,
      label: 'Repeated pieces',
    });
    expect(result.selectedIds).toEqual(['run-group']);
    expect(
      result.scene.items.map(({ id, parentId }) => ({ id, parentId }))
    ).toEqual([
      { id: 'piece-a', parentId: 'run-group' },
      { id: 'piece-b', parentId: 'run-group' },
    ]);
    expect(result.scene.groups).toMatchObject([
      { id: 'run-group', label: 'Repeated pieces' },
    ]);
    expect(() => stringifyScene(result.scene)).not.toThrow();
  });

  it('fails atomically for duplicate generated identities', () => {
    const scene = createEmptyScene('scene');
    expect(() =>
      addRepeatedProps({
        scene,
        assetRef: REF,
        transforms: [
          { x: 1, y: 0, z: 0, rotationY: 0 },
          { x: 3, y: 0, z: 0, rotationY: 0 },
        ],
        idFactory: () => 'duplicate',
        label: 'Repeated pieces',
      })
    ).toThrow(/Identity already exists/);
    expect(scene.items).toEqual([]);
    expect(scene.groups).toEqual([]);
  });

  it('rejects an empty run', () => {
    expect(() =>
      addRepeatedProps({
        scene: createEmptyScene('scene'),
        assetRef: REF,
        transforms: [],
        idFactory: () => 'id',
        label: 'run',
      })
    ).toThrow(/at least one/i);
  });
});
