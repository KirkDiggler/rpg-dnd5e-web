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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  EncounterStudioPresentation,
  StudioWallAppearanceOption,
} from '../encounter-studio/studioSession';
import {
  WORLD_BUILDING_CATALOG,
  WORLD_BUILDING_CATALOG_BY_REF,
  type GeneratedWorldBuildingCatalogEntry,
} from './catalog';
import { paintConcealmentCells, setConcealmentProp } from './concealmentEdits';
import { ConcealmentPanel } from './ConcealmentPanel';
import {
  declarationMapForSelection,
  seedDeclarations,
} from './declarationFootprint';
import { setDoorBindingState, withDoorBinding } from './doorBindingEdits';
import { DoorStates } from './DoorStates';
import { IntelPanel } from './IntelPanel';
import {
  createMapLabel,
  deleteMapLabel,
  moveMapLabel,
  renameMapLabel,
} from './mapLabelEdits';
import {
  setMonsterFaction as changeMonsterFaction,
  withBinding,
} from './monsterOrderEdits';
import type { MeasuredWorldPropBounds } from './placementGuides';
import { withPropBinding } from './propBindingEdits';
import {
  selectedSceneItems,
  selectionOptionSections,
} from './propOptionSections';
import { PropOrders } from './PropOrders';
import { resolveAuthoringRegions } from './regionBoundaryGeometry';
import {
  useEnclosingWalls as bindEnclosingWalls,
  createRoomLabel,
  removeRegionAndLabel,
  setExplicitRegionArea,
  setRegionLighting,
} from './regionEdits';
import { projectRegionLighting } from './regionLighting';
import { addRepeatedProps } from './repeatPlacement';
import {
  assertRoomDocumentSize,
  clearRoomPartyStart,
  createRoomDraft,
  expandRoomWorkspace,
  FOOTPRINT_MAXIMUM_EXTENT,
  FOOTPRINT_MAXIMUM_OFFSET,
  FOOTPRINT_MINIMUM_EXTENT,
  loadRoomDraft,
  moveRoomMonster,
  parseRoomDocumentJson,
  placeRoomMonster,
  reconcileRoomDraft,
  remapRoomDeclarations,
  removeRoomMonster,
  resizeRoomWorkspace,
  ROOM_WORKSPACE_STEPS,
  saveRoomDraft,
  setRoomPartyStart,
  stringifyRoomDraft,
  updateWalkableHexes,
  validateRoomDocument,
  type RoomDoorBinding,
  type RoomDraft,
  type RoomDraftDocument,
  type RoomGameplayData,
  type RoomHexCell,
  type RoomMonsterBinding,
  type RoomPropBinding,
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
  redoHistory,
  rotateSelection,
  saveArrangement,
  selectionPropIds,
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
import {
  CreatureOrders,
  DispositionsPanel,
  FactionsPanel,
} from './SitePolicies';
import type { SiteScope } from './siteScope';
import {
  attachableDoorAssetRefs,
  attachDoorToOpening,
  removeDoorFromOpening,
  swapOpeningDoorAsset,
} from './structuralDoorEditing';
import {
  createWall,
  previewWallTransform,
  repeatableWallAssetRefs,
} from './structuralWallEditing';
import type { WallLine } from './structuralWallGeometry';
import {
  StructuralWallPanel,
  type WallDoorMutation,
} from './StructuralWallPanel';
import {
  validateStructuralWalls,
  type StructuralWall,
} from './structuralWalls';
import {
  applyStudioActorArrange,
  applyStudioSceneArrange,
  applyStudioWallArrange,
  projectStudioArrange,
  type StudioArrangeIntent,
  type StudioArrangeTarget,
} from './studioArrange';
import {
  clampDoorPosition,
  createStudioDoor,
  doorAlongWall,
  doorPreviewIds,
  editStudioDoor,
  removeStudioDoor,
  requireStudioDoor,
  studioDoorAssetWidth,
  studioDoorOptions,
  type StudioDoorEditing,
  type StudioDoorPreview,
  type StudioDoorTarget,
} from './studioDoorEditing';
import { TablesPanel } from './TablesPanel';
import type {
  ArrangementLibrary,
  IdFactory,
  KeyValueStorage,
  SceneHistory,
  WorldPoint,
  WorldPointLight,
  WorldProp,
  WorldScene,
} from './types';
import type { RoomPublishingCapability } from './useRoomPublishing';
import { validateWorkspaceContent } from './workspaceContentBounds';
import { worldAssetThumbnailKey } from './worldAssetThumbnailKey';
import { WorldAssetThumbnailRenderer } from './WorldAssetThumbnailRenderer';
import { WorldBuilderInspector } from './WorldBuilderInspector';
import './worldBuilding.css';
import {
  writeWorldBuildingDragPayload,
  type WorldBuildingDragPayload,
} from './worldBuildingDrag';
import type { WorldBuildingTool } from './WorldBuildingInteraction';
import { WorldBuildingPaletteCard } from './WorldBuildingPaletteCard';
import type { WorldBuildingDropTarget } from './worldBuildingPointer';
import {
  WorldBuildingViewport,
  type WorldBuildingViewportProps,
} from './WorldBuildingViewport';

const EMPTY_STUDIO_SCENE_IDS: string[] = [];
function studioTargetKey(target: StudioArrangeTarget | null): string {
  return JSON.stringify(
    target?.kind === 'scene'
      ? { kind: 'scene', ids: [...new Set(target.ids)].sort() }
      : target?.kind === 'door'
        ? {
            kind: 'door',
            wallId: target.wallId,
            openingId: target.openingId,
            doorId: target.doorId,
          }
        : target?.kind === 'start'
          ? { kind: 'start' }
          : target
            ? { kind: target.kind, id: target.id }
            : null
  );
}

/** The Rooms editor's destinations (rpg-dnd5e-web#1152, design
 * `ideas/site-authoring/design.md` §UI surfaces: "separate by task, not by
 * document").
 *
 * The corrected model (Kirk, 2026-09-19): **the site is the document**, so the
 * route has two screens, `Site` and `Prop compositions`, and this component
 * renders one of them. `Site` is `roomMode`; it owns the rooms, the props, the
 * active site nouns, and — behind the header's `Identity` control — identity,
 * the local draft, the revision history, the arrangements, the portable JSON
 * and publishing. `Prop compositions` is a different editor with its own
 * chrome and is untouched by this slice. The old `The site` and `Library`
 * destinations were the same thing twice; they are now the Identity panel. */

interface WorldBuildingConceptProps {
  studioPresentation?: EncounterStudioPresentation;
  storage?: KeyValueStorage;
  idFactory?: IdFactory;
  now?: () => string;
  compositionSource?: CompositionSource;
  onCompositionDeleted?: () => void;
  onBack?: () => void;
  /** Dedicated local authoring-draft mode; never writes world compositions.
   * This is the Site editor; `false` is the Prop compositions editor. */
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

/** One editor document: the room draft plus the site scope (`factions` /
 * `dispositions`) that belongs with it (rpg-dnd5e-web#1157, #1160,
 * rpg-project#477).
 *
 * THE SCOPE IS EDITOR STATE, AND IT IS PERSISTED BESIDE THE DRAFT. The local
 * draft's storage envelope under `ROOM_DRAFT_STORAGE_KEY` carries the scope in
 * a v4 envelope when one is authored (and stays byte-identical v3 when none
 * is), so an author who edits policies and reloads gets them back — saving the
 * room and dropping the policies is a document the engine refuses. The scope
 * still travels in the HISTORY ENTRY so Undo/Redo moves the draft and its
 * policies together: a bare `SiteScope` beside the history would let one
 * Undo across two imports publish document A's room with document B's
 * policies, which is the same silent mismatch this slice exists to remove. */
type RoomDocument = RoomDraftDocument;

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
  studioPresentation,
}: WorldBuildingConceptProps) {
  /** The Site editor is the room-mode mount. Its `Identity` control opens the
   * panel that holds document admin (identity, local draft, revision history,
   * arrangements, portable JSON, publishing); while it is open it overlays the
   * canvas, so the site's nouns stay visible beside it. */
  const [identityOpen, setIdentityOpen] = useState(false);
  const effectiveStorage = storage ?? browserStorage;
  const [initial] = useState(() => bootstrap(effectiveStorage, idFactory));
  const [history, setHistory] = useState<SceneHistory>(initial.history);
  const [initialRoom] = useState(() => {
    if (!roomMode)
      return {
        value: createRoomDraft(initial.history.present, 'inactive-room'),
        scope: {} as SiteScope,
      };
    const fallback = createRoomDraft(
      createEmptyScene(idFactory()),
      idFactory()
    );
    return loadRoomDraft(effectiveStorage, fallback);
  });
  const [roomHistory, storeRoomHistory] = useState<{
    past: RoomDocument[];
    present: RoomDocument;
    future: RoomDocument[];
  }>(() => ({
    past: [],
    present: { draft: initialRoom.value, scope: initialRoom.scope },
    future: [],
  }));
  // Synchronous owner truth lets several intents in one event compose in order,
  // rather than each rebuilding the render's old snapshot.
  const roomHistoryRef = useRef(roomHistory);
  const setRoomHistory = useCallback(
    (
      next:
        | typeof roomHistory
        | ((current: typeof roomHistory) => typeof roomHistory)
    ) => {
      const resolved =
        typeof next === 'function' ? next(roomHistoryRef.current) : next;
      roomHistoryRef.current = resolved;
      storeRoomHistory(resolved);
    },
    []
  );
  const [library, setLibrary] = useState<ArrangementLibrary>(initial.library);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [doorAssetRef, setDoorAssetRef] = useState<string | null>(null);
  const [previewDoor, setPreviewDoor] = useState<StudioDoorPreview | null>(
    null
  );
  const doorOptions = useMemo(studioDoorOptions, []);
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  // Existing IDs remain their noun owners; this arbiter only identifies which
  // noun is active. Its synchronous revision fences same-event late callbacks
  // without retiring the general epoch (which would cancel a selecting drag).
  const activeStudioTargetRef = useRef<StudioArrangeTarget | null>(null);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const selectionRevisionRef = useRef(0);
  const activateStudioTarget = useCallback(
    (target: StudioArrangeTarget | null): void => {
      if (
        studioTargetKey(activeStudioTargetRef.current) ===
        studioTargetKey(target)
      )
        return;
      setPreviewDoor(null);
      activeStudioTargetRef.current = target;
      selectionRevisionRef.current += 1;
      setSelectionRevision(selectionRevisionRef.current);
    },
    []
  );
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
    | 'wall'
    | 'door'
  >('select');
  const [repeatAssetRef, setRepeatAssetRef] = useState<string | null>(null);
  /** Wall drawing arms a repeatable asset; the authored asset stays explicit
   * and drawing is refused until one is chosen. Snap is optional. */
  const [wallAssetRef, setWallAssetRef] = useState<string | null>(null);
  const [wallSnapEnabled, setWallSnapEnabled] = useState(false);
  /** The selected authored wall — its own selection, never a scene prop id. */
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  /** Room-only actor authoring state. Distinct from the scene's selectedIds:
   * a selected actor is a monster id or 'start', never a WorldProp id, and
   * actor operations never touch scenery selections. */
  const [armedMonsterRef, setArmedMonsterRef] = useState<string | null>(null);
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);
  const [activeDrag, setActiveDrag] = useState<WorldBuildingDragPayload | null>(
    null
  );
  const [previewScene, setPreviewScene] = useState<WorldScene | null>(null);
  const [previewWall, setPreviewWall] = useState<StructuralWall | null>(null);
  const [search, setSearch] = useState('');
  const [arrangementName, setArrangementName] = useState('New arrangement');
  const [portableJson, setPortableJson] = useState('');
  const [footprintPreview, setFootprintPreview] =
    useState<RoomPropDeclaration | null>(null);
  /** Each placed prop's measured world bounds, keyed by scene item id. The
   * viewport measures them anyway; this keeps a copy where the declaration
   * editor can seed a blocker from the mesh instead of a 1×1 guess. */
  const [measuredBounds, setMeasuredBounds] = useState<
    ReadonlyMap<string, MeasuredWorldPropBounds>
  >(() => new Map());
  const handleMeasuredBounds = useCallback(
    (id: string, measurement: MeasuredWorldPropBounds) => {
      setMeasuredBounds((current) => {
        // IDENTITY IS THE POINT (PR #1127 review, Critical). An identical
        // report must return the SAME map, because the viewport calls upward
        // outside its own de-dup guard: a fresh Map here re-renders, which
        // re-creates the inline `recordBounds` passed to each model, which
        // re-fires that model's measurement effect, which reports again — an
        // unbounded loop that rendered 402 deep before the reviewer's guard
        // stopped it. Returning `current` ends the cycle at its source, the
        // same way the viewport already ends it locally.
        const previous = current.get(id);
        if (
          previous &&
          previous.assetRef === measurement.assetRef &&
          previous.bounds.minY === measurement.bounds.minY &&
          previous.bounds.maxY === measurement.bounds.maxY &&
          previous.bounds.width === measurement.bounds.width &&
          previous.bounds.height === measurement.bounds.height &&
          previous.bounds.depth === measurement.bounds.depth
        ) {
          return current;
        }
        const next = new Map(current);
        next.set(id, measurement);
        return next;
      });
    },
    []
  );
  const [notice, setNotice] = useState(
    [initial.error, initialRoom.error].filter(Boolean).join(' ')
  );
  const roomAutosaveBlockedRef = useRef(Boolean(initialRoom.error));
  /** Autosave is paused while the stored bytes cannot be read. The ref is the
   * synchronous truth for async continuations; the state is what the building
   * chrome can render, because losing this from the screen would be a silent
   * loss of the author's work. They always move together. */
  const [autosaveBlocked, setAutosaveBlocked] = useState(
    Boolean(initialRoom.error)
  );
  const markAutosaveBlocked = (blocked: boolean) => {
    roomAutosaveBlockedRef.current = blocked;
    setAutosaveBlocked(blocked);
  };
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
  const roomDraft = roomHistory.present.draft;
  /** The policies of the open document (rpg-dnd5e-web#1160): edited in the
   * `Policies` node, persisted beside the draft, and hydrated on reload by
   * `loadRoomDraft`; emptied by every path that replaces the document with one
   * that authors none. */
  const siteScope = roomHistory.present.scope;
  const [paintingConcealmentId, setPaintingConcealmentId] = useState<
    string | null
  >(null);
  useEffect(() => {
    setPaintingConcealmentId(null);
  }, [roomDraft.id]);
  useEffect(() => {
    if (roomTool !== 'select') setPaintingConcealmentId(null);
  }, [roomTool]);
  const isStudio = Boolean(studioPresentation);
  const studioView = roomMode ? studioPresentation?.view : undefined;
  const studioViewRef = useRef(studioView);
  const viewportGenerationRef = useRef(0);
  const [, refreshViewportGeneration] = useState(0);
  // Retire callbacks synchronously before renderer cleanup/effects. Returning
  // to 3D must not resurrect callbacks from the previous renderer mount.
  if (studioViewRef.current !== studioView) {
    studioViewRef.current = studioView;
    viewportGenerationRef.current += 1;
  }
  const intentContextRef = useRef({
    document: roomHistory.present,
    tool,
    roomTool,
    armedMonsterRef,
    repeatAssetRef,
    wallAssetRef,
    doorAssetRef,
    wallSnapEnabled,
    paintingConcealmentId,
  });
  if (
    intentContextRef.current.document !== roomHistory.present ||
    intentContextRef.current.tool !== tool ||
    intentContextRef.current.roomTool !== roomTool ||
    intentContextRef.current.armedMonsterRef !== armedMonsterRef ||
    intentContextRef.current.repeatAssetRef !== repeatAssetRef ||
    intentContextRef.current.wallAssetRef !== wallAssetRef ||
    intentContextRef.current.doorAssetRef !== doorAssetRef ||
    intentContextRef.current.wallSnapEnabled !== wallSnapEnabled ||
    intentContextRef.current.paintingConcealmentId !== paintingConcealmentId
  ) {
    intentContextRef.current = {
      document: roomHistory.present,
      tool,
      roomTool,
      armedMonsterRef,
      repeatAssetRef,
      wallAssetRef,
      doorAssetRef,
      wallSnapEnabled,
      paintingConcealmentId,
    };
    viewportGenerationRef.current += 1;
  }
  const cancelTransients = useCallback(() => {
    viewportGenerationRef.current += 1;
    refreshViewportGeneration((current) => current + 1);
    setPreviewScene(null);
    setPreviewWall(null);
    setPreviewDoor(null);
    setFootprintPreview(null);
    setActiveDrag(null);
    setPaintingConcealmentId(null);
  }, []);
  useEffect(() => {
    if (!roomMode) return;
    setPreviewScene(null);
    setPreviewWall(null);
    setPreviewDoor(null);
    setFootprintPreview(null);
    setActiveDrag(null);
  }, [
    studioView,
    roomMode,
    roomHistory.present,
    tool,
    roomTool,
    armedMonsterRef,
    repeatAssetRef,
    wallAssetRef,
    doorAssetRef,
    wallSnapEnabled,
  ]);
  useEffect(() => {
    if (studioView !== undefined) setPaintingConcealmentId(null);
  }, [studioView]);
  const activeConcealmentId =
    roomMode &&
    roomTool === 'select' &&
    paintingConcealmentId &&
    Object.hasOwn(siteScope.concealments ?? {}, paintingConcealmentId)
      ? paintingConcealmentId
      : null;
  const scene = roomMode ? roomDraft.scene : history.present;
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const roomDraftRef = useRef(roomDraft);
  roomDraftRef.current = roomDraft;
  /** The scope the latest local draft belongs to, mirrored for the deferred
   * world-snapshot preservation write below (which runs outside render). */
  const siteScopeRef = useRef(siteScope);
  siteScopeRef.current = siteScope;
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
    const error = saveRoomDraft(effectiveStorage, roomDraft, siteScope);
    setSaveStatus(
      error
        ? 'Room save failed — draft kept in memory'
        : 'Room authoring draft saved locally'
    );
    if (error) setNotice(error);
  }, [effectiveStorage, roomDraft, roomMode, siteScope, workspaceOrigin]);

  useEffect(() => {
    if (!skippedInitialLibrarySave.current) {
      skippedInitialLibrarySave.current = true;
      return;
    }
    const result = saveLibraryToStorage(effectiveStorage, library);
    if (result.error) setNotice(result.error);
  }, [effectiveStorage, library]);

  const editGeneration = viewportGenerationRef.current;
  const rejectEdit = useCallback((error: unknown): false => {
    setNotice(
      `Edit rejected; the open scene was kept. ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }, []);

  /** The only room edit insertion seam. Existing policy forms can author
   * incomplete drafts (e.g. an intel record before its fact is entered).
   * Ordinary edits protect shape, rectangular bounds and serialized size;
   * explicit resize/label intents additionally require a complete codec-valid
   * document. Autosave/export still honestly refuse incomplete policies. */
  const commitRoomDocument = useCallback(
    (
      candidate: RoomDocument,
      selection = selectedIds,
      complete = false
    ): boolean => {
      if (
        !mountedRef.current ||
        viewportGenerationRef.current !== editGeneration
      )
        return false;
      if (refuseWhilePublishing()) return false;
      try {
        const scene = validateScene(candidate.draft.scene, {
          horizontalLimit: candidate.draft.workspace.horizontalLimit,
          workspace: candidate.draft.workspace,
        });
        const draft = {
          ...candidate.draft,
          scene,
          room: {
            ...candidate.draft.room,
            ...(candidate.draft.room.walls
              ? {
                  walls: validateStructuralWalls({
                    value: candidate.draft.room.walls,
                    horizontalLimit: candidate.draft.workspace.horizontalLimit,
                    itemIds: new Set(scene.items.map((item) => item.id)),
                  }),
                }
              : {}),
          },
        };
        validateWorkspaceContent(draft, candidate.scope);
        const valid = complete
          ? validateRoomDocument({ draft, scope: candidate.scope })
          : { draft, scope: candidate.scope };
        assertRoomDocumentSize(valid);
        if (
          JSON.stringify(valid) ===
          JSON.stringify(roomHistoryRef.current.present)
        )
          return true;
        setRoomHistory((current) => ({
          past: [...current.past.slice(-79), structuredClone(current.present)],
          present: structuredClone(valid),
          future: [],
        }));
        setPreviewScene(null);
        setSelectedIds(selection);
        if (
          studioPresentation &&
          studioTargetKey({ kind: 'scene', ids: selection }) !==
            studioTargetKey({ kind: 'scene', ids: selectedIds })
        )
          activateStudioTarget(
            selection.length ? { kind: 'scene', ids: selection } : null
          );
        setSaveStatus(
          workspaceOriginRef.current === 'local'
            ? 'Saving local draft…'
            : 'World workspace changes are not saved locally'
        );
        setNotice('');
        return true;
      } catch (error) {
        return rejectEdit(error);
      }
    },
    [
      activateStudioTarget,
      studioPresentation,
      editGeneration,
      refuseWhilePublishing,
      rejectEdit,
      selectedIds,
      setRoomHistory,
    ]
  );

  const commit = useCallback(
    (
      next: WorldScene,
      selection = selectedIds,
      nextRoom: RoomGameplayData = roomHistoryRef.current.present.draft.room,
      nextWorkspace: RoomWorkspace = roomHistoryRef.current.present.draft
        .workspace,
      nextName?: string,
      nextId = roomHistoryRef.current.present.draft.id,
      nextScope?: SiteScope
    ): boolean => {
      if (
        roomMode &&
        (!mountedRef.current ||
          viewportGenerationRef.current !== editGeneration ||
          roomHistoryRef.current.present !== roomHistory.present)
      )
        return false;
      if (refuseWhilePublishing()) return false;
      try {
        if (roomMode) {
          const current = roomHistoryRef.current.present;
          const nextDraft = reconcileRoomDraft(
            {
              ...current.draft,
              id: nextId,
              ...(nextName === undefined ? {} : { name: nextName }),
              room: nextRoom,
              workspace: nextWorkspace,
            },
            next
          );
          return commitRoomDocument(
            { draft: nextDraft, scope: nextScope ?? current.scope },
            selection
          );
        }
        // Standalone composition semantics intentionally retain their own gate.
        const valid = validateScene(next);
        setHistory((current) => updateHistory(current, valid));
        setPreviewScene(null);
        setSelectedIds(selection);
        setSaveStatus(
          workspaceOriginRef.current === 'local'
            ? 'Saving local draft…'
            : 'World workspace changes are not saved locally'
        );
        setNotice('');
        return true;
      } catch (error) {
        return rejectEdit(error);
      }
    },
    [
      commitRoomDocument,
      editGeneration,
      refuseWhilePublishing,
      rejectEdit,
      roomHistory.present,
      roomMode,
      selectedIds,
    ]
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
          const accepted = commit(
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
          if (roomMode && !accepted) return;
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
        const accepted = commit(
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
        if (roomMode && !accepted) return;
        setTool('move');
        if (roomMode) setRoomTool('move');
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error));
      }
    },
    [commit, idFactory, library.arrangements, roomDraft.room, roomMode, scene]
  );

  const selectInScene = useCallback(
    (ids: string[]) => {
      setPreviewScene(null);
      setPreviewWall(null);
      setSelectedIds(ids);
      activateStudioTarget(ids.length ? { kind: 'scene', ids } : null);
    },
    [activateStudioTarget]
  );

  const applyToSelection = useCallback(
    (operation: (current: WorldScene) => WorldScene) => {
      if (
        studioPresentation &&
        (activeStudioTargetRef.current?.kind !== 'scene' ||
          studioTargetKey(activeStudioTargetRef.current) !==
            studioTargetKey({ kind: 'scene', ids: selectedIds }) ||
          selectionRevisionRef.current !== selectionRevision)
      )
        return;
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
    [commit, scene, selectedIds, studioPresentation, selectionRevision]
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
        startingCell: { location: { ...cell } },
      });
      if (!commit(scene, selectedIds, next.room)) return;
      setSelectedActorId(id);
      activateStudioTarget({ kind: 'actor', id });
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const moveMonsterTo = (id: string, cell: RoomHexCell) => {
    // ONE-SHOT, AND THAT IS THE POINT. The move gesture is spent by the click
    // that performs it. Leaving the tool armed meant every LATER floor click
    // relocated the creature — so an author who selected a monster to edit its
    // orders could not then click a prop, or even empty ground, without moving
    // it (Kirk, 2026-09-19). Moving is armed deliberately from the actor list.
    setRoomTool('select');
    try {
      const next = moveRoomMonster(roomDraft, id, cell);
      if (next === roomDraft) return;
      if (!commit(scene, selectedIds, next.room)) return;
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
      if (!commit(scene, selectedIds, next.room)) return;
      setSelectedActorId('start');
      activateStudioTarget({ kind: 'start' });
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
      if (!commit(scene, selectedIds, next.room)) return;
      setSelectedActorId((current) => (current === actor ? null : current));
      setNotice('');
    },
    [commit, roomDraft, scene, selectedIds]
  );

  const removeSelectedStudioActor = useCallback((): void => {
    const target = activeStudioTargetRef.current;
    if (target?.kind !== 'actor' && target?.kind !== 'start') return;
    const next =
      target.kind === 'actor'
        ? removeRoomMonster(roomDraft, target.id)
        : clearRoomPartyStart(roomDraft);
    if (next === roomDraft || !commit(scene, selectedIds, next.room)) return;
    setSelectedActorId(null);
    activateStudioTarget(null);
  }, [activateStudioTarget, commit, roomDraft, scene, selectedIds]);

  const removeSelectedStudioDoor = useCallback((): void => {
    const target = activeStudioTargetRef.current;
    if (target?.kind !== 'door') return;
    try {
      const { wall } = requireStudioDoor(roomDraft, target);
      const bindings = withDoorBinding(
        roomDraft.room.doorBindings,
        target.doorId,
        undefined
      );
      const room = {
        ...roomDraft.room,
        walls: roomDraft.room.walls!.map((candidate) =>
          candidate.id === wall.id ? removeStudioDoor(wall, target) : candidate
        ),
      };
      if (bindings === undefined) delete room.doorBindings;
      else room.doorBindings = bindings;
      commit(scene, selectedIds, room);
    } catch (error) {
      rejectEdit(error);
    }
  }, [commit, roomDraft, scene, selectedIds, rejectEdit]);
  const clearPartyStart = () => {
    const next = clearRoomPartyStart(roomDraft);
    if (next === roomDraft) return;
    if (!commit(scene, selectedIds, next.room)) return;
    setSelectedActorId((current) => (current === 'start' ? null : current));
    setNotice('');
  };

  /** One policy edit is one history transaction (rpg-dnd5e-web#1160). The form
   * writes the document and the strict-SHAPE layer refuses to ENCODE what it
   * cannot represent — whether a reference resolves, whether a share can be
   * dealt, whether a stance may carry an `until` are the engine's calls, and
   * they come back through the publish panel's server validation. The form
   * does not pre-judge any of them. */
  const commitPolicies = useCallback(
    (nextScope: SiteScope, nextRoom?: RoomGameplayData) => {
      if (refuseWhilePublishing()) return;
      commit(
        scene,
        selectedIds,
        nextRoom ?? roomDraft.room,
        roomDraft.workspace,
        undefined,
        undefined,
        nextScope
      );
    },
    [
      commit,
      refuseWhilePublishing,
      roomDraft.room,
      roomDraft.workspace,
      scene,
      selectedIds,
    ]
  );

  /** A placed prop's orders — holdable, what it carries, whether it arrives
   * (rpg-project#488 R1, rpg-toolkit#1855). The MAP is normalized by
   * `withPropBinding`, so an emptied block becomes a deleted entry rather than
   * an empty one the encoder refuses, exactly as `setDoorBinding` and
   * `setMonsterOrders` do.
   *
   * Unlike a door, this does NOT seed a declaration: the panel only offers
   * items that already have one, because the engine requires it ("a prop
   * binding needs a declaration — that is where the footprint comes from") and
   * inventing a footprint here would be the builder answering a geometry
   * question the author has not. */
  const setPropBinding = useCallback(
    (id: string, next: RoomPropBinding | undefined) => {
      const bindings = withPropBinding(roomDraft.room.propBindings, id, next);
      const room: RoomGameplayData = { ...roomDraft.room };
      if (bindings === undefined) delete room.propBindings;
      else room.propBindings = bindings;
      commit(scene, selectedIds, room, roomDraft.workspace);
    },
    [commit, roomDraft.room, roomDraft.workspace, scene, selectedIds]
  );

  /** Membership is a binding, keyed by the declared creature id. Editing it
   * never changes the faction's shared policy or the actor's placement. */
  const setMonsterFaction = useCallback(
    (id: string, faction: string | undefined) => {
      const next = changeMonsterFaction(
        roomDraft.room.monsterBindings?.[id],
        faction
      );
      const bindings = withBinding(roomDraft.room.monsterBindings, id, next);
      const room = { ...roomDraft.room };
      if (bindings === undefined) delete room.monsterBindings;
      else room.monsterBindings = bindings;
      commit(scene, selectedIds, room);
    },
    [commit, roomDraft.room, scene, selectedIds]
  );

  /** The creature's OWN orders (rpg-dnd5e-web#1164). The MAP is normalized
   * here rather than in the panel: an emptied creature becomes a DELETED
   * binding, and an emptied map omits the key entirely, because the encoder
   * refuses both `actions: []` ("omit the key instead") and a binding that
   * "declares no bindings". The panel edits one creature and knows nothing about
   * the room it lives in. */
  const setMonsterOrders = useCallback(
    (id: string, next: RoomMonsterBinding | undefined) => {
      const bindings = withBinding(roomDraft.room.monsterBindings, id, next);
      const room: RoomGameplayData = { ...roomDraft.room };
      if (bindings === undefined) delete room.monsterBindings;
      else room.monsterBindings = bindings;
      commit(scene, selectedIds, room, roomDraft.workspace);
    },
    [commit, roomDraft.room, roomDraft.workspace, scene, selectedIds]
  );

  /** One placed item's door state (rpg-project#485). The MAP is normalized
   * here rather than in the panel, for `setMonsterOrders`' reason: the panel
   * edits one door and knows nothing about the room it lives in. ONE
   * difference, and it is the whole asymmetry between the two declaration
   * kinds — an unauthored monster override is a DELETED binding, but an
   * unlocked door is an EMPTY one, because `{}` is how the engine says "a
   * door, open". Only the author choosing "not a door" deletes.
   *
   * MAKING AN ITEM A DOOR ALSO GIVES IT A FOOTPRINT, and that is not this
   * callback reaching outside its noun: a door's SHAPE *is* its
   * `propDeclarations` entry, the engine refuses a door without one ("a door
   * needs a footprint"), and this is the layer holding the measured mesh.
   * Seeding is the same per-item measurement every other declaration gets,
   * and its two flags are false — which is exactly what the engine asks of a
   * door, since the door's state is what decides.
   *
   * An item that ALREADY has a declaration keeps it untouched, flags and box
   * both: the author tuned it, and silently re-measuring it here would undo
   * that on every state change. */
  const setDoorBinding = useCallback(
    (id: string, next: RoomDoorBinding | undefined) => {
      const bindings = withDoorBinding(roomDraft.room.doorBindings, id, next);
      const room: RoomGameplayData = { ...roomDraft.room };
      if (bindings === undefined) delete room.doorBindings;
      else room.doorBindings = bindings;
      if (next !== undefined && room.propDeclarations[id] === undefined) {
        room.propDeclarations = {
          ...room.propDeclarations,
          ...seedDeclarations(
            [id],
            (itemId) => measuredBounds.get(itemId)?.bounds
          ),
        };
      }
      commit(scene, selectedIds, room, roomDraft.workspace);
    },
    [
      commit,
      measuredBounds,
      roomDraft.room,
      roomDraft.workspace,
      scene,
      selectedIds,
    ]
  );

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
    if (
      studioPresentation &&
      (activeStudioTargetRef.current?.kind !== 'scene' ||
        studioTargetKey(activeStudioTargetRef.current) !==
          studioTargetKey({ kind: 'scene', ids: selectedIds }) ||
        selectionRevisionRef.current !== selectionRevision)
    )
      return;
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
  }, [
    commit,
    idFactory,
    roomDraft.room,
    scene,
    selectedIds,
    studioPresentation,
    selectionRevision,
  ]);

  const remove = useCallback(() => {
    if (
      studioPresentation &&
      (activeStudioTargetRef.current?.kind !== 'scene' ||
        studioTargetKey(activeStudioTargetRef.current) !==
          studioTargetKey({ kind: 'scene', ids: selectedIds }) ||
        selectionRevisionRef.current !== selectionRevision)
    )
      return;
    if (selectedIds.length === 0) return;
    commit(deleteSelection(scene, selectedIds), []);
  }, [commit, scene, selectedIds, studioPresentation, selectionRevision]);

  const undo = useCallback(() => {
    if (refuseWhilePublishing()) return;
    if (roomMode) cancelTransients();
    else setPreviewScene(null);
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
    if (activeStudioTargetRef.current?.kind === 'scene')
      activateStudioTarget(null);
    setNotice('');
  }, [
    activateStudioTarget,
    cancelTransients,
    refuseWhilePublishing,
    roomMode,
    setRoomHistory,
  ]);
  const redo = useCallback(() => {
    if (refuseWhilePublishing()) return;
    if (roomMode) cancelTransients();
    else setPreviewScene(null);
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
    if (activeStudioTargetRef.current?.kind === 'scene')
      activateStudioTarget(null);
    setNotice('');
  }, [
    activateStudioTarget,
    cancelTransients,
    refuseWhilePublishing,
    roomMode,
    setRoomHistory,
  ]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable ||
        (studioViewRef.current !== undefined && target?.tagName === 'SELECT')
      ) {
        return;
      }
      if (event.key === 'Escape') setPaintingConcealmentId(null);
      // Membership picking must not rotate, duplicate or delete a previous
      // scene selection. Undo/redo still operate on the document below.
      if (
        activeConcealmentId &&
        ['Delete', 'Backspace', 'r', 'R', 'd', 'D'].includes(event.key)
      )
        return;
      if (
        studioViewRef.current !== undefined &&
        roomTool === 'door' &&
        ['Delete', 'Backspace', 'r', 'R', 'd', 'D'].includes(event.key)
      )
        return;
      const modifier = event.ctrlKey || event.metaKey;
      if (
        studioViewRef.current !== undefined &&
        ['Delete', 'Backspace', 'r', 'R', 'd', 'D'].includes(event.key) &&
        activeStudioTargetRef.current?.kind !== 'scene' &&
        !(
          ['Delete', 'Backspace'].includes(event.key) &&
          (activeStudioTargetRef.current?.kind === 'actor' ||
            activeStudioTargetRef.current?.kind === 'start')
        )
      )
        return;
      if (
        studioViewRef.current === 'layout' &&
        (event.key === 'Delete' ||
          event.key === 'Backspace' ||
          event.key.toLowerCase() === 'r' ||
          (modifier && event.key.toLowerCase() === 'd'))
      )
        return;
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (modifier && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        if (studioViewRef.current !== undefined) {
          if (activeStudioTargetRef.current?.kind === 'scene') remove();
          else if (activeStudioTargetRef.current?.kind === 'door')
            removeSelectedStudioDoor();
          else removeSelectedStudioActor();
        } else if (roomMode && selectedActorId) removeActor(selectedActorId);
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
    activeConcealmentId,
    applyToSelection,
    duplicate,
    redo,
    remove,
    removeActor,
    removeSelectedStudioActor,
    removeSelectedStudioDoor,
    roomMode,
    roomTool,
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

  // Authored structural walls (Task 3). Derived visual pieces are never scene
  // props; every wall edit goes through the existing validated room commit.
  const walls = useMemo(
    () => roomDraft.room.walls ?? [],
    [roomDraft.room.walls]
  );
  const wallAssetOptions = useMemo(() => {
    if (!roomMode) return [];
    return repeatableWallAssetRefs().map((ref) => ({
      ref,
      label: WORLD_BUILDING_CATALOG_BY_REF.get(ref)?.label ?? ref,
    }));
  }, [roomMode]);
  const wallDoorAssetOptions = useMemo(() => {
    if (!roomMode) return [];
    return attachableDoorAssetRefs().map((ref) => ({
      ref,
      label: WORLD_BUILDING_CATALOG_BY_REF.get(ref)?.label ?? ref,
    }));
  }, [roomMode]);
  const commitWalls = useCallback(
    (nextWalls: StructuralWall[]) => {
      return commit(scene, selectedIds, {
        ...roomDraft.room,
        walls: nextWalls,
      });
    },
    [commit, roomDraft.room, scene, selectedIds]
  );
  const commitDoorWall = (
    nextWall: StructuralWall,
    removeId?: string,
    closedId?: string
  ): boolean => {
    const bindings = removeId
      ? withDoorBinding(roomDraft.room.doorBindings, removeId, undefined)
      : closedId
        ? withDoorBinding(
            roomDraft.room.doorBindings,
            closedId,
            setDoorBindingState(undefined, 'closed')
          )
        : roomDraft.room.doorBindings;
    const room = {
      ...roomDraft.room,
      walls: walls.map((wall) => (wall.id === nextWall.id ? nextWall : wall)),
    };
    if (bindings === undefined) delete room.doorBindings;
    else room.doorBindings = bindings;
    return commit(scene, selectedIds, room);
  };
  const createStudioWall = useCallback(
    (line: WallLine): boolean => {
      if (refuseWhilePublishing()) return false;
      const entry = wallAssetRef
        ? WORLD_BUILDING_CATALOG_BY_REF.get(wallAssetRef)
        : undefined;
      if (
        !entry ||
        entry.source !== 'generated' ||
        !wallAssetOptions.some((option) => option.ref === entry.ref)
      ) {
        setNotice('Select a repeatable wall asset before drawing.');
        return false;
      }
      const limit = roomDraft.workspace.horizontalLimit;
      if (
        [line.start, line.end].some(
          (point) =>
            !Number.isFinite(point.x) ||
            !Number.isFinite(point.z) ||
            Math.abs(point.x) > limit ||
            Math.abs(point.z) > limit
        )
      ) {
        setNotice(
          `Wall rejected; endpoints must stay inside the authoring workspace (±${limit}).`
        );
        return false;
      }
      try {
        const wall = createWall({
          id: idFactory(),
          start: line.start,
          end: line.end,
          assetRef: entry.ref,
          // Provider catalog dimensions are already at shared runtime scale.
          height: entry.asset.boundsMeters[1],
          thickness: entry.asset.boundsMeters[2],
          elevation: 0,
        });
        if (!commit(scene, [], { ...roomDraft.room, walls: [...walls, wall] }))
          return false;
        setSelectedIds([]);
        setSelectedActorId(null);
        setSelectedWallId(wall.id);
        activateStudioTarget({ kind: 'wall', id: wall.id });
        return true;
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error));
        return false;
      }
    },
    [
      commit,
      idFactory,
      activateStudioTarget,
      refuseWhilePublishing,
      roomDraft.room,
      roomDraft.workspace,
      scene,
      walls,
      wallAssetRef,
      wallAssetOptions,
    ]
  );
  // Legacy World Builder keeps its one-shot drawing behavior. Studio owns
  // its drawing mode and must be able to submit consecutive gestures.
  const createWallFromGesture = useCallback(
    (line: WallLine): boolean => {
      if (!createStudioWall(line)) return false;
      setRoomTool('select');
      setTool('select');
      return true;
    },
    [createStudioWall]
  );
  const selectStudioWall = useCallback(
    (id: string | null): boolean => {
      if (refuseWhilePublishing()) return false;
      if (id !== null && !walls.some((wall) => wall.id === id)) {
        setNotice(`Wall selection refused; unknown wall ${id}.`);
        return false;
      }
      setSelectedWallId(id);
      if (id || activeStudioTargetRef.current?.kind === 'wall')
        activateStudioTarget(id ? { kind: 'wall', id } : null);
      setPreviewWall(null);
      if (id) {
        setPreviewScene(null);
        if (!studioPresentation) {
          setSelectedIds([]);
          setSelectedActorId(null);
        }
      }
      return true;
    },
    [activateStudioTarget, refuseWhilePublishing, studioPresentation, walls]
  );
  const selectWall = useCallback(
    (id: string | null) => {
      if (!selectStudioWall(id)) return;
      if (id) {
        const nextTool =
          roomTool === 'move' || roomTool === 'rotate' ? roomTool : 'select';
        setRoomTool(nextTool);
        setTool(nextTool);
      }
    },
    [roomTool, selectStudioWall]
  );
  const editWall = useCallback(
    (next: StructuralWall): boolean => {
      if (!walls.some((wall) => wall.id === next.id)) {
        setNotice(`Wall edit refused; unknown wall ${next.id}.`);
        return false;
      }
      return commitWalls(
        walls.map((entry) => (entry.id === next.id ? next : entry))
      );
    },
    [commitWalls, walls]
  );
  const rotateSelectedWall = useCallback(
    (angle: number) => {
      if (refuseWhilePublishing()) return;
      if (
        studioPresentation &&
        (activeStudioTargetRef.current?.kind !== 'wall' ||
          activeStudioTargetRef.current.id !== selectedWallId ||
          selectionRevisionRef.current !== selectionRevision)
      )
        return;
      const wall = walls.find((entry) => entry.id === selectedWallId);
      if (!wall) return;
      setPreviewWall(null);
      try {
        editWall(
          previewWallTransform({
            wall,
            mode: 'rotate',
            change: { x: 0, z: 0, rotationY: angle },
          })
        );
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error));
      }
    },
    [
      editWall,
      refuseWhilePublishing,
      selectedWallId,
      walls,
      studioPresentation,
      selectionRevision,
    ]
  );
  useEffect(
    () => setPreviewWall(null),
    [roomTool, selectedWallId, roomDraft.room.walls]
  );

  const removeWall = useCallback(
    (id: string): boolean => {
      if (!walls.some((wall) => wall.id === id)) {
        setNotice(`Wall removal refused; unknown wall ${id}.`);
        return false;
      }
      if (!commitWalls(walls.filter((entry) => entry.id !== id))) return false;
      if (selectedWallId === id) setSelectedWallId(null);
      return true;
    },
    [commitWalls, selectedWallId, walls]
  );
  /** One attached-door mutation is ONE room-history transaction that moves the
   * opening's `door` record and its `doorBindings` entry together. The door id
   * comes from the existing id factory; the binding uses the existing
   * open/closed/locked grammar. Removing an opening or wall cleans its owned
   * bindings through `reconcileRoomDraft` in the same commit (history restores
   * both together). Every path is behind the publishing lock. */
  const mutateWallDoor = useCallback(
    (mutation: WallDoorMutation): boolean => {
      if (refuseWhilePublishing()) return false;
      const wall = walls.find((entry) => entry.id === mutation.wallId);
      if (!wall) {
        setNotice(`Unknown wall ${mutation.wallId}.`);
        return false;
      }
      try {
        let nextWall = wall;
        let nextBindings = roomDraft.room.doorBindings;
        const opening = wall.openings.find(
          (entry) => entry.id === mutation.openingId
        );
        if (!opening) throw new Error(`Unknown opening ${mutation.openingId}.`);
        switch (mutation.kind) {
          case 'attach': {
            const doorId = idFactory();
            nextWall = attachDoorToOpening(wall, {
              openingId: mutation.openingId,
              doorId,
              assetRef: mutation.assetRef,
            });
            nextBindings = withDoorBinding(
              nextBindings,
              doorId,
              setDoorBindingState(undefined, 'closed')
            );
            break;
          }
          case 'swap': {
            nextWall = swapOpeningDoorAsset(wall, {
              openingId: mutation.openingId,
              assetRef: mutation.assetRef,
            });
            break;
          }
          case 'remove': {
            if (!opening.door) throw new Error('That opening has no door.');
            nextBindings = withDoorBinding(
              nextBindings,
              opening.door.id,
              undefined
            );
            nextWall = removeDoorFromOpening(wall, mutation.openingId);
            break;
          }
          case 'binding': {
            if (!opening.door) throw new Error('That opening has no door.');
            nextBindings = withDoorBinding(
              nextBindings,
              opening.door.id,
              mutation.binding
            );
            break;
          }
        }
        const room: RoomGameplayData = {
          ...roomDraft.room,
          walls: walls.map((entry) =>
            entry.id === wall.id ? nextWall : entry
          ),
        };
        if (nextBindings === undefined) delete room.doorBindings;
        else room.doorBindings = nextBindings;
        return commit(scene, selectedIds, room, roomDraft.workspace);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error));
        return false;
      }
    },
    [
      commit,
      idFactory,
      refuseWhilePublishing,
      roomDraft.room,
      roomDraft.workspace,
      scene,
      selectedIds,
      walls,
    ]
  );
  // A wall vanished (Undo, delete, reload): no stale selection or transform
  // controls remain.
  useEffect(() => {
    if (selectedWallId && !walls.some((entry) => entry.id === selectedWallId))
      setSelectedWallId(null);
  }, [walls, selectedWallId]);

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
      const error = saveRoomDraft(effectiveStorage, roomDraft, siteScope);
      if (!error) {
        markAutosaveBlocked(false);
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

  /** One confirm for a new blank document, shared by the composer's own
   * chrome and the room Library's document section. */
  const confirmNewDocument = () => {
    if (refuseWhilePublishing()) return;
    const blank = createEmptyScene(idFactory());
    const freshRoom = createRoomDraft(blank, idFactory());
    const resetError = roomMode
      ? saveRoomDraft(effectiveStorage, freshRoom, {})
      : null;
    if (roomMode && !resetError) {
      markAutosaveBlocked(false);
      workspaceOriginRef.current = 'local';
      setWorkspaceOrigin('local');
    }
    commit(
      blank,
      [],
      roomMode ? freshRoom.room : roomDraft.room,
      roomMode ? freshRoom.workspace : roomDraft.workspace,
      roomMode ? freshRoom.name : undefined,
      roomMode ? freshRoom.id : undefined,
      // A fresh document authors no policies: New room empties the scope
      // rather than carrying the replaced document's factions forward.
      roomMode ? {} : undefined
    );
    if (roomMode) cancelTransients();
    setTool('select');
    setActiveDrag(null);
    setConfirmBlank(false);
    if (resetError) {
      setNotice(resetError);
      setSaveStatus('New room kept in memory — prior stored bytes preserved');
    }
  };

  /** The workspace-size control lives with the canvas it resizes. */
  const expandWorkspace = () => {
    const expanded = expandRoomWorkspace(roomDraft);
    if (expanded === roomDraft) return;
    commit(scene, selectedIds, roomDraft.room, expanded.workspace);
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
      const nextLibrary = validateLibrary({
        ...library,
        arrangements: [...library.arrangements, arrangement],
      });
      if (roomMode) {
        const declarations = Object.fromEntries(
          arrangement.items.flatMap((item) => {
            const declaration = roomDraft.room.propDeclarations[item.id];
            return declaration
              ? [[item.id, structuredClone(declaration)] as const]
              : [];
          })
        );
        if (
          !commit(scene, selectedIds, {
            ...roomDraft.room,
            arrangementDeclarations: {
              ...roomDraft.room.arrangementDeclarations,
              [arrangement.id]: declarations,
            },
          })
        )
          return;
      }
      setLibrary(nextLibrary);
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
        const imported = validateRoomDocument(
          parseRoomDocumentJson(portableJson)
        );
        cancelTransients();
        const saveError = saveRoomDraft(
          effectiveStorage,
          imported.draft,
          imported.scope
        );
        if (!saveError) {
          markAutosaveBlocked(false);
          workspaceOriginRef.current = 'local';
          setWorkspaceOrigin('local');
        }
        setRoomHistory((current) => ({
          past: [...current.past.slice(-79), structuredClone(current.present)],
          // The portable envelope carries the site scope when one was authored
          // (rpg-dnd5e-web#1160), so an imported file is adopted with its own
          // policies rather than inheriting the replaced document's.
          present: { draft: imported.draft, scope: imported.scope },
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
   * room document and its site scope exactly like a room-JSON import and
   * reports acceptance so the panel adopts the file's root key only when the
   * editor truly took the document. Refused while a publishing transaction
   * runs. */
  const importCanonicalRoomYaml = useCallback(
    (imported: RoomDraft, scope: SiteScope): boolean => {
      if (refuseWhilePublishing()) return false;
      try {
        const valid = validateRoomDocument({ draft: imported, scope });
        cancelTransients();
        const saveError = saveRoomDraft(
          effectiveStorage,
          valid.draft,
          valid.scope
        );
        if (!saveError) {
          markAutosaveBlocked(false);
          workspaceOriginRef.current = 'local';
          setWorkspaceOrigin('local');
        }
        setRoomHistory((current) => ({
          past: [...current.past.slice(-79), structuredClone(current.present)],
          present: valid,
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
    [cancelTransients, effectiveStorage, refuseWhilePublishing, setRoomHistory]
  );

  const reopen = () => {
    if (refuseWhilePublishing()) return;
    if (roomMode) {
      const result = loadRoomDraft(effectiveStorage, roomDraft);
      if (result.error) {
        setNotice(result.error);
        return;
      }
      markAutosaveBlocked(false);
      workspaceOriginRef.current = 'local';
      setWorkspaceOrigin('local');
      cancelTransients();
      setRoomHistory({
        past: [],
        // The stored envelope carries the scope beside the draft, so a reopen
        // publishes exactly what was saved — policies included
        // (rpg-dnd5e-web#1160).
        present: { draft: result.value, scope: result.scope },
        future: [],
      });
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
          ? saveRoomDraft(
              effectiveStorage,
              roomDraftRef.current,
              siteScopeRef.current
            )
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
        cancelTransients();
        if (metadata.status !== 'room')
          throw new Error('This snapshot is not a room authoring document.');
        setRoomHistory({
          past: [],
          // A world snapshot is a room document, not a canonical single-room
          // file: it carries no site scope.
          present: { draft: structuredClone(metadata.draft), scope: {} },
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
  const sceneryActionsActive = (): boolean =>
    !studioPresentation ||
    (activeStudioTargetRef.current?.kind === 'scene' &&
      studioTargetKey(activeStudioTargetRef.current) ===
        studioTargetKey({ kind: 'scene', ids: selectedIds }) &&
      selectionRevisionRef.current === selectionRevision);
  const selectedProp =
    selectedIds.length === 1
      ? scene.items.find((item) => item.id === selectedIds[0])
      : undefined;
  /** The selected actor as a placed creature, or undefined for the party
   * start / no selection. The actor half of the design's creature split:
   * identity and placement live here, the orders in its binding. */
  const selectedMonster =
    selectedActorId && selectedActorId !== 'start'
      ? roomDraft.room.monsterDeclarations.find(
          (monster) => monster.id === selectedActorId
        )
      : undefined;
  const updateSelectedLight = (
    update: (current: WorldPointLight) => WorldPointLight
  ) => {
    if (!sceneryActionsActive() || !selectedProp?.pointLight) return;
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
  const selectedHeightValues = [...selectionPropIds(scene, selectedIds)]
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
  /** Which PER-PROP option sections this selection earns (web#1178). A door
   * gets door state, a declared non-door prop gets orders, a multi-selection
   * gets neither and says why — one control cannot mean three props' values.
   * The rule lives in `propOptionSections.ts`, so the panel and its tests
   * cannot drift. */
  const optionSections = selectionOptionSections(
    selectedSceneItems(scene, selectedIds),
    roomDraft.room
  );

  /** The props an authored declaration lands on: the SELECTION, resolved the
   * same way visual height resolves it — group members in, support-linked
   * decorations out (`selectionPropIds`). Not `selectedProp`, which is only
   * ever defined for a single selection and made the panel inert for several. */
  const declarationIds = [...selectionPropIds(scene, selectedIds)];
  /** Selected props that have NO declaration yet. `Add` adds; it must not
   * silently reset a blocker an author already tuned. */
  const undeclaredIds = declarationIds.filter(
    (id) => roomDraft.room.propDeclarations[id] === undefined
  );
  /** The declaration the panel edits. `selectedProp` is undefined for a
   * multi-selection, so a multi-selection edits its first prop's values as
   * the visible state — and every edit is applied to ALL selected props, not
   * just that one. */
  const panelDeclaration =
    selectedDeclaration ??
    (declarationIds.length > 0
      ? roomDraft.room.propDeclarations[declarationIds[0]]
      : undefined);

  /** Seed a declaration for EVERY undeclared selected prop, each from its own
   * measured mesh. A single shared box would hand a long wall a short wall's
   * blocker — the 1×1 default's bug in a new costume. */
  const addDeclarationsToSelection = () => {
    if (undeclaredIds.length === 0) return;
    commit(scene, selectedIds, {
      ...roomDraft.room,
      propDeclarations: {
        ...roomDraft.room.propDeclarations,
        ...seedDeclarations(
          undeclaredIds,
          (id) => measuredBounds.get(id)?.bounds
        ),
      },
    });
    setFootprintPreview(null);
  };

  /** Editing a flag or the box is the AUTHOR'S explicit override, so it is
   * applied as written to every selected prop — imposing one box on a whole
   * selection is a legitimate thing to want, and it is the only way the
   * blocking checkboxes do anything for more than one prop. */
  const commitSelectedDeclaration = (declaration: RoomPropDeclaration) => {
    if (declarationIds.length === 0) return;
    commit(scene, selectedIds, {
      ...roomDraft.room,
      propDeclarations: declarationMapForSelection(
        roomDraft.room.propDeclarations,
        declarationIds,
        declaration
      ),
    });
    setFootprintPreview(null);
  };

  /** The document's one explicit rename. In room mode it is the site's
   * identity (The site) and it also moves the published draft name in the
   * same single Undo; in the composer it is the scene's name (Edit). */
  const renameDocument = useCallback(
    (value: string): boolean => {
      if (refuseWhilePublishing()) return false;
      const name = value.trim();
      if (!name || name.length > 120) {
        setSceneNameDraft(scene.name);
        setNotice(
          !name
            ? roomMode
              ? 'Room name cannot be empty.'
              : 'Scene name cannot be empty.'
            : 'Document name cannot exceed 120 characters.'
        );
        return false;
      }
      if (name === scene.name && (!roomMode || name === roomDraft.name)) {
        setSceneNameDraft(name);
        return true;
      }
      if (
        !commit(
          { ...scene, name },
          selectedIds,
          roomDraft.room,
          roomDraft.workspace,
          roomMode ? name : undefined
        )
      )
        return false;
      setSceneNameDraft(name);
      return true;
    },
    [commit, refuseWhilePublishing, roomDraft, roomMode, scene, selectedIds]
  );
  const commitDocumentName = (): void => {
    renameDocument(sceneNameDraft);
  };

  /** Flip a blocking answer on every selected prop WITHOUT touching any
   * footprint (PR #1127 review, Important).
   *
   * The checkbox must not go through `commitSelectedDeclaration`: for a
   * multi-selection the panel's visible declaration is the first prop's, so
   * spreading it would collapse ten per-prop boxes onto wall #1's — silently
   * undoing the per-item seeding this slice exists to provide, and putting
   * the author right back to hand-tuning every wall.
   *
   * A flag is a flag; an outline is an outline. Imposing one box across a
   * selection stays available, but only by actually dragging a box slider. */
  const commitSelectedFlags = (
    patch: Partial<
      Pick<RoomPropDeclaration, 'blocksMovement' | 'blocksLineOfSight'>
    >
  ) => {
    if (declarationIds.length === 0) return;
    const propDeclarations = { ...roomDraft.room.propDeclarations };
    for (const id of declarationIds) {
      const existing = propDeclarations[id];
      if (!existing) continue;
      propDeclarations[id] = { ...existing, ...patch };
    }
    commit(scene, selectedIds, { ...roomDraft.room, propDeclarations });
    setFootprintPreview(null);
  };
  /** The immutable-snapshot list, named for the screen it is on. The composer
   * keeps its own `World compositions` library (the design leaves that screen
   * as it already is); the Site editor shows the same verbs as its **revision
   * history** inside the Identity panel, where the old `Library` destination's
   * saving and opening live. Permanent deletion is composer-only: it is not
   * offered for the document you are looking at. */
  const snapshotListSection = (options: {
    ariaLabel: string;
    heading: string;
    worldId: string;
    saveRoomSnapshot: boolean;
    allowDelete: boolean;
    loadingCopy: string;
    emptyCopy: string;
  }) => (
    <section aria-label={options.ariaLabel}>
      <div className="wb-library-heading">
        <h3>{options.heading}</h3>
        {options.saveRoomSnapshot && compositionSource?.writer && (
          <button
            disabled={worldBusy || publishBusy}
            onClick={() => void saveCompositionToWorld()}
          >
            {worldBusy
              ? 'Saving room snapshot…'
              : 'Save room snapshot to world'}
          </button>
        )}
        <button
          disabled={compositionList.status === 'loading' || worldBusy}
          onClick={() => setCompositionRefresh((current) => current + 1)}
        >
          Reload world library
        </button>
      </div>
      <p className="wb-help">
        Current world: <strong>{options.worldId}</strong>. Saves are immutable;
        editing and saving again creates a new ID. Permanent deletion does not
        change dungeon placements; remove those references explicitly in each
        dungeon.
      </p>
      {lastWorldSave && (
        <p className="wb-help">Latest snapshot ID: {lastWorldSave}</p>
      )}
      {compositionList.status === 'loading' && <p>{options.loadingCopy}</p>}
      {compositionList.status === 'error' && (
        <p className="wb-library-error">
          Could not load world compositions: {compositionList.message}
        </p>
      )}
      {compositionList.status === 'ready' &&
        visibleCompositions.length === 0 && <p>{options.emptyCopy}</p>}
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
                metadata.status === 'error' ? 'wb-library-error' : undefined
              }
            >
              <strong>{label}</strong>
              <small>
                {metadata.status === 'ready' || metadata.status === 'room'
                  ? 'Immutable world snapshot'
                  : `Could not open this saved composition. ${metadata.message}`}
              </small>
              {(metadata.status === 'ready' || metadata.status === 'room') && (
                <button
                  disabled={worldBusy}
                  onClick={() => void openComposition(composition.id)}
                >
                  Open {metadata.name}
                </button>
              )}
              {!options.allowDelete ||
              !compositionSource?.writer ? null : !confirming ? (
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
                    Permanently delete “{label}”? This cannot be undone. Dungeon
                    placements that use it will remain as deleted or missing
                    references until you remove them explicitly.
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
  );

  /** The composer's own library: unchanged. */
  const worldLibrarySection =
    !roomMode && compositionSource
      ? snapshotListSection({
          ariaLabel: 'World composition library',
          heading: 'World compositions',
          worldId: compositionSource.worldId,
          saveRoomSnapshot: false,
          allowDelete: true,
          loadingCopy: 'Loading world compositions…',
          emptyCopy: 'No saved compositions in this world.',
        })
      : null;

  /** The Site editor's revision history, inside the Identity panel. It is the
   * same save/open verbs as the composer's library, so it is built from the
   * same helper rather than re-using the composer's block wholesale: on the
   * document screen it is identity admin, not a place you "go to". */
  const revisionHistorySection =
    roomMode && compositionSource
      ? snapshotListSection({
          ariaLabel: 'Revision history',
          heading: 'Revision history',
          worldId: compositionSource.worldId,
          saveRoomSnapshot: true,
          allowDelete: false,
          loadingCopy: 'Loading saved rooms…',
          emptyCopy: 'No saved rooms in this world.',
        })
      : null;

  const arrangementLibrarySection = (
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
                writeWorldBuildingDragPayload(event.dataTransfer, payload);
                setActiveDrag(payload);
              }}
              onDragEnd={() => setActiveDrag(null)}
            >
              <strong>{arrangement.name}</strong>
              <small>
                {arrangement.items.length} editable props · drag to ground for
                an independent copy
              </small>
            </article>
          );
        })}
      </div>
    </section>
  );

  const portableJsonDetails = (
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
            try {
              const json = roomMode
                ? stringifyRoomDraft(roomDraft, siteScope)
                : stringifyScene(scene);
              setPortableJson(json);
              downloadJson(
                roomMode
                  ? 'room-authoring-draft.json'
                  : 'world-building-scene.json',
                json
              );
            } catch (error) {
              setNotice(
                `Export refused; the open document was kept. ${
                  error instanceof Error ? error.message : String(error)
                }`
              );
            }
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
  );

  const numberFrom = (value: string): number =>
    value.trim() === '' ? Number.NaN : Number(value);

  /** Jumping to a room moves the camera and nothing else — a room is a camera
   * target, not a scope. There is exactly one room today (the document root has
   * `room` singular), so the camera is already there and this is deliberately
   * inert; the jump lands with `rooms[]` and the authored-door contract
   * (rpg-project#468 / rpg-dnd5e-web#1117). */
  const focusRoom = () => {
    // Intentionally empty: the list exists now so room navigation is visibly
    // navigation, and jumping must never change the site's right-hand nouns.
  };

  // These actions only set transient palette state. Document mutation remains
  // owned by the existing guarded viewport/drop/repeat commit paths. No owner
  // snapshot or latest-ref indirection is captured by a card callback.
  const startPaletteDrag = useCallback(
    (ref: string, transfer: DataTransfer): void => {
      const payload: WorldBuildingDragPayload = { kind: 'prop', id: ref };
      writeWorldBuildingDragPayload(transfer, payload);
      setActiveDrag(payload);
      if (roomMode) {
        setRepeatAssetRef(null);
        setRoomTool((current) => (current === 'repeat' ? 'select' : current));
      }
    },
    [roomMode]
  );
  const finishPaletteDrag = useCallback((): void => setActiveDrag(null), []);
  const repeatPaletteAsset = useCallback((ref: string): void => {
    setPreviewScene(null);
    setRepeatAssetRef(ref);
    setRoomTool('repeat');
    setNotice('');
  }, []);

  // Keep queue keys alive when demand pauses: the existing serial queue owns
  // one cache, and this is its only renderer in both Studio and legacy views.
  const thumbnailHost =
    (studioView !== 'layout' || studioPresentation?.thumbnailDemand === true) &&
    generatedThumbnails.active ? (
      <WorldAssetThumbnailRenderer
        entry={generatedThumbnails.active.entry}
        requestKey={generatedThumbnails.active.key}
        onComplete={generatedThumbnails.recordComplete}
        onError={generatedThumbnails.recordError}
        onRootError={generatedThumbnails.recordRootError}
      />
    ) : null;
  const studioWallOptions: readonly StudioWallAppearanceOption[] =
    wallAssetOptions
      .map(({ ref, label }): StudioWallAppearanceOption => {
        const entry = WORLD_BUILDING_CATALOG_BY_REF.get(ref);
        const result =
          entry?.source === 'generated'
            ? generatedThumbnails.results[worldAssetThumbnailKey(entry.asset)]
            : undefined;
        return {
          ref,
          label,
          wallMatch: /wall/i.test(`${label} ${ref}`),
          thumbnail:
            result?.status === 'ready' && result.image
              ? { status: 'ready', image: result.image }
              : result?.status === 'error'
                ? {
                    status: 'error',
                    message: result.message ?? 'Thumbnail unavailable',
                  }
                : { status: 'loading' },
        };
      })
      .sort((a, b) => Number(b.wallMatch) - Number(a.wallMatch));

  /** The asset palette body, shared by both editors: the composer keeps it as
   * its left panel, the Site editor puts it inside the `Props` section next to
   * the scene tree because adding a prop and finding a placed prop are the
   * same noun. */
  const assetPalette = (
    <>
      {/* The palette is long and this box is the only way to find anything in
          it, so it stays put while the cards scroll under it (rpg-dnd5e-web#1152). */}
      <label className="wb-palette-search">
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
        {filteredCatalog.map((entry) => (
          <WorldBuildingPaletteCard
            key={entry.ref}
            entry={entry}
            generatedThumbnail={
              entry.source === 'generated'
                ? generatedThumbnails.results[
                    worldAssetThumbnailKey(entry.asset)
                  ]
                : undefined
            }
            roomMode={roomMode}
            repeatDisabled={MAX_ITEMS - scene.items.length < 1}
            onDragStart={startPaletteDrag}
            onDragEnd={finishPaletteDrag}
            onRepeat={repeatPaletteAsset}
          />
        ))}
      </div>
    </>
  );

  /** Tree rows select on click (no checkboxes on the site). A plain click
   * selects just that row; Shift/Ctrl/Cmd extends the selection, mirroring the
   * canvas. */
  const selectTreeRow = (id: string, extend: boolean) => {
    if (!extend) {
      selectInScene([id]);
      return;
    }
    selectInScene(
      selectedIds.includes(id)
        ? selectedIds.filter((current) => current !== id)
        : [...selectedIds, id]
    );
  };
  const siteTreeItem = (item: WorldProp, nested: boolean) => (
    <button
      key={item.id}
      type="button"
      className="wb-tree-row"
      aria-label={`Select ${item.label} ${item.id}`}
      aria-pressed={
        (!studioPresentation ||
          activeStudioTargetRef.current?.kind === 'scene') &&
        selectedIds.includes(item.id)
      }
      onClick={(event) =>
        selectTreeRow(item.id, event.shiftKey || event.metaKey || event.ctrlKey)
      }
    >
      <span>
        {nested ? '↳ ' : ''}
        {item.label}
        {item.supportId ? ' · attached' : ''}
      </span>
    </button>
  );
  /** The Site editor's scene tree: items grouped under their group with loose
   * props after, each row nesting `parentId` (↳) and marking `supportId`. */
  const siteSceneTree = (
    <div className="wb-tree" aria-label="Placed props">
      {scene.items.length === 0 && (
        <p>Blank scene — drag an asset onto the canvas.</p>
      )}
      {scene.groups.map((group) => {
        const members = scene.items.filter(
          (item) => item.parentId === group.id
        );
        return (
          <div className="wb-tree-group" key={group.id}>
            <button
              type="button"
              className="wb-tree-row wb-group-row"
              aria-label={`Select ${group.label} ${group.id}`}
              aria-pressed={
                (!studioPresentation ||
                  activeStudioTargetRef.current?.kind === 'scene') &&
                selectedIds.includes(group.id)
              }
              onClick={(event) =>
                selectTreeRow(
                  group.id,
                  event.shiftKey || event.metaKey || event.ctrlKey
                )
              }
            >
              <span>{group.label}</span>
            </button>
            {members.map((item) => siteTreeItem(item, true))}
          </div>
        );
      })}
      {scene.items
        .filter(
          (item) => !scene.groups.some((group) => group.id === item.parentId)
        )
        .map((item) => siteTreeItem(item, false))}
    </div>
  );

  /** The composer's scene tree is unchanged: checkbox rows. */
  const composerSceneTree = (
    <>
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
    </>
  );

  const undoRedoButtons = (
    <>
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
    </>
  );
  const duplicateDeleteButtons = (
    <>
      <button disabled={publishBusy} onClick={duplicate}>
        Duplicate
      </button>
      <button className="wb-danger" disabled={publishBusy} onClick={remove}>
        Delete
      </button>
    </>
  );
  const groupUngroupActions = (
    <div className="wb-actions">
      <button
        onClick={() => {
          try {
            if (!sceneryActionsActive()) return;
            const id = idFactory();
            commit(
              groupSelection(scene, selectedIds, id, 'Arrangement group'),
              [id]
            );
          } catch (error) {
            setNotice(error instanceof Error ? error.message : String(error));
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
          if (!sceneryActionsActive()) return;
          const groupId = selectedIds[0];
          if (groupId) commit(ungroup(scene, groupId), []);
        }}
      >
        Ungroup
      </button>
    </div>
  );
  /** Cardinal turns. `R` walks 15° at a time, so a right angle is six presses
   * and 180° is twelve — the reason an author asked "how do I rotate 90, 180,
   * 270?". These are the same `rotateSelection` the gizmo and `R` use, so a
   * single prop turns about its own origin and a multi-selection turns about
   * its shared centre, exactly as dragging the ring does. */
  const cardinalRotateActions = (
    <div className="wb-actions" data-testid="rotate-cardinal">
      {(
        [
          ['-90°', -Math.PI / 2],
          ['+90°', Math.PI / 2],
          ['180°', Math.PI],
        ] as const
      ).map(([label, angle]) => (
        <button
          key={label}
          type="button"
          disabled={
            publishBusy || (selectedIds.length === 0 && !selectedWallId)
          }
          aria-label={`Rotate ${label}`}
          onClick={() => {
            if (
              selectedWallId &&
              (!studioPresentation ||
                activeStudioTargetRef.current?.kind === 'wall')
            )
              rotateSelectedWall(angle);
            else
              applyToSelection((current) =>
                rotateSelection(current, selectedIds, angle)
              );
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
  const shortcutsHelp = (
    <p className="wb-help">
      Shortcuts: Delete · Ctrl/Cmd+D · Ctrl/Cmd+Z · Shift+Ctrl/Cmd+Z · R · Esc
    </p>
  );
  const visualHeightEditor =
    selectedIds.length > 0 ? (
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
              if (!sceneryActionsActive()) return;
              if (selectedHeightMixed || next !== selectedHeight)
                commit(setSelectionHeight(scene, selectedIds, next));
            }}
          >
            Apply height
          </button>
        </label>
        <p className="wb-help">
          Grounded at each piece base; width, spacing, and authored position
          stay unchanged.
        </p>
      </div>
    ) : null;
  const declarationEditor =
    roomMode && declarationIds.length > 0 ? (
      <div className="wb-light-editor" aria-label="Authored prop declarations">
        <h4>Movement &amp; sight declaration</h4>
        {undeclaredIds.length > 0 ? (
          <button onClick={addDeclarationsToSelection}>
            {undeclaredIds.length > 1
              ? `Add authored footprint to ${undeclaredIds.length} props`
              : 'Add authored footprint'}
          </button>
        ) : panelDeclaration ? (
          <>
            {declarationIds.length > 1 && (
              <p className="wb-help" data-testid="declaration-scope">
                Flags apply to all {declarationIds.length} selected props, each
                keeping its OWN outline. The outline below is applied to all of
                them only when you move a slider.
              </p>
            )}
            <label className="wb-light-toggle">
              <input
                type="checkbox"
                aria-label="Blocks movement"
                checked={panelDeclaration.blocksMovement}
                onChange={(event) =>
                  commitSelectedFlags({
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
                checked={panelDeclaration.blocksLineOfSight}
                onChange={(event) =>
                  commitSelectedFlags({
                    blocksLineOfSight: event.target.checked,
                  })
                }
              />
              <span>Blocks line of sight</span>
            </label>
            <p className="wb-help">
              Outline is an authored owner-local X/Z rectangle in scene units.
              It moves and rotates with the prop; it does not scale the mesh or
              calculate blocked cells.
            </p>
            {(['width', 'depth', 'offsetX', 'offsetZ'] as const).map(
              (field) => {
                const preview = footprintPreview ?? panelDeclaration;
                const size = field === 'width' || field === 'depth';
                return (
                  <label key={field}>
                    <span>
                      {field} · {preview.footprint[field].toFixed(2)}
                    </span>
                    <input
                      type="range"
                      aria-label={`Footprint ${field}`}
                      min={
                        size
                          ? FOOTPRINT_MINIMUM_EXTENT
                          : -FOOTPRINT_MAXIMUM_OFFSET
                      }
                      max={
                        size
                          ? FOOTPRINT_MAXIMUM_EXTENT
                          : FOOTPRINT_MAXIMUM_OFFSET
                      }
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
                      onPointerUp={() => commitSelectedDeclaration(preview)}
                      onKeyUp={() => commitSelectedDeclaration(preview)}
                    />
                  </label>
                );
              }
            )}
          </>
        ) : null}
      </div>
    ) : null;
  const pointLightEditor = selectedProp ? (
    <div className="wb-light-editor">
      <h4>Visual point light</h4>
      {!selectedProp.pointLight ? (
        <>
          <button
            onClick={() => {
              if (!sceneryActionsActive()) return;
              commit(
                setPropPointLight(scene, selectedProp.id, DEFAULT_POINT_LIGHT)
              );
            }}
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
            Offset/range use scene units. Intensity is a rendering control, not
            physical or D&amp;D illumination.
          </p>
          <button
            className="wb-danger"
            onClick={() =>
              sceneryActionsActive() &&
              commit(setPropPointLight(scene, selectedProp.id, undefined))
            }
          >
            Remove point light
          </button>
        </>
      )}
    </div>
  ) : null;

  /** The Identity panel: document admin for the Site editor, opened from the
   * header and overlaying the canvas. It is the merge of the old `The site`
   * and `Library` destinations — identity (the editable site name), the local
   * draft verbs, the revision history (snapshot save + saved snapshot list),
   * Publish & Play, and the arrangement library and portable JSON that used to
   * live on the Library. Nothing from the old Library is dropped. */
  const identityPanel =
    roomMode && identityOpen ? (
      <section id="wb-identity" className="wb-identity" aria-label="Identity">
        <header className="wb-identity-heading">
          <h3>Identity</h3>
          <button
            type="button"
            disabled={publishBusy}
            title={publishBusy ? 'Save & Play is running…' : undefined}
            onClick={() => setIdentityOpen(false)}
          >
            Close
          </button>
        </header>
        <div className="wb-identity-columns">
          <div className="wb-identity-column">
            <section aria-label="Site identity">
              <h4>Site name</h4>
              <label>
                <span>Site name</span>
                <input
                  aria-label="Site name"
                  value={sceneNameDraft}
                  maxLength={120}
                  onChange={(event) => setSceneNameDraft(event.target.value)}
                  onBlur={commitDocumentName}
                />
              </label>
              <dl className="wb-document-facts">
                <div>
                  <dt>Document</dt>
                  <dd>{roomDraft.id}</dd>
                </div>
                <div>
                  <dt>Walkable cells</dt>
                  <dd>{roomDraft.room.walkableHexes.length}</dd>
                </div>
                <div>
                  <dt>Creatures</dt>
                  <dd>{roomDraft.room.monsterDeclarations.length}</dd>
                </div>
                <div>
                  <dt>Props</dt>
                  <dd>{scene.items.length}</dd>
                </div>
              </dl>
            </section>
            <section aria-label="Local draft">
              <h4>Local draft</h4>
              <p className="wb-help" aria-live="polite">
                {saveStatus}
              </p>
              <div className="wb-actions">
                <button disabled={publishBusy} onClick={saveNow}>
                  Save room draft
                </button>
                <button disabled={publishBusy} onClick={reopen}>
                  Reload room draft
                </button>
                {!confirmBlank ? (
                  <button
                    disabled={publishBusy}
                    onClick={() => setConfirmBlank(true)}
                  >
                    New room
                  </button>
                ) : (
                  <span className="wb-confirm">
                    <button onClick={() => setConfirmBlank(false)}>
                      Keep current
                    </button>
                    <button className="wb-danger" onClick={confirmNewDocument}>
                      Confirm new room
                    </button>
                  </span>
                )}
              </div>
            </section>
            {roomPublishing && (
              <section aria-label="Publish room">
                <h4>Publish &amp; Play</h4>
                <p className="wb-help">
                  Validation and saving run on the authoring server; the local
                  draft and any world snapshot are untouched by refusals.
                </p>
                <RoomPublishingPanel
                  draft={roomDraft}
                  scope={siteScope}
                  capability={roomPublishing}
                  onImportDraft={importCanonicalRoomYaml}
                  onBusyChange={handlePublishBusy}
                />
              </section>
            )}
          </div>
          <div className="wb-identity-column">
            {revisionHistorySection}
            {arrangementLibrarySection}
            {portableJsonDetails}
          </div>
        </div>
      </section>
    ) : null;

  /** The draft envelope as text, or the strict-SHAPE layer's own refusal when
   * an in-progress scope cannot be represented. The editor holds what the
   * author typed, so this must never crash the render: it renders the
   * encoder's sentence instead. */
  const roomDraftJson = useMemo(() => {
    if (!roomMode) return '';
    try {
      return stringifyRoomDraft(roomDraft, siteScope);
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [roomMode, roomDraft, siteScope]);

  const commitFloor = (
    cells: readonly RoomHexCell[],
    mode: 'paint' | 'erase'
  ): boolean => {
    if (refuseWhilePublishing()) return false;
    try {
      const current = roomHistoryRef.current.present;
      return commitRoomDocument({
        draft: updateWalkableHexes(current.draft, cells, mode),
        scope: current.scope,
      });
    } catch (error) {
      return rejectEdit(error);
    }
  };
  const applyRoomIntent = (
    intent: (current: RoomDocument) => RoomDocument
  ): boolean => {
    if (refuseWhilePublishing()) return false;
    try {
      const current = roomHistoryRef.current.present;
      const next = intent(current);
      // Explicit strict intents validate even exact no-ops. The owner equality
      // check still preserves geometry, optional fields, history and storage.
      return commitRoomDocument(next, selectedIds, true);
    } catch (error) {
      return rejectEdit(error);
    }
  };
  // Pure derived metadata: floor/policy/UI changes cannot acquire a witness.
  const regionResolutions = useMemo(
    () => resolveAuthoringRegions(roomDraft),
    [roomDraft]
  );
  const regionLighting = useMemo(
    () =>
      projectRegionLighting(
        roomDraft.scene.authoringRegions ?? [],
        regionResolutions
      ),
    [roomDraft, regionResolutions]
  );
  const selectStudioLabel = (id: string | null): boolean => {
    if (refuseWhilePublishing()) return false;
    if (
      id !== null &&
      !roomDraft.scene.mapLabels?.some((label) => label.id === id)
    )
      return rejectEdit(new Error('Label target no longer exists.'));
    if (id) {
      setPreviewScene(null);
      setPreviewWall(null);
    }
    setSelectedLabelId(id);
    if (id || activeStudioTargetRef.current?.kind === 'label')
      activateStudioTarget(id ? { kind: 'label', id } : null);
    return true;
  };
  const selectStudioActor = (
    target: Extract<StudioArrangeTarget, { kind: 'actor' | 'start' }> | null
  ): void => {
    if (refuseWhilePublishing()) return;
    if (
      target &&
      !projectStudioArrange({
        draft: roomDraft,
        target,
        selectionRevision,
        regionResolutions,
      })
    ) {
      rejectEdit(new Error('Actor target no longer exists.'));
      return;
    }
    setPreviewScene(null);
    setPreviewWall(null);
    setSelectedActorId(
      target?.kind === 'actor' ? target.id : target ? 'start' : null
    );
    activateStudioTarget(target);
  };
  // Document retirement is not an explicit selection revision. Mask absent
  // nouns during this render, before any effects or renderer cleanup run.
  if (
    activeStudioTargetRef.current &&
    !projectStudioArrange({
      draft: roomDraft,
      target: activeStudioTargetRef.current,
      selectionRevision,
      regionResolutions,
    })
  )
    activeStudioTargetRef.current = null;
  const activeStudioTarget = activeStudioTargetRef.current;
  useEffect(() => {
    if (
      selectedLabelId &&
      !roomDraft.scene.mapLabels?.some((label) => label.id === selectedLabelId)
    )
      setSelectedLabelId(null);
  }, [roomDraft, selectedLabelId]);
  const capturedTargetKey = studioTargetKey(activeStudioTarget);
  // Movement is armed for the captured noun, not merely any still-existing
  // actor ID. Selection revisions retire queued clicks without cancelling
  // the general epoch needed by initializing wall/label drags.
  const studioMovementIsActive = (target: StudioArrangeTarget): boolean =>
    roomTool === 'move' &&
    studioTargetKey(target) === capturedTargetKey &&
    studioTargetKey(activeStudioTargetRef.current) === capturedTargetKey &&
    selectionRevisionRef.current === selectionRevision;
  const wallGestureActive = (id: string): boolean =>
    activeStudioTargetRef.current?.kind === 'wall' &&
    activeStudioTargetRef.current.id === id &&
    // A Layout wall drag captures its callback BEFORE pointer-down selects it.
    // Permit that single activation, not a later actor/wall round-trip.
    (selectionRevisionRef.current === selectionRevision ||
      ((activeStudioTarget?.kind !== 'wall' || activeStudioTarget.id !== id) &&
        selectionRevisionRef.current === selectionRevision + 1));
  const labelIntentIsCurrent = (
    id: string,
    initializingDrag = false
  ): boolean =>
    selectionRevisionRef.current === selectionRevision ||
    (initializingDrag &&
      activeStudioTargetRef.current?.kind === 'label' &&
      activeStudioTargetRef.current.id === id &&
      (activeStudioTarget?.kind !== 'label' || activeStudioTarget.id !== id) &&
      selectionRevisionRef.current === selectionRevision + 1);
  const arrange = projectStudioArrange({
    draft: roomDraft,
    target: activeStudioTarget,
    selectionRevision,
    previewScene,
    previewWall,
    previewDoor,
    regionResolutions,
  });
  const commitArrange = (intent: StudioArrangeIntent): boolean => {
    if (
      studioTargetKey(intent.target) !== capturedTargetKey ||
      studioTargetKey(activeStudioTargetRef.current) !== capturedTargetKey ||
      selectionRevisionRef.current !== selectionRevision ||
      !arrange ||
      previewScene ||
      previewWall ||
      previewDoor
    )
      return false;
    try {
      switch (intent.kind) {
        case 'door-edit': {
          const { wall } = requireStudioDoor(roomDraft, intent.target);
          return commitDoorWall(editStudioDoor(wall, intent.target, intent));
        }
        case 'door-remove': {
          const { wall } = requireStudioDoor(roomDraft, intent.target);
          return commitDoorWall(
            removeStudioDoor(wall, intent.target),
            intent.target.doorId
          );
        }
        case 'scene-edit':
          return commit(applyStudioSceneArrange(scene, intent));
        case 'wall-edit': {
          if (
            intent.appearance?.assetRef !== undefined &&
            intent.appearance.assetRef !==
              (arrange.kind === 'wall'
                ? arrange.wall.appearance.assetRef
                : undefined) &&
            !wallAssetOptions.some(
              (option) => option.ref === intent.appearance!.assetRef
            )
          )
            throw new Error('Unsupported wall appearance.');
          return editWall(applyStudioWallArrange(roomDraft, intent));
        }
        case 'wall-remove':
          return removeWall(intent.target.id);
        case 'actor-start':
        case 'start-position':
          return commitRoomDocument({
            draft: applyStudioActorArrange(roomDraft, intent),
            scope: siteScope,
          });
        case 'region-bind':
        case 'region-area':
        case 'region-remove': {
          if (
            arrange.kind !== 'label' ||
            arrange.region?.id !== intent.regionId ||
            arrange.region.labelId !== intent.target.id
          )
            return false;
          const current = roomHistoryRef.current.present;
          const linked = current.draft.scene.authoringRegions?.find(
            (r) => r.id === intent.regionId
          );
          if (!linked || linked.labelId !== intent.target.id) return false;
          const draft =
            intent.kind === 'region-bind'
              ? bindEnclosingWalls(current.draft, intent.regionId)
              : intent.kind === 'region-area'
                ? setExplicitRegionArea(
                    current.draft,
                    intent.regionId,
                    intent.cells
                  )
                : removeRegionAndLabel(current.draft, intent.regionId);
          return commitRoomDocument({ ...current, draft });
        }
        case 'label-remove':
          return applyRoomIntent((current) => {
            const label = current.draft.scene.mapLabels?.find(
              (candidate) => candidate.id === intent.target.id
            );
            if (!label) throw new Error('Label target no longer exists.');
            return {
              ...current,
              draft: deleteMapLabel(current.draft, label.id),
            };
          });
        case 'label-edit': {
          const current = roomHistoryRef.current.present;
          const label = current.draft.scene.mapLabels?.find(
            (candidate) => candidate.id === intent.target.id
          );
          if (!label) throw new Error('Label target no longer exists.');
          let draft = current.draft;
          if (Object.hasOwn(intent, 'regionLighting')) {
            const patch = intent.regionLighting!;
            const linked = current.draft.scene.authoringRegions?.find(
              (region) => region.id === patch.regionId
            );
            if (
              arrange.kind !== 'label' ||
              arrange.region?.id !== patch.regionId ||
              arrange.region.labelId !== label.id ||
              !linked ||
              linked.labelId !== label.id
            )
              return false;
            draft = setRegionLighting(draft, patch.regionId, patch.value);
          }
          if (intent.text !== undefined)
            draft = renameMapLabel(draft, label.id, intent.text);
          if (intent.location)
            draft = moveMapLabel(draft, label.id, {
              ...label.location,
              ...intent.location,
            });
          // Explicit label tokens, even equal values, and empty old intent
          // retain the complete policy gate. Only lighting alone is ordinary.
          const lightingOnly =
            Object.hasOwn(intent, 'regionLighting') &&
            !Object.hasOwn(intent, 'text') &&
            !Object.hasOwn(intent, 'location');
          return commitRoomDocument(
            { ...current, draft },
            selectedIds,
            !lightingOnly
          );
        }
      }
    } catch (error) {
      return rejectEdit(error);
    }
  };
  const doorDocument = roomHistory.present;
  const doorEpoch = viewportGenerationRef.current;
  const doorContextCurrent = useCallback(
    (): boolean =>
      mountedRef.current &&
      roomHistoryRef.current.present === doorDocument &&
      viewportGenerationRef.current === doorEpoch,
    [doorDocument, doorEpoch]
  );
  const doorTargetCurrent = useCallback(
    (target: StudioDoorTarget): boolean => {
      const requested = studioTargetKey(target);
      return (
        requested === studioTargetKey(activeStudioTargetRef.current) &&
        ((selectionRevisionRef.current === selectionRevision &&
          requested === capturedTargetKey) ||
          (selectionRevisionRef.current === selectionRevision + 1 &&
            requested !== capturedTargetKey))
      );
    },
    [selectionRevision, capturedTargetKey]
  );
  const doorPlacementCurrent = useCallback(
    (): boolean =>
      roomTool === 'door' &&
      selectionRevisionRef.current === selectionRevision &&
      studioTargetKey(activeStudioTargetRef.current) === capturedTargetKey,
    [roomTool, selectionRevision, capturedTargetKey]
  );
  const placementCandidate = useCallback(
    (wallId: string, point: WorldPoint): StudioDoorPreview => {
      const wall = roomDraft.room.walls?.find((wall) => wall.id === wallId);
      if (!wall) throw new Error('Unknown placement wall.');
      const entry = doorAssetRef
        ? WORLD_BUILDING_CATALOG_BY_REF.get(doorAssetRef)
        : undefined;
      if (!entry) throw new Error('Choose a complete door appearance first.');
      const width = studioDoorAssetWidth(entry);
      const pose = clampDoorPosition(wall, doorAlongWall(wall, point), width);
      const ids = doorPreviewIds(wall, [
        ...roomDraft.scene.items.map((item) => item.id),
        ...roomDraft.scene.groups.map((group) => group.id),
        ...(roomDraft.scene.mapLabels ?? []).map((label) => label.id),
        ...(roomDraft.scene.authoringRegions ?? []).map((region) => region.id),
        ...roomDraft.room.monsterDeclarations.map((monster) => monster.id),
        ...(roomDraft.room.walls ?? []).flatMap((candidate) => [
          candidate.id,
          ...candidate.openings.flatMap((opening) => [
            opening.id,
            ...(opening.door ? [opening.door.id] : []),
          ]),
        ]),
        ...Object.keys(roomDraft.room.doorBindings ?? {}),
      ]);
      const next = createStudioDoor(wall, {
        ...ids,
        assetRef: entry.ref,
        position: pose.position,
      });
      return {
        valid: true,
        purpose: 'placement',
        wall: next,
        target: { kind: 'door', wallId, ...ids },
        width,
        ...pose,
      };
    },
    [roomDraft, doorAssetRef]
  );
  const showDoorPlacement = useCallback(
    (wallId: string, point: WorldPoint): boolean => {
      if (
        !doorContextCurrent() ||
        !doorPlacementCurrent() ||
        refuseWhilePublishing()
      )
        return false;
      try {
        setPreviewDoor(placementCandidate(wallId, point));
        return true;
      } catch (error) {
        setPreviewDoor({
          valid: false,
          purpose: 'placement',
          wallId,
          point,
          message: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    },
    [
      doorContextCurrent,
      doorPlacementCurrent,
      placementCandidate,
      refuseWhilePublishing,
    ]
  );
  const showDoorMove = useCallback(
    (target: StudioDoorTarget, position: number): boolean => {
      if (
        !doorContextCurrent() ||
        !doorTargetCurrent(target) ||
        refuseWhilePublishing()
      )
        return false;
      try {
        const { wall, opening } = requireStudioDoor(roomDraft, target);
        const pose = clampDoorPosition(wall, position, opening.width);
        const next = editStudioDoor(wall, target, { position: pose.position });
        setPreviewDoor({
          valid: true,
          purpose: 'move',
          wall: next,
          target,
          width: opening.width,
          ...pose,
        });
        return true;
      } catch (error) {
        const wall = roomDraft.room.walls?.find(
          (wall) => wall.id === target.wallId
        );
        if (!wall) return rejectEdit(error);
        setPreviewDoor({
          valid: false,
          purpose: 'move',
          wallId: target.wallId,
          point: wall.line.start,
          message: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    },
    [
      doorContextCurrent,
      doorTargetCurrent,
      refuseWhilePublishing,
      roomDraft,
      rejectEdit,
    ]
  );
  const cancelDoorPreview = useCallback((): void => {
    if (doorContextCurrent()) setPreviewDoor(null);
  }, [doorContextCurrent]);
  const doorEditing: StudioDoorEditing = {
    assetRef: doorAssetRef,
    active: roomTool === 'door',
    options: doorOptions,
    selectedTarget:
      activeStudioTarget?.kind === 'door' ? activeStudioTarget : null,
    preview: previewDoor,
    setAsset: (ref): boolean => {
      if (!doorContextCurrent() || refuseWhilePublishing()) return false;
      if (ref !== null && !doorOptions.some((option) => option.ref === ref))
        return rejectEdit(new Error('Unsupported complete door appearance.'));
      if (ref !== doorAssetRef) {
        cancelTransients();
        setDoorAssetRef(ref);
      }
      return true;
    },
    setActive: (active): boolean => {
      if (!doorContextCurrent() || refuseWhilePublishing()) return false;
      cancelTransients();
      setTool('select');
      setRoomTool(active ? 'door' : 'select');
      if (active) setNotice('');
      return true;
    },
    select: (target): boolean => {
      if (!doorContextCurrent() || refuseWhilePublishing()) return false;
      try {
        if (target) requireStudioDoor(roomDraft, target);
        if (target || activeStudioTargetRef.current?.kind === 'door')
          activateStudioTarget(target);
        setPreviewScene(null);
        setPreviewWall(null);
        return true;
      } catch (error) {
        return rejectEdit(error);
      }
    },
    previewPlacement: showDoorPlacement,
    previewMove: showDoorMove,
    cancelPreview: cancelDoorPreview,
    create: (wallId, point): boolean => {
      if (
        !doorContextCurrent() ||
        !doorPlacementCurrent() ||
        refuseWhilePublishing()
      )
        return false;
      try {
        const preview = placementCandidate(wallId, point);
        if (!preview.valid) return false;
        const source = roomDraft.room.walls!.find(
          (wall) => wall.id === wallId
        )!;
        const openingId = idFactory();
        const doorId = idFactory();
        const wall = createStudioDoor(source, {
          openingId,
          doorId,
          assetRef: doorAssetRef!,
          position: preview.position,
        });
        if (!commitDoorWall(wall, undefined, doorId)) return false;
        setPreviewDoor(null);
        activateStudioTarget({ kind: 'door', wallId, openingId, doorId });
        setTool('select');
        setRoomTool('select');
        return true;
      } catch (error) {
        return rejectEdit(error);
      }
    },
    move: (target, position): boolean => {
      if (
        !doorContextCurrent() ||
        !doorTargetCurrent(target) ||
        refuseWhilePublishing()
      )
        return false;
      try {
        const { wall, opening } = requireStudioDoor(roomDraft, target);
        const pose = clampDoorPosition(wall, position, opening.width);
        const accepted = commitDoorWall(
          editStudioDoor(wall, target, { position: pose.position })
        );
        if (accepted) setPreviewDoor(null);
        return accepted;
      } catch (error) {
        return rejectEdit(error);
      }
    },
  };
  const viewportInputs: WorldBuildingViewportProps = {
    scene: scene,
    previewScene: previewScene,
    selectedIds: selectedIds,
    tool: publishBusy ? 'select' : tool,
    activeDrag: activeDrag,
    roomAuthoring: roomMode
      ? {
          tool: roomTool,
          ...(isStudio
            ? {
                doorEditing,
                intentEpoch: viewportGenerationRef.current,
                regionLighting,
              }
            : {}),
          workspace: roomDraft.workspace,
          walkableHexes: roomDraft.room.walkableHexes,
          concealments: siteScope.concealments,
          activeConcealmentId,
          onConcealmentCellPick: (cell) => {
            if (!activeConcealmentId) return;
            commitPolicies(
              paintConcealmentCells(
                siteScope,
                activeConcealmentId,
                [cell],
                'paint'
              )
            );
          },
          onConcealmentPropPick: (id) => {
            if (!activeConcealmentId) return;
            const structure = walls.some(
              (wall) =>
                wall.id === id ||
                wall.openings.some((opening) => opening.door?.id === id)
            );
            if (structure) {
              commitPolicies(
                setConcealmentProp(siteScope, activeConcealmentId, id, true)
              );
              return;
            }
            if (!scene.items.some((item) => item.id === id)) return;
            // Hidden props must be placements the engine can name.
            // Like making a door, this seeds only a missing shape;
            // existing geometry and blocking flags stay authored.
            const room = roomDraft.room.propDeclarations[id]
              ? roomDraft.room
              : {
                  ...roomDraft.room,
                  propDeclarations: {
                    ...roomDraft.room.propDeclarations,
                    ...seedDeclarations(
                      [id],
                      (itemId) => measuredBounds.get(itemId)?.bounds
                    ),
                  },
                };
            commitPolicies(
              setConcealmentProp(siteScope, activeConcealmentId, id, true),
              room
            );
          },
          repeat: repeatDescriptor,
          walls,
          doorBindings: roomDraft.room.doorBindings,
          selectedWallId,
          previewWall,
          onWallTransformPreview: setPreviewWall,
          onWallTransformCommit: editWall,
          wallSnapEnabled,
          onWallGesture: createWallFromGesture,
          onSelectWall: selectWall,
          monsters: roomDraft.room.monsterDeclarations,
          monsterBindings: roomDraft.room.monsterBindings,
          partyStart: roomDraft.room.partyStart ?? null,
          armedMonsterRef: armedMonsterRef,
          selectedActorId: selectedActorId,
          ...(studioPresentation
            ? {
                selectedActorTarget:
                  studioView === 'layout'
                    ? null
                    : activeStudioTarget?.kind === 'actor' ||
                        activeStudioTarget?.kind === 'start'
                      ? activeStudioTarget
                      : null,
                onSelectActorTarget: selectStudioActor,
              }
            : {}),
          onPlaceMonster: placeMonsterAt,
          onMoveMonster: moveMonsterTo,
          onStartGesture: startGestureAt,
          onSelectActor: (actor) => {
            if (actor) setPreviewScene(null);
            setSelectedActorId(actor);
            activateStudioTarget(
              actor
                ? actor === 'start'
                  ? { kind: 'start' }
                  : { kind: 'actor', id: actor }
                : null
            );
          },
          propDeclarations:
            footprintPreview && selectedProp
              ? {
                  ...roomDraft.room.propDeclarations,
                  [selectedProp.id]: footprintPreview,
                }
              : roomDraft.room.propDeclarations,
          onWalkableGesture: (cells, mode) => {
            if (activeConcealmentId) return;
            commitFloor(cells, mode);
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
              setNotice(error instanceof Error ? error.message : String(error));
            }
          },
        }
      : undefined,
    onSelect: (ids) => {
      // A scenery selection always deselects the actor and any wall:
      // the selections stay distinct and never edit each other.
      if (ids.length > 0 && !studioPresentation) {
        setSelectedActorId(null);
        setSelectedWallId(null);
        setPreviewWall(null);
      } else if (!studioPresentation && roomTool === 'select') {
        setSelectedWallId(null);
        setPreviewWall(null);
      }
      selectInScene(ids);
    },
    onDrop: dropIntoScene,
    onDragFinished: () => setActiveDrag(null),
    onTransformPreview: setPreviewScene,
    onTransformCommit: (next) => commit(next),
    onTransformReject: (message) => {
      setPreviewWall(null);
      setPreviewScene(null);
      setNotice(message);
    },
    onAssetState: (id, state) =>
      setAssetStates((current) =>
        current[id] === state ? current : { ...current, [id]: state }
      ),
    onMeasuredBounds: handleMeasuredBounds,
  };
  const viewportGeneration = viewportGenerationRef.current;
  const viewportDocument = roomHistory.present;
  const guardIntent =
    <Args extends unknown[]>(
      callback: (...args: Args) => boolean
    ): ((...args: Args) => boolean) =>
    (...args) =>
      viewportGenerationRef.current === viewportGeneration && mountedRef.current
        ? callback(...args)
        : false;
  // Wall gestures carry a snapshot, unlike floor/label reducers that can
  // intentionally compose rapid intents against synchronous current state.
  const guardSnapshotIntent = <Args extends unknown[]>(
    callback: (...args: Args) => boolean
  ): ((...args: Args) => boolean) =>
    guardIntent((...args: Args) =>
      roomHistoryRef.current.present === viewportDocument
        ? callback(...args)
        : false
    );
  const viewportIsActive = (): boolean =>
    mountedRef.current &&
    studioViewRef.current !== 'layout' &&
    (!roomMode || roomHistoryRef.current.present === viewportDocument) &&
    viewportGenerationRef.current === viewportGeneration;
  // A callback belongs to THIS presentation only. Unmount cleanup alone
  // cannot fence an already queued drop/transform.
  const guardViewportCallback =
    <Args extends unknown[]>(
      callback: (...args: Args) => void
    ): ((...args: Args) => void) =>
    (...args) => {
      if (viewportIsActive()) callback(...args);
    };
  // The gizmo depends on preview callback identity for cancellation. Keep
  // these stable across preview renders, but retire them on a view/cancel epoch.
  const guardedScenePreview = useCallback(
    (next: WorldScene | null): void => {
      if (
        mountedRef.current &&
        studioViewRef.current !== 'layout' &&
        (!roomMode || roomHistoryRef.current.present === viewportDocument) &&
        viewportGenerationRef.current === viewportGeneration &&
        (!isStudio ||
          (activeStudioTargetRef.current?.kind === 'scene' &&
            studioTargetKey(activeStudioTargetRef.current) ===
              capturedTargetKey &&
            selectionRevisionRef.current === selectionRevision))
      )
        setPreviewScene(next);
    },
    [
      roomMode,
      viewportDocument,
      viewportGeneration,
      isStudio,
      capturedTargetKey,
      selectionRevision,
    ]
  );
  const guardedWallPreview = useCallback(
    (next: StructuralWall | null): void => {
      if (
        mountedRef.current &&
        studioViewRef.current !== 'layout' &&
        (!roomMode || roomHistoryRef.current.present === viewportDocument) &&
        viewportGenerationRef.current === viewportGeneration &&
        (!isStudio ||
          (activeStudioTargetRef.current?.kind === 'wall' &&
            capturedTargetKey ===
              studioTargetKey(activeStudioTargetRef.current) &&
            selectionRevisionRef.current === selectionRevision &&
            (!next || activeStudioTargetRef.current.id === next.id)))
      )
        setPreviewWall(next);
    },
    [
      roomMode,
      viewportDocument,
      viewportGeneration,
      isStudio,
      capturedTargetKey,
      selectionRevision,
    ]
  );
  const viewportProps: WorldBuildingViewportProps =
    !roomMode && studioView === undefined
      ? viewportInputs
      : {
          ...viewportInputs,
          selectedIds:
            studioPresentation && activeStudioTarget?.kind !== 'scene'
              ? EMPTY_STUDIO_SCENE_IDS
              : selectedIds,
          previewScene: studioView === 'layout' ? null : previewScene,
          activeDrag: studioView === 'layout' ? null : activeDrag,
          onSelect: guardViewportCallback(viewportInputs.onSelect),
          onDrop: guardViewportCallback(viewportInputs.onDrop),
          onDragFinished: guardViewportCallback(viewportInputs.onDragFinished),
          onTransformPreview: guardedScenePreview,
          onTransformCommit: guardViewportCallback((next) => {
            if (
              !studioPresentation ||
              (activeStudioTargetRef.current?.kind === 'scene' &&
                studioTargetKey(activeStudioTargetRef.current) ===
                  capturedTargetKey &&
                selectionRevisionRef.current === selectionRevision)
            )
              viewportInputs.onTransformCommit(next);
          }),
          onTransformReject: guardViewportCallback(
            viewportInputs.onTransformReject
          ),
          roomAuthoring: viewportInputs.roomAuthoring && {
            ...viewportInputs.roomAuthoring,
            selectedWallId:
              studioPresentation && activeStudioTarget?.kind !== 'wall'
                ? null
                : selectedWallId,
            selectedActorId:
              studioPresentation &&
              (studioView === 'layout' ||
                (activeStudioTarget?.kind !== 'actor' &&
                  activeStudioTarget?.kind !== 'start'))
                ? null
                : selectedActorId,
            onSelectActorTarget:
              viewportInputs.roomAuthoring.onSelectActorTarget &&
              guardViewportCallback(
                viewportInputs.roomAuthoring.onSelectActorTarget
              ),
            previewWall: studioView === 'layout' ? null : previewWall,
            onWalkableGesture: guardViewportCallback(
              viewportInputs.roomAuthoring.onWalkableGesture
            ),
            onRepeatGesture:
              viewportInputs.roomAuthoring.onRepeatGesture &&
              guardViewportCallback(
                viewportInputs.roomAuthoring.onRepeatGesture
              ),
            onWallTransformPreview: guardedWallPreview,
            onWallTransformCommit:
              viewportInputs.roomAuthoring.onWallTransformCommit &&
              guardViewportCallback((next) => {
                if (!studioPresentation || wallGestureActive(next.id))
                  viewportInputs.roomAuthoring!.onWallTransformCommit!(next);
              }),
            onWallGesture:
              viewportInputs.roomAuthoring.onWallGesture &&
              guardViewportCallback(viewportInputs.roomAuthoring.onWallGesture),
            onSelectWall:
              viewportInputs.roomAuthoring.onSelectWall &&
              guardViewportCallback(viewportInputs.roomAuthoring.onSelectWall),
            onPlaceMonster:
              viewportInputs.roomAuthoring.onPlaceMonster &&
              guardViewportCallback(
                viewportInputs.roomAuthoring.onPlaceMonster
              ),
            onMoveMonster:
              viewportInputs.roomAuthoring.onMoveMonster &&
              guardViewportCallback((id, cell) => {
                if (isStudio) {
                  if (
                    !studioMovementIsActive({ kind: 'actor', id }) ||
                    refuseWhilePublishing()
                  )
                    return;
                  setTool('select');
                }
                viewportInputs.roomAuthoring!.onMoveMonster!(id, cell);
              }),
            onStartGesture:
              viewportInputs.roomAuthoring.onStartGesture &&
              guardViewportCallback((cell) => {
                // Dedicated placement and legacy creation keep their own
                // behavior. Only typed Studio relocation spends Move.
                if (isStudio && roomTool !== 'start') {
                  if (
                    !studioMovementIsActive({ kind: 'start' }) ||
                    refuseWhilePublishing()
                  )
                    return;
                  setTool('select');
                  setRoomTool('select');
                }
                viewportInputs.roomAuthoring!.onStartGesture!(cell);
              }),
            onSelectActor:
              viewportInputs.roomAuthoring.onSelectActor &&
              guardViewportCallback(viewportInputs.roomAuthoring.onSelectActor),
            onConcealmentCellPick:
              viewportInputs.roomAuthoring.onConcealmentCellPick &&
              guardViewportCallback(
                viewportInputs.roomAuthoring.onConcealmentCellPick
              ),
            onConcealmentPropPick:
              viewportInputs.roomAuthoring.onConcealmentPropPick &&
              guardViewportCallback(
                viewportInputs.roomAuthoring.onConcealmentPropPick
              ),
          },
        };
  const renderVisualPropControls = (
    declarations: ReactNode = null
  ): ReactNode =>
    selectedIds.length > 0 ? (
      <>
        <div className="wb-actions">{duplicateDeleteButtons}</div>
        {cardinalRotateActions}
        {groupUngroupActions}
        {visualHeightEditor}
        {declarations}
        {pointLightEditor}
      </>
    ) : null;

  if (roomMode && studioPresentation) {
    return (
      <>
        {thumbnailHost}
        {studioPresentation.render({
          document: roomHistory.present,
          viewportProps,
          intentEpoch: viewportGeneration,
          arrange,
          doorEditing,
          commitArrange: guardSnapshotIntent(commitArrange),
          mapLabelSelection: {
            selectedId:
              activeStudioTarget?.kind === 'label' ? selectedLabelId : null,
            select: guardSnapshotIntent(selectStudioLabel),
          },
          regionEditing: {
            resolutions: regionResolutions,
            createRoomLabel: guardSnapshotIntent(
              (text: string, location: WorldPoint): boolean => {
                if (
                  selectionRevisionRef.current !== selectionRevision ||
                  refuseWhilePublishing()
                )
                  return false;
                try {
                  const current = roomHistoryRef.current.present;
                  return commitRoomDocument(
                    {
                      ...current,
                      draft: createRoomLabel(
                        current.draft,
                        idFactory(),
                        idFactory(),
                        text,
                        location
                      ),
                    },
                    selectedIds,
                    true
                  );
                } catch (error) {
                  return rejectEdit(error);
                }
              }
            ),
            useEnclosingWalls: guardSnapshotIntent(
              (regionId: string): boolean =>
                arrange?.kind === 'label'
                  ? commitArrange({
                      kind: 'region-bind',
                      target: arrange.target,
                      regionId,
                    })
                  : false
            ),
            setExplicitRegionArea: guardSnapshotIntent(
              (regionId: string, cells: readonly RoomHexCell[]): boolean =>
                arrange?.kind === 'label'
                  ? commitArrange({
                      kind: 'region-area',
                      target: arrange.target,
                      regionId,
                      cells,
                    })
                  : false
            ),
            removeRegionAndLabel: guardSnapshotIntent(
              (regionId: string): boolean =>
                arrange?.kind === 'label'
                  ? commitArrange({
                      kind: 'region-remove',
                      target: arrange.target,
                      regionId,
                    })
                  : false
            ),
          },
          renameDocument: guardSnapshotIntent(renameDocument),
          wallEditing: {
            selectedId:
              activeStudioTarget?.kind === 'wall' ? selectedWallId : null,
            assetRef: wallAssetRef,
            snapEnabled: wallSnapEnabled,
            options: studioWallOptions,
            select: guardSnapshotIntent(selectStudioWall),
            setAsset: guardSnapshotIntent((ref: string | null): boolean => {
              if (refuseWhilePublishing()) return false;
              if (
                ref !== null &&
                !wallAssetOptions.some((option) => option.ref === ref)
              ) {
                setNotice(`Wall appearance refused; unsupported asset ${ref}.`);
                return false;
              }
              if (ref !== wallAssetRef) {
                cancelTransients();
                setWallAssetRef(ref);
              }
              return true;
            }),
            setSnap: guardSnapshotIntent((enabled: boolean): boolean => {
              if (refuseWhilePublishing()) return false;
              if (enabled !== wallSnapEnabled) {
                cancelTransients();
                setWallSnapEnabled(enabled);
              }
              return true;
            }),
            create: guardSnapshotIntent(createStudioWall),
            edit: guardSnapshotIntent((next) =>
              !walls.some((wall) => wall.id === next.id) ||
              wallGestureActive(next.id)
                ? editWall(next)
                : false
            ),
            remove: guardSnapshotIntent((id) =>
              !walls.some((wall) => wall.id === id) ||
              (activeStudioTargetRef.current?.kind === 'wall' &&
                activeStudioTargetRef.current.id === id &&
                selectionRevisionRef.current === selectionRevision)
                ? removeWall(id)
                : false
            ),
            reportRefusal: (message: string): void => {
              guardSnapshotIntent(() => {
                setNotice(message);
                return true;
              })();
            },
          },
          canUndo: !publishBusy && roomHistory.past.length > 0,
          canRedo: !publishBusy && roomHistory.future.length > 0,
          undo: () => {
            if (
              viewportGenerationRef.current === viewportGeneration &&
              mountedRef.current
            )
              undo();
          },
          redo: () => {
            if (
              viewportGenerationRef.current === viewportGeneration &&
              mountedRef.current
            )
              redo();
          },
          commitFloor: guardIntent(commitFloor),
          resizeWorkspace: guardIntent((width: number, height: number) =>
            applyRoomIntent((current) =>
              resizeRoomWorkspace(current, width, height)
            )
          ),
          createMapLabel: guardIntent((text: string, location: WorldPoint) =>
            applyRoomIntent((current) => ({
              ...current,
              draft: createMapLabel(current.draft, idFactory(), text, location),
            }))
          ),
          moveMapLabel: guardIntent((id: string, location: WorldPoint) =>
            labelIntentIsCurrent(id, true)
              ? applyRoomIntent((current) => ({
                  ...current,
                  draft: moveMapLabel(current.draft, id, location),
                }))
              : false
          ),
          renameMapLabel: guardIntent((id: string, text: string) =>
            labelIntentIsCurrent(id)
              ? applyRoomIntent((current) => ({
                  ...current,
                  draft: renameMapLabel(current.draft, id, text),
                }))
              : false
          ),
          deleteMapLabel: guardIntent((id: string) =>
            labelIntentIsCurrent(id)
              ? applyRoomIntent((current) => ({
                  ...current,
                  draft: deleteMapLabel(current.draft, id),
                }))
              : false
          ),
          cancelTransients,
          propTool: tool,
          setPropTool: (next) => {
            cancelTransients();
            setTool(next);
            setRoomTool(next);
          },
          propControls: {
            palette: assetPalette,
            tree: siteSceneTree,
            selection:
              activeStudioTarget?.kind === 'scene'
                ? renderVisualPropControls()
                : null,
            arrangeExtras:
              activeStudioTarget?.kind === 'scene' ? (
                <>
                  <div className="wb-actions">{duplicateDeleteButtons}</div>
                  {groupUngroupActions}
                  {pointLightEditor}
                </>
              ) : null,
          },
          saveStatus,
          notice: notice || null,
          autosaveBlocked,
          saveLocalDraft: saveNow,
          dismissNotice: () => setNotice(''),
        })}
      </>
    );
  }

  return (
    <section
      className={`wb-shell ${compositionSource || roomMode ? 'wb-shell--world' : ''}`}
      aria-label={roomMode ? 'Site' : 'World Building Concept'}
      data-transform-preview={previewScene || previewWall ? 'active' : 'idle'}
      data-workspace-origin={workspaceOrigin}
    >
      {thumbnailHost}
      {roomMode ? (
        <header className="wb-header wb-header--site">
          <div className="wb-site-heading">
            {onBack && (
              <button type="button" onClick={onBack}>
                Back
              </button>
            )}
            <h2>{scene.name}</h2>
          </div>
          <div className="wb-save-cluster">
            <button
              type="button"
              aria-label="Identity"
              aria-expanded={identityOpen}
              aria-controls="wb-identity"
              disabled={publishBusy}
              title={
                publishBusy
                  ? 'Save & Play is running…'
                  : 'Identity, local draft, revisions, arrangements and publishing'
              }
              onClick={() => setIdentityOpen((open) => !open)}
            >
              Identity
            </button>
          </div>
        </header>
      ) : (
        <header className="wb-header">
          <div>
            <p className="wb-kicker">
              {compositionSource
                ? `World library · ${compositionSource.worldId}`
                : 'Durable Concepts Lab · web#935'}
            </p>
            <h2>{compositionSource ? 'World Builder' : 'World Building'}</h2>
            <p>Compose freely in world space. Hexes are scale, not slots.</p>
          </div>
          <div className="wb-save-cluster">
            {onBack && <button onClick={onBack}>Back to main menu</button>}
            {/* Prop compositions keep their own chrome: the design leaves that
                screen "as it already is". */}
            <span aria-live="polite">{saveStatus}</span>
            <button disabled={publishBusy} onClick={saveNow}>
              Save local draft
            </button>
            <button disabled={publishBusy} onClick={reopen}>
              Reopen local draft
            </button>
            {compositionSource?.writer && (
              <button
                disabled={worldBusy || publishBusy}
                onClick={() => void saveCompositionToWorld()}
              >
                {worldBusy
                  ? 'Saving composition…'
                  : 'Save composition to world'}
              </button>
            )}
            {!confirmBlank ? (
              <button
                disabled={publishBusy}
                onClick={() => setConfirmBlank(true)}
              >
                New blank scene
              </button>
            ) : (
              <span className="wb-confirm">
                <button onClick={() => setConfirmBlank(false)}>
                  Keep current
                </button>
                <button className="wb-danger" onClick={confirmNewDocument}>
                  Confirm blank scene
                </button>
              </span>
            )}
          </div>
        </header>
      )}

      {/* The one status that must not be lost from the screen: a world snapshot
          open here is NOT locally autosaved, and autosave is paused while the
          stored bytes cannot be read. It sits BELOW the header, which the
          design keeps to Back · site name · Identity and nothing else. */}
      {roomMode && (workspaceOrigin === 'world' || autosaveBlocked) && (
        <p className="wb-save-alert" role="status">
          {saveStatus}
        </p>
      )}

      {notice && (
        <div className="wb-alert" role="alert">
          {notice}
          <button aria-label="Dismiss message" onClick={() => setNotice('')}>
            ×
          </button>
        </div>
      )}

      <div className="wb-workspace">
        {roomMode ? (
          <aside className="wb-panel wb-palette" aria-label="Site outline">
            {/* Rooms — a navigation list. One entry today, because the
                document root has `room` singular; a room is a camera target,
                so this is navigation and not a scope. */}
            <details className="wb-collapse" open>
              <summary aria-label="Rooms">Rooms</summary>
              <ul className="wb-room-nav">
                <li>
                  <button
                    type="button"
                    aria-current="true"
                    aria-label={`Focus room ${roomDraft.name}`}
                    onClick={focusRoom}
                  >
                    {roomDraft.name}
                  </button>
                </li>
              </ul>
              <p className="wb-help">
                One room today. Jumping between rooms waits on `rooms[]` and the
                authored-door contract.
              </p>
            </details>
            {/* Props — the palette and the scene tree in ONE section: "add a
                prop" and "find a prop already placed" are the same noun.
                Collapsed by default. */}
            <details className="wb-collapse">
              <summary aria-label="Props">Props</summary>
              {assetPalette}
              <h4 className="wb-tree-heading">
                Placed props ({scene.items.length})
              </h4>
              {siteSceneTree}
            </details>
          </aside>
        ) : (
          <aside className="wb-panel wb-palette" aria-label="Asset palette">
            <h3>Real asset palette</h3>
            {assetPalette}
          </aside>
        )}

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
                    'wall',
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
                  disabled={roomMode && entry === 'wall' && !wallAssetRef}
                  onClick={() => {
                    setPreviewScene(null);
                    setPreviewWall(null);
                    setPaintingConcealmentId(null);
                    if (entry !== 'repeat') setRepeatAssetRef(null);
                    // Actor arming lives in the Room setup controls; a tool
                    // strip switch always disarms a placement.
                    setArmedMonsterRef(null);
                    if (
                      entry === 'paint' ||
                      entry === 'erase' ||
                      entry === 'rectangle' ||
                      entry === 'repeat' ||
                      entry === 'wall'
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
              {roomMode && activeConcealmentId
                ? 'Click walkable hexes, doors and props to add members · Escape: done'
                : roomMode && roomTool === 'paint'
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
                          : roomMode && roomTool === 'wall'
                            ? wallAssetRef
                              ? `Drag on floor: draw ${WORLD_BUILDING_CATALOG_BY_REF.get(wallAssetRef)?.label ?? 'asset'} wall · release once · Esc/right-click: cancel`
                              : 'Wall unavailable: select a repeatable asset with measured dimensions and no door leaf'
                            : roomMode && roomTool === 'start'
                              ? 'Click the floor: place or move the party start'
                              : roomMode &&
                                  roomTool === 'move' &&
                                  selectedActorId
                                ? selectedActorId === 'start'
                                  ? 'Click the floor: move the party start · Delete: clear it'
                                  : `Click the floor: move monster ${selectedActorId} · Delete: remove it`
                                : tool === 'select'
                                  ? 'Left: select · Shift-left: add selection'
                                  : tool === 'move'
                                    ? 'Drag arrows or planes · Esc/right-click: cancel'
                                    : 'Drag the Y ring · Esc/right-click: cancel'}
            </span>
            {/* Canvas extent is a canvas control, so it lives with the
                  canvas rather than in the room chrome. */}
            {roomMode && (
              <button
                type="button"
                className="wb-workspace-size"
                disabled={
                  roomDraft.workspace.hexRadius ===
                  ROOM_WORKSPACE_STEPS[ROOM_WORKSPACE_STEPS.length - 1]
                    .hexRadius
                }
                onClick={expandWorkspace}
              >
                Expand workspace · radius {roomDraft.workspace.hexRadius} →{' '}
                {expandRoomWorkspace(roomDraft).workspace.hexRadius}
              </button>
            )}
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
          {roomMode && activeConcealmentId && (
            <div className="wb-help" role="status">
              Adding members to “{activeConcealmentId}” — click hexes, doors and
              props.
              <button
                type="button"
                onClick={() => setPaintingConcealmentId(null)}
              >
                Done
              </button>
            </div>
          )}
          <div className="wb-canvas-wrap">
            <WorldBuildingViewport {...viewportProps} />
            {identityPanel}
          </div>
        </main>

        {roomMode ? (
          <WorldBuilderInspector
            selectionSection={selectedWallId ? 'walls' : 'selection'}
            selectionKey={
              selectedIds.length > 0 || selectedMonster || selectedWallId
                ? JSON.stringify([
                    roomDraft.id,
                    selectedMonster?.id,
                    selectedWallId,
                    selectedIds,
                  ])
                : ''
            }
          >
            <details className="wb-collapse" data-inspector-section="edit" open>
              <summary aria-label="Edit">Edit</summary>
              <div className="wb-actions">{undoRedoButtons}</div>
              {shortcutsHelp}
            </details>

            {/* The active nouns of the site, present whichever room the
                  camera is on: they are not a scope and do not change when a
                  room is jumped to. */}
            <details
              className="wb-collapse"
              data-inspector-section="monsters"
              open
            >
              <summary aria-label="Monsters">Monsters</summary>
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
                {roomDraft.room.monsterDeclarations.map((monster) => (
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
                      {paletteNameForRef(monster.ref)} (
                      {monster.startingCell.location.q},{' '}
                      {monster.startingCell.location.r})
                    </span>
                    <button
                      type="button"
                      aria-label={`Move monster ${paletteNameForRef(monster.ref)} ${monster.id}`}
                      aria-pressed={
                        roomTool === 'move' && selectedActorId === monster.id
                      }
                      onClick={() => {
                        // ARMS the move; it does not merely select. Selecting an
                        // actor is what clicking it on the board does, and that
                        // must never relocate it.
                        setSelectedActorId(monster.id);
                        setRoomTool('move');
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
              {selectedActorId === 'start' && (
                <p
                  className="wb-help"
                  data-testid="actor-selection"
                  aria-live="polite"
                >
                  Party start selected — click the floor to move it, or Delete
                  to clear it.
                </p>
              )}
              {selectedActorId && selectedActorId !== 'start' && (
                <p
                  className="wb-help"
                  data-testid="actor-selection"
                  aria-live="polite"
                >
                  Selected monster {selectedActorId} — click the floor to move
                  it, or Delete to remove it.
                </p>
              )}
            </details>

            {/* STRUCTURAL WALLS (Task 3). The panel lists and selects authored
                walls; the repeated appearance pieces on the canvas are derived
                presentation, never scene props. */}
            <details className="wb-collapse" data-inspector-section="walls">
              <summary aria-label="Walls">Walls</summary>
              <StructuralWallPanel
                walls={walls}
                selectedWallId={selectedWallId}
                onSelectWall={selectWall}
                transformActions={cardinalRotateActions}
                assetOptions={wallAssetOptions}
                doorAssetOptions={wallDoorAssetOptions}
                doorBindings={roomDraft.room.doorBindings}
                armedAssetRef={wallAssetRef}
                onArmedAssetChange={setWallAssetRef}
                snapEnabled={wallSnapEnabled}
                onSnapChange={setWallSnapEnabled}
                onEdit={editWall}
                onRemoveWall={removeWall}
                onDoorMutation={mutateWallDoor}
                onNotice={setNotice}
              />
            </details>

            {/* THE SITE'S NOUNS, each its own node (rpg-dnd5e-web#1178
                follow-up). "Policies" was a wrapper over exactly two things —
                factions and dispositions — and a wrapper that names nothing
                its children do not name is a level of nesting that buys
                nothing. It also made Intel's home ambiguous, which is the
                evidence that decided it. Three peers now, collapsed by
                default like Props: the top level is the nouns themselves.
                The form writes the document and the SERVER judges it through
                the publish panel's validation (design slices 3/4, #1160). */}
            <details className="wb-collapse" data-inspector-section="factions">
              <summary aria-label="Factions">Factions</summary>
              <FactionsPanel
                scope={siteScope}
                onChange={commitPolicies}
                onNotice={setNotice}
              />
            </details>

            <details
              className="wb-collapse"
              data-inspector-section="dispositions"
            >
              <summary aria-label="Dispositions">Dispositions</summary>
              <DispositionsPanel
                scope={siteScope}
                room={roomDraft.room}
                onChange={commitPolicies}
              />
            </details>

            <details
              className="wb-collapse"
              data-inspector-section="concealments"
            >
              <summary aria-label="Concealments">Concealments</summary>
              <ConcealmentPanel
                scope={siteScope}
                items={[
                  ...scene.items,
                  ...walls.map((wall) => ({ id: wall.id, label: wall.label })),
                  ...walls.flatMap((wall) =>
                    wall.openings.flatMap((opening) =>
                      opening.door
                        ? [
                            {
                              id: opening.door.id,
                              label: `${wall.label} · ${opening.id} door`,
                            },
                          ]
                        : []
                    )
                  ),
                ]}
                activeId={activeConcealmentId}
                onActivate={(id) => {
                  setPaintingConcealmentId(id);
                  setPreviewScene(null);
                  setActiveDrag(null);
                  setSelectedActorId(null);
                  setArmedMonsterRef(null);
                  setRoomTool('select');
                  setTool('select');
                }}
                onChange={commitPolicies}
              />
            </details>

            <details className="wb-collapse" data-inspector-section="intel">
              <summary aria-label="Intel">Intel</summary>
              {/* The site's knowledge records (web#1176, v2's web#933). A
                  record is a SITE noun held by many creatures, so it lives
                  here and never inside one creature's panel — editing it from
                  a creature would make one placement write another's
                  knowledge. What a record REVEALS is read by the engine when
                  it changes hands; the form never resolves it. */}
              <IntelPanel
                scope={siteScope}
                room={roomDraft.room}
                onChange={commitPolicies}
              />
            </details>

            {/* THE SHARED ANSWER TABLES (rpg-toolkit#1897, web#1201). Beside
                Intel for Intel's own reason: a table is declared once and
                NAMED from whatever answers it, and it stands nowhere — so it
                belongs to the site and never inside one creature's panel.
                Kirk's direction (rpg-project#498): "having the place in the
                builder where we can name the tables at the root like we do
                disposition and others." */}
            <details className="wb-collapse" data-inspector-section="tables">
              <summary aria-label="Tables">Tables</summary>
              <TablesPanel scope={siteScope} onChange={commitPolicies} />
            </details>

            {/* THE SELECTION SCOPE (web#1178). Everything here belongs to the
                  thing (or things) selected on the canvas, not to the site: the
                  transform verbs, the height, the movement/sight declaration,
                  and — one rule for every noun — the selected thing's own
                  options. A creature is a selection too, so it opens the same
                  scope rather than living inside the Monsters roster. */}
            {(selectedIds.length > 0 || selectedMonster) && (
              <section
                className="wb-light-editor"
                aria-label="Selection declarations"
                data-inspector-section="selection"
              >
                <h3>Selection</h3>
                {selectedIds.length > 0 && (
                  <>{renderVisualPropControls(declarationEditor)}</>
                )}

                {/* THE PROP'S OWN OPTIONS (web#1178). A prop has options, and
                    which ones depend on what it is: every prop has a transform,
                    a height and a declaration above; a door adds its state; a
                    declared, non-door prop adds what it does — holdable, what
                    it carries, whether it arrives. These were document
                    sections listing every prop in the room, which is the wrong
                    shape for a setting that belongs to one. */}
                {optionSections.door && selectedProp && (
                  <div
                    className="wb-light-editor"
                    aria-label="Door state"
                    data-testid="selected-door-state"
                  >
                    <h4>Door</h4>
                    <DoorStates
                      items={[selectedProp]}
                      bindings={roomDraft.room.doorBindings}
                      declaredIds={
                        new Set(Object.keys(roomDraft.room.propDeclarations))
                      }
                      onChange={setDoorBinding}
                    />
                  </div>
                )}
                {optionSections.orders && selectedProp && (
                  <div
                    className="wb-light-editor"
                    aria-label="Prop orders"
                    data-testid="selected-prop-orders"
                  >
                    <h4>Prop orders</h4>
                    <PropOrders
                      items={[selectedProp]}
                      bindings={roomDraft.room.propBindings}
                      declaredIds={
                        new Set(Object.keys(roomDraft.room.propDeclarations))
                      }
                      doorIds={
                        new Set(Object.keys(roomDraft.room.doorBindings ?? {}))
                      }
                      recordIds={(siteScope.intel ?? []).map(
                        (record) => record.id
                      )}
                      scope={siteScope}
                      room={roomDraft.room}
                      onChange={setPropBinding}
                    />
                  </div>
                )}
                {/* ONE RULE FOR EVERY NOUN (web#1178): selecting a thing
                    configures that thing. The selected creature's facts sit
                    here, beside the props' sections, instead of inside the
                    Monsters node — the design's creature split made legible
                    (actor carries identity and placement, the binding carries
                    the orders), and reported as what its faction supplies
                    against what the placement overrides (slice 2, web#1157). */}
                {selectedMonster && (
                  <div
                    className="wb-light-editor"
                    aria-label="Creature options"
                    data-testid="selected-creature"
                  >
                    <CreatureOrders
                      scope={siteScope}
                      monster={selectedMonster}
                      room={roomDraft.room}
                      binding={
                        roomDraft.room.monsterBindings?.[selectedMonster.id]
                      }
                      onFactionChange={(faction) =>
                        setMonsterFaction(selectedMonster.id, faction)
                      }
                      onOrdersChange={(next) =>
                        setMonsterOrders(selectedMonster.id, next)
                      }
                    />
                  </div>
                )}
                {optionSections.reason === 'multi-select' && (
                  <p className="wb-help" data-testid="option-sections-multi">
                    {selectedIds.length} props selected — door state and prop
                    orders belong to one prop, so they appear when a single prop
                    is selected. What applies to all of them is above.
                  </p>
                )}
              </section>
            )}
          </WorldBuilderInspector>
        ) : (
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
                  onBlur={commitDocumentName}
                />
              </label>
              <div className="wb-actions">
                {undoRedoButtons}
                {duplicateDeleteButtons}
              </div>
              {groupUngroupActions}
              {cardinalRotateActions}
              {shortcutsHelp}
              {visualHeightEditor}
              {declarationEditor}
              {pointLightEditor}
            </section>

            <section>
              <h3>Scene objects ({scene.items.length})</h3>
              {composerSceneTree}
            </section>
            {worldLibrarySection}
            {arrangementLibrarySection}
            {portableJsonDetails}
          </aside>
        )}
      </div>

      <output data-testid="library-json" hidden>
        {JSON.stringify(library)}
      </output>
      {roomMode && (
        <output data-testid="room-draft-json" hidden>
          {roomDraftJson}
        </output>
      )}
    </section>
  );
}
