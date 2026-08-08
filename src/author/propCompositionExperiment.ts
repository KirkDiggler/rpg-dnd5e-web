/**
 * Fixture-only state for issue #728's precise composition Learn probe.
 *
 * These names are deliberately local and provisional. They describe the
 * interaction we need to test (a stable wall slot plus a small wall-local
 * adjustment); they are not proposed YAML/proto/API fields.
 */
import { SYNTY_SCALE } from '@/rendering/calibrationConstants';
import type {
  PlacementPreviewOverride,
  PlacementPreviewOverrideResolver,
} from './preview3d/DungeonPreview3D';
import type { PlacementSelection } from './types';

export const BOOKCASE_REF = 'dnd5e:props:bookcase';
export const ORNATE_TORCH_REF = 'dnd5e:props:torch-ornate';
export const NUDGE_STEP_METERS = 0.05;
export const ALONG_WALL_LIMIT_METERS = 0.25;
export const TOWARD_WALL_LIMIT_METERS = 0.2;

/**
 * Fixture-local measurements from the exact GLBs used by this Learn probe.
 * These are deliberately NOT manifest defaults or a production placement
 * contract. Synty's bookcase origin is its back/left floor corner rather than
 * its visible footprint center; the torch origin is already centered in XZ.
 */
export const FIXTURE_BOOKCASE_RAW_XZ_BOUNDS = {
  minX: 0.16945090889930725,
  maxX: 2.30159068107605,
  minZ: -0.003858288750052452,
  maxZ: 0.8825798034667969,
} as const;
export const FIXTURE_TORCH_RAW_MIN_Z = -0.10129890590906143;
export const FIXTURE_WALL_RAW_ROOM_FACE_Z = 0.2825848460197449;
export const FIXTURE_WALL_LINE_Z = 2.5;
export const FIXTURE_SLOT_CENTER_Z = 3;
export const FIXTURE_TORCH_ATTACHMENT_HEIGHT = 1.15;

const BOOKCASE_BASELINE_ALONG_WALL =
  -(
    (FIXTURE_BOOKCASE_RAW_XZ_BOUNDS.minX +
      FIXTURE_BOOKCASE_RAW_XZ_BOUNDS.maxX) /
    2
  ) * SYNTY_SCALE;
const BOOKCASE_BASELINE_NORMAL =
  -(
    (FIXTURE_BOOKCASE_RAW_XZ_BOUNDS.minZ +
      FIXTURE_BOOKCASE_RAW_XZ_BOUNDS.maxZ) /
    2
  ) * SYNTY_SCALE;
const FIXTURE_WALL_ROOM_FACE_Z =
  FIXTURE_WALL_LINE_Z + FIXTURE_WALL_RAW_ROOM_FACE_Z * SYNTY_SCALE;
const TORCH_BASELINE_NORMAL =
  FIXTURE_WALL_ROOM_FACE_Z -
  FIXTURE_TORCH_RAW_MIN_Z * SYNTY_SCALE -
  FIXTURE_SLOT_CENTER_Z;

export type CompositionSlotId = 'left' | 'center' | 'right';
export type CompositionAssetRef = typeof BOOKCASE_REF | typeof ORNATE_TORCH_REF;

export interface CompositionPlacementState {
  slotId: CompositionSlotId;
  selection: PlacementSelection;
  assetRef: CompositionAssetRef;
  /** Fine, authored adjustment along the wall run. */
  alongWallMeters: number;
  /** Fine, authored adjustment normal to the wall; negative is toward it. */
  towardWallMeters: number;
}

export interface PropCompositionState {
  selectedSlotId: CompositionSlotId;
  placements: readonly CompositionPlacementState[];
  lastAction: 'initial' | 'nudge' | 'snap' | 'replace' | 'reset-adjustment';
}

export type PropCompositionAction =
  | { type: 'select'; slotId: CompositionSlotId }
  | { type: 'nudge'; axis: 'along-wall' | 'toward-wall'; delta: number }
  | { type: 'snap'; anchor: 'slot-center' | 'wall-line' }
  | { type: 'replace-with-ornate-torch' }
  | { type: 'reset-adjustment' }
  | { type: 'reset-fixture' };

const INITIAL_PLACEMENTS: readonly CompositionPlacementState[] = [
  {
    slotId: 'left',
    selection: { roomId: null, index: 0 },
    assetRef: BOOKCASE_REF,
    alongWallMeters: 0,
    towardWallMeters: 0,
  },
  {
    slotId: 'center',
    selection: { roomId: null, index: 1 },
    assetRef: BOOKCASE_REF,
    alongWallMeters: 0,
    towardWallMeters: 0,
  },
  {
    slotId: 'right',
    selection: { roomId: null, index: 2 },
    assetRef: BOOKCASE_REF,
    alongWallMeters: 0,
    towardWallMeters: 0,
  },
];

export function createInitialPropCompositionState(): PropCompositionState {
  return {
    selectedSlotId: 'center',
    placements: INITIAL_PLACEMENTS.map((placement) => ({ ...placement })),
    lastAction: 'initial',
  };
}

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, Number(value.toFixed(2))));
}

function updateSelected(
  state: PropCompositionState,
  update: (placement: CompositionPlacementState) => CompositionPlacementState,
  lastAction: PropCompositionState['lastAction']
): PropCompositionState {
  return {
    ...state,
    placements: state.placements.map((placement) =>
      placement.slotId === state.selectedSlotId ? update(placement) : placement
    ),
    lastAction,
  };
}

export function propCompositionReducer(
  state: PropCompositionState,
  action: PropCompositionAction
): PropCompositionState {
  switch (action.type) {
    case 'select':
      return { ...state, selectedSlotId: action.slotId };
    case 'nudge':
      return updateSelected(
        state,
        (placement) =>
          action.axis === 'along-wall'
            ? {
                ...placement,
                alongWallMeters: clamp(
                  placement.alongWallMeters + action.delta,
                  ALONG_WALL_LIMIT_METERS
                ),
              }
            : {
                ...placement,
                towardWallMeters: clamp(
                  placement.towardWallMeters + action.delta,
                  TOWARD_WALL_LIMIT_METERS
                ),
              },
        'nudge'
      );
    case 'snap':
      return updateSelected(
        state,
        (placement) =>
          action.anchor === 'slot-center'
            ? { ...placement, alongWallMeters: 0 }
            : { ...placement, towardWallMeters: 0 },
        'snap'
      );
    case 'replace-with-ornate-torch':
      return updateSelected(
        state,
        (placement) => ({ ...placement, assetRef: ORNATE_TORCH_REF }),
        'replace'
      );
    case 'reset-adjustment':
      return updateSelected(
        state,
        (placement) => ({
          ...placement,
          alongWallMeters: 0,
          towardWallMeters: 0,
        }),
        'reset-adjustment'
      );
    case 'reset-fixture':
      return createInitialPropCompositionState();
  }
}

export function selectedCompositionPlacement(
  state: PropCompositionState
): CompositionPlacementState {
  return state.placements.find(
    (placement) => placement.slotId === state.selectedSlotId
  )!;
}

function sameSelection(a: PlacementSelection, b: PlacementSelection): boolean {
  return !a.boss && !b.boss && a.roomId === b.roomId && a.index === b.index;
}

/**
 * Adapt the provisional experiment state to the existing preview's narrow,
 * render-only override seam. The exact same resolved position and asset ref
 * feed Orbit and Play because the preview builds its prop list once, outside
 * either camera branch.
 */
export function compositionPreviewResolver(
  state: PropCompositionState
): PlacementPreviewOverrideResolver {
  return (selection): PlacementPreviewOverride | undefined => {
    const placement = state.placements.find((candidate) =>
      sameSelection(candidate.selection, selection)
    );
    if (!placement) return undefined;
    const isTorch = placement.assetRef === ORNATE_TORCH_REF;
    // Resolve the asset-specific baseline BEFORE the bounded authored nudge.
    // The specimen wall runs on world X and positive Z is its room side:
    // - bookcase: cancel the measured back/left GLB pivot so its visible XZ
    //   footprint centers on the owning hex (which also lands its back within
    //   5 cm of the measured wall face);
    // - torch: keep the span center, but use a distinct wall attachment whose
    //   measured back face touches the wall and whose Y is fixture-local.
    // Reset/snap clear only the authored adjustment, returning to this baseline
    // rather than the raw GLB origin.
    const baselineAlongWall = isTorch ? 0 : BOOKCASE_BASELINE_ALONG_WALL;
    const baselineNormal = isTorch
      ? TORCH_BASELINE_NORMAL
      : BOOKCASE_BASELINE_NORMAL;
    return {
      assetRef: placement.assetRef,
      positionOffset: [
        baselineAlongWall + placement.alongWallMeters,
        isTorch ? FIXTURE_TORCH_ATTACHMENT_HEIGHT : 0,
        baselineNormal + placement.towardWallMeters,
      ],
    };
  };
}
