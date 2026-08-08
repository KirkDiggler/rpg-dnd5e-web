import { describe, expect, it } from 'vitest';
import {
  ADJUST_LIMIT_METERS,
  ADJUST_STEP_METERS,
  ANCHOR_LAB_CASES,
  assetAnchorLabReducer,
  assetVariantKey,
  candidateOffset,
  canRecordProvisional,
  createInitialAssetAnchorLabState,
  FACING_LABELS,
  FIXTURE_VISIBLE_BOUNDS,
  OWNING_HEX,
  resolveAssetAnchorUrl,
  resolvedCalibrationOffset,
  type AnchorCandidate,
  type AssetAnchorLabState,
  type FacingIndex,
  type LabCameraMode,
  type LabVariant,
  type RenderObservation,
} from './assetAnchorExperiment';

const VALID_BOUNDS = FIXTURE_VISIBLE_BOUNDS.bookcase!;

function acknowledge(
  state: AssetAnchorLabState,
  overrides: Partial<RenderObservation> = {}
): AssetAnchorLabState {
  return assetAnchorLabReducer(state, {
    type: 'acknowledge-render',
    observation: {
      caseId: state.caseId,
      variant: state.variant,
      candidate: state.candidate,
      cameraMode: state.cameraMode,
      facing: state.facing,
      bounds: VALID_BOUNDS,
      ...overrides,
    },
  });
}

function observeFacing(
  state: AssetAnchorLabState,
  facing: FacingIndex
): AssetAnchorLabState {
  return acknowledge(
    assetAnchorLabReducer(state, { type: 'select-facing', facing })
  );
}

function observeCamera(
  state: AssetAnchorLabState,
  cameraMode: LabCameraMode
): AssetAnchorLabState {
  return acknowledge(
    assetAnchorLabReducer(state, { type: 'select-camera', mode: cameraMode })
  );
}

function observeRequiredVariant(
  state: AssetAnchorLabState,
  variant: LabVariant
): AssetAnchorLabState {
  let next = assetAnchorLabReducer(state, {
    type: 'select-variant',
    variant,
  });
  next = assetAnchorLabReducer(next, { type: 'select-camera', mode: 'orbit' });
  for (let facing = 0; facing < FACING_LABELS.length; facing += 1) {
    next = observeFacing(next, facing as FacingIndex);
  }
  return observeCamera(next, 'play');
}

function chooseCandidate(
  state: AssetAnchorLabState,
  candidate: AnchorCandidate
): AssetAnchorLabState {
  return assetAnchorLabReducer(state, {
    type: 'select-candidate',
    candidate,
  });
}

describe('Asset Anchor Lab fixture state', () => {
  it('resolves every case through the shipped prop/class resolver paths', () => {
    expect(resolveAssetAnchorUrl('bookcase', 'standing')).toBe(
      '/models/synty/props/SM_Prop_Bookcase_Small_01.glb'
    );
    expect(resolveAssetAnchorUrl('torch-ornate', 'standing')).toBe(
      '/models/synty/props/SM_Prop_Torch_Ornate_01.glb'
    );
    expect(resolveAssetAnchorUrl('fighter-pair', 'standing')).toBe(
      '/models/synty/characters/fighter.glb'
    );
    expect(resolveAssetAnchorUrl('fighter-pair', 'downed')).toBe(
      '/models/synty/characters/fighter-downed.glb'
    );
  });

  it('derives distinct origin, visible-center/floor, and wall candidates from measured geometry', () => {
    const bounds = FIXTURE_VISIBLE_BOUNDS.bookcase!;
    const origin = candidateOffset('bookcase', 'raw-origin', bounds);
    const centered = candidateOffset('bookcase', 'bounds-center-floor', bounds);
    const wall = candidateOffset('bookcase', 'wall-face', bounds);
    expect(origin).toEqual([0, 0, 0]);
    expect(centered[0]).toBeCloseTo(-bounds.center[0], 8);
    expect(centered[1]).toBeCloseTo(-bounds.min[1], 8);
    expect(centered[2]).toBeCloseTo(-bounds.center[2], 8);
    expect(wall[0]).toBeCloseTo(centered[0], 8);
    expect(wall[2]).not.toBeCloseTo(centered[2], 3);
  });

  it.each([
    [0, ADJUST_STEP_METERS, ADJUST_LIMIT_METERS],
    [0, -ADJUST_STEP_METERS, -ADJUST_LIMIT_METERS],
    [1, ADJUST_STEP_METERS, ADJUST_LIMIT_METERS],
    [1, -ADJUST_STEP_METERS, -ADJUST_LIMIT_METERS],
    [2, ADJUST_STEP_METERS, ADJUST_LIMIT_METERS],
    [2, -ADJUST_STEP_METERS, -ADJUST_LIMIT_METERS],
  ] as const)(
    'clamps axis %i with delta %f at exact bounded limit',
    (axis, delta, expected) => {
      let state = createInitialAssetAnchorLabState();
      for (let index = 0; index < 20; index += 1) {
        state = assetAnchorLabReducer(state, {
          type: 'adjust',
          axis,
          delta,
        });
      }
      expect(state.adjustment[axis]).toBe(expected);
      expect(state.adjustment.filter((_, index) => index !== axis)).toEqual([
        0, 0,
      ]);
    }
  );

  it('reset returns exactly to the selected candidate while raw bounds and owning hex stay isolated', () => {
    const frozenBounds = structuredClone(FIXTURE_VISIBLE_BOUNDS.bookcase!);
    let state = chooseCandidate(
      createInitialAssetAnchorLabState(),
      'bounds-center-floor'
    );
    const baseline = resolvedCalibrationOffset(state, frozenBounds);
    state = assetAnchorLabReducer(state, {
      type: 'adjust',
      axis: 2,
      delta: ADJUST_STEP_METERS,
    });
    expect(resolvedCalibrationOffset(state, frozenBounds)).not.toEqual(
      baseline
    );
    state = assetAnchorLabReducer(state, { type: 'reset-adjustment' });
    expect(resolvedCalibrationOffset(state, frozenBounds)).toEqual(baseline);
    expect(FIXTURE_VISIBLE_BOUNDS.bookcase).toEqual(frozenBounds);
    expect(OWNING_HEX).toEqual({ q: 0, r: 0, s: 0 });
  });

  it('starts with no pre-credited observation and unlocks only from positive acknowledgements for the exact selection', () => {
    let state = createInitialAssetAnchorLabState();
    expect(state.observed.size).toBe(0);
    expect(state.assetStatus).toEqual({});
    state = chooseCandidate(state, 'bounds-center-floor');
    state = observeRequiredVariant(state, 'standing');
    expect(state.assetStatus[assetVariantKey('bookcase', 'standing')]).toBe(
      'measured'
    );
    expect(canRecordProvisional(state)).toBe(true);
    state = assetAnchorLabReducer(state, { type: 'record-provisional' });
    expect(state.recorded.bookcase?.warning).toBe(
      'NON-PRODUCTION FIXTURE EVIDENCE'
    );
  });

  it('withholds for pending, load error, and unusable/unmeasured geometry even after prior coverage', () => {
    let qualified = chooseCandidate(
      createInitialAssetAnchorLabState(),
      'bounds-center-floor'
    );
    qualified = observeRequiredVariant(qualified, 'standing');
    expect(canRecordProvisional(qualified)).toBe(true);

    const pending = assetAnchorLabReducer(qualified, {
      type: 'asset-load-pending',
      caseId: 'bookcase',
      variant: 'standing',
    });
    expect(canRecordProvisional(pending)).toBe(false);
    expect(pending.observed.size).toBe(0);

    const errored = assetAnchorLabReducer(qualified, {
      type: 'asset-load-failed',
      caseId: 'bookcase',
      variant: 'standing',
      status: 'error',
    });
    expect(canRecordProvisional(errored)).toBe(false);

    const invalid = acknowledge(qualified, {
      bounds: {
        min: [0, 0, 0],
        max: [0, 0, 0],
        center: [0, 0, 0],
        size: [0, 0, 0],
      },
    });
    expect(invalid.assetStatus[assetVariantKey('bookcase', 'standing')]).toBe(
      'unmeasured'
    );
    expect(canRecordProvisional(invalid)).toBe(false);
  });

  it('withholds when Play is missing even after all six selected-candidate Orbit renders', () => {
    let state = chooseCandidate(
      createInitialAssetAnchorLabState(),
      'bounds-center-floor'
    );
    for (let facing = 0; facing < FACING_LABELS.length; facing += 1) {
      state = observeFacing(state, facing as FacingIndex);
    }
    expect(canRecordProvisional(state)).toBe(false);
  });

  it('does not let raw/Orbit or another candidate satisfy selected bounds-center/Orbit', () => {
    let state = chooseCandidate(
      createInitialAssetAnchorLabState(),
      'raw-origin'
    );
    state = observeRequiredVariant(state, 'standing');
    expect(canRecordProvisional(state)).toBe(true);

    state = chooseCandidate(state, 'bounds-center-floor');
    // Six Play observations for bounds-center; prior raw Orbit must not count.
    state = assetAnchorLabReducer(state, {
      type: 'select-camera',
      mode: 'play',
    });
    for (let facing = 0; facing < FACING_LABELS.length; facing += 1) {
      state = observeFacing(state, facing as FacingIndex);
    }
    expect(canRecordProvisional(state)).toBe(false);
    state = observeCamera(state, 'orbit');
    expect(canRecordProvisional(state)).toBe(true);
  });

  it('ignores stale acknowledgements from another candidate, variant, camera, or facing', () => {
    let state = chooseCandidate(
      createInitialAssetAnchorLabState(),
      'bounds-center-floor'
    );
    const before = state;
    state = acknowledge(state, { candidate: 'raw-origin' });
    state = acknowledge(state, { variant: 'downed' });
    state = acknowledge(state, { cameraMode: 'play' });
    state = acknowledge(state, { facing: 4 });
    expect(state).toBe(before);
    expect(state.observed.size).toBe(0);
  });

  it.each(['raw-origin', 'bounds-center-floor'] as AnchorCandidate[])(
    'requires standing and downed positive observations for %s on one logical hex',
    (candidate) => {
      let state = assetAnchorLabReducer(createInitialAssetAnchorLabState(), {
        type: 'select-case',
        caseId: 'fighter-pair',
      });
      state = chooseCandidate(state, candidate);
      state = observeRequiredVariant(state, 'standing');
      expect(canRecordProvisional(state)).toBe(false);
      state = observeRequiredVariant(state, 'downed');
      expect(canRecordProvisional(state)).toBe(true);
      expect(OWNING_HEX).toEqual({ q: 0, r: 0, s: 0 });
    }
  );

  it.each([
    ['bookcase', 'raw-origin'],
    ['bookcase', 'bounds-center-floor'],
    ['bookcase', 'wall-face'],
    ['torch-ornate', 'raw-origin'],
    ['torch-ornate', 'bounds-center-floor'],
    ['torch-ornate', 'wall-face'],
    ['fighter-pair', 'raw-origin'],
    ['fighter-pair', 'bounds-center-floor'],
  ] as const)(
    'can exercise every %s / %s candidate through positive real-render acknowledgements',
    (caseId, candidate) => {
      let state = assetAnchorLabReducer(createInitialAssetAnchorLabState(), {
        type: 'select-case',
        caseId,
      });
      state = chooseCandidate(state, candidate);
      for (const variant of ANCHOR_LAB_CASES[caseId].variants) {
        state = observeRequiredVariant(state, variant);
      }
      expect(canRecordProvisional(state)).toBe(true);
    }
  );
});
