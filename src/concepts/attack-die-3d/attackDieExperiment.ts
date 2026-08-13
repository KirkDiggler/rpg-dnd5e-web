import { Quaternion, Vector3 } from 'three';
import type {
  AttackDieEvidenceTuple,
  AttackDieMaterialMode,
  AttackDieRuntimeSidecar,
  QuaternionTuple,
} from '../../components/ui/dice/attackDieContract';
import { tupleFromVisualConfig } from '../../components/ui/dice/attackDieVisualConfig';
export { ATTACK_DIE_VISUAL_CONFIG as PROVISIONAL_VISUAL_DEFAULTS } from '../../components/ui/dice/attackDieVisualConfig';

export const PROVISIONAL_WARNING =
  'PROVISIONAL — NOT AN ASSET CONTRACT' as const;

export interface AttackDieCalibrationProposal {
  schemaVersion: 1;
  kind: 'attack-die-calibration-proposal';
  warning: typeof PROVISIONAL_WARNING;
  webCommit: string;
  asset: AttackDieRuntimeSidecar['asset'];
  coordinates: AttackDieRuntimeSidecar['coordinates'];
  selectors: AttackDieRuntimeSidecar['selectors'];
  webBuildSha256: string | null;
  tupleDraft: Omit<
    AttackDieEvidenceTuple,
    'contractCoreSha256' | 'webBuildSha256'
  >;
  faces: ReadonlyArray<{ result: number; quaternion: QuaternionTuple }>;
}

export interface AttackDieExperimentState {
  selectedResult: number;
  pose: QuaternionTuple;
  camera: 'top' | 'three-quarter';
  materialMode: AttackDieMaterialMode;
  magicalAnimation: boolean;
  reducedMotion: boolean;
  decorativeVariation: number;
  faces: ReadonlyArray<{ result: number; quaternion: QuaternionTuple }>;
  verificationMode: 'idle' | 'animated' | 'reduced-motion';
  verificationResult: number | null;
}

export type AttackDieExperimentAction =
  | { type: 'result'; result: number }
  | { type: 'camera'; camera: AttackDieExperimentState['camera'] }
  | { type: 'material'; materialMode: AttackDieMaterialMode }
  | { type: 'magical-animation'; enabled: boolean }
  | { type: 'reduced-motion'; enabled: boolean }
  | { type: 'rotate'; axis: 'x' | 'y' | 'z'; degrees: number }
  | { type: 'save' }
  | { type: 'reset' }
  | { type: 'replay' }
  | { type: 'verify-start'; mode: 'animated' | 'reduced-motion' }
  | { type: 'verify-next' }
  | { type: 'verify-stop' }
  | {
      type: 'import-faces';
      faces: ReadonlyArray<{ result: number; quaternion: QuaternionTuple }>;
    };

function normalized(tuple: QuaternionTuple): QuaternionTuple {
  if (!tuple.every(Number.isFinite)) throw Error('quaternion must be finite');
  const magnitude = Math.hypot(...tuple);
  if (magnitude === 0) throw Error('quaternion must be non-zero');
  return tuple.map((value) => value / magnitude) as unknown as QuaternionTuple;
}

export function rotateLocal(
  tuple: QuaternionTuple,
  axis: 'x' | 'y' | 'z',
  degrees: number
): QuaternionTuple {
  if (!Number.isFinite(degrees)) throw Error('rotation must be finite');
  const vector =
    axis === 'x'
      ? new Vector3(1, 0, 0)
      : axis === 'y'
        ? new Vector3(0, 1, 0)
        : new Vector3(0, 0, 1);
  const base = new Quaternion(...normalized(tuple));
  const delta = new Quaternion().setFromAxisAngle(
    vector,
    (degrees * Math.PI) / 180
  );
  base.multiply(delta).normalize();
  return [base.x, base.y, base.z, base.w];
}

export function createAttackDieExperiment(): AttackDieExperimentState {
  return {
    selectedResult: 1,
    pose: [0, 0, 0, 1],
    camera: 'top',
    materialMode: 'raw',
    magicalAnimation: false,
    reducedMotion: false,
    decorativeVariation: 0,
    faces: [],
    verificationMode: 'idle',
    verificationResult: null,
  };
}

function selectedSaved(state: AttackDieExperimentState) {
  return state.faces.find((face) => face.result === state.selectedResult)
    ?.quaternion;
}

export function attackDieExperimentReducer(
  state: AttackDieExperimentState,
  action: AttackDieExperimentAction
): AttackDieExperimentState {
  switch (action.type) {
    case 'result': {
      if (
        !Number.isInteger(action.result) ||
        action.result < 1 ||
        action.result > 20
      )
        throw Error('result must be an integer from 1 to 20');
      const saved = state.faces.find(
        (face) => face.result === action.result
      )?.quaternion;
      return {
        ...state,
        selectedResult: action.result,
        pose: saved ?? [0, 0, 0, 1],
      };
    }
    case 'camera':
      return { ...state, camera: action.camera };
    case 'material':
      return { ...state, materialMode: action.materialMode };
    case 'magical-animation':
      return {
        ...state,
        magicalAnimation: action.enabled && !state.reducedMotion,
      };
    case 'reduced-motion':
      return {
        ...state,
        reducedMotion: action.enabled,
        magicalAnimation: action.enabled ? false : state.magicalAnimation,
      };
    case 'rotate':
      return {
        ...state,
        pose: rotateLocal(state.pose, action.axis, action.degrees),
      };
    case 'save': {
      const face = {
        result: state.selectedResult,
        quaternion: normalized(state.pose),
      };
      return {
        ...state,
        pose: face.quaternion,
        faces: [
          ...state.faces.filter((entry) => entry.result !== face.result),
          face,
        ].sort((a, b) => a.result - b.result),
      };
    }
    case 'reset':
      return { ...state, pose: selectedSaved(state) ?? [0, 0, 0, 1] };
    case 'replay':
      return { ...state, decorativeVariation: state.decorativeVariation + 1 };
    case 'verify-start':
      return {
        ...state,
        verificationMode: action.mode,
        verificationResult: 1,
        selectedResult: 1,
        reducedMotion: action.mode === 'reduced-motion',
        magicalAnimation: false,
      };
    case 'verify-next': {
      if (state.verificationResult === null || state.verificationResult >= 20)
        return { ...state, verificationMode: 'idle', verificationResult: null };
      const result = state.verificationResult + 1;
      return { ...state, verificationResult: result, selectedResult: result };
    }
    case 'verify-stop':
      return { ...state, verificationMode: 'idle', verificationResult: null };
    case 'import-faces': {
      if (action.faces.length !== 20)
        throw Error('candidate import requires 20 faces');
      const seen = new Set<number>();
      const faces = action.faces
        .map((face) => {
          if (
            !Number.isInteger(face.result) ||
            face.result < 1 ||
            face.result > 20 ||
            seen.has(face.result)
          )
            throw Error('candidate faces invalid');
          seen.add(face.result);
          return {
            result: face.result,
            quaternion: normalized(face.quaternion),
          };
        })
        .sort((a, b) => a.result - b.result);
      return {
        ...state,
        faces,
        pose:
          faces.find((face) => face.result === state.selectedResult)
            ?.quaternion ?? state.pose,
      };
    }
  }
}

interface ProposalInput {
  webCommit: string;
  webBuildSha256: string | null;
  asset: AttackDieRuntimeSidecar['asset'];
  coordinates: AttackDieRuntimeSidecar['coordinates'];
  selectors: AttackDieRuntimeSidecar['selectors'];
  materialMode: AttackDieMaterialMode;
  faces: ReadonlyArray<{ result: number; quaternion: QuaternionTuple }>;
}

export function exportCalibrationProposal(
  input: ProposalInput
): AttackDieCalibrationProposal {
  if (!/^[0-9a-f]{40}$/.test(input.webCommit))
    throw Error('web commit must be a full SHA');
  if (
    input.webBuildSha256 !== null &&
    !/^[0-9a-f]{64}$/.test(input.webBuildSha256)
  )
    throw Error('build digest must be SHA-256 or null');
  if (
    input.webBuildSha256 !== null &&
    typeof window !== 'undefined' &&
    window.__ATTACK_DIE_BUILD_SHA256__ !== undefined &&
    input.webBuildSha256 !== window.__ATTACK_DIE_BUILD_SHA256__
  )
    throw Error('build digest mismatch');
  if (input.faces.length > 20)
    throw Error('at most 20 mappings may be proposed');
  const seen = new Set<number>();
  const faces = input.faces
    .map((face) => {
      if (
        !Number.isInteger(face.result) ||
        face.result < 1 ||
        face.result > 20 ||
        seen.has(face.result)
      )
        throw Error('proposal mappings must use unique results 1–20');
      seen.add(face.result);
      return { result: face.result, quaternion: normalized(face.quaternion) };
    })
    .sort((a, b) => a.result - b.result);
  return {
    schemaVersion: 1,
    kind: 'attack-die-calibration-proposal',
    warning: PROVISIONAL_WARNING,
    webCommit: input.webCommit,
    asset: input.asset,
    coordinates: input.coordinates,
    selectors: input.selectors,
    webBuildSha256: input.webBuildSha256,
    tupleDraft: tupleFromVisualConfig({
      webCommit: input.webCommit,
      glbSha256: input.asset.sha256,
      materialMode: input.materialMode,
    }),
    faces,
  };
}
