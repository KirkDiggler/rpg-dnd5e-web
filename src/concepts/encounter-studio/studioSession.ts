import type { ReactNode } from 'react';
import type {
  AuthoringRegion,
  RegionResolution,
} from '../world-building/authoringRegions';
import type { CastEdit } from '../world-building/cast';
import type {
  RoomDoorBinding,
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
import type {
  StudioDoorEditing,
  StudioDoorTarget,
} from '../world-building/studioDoorEditing';
import type { WorldPoint, WorldScene } from '../world-building/types';
import type { WallCornerJoin } from '../world-building/wallCornerJoins';
import type { ResizeEdges } from '../world-building/workspaceGeometry';
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
export type { ResizeEdges } from '../world-building/workspaceGeometry';

export type EncounterStudioView = 'layout' | '3d';

/** The inspector's key: one thing, derived from the owner's arbiter on every
 * render and never stored. Ten kinds; `nothing` is the room. */
export type StudioSelection =
  | { readonly kind: 'nothing' }
  | { readonly kind: 'wall'; readonly id: string }
  | { readonly kind: 'door'; readonly target: StudioDoorTarget }
  /** monsterDeclarations[].id */
  | { readonly kind: 'creature'; readonly id: string }
  /** One scene root that is an item. */
  | { readonly kind: 'prop'; readonly id: string }
  /** One scene root that is a group. */
  | { readonly kind: 'group'; readonly id: string }
  | { readonly kind: 'hex'; readonly cell: RoomHexCell }
  /** A map label, with or without a region. */
  | { readonly kind: 'label'; readonly id: string }
  | { readonly kind: 'partyStart' }
  /** One cast member, by its monster ref (rpg-project#575). */
  | { readonly kind: 'castMember'; readonly ref: string };

/** The scene multi-pick that feeds Group selection is a PICK, not a
 * selection: while two or more roots are picked, nothing is inspected. */
export interface StudioInspection {
  readonly selection: StudioSelection;
  /** Scene root ids when two or more are picked, else null. */
  readonly pick: readonly string[] | null;
}

const NOTHING: StudioInspection = {
  selection: { kind: 'nothing' },
  pick: null,
};

export function studioInspectionOf(
  arrange: StudioArrangeSelection | null,
  scene: Readonly<WorldScene>
): StudioInspection {
  if (!arrange) return NOTHING;
  const one = (selection: StudioSelection): StudioInspection => ({
    selection,
    pick: null,
  });
  switch (arrange.kind) {
    case 'scene': {
      if (arrange.rootIds.length >= 2)
        return { selection: { kind: 'nothing' }, pick: [...arrange.rootIds] };
      const id = arrange.rootIds[0];
      if (id === undefined) return NOTHING;
      if (scene.groups.some((group) => group.id === id))
        return one({ kind: 'group', id });
      if (scene.items.some((item) => item.id === id))
        return one({ kind: 'prop', id });
      return NOTHING;
    }
    case 'wall':
      return one({ kind: 'wall', id: arrange.wall.id });
    case 'door':
      return one({ kind: 'door', target: arrange.target });
    case 'actor':
      return one({ kind: 'creature', id: arrange.monster.id });
    case 'start':
      return one({ kind: 'partyStart' });
    case 'label':
      return one({ kind: 'label', id: arrange.label.id });
    case 'hex':
      return one({ kind: 'hex', cell: { ...arrange.cell } });
    case 'cast':
      return one({ kind: 'castMember', ref: arrange.target.ref });
  }
}
export type StudioSocialSection =
  | 'intel'
  | 'factions'
  | 'dispositions'
  | 'tables'
  | 'facts';
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
  readonly finishes?: {
    catalog: import('../world-building/useWorldMaterialCatalog').WorldMaterialCatalogState;
    statuses: readonly import('../world-building/wallFinishProjection').WallFinishStatus[];
  };
  readonly assetRef: string | null;
  readonly snapEnabled: boolean;
  readonly endpointSnapEnabled: boolean;
  readonly rightAngleEnabled: boolean;
  readonly options: readonly StudioWallAppearanceOption[];
  /** Selection alone never retires a gesture or changes the private prop tool. */
  select(id: string | null): boolean;
  setAsset(ref: string | null): boolean;
  setSnap(enabled: boolean): boolean;
  setEndpointSnap(enabled: boolean): boolean;
  setRightAngle(enabled: boolean): boolean;
  /** Accepted no-ops do not add history. Create stays in caller drawing mode. */
  create(line: WallLine, join?: WallCornerJoin): boolean;
  edit(next: StructuralWall, join?: WallCornerJoin): boolean;
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
  patternStart?: WorldPoint;
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
  /** Select-tool click on a bare workspace cell selects that hex. */
  onSelectHex?(cell: RoomHexCell): void;
  /** Select-tool click off the workspace floor selects nothing. */
  onClearSelection?(): void;
  /** Placed creatures, props and the party start, drawn and selectable
   * through the S0 contract (rpg-project#577). Absent draws none. */
  placedEditing?: import('./LayoutPlacedOverlay').LayoutPlacedEditing;
  /** The root `exits`, drawn with the placed nouns (rpg-project#578). */
  exits?: readonly import('../world-building/siteScope').SiteExit[];
  /** A request to frame these world bounds: the viewport fits them to its
   * own size and reports the frame through onFrameChange. A new nonce is a
   * new request; the request itself is never document state. */
  frameTarget?: {
    bounds: import('../world-building/workspaceGeometry').WorkspaceBounds;
    nonce: number;
    /** Client-pixel spans of overlays over the surface, such as the open
     * inspector, read when the surface applies the request. */
    occluders?(): readonly { left: number; right: number }[];
  };
}

/** Definitions belong to the one document owner. Area commits replace region
 * cells, never floor; bound intents require the current linked-label selection.
 * Captured callbacks retire on document/epoch/selection changes. */
export interface StudioRegionEditing {
  readonly resolutions: readonly RegionResolution[];
  readonly finishes?: {
    catalog: import('../world-building/useWorldMaterialCatalog').WorldMaterialCatalogState;
    projection: import('../world-building/roomWallFinishes').RoomWallFinishProjection;
    set(
      regionId: string,
      patch:
        | import('../world-building/regionFinishTypes').RegionWallFinishPatch
        | null
    ): boolean;
  };
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
  /** Select one floor hex. False, with no history entry, outside the
   * workspace, while publishing, or from a retired snapshot. */
  selectHex(cell: RoomHexCell | null): boolean;
  /** Select nothing: the inspector answers for the room. */
  clearSelection(): boolean;
  /** Select scene roots by id from any view, as a 3D click does: one id is
   * one prop or group, two or more are the Shift-pick. Refused for an
   * unknown id, while publishing, or from a retired snapshot. */
  selectScene(ids: readonly string[]): boolean;
  /** Select the party start from any view. Refused when none is placed. */
  selectPartyStart(): boolean;
  /** Arm the party-start gesture: the next 3D floor click places or moves
   * it. Refused while publishing or from a retired snapshot. */
  armPartyStart(): boolean;
  /** Root behavior declarations only; absence removes tables. Ordinary draft
   * gate, one shared history transaction, retired snapshots refuse changes. */
  commitTables(tables: SiteScope['tables']): boolean;
  /** The cast (rpg-project#575): each intent is one document transaction
   * over the pure edits in world-building/cast.ts. A refusal returns false
   * with no history entry; the form shows the edit's own sentence. */
  cast: {
    /** One staged form: an id change, the stat block and the defaults. */
    save(edit: CastEdit): boolean;
    rename(ref: string, toId: string): boolean;
    adopt(ref: string, templateId: string): boolean;
    /** Refused while the member has placements. */
    remove(ref: string): boolean;
    /** Remove a later recipe on the member's ref (an unused look). */
    removeUnusedLook(ref: string, entryId: string): boolean;
    /** Select one cast member: the inspector shows its form and its
     * placements are highlighted on the map. One selection, not a set (R9).
     * Refused for a ref that is not in the cast. */
    select(ref: string): boolean;
    /** Deal the member's placements looks from its default look family,
     * without repeats until the family runs out. One transaction; undo
     * restores every look. Refused for a family of one look. */
    shuffle(ref: string): boolean;
  };
  creatures: {
    select(id: string): boolean;
    /** Arm one placement of a cast member, keyed by its monster ref, with a
     * look from its default family. Refused for a ref not in the cast, a
     * member without a default look, or a look outside its family. */
    armPlacement(ref: string, appearanceRef: string): boolean;
    readonly placement: { name: string; appearanceRef: string } | null;
    setDefinition(id: string, ref: string): boolean;
  };
  mapLabelSelection: {
    readonly selectedId: string | null;
    select(id: string | null): boolean;
  };
  doorEditing: StudioDoorEditing;
  /** A wall door's state (rpg-project#578). One transaction through
   * `normalizeDoorBinding` and `withDoorBinding`. A door on a wall always
   * has a state, so `undefined` is refused; deleting the doorway removes
   * it. Refused for an id that is no wall's door. */
  doors: {
    setBinding(doorId: string, next: RoomDoorBinding | undefined): boolean;
  };
  /** The root `exits` (rpg-project#578, H3). `set` writes the hex's exit:
   * an id adds or renames it, null removes it. Adding is refused on a hex
   * that is not walkable floor; an id the validator refuses is refused with
   * its sentence. Standability is the toolkit's, at compile. */
  exits: {
    set(cell: RoomHexCell, id: string | null): boolean;
  };
  /** The root `endings` (rpg-project#578, H4): the whole list, in authored
   * order, read through `validateSiteEndings`. An ending needs a `when`; a
   * refusal returns false with the validator's sentence as the notice. */
  endings: {
    set(
      next: readonly import('../world-building/siteScope').SiteEnding[]
    ): boolean;
  };
  /** The root `concealments` (rpg-project#578). Each intent is one
   * transaction; a refusal returns false with its sentence as the notice. */
  concealments: {
    /** The door id leaves every concealment's `props` and joins the chosen
     * one, or none. The door's wall and floor are never added. */
    setDoorHiddenBy(doorId: string, concealmentId: string | null): boolean;
  };
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
  /** Explicit resize that moves only the chosen edges; absent edges means
   * right and top, so no cell moves. Labels never resize implicitly.
   * Refusals and retired-context callbacks return false without
   * history/storage changes. */
  resizeWorkspace(width: number, height: number, edges?: ResizeEdges): boolean;
  createMapLabel(text: string, location: WorldPoint): boolean;
  moveMapLabel(id: string, location: WorldPoint): boolean;
  renameMapLabel(id: string, text: string): boolean;
  deleteMapLabel(id: string): boolean;
  /** Abandon previews/drags before switching (the renderer unmounts its gestures). */
  cancelTransients(): void;
  propTool: WorldBuildingTool;
  setPropTool(tool: WorldBuildingTool): void;
  /** Existing owner-controlled forms, not additional policy stores. */
  socialControls: {
    intel: ReactNode;
    factions: ReactNode;
    dispositions: ReactNode;
    selection: ReactNode;
  };
  propControls: {
    palette: ReactNode;
    tree: ReactNode;
    selection: ReactNode;
    /** Duplicate, delete and the light editor for the scene selection. */
    arrangeExtras: ReactNode;
    /** Group selection and Ungroup, split out so the group view and the
     * pick strip each mount the half they need. */
    groupActions: ReactNode;
  };
  saveStatus: string;
  notice: string | null;
  autosaveBlocked: boolean;
  /** Explicit save replaces unreadable stored bytes when autosave is blocked.
   * Present that consequence clearly on the consuming save control. */
  saveLocalDraft(): void;
  dismissNotice(): void;
}

export type StudioHome = 'build' | 'encounter';

export interface EncounterStudioPresentation {
  /** Presentation context fences hidden map input; old callers default to Build. */
  home?: StudioHome;
  view: EncounterStudioView;
  /** Escape retires an armed tool that edits the selection (the region
   * tool, on a region's label) instead of selecting nothing. */
  escapeKeepsSelection?: boolean;
  render(session: EncounterStudioSession): ReactNode;
}
