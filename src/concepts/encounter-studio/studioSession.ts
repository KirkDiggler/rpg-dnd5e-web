import type { ReactNode } from 'react';
import type {
  AuthoringRegion,
  RegionResolution,
} from '../world-building/authoringRegions';
import type {
  RoomDraft,
  RoomDraftDocument,
  RoomHexCell,
} from '../world-building/roomDraft';
import type { SiteScope } from '../world-building/siteScope';
import type { WallLine } from '../world-building/structuralWallGeometry';
import type { StructuralWall } from '../world-building/structuralWalls';
import type {
  StudioArrangeIntent,
  StudioArrangeSelection,
} from '../world-building/studioArrange';
import type { StudioDoorEditing } from '../world-building/studioDoorEditing';
import type { WorldPoint } from '../world-building/types';
import type { WorldBuildingTool } from '../world-building/WorldBuildingInteraction';
import type { WorldBuildingViewportProps } from '../world-building/WorldBuildingViewport';
export type {
  AuthoringRegion,
  BoundaryRun,
  EnclosureWitness,
  RegionLighting,
  RegionResolution,
} from '../world-building/authoringRegions';
export type {
  StudioDoorAppearanceOption,
  StudioDoorEditing,
  StudioDoorPreview,
  StudioDoorTarget,
} from '../world-building/studioDoorEditing';

// Layout consumers can use the canonical geometry/document types through this
// seam; these are re-exports, never parallel Studio model definitions.
export type {
  RoomDraft,
  RoomDraftDocument,
  RoomHexCell,
} from '../world-building/roomDraft';
export type { WallLine } from '../world-building/structuralWallGeometry';
export type { StructuralWall } from '../world-building/structuralWalls';
export type {
  StudioActorArrangeEdit,
  StudioArrangeHeight,
  StudioArrangeIntent,
  StudioArrangeProjectionInput,
  StudioArrangeSelection,
  StudioArrangeTarget,
  StudioSceneArrangeEdit,
  StudioSceneArrangeValues,
  StudioStartArrangeEdit,
  StudioWallArrangeEdit,
  StudioWallArrangeValues,
} from '../world-building/studioArrange';
export type { WorldPoint } from '../world-building/types';

export type EncounterStudioView = 'layout' | '3d';
export type LayoutFloorTool = 'paint' | 'erase' | 'rectangle';
export type LayoutTool =
  | LayoutFloorTool
  | 'select'
  | 'wall'
  | 'label'
  | 'door'
  | 'region';

export type StudioWallThumbnail =
  | { status: 'ready'; image: string }
  | { status: 'error'; message: string };

export interface StudioWallAppearanceOption {
  ref: string;
  label: string;
  /** Name/ref presentation ranking only, not asset eligibility. */
  wallMatch: boolean;
  thumbnail: StudioWallThumbnail;
}

/** Canonical wall owner intents. Null means unarmed/unselected; loading or
 * failed imagery does not make an eligible appearance unavailable. Callbacks
 * are fenced to their captured intent epoch, document and mounted owner. */
export interface StudioWallEditing {
  readonly selectedId: string | null;
  readonly assetRef: string | null;
  readonly snapEnabled: boolean;
  readonly options: readonly StudioWallAppearanceOption[];
  /** Selection alone never retires a gesture or changes the private prop tool. */
  select(id: string | null): boolean;
  setAsset(ref: string | null): boolean;
  setSnap(enabled: boolean): boolean;
  /** Accepted no-ops do not add history. Create stays in caller drawing mode. */
  create(line: WallLine): boolean;
  edit(next: StructuralWall): boolean;
  remove(id: string): boolean;
  reportRefusal(message: string): void;
}
export interface LayoutFrame {
  center: WorldPoint;
  zoom: number;
}

/** Optional 2D-only presentation intents. Labels are read from draft.scene;
 * names, selection and gesture previews never become a second document. */
export interface LayoutLabelEditing {
  active: boolean;
  placementText: string | null;
  /** Explicit creation choice; absent preserves legacy Note consumers. */
  placementKind?: 'note' | 'room';
  selectedId: string | null;
  onSelect(id: string | null): void;
  onCreate(text: string, location: WorldPoint): boolean;
  onMove(id: string, location: WorldPoint): boolean;
  onCancel(): void;
}

/** A controlled presentation: no document copy, persistence or history owner. */
export interface LayoutViewportProps {
  draft: Readonly<RoomDraft>;
  tool: LayoutTool;
  frame: LayoutFrame;
  onFrameChange(next: LayoutFrame): void;
  onCommit(cells: readonly RoomHexCell[], mode: 'paint' | 'erase'): boolean;
  labelEditing?: LayoutLabelEditing;
  wallEditing?: StudioWallEditing;
  doorEditing?: StudioDoorEditing;
  regionEditing?: StudioRegionEditing;
  /** Derived from the existing linked-label selection, never a second store. */
  selectedRegion?: Readonly<AuthoringRegion>;
  regionTool?: LayoutFloorTool;
  onExitRegionTool?(): void;
  onExitDoorTool?(): void;
  /** Owner generation: option/tool/view cancellation fences late releases. */
  intentEpoch?: number;
  /** Presentation-only exit; preserve the owner’s armed appearance and snap. */
  onExitWallTool?(): void;
  /** Optional complete-owner snapshot identity: scope-only navigation also
   * retires previews. Absent retains existing draft-identity cancellation. */
  documentContext?: Readonly<RoomDraftDocument>;
}

/** Definitions belong to the one document owner. Area commits replace region
 * cells, never floor; bound intents require the current linked-label selection.
 * Captured callbacks retire on document/epoch/selection changes. */
export interface StudioRegionEditing {
  readonly resolutions: readonly RegionResolution[];
  /** Atomic pair creation uses the existing strict label codec gate. Unbound
   * geometry alone is valid metadata, not a publication/creation refusal. */
  createRoomLabel(text: string, location: WorldPoint): boolean;
  /** Definition operations use ordinary shape/bounds/size gates and retain
   * editable unfinished policies. Equal accepted intents add no history. */
  useEnclosingWalls(regionId: string): boolean;
  setExplicitRegionArea(
    regionId: string,
    cells: readonly RoomHexCell[]
  ): boolean;
  removeRegionAndLabel(regionId: string): boolean;
}

/** Render-time projection of the existing owner, never a second store.
 * Consumers must not mutate or serialize document. No publishing/play seam. */
export interface EncounterStudioSession {
  document: Readonly<RoomDraftDocument>;
  viewportProps: WorldBuildingViewportProps;
  readonly intentEpoch: number;
  readonly arrange: StudioArrangeSelection | null;
  commitArrange(intent: StudioArrangeIntent): boolean;
  /** Root behavior declarations only; absence removes tables. Ordinary draft
   * gate, one shared history transaction, retired snapshots refuse changes. */
  commitTables(tables: SiteScope['tables']): boolean;
  mapLabelSelection: {
    readonly selectedId: string | null;
    select(id: string | null): boolean;
  };
  doorEditing: StudioDoorEditing;
  wallEditing: StudioWallEditing;
  regionEditing: StudioRegionEditing;
  /** Trimmed nonblank name, max 120; one ordinary document transaction. */
  renameDocument(name: string): boolean;
  canUndo: boolean;
  canRedo: boolean;
  undo(): void;
  redo(): void;
  /** Shape/bounds/size-checked transaction preserving editable policies;
   * a successful no-op adds no history. */
  commitFloor(cells: readonly RoomHexCell[], mode: 'paint' | 'erase'): boolean;
  /** Explicit centered resize; labels never resize implicitly. Refusals and
   * retired-context callbacks return false without history/storage changes. */
  resizeWorkspace(width: number, height: number): boolean;
  createMapLabel(text: string, location: WorldPoint): boolean;
  moveMapLabel(id: string, location: WorldPoint): boolean;
  renameMapLabel(id: string, text: string): boolean;
  deleteMapLabel(id: string): boolean;
  /** Abandon previews/drags before switching (the renderer unmounts its gestures). */
  cancelTransients(): void;
  propTool: WorldBuildingTool;
  setPropTool(tool: WorldBuildingTool): void;
  propControls: {
    palette: ReactNode;
    tree: ReactNode;
    selection: ReactNode;
    arrangeExtras: ReactNode;
  };
  saveStatus: string;
  notice: string | null;
  autosaveBlocked: boolean;
  /** Explicit save replaces unreadable stored bytes when autosave is blocked.
   * Present that consequence clearly on the consuming save control. */
  saveLocalDraft(): void;
  dismissNotice(): void;
}

export type StudioHome = 'build' | 'regions' | 'encounter';

export interface EncounterStudioPresentation {
  /** Presentation context fences hidden map input; old callers default to Build. */
  home?: StudioHome;
  view: EncounterStudioView;
  render(session: EncounterStudioSession): ReactNode;
}
