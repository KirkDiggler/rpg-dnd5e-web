// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createRoomDraft,
  floorCellCount,
  paintCells,
  parseRoomDraftJson,
  stringifyRoomDraft,
} from './roomDraft';
import {
  addProp,
  createEmptyScene,
  groupSelection,
  saveArrangement,
  stampArrangement,
} from './sceneState';
import {
  LIBRARY_STORAGE_KEY,
  loadLibrary,
  loadScene,
  MAX_ITEMS,
  MAX_JSON_LENGTH,
  parseLibraryJson,
  parseSceneJson,
  saveLibraryToStorage,
  saveSceneToStorage,
  SCENE_STORAGE_KEY,
  stringifyLibrary,
  stringifyScene,
  validateLibrary,
  validateScene,
} from './serialization';
import type {
  ArrangementLibrary,
  KeyValueStorage,
  WorldPointLight,
} from './types';
import { centeredRoomWorkspace, workspaceCells } from './workspaceGeometry';

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
  it('round-trips authored visual height and defaults legacy props to normal at render time', () => {
    const scene = validScene();
    scene.items[0]!.heightScale = 1.75;
    const parsed = parseSceneJson(stringifyScene(scene));
    expect(parsed.items[0]!.heightScale).toBe(1.75);
    expect(parsed.items[1]!.heightScale).toBeUndefined();
  });
  it('round trips a bounded catalog-backed scene with continuous transforms and support links', () => {
    const scene = validScene();
    expect(parseSceneJson(stringifyScene(scene))).toEqual(scene);
  });

  it('round trips a generated exact ref and rejects an unsupported exact neighbor without substitution', () => {
    const scene = addProp(
      createEmptyScene('generated-scene'),
      'dnd5e:props:dark-fortress:alchemy_tools_01',
      { x: 1.25, y: 0, z: -0.75, rotationY: 0.4 },
      'new-asset'
    );
    expect(parseSceneJson(stringifyScene(scene))).toEqual(scene);

    const envelope = JSON.parse(stringifyScene(scene));
    envelope.scene.items[0].assetRef = 'dnd5e:props:dark-fortress:missing';
    expect(() => parseSceneJson(JSON.stringify(envelope))).toThrow(
      /not in the local prop catalog/i
    );
  });

  it('keeps old no-light data unchanged and round trips explicit rendering light settings', () => {
    const scene = validScene();
    const noLightJson = stringifyScene(scene);
    expect(noLightJson).not.toContain('pointLight');
    expect(stringifyScene(parseSceneJson(noLightJson))).toBe(noLightJson);

    const pointLight: WorldPointLight = {
      enabled: false,
      offset: { x: 0.15, y: 0.8, z: -0.2 },
      color: '#ff9d52',
      intensity: 1.4,
      range: 3.2,
    };
    scene.items[1]!.pointLight = pointLight;
    expect(parseSceneJson(stringifyScene(scene)).items[1]!.pointLight).toEqual(
      pointLight
    );
  });

  it.each([
    ['non-boolean enabled', { enabled: 'yes' }],
    ['invalid color', { color: 'orange' }],
    ['negative intensity', { intensity: -1 }],
    ['zero range', { range: 0 }],
    ['non-finite offset', { offset: { x: 0, y: Infinity, z: 0 } }],
  ])('rejects %s in authored light settings', (_label, patch) => {
    const value = JSON.parse(
      stringifyScene(validScene())
    ) as MutableSceneEnvelope & {
      scene: { items: Array<Record<string, unknown>> };
    };
    value.scene.items[0]!.pointLight = {
      enabled: true,
      offset: { x: 0, y: 0.5, z: 0 },
      color: '#ff9d52',
      intensity: 1.1,
      range: 2.6,
      ...patch,
    };
    expect(() => parseSceneJson(JSON.stringify(value))).toThrow(/pointLight/);
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

  // THE SUPPORTED ENVELOPE (rpg-project ideas/benchmark-keep/design.md, R4):
  // the bound admits the ceiling fixture and refuses one item past itself.
  it('refuses a scene one item over MAX_ITEMS, naming the bound', () => {
    const scene = validScene();
    const at = (count: number) => ({
      ...scene,
      items: Array.from({ length: count }, (_, index) => ({
        ...scene.items[0]!,
        id: `prop-${index}`,
      })),
    });
    expect(() => validateScene(at(MAX_ITEMS))).not.toThrow();
    expect(() => validateScene(at(MAX_ITEMS + 1))).toThrow(
      `scene.items must contain at most ${MAX_ITEMS} props.`
    );
  });

  it('rejects oversized JSON before parsing it', () => {
    expect(() => parseSceneJson(' '.repeat(MAX_JSON_LENGTH + 1))).toThrow(
      /too large/i
    );
  });

  it('validates, reopens, and stamps grouped and decoration-only arrangements without changing floor-relative heights', () => {
    let scene = validScene();
    scene = addProp(
      scene,
      'dnd5e:props:books',
      { x: 0.5, y: 1.24, z: -0.1, rotationY: 0.3 },
      'books',
      { supportId: 'table' }
    );
    const groupedScene = groupSelection(
      scene,
      ['table', 'candle', 'books'],
      'group',
      'Decorated table'
    );
    const grouped = saveArrangement(
      groupedScene,
      ['group'],
      'grouped-arrangement',
      'Grouped decorated table',
      '2026-09-05T00:00:00.000Z'
    );
    const decorations = saveArrangement(
      scene,
      ['candle', 'books'],
      'decoration-arrangement',
      'Loose table dressing',
      '2026-09-05T00:00:01.000Z'
    );
    const library = validateLibrary({
      version: 1,
      arrangements: [grouped, decorations],
    });
    const reopened = parseLibraryJson(stringifyLibrary(library));

    expect(
      reopened.arrangements[0]!.items.map((item) => item.transform.y)
    ).toEqual([0, 0.72, 1.24]);
    expect(
      reopened.arrangements[1]!.items.map((item) => item.transform.y)
    ).toEqual([0.72, 1.24]);
    expect(
      reopened.arrangements[1]!.items.every((item) => !item.supportId)
    ).toBe(true);

    const groupedStamp = stampArrangement(
      createEmptyScene('stamped'),
      reopened.arrangements[0]!,
      { x: 2, z: -2 },
      (() => {
        const stampedIds = [
          'table-copy',
          'candle-copy',
          'books-copy',
          'group-copy',
        ];
        let index = 0;
        return () => stampedIds[index++]!;
      })()
    );
    expect(groupedStamp.scene.items.map((item) => item.transform.y)).toEqual([
      0, 0.72, 1.24,
    ]);
    expect(groupedStamp.scene.items[1]!.supportId).toBe('table-copy');
    expect(groupedStamp.scene.items[2]!.supportId).toBe('table-copy');
    expect(
      groupedStamp.scene.items.every((item) => item.parentId === 'group-copy')
    ).toBe(true);
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

describe('scene version 2 annotation preservation', () => {
  it('keeps promoted versions and labels through real scene codecs without changing the envelope/key', () => {
    const legacy = validScene(),
      legacyBytes = stringifyScene(legacy);
    expect(stringifyScene(parseSceneJson(legacyBytes))).toBe(legacyBytes);
    const scene = {
      ...legacy,
      version: 2 as const,
      mapLabels: [
        { id: 'kitchen', text: 'Kitchen', location: { x: 0.125, z: -0.75 } },
      ],
    };
    const bytes = stringifyScene(scene);
    expect(JSON.parse(bytes)).toMatchObject({
      version: 1,
      scene: { version: 2, mapLabels: scene.mapLabels },
    });
    expect(parseSceneJson(bytes)).toEqual(scene);
    expect(validateScene({ ...scene, mapLabels: [] })).toEqual({
      ...legacy,
      version: 2,
    });
    expect(
      parseSceneJson(stringifyScene({ ...legacy, version: 2 })).version
    ).toBe(2);
  });
  it('refuses metadata under scene 1, unknown versions and explicit null label arrays', () => {
    expect(() => validateScene({ ...validScene(), mapLabels: [] })).toThrow(
      /version 1 cannot carry/
    );
    expect(() =>
      validateScene({ ...validScene(), version: 2, mapLabels: null })
    ).toThrow(/mapLabels/);
    // Scene3–7 are opt-in and supported; an unknown successor still fails closed.
    expect(() => validateScene({ ...validScene(), version: 8 })).toThrow(
      /version must be 1, 2, 3, 4, 5, 6 or 7/
    );
  });
});

// `scene.authoringRegions` retired (rpg-project#725 G4): a region is
// gameplay, listed in `room.room.regions`, and its look rides under
// `scene.regionPresentation` keyed by region id. These pin the scene codec's
// half: the presentation is carried verbatim from scene 3, a wall finish in
// it from scene 6, absence stays absent, and unreadable stored bytes are
// protected rather than pruned.
describe('region presentation on the scene (rpg-project#725)', () => {
  const scene3 = () => ({
    ...validScene(),
    version: 3 as const,
    mapLabels: [{ id: 'label', text: 'A note', location: { x: 0, z: 0 } }],
    regionPresentation: {
      hall: { construction: { rectangles: [[0, 0, 4, 2]], tool: 'drag' } },
    },
  });
  it('round trips a carried construction while keeping the envelope and absent fields unchanged', () => {
    const scene = scene3();
    const bytes = stringifyScene(scene);
    expect(JSON.parse(bytes).version).toBe(1);
    expect(parseSceneJson(bytes)).toEqual(validateScene(scene));
    expect(parseSceneJson(bytes).regionPresentation).toEqual(
      scene.regionPresentation
    );
    expect(stringifyScene(parseSceneJson(bytes))).toBe(bytes);
    const none = { ...validScene(), version: 3 as const };
    expect(parseSceneJson(stringifyScene(none))).not.toHaveProperty(
      'regionPresentation'
    );
    expect(
      validateScene({ ...none, regionPresentation: {} })
    ).not.toHaveProperty('regionPresentation');
    for (const version of [1, 2] as const) {
      const old = { ...validScene(), version };
      const oldBytes = stringifyScene(old);
      expect(stringifyScene(parseSceneJson(oldBytes))).toBe(oldBytes);
      expect(() => validateScene({ ...old, regionPresentation: {} })).toThrow(
        'regionPresentation requires scene version 3 or later.'
      );
    }
    expect(() => validateScene({ ...scene, version: 8 })).toThrow(/version/);
  });
  it('refuses the retired authoringRegions by name', () => {
    expect(() =>
      validateScene({ ...validScene(), version: 3, authoringRegions: [] })
    ).toThrow(
      'scene.authoringRegions is retired: regions are the floor (rpg-project#725), listed in room.room.regions'
    );
  });
  it('protects stored unknown fields and malformed presentation instead of pruning them', () => {
    const fallback = validScene();
    const storage = new MemoryStorage();
    for (const invalid of [
      { ...scene3(), futureIntent: { area: 1 } },
      { ...scene3(), authoringRegions: [] },
      { ...scene3(), regionPresentation: { hall: {} } },
      { ...scene3(), regionPresentation: { hall: { tint: 'red' } } },
      { ...scene3(), regionPresentation: [] },
    ]) {
      const bytes = JSON.stringify({
        kind: 'rpg-world-building-scene',
        version: 1,
        scene: invalid,
      });
      storage.values.set(SCENE_STORAGE_KEY, bytes);
      const result = loadScene(storage, fallback);
      expect(result.value).toBe(fallback);
      expect(result.error).not.toBeNull();
      expect(storage.getItem(SCENE_STORAGE_KEY)).toBe(bytes);
    }
  });
});

it('a region wall finish needs scene 6, and its shape is judged without stripping', () => {
  const finish = {
    materialRef: 'dnd5e:material:test:large_gray',
    patternStart: {
      incoming: { wallId: 'a', direction: 'start-to-end' as const },
      outgoing: { wallId: 'b', direction: 'start-to-end' as const },
    },
  };
  const scene = {
    ...validScene(),
    version: 6 as const,
    regionPresentation: { hall: { wallFinish: finish } },
  };
  expect(parseSceneJson(stringifyScene(scene))).toEqual(scene);
  for (const version of [3, 4, 5])
    expect(() => validateScene({ ...scene, version })).toThrow(
      /unsupported field: wallFinish/
    );
  expect(() =>
    validateScene({
      ...scene,
      regionPresentation: { hall: { wallFinish: { materialRef: 'x' } } },
    })
  ).toThrow();
});

// rpg-dnd5e-web#1284: the then 500,000-character cap refused a full 6,208-hex
// floor while the floor was one JSON object per hex. As row runs the floor
// is a few lines per row, and the same floor fits with room to spare.
it('a 6,208-hex floor envelope fits under MAX_JSON_LENGTH (rpg-dnd5e-web#1284)', () => {
  const cells = workspaceCells(centeredRoomWorkspace(97, 64));
  expect(cells).toHaveLength(6208);
  const draft = paintCells(
    createRoomDraft(createEmptyScene('scene'), 'room'),
    cells
  );
  const envelope = stringifyRoomDraft(draft);
  expect(envelope.length).toBeLessThan(MAX_JSON_LENGTH);
  expect(floorCellCount(parseRoomDraftJson(envelope))).toBe(6208);
});
