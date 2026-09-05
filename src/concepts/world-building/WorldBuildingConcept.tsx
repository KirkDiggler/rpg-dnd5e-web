import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WORLD_BUILDING_CATALOG } from './catalog';
import {
  addProp,
  createEmptyScene,
  createHistory,
  defaultId,
  deleteSelection,
  duplicateSelection,
  groupSelection,
  moveSelection,
  redoHistory,
  rotateSelection,
  saveArrangement,
  stampArrangement,
  undoHistory,
  ungroup,
  updateHistory,
} from './sceneState';
import {
  loadLibrary,
  loadScene,
  parseLibraryJson,
  parseSceneJson,
  saveLibraryToStorage,
  saveSceneToStorage,
  stringifyLibrary,
  stringifyScene,
} from './serialization';
import type {
  ArrangementLibrary,
  IdFactory,
  KeyValueStorage,
  SceneHistory,
  WorldPoint,
  WorldScene,
} from './types';
import './worldBuilding.css';
import { WorldBuildingViewport } from './WorldBuildingViewport';

interface WorldBuildingConceptProps {
  storage?: KeyValueStorage;
  idFactory?: IdFactory;
  now?: () => string;
}

type PlacementTool =
  | { kind: 'prop'; id: string }
  | { kind: 'arrangement'; id: string };

const browserStorage: KeyValueStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};

function bootstrap(storage: KeyValueStorage, idFactory: IdFactory) {
  const blank = createEmptyScene(idFactory());
  const emptyLibrary: ArrangementLibrary = { version: 1, arrangements: [] };
  const scene = loadScene(storage, blank);
  const library = loadLibrary(storage, emptyLibrary);
  return {
    history: createHistory(scene.value),
    library: library.value,
    error: [scene.error, library.error].filter(Boolean).join(' '),
  };
}

function downloadJson(filename: string, json: string) {
  const url = URL.createObjectURL(
    new Blob([json], { type: 'application/json;charset=utf-8' })
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function WorldBuildingConcept({
  storage,
  idFactory = defaultId,
  now = () => new Date().toISOString(),
}: WorldBuildingConceptProps) {
  const effectiveStorage = storage ?? browserStorage;
  const [initial] = useState(() => bootstrap(effectiveStorage, idFactory));
  const [history, setHistory] = useState<SceneHistory>(initial.history);
  const [library, setLibrary] = useState<ArrangementLibrary>(initial.library);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [placement, setPlacement] = useState<PlacementTool | null>(null);
  const [search, setSearch] = useState('');
  const [arrangementName, setArrangementName] = useState('New arrangement');
  const [portableJson, setPortableJson] = useState('');
  const [notice, setNotice] = useState(initial.error);
  const [saveStatus, setSaveStatus] = useState('Local draft ready');
  const [confirmBlank, setConfirmBlank] = useState(false);
  const [assetStates, setAssetStates] = useState<
    Record<string, 'loaded' | 'error'>
  >({});
  const skippedInitialSceneSave = useRef(false);
  const skippedInitialLibrarySave = useRef(false);
  const scene = history.present;

  useEffect(() => {
    if (!skippedInitialSceneSave.current) {
      skippedInitialSceneSave.current = true;
      return;
    }
    const result = saveSceneToStorage(effectiveStorage, scene);
    if (result.error) {
      setNotice(result.error);
      setSaveStatus('Save failed — scene kept in memory');
    } else {
      setSaveStatus('Saved locally');
    }
  }, [effectiveStorage, scene]);

  useEffect(() => {
    if (!skippedInitialLibrarySave.current) {
      skippedInitialLibrarySave.current = true;
      return;
    }
    const result = saveLibraryToStorage(effectiveStorage, library);
    if (result.error) setNotice(result.error);
  }, [effectiveStorage, library]);

  const commit = useCallback(
    (next: WorldScene, selection = selectedIds) => {
      setHistory((current) => updateHistory(current, next));
      setSelectedIds(selection);
      setNotice('');
    },
    [selectedIds]
  );

  const activeArrangement =
    placement?.kind === 'arrangement'
      ? library.arrangements.find((entry) => entry.id === placement.id)
      : undefined;

  const placeGround = (point: WorldPoint) => {
    if (!placement) return;
    if (placement.kind === 'prop') {
      const id = idFactory();
      commit(
        addProp(
          scene,
          placement.id,
          { x: point.x, y: 0, z: point.z, rotationY: 0 },
          id
        ),
        []
      );
      return;
    }
    if (!activeArrangement) {
      setNotice('That arrangement is no longer in the library.');
      setPlacement(null);
      return;
    }
    try {
      const stamped = stampArrangement(
        scene,
        activeArrangement,
        point,
        idFactory
      );
      commit(stamped.scene, []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const placeSurface = (
    point: { x: number; y: number; z: number },
    supportId: string
  ) => {
    if (placement?.kind !== 'prop') return;
    const id = idFactory();
    commit(
      addProp(scene, placement.id, { ...point, rotationY: 0 }, id, {
        supportId,
      }),
      []
    );
  };

  const applyToSelection = useCallback(
    (operation: (current: WorldScene) => WorldScene) => {
      if (selectedIds.length === 0) {
        setNotice('Select at least one object first.');
        return;
      }
      try {
        commit(operation(scene));
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error));
      }
    },
    [commit, scene, selectedIds]
  );

  const duplicate = useCallback(() => {
    if (selectedIds.length === 0) {
      setNotice('Select at least one object first.');
      return;
    }
    try {
      const result = duplicateSelection(scene, selectedIds, idFactory);
      commit(result.scene, result.createdIds);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }, [commit, idFactory, scene, selectedIds]);

  const remove = useCallback(() => {
    if (selectedIds.length === 0) return;
    commit(deleteSelection(scene, selectedIds), []);
  }, [commit, scene, selectedIds]);

  const undo = useCallback(() => {
    setHistory((current) => undoHistory(current));
    setSelectedIds([]);
    setNotice('');
  }, []);
  const redo = useCallback(() => {
    setHistory((current) => redoHistory(current));
    setSelectedIds([]);
    setNotice('');
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        return;
      }
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (modifier && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        remove();
      } else if (modifier && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicate();
      } else if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        applyToSelection((current) =>
          rotateSelection(current, selectedIds, Math.PI / 12)
        );
      } else if (event.key === 'Escape') {
        setPlacement(null);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [applyToSelection, duplicate, redo, remove, selectedIds, undo]);

  const filteredCatalog = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle
      ? WORLD_BUILDING_CATALOG.filter((entry) =>
          `${entry.label} ${entry.role}`.toLowerCase().includes(needle)
        )
      : WORLD_BUILDING_CATALOG;
  }, [search]);

  const saveNow = () => {
    const sceneResult = saveSceneToStorage(effectiveStorage, scene);
    const libraryResult = saveLibraryToStorage(effectiveStorage, library);
    const error = sceneResult.error ?? libraryResult.error;
    setNotice(error ?? '');
    setSaveStatus(
      error ? 'Save failed — good in-memory data kept' : 'Saved locally now'
    );
  };

  const saveSelectedArrangement = () => {
    try {
      const arrangement = saveArrangement(
        scene,
        selectedIds,
        idFactory(),
        arrangementName,
        now()
      );
      setLibrary((current) => ({
        ...current,
        arrangements: [...current.arrangements, arrangement],
      }));
      setArrangementName('New arrangement');
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const importScene = () => {
    try {
      const imported = parseSceneJson(portableJson);
      commit(imported, []);
      setNotice('');
    } catch (error) {
      setNotice(
        `Scene import rejected; the open scene was kept. ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };

  const importLibrary = () => {
    try {
      const imported = parseLibraryJson(portableJson);
      setLibrary(imported);
      setNotice('');
    } catch (error) {
      setNotice(
        `Library import rejected; the current library was kept. ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };

  const reopen = () => {
    const sceneResult = loadScene(effectiveStorage, scene);
    const libraryResult = loadLibrary(effectiveStorage, library);
    const error = sceneResult.error ?? libraryResult.error;
    if (error) {
      setNotice(error);
      return;
    }
    setHistory(createHistory(sceneResult.value));
    setLibrary(libraryResult.value);
    setSelectedIds([]);
    setPlacement(null);
    setNotice('');
    setSaveStatus('Reopened local scene and library');
  };

  const loadedCount = Object.values(assetStates).filter(
    (state) => state === 'loaded'
  ).length;
  const failedCount = Object.values(assetStates).filter(
    (state) => state === 'error'
  ).length;

  return (
    <section className="wb-shell" aria-label="World Building Concept">
      <header className="wb-header">
        <div>
          <p className="wb-kicker">Durable Concepts Lab · web#935</p>
          <h2>World Building</h2>
          <p>Compose freely in world space. Hexes are scale, not slots.</p>
        </div>
        <div className="wb-save-cluster">
          <span aria-live="polite">{saveStatus}</span>
          <button onClick={saveNow}>Save now</button>
          <button onClick={reopen}>Reopen local</button>
          {!confirmBlank ? (
            <button onClick={() => setConfirmBlank(true)}>
              New blank scene
            </button>
          ) : (
            <span className="wb-confirm">
              <button onClick={() => setConfirmBlank(false)}>
                Keep current
              </button>
              <button
                className="wb-danger"
                onClick={() => {
                  const blank = createEmptyScene(idFactory());
                  commit(blank, []);
                  setPlacement(null);
                  setConfirmBlank(false);
                }}
              >
                Confirm blank scene
              </button>
            </span>
          )}
        </div>
      </header>

      {notice && (
        <div className="wb-alert" role="alert">
          {notice}
          <button aria-label="Dismiss message" onClick={() => setNotice('')}>
            ×
          </button>
        </div>
      )}

      <div className="wb-workspace">
        <aside className="wb-panel wb-palette" aria-label="Asset palette">
          <h3>Real asset palette</h3>
          <label>
            <span>Search assets</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="table, candles…"
            />
          </label>
          <p className="wb-help">
            Choose an asset, then point at the ground or an upward-facing
            tabletop. Placement is free and overlaps are allowed.
          </p>
          <div className="wb-palette-list">
            {filteredCatalog.map((entry) => (
              <button
                key={entry.ref}
                className={
                  placement?.kind === 'prop' && placement.id === entry.ref
                    ? 'wb-palette-entry wb-active'
                    : 'wb-palette-entry'
                }
                aria-pressed={
                  placement?.kind === 'prop' && placement.id === entry.ref
                }
                aria-label={`Place ${entry.label}`}
                onClick={() => {
                  setPlacement({ kind: 'prop', id: entry.ref });
                  setSelectedIds([]);
                }}
              >
                {entry.thumbnail ? (
                  <img src={entry.thumbnail} alt="" />
                ) : (
                  <span className="wb-swatch">{entry.label.slice(0, 2)}</span>
                )}
                <span>
                  <strong>{entry.label}</strong>
                  <small>
                    {entry.role}
                    {entry.supportsDecoration ? ' · surface' : ''}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <main className="wb-stage">
          <div className="wb-stage-bar">
            <span data-testid="placement-status">
              {placement?.kind === 'prop'
                ? `Placing ${WORLD_BUILDING_CATALOG.find((entry) => entry.ref === placement.id)?.label ?? 'asset'} — click ground or tabletop`
                : activeArrangement
                  ? `Stamping ${activeArrangement.name} — click ground for independent copies`
                  : 'Select: left drag · Orbit: right drag · Zoom: wheel'}
            </span>
            <span data-testid="asset-load-status">
              Real models loaded {loadedCount}/{scene.items.length}
              {failedCount > 0 ? ` · ${failedCount} failed` : ''}
            </span>
            {placement && (
              <button onClick={() => setPlacement(null)}>
                Cancel placement
              </button>
            )}
          </div>
          <div className="wb-canvas-wrap">
            <WorldBuildingViewport
              scene={scene}
              selectedIds={selectedIds}
              placement={placement}
              onSelect={setSelectedIds}
              onPlaceGround={placeGround}
              onPlaceSurface={placeSurface}
              onMove={(ids, delta) => commit(moveSelection(scene, ids, delta))}
              onAssetState={(id, state) =>
                setAssetStates((current) =>
                  current[id] === state ? current : { ...current, [id]: state }
                )
              }
            />
          </div>
        </main>

        <aside
          className="wb-panel wb-inspector"
          aria-label="Scene and arrangements"
        >
          <section>
            <h3>Edit</h3>
            <div className="wb-actions">
              <button disabled={history.past.length === 0} onClick={undo}>
                Undo
              </button>
              <button disabled={history.future.length === 0} onClick={redo}>
                Redo
              </button>
              <button
                onClick={() =>
                  applyToSelection((current) =>
                    rotateSelection(current, selectedIds, -Math.PI / 12)
                  )
                }
              >
                Rotate left
              </button>
              <button
                onClick={() =>
                  applyToSelection((current) =>
                    rotateSelection(current, selectedIds, Math.PI / 12)
                  )
                }
              >
                Rotate right
              </button>
              <button
                aria-label="Nudge selection east"
                onClick={() =>
                  applyToSelection((current) =>
                    moveSelection(current, selectedIds, { x: 0.1, y: 0, z: 0 })
                  )
                }
              >
                Nudge east
              </button>
              <button onClick={duplicate}>Duplicate</button>
              <button className="wb-danger" onClick={remove}>
                Delete
              </button>
            </div>
            <div className="wb-actions">
              <button
                onClick={() => {
                  try {
                    const id = idFactory();
                    commit(
                      groupSelection(
                        scene,
                        selectedIds,
                        id,
                        'Arrangement group'
                      ),
                      [id]
                    );
                  } catch (error) {
                    setNotice(
                      error instanceof Error ? error.message : String(error)
                    );
                  }
                }}
              >
                Group selection
              </button>
              <button
                disabled={
                  selectedIds.length !== 1 ||
                  !scene.groups.some((group) => group.id === selectedIds[0])
                }
                onClick={() => {
                  const groupId = selectedIds[0];
                  if (groupId) commit(ungroup(scene, groupId), []);
                }}
              >
                Ungroup
              </button>
            </div>
            <p className="wb-help">
              Shortcuts: Delete · Ctrl/Cmd+D · Ctrl/Cmd+Z · Shift+Ctrl/Cmd+Z · R
              · Esc
            </p>
          </section>

          <section>
            <h3>Scene objects ({scene.items.length})</h3>
            {scene.groups.map((group) => (
              <label className="wb-tree-row wb-group-row" key={group.id}>
                <input
                  type="checkbox"
                  aria-label={`Select ${group.label} ${group.id}`}
                  checked={selectedIds.includes(group.id)}
                  onChange={() =>
                    setSelectedIds((current) =>
                      current.includes(group.id)
                        ? current.filter((id) => id !== group.id)
                        : [...current, group.id]
                    )
                  }
                />
                <span>▾ {group.label}</span>
              </label>
            ))}
            <div className="wb-tree">
              {scene.items.length === 0 && (
                <p>Blank scene — choose an asset.</p>
              )}
              {scene.items.map((item) => (
                <label className="wb-tree-row" key={item.id}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${item.label} ${item.id}`}
                    checked={selectedIds.includes(item.id)}
                    onChange={() =>
                      setSelectedIds((current) =>
                        current.includes(item.id)
                          ? current.filter((id) => id !== item.id)
                          : [...current, item.id]
                      )
                    }
                  />
                  <span>
                    {item.parentId ? '↳ ' : ''}
                    {item.label}
                    {item.supportId ? ' · attached' : ''}
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section>
            <h3>Arrangement library</h3>
            <label>
              <span>Arrangement name</span>
              <input
                aria-label="Arrangement name"
                value={arrangementName}
                maxLength={120}
                onChange={(event) => setArrangementName(event.target.value)}
              />
            </label>
            <button onClick={saveSelectedArrangement}>Save selection</button>
            <div className="wb-library">
              {library.arrangements.length === 0 && (
                <p>No saved arrangements yet. Build the first one.</p>
              )}
              {library.arrangements.map((arrangement) => (
                <article key={arrangement.id}>
                  <strong>{arrangement.name}</strong>
                  <small>{arrangement.items.length} editable props</small>
                  <button
                    aria-label={`Stamp ${arrangement.name}`}
                    onClick={() => {
                      setPlacement({ kind: 'arrangement', id: arrangement.id });
                      setSelectedIds([]);
                    }}
                  >
                    Stamp independent copy
                  </button>
                </article>
              ))}
            </div>
          </section>

          <details>
            <summary>Portable JSON</summary>
            <label>
              <span>Portable JSON</span>
              <textarea
                aria-label="Portable JSON"
                value={portableJson}
                maxLength={500_000}
                onChange={(event) => setPortableJson(event.target.value)}
                placeholder="Export appears here, or paste a scene/library document to import."
              />
            </label>
            <div className="wb-actions">
              <button
                onClick={() => {
                  const json = stringifyScene(scene);
                  setPortableJson(json);
                  downloadJson('world-building-scene.json', json);
                }}
              >
                Export scene JSON
              </button>
              <button onClick={importScene}>Import scene JSON</button>
              <button
                onClick={() => {
                  const json = stringifyLibrary(library);
                  setPortableJson(json);
                  downloadJson('world-building-library.json', json);
                }}
              >
                Export library JSON
              </button>
              <button onClick={importLibrary}>Import library JSON</button>
            </div>
          </details>
          <output data-testid="library-json" hidden>
            {JSON.stringify(library)}
          </output>
        </aside>
      </div>
    </section>
  );
}
