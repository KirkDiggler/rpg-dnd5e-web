import { PALETTE_MONSTERS, paletteNameForRef } from '@/author/paletteData';
import { useSerialThumbnailQueue } from '@/author/useSerialThumbnailQueue';
import { compositionMetadata } from '@/compositions/compositionMetadata';
import {
  compositionErrorMessage,
  useCompositionList,
  type CompositionSource,
} from '@/compositions/compositionSource';
import {
  encodeRoomDocument,
  isRoomDocument,
} from '@/compositions/roomDocument';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  WORLD_BUILDING_CATALOG,
  WORLD_BUILDING_CATALOG_BY_REF,
  type GeneratedWorldBuildingCatalogEntry,
} from './catalog';
import { addRepeatedProps } from './repeatPlacement';
import {
  clearRoomPartyStart,
  createRoomDraft,
  expandRoomWorkspace,
  loadRoomDraft,
  moveRoomMonster,
  parseRoomDraftJson,
  placeRoomMonster,
  reconcileRoomDraft,
  remapRoomDeclarations,
  removeRoomMonster,
  ROOM_WORKSPACE_STEPS,
  saveRoomDraft,
  setRoomPartyStart,
  stringifyRoomDraft,
  updateWalkableHexes,
  type RoomDraft,
  type RoomGameplayData,
  type RoomHexCell,
  type RoomPropDeclaration,
  type RoomWorkspace,
} from './roomDraft';
import { RoomPublishingPanel } from './RoomPublishingPanel';
import {
  addProp,
  createEmptyScene,
  createHistory,
  defaultId,
  deleteSelection,
  duplicateSelection,
  groupSelection,
  heightSelectionPropIds,
  redoHistory,
  rotateSelection,
  saveArrangement,
  setPropPointLight,
  setSelectionHeight,
  stampArrangement,
  undoHistory,
  ungroup,
  updateHistory,
} from './sceneState';
import {
  loadLibrary,
  loadScene,
  MAX_ITEMS,
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
  WorldPointLight,
  WorldScene,
} from './types';
import type { RoomPublishingCapability } from './useRoomPublishing';
import { worldAssetThumbnailKey } from './worldAssetThumbnailKey';
import { WorldAssetThumbnailRenderer } from './WorldAssetThumbnailRenderer';
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
  compositionSource?: CompositionSource;
  onCompositionDeleted?: () => void;
  onBack?: () => void;
  /** Dedicated local authoring-draft mode; never writes world compositions. */
  roomMode?: boolean;
  /** Publishing capability injected by the World Builder route ONLY:
   * the same selected character and App.handlePlayAuthored the legacy
   * AuthorView receives. Absent in prop-composition mode and in every
   * local-only concept mount, so those render no publishing controls
   * and make no authoring RPC. */
  roomPublishing?: RoomPublishingCapability;
  /** Lifts the publishing transaction boundary: while busy, the route
   * refuses Back and mode switching. */
  onPublishBusyChange?: (busy: boolean) => void;
}

const DEFAULT_POINT_LIGHT: WorldPointLight = {
  enabled: true,
  offset: { x: 0, y: 0.5, z: 0 },
  color: '#ff9d52',
  intensity: 1.1,
  range: 2.6,
};

const GENERATED_THUMBNAIL_QUEUE = WORLD_BUILDING_CATALOG.filter(
  (entry): entry is GeneratedWorldBuildingCatalogEntry =>
    entry.source === 'generated'
).map((entry) => ({
  entry,
  key: worldAssetThumbnailKey(entry.asset),
}));

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
  compositionSource,
  onCompositionDeleted,
  onBack,
  roomMode = false,
  roomPublishing,
  onPublishBusyChange,
}: WorldBuildingConceptProps) {
  const effectiveStorage = storage ?? browserStorage;
  const [initial] = useState(() => bootstrap(effectiveStorage, idFactory));
  const [history, setHistory] = useState<SceneHistory>(initial.history);
  const [initialRoom] = useState(() => {
    if (!roomMode)
      return {
        value: createRoomDraft(initial.history.present, 'inactive-room'),
      };
    const fallback = createRoomDraft(
      createEmptyScene(idFactory()),
      idFactory()
    );
    return loadRoomDraft(effectiveStorage, fallback);
  });
  const [roomHistory, setRoomHistory] = useState<{
    past: RoomDraft[];
    present: RoomDraft;
    future: RoomDraft[];
  }>(() => ({ past: [], present: initialRoom.value, future: [] }));
  const [library, setLibrary] = useState<ArrangementLibrary>(initial.library);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tool, setTool] = useState<WorldBuildingTool>('select');
  const [roomTool, setRoomTool] = useState<
    | 'select'
    | 'move'
    | 'rotate'
    | 'paint'
    | 'erase'
    | 'rectangle'
    | 'repeat'
    | 'monster'
    | 'start'
  >('paint');
  const [repeatAssetRef, setRepeatAssetRef] = useState<string | null>(null);
  /** Room-only actor authoring state. Distinct from the scene's selectedIds:
   * a selected actor is a monster id or 'start', never a WorldProp id, and
   * actor operations never touch scenery selections. */
  const [armedMonsterRef, setArmedMonsterRef] = useState<string | null>(null);
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);
  const [activeDrag, setActiveDrag] = useState<WorldBuildingDragPayload | null>(
    null
  );
  const [previewScene, setPreviewScene] = useState<WorldScene | null>(null);
  const [search, setSearch] = useState('');
  const [arrangementName, setArrangementName] = useState('New arrangement');
  const [portableJson, setPortableJson] = useState('');
  const [footprintPreview, setFootprintPreview] =
    useState<RoomPropDeclaration | null>(null);
  const [notice, setNotice] = useState(
    [initial.error, initialRoom.error].filter(Boolean).join(' ')
  );
  const roomAutosaveBlockedRef = useRef(Boolean(initialRoom.error));
  const [saveStatus, setSaveStatus] = useState(
    roomMode && initialRoom.error
      ? 'Autosave paused — Save room draft or New room to replace unreadable data'
      : 'Local draft ready'
  );
  const [workspaceOrigin, setWorkspaceOrigin] = useState<'local' | 'world'>(
    'local'
  );
  const [confirmBlank, setConfirmBlank] = useState(false);
  const [compositionRefresh, setCompositionRefresh] = useState(0);
  const [worldBusy, setWorldBusy] = useState(false);
  const [lastWorldSave, setLastWorldSave] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [assetStates, setAssetStates] = useState<
    Record<string, 'loaded' | 'error'>
  >({});
  const skippedInitialSceneSave = useRef(false);
  const skippedInitialLibrarySave = useRef(false);
  const workspaceOriginRef = useRef<'local' | 'world'>('local');
  const roomDraft = roomHistory.present;
  const scene = roomMode ? roomDraft.scene : history.present;
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const roomDraftRef = useRef(roomDraft);
  roomDraftRef.current = roomDraft;
  const sourceRef = useRef(compositionSource);
  sourceRef.current = compositionSource;
  const openGenerationRef = useRef(0);
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  /** Publishing transaction boundary (plan §1): while a Save & Play (or
   * plain server save) mutates server state, the editor refuses every
   * source-changing path — commit, undo/redo, imports, new room, world
   * snapshot operations, keyboard shortcuts and canvas gestures. Disabled
   * buttons alone would not stop the canvas/keyboard handlers, so the
   * guard lives at the actual mutation seams, backed by a ref for
   * synchronous correctness. Background server validation never sets
   * this boundary and never freezes editing. */
  const publishBusyRef = useRef(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const handlePublishBusy = useCallback(
    (busy: boolean) => {
      publishBusyRef.current = busy;
      setPublishBusy(busy);
      // When the transaction releases the editor, a lingering lock notice
      // would describe a boundary that no longer exists.
      if (!busy) {
        setNotice((current) =>
          current.startsWith('Save & Play is running') ? '' : current
        );
      }
      onPublishBusyChange?.(busy);
    },
    [onPublishBusyChange]
  );
  const refuseWhilePublishing = useCallback(() => {
    if (!publishBusyRef.current) return false;
    setNotice(
      'Save & Play is running — the room is locked until the transaction finishes.'
    );
    return true;
  }, []);
  useEffect(() => {
    // A replaced composition source retires any busy latch this instance still
    // holds for the previous source. Any pending Get started against the old
    // source is fenced off below and can no longer touch storage or state.
    setWorldBusy(false);
  }, [compositionSource]);
  const [sceneNameDraft, setSceneNameDraft] = useState(scene.name);
  const compositionList = useCompositionList(
    compositionSource,
    compositionRefresh
  );
  const visibleCompositions = useMemo(
    () =>
      compositionList.compositions.filter((composition) =>
        roomMode ? isRoomDocument(composition) : !isRoomDocument(composition)
      ),
    [compositionList.compositions, roomMode]
  );
  const generatedThumbnails = useSerialThumbnailQueue(
    GENERATED_THUMBNAIL_QUEUE
  );

  useEffect(() => {
    setSceneNameDraft(scene.name);
  }, [scene.name]);

  useEffect(() => {
    if (!compositionSource?.writer) setDeleteCandidate(null);
  }, [compositionSource?.writer]);

  useEffect(() => {
    if (roomMode) return;
    if (!skippedInitialSceneSave.current) {
      skippedInitialSceneSave.current = true;
      return;
    }
    if (workspaceOrigin === 'world') return;
    const result = saveSceneToStorage(effectiveStorage, scene);
    if (result.error) {
      setNotice(result.error);
      setSaveStatus('Save failed — scene kept in memory');
    } else {
      setSaveStatus('Saved locally');
    }
  }, [effectiveStorage, roomMode, scene, workspaceOrigin]);

  useEffect(() => {
    if (!roomMode) return;
    if (workspaceOrigin === 'world') {
      setSaveStatus(
        'World snapshot open — not saved locally; local draft preserved'
      );
      return;
    }
    if (roomAutosaveBlockedRef.current) {
      setSaveStatus(
        'Autosave paused — Save room draft or New room to replace unreadable data'
      );
      return;
    }
    const error = saveRoomDraft(effectiveStorage, roomDraft);
    setSaveStatus(
      error
        ? 'Room save failed — draft kept in memory'
        : 'Room authoring draft saved locally'
    );
    if (error) setNotice(error);
  }, [effectiveStorage, roomDraft, roomMode, workspaceOrigin]);

  useEffect(() => {
    if (!skippedInitialLibrarySave.current) {
      skippedInitialLibrarySave.current = true;
      return;
    }
    const result = saveLibraryToStorage(effectiveStorage, library);
    if (result.error) setNotice(result.error);
  }, [effectiveStorage, library]);

  const commit = useCallback(
    (
      next: WorldScene,
      selection = selectedIds,
      nextRoom: RoomGameplayData = roomDraft.room,
      nextWorkspace: RoomWorkspace = roomDraft.workspace,
      /** Room mode's EXPLICIT rename sets the published draft name in the
       * same one-transaction commit; every other path keeps the draft's
       * name (reconcileRoomDraft retains it), so imported names are never
       * normalized by unrelated edits. */
      nextName?: string
    ) => {
      if (refuseWhilePublishing()) return;
      try {
        const valid = validateScene(next, {
          horizontalLimit: roomMode ? nextWorkspace.horizontalLimit : undefined,
        });
        if (roomMode) {
          const nextDraft = reconcileRoomDraft(
            nextName === undefined
              ? { ...roomDraft, room: nextRoom, workspace: nextWorkspace }
              : {
                  ...roomDraft,
                  name: nextName,
                  room: nextRoom,
                  workspace: nextWorkspace,
                },
            valid
          );
          if (JSON.stringify(nextDraft) === JSON.stringify(roomDraft)) return;
          setRoomHistory((current) => {
            if (JSON.stringify(nextDraft) === JSON.stringify(current.present))
              return current;
            return {
              past: [
                ...current.past.slice(-79),
                structuredClone(current.present),
              ],
              present: structuredClone(nextDraft),
              future: [],
            };
          });
        } else {
          setHistory((current) => updateHistory(current, valid));
        }
        setPreviewScene(null);
        setSelectedIds(selection);
        setSaveStatus(
          workspaceOriginRef.current === 'local'
            ? 'Saving local draft…'
            : 'World workspace changes are not saved locally'
        );
        setNotice('');
      } catch (error) {
        setNotice(
          `Edit rejected; the open scene was kept. ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    },
    [refuseWhilePublishing, roomDraft, roomMode, selectedIds]
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
          if (roomMode) setRoomTool('move');
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
        const templateDeclarations =
          roomDraft.room.arrangementDeclarations[arrangement.id] ?? {};
        const stampedDeclarations = Object.fromEntries(
          [...stamped.idMap].flatMap(([sourceId, targetId]) => {
            const declaration = templateDeclarations[sourceId];
            return declaration
              ? [[targetId, structuredClone(declaration)] as const]
              : [];
          })
        );
        commit(
          stamped.scene,
          stamped.createdIds,
          roomMode
            ? {
                ...roomDraft.room,
                propDeclarations: {
                  ...roomDraft.room.propDeclarations,
                  ...stampedDeclarations,
                },
              }
            : roomDraft.room
        );
        setTool('move');
        if (roomMode) setRoomTool('move');
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error));
      }
    },
    [commit, idFactory, library.arrangements, roomDraft.room, roomMode, scene]
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

  /** Room-only actor authoring. Every actor mutation is one whole-room
   * history transaction through the existing commit; a structurally valid
   * cell is never refused as game-illegal, and an out-of-workspace snap is
   * rejected non-destructively with a visible notice. */
  const placeMonsterAt = (cell: RoomHexCell) => {
    if (!armedMonsterRef) {
      setNotice('Choose a monster to place first.');
      return;
    }
    try {
      const id = idFactory();
      const next = placeRoomMonster(roomDraft, {
        id,
        ref: armedMonsterRef,
        cell: { ...cell },
      });
      commit(scene, selectedIds, next.room);
      setSelectedActorId(id);
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const moveMonsterTo = (id: string, cell: RoomHexCell) => {
    try {
      const next = moveRoomMonster(roomDraft, id, cell);
      if (next === roomDraft) return;
      commit(scene, selectedIds, next.room);
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  /** The party start gesture places or moves: presence means an actual
   * authored cell, never an invented origin. */
  const startGestureAt = (cell: RoomHexCell) => {
    try {
      const next = setRoomPartyStart(roomDraft, cell);
      if (next === roomDraft) return;
      commit(scene, selectedIds, next.room);
      setSelectedActorId('start');
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const removeActor = useCallback(
    (actor: string) => {
      const next =
        actor === 'start'
          ? clearRoomPartyStart(roomDraft)
          : removeRoomMonster(roomDraft, actor);
      if (next === roomDraft) return;
      commit(scene, selectedIds, next.room);
      setSelectedActorId((current) => (current === actor ? null : current));
      setNotice('');
    },
    [commit, roomDraft, scene, selectedIds]
  );

  const clearPartyStart = () => {
    const next = clearRoomPartyStart(roomDraft);
    if (next === roomDraft) return;
    commit(scene, selectedIds, next.room);
    setSelectedActorId((current) => (current === 'start' ? null : current));
    setNotice('');
  };

  const armMonsterPlacement = (ref: string) => {
    setPreviewScene(null);
    setArmedMonsterRef(ref);
    setSelectedActorId(null);
    setRepeatAssetRef(null);
    setRoomTool('monster');
    setNotice('');
  };

  const armStartPlacement = () => {
    setPreviewScene(null);
    setSelectedActorId(null);
    setRepeatAssetRef(null);
    setRoomTool('start');
    setNotice('');
  };

  const duplicate = useCallback(() => {
    if (selectedIds.length === 0) {
      setNotice('Select at least one object first.');
      return;
    }
    try {
      const result = duplicateSelection(scene, selectedIds, idFactory);
      const copied = remapRoomDeclarations(roomDraft.room, result.idMap);
      commit(result.scene, result.createdIds, {
        ...roomDraft.room,
        propDeclarations: {
          ...roomDraft.room.propDeclarations,
          ...copied.propDeclarations,
        },
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }, [commit, idFactory, roomDraft.room, scene, selectedIds]);

  const remove = useCallback(() => {
    if (selectedIds.length === 0) return;
    commit(deleteSelection(scene, selectedIds), []);
  }, [commit, scene, selectedIds]);

  const undo = useCallback(() => {
    if (refuseWhilePublishing()) return;
    setPreviewScene(null);
    if (roomMode) {
      setRoomHistory((current) =>
        current.past.length === 0
          ? current
          : {
              past: current.past.slice(0, -1),
              present: structuredClone(current.past[current.past.length - 1]!),
              future: [structuredClone(current.present), ...current.future],
            }
      );
    } else setHistory((current) => undoHistory(current));
    setSelectedIds([]);
    setNotice('');
  }, [refuseWhilePublishing, roomMode]);
  const redo = useCallback(() => {
    if (refuseWhilePublishing()) return;
    setPreviewScene(null);
    if (roomMode) {
      setRoomHistory((current) =>
        current.future.length === 0
          ? current
          : {
              past: [...current.past, structuredClone(current.present)],
              present: structuredClone(current.future[0]!),
              future: current.future.slice(1),
            }
      );
    } else setHistory((current) => redoHistory(current));
    setSelectedIds([]);
    setNotice('');
  }, [refuseWhilePublishing, roomMode]);

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
        if (roomMode && selectedActorId) removeActor(selectedActorId);
        else remove();
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
        if (roomMode) setSelectedActorId(null);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [
    applyToSelection,
    duplicate,
    redo,
    remove,
    removeActor,
    roomMode,
    selectedActorId,
    selectedIds,
    undo,
  ]);

  const repeatDescriptor = useMemo(() => {
    if (!roomMode || !repeatAssetRef) return undefined;
    const entry = WORLD_BUILDING_CATALOG_BY_REF.get(repeatAssetRef);
    if (entry?.source !== 'generated') return undefined;
    const width = entry.asset.boundsMeters[0];
    const maxCount = MAX_ITEMS - scene.items.length;
    if (!Number.isFinite(width) || width <= 0 || maxCount < 1) return undefined;
    return {
      assetRef: entry.ref,
      step: width,
      originOffset: width / 2,
      maxCount,
    };
  }, [repeatAssetRef, roomMode, scene.items.length]);

  const filteredCatalog = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle
      ? WORLD_BUILDING_CATALOG.filter((entry) =>
          `${entry.label} ${entry.ref} ${
            entry.source === 'legacy'
              ? entry.role
              : `${entry.category} ${entry.asset.tags.join(' ')}`
          }`
            .toLowerCase()
            .includes(needle)
        )
      : WORLD_BUILDING_CATALOG;
  }, [search]);

  const saveNow = () => {
    if (refuseWhilePublishing()) return;
    if (roomMode) {
      const error = saveRoomDraft(effectiveStorage, roomDraft);
      if (!error) {
        roomAutosaveBlockedRef.current = false;
        workspaceOriginRef.current = 'local';
        setWorkspaceOrigin('local');
      }
      setNotice(error ?? '');
      setSaveStatus(
        error
          ? 'Room save failed — good in-memory draft kept'
          : 'Room authoring draft saved locally now'
      );
      return;
    }
    const sceneResult = saveSceneToStorage(effectiveStorage, scene);
    const libraryResult = saveLibraryToStorage(effectiveStorage, library);
    const error = sceneResult.error ?? libraryResult.error;
    setNotice(error ?? '');
    if (!sceneResult.error) {
      workspaceOriginRef.current = 'local';
      setWorkspaceOrigin('local');
    }
    setSaveStatus(
      sceneResult.error
        ? 'Save failed — good in-memory data kept'
        : libraryResult.error
          ? 'Scene saved locally — library save failed'
          : 'Saved locally now'
    );
  };

  const saveSelectedArrangement = () => {
    if (refuseWhilePublishing()) return;
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
      if (roomMode) {
        const declarations = Object.fromEntries(
          arrangement.items.flatMap((item) => {
            const declaration = roomDraft.room.propDeclarations[item.id];
            return declaration
              ? [[item.id, structuredClone(declaration)] as const]
              : [];
          })
        );
        commit(scene, selectedIds, {
          ...roomDraft.room,
          arrangementDeclarations: {
            ...roomDraft.room.arrangementDeclarations,
            [arrangement.id]: declarations,
          },
        });
      }
      setArrangementName('New arrangement');
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const importScene = () => {
    if (refuseWhilePublishing()) return;
    try {
      if (roomMode) {
        const imported = parseRoomDraftJson(portableJson);
        const saveError = saveRoomDraft(effectiveStorage, imported);
        if (!saveError) {
          roomAutosaveBlockedRef.current = false;
          workspaceOriginRef.current = 'local';
          setWorkspaceOrigin('local');
        }
        setRoomHistory((current) => ({
          past: [...current.past.slice(-79), structuredClone(current.present)],
          present: imported,
          future: [],
        }));
        setSelectedIds([]);
        setNotice(saveError ?? '');
        setSaveStatus(
          saveError
            ? 'Room import kept in memory — local save failed'
            : 'Imported room draft saved locally'
        );
        return;
      }
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
    if (refuseWhilePublishing()) return;
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

  /** Canonical single-room YAML import (publishing panel): replaces the
   * room document exactly like a room-JSON import and reports acceptance
   * so the panel adopts the file's root key only when the editor truly
   * took the document. Refused while a publishing transaction runs. */
  const importCanonicalRoomYaml = useCallback(
    (imported: RoomDraft): boolean => {
      if (refuseWhilePublishing()) return false;
      try {
        const saveError = saveRoomDraft(effectiveStorage, imported);
        if (!saveError) {
          roomAutosaveBlockedRef.current = false;
          workspaceOriginRef.current = 'local';
          setWorkspaceOrigin('local');
        }
        setRoomHistory((current) => ({
          past: [...current.past.slice(-79), structuredClone(current.present)],
          present: imported,
          future: [],
        }));
        setSelectedIds([]);
        setPreviewScene(null);
        setTool('select');
        setRoomTool('select');
        setActiveDrag(null);
        setNotice(saveError ?? '');
        setSaveStatus(
          saveError
            ? 'Imported canonical YAML kept in memory — local save failed'
            : 'Imported canonical single-room YAML'
        );
        return true;
      } catch (error) {
        setNotice(
          `Canonical YAML import rejected; the open room was kept. ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return false;
      }
    },
    [effectiveStorage, refuseWhilePublishing]
  );

  const reopen = () => {
    if (refuseWhilePublishing()) return;
    if (roomMode) {
      const result = loadRoomDraft(effectiveStorage, roomDraft);
      if (result.error) {
        setNotice(result.error);
        return;
      }
      roomAutosaveBlockedRef.current = false;
      workspaceOriginRef.current = 'local';
      setWorkspaceOrigin('local');
      setRoomHistory({ past: [], present: result.value, future: [] });
      setPreviewScene(null);
      setSelectedIds([]);
      setTool('select');
      setRoomTool('select');
      setActiveDrag(null);
      setNotice('');
      setSaveStatus('Reopened local room authoring draft');
      return;
    }
    const sceneResult = loadScene(effectiveStorage, scene);
    const libraryResult = loadLibrary(effectiveStorage, library);
    const error = sceneResult.error ?? libraryResult.error;
    if (error) {
      setNotice(error);
      return;
    }
    workspaceOriginRef.current = 'local';
    setWorkspaceOrigin('local');
    setHistory(createHistory(sceneResult.value));
    setLibrary(libraryResult.value);
    setPreviewScene(null);
    setSelectedIds([]);
    setTool('select');
    setActiveDrag(null);
    setNotice('');
    setSaveStatus('Reopened local scene and library');
  };

  const saveCompositionToWorld = async () => {
    if (!compositionSource?.writer || worldBusy) return;
    if (refuseWhilePublishing()) return;
    setWorldBusy(true);
    setNotice('');
    try {
      const saved = await compositionSource.writer.createComposition(
        compositionSource.worldId,
        roomMode ? encodeRoomDocument(roomDraft) : stringifyScene(scene)
      );
      setLastWorldSave(saved.id);
      setCompositionRefresh((current) => current + 1);
      setNotice(
        `Saved “${scene.name}” as a new immutable world composition (${saved.id}).`
      );
    } catch (error) {
      setNotice(
        `World save failed; the open scene and local draft were kept. ${compositionErrorMessage(error)}`
      );
    } finally {
      setWorldBusy(false);
    }
  };

  const deleteComposition = async (id: string, label: string) => {
    if (!compositionSource?.writer || worldBusy) return;
    if (refuseWhilePublishing()) return;
    setWorldBusy(true);
    setNotice('');
    try {
      await compositionSource.writer.deleteComposition(
        compositionSource.worldId,
        id
      );
      setDeleteCandidate(null);
      setCompositionRefresh((current) => current + 1);
      onCompositionDeleted?.();
      setNotice(
        `Permanently deleted “${label}”. Existing dungeon placements were not changed; remove them explicitly from each dungeon.`
      );
    } catch (error) {
      setNotice(
        `Delete failed; “${label}” and all existing data were kept. ${compositionErrorMessage(error)}`
      );
    } finally {
      setWorldBusy(false);
    }
  };

  const openComposition = async (id: string) => {
    if (!compositionSource || worldBusy) return;
    if (refuseWhilePublishing()) return;
    const source = compositionSource;
    const generation = ++openGenerationRef.current;
    /** A deferred Get can resolve after this instance unmounts or after its
     * composition source was replaced. Fence every post-await storage write
     * and state effect with mounted lifetime, the captured source, and the
     * latest open request BEFORE touching anything — the protected local-byte
     * save below runs outside React, so React cannot ignore it. */
    const isCurrentOpen = () =>
      mountedRef.current &&
      sourceRef.current === source &&
      openGenerationRef.current === generation;
    setWorldBusy(true);
    setNotice('');
    try {
      const composition = await source.reader.getComposition(
        source.worldId,
        id
      );
      if (!isCurrentOpen()) return;
      if (!composition) {
        setNotice(`Composition ${id} is no longer available in this world.`);
        return;
      }
      const metadata = compositionMetadata(composition);
      const expectedKind = roomMode
        ? metadata.status === 'room'
        : metadata.status === 'ready';
      if (!expectedKind || metadata.status === 'error') {
        const message =
          metadata.status === 'error'
            ? metadata.message
            : 'document kind does not match this editor';
        setNotice(
          `Composition ${id} could not be opened; the current data was kept. ${message}`
        );
        return;
      }
      if (roomMode && roomAutosaveBlockedRef.current) {
        setNotice(
          'Room snapshot was not opened; resolve or export the protected local draft before opening a world snapshot.'
        );
        return;
      }
      if (workspaceOriginRef.current === 'local') {
        const localError = roomMode
          ? saveRoomDraft(effectiveStorage, roomDraftRef.current)
          : saveSceneToStorage(effectiveStorage, sceneRef.current).error;
        if (localError) {
          setSaveStatus('Save failed — current data kept in memory');
          setNotice(
            `Composition ${id} was not opened because the latest local draft could not be preserved. ${localError}`
          );
          return;
        }
      }
      workspaceOriginRef.current = 'world';
      setWorkspaceOrigin('world');
      if (roomMode) {
        if (metadata.status !== 'room')
          throw new Error('This snapshot is not a room authoring document.');
        setRoomHistory({
          past: [],
          present: structuredClone(metadata.draft),
          future: [],
        });
      } else {
        if (metadata.status !== 'ready')
          throw new Error('This snapshot is not a world scene.');
        commit(metadata.scene, []);
      }
      setTool('select');
      setActiveDrag(null);
      setLastWorldSave(composition.id);
      setSaveStatus(
        'World snapshot open — not saved locally; local draft preserved'
      );
      setNotice(`Opened “${metadata.name}” from the world library.`);
    } catch (error) {
      if (!isCurrentOpen()) return;
      setNotice(
        `Composition ${id} could not be opened; the current scene was kept. ${compositionErrorMessage(error)}`
      );
    } finally {
      // Retire the latch only while this exact request is still the current
      // one of a live, same-source instance; a superseded or unmounted
      // continuation leaves the replacement request's latch alone.
      if (isCurrentOpen()) setWorldBusy(false);
    }
  };

  const loadedCount = scene.items.filter(
    (item) => assetStates[item.id] === 'loaded'
  ).length;
  const failedCount = scene.items.filter(
    (item) => assetStates[item.id] === 'error'
  ).length;
  const selectedProp =
    selectedIds.length === 1
      ? scene.items.find((item) => item.id === selectedIds[0])
      : undefined;
  const updateSelectedLight = (
    update: (current: WorldPointLight) => WorldPointLight
  ) => {
    if (!selectedProp?.pointLight) return;
    commit(
      setPropPointLight(
        scene,
        selectedProp.id,
        update(structuredClone(selectedProp.pointLight))
      )
    );
  };
  const selectedDeclaration = selectedProp
    ? roomDraft.room.propDeclarations[selectedProp.id]
    : undefined;
  const selectedHeightValues = [...heightSelectionPropIds(scene, selectedIds)]
    .map((id) => scene.items.find((item) => item.id === id)?.heightScale ?? 1)
    .filter((value): value is number => Number.isFinite(value));
  const selectedHeightMixed =
    selectedHeightValues.length > 1 && new Set(selectedHeightValues).size > 1;
  const selectedHeight = selectedHeightMixed
    ? 1
    : (selectedHeightValues[0] ?? 1);
  const [heightDraftPercent, setHeightDraftPercent] = useState(100);
  useEffect(() => {
    if (!selectedHeightMixed)
      setHeightDraftPercent(Math.round(selectedHeight * 100));
  }, [selectedHeight, selectedHeightMixed]);
  const defaultDeclaration: RoomPropDeclaration = {
    blocksMovement: false,
    blocksLineOfSight: false,
    footprint: { width: 1, depth: 1, offsetX: 0, offsetZ: 0 },
  };
  const commitSelectedDeclaration = (declaration: RoomPropDeclaration) => {
    if (!selectedProp) return;
    commit(scene, selectedIds, {
      ...roomDraft.room,
      propDeclarations: {
        ...roomDraft.room.propDeclarations,
        [selectedProp.id]: declaration,
      },
    });
    setFootprintPreview(null);
  };
  const numberFrom = (value: string): number =>
    value.trim() === '' ? Number.NaN : Number(value);

  return (
    <section
      className={`wb-shell ${compositionSource || roomMode ? 'wb-shell--world' : ''}`}
      aria-label={roomMode ? 'Room Authoring Draft' : 'World Building Concept'}
      data-transform-preview={previewScene ? 'active' : 'idle'}
      data-workspace-origin={workspaceOrigin}
    >
      <header className="wb-header">
        <div>
          <p className="wb-kicker">
            {roomMode
              ? 'Room authoring draft · walkable ground'
              : compositionSource
                ? `World library · ${compositionSource.worldId}`
                : 'Durable Concepts Lab · web#935'}
          </p>
          <h2>
            {roomMode
              ? 'World Builder'
              : compositionSource
                ? 'World Builder'
                : 'World Building'}
          </h2>
          <p>
            {roomMode
              ? roomPublishing
                ? 'Paint walkable hexes, place monsters and the party start. Validate, save and play through the authoring server.'
                : 'Paint walkable hexes, place monsters and the party start. Setup authoring is not engine-validated or playable yet.'
              : 'Compose freely in world space. Hexes are scale, not slots.'}
          </p>
        </div>
        <div className="wb-save-cluster">
          {onBack && <button onClick={onBack}>Back to main menu</button>}
          <span aria-live="polite">{saveStatus}</span>
          <button disabled={publishBusy} onClick={saveNow}>
            {roomMode ? 'Save room draft' : 'Save local draft'}
          </button>
          <button disabled={publishBusy} onClick={reopen}>
            {roomMode ? 'Reload room draft' : 'Reopen local draft'}
          </button>
          {compositionSource?.writer && (
            <button
              disabled={worldBusy || publishBusy}
              onClick={() => void saveCompositionToWorld()}
            >
              {worldBusy
                ? roomMode
                  ? 'Saving room snapshot…'
                  : 'Saving composition…'
                : roomMode
                  ? 'Save room snapshot to world'
                  : 'Save composition to world'}
            </button>
          )}
          {roomMode && (
            <button
              disabled={
                roomDraft.workspace.hexRadius ===
                ROOM_WORKSPACE_STEPS[ROOM_WORKSPACE_STEPS.length - 1].hexRadius
              }
              onClick={() => {
                const expanded = expandRoomWorkspace(roomDraft);
                if (expanded === roomDraft) return;
                commit(scene, selectedIds, roomDraft.room, expanded.workspace);
              }}
            >
              Expand workspace · radius {roomDraft.workspace.hexRadius} →{' '}
              {expandRoomWorkspace(roomDraft).workspace.hexRadius}
            </button>
          )}
          {!confirmBlank ? (
            <button
              disabled={publishBusy}
              onClick={() => setConfirmBlank(true)}
            >
              {roomMode ? 'New room' : 'New blank scene'}
            </button>
          ) : (
            <span className="wb-confirm">
              <button onClick={() => setConfirmBlank(false)}>
                Keep current
              </button>
              <button
                className="wb-danger"
                onClick={() => {
                  if (refuseWhilePublishing()) return;
                  const blank = createEmptyScene(idFactory());
                  const freshRoom = createRoomDraft(blank, idFactory());
                  const resetError = roomMode
                    ? saveRoomDraft(effectiveStorage, freshRoom)
                    : null;
                  if (roomMode && !resetError) {
                    roomAutosaveBlockedRef.current = false;
                    workspaceOriginRef.current = 'local';
                    setWorkspaceOrigin('local');
                  }
                  commit(
                    blank,
                    [],
                    roomMode ? freshRoom.room : roomDraft.room,
                    roomMode ? freshRoom.workspace : roomDraft.workspace
                  );
                  setTool('select');
                  setActiveDrag(null);
                  setConfirmBlank(false);
                  if (resetError) {
                    setNotice(resetError);
                    setSaveStatus(
                      'New room kept in memory — prior stored bytes preserved'
                    );
                  }
                }}
              >
                {roomMode ? 'Confirm new room' : 'Confirm blank scene'}
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
              const generatedThumbnail =
                entry.source === 'generated'
                  ? generatedThumbnails.results[
                      worldAssetThumbnailKey(entry.asset)
                    ]
                  : undefined;
              const thumbnail =
                entry.thumbnail ??
                (generatedThumbnail?.status === 'ready'
                  ? generatedThumbnail.image
                  : undefined);
              const thumbnailState =
                entry.source === 'legacy'
                  ? 'legacy'
                  : (generatedThumbnail?.status ?? 'loading');
              return (
                <article
                  key={entry.ref}
                  className="wb-palette-entry"
                  draggable
                  aria-label={`Drag ${entry.label} into scene`}
                  data-thumbnail-state={thumbnailState}
                  data-asset-ref={entry.ref}
                  onDragStart={(event) => {
                    writeWorldBuildingDragPayload(event.dataTransfer, payload);
                    setActiveDrag(payload);
                    if (roomMode) {
                      setRepeatAssetRef(null);
                      setRoomTool((current) =>
                        current === 'repeat' ? 'select' : current
                      );
                    }
                  }}
                  onDragEnd={() => setActiveDrag(null)}
                >
                  {thumbnail ? (
                    <img src={thumbnail} alt="" draggable={false} />
                  ) : (
                    <span className="wb-swatch">
                      {entry.label.slice(0, 2)}
                      {generatedThumbnail?.status === 'error' ? ' !' : ''}
                    </span>
                  )}
                  <span>
                    <strong>{entry.label}</strong>
                    <small>
                      Drag to add ·{' '}
                      {entry.source === 'legacy' ? entry.role : entry.category}
                      {entry.supportsDecoration ? ' · surface' : ''}
                    </small>
                    {roomMode && entry.source === 'generated' && (
                      <button
                        type="button"
                        className="wb-repeat-action"
                        aria-label={`Repeat ${entry.label}`}
                        disabled={MAX_ITEMS - scene.items.length < 1}
                        onClick={(event) => {
                          event.stopPropagation();
                          setPreviewScene(null);
                          setRepeatAssetRef(entry.ref);
                          setRoomTool('repeat');
                          setNotice('');
                        }}
                      >
                        Repeat
                      </button>
                    )}
                    {entry.source === 'generated' && (
                      <span className="sr-only">
                        {generatedThumbnail?.status === 'error'
                          ? `Thumbnail unavailable${generatedThumbnail.message ? `: ${generatedThumbnail.message}` : ''}`
                          : generatedThumbnail?.status === 'ready'
                            ? 'Thumbnail ready'
                            : 'Thumbnail loading'}
                      </span>
                    )}
                  </span>
                </article>
              );
            })}
          </div>
          {generatedThumbnails.active && (
            <WorldAssetThumbnailRenderer
              entry={generatedThumbnails.active.entry}
              requestKey={generatedThumbnails.active.key}
              onComplete={generatedThumbnails.recordComplete}
              onError={generatedThumbnails.recordError}
              onRootError={generatedThumbnails.recordRootError}
            />
          )}
        </aside>

        <main className="wb-stage">
          <div className="wb-tool-strip">
            <div
              className="wb-tools"
              role="toolbar"
              aria-label="Manipulation tools"
            >
              {(roomMode
                ? ([
                    'paint',
                    'erase',
                    'rectangle',
                    ...(repeatAssetRef ? (['repeat'] as const) : []),
                    'select',
                    'move',
                    'rotate',
                  ] as const)
                : (['select', 'move', 'rotate'] as const)
              ).map((entry) => (
                <button
                  key={entry}
                  className={
                    (roomMode ? roomTool : tool) === entry
                      ? 'wb-tool wb-active'
                      : 'wb-tool'
                  }
                  aria-pressed={(roomMode ? roomTool : tool) === entry}
                  onClick={() => {
                    setPreviewScene(null);
                    if (entry !== 'repeat') setRepeatAssetRef(null);
                    // Actor arming lives in the Room setup controls; a tool
                    // strip switch always disarms a placement.
                    setArmedMonsterRef(null);
                    if (
                      entry === 'paint' ||
                      entry === 'erase' ||
                      entry === 'rectangle' ||
                      entry === 'repeat'
                    )
                      setRoomTool(entry);
                    else {
                      setRoomTool(entry);
                      setTool(entry);
                    }
                  }}
                >
                  {entry[0]!.toUpperCase() + entry.slice(1)}
                </button>
              ))}
            </div>
            <span data-testid="interaction-status">
              {roomMode && roomTool === 'paint'
                ? 'Drag on floor: paint walkable ground'
                : roomMode && roomTool === 'erase'
                  ? 'Drag on floor: erase walkable ground'
                  : roomMode && roomTool === 'rectangle'
                    ? 'Drag a world X/Z rectangle: preview full hexes; release to paint · Esc/right-click: cancel'
                    : roomMode && roomTool === 'repeat'
                      ? repeatDescriptor
                        ? `Drag on floor: repeat ${WORLD_BUILDING_CATALOG_BY_REF.get(repeatDescriptor.assetRef)?.label ?? 'asset'} · release once to group · Esc/right-click: cancel`
                        : 'Repeat unavailable: this asset needs valid dimensions and remaining scene capacity'
                      : roomMode && roomTool === 'monster'
                        ? `Click the floor: place ${paletteNameForRef(armedMonsterRef ?? '')} on the snapped hex · every placement is one Undo`
                        : roomMode && roomTool === 'start'
                          ? 'Click the floor: place or move the party start'
                          : roomMode && roomTool === 'select' && selectedActorId
                            ? selectedActorId === 'start'
                              ? 'Click the floor: move the party start · Delete: clear it'
                              : `Click the floor: move monster ${selectedActorId} · Delete: remove it`
                            : tool === 'select'
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
              roomAuthoring={
                roomMode
                  ? {
                      tool: roomTool,
                      workspace: roomDraft.workspace,
                      walkableHexes: roomDraft.room.walkableHexes,
                      repeat: repeatDescriptor,
                      monsters: roomDraft.room.monsters,
                      partyStart: roomDraft.room.partyStart ?? null,
                      armedMonsterRef: armedMonsterRef,
                      selectedActorId: selectedActorId,
                      onPlaceMonster: placeMonsterAt,
                      onMoveMonster: moveMonsterTo,
                      onStartGesture: startGestureAt,
                      onSelectActor: (actor) => {
                        if (actor) setPreviewScene(null);
                        setSelectedActorId(actor);
                      },
                      propDeclarations:
                        footprintPreview && selectedProp
                          ? {
                              ...roomDraft.room.propDeclarations,
                              [selectedProp.id]: footprintPreview,
                            }
                          : roomDraft.room.propDeclarations,
                      onWalkableGesture: (cells, mode) => {
                        const next = updateWalkableHexes(
                          roomDraft,
                          cells,
                          mode
                        );
                        commit(scene, selectedIds, next.room);
                      },
                      onRepeatGesture: (assetRef, transforms) => {
                        try {
                          const result = addRepeatedProps({
                            scene,
                            assetRef,
                            transforms,
                            idFactory,
                            label: 'Repeated pieces',
                          });
                          commit(result.scene, result.selectedIds);
                        } catch (error) {
                          setNotice(
                            error instanceof Error
                              ? error.message
                              : String(error)
                          );
                        }
                      },
                    }
                  : undefined
              }
              onSelect={(ids) => {
                // A scenery selection always deselects the actor: the two
                // selections stay distinct and never delete each other.
                if (ids.length > 0) setSelectedActorId(null);
                selectInScene(ids);
              }}
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
            <label>
              <span>Scene name</span>
              <input
                aria-label="Scene name"
                value={sceneNameDraft}
                maxLength={120}
                onChange={(event) => setSceneNameDraft(event.target.value)}
                onBlur={() => {
                  const name = sceneNameDraft.trim();
                  if (!name) {
                    setSceneNameDraft(scene.name);
                    setNotice('Scene name cannot be empty.');
                  } else if (name !== scene.name) {
                    // The explicit rename is the one transaction that also
                    // moves the published draft name (one Undo); unrelated
                    // edits never normalize an imported draft name.
                    commit(
                      { ...scene, name },
                      selectedIds,
                      roomDraft.room,
                      roomDraft.workspace,
                      roomMode ? name : undefined
                    );
                  }
                }}
              />
            </label>
            <div className="wb-actions">
              <button
                disabled={
                  publishBusy ||
                  (roomMode ? roomHistory.past : history.past).length === 0
                }
                onClick={undo}
              >
                Undo
              </button>
              <button
                disabled={
                  publishBusy ||
                  (roomMode ? roomHistory.future : history.future).length === 0
                }
                onClick={redo}
              >
                Redo
              </button>
              <button disabled={publishBusy} onClick={duplicate}>
                Duplicate
              </button>
              <button
                className="wb-danger"
                disabled={publishBusy}
                onClick={remove}
              >
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
            {selectedIds.length > 0 && (
              <div className="wb-light-editor" aria-label="Visual height">
                <h4>Visual height</h4>
                <label>
                  <span>
                    Height scale ·{' '}
                    {selectedHeightMixed
                      ? 'Mixed'
                      : `${Math.round(selectedHeight * 100)}%`}
                  </span>
                  <input
                    type="number"
                    aria-label="Height scale percent"
                    min={25}
                    max={400}
                    step={5}
                    value={heightDraftPercent}
                    onChange={(event) =>
                      setHeightDraftPercent(Number(event.target.value))
                    }
                  />
                  <button
                    type="button"
                    disabled={
                      !Number.isFinite(heightDraftPercent) ||
                      (!selectedHeightMixed &&
                        heightDraftPercent === Math.round(selectedHeight * 100))
                    }
                    onClick={() => {
                      const next =
                        Math.min(400, Math.max(25, heightDraftPercent)) / 100;
                      if (selectedHeightMixed || next !== selectedHeight)
                        commit(setSelectionHeight(scene, selectedIds, next));
                    }}
                  >
                    Apply height
                  </button>
                </label>
                <p className="wb-help">
                  Grounded at each piece base; width, spacing, and authored
                  position stay unchanged.
                </p>
              </div>
            )}
            {roomMode && selectedProp && (
              <div
                className="wb-light-editor"
                aria-label="Authored prop declarations"
              >
                <h4>Movement &amp; sight declaration</h4>
                {!selectedDeclaration ? (
                  <button
                    onClick={() =>
                      commitSelectedDeclaration(defaultDeclaration)
                    }
                  >
                    Add authored footprint
                  </button>
                ) : (
                  <>
                    <label className="wb-light-toggle">
                      <input
                        type="checkbox"
                        aria-label="Blocks movement"
                        checked={selectedDeclaration.blocksMovement}
                        onChange={(event) =>
                          commitSelectedDeclaration({
                            ...selectedDeclaration,
                            blocksMovement: event.target.checked,
                          })
                        }
                      />
                      <span>Blocks movement</span>
                    </label>
                    <label className="wb-light-toggle">
                      <input
                        type="checkbox"
                        aria-label="Blocks line of sight"
                        checked={selectedDeclaration.blocksLineOfSight}
                        onChange={(event) =>
                          commitSelectedDeclaration({
                            ...selectedDeclaration,
                            blocksLineOfSight: event.target.checked,
                          })
                        }
                      />
                      <span>Blocks line of sight</span>
                    </label>
                    <p className="wb-help">
                      Outline is an authored owner-local X/Z rectangle in scene
                      units. It moves and rotates with the prop; it does not
                      scale the mesh or calculate blocked cells.
                    </p>
                    {(['width', 'depth', 'offsetX', 'offsetZ'] as const).map(
                      (field) => {
                        const preview = footprintPreview ?? selectedDeclaration;
                        const size = field === 'width' || field === 'depth';
                        return (
                          <label key={field}>
                            <span>
                              {field} · {preview.footprint[field].toFixed(2)}
                            </span>
                            <input
                              type="range"
                              aria-label={`Footprint ${field}`}
                              min={size ? 0.25 : -3}
                              max={size ? 6 : 3}
                              step={0.05}
                              value={preview.footprint[field]}
                              onChange={(event) =>
                                setFootprintPreview({
                                  ...preview,
                                  footprint: {
                                    ...preview.footprint,
                                    [field]: Number(event.target.value),
                                  },
                                })
                              }
                              onPointerUp={() =>
                                commitSelectedDeclaration(preview)
                              }
                              onKeyUp={() => commitSelectedDeclaration(preview)}
                            />
                          </label>
                        );
                      }
                    )}
                  </>
                )}
              </div>
            )}
            {selectedProp && (
              <div className="wb-light-editor">
                <h4>Visual point light</h4>
                {!selectedProp.pointLight ? (
                  <>
                    <button
                      onClick={() =>
                        commit(
                          setPropPointLight(
                            scene,
                            selectedProp.id,
                            DEFAULT_POINT_LIGHT
                          )
                        )
                      }
                    >
                      Add point light
                    </button>
                    <p className="wb-help">
                      Explicit author choice; never inferred from the asset.
                    </p>
                  </>
                ) : (
                  <>
                    <label className="wb-light-toggle">
                      <input
                        type="checkbox"
                        aria-label="Light enabled"
                        checked={selectedProp.pointLight.enabled}
                        onChange={(event) =>
                          updateSelectedLight((light) => ({
                            ...light,
                            enabled: event.target.checked,
                          }))
                        }
                      />
                      <span>Enabled</span>
                    </label>
                    <div className="wb-light-grid">
                      {(['x', 'y', 'z'] as const).map((axis) => (
                        <label key={axis}>
                          <span>Offset {axis.toUpperCase()}</span>
                          <input
                            type="number"
                            aria-label={`Light offset ${axis.toUpperCase()}`}
                            min={-12}
                            max={12}
                            step={0.05}
                            value={selectedProp.pointLight!.offset[axis]}
                            onChange={(event) =>
                              updateSelectedLight((light) => ({
                                ...light,
                                offset: {
                                  ...light.offset,
                                  [axis]: numberFrom(event.target.value),
                                },
                              }))
                            }
                          />
                        </label>
                      ))}
                      <label>
                        <span>Color</span>
                        <input
                          type="color"
                          aria-label="Light color"
                          value={selectedProp.pointLight.color.toLowerCase()}
                          onChange={(event) =>
                            updateSelectedLight((light) => ({
                              ...light,
                              color: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        <span>Intensity</span>
                        <input
                          type="number"
                          aria-label="Light intensity"
                          min={0}
                          max={20}
                          step={0.1}
                          value={selectedProp.pointLight.intensity}
                          onChange={(event) =>
                            updateSelectedLight((light) => ({
                              ...light,
                              intensity: numberFrom(event.target.value),
                            }))
                          }
                        />
                      </label>
                      <label>
                        <span>Range</span>
                        <input
                          type="number"
                          aria-label="Light range"
                          min={0.01}
                          max={24}
                          step={0.1}
                          value={selectedProp.pointLight.range}
                          onChange={(event) =>
                            updateSelectedLight((light) => ({
                              ...light,
                              range: numberFrom(event.target.value),
                            }))
                          }
                        />
                      </label>
                    </div>
                    <p className="wb-help">
                      Offset/range use scene units. Intensity is a rendering
                      control, not physical or D&amp;D illumination.
                    </p>
                    <button
                      className="wb-danger"
                      onClick={() =>
                        commit(
                          setPropPointLight(scene, selectedProp.id, undefined)
                        )
                      }
                    >
                      Remove point light
                    </button>
                  </>
                )}
              </div>
            )}
          </section>

          {roomMode && (
            <section aria-label="Room setup">
              <h3>Room setup</h3>
              <p className="wb-help">
                Monsters and the party start are authoring markers. Props stay
                freely placed; the encounter decides legality at Play.
              </p>
              <div
                className="wb-actions"
                role="group"
                aria-label="Monster palette"
              >
                {PALETTE_MONSTERS.map((monster) => (
                  <button
                    key={monster.ref}
                    type="button"
                    aria-label={`Place ${monster.label}`}
                    aria-pressed={
                      roomTool === 'monster' && armedMonsterRef === monster.ref
                    }
                    onClick={() => armMonsterPlacement(monster.ref)}
                  >
                    {monster.label}
                  </button>
                ))}
              </div>
              <div className="wb-actions" role="group" aria-label="Party start">
                <button
                  type="button"
                  aria-label="Place party start"
                  aria-pressed={roomTool === 'start'}
                  onClick={armStartPlacement}
                >
                  Place party start
                </button>
                <button
                  type="button"
                  aria-label="Clear party start"
                  disabled={!roomDraft.room.partyStart}
                  onClick={clearPartyStart}
                >
                  Clear party start
                </button>
              </div>
              <ul
                className="wb-actor-list"
                aria-label="Placed monsters"
                data-testid="placed-monsters"
              >
                {roomDraft.room.monsters.map((monster) => (
                  <li
                    key={monster.id}
                    className={
                      selectedActorId === monster.id
                        ? 'wb-actor-row wb-actor-row--selected'
                        : 'wb-actor-row'
                    }
                    data-actor-id={monster.id}
                  >
                    <span>
                      {paletteNameForRef(monster.ref)} ({monster.cell.q},{' '}
                      {monster.cell.r})
                    </span>
                    <button
                      type="button"
                      aria-label={`Move monster ${paletteNameForRef(monster.ref)} ${monster.id}`}
                      onClick={() => {
                        setSelectedActorId(monster.id);
                        setRoomTool('select');
                        setNotice('');
                      }}
                    >
                      Move
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove monster ${paletteNameForRef(monster.ref)} ${monster.id}`}
                      onClick={() => removeActor(monster.id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              {selectedActorId && (
                <p
                  className="wb-help"
                  data-testid="actor-selection"
                  aria-live="polite"
                >
                  {selectedActorId === 'start'
                    ? 'Party start selected — click the floor to move it, or Delete to clear it.'
                    : `Selected monster ${selectedActorId} — click the floor to move it, or Delete to remove it.`}
                </p>
              )}
            </section>
          )}

          {roomMode && roomPublishing && (
            <section aria-label="Publish room">
              <h3>Publish &amp; Play</h3>
              <p className="wb-help">
                Validation and saving run on the authoring server; the local
                draft and any world snapshot are untouched by refusals.
              </p>
              <RoomPublishingPanel
                draft={roomDraft}
                capability={roomPublishing}
                onImportDraft={importCanonicalRoomYaml}
                onBusyChange={handlePublishBusy}
              />
            </section>
          )}

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

          {compositionSource && (
            <section aria-label="World composition library">
              <div className="wb-library-heading">
                <h3>{roomMode ? 'Saved rooms' : 'World compositions'}</h3>
                <button
                  disabled={compositionList.status === 'loading' || worldBusy}
                  onClick={() =>
                    setCompositionRefresh((current) => current + 1)
                  }
                >
                  Reload world library
                </button>
              </div>
              <p className="wb-help">
                Current world: <strong>{compositionSource.worldId}</strong>.
                Saves are immutable; editing and saving again creates a new ID.
                Permanent deletion does not change dungeon placements; remove
                those references explicitly in each dungeon.
              </p>
              {lastWorldSave && (
                <p className="wb-help">Latest snapshot ID: {lastWorldSave}</p>
              )}
              {compositionList.status === 'loading' && (
                <p>
                  {roomMode
                    ? 'Loading saved rooms…'
                    : 'Loading world compositions…'}
                </p>
              )}
              {compositionList.status === 'error' && (
                <p className="wb-library-error">
                  Could not load world compositions: {compositionList.message}
                </p>
              )}
              {compositionList.status === 'ready' &&
                visibleCompositions.length === 0 && (
                  <p>
                    {roomMode
                      ? 'No saved rooms in this world.'
                      : 'No saved compositions in this world.'}
                  </p>
                )}
              <div className="wb-library">
                {visibleCompositions.map((composition) => {
                  const metadata = compositionMetadata(composition);
                  const label =
                    metadata.status === 'ready' || metadata.status === 'room'
                      ? metadata.name
                      : composition.id;
                  const confirming = deleteCandidate?.id === composition.id;
                  return (
                    <article
                      key={composition.id}
                      className={
                        metadata.status === 'error'
                          ? 'wb-library-error'
                          : undefined
                      }
                    >
                      <strong>{label}</strong>
                      <small>
                        {metadata.status === 'ready' ||
                        metadata.status === 'room'
                          ? 'Immutable world snapshot'
                          : `Could not open this saved composition. ${metadata.message}`}
                      </small>
                      {(metadata.status === 'ready' ||
                        metadata.status === 'room') && (
                        <button
                          disabled={worldBusy}
                          onClick={() => void openComposition(composition.id)}
                        >
                          Open {metadata.name}
                        </button>
                      )}
                      {roomMode ||
                      !compositionSource.writer ? null : !confirming ? (
                        <button
                          className="wb-danger"
                          disabled={worldBusy}
                          onClick={() =>
                            setDeleteCandidate({ id: composition.id, label })
                          }
                        >
                          Delete {label}
                        </button>
                      ) : (
                        <div
                          className="wb-delete-confirm"
                          role="group"
                          aria-label={`Permanent deletion confirmation for ${label}`}
                        >
                          <p>
                            Permanently delete “{label}”? This cannot be undone.
                            Dungeon placements that use it will remain as
                            deleted or missing references until you remove them
                            explicitly.
                          </p>
                          <div className="wb-actions">
                            <button
                              disabled={worldBusy}
                              onClick={() => setDeleteCandidate(null)}
                            >
                              Cancel delete {label}
                            </button>
                            <button
                              className="wb-danger"
                              disabled={worldBusy}
                              onClick={() =>
                                void deleteComposition(composition.id, label)
                              }
                            >
                              {worldBusy
                                ? 'Deleting permanently…'
                                : `Permanently delete ${label}`}
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          )}

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
                  const json = roomMode
                    ? stringifyRoomDraft(roomDraft)
                    : stringifyScene(scene);
                  setPortableJson(json);
                  downloadJson(
                    roomMode
                      ? 'room-authoring-draft.json'
                      : 'world-building-scene.json',
                    json
                  );
                }}
              >
                {roomMode ? 'Export room draft JSON' : 'Export scene JSON'}
              </button>
              <button onClick={importScene}>
                {roomMode ? 'Import room draft JSON' : 'Import scene JSON'}
              </button>
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
          {roomMode && (
            <output data-testid="room-draft-json" hidden>
              {stringifyRoomDraft(roomDraft)}
            </output>
          )}
        </aside>
      </div>
    </section>
  );
}
