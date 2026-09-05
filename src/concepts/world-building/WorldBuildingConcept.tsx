import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  WORLD_BUILDING_CATALOG,
  WORLD_BUILDING_CATALOG_BY_REF,
} from './catalog';
import {
  addProp,
  createEmptyScene,
  createHistory,
  defaultId,
  deleteSelection,
  duplicateSelection,
  groupSelection,
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
  validateLibrary,
  validateScene,
} from './serialization';
import type {
  ArrangementLibrary,
  IdFactory,
  KeyValueStorage,
  SceneHistory,
  WorldScene,
} from './types';
import './worldBuilding.css';
import {
  writeWorldBuildingDragPayload,
  type WorldBuildingDragPayload,
} from './worldBuildingDrag';
import type { WorldBuildingTool } from './WorldBuildingInteraction';
import type { WorldBuildingDropTarget } from './worldBuildingPointer';
import { WorldBuildingViewport } from './WorldBuildingViewport';

interface WorldBuildingConceptProps {
  storage?: KeyValueStorage;
  idFactory?: IdFactory;
  now?: () => string;
}

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
  const [tool, setTool] = useState<WorldBuildingTool>('select');
  const [activeDrag, setActiveDrag] = useState<WorldBuildingDragPayload | null>(
    null
  );
  const [previewScene, setPreviewScene] = useState<WorldScene | null>(null);
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
      try {
        const valid = validateScene(next);
        setHistory((current) => updateHistory(current, valid));
        setPreviewScene(null);
        setSelectedIds(selection);
        setNotice('');
      } catch (error) {
        setNotice(
          `Edit rejected; the open scene was kept. ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    },
    [selectedIds]
  );

  const dropIntoScene = useCallback(
    (payload: WorldBuildingDragPayload, target: WorldBuildingDropTarget) => {
      if (payload.kind === 'prop') {
        if (!WORLD_BUILDING_CATALOG_BY_REF.has(payload.id)) {
          setNotice(
            'Drop rejected; that asset is not in the local prop catalog.'
          );
          return;
        }
        try {
          const id = idFactory();
          const transform =
            target.kind === 'surface'
              ? { ...target.point, rotationY: 0 }
              : { ...target.point, y: 0, rotationY: 0 };
          commit(
            addProp(
              scene,
              payload.id,
              transform,
              id,
              target.kind === 'surface'
                ? { supportId: target.supportId }
                : undefined
            ),
            [id]
          );
          setTool('move');
        } catch (error) {
          setNotice(error instanceof Error ? error.message : String(error));
        }
        return;
      }

      if (target.kind !== 'ground') {
        setNotice('Arrangements can be stamped on the ground only.');
        return;
      }
      const arrangement = library.arrangements.find(
        (entry) => entry.id === payload.id
      );
      if (!arrangement) {
        setNotice('Drop rejected; that arrangement is not in this library.');
        return;
      }
      try {
        const stamped = stampArrangement(
          scene,
          arrangement,
          target.point,
          idFactory
        );
        commit(stamped.scene, stamped.createdIds);
        setTool('move');
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error));
      }
    },
    [commit, idFactory, library.arrangements, scene]
  );

  const selectInScene = useCallback((ids: string[]) => {
    setPreviewScene(null);
    setSelectedIds(ids);
  }, []);

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
    setPreviewScene(null);
    setHistory((current) => undoHistory(current));
    setSelectedIds([]);
    setNotice('');
  }, []);
  const redo = useCallback(() => {
    setPreviewScene(null);
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
      } else if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        event.key.toLowerCase() === 'r'
      ) {
        event.preventDefault();
        applyToSelection((current) =>
          rotateSelection(current, selectedIds, Math.PI / 12)
        );
      } else if (event.key === 'Escape') {
        setPreviewScene(null);
        setActiveDrag(null);
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
      setLibrary(
        validateLibrary({
          ...library,
          arrangements: [...library.arrangements, arrangement],
        })
      );
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
    setPreviewScene(null);
    setSelectedIds([]);
    setTool('select');
    setActiveDrag(null);
    setNotice('');
    setSaveStatus('Reopened local scene and library');
  };

  const loadedCount = scene.items.filter(
    (item) => assetStates[item.id] === 'loaded'
  ).length;
  const failedCount = scene.items.filter(
    (item) => assetStates[item.id] === 'error'
  ).length;

  return (
    <section
      className="wb-shell"
      aria-label="World Building Concept"
      data-transform-preview={previewScene ? 'active' : 'idle'}
    >
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
                  setTool('select');
                  setActiveDrag(null);
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
            Drag an asset onto the ground or an upward-facing loaded tabletop.
            Clicking a card never arms placement.
          </p>
          <div className="wb-palette-list">
            {filteredCatalog.map((entry) => {
              const payload: WorldBuildingDragPayload = {
                kind: 'prop',
                id: entry.ref,
              };
              return (
                <article
                  key={entry.ref}
                  className="wb-palette-entry"
                  draggable
                  aria-label={`Drag ${entry.label} into scene`}
                  onDragStart={(event) => {
                    writeWorldBuildingDragPayload(event.dataTransfer, payload);
                    setActiveDrag(payload);
                  }}
                  onDragEnd={() => setActiveDrag(null)}
                >
                  {entry.thumbnail ? (
                    <img src={entry.thumbnail} alt="" draggable={false} />
                  ) : (
                    <span className="wb-swatch">{entry.label.slice(0, 2)}</span>
                  )}
                  <span>
                    <strong>{entry.label}</strong>
                    <small>
                      Drag to add · {entry.role}
                      {entry.supportsDecoration ? ' · surface' : ''}
                    </small>
                  </span>
                </article>
              );
            })}
          </div>
        </aside>

        <main className="wb-stage">
          <div className="wb-tool-strip">
            <div
              className="wb-tools"
              role="toolbar"
              aria-label="Manipulation tools"
            >
              {(['select', 'move', 'rotate'] as const).map((entry) => (
                <button
                  key={entry}
                  className={tool === entry ? 'wb-tool wb-active' : 'wb-tool'}
                  aria-pressed={tool === entry}
                  onClick={() => {
                    setPreviewScene(null);
                    setTool(entry);
                  }}
                >
                  {entry[0]!.toUpperCase() + entry.slice(1)}
                </button>
              ))}
            </div>
            <span data-testid="interaction-status">
              {tool === 'select'
                ? 'Left: select · Shift-left: add selection'
                : tool === 'move'
                  ? 'Drag arrows or planes · Esc/right-click: cancel'
                  : 'Drag the Y ring · Esc/right-click: cancel'}
            </span>
          </div>
          <div className="wb-stage-bar">
            <span>
              Drag palette assets into the scene · Middle: orbit · Shift-middle:
              pan · Wheel: zoom
            </span>
            <span data-testid="asset-load-status">
              Real models loaded {loadedCount}/{scene.items.length}
              {failedCount > 0 ? ` · ${failedCount} failed` : ''}
            </span>
          </div>
          <div className="wb-canvas-wrap">
            <WorldBuildingViewport
              scene={scene}
              previewScene={previewScene}
              selectedIds={selectedIds}
              tool={tool}
              activeDrag={activeDrag}
              onSelect={selectInScene}
              onDrop={dropIntoScene}
              onDragFinished={() => setActiveDrag(null)}
              onTransformPreview={setPreviewScene}
              onTransformCommit={(next) => commit(next)}
              onTransformReject={(message) => {
                setPreviewScene(null);
                setNotice(message);
              }}
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
                    selectInScene(
                      selectedIds.includes(group.id)
                        ? selectedIds.filter((id) => id !== group.id)
                        : [...selectedIds, group.id]
                    )
                  }
                />
                <span>▾ {group.label}</span>
              </label>
            ))}
            <div className="wb-tree">
              {scene.items.length === 0 && (
                <p>Blank scene — drag an asset onto the canvas.</p>
              )}
              {scene.items.map((item) => (
                <label className="wb-tree-row" key={item.id}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${item.label} ${item.id}`}
                    checked={selectedIds.includes(item.id)}
                    onChange={() =>
                      selectInScene(
                        selectedIds.includes(item.id)
                          ? selectedIds.filter((id) => id !== item.id)
                          : [...selectedIds, item.id]
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
              {library.arrangements.map((arrangement) => {
                const payload: WorldBuildingDragPayload = {
                  kind: 'arrangement',
                  id: arrangement.id,
                };
                return (
                  <article
                    key={arrangement.id}
                    draggable
                    aria-label={`Drag ${arrangement.name} arrangement onto ground`}
                    onDragStart={(event) => {
                      writeWorldBuildingDragPayload(
                        event.dataTransfer,
                        payload
                      );
                      setActiveDrag(payload);
                    }}
                    onDragEnd={() => setActiveDrag(null)}
                  >
                    <strong>{arrangement.name}</strong>
                    <small>
                      {arrangement.items.length} editable props · drag to ground
                      for an independent copy
                    </small>
                  </article>
                );
              })}
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
