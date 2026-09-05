import { describe, expect, it } from 'vitest';
import { addProp, createEmptyScene, saveArrangement } from './sceneState';
import {
  LIBRARY_STORAGE_KEY,
  SCENE_STORAGE_KEY,
  loadLibrary,
  loadScene,
  parseLibraryJson,
  parseSceneJson,
  saveLibraryToStorage,
  saveSceneToStorage,
  stringifyLibrary,
  stringifyScene,
} from './serialization';
import type { ArrangementLibrary, KeyValueStorage } from './types';

function validScene() {
  let scene = createEmptyScene('scene-1');
  scene = addProp(
    scene,
    'dnd5e:props:torture-table',
    { x: 0.17, y: 0, z: -0.31, rotationY: 0.2 },
    'table'
  );
  scene = addProp(
    scene,
    'dnd5e:props:candles',
    { x: 0.21, y: 0.72, z: -0.25, rotationY: -0.15 },
    'candle',
    { supportId: 'table' }
  );
  return scene;
}

class MemoryStorage implements KeyValueStorage {
  readonly values = new Map<string, string>();
  failGet = false;
  failSet = false;

  getItem(key: string): string | null {
    if (this.failGet) throw new Error('storage unavailable');
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failSet) throw new Error('quota exceeded');
    this.values.set(key, value);
  }
}

interface MutableSceneEnvelope {
  scene: {
    items: Array<{
      id: string;
      assetRef: string;
      supportId?: string;
      transform: { x: unknown; z: number };
    }>;
  };
}

describe('world-building serialization validation', () => {
  it('round trips a bounded catalog-backed scene with continuous transforms and support links', () => {
    const scene = validScene();
    expect(parseSceneJson(stringifyScene(scene))).toEqual(scene);
  });

  it.each<[string, (value: MutableSceneEnvelope) => void]>([
    [
      'unknown catalog ref',
      (value) =>
        (value.scene.items[0]!.assetRef = 'https://evil.invalid/model.glb'),
    ],
    [
      'non-finite transform',
      (value) => (value.scene.items[0]!.transform.x = 'Infinity'),
    ],
    [
      'out-of-bounds transform',
      (value) => (value.scene.items[0]!.transform.z = 1000),
    ],
    [
      'missing support',
      (value) => (value.scene.items[1]!.supportId = 'missing'),
    ],
    [
      'cyclic relationship',
      (value) => (value.scene.items[0]!.supportId = 'candle'),
    ],
    ['duplicate identity', (value) => (value.scene.items[1]!.id = 'table')],
  ])('rejects %s without accepting arbitrary data', (_label, mutate) => {
    const value = JSON.parse(
      stringifyScene(validScene())
    ) as MutableSceneEnvelope;
    mutate(value);
    expect(() => parseSceneJson(JSON.stringify(value))).toThrow();
  });

  it('rejects oversized JSON before parsing it', () => {
    expect(() => parseSceneJson(' '.repeat(500_001))).toThrow(/too large/i);
  });

  it('round trips an initially empty library and a saved selection', () => {
    const scene = validScene();
    const empty: ArrangementLibrary = { version: 1, arrangements: [] };
    expect(parseLibraryJson(stringifyLibrary(empty))).toEqual(empty);

    const arrangement = saveArrangement(
      scene,
      ['table'],
      'arrangement-1',
      'Decorated table',
      '2026-09-05T00:00:00.000Z'
    );
    const library = { version: 1 as const, arrangements: [arrangement] };
    expect(parseLibraryJson(stringifyLibrary(library))).toEqual(library);
  });
});

describe('world-building non-destructive local persistence', () => {
  it('returns the known-good fallback and a visible error for corrupt saved scene/library', () => {
    const storage = new MemoryStorage();
    const scene = validScene();
    const library: ArrangementLibrary = { version: 1, arrangements: [] };
    storage.values.set(SCENE_STORAGE_KEY, '{nope');
    storage.values.set(LIBRARY_STORAGE_KEY, JSON.stringify({ version: 99 }));

    const sceneResult = loadScene(storage, scene);
    const libraryResult = loadLibrary(storage, library);
    expect(sceneResult.value).toBe(scene);
    expect(sceneResult.error).toMatch(/saved scene/i);
    expect(libraryResult.value).toBe(library);
    expect(libraryResult.error).toMatch(/arrangement library/i);
  });

  it('does not overwrite a prior good payload when storage writes fail', () => {
    const storage = new MemoryStorage();
    const original = validScene();
    storage.values.set(SCENE_STORAGE_KEY, stringifyScene(original));
    storage.failSet = true;
    const changed = {
      ...original,
      name: 'Do not persist me',
    };

    expect(saveSceneToStorage(storage, changed).error).toMatch(
      /quota exceeded/i
    );
    expect(storage.values.get(SCENE_STORAGE_KEY)).toBe(
      stringifyScene(original)
    );
  });

  it('saves valid scene and library values to their independent keys', () => {
    const storage = new MemoryStorage();
    const scene = validScene();
    const library: ArrangementLibrary = { version: 1, arrangements: [] };
    expect(saveSceneToStorage(storage, scene).error).toBeNull();
    expect(saveLibraryToStorage(storage, library).error).toBeNull();
    expect(parseSceneJson(storage.values.get(SCENE_STORAGE_KEY)!)).toEqual(
      scene
    );
    expect(parseLibraryJson(storage.values.get(LIBRARY_STORAGE_KEY)!)).toEqual(
      library
    );
  });
});
