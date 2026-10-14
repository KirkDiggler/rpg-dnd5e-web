import { vi } from 'vitest';
import { createRoomDraft } from '../../world-building/roomDraft';
import type { EncounterStudioSession } from '../studioSession';

/** A fake session for presentation tests: real shapes, inert intents. */
export function createFakeStudioSession(
  onCancelTransients: () => void = () => {}
): EncounterStudioSession {
  const draft = createRoomDraft(
    { version: 1, id: 'scene-1', name: 'Studio scene', items: [], groups: [] },
    'room-1'
  );
  return {
    document: { draft, scope: {} },
    intentEpoch: 0,
    regionEditing: {
      resolutions: [],
      createRoomLabel: vi.fn(() => true),
      useEnclosingWalls: vi.fn(() => true),
      setExplicitRegionArea: vi.fn(() => true),
      removeRegionAndLabel: vi.fn(() => true),
    },
    doorEditing: {
      assetRef: null,
      active: false,
      options: [],
      selectedTarget: null,
      preview: null,
      setAsset: vi.fn(() => true),
      setActive: vi.fn(() => true),
      select: vi.fn(() => true),
      previewPlacement: vi.fn(() => true),
      create: vi.fn(() => true),
      previewMove: vi.fn(() => true),
      move: vi.fn(() => true),
      cancelPreview: vi.fn(),
    },
    arrange: null,
    commitArrange: vi.fn(() => true),
    selectHex: vi.fn(() => true),
    clearSelection: vi.fn(() => true),
    armPartyStart: vi.fn(() => true),
    commitTables: vi.fn(() => true),
    cast: {
      save: vi.fn(() => true),
      rename: vi.fn(() => true),
      adopt: vi.fn(() => true),
      remove: vi.fn(() => true),
      removeUnusedLook: vi.fn(() => true),
    },
    creatures: {
      select: vi.fn(() => true),
      armPlacement: vi.fn(() => true),
      placement: null,
      setDefinition: vi.fn(() => true),
    },
    mapLabelSelection: { selectedId: null, select: vi.fn(() => true) },
    renameDocument: vi.fn(() => true),
    wallEditing: {
      selectedId: null,
      assetRef: null,
      snapEnabled: false,
      endpointSnapEnabled: true,
      rightAngleEnabled: false,
      setRightAngle: vi.fn(() => true),
      setEndpointSnap: vi.fn(() => true),
      options: [],
      select: vi.fn(() => true),
      setAsset: vi.fn(() => true),
      setSnap: vi.fn(() => true),
      create: vi.fn(() => true),
      edit: vi.fn(() => true),
      remove: vi.fn(() => true),
      reportRefusal: vi.fn(),
    },
    viewportProps: {
      scene: draft.scene,
      previewScene: null,
      selectedIds: ['selected-prop'],
      tool: 'select',
      activeDrag: null,
      roomAuthoring: {
        tool: 'select',
        workspace: draft.workspace,
        walkableHexes: draft.room.walkableHexes,
        propDeclarations: draft.room.propDeclarations,
        onWalkableGesture: vi.fn(),
      },
      onSelect: vi.fn(),
      onDrop: vi.fn(),
      onDragFinished: vi.fn(),
      onTransformPreview: vi.fn(),
      onTransformCommit: vi.fn(),
      onTransformReject: vi.fn(),
      onAssetState: vi.fn(),
    },
    canUndo: true,
    canRedo: false,
    undo: vi.fn(),
    redo: vi.fn(),
    commitFloor: vi.fn(() => true),
    resizeWorkspace: vi.fn(() => true),
    createMapLabel: vi.fn(() => true),
    moveMapLabel: vi.fn(() => true),
    renameMapLabel: vi.fn(() => true),
    deleteMapLabel: vi.fn(() => true),
    cancelTransients: vi.fn(onCancelTransients),
    propTool: 'select',
    setPropTool: vi.fn(),
    socialControls: {
      intel: null,
      factions: null,
      dispositions: null,
      selection: null,
    },
    propControls: {
      palette: (
        <div>
          <input aria-label="Search reused assets" defaultValue="" />
          <button>Repeat existing piece</button>
        </div>
      ),
      arrangeExtras: <div>Reused actions and light controls</div>,
      groupActions: <div>Reused group actions</div>,
      tree: <div>Reused scene tree</div>,
      selection: <div>Reused selection visuals</div>,
    },
    saveStatus: 'Room authoring draft saved locally',
    notice: null,
    autosaveBlocked: false,
    saveLocalDraft: vi.fn(),
    dismissNotice: vi.fn(),
  };
}
