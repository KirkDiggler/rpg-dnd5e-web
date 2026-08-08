/**
 * Fixture-only state for issue #728's precise composition Learn probe.
 *
 * These names are deliberately local and provisional. They describe the
 * interaction we need to test (a stable wall slot plus a small wall-local
 * adjustment); they are not proposed YAML/proto/API fields.
 */
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
    // Learned with the actual GLBs: the bookcase's authored anchor is its
    // floor contact, while the ornate torch's intrinsic usage is a wall
    // attachment above the floor. That vertical attachment is refreshed from
    // the NEW asset; the wall-span center and local authored nudge are not.
    const assetVerticalAnchor =
      placement.assetRef === ORNATE_TORCH_REF ? 1.15 : 0;
    return {
      assetRef: placement.assetRef,
      // The specimen wall runs on world X. Positive Z is away from it.
      positionOffset: [
        placement.alongWallMeters,
        assetVerticalAnchor,
        placement.towardWallMeters,
      ],
    };
  };
}
