import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  addProp,
  createEmptyScene,
  createHistory,
  deleteSelection,
  duplicateSelection,
  groupSelection,
  moveSelection,
  previewSelectionTransform,
  redoHistory,
  rotateSelection,
  saveArrangement,
  stampArrangement,
  undoHistory,
  updateHistory,
} from './sceneState';

const ids = (...values: string[]) => {
  let index = 0;
  return () => values[index++]!;
};

describe('world-building continuous scene math', () => {
  it('keeps free sub-hex X/Z placement and intentional overlap', () => {
    let scene = createEmptyScene('scene-1');
    scene = addProp(
      scene,
      'dnd5e:props:torture-table',
      { x: 0.17, y: 0, z: -0.38, rotationY: 0 },
      'table'
    );
    scene = addProp(
      scene,
      'dnd5e:props:books',
      { x: 0.17, y: 0, z: -0.38, rotationY: 0.12 },
      'books'
    );

    expect(scene.items.map((item) => item.transform)).toEqual([
      { x: 0.17, y: 0, z: -0.38, rotationY: 0 },
      { x: 0.17, y: 0, z: -0.38, rotationY: 0.12 },
    ]);
    expect(scene.items).toHaveLength(2);
  });

  it('moves and rotates support decorations while keeping each member editable', () => {
    let scene = createEmptyScene('scene-1');
    scene = addProp(
      scene,
      'dnd5e:props:torture-table',
      { x: 1, y: 0, z: 1, rotationY: 0 },
      'table'
    );
    scene = addProp(
      scene,
      'dnd5e:props:candles',
      { x: 1.5, y: 0.72, z: 1, rotationY: 0 },
      'candle',
      { supportId: 'table' }
    );

    scene = moveSelection(scene, ['table'], { x: 1, y: 0, z: -0.5 });
    expect(
      scene.items.find((item) => item.id === 'table')!.transform
    ).toMatchObject({
      x: 2,
      z: 0.5,
    });
    expect(
      scene.items.find((item) => item.id === 'candle')!.transform
    ).toMatchObject({
      x: 2.5,
      y: 0.72,
      z: 0.5,
    });

    scene = rotateSelection(scene, ['table'], Math.PI / 2);
    expect(
      scene.items.find((item) => item.id === 'candle')!.transform.x
    ).toBeCloseTo(2);
    // Three.js positive-Y yaw turns +X toward -Z. This expectation is
    // intentionally independent of the authored helper's implementation.
    expect(
      scene.items.find((item) => item.id === 'candle')!.transform.z
    ).toBeCloseTo(0);
    expect(
      scene.items.find((item) => item.id === 'candle')!.transform.rotationY
    ).toBeCloseTo(Math.PI / 2);

    scene = moveSelection(scene, ['candle'], { x: 0.13, y: 0, z: 0.07 });
    expect(
      scene.items.find((item) => item.id === 'table')!.transform.x
    ).toBeCloseTo(2);
    expect(
      scene.items.find((item) => item.id === 'candle')!.transform.x
    ).toBeCloseTo(2.13);
  });

  it('matches Three.js positive-Y yaw at quarter turns around a non-origin support pivot', () => {
    let scene = createEmptyScene('scene-1');
    scene = addProp(
      scene,
      'dnd5e:props:torture-table',
      { x: 3, y: 0, z: -2, rotationY: 0 },
      'table'
    );
    scene = addProp(
      scene,
      'dnd5e:props:candles',
      { x: 4, y: 1, z: -1.5, rotationY: 0.25 },
      'candle',
      { supportId: 'table' }
    );

    for (const angle of [Math.PI / 2, -Math.PI / 2]) {
      const rotated = rotateSelection(scene, ['table'], angle);
      const actual = rotated.items.find((item) => item.id === 'candle')!;
      const expectedOffset = new THREE.Vector3(1, 1, 0.5).applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        angle
      );
      expect(actual.transform.x).toBeCloseTo(3 + expectedOffset.x);
      expect(actual.transform.y).toBeCloseTo(expectedOffset.y);
      expect(actual.transform.z).toBeCloseTo(-2 + expectedOffset.z);
      expect(actual.transform.rotationY).toBeCloseTo(0.25 + angle);
    }
  });

  it('rotates independent selected roots once around their common pivot regardless of selection order', () => {
    let scene = createEmptyScene('scene-1');
    scene = addProp(
      scene,
      'dnd5e:props:barrel',
      { x: -1, y: 0, z: 0, rotationY: 0 },
      'west'
    );
    scene = addProp(
      scene,
      'dnd5e:props:crate',
      { x: 1, y: 0, z: 0, rotationY: 0 },
      'east'
    );

    const westFirst = rotateSelection(scene, ['west', 'east'], Math.PI / 2);
    const eastFirst = rotateSelection(scene, ['east', 'west'], Math.PI / 2);

    expect(eastFirst).toEqual(westFirst);
    const west = westFirst.items.find((item) => item.id === 'west')!;
    const east = westFirst.items.find((item) => item.id === 'east')!;
    expect(west.transform.x).toBeCloseTo(0);
    expect(west.transform.z).toBeCloseTo(1);
    expect(west.transform.rotationY).toBeCloseTo(Math.PI / 2);
    expect(east.transform.x).toBeCloseTo(0);
    expect(east.transform.z).toBeCloseTo(-1);
    expect(east.transform.rotationY).toBeCloseTo(Math.PI / 2);
  });

  it('rotates a descendant shared by selected support and group roots exactly once', () => {
    let scene = createEmptyScene('scene-1');
    scene = addProp(
      scene,
      'dnd5e:props:torture-table',
      { x: 0, y: 0, z: 0, rotationY: 0 },
      'table'
    );
    scene = addProp(
      scene,
      'dnd5e:props:candles',
      { x: 1, y: 1, z: 0, rotationY: 0 },
      'candle',
      { supportId: 'table' }
    );
    scene = addProp(
      scene,
      'dnd5e:props:books',
      { x: 3, y: 1.2, z: 0, rotationY: 0 },
      'books'
    );
    scene = groupSelection(scene, ['candle', 'books'], 'group', 'Dressing');

    const supportFirst = rotateSelection(
      scene,
      ['table', 'group'],
      Math.PI / 2
    );
    const groupFirst = rotateSelection(scene, ['group', 'table'], Math.PI / 2);
    const candle = supportFirst.items.find((item) => item.id === 'candle')!;

    expect(groupFirst).toEqual(supportFirst);
    expect(candle.transform.rotationY).toBeCloseTo(Math.PI / 2);
    // The distinct selected roots are at X 0 and X 2, so the common pivot is
    // X 1. The candle starts on that pivot and therefore keeps its X/Z.
    expect(candle.transform.x).toBeCloseTo(1);
    expect(candle.transform.z).toBeCloseTo(0);
    expect(
      supportFirst.items.find((item) => item.id === 'books')!.transform.z
    ).toBeCloseTo(-2);
  });

  it('previews gizmo motion from one immutable drag-start scene', () => {
    let scene = createEmptyScene('scene-1');
    scene = addProp(
      scene,
      'dnd5e:props:torture-table',
      { x: 1, y: 0, z: 2, rotationY: 0.1 },
      'table'
    );
    scene = addProp(
      scene,
      'dnd5e:props:candles',
      { x: 1.5, y: 0.8, z: 2, rotationY: 0.2 },
      'candle',
      { supportId: 'table' }
    );

    const firstPreview = previewSelectionTransform(scene, ['table'], 'move', {
      x: 0.25,
      y: 0.3,
      z: -0.5,
      rotationY: 0,
    });
    const laterPreview = previewSelectionTransform(scene, ['table'], 'move', {
      x: 0.4,
      y: 0.1,
      z: -0.2,
      rotationY: 0,
    });

    expect(firstPreview.items[0]!.transform).toMatchObject({
      x: 1.25,
      y: 0.3,
      z: 1.5,
    });
    expect(laterPreview.items[0]!.transform).toMatchObject({
      x: 1.4,
      y: 0.1,
      z: 1.8,
    });
    expect(laterPreview.items[1]!.transform).toMatchObject({
      x: 1.9,
      y: 0.9,
      z: 1.8,
    });
    expect(scene.items[0]!.transform).toEqual({
      x: 1,
      y: 0,
      z: 2,
      rotationY: 0.1,
    });
  });

  it('previews only upright positive-Y gizmo rotation for a relationship closure', () => {
    let scene = createEmptyScene('scene-1');
    scene = addProp(
      scene,
      'dnd5e:props:torture-table',
      { x: 2, y: 0, z: -1, rotationY: 0 },
      'table'
    );
    scene = addProp(
      scene,
      'dnd5e:props:books',
      { x: 3, y: 1, z: -1, rotationY: 0 },
      'books',
      { supportId: 'table' }
    );

    const preview = previewSelectionTransform(scene, ['table'], 'rotate', {
      x: 99,
      y: 99,
      z: 99,
      rotationY: Math.PI / 2,
    });

    expect(preview.items[0]!.transform).toMatchObject({ x: 2, y: 0, z: -1 });
    expect(preview.items[1]!.transform.x).toBeCloseTo(2);
    expect(preview.items[1]!.transform.y).toBeCloseTo(1);
    expect(preview.items[1]!.transform.z).toBeCloseTo(-2);
    expect(preview.items[1]!.transform.rotationY).toBeCloseTo(Math.PI / 2);
  });

  it('groups only the exact selection without flattening members or absorbing unrelated content', () => {
    let scene = createEmptyScene('scene-1');
    scene = addProp(
      scene,
      'dnd5e:props:barrel',
      { x: 0, y: 0, z: 0, rotationY: 0 },
      'a'
    );
    scene = addProp(
      scene,
      'dnd5e:props:crate',
      { x: 1, y: 0, z: 0, rotationY: 0 },
      'b'
    );
    scene = addProp(
      scene,
      'dnd5e:props:rug',
      { x: 4, y: 0, z: 4, rotationY: 0 },
      'other'
    );

    const grouped = groupSelection(
      scene,
      ['a', 'b'],
      'group',
      'Table dressing'
    );
    expect(grouped.groups).toEqual([
      expect.objectContaining({ id: 'group', label: 'Table dressing' }),
    ]);
    expect(grouped.items.find((item) => item.id === 'a')!.parentId).toBe(
      'group'
    );
    expect(grouped.items.find((item) => item.id === 'b')!.parentId).toBe(
      'group'
    );
    expect(
      grouped.items.find((item) => item.id === 'other')!.parentId
    ).toBeUndefined();
    expect(grouped.items.map((item) => item.id)).toEqual(['a', 'b', 'other']);
  });

  it('duplicates and deletes through relationship-aware selection roots', () => {
    let scene = createEmptyScene('scene-1');
    scene = addProp(
      scene,
      'dnd5e:props:torture-table',
      { x: 0, y: 0, z: 0, rotationY: 0 },
      'table'
    );
    scene = addProp(
      scene,
      'dnd5e:props:candles',
      { x: 0.2, y: 0.7, z: 0, rotationY: 0 },
      'candle',
      { supportId: 'table' }
    );

    const duplicated = duplicateSelection(
      scene,
      ['table'],
      ids('table-2', 'candle-2')
    );
    expect(duplicated.scene.items).toHaveLength(4);
    expect(duplicated.createdIds).toEqual(['table-2', 'candle-2']);
    expect(
      duplicated.scene.items.find((item) => item.id === 'candle-2')!.supportId
    ).toBe('table-2');

    const deleted = deleteSelection(duplicated.scene, ['table']);
    expect(deleted.items.map((item) => item.id)).toEqual([
      'table-2',
      'candle-2',
    ]);
  });
});

describe('world-building independent arrangements', () => {
  it('stamps fresh identities, remaps relationships, and never shares mutation', () => {
    let scene = createEmptyScene('scene-1');
    scene = addProp(
      scene,
      'dnd5e:props:torture-table',
      { x: 0.11, y: 0, z: 0.23, rotationY: 0 },
      'table'
    );
    scene = addProp(
      scene,
      'dnd5e:props:candles',
      { x: 0.31, y: 0.72, z: 0.18, rotationY: 0 },
      'candle',
      { supportId: 'table' }
    );
    const arrangement = saveArrangement(
      scene,
      ['table'],
      'arrangement-1',
      'Decorated table',
      '2026-09-05T00:00:00.000Z'
    );

    const first = stampArrangement(
      scene,
      arrangement,
      { x: 1.13, z: -0.27 },
      ids('first-table', 'first-candle')
    );
    const second = stampArrangement(
      first.scene,
      arrangement,
      { x: -1.42, z: 0.36 },
      ids('second-table', 'second-candle')
    );

    expect(new Set([...first.createdIds, ...second.createdIds]).size).toBe(4);
    expect(
      second.scene.items.find((item) => item.id === 'first-candle')!.supportId
    ).toBe('first-table');
    expect(
      second.scene.items.find((item) => item.id === 'second-candle')!.supportId
    ).toBe('second-table');
    expect(
      second.scene.items.find((item) => item.id === 'first-table')!.transform.x
    ).toBeCloseTo(1.13);
    expect(
      second.scene.items.find((item) => item.id === 'second-table')!.transform.x
    ).toBeCloseTo(-1.42);

    const edited = moveSelection(second.scene, ['first-candle'], {
      x: 0.07,
      y: 0,
      z: 0,
    });
    expect(
      edited.items.find((item) => item.id === 'first-candle')!.transform.x
    ).not.toBe(
      second.scene.items.find((item) => item.id === 'first-candle')!.transform.x
    );
    expect(
      edited.items.find((item) => item.id === 'second-candle')!.transform
    ).toEqual(
      second.scene.items.find((item) => item.id === 'second-candle')!.transform
    );
    expect(
      arrangement.items.find((item) => item.id === 'candle')!.transform.x
    ).toBeCloseTo(0.2);
  });

  it('keeps floor-relative heights when saving and stamping unequal-height decorations', () => {
    let scene = createEmptyScene('scene-1');
    scene = addProp(
      scene,
      'dnd5e:props:torture-table',
      { x: 4, y: 0, z: -3, rotationY: 0 },
      'table'
    );
    scene = addProp(
      scene,
      'dnd5e:props:candles',
      { x: 4.2, y: 0.82, z: -2.9, rotationY: 0.1 },
      'candle',
      { supportId: 'table' }
    );
    scene = addProp(
      scene,
      'dnd5e:props:books',
      { x: 4.6, y: 1.24, z: -2.7, rotationY: -0.2 },
      'books',
      { supportId: 'table' }
    );

    const arrangement = saveArrangement(
      scene,
      ['candle', 'books'],
      'arrangement-1',
      'Table dressing',
      '2026-09-05T00:00:00.000Z'
    );
    expect(arrangement.items.map((item) => item.transform.y)).toEqual([
      0.82, 1.24,
    ]);
    expect(arrangement.items.every((item) => !item.supportId)).toBe(true);

    const stamped = stampArrangement(
      scene,
      arrangement,
      { x: -2, z: 3 },
      ids('candle-copy', 'books-copy')
    );
    expect(
      stamped.scene.items
        .filter((item) => stamped.createdIds.includes(item.id))
        .map((item) => item.transform.y)
    ).toEqual([0.82, 1.24]);
    expect(
      stamped.scene.items.find((item) => item.id === 'candle')!.transform
    ).toEqual(scene.items.find((item) => item.id === 'candle')!.transform);
  });

  it('deliberately drops an external support when duplicating only its decoration', () => {
    let scene = createEmptyScene('scene-1');
    scene = addProp(
      scene,
      'dnd5e:props:torture-table',
      { x: 0, y: 0, z: 0, rotationY: 0 },
      'table'
    );
    scene = addProp(
      scene,
      'dnd5e:props:candles',
      { x: 0.2, y: 0.9, z: 0, rotationY: 0 },
      'candle',
      { supportId: 'table' }
    );

    const duplicated = duplicateSelection(scene, ['candle'], () => 'copy');
    expect(
      duplicated.scene.items.find((item) => item.id === 'copy')!.supportId
    ).toBeUndefined();
    expect(
      duplicated.scene.items.find((item) => item.id === 'copy')!.transform.y
    ).toBe(0.9);
  });

  it('rejects a stamp identity that collides with the target scene', () => {
    let scene = createEmptyScene('scene-1');
    scene = addProp(
      scene,
      'dnd5e:props:books',
      { x: 0.1, y: 0, z: 0.2, rotationY: 0 },
      'already-in-scene'
    );
    const arrangement = saveArrangement(
      scene,
      ['already-in-scene'],
      'arrangement-1',
      'Books',
      '2026-09-05T00:00:00.000Z'
    );

    expect(() =>
      stampArrangement(
        scene,
        arrangement,
        { x: 1, z: 1 },
        () => 'already-in-scene'
      )
    ).toThrow(/duplicate identity/i);
  });
});

describe('world-building undo history', () => {
  it('undoes and redoes committed scene snapshots and clears redo after a new edit', () => {
    const empty = createEmptyScene('scene-1');
    const withTable = addProp(
      empty,
      'dnd5e:props:torture-table',
      { x: 0.2, y: 0, z: 0.1, rotationY: 0 },
      'table'
    );
    const moved = moveSelection(withTable, ['table'], { x: 0.3, y: 0, z: 0.4 });
    let history = createHistory(empty);
    history = updateHistory(history, withTable);
    history = updateHistory(history, moved);

    history = undoHistory(history);
    expect(history.present.items[0]!.transform).toEqual(
      withTable.items[0]!.transform
    );
    history = redoHistory(history);
    expect(history.present.items[0]!.transform).toEqual(
      moved.items[0]!.transform
    );
    history = undoHistory(history);
    history = updateHistory(
      history,
      rotateSelection(history.present, ['table'], Math.PI / 6)
    );
    expect(history.future).toEqual([]);
  });

  it('keeps the newest 80 undo snapshots and evicts older history', () => {
    let history = createHistory(createEmptyScene('scene-1'));
    for (let index = 1; index <= 81; index += 1) {
      history = updateHistory(history, {
        ...history.present,
        name: `Edit ${index}`,
      });
    }

    expect(history.past).toHaveLength(80);
    for (let index = 0; index < 80; index += 1) {
      history = undoHistory(history);
    }
    expect(history.present.name).toBe('Edit 1');
    expect(undoHistory(history)).toBe(history);
  });
});
