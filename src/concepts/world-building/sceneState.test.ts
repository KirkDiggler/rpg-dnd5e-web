import { describe, expect, it } from 'vitest';
import {
  addProp,
  createEmptyScene,
  createHistory,
  deleteSelection,
  duplicateSelection,
  groupSelection,
  moveSelection,
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
    expect(
      scene.items.find((item) => item.id === 'candle')!.transform.z
    ).toBeCloseTo(1);
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
});
