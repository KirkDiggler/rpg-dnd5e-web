import type { ReactNode } from 'react';
import type {
  RoomDraft,
  RoomDraftDocument,
  RoomHexCell,
} from '../world-building/roomDraft';
import type { WorldPoint } from '../world-building/types';
import type { WorldBuildingTool } from '../world-building/WorldBuildingInteraction';
import type { WorldBuildingViewportProps } from '../world-building/WorldBuildingViewport';

// Layout consumers can use the canonical geometry/document types through this
// seam; these are re-exports, never parallel Studio model definitions.
export type {
  RoomDraft,
  RoomDraftDocument,
  RoomHexCell,
} from '../world-building/roomDraft';
export type { WorldPoint } from '../world-building/types';

export type EncounterStudioView = 'layout' | '3d';
export type LayoutFloorTool = 'paint' | 'erase' | 'rectangle';
export interface LayoutFrame {
  center: WorldPoint;
  zoom: number;
}

/** Optional 2D-only presentation intents. Labels are read from draft.scene;
 * names, selection and gesture previews never become a second document. */
export interface LayoutLabelEditing {
  active: boolean;
  placementText: string | null;
  selectedId: string | null;
  onSelect(id: string): void;
  onCreate(text: string, location: WorldPoint): boolean;
  onMove(id: string, location: WorldPoint): boolean;
  onCancel(): void;
}

/** A controlled presentation: no document copy, persistence or history owner. */
export interface LayoutViewportProps {
  draft: Readonly<RoomDraft>;
  tool: LayoutFloorTool;
  frame: LayoutFrame;
  onFrameChange(next: LayoutFrame): void;
  onCommit(cells: readonly RoomHexCell[], mode: 'paint' | 'erase'): boolean;
  labelEditing?: LayoutLabelEditing;
  /** Optional complete-owner snapshot identity: scope-only navigation also
   * retires previews. Absent retains existing draft-identity cancellation. */
  documentContext?: Readonly<RoomDraftDocument>;
}

/** Render-time projection of the existing owner, never a second store.
 * Consumers must not mutate or serialize document. No publishing/play seam. */
export interface EncounterStudioSession {
  document: Readonly<RoomDraftDocument>;
  viewportProps: WorldBuildingViewportProps;
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
  propControls: { palette: ReactNode; tree: ReactNode; selection: ReactNode };
  saveStatus: string;
  notice: string | null;
  autosaveBlocked: boolean;
  /** Explicit save replaces unreadable stored bytes when autosave is blocked.
   * Present that consequence clearly on the consuming save control. */
  saveLocalDraft(): void;
  dismissNotice(): void;
}

export interface EncounterStudioPresentation {
  view: EncounterStudioView;
  render(session: EncounterStudioSession): ReactNode;
}
