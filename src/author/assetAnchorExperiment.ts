/**
 * Fixture-only experiment state for rpg-dnd5e-web#731.
 *
 * Vocabulary here is intentionally descriptive and local to the Learn probe.
 * It is not a proposed manifest, persistence, proto, or authoring schema.
 */
import { resolveClassCharacterModelUrl } from '@/components/hex-grid/classCharacterModels';
import { resolvePropModelUrl } from '@/components/hex-grid/propManifest';
import { SYNTY_SCALE } from '@/rendering/calibrationConstants';

export const LAB_CASE_IDS = [
  'bookcase',
  'torch-ornate',
  'fighter-pair',
] as const;
export type LabCaseId = (typeof LAB_CASE_IDS)[number];
export const FACING_LABELS = ['E', 'NE', 'NW', 'W', 'SW', 'SE'] as const;
export type FacingIndex = 0 | 1 | 2 | 3 | 4 | 5;
export type LabVariant = 'standing' | 'downed';
export type LabCameraMode = 'orbit' | 'play';
export type AnchorCandidate =
  | 'raw-origin'
  | 'bounds-center-floor'
  | 'wall-face';
export type Vec3Tuple = [number, number, number];

export interface VisibleBounds {
  min: Vec3Tuple;
  max: Vec3Tuple;
  center: Vec3Tuple;
  size: Vec3Tuple;
}

export interface AnchorLabCase {
  id: LabCaseId;
  label: string;
  source: string;
  candidates: readonly AnchorCandidate[];
  variants: readonly LabVariant[];
  finding: string;
}

export const ANCHOR_LAB_CASES: Record<LabCaseId, AnchorLabCase> = {
  bookcase: {
    id: 'bookcase',
    label: 'Corner-pivot bookcase',
    source: 'dnd5e:props:bookcase',
    candidates: ['raw-origin', 'bounds-center-floor', 'wall-face'],
    variants: ['standing'],
    finding:
      'Asset anchor metadata — stable intrinsic corner-pivot normalization; not a scene nudge.',
  },
  'torch-ornate': {
    id: 'torch-ornate',
    label: 'Ornate wall torch',
    source: 'dnd5e:props:torch-ornate',
    candidates: ['raw-origin', 'bounds-center-floor', 'wall-face'],
    variants: ['standing'],
    finding:
      'Asset anchor metadata for wall-face registration; scene-specific placement nudge for mount height remains open.',
  },
  'fighter-pair': {
    id: 'fighter-pair',
    label: 'Fighter standing / downed',
    source: 'canonical fighter pair',
    candidates: ['raw-origin', 'bounds-center-floor'],
    variants: ['standing', 'downed'],
    finding:
      'Re-export defect: downed geometry is displaced from the shared token origin.',
  },
};

/**
 * Measurements from the exact synced GLBs at rpg-game-assets main d22c53f.
 * Values are in Three.js axes and already include the shared SYNTY_SCALE.
 * The running preview measures the loaded scenes again and replaces these
 * fixture fallbacks in its readout; these constants keep the pure state path
 * deterministic and are evidence, not production defaults.
 */
export const FIXTURE_VISIBLE_BOUNDS: Record<string, VisibleBounds> = {
  bookcase: boundsFromMinMax(
    [0.1694509089, 0, -0.0038582888],
    [2.3015906811, 3.3514635563, 0.8825798035]
  ),
  'torch-ornate': boundsFromMinMax(
    [-0.1142199039, -0.443867445, -0.1012989059],
    [0.1142199039, 0.3584806919, 0.1012988612]
  ),
  'fighter-pair:standing': boundsFromMinMax(
    [-1.444, 0, -0.324],
    [1.444, 1.8532047272, 0.319]
  ),
  'fighter-pair:downed': boundsFromMinMax(
    [-0.7153402567, -0.3246057332, -2.8743493557],
    [0.704826653, 0.3183091879, -0.9977132678]
  ),
};

function boundsFromMinMax(rawMin: Vec3Tuple, rawMax: Vec3Tuple): VisibleBounds {
  const min = rawMin.map((value) => value * SYNTY_SCALE) as Vec3Tuple;
  const max = rawMax.map((value) => value * SYNTY_SCALE) as Vec3Tuple;
  return {
    min,
    max,
    center: min.map((value, index) => (value + max[index]!) / 2) as Vec3Tuple,
    size: min.map((value, index) => max[index]! - value) as Vec3Tuple,
  };
}

export function fixtureBoundsKey(
  caseId: LabCaseId,
  variant: LabVariant
): string {
  return caseId === 'fighter-pair' ? `${caseId}:${variant}` : caseId;
}

export function resolveAssetAnchorUrl(
  caseId: LabCaseId,
  variant: LabVariant
): string {
  if (caseId === 'bookcase')
    return resolvePropModelUrl('dnd5e:props:bookcase')!;
  if (caseId === 'torch-ornate')
    return resolvePropModelUrl('dnd5e:props:torch-ornate')!;
  return resolveClassCharacterModelUrl('fighter', variant === 'downed')!;
}

export const ADJUST_STEP_METERS = 0.05;
export const ADJUST_LIMIT_METERS = 0.25;
export const OWNING_HEX = Object.freeze({ q: 0, r: 0, s: 0 });
const HEX_APOTHEM = Math.sqrt(3) / 2;
const TORCH_EYE_LINE_METERS = 1.15;

export function candidateOffset(
  caseId: LabCaseId,
  candidate: AnchorCandidate,
  bounds: VisibleBounds
): Vec3Tuple {
  if (candidate === 'raw-origin') return [0, 0, 0];
  if (candidate === 'bounds-center-floor') {
    return [-bounds.center[0], -bounds.min[1], -bounds.center[2]];
  }
  // The reference wall sits one apothem behind local model +Z. For a floor
  // prop, its measured back and base meet wall/floor. For the wall-mounted
  // torch, its measured vertical center meets a fixture-only eye-line.
  return [
    -bounds.center[0],
    caseId === 'torch-ornate'
      ? TORCH_EYE_LINE_METERS - bounds.center[1]
      : -bounds.min[1],
    -HEX_APOTHEM - bounds.min[2],
  ];
}

export function resolvedCalibrationOffset(
  state: AssetAnchorLabState,
  bounds: VisibleBounds
): Vec3Tuple {
  const base = candidateOffset(state.caseId, state.candidate, bounds);
  return base.map(
    (value, index) => value + state.adjustment[index]!
  ) as Vec3Tuple;
}

export interface ProvisionalFixtureEvidence {
  caseLabel: string;
  modelSource: string;
  candidateMeaning: string;
  adjustmentMeters: Vec3Tuple;
  variantsCompared: readonly LabVariant[];
  facingsCompared: readonly string[];
  classification: string;
  warning: 'NON-PRODUCTION FIXTURE EVIDENCE';
}

export interface AssetAnchorLabState {
  caseId: LabCaseId;
  facing: FacingIndex;
  variant: LabVariant;
  candidate: AnchorCandidate;
  cameraMode: LabCameraMode;
  adjustment: Vec3Tuple;
  candidateExplicitlyChosen: boolean;
  observed: ReadonlySet<string>;
  recorded: Partial<Record<LabCaseId, ProvisionalFixtureEvidence>>;
}

export type AssetAnchorLabAction =
  | { type: 'select-case'; caseId: LabCaseId }
  | { type: 'select-facing'; facing: FacingIndex }
  | { type: 'select-variant'; variant: LabVariant }
  | { type: 'select-candidate'; candidate: AnchorCandidate }
  | { type: 'select-camera'; mode: LabCameraMode }
  | { type: 'adjust'; axis: 0 | 1 | 2; delta: number }
  | { type: 'reset-adjustment' }
  | { type: 'record-provisional' };

function observationKey(
  caseId: LabCaseId,
  variant: LabVariant,
  candidate: AnchorCandidate,
  facing: FacingIndex
): string {
  return `${caseId}|${variant}|${candidate}|${facing}`;
}

function cameraKey(caseId: LabCaseId, mode: LabCameraMode): string {
  return `${caseId}|camera|${mode}`;
}

function withCurrentObservation(
  state: AssetAnchorLabState
): AssetAnchorLabState {
  const observed = new Set(state.observed);
  observed.add(
    observationKey(state.caseId, state.variant, state.candidate, state.facing)
  );
  observed.add(cameraKey(state.caseId, state.cameraMode));
  return { ...state, observed };
}

export function createInitialAssetAnchorLabState(): AssetAnchorLabState {
  return withCurrentObservation({
    caseId: 'bookcase',
    facing: 0,
    variant: 'standing',
    candidate: 'raw-origin',
    cameraMode: 'orbit',
    adjustment: [0, 0, 0],
    candidateExplicitlyChosen: false,
    observed: new Set(),
    recorded: {},
  });
}

function clampAdjustment(value: number): number {
  return Math.max(
    -ADJUST_LIMIT_METERS,
    Math.min(ADJUST_LIMIT_METERS, Number(value.toFixed(2)))
  );
}

export function canRecordProvisional(state: AssetAnchorLabState): boolean {
  if (!state.candidateExplicitlyChosen) return false;
  if (!state.observed.has(cameraKey(state.caseId, 'orbit'))) return false;
  if (!state.observed.has(cameraKey(state.caseId, 'play'))) return false;
  const variants = ANCHOR_LAB_CASES[state.caseId].variants;
  return variants.every((variant) =>
    FACING_LABELS.every((_, facing) =>
      state.observed.has(
        observationKey(
          state.caseId,
          variant,
          state.candidate,
          facing as FacingIndex
        )
      )
    )
  );
}

function provisionalEvidence(
  state: AssetAnchorLabState
): ProvisionalFixtureEvidence {
  const item = ANCHOR_LAB_CASES[state.caseId];
  return {
    caseLabel: item.label,
    modelSource: `${item.source} → ${resolveAssetAnchorUrl(state.caseId, state.variant)}`,
    candidateMeaning: state.candidate,
    adjustmentMeters: [...state.adjustment],
    variantsCompared: item.variants,
    facingsCompared: FACING_LABELS,
    classification: item.finding,
    warning: 'NON-PRODUCTION FIXTURE EVIDENCE',
  };
}

export function assetAnchorLabReducer(
  state: AssetAnchorLabState,
  action: AssetAnchorLabAction
): AssetAnchorLabState {
  switch (action.type) {
    case 'select-case': {
      const item = ANCHOR_LAB_CASES[action.caseId];
      return withCurrentObservation({
        ...state,
        caseId: action.caseId,
        facing: 0,
        variant: item.variants[0]!,
        candidate: item.candidates[0]!,
        adjustment: [0, 0, 0],
        candidateExplicitlyChosen: false,
      });
    }
    case 'select-facing':
      return withCurrentObservation({ ...state, facing: action.facing });
    case 'select-variant':
      return withCurrentObservation({
        ...state,
        variant: action.variant,
        adjustment: [0, 0, 0],
      });
    case 'select-candidate':
      return withCurrentObservation({
        ...state,
        candidate: action.candidate,
        adjustment: [0, 0, 0],
        candidateExplicitlyChosen: true,
      });
    case 'select-camera':
      return withCurrentObservation({ ...state, cameraMode: action.mode });
    case 'adjust': {
      const adjustment = [...state.adjustment] as Vec3Tuple;
      adjustment[action.axis] = clampAdjustment(
        adjustment[action.axis] + action.delta
      );
      return { ...state, adjustment };
    }
    case 'reset-adjustment':
      return { ...state, adjustment: [0, 0, 0] };
    case 'record-provisional':
      if (!canRecordProvisional(state)) return state;
      return {
        ...state,
        recorded: {
          ...state.recorded,
          [state.caseId]: provisionalEvidence(state),
        },
      };
  }
}

export function facingProgress(state: AssetAnchorLabState): string {
  const variants = ANCHOR_LAB_CASES[state.caseId].variants;
  const count = variants.reduce(
    (total, variant) =>
      total +
      FACING_LABELS.filter((_, facing) =>
        state.observed.has(
          observationKey(
            state.caseId,
            variant,
            state.candidate,
            facing as FacingIndex
          )
        )
      ).length,
    0
  );
  return `${count}/${variants.length * FACING_LABELS.length}`;
}
