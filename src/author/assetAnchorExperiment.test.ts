import { describe, expect, it } from 'vitest';
import {
  ADJUST_LIMIT_METERS,
  ADJUST_STEP_METERS,
  ANCHOR_LAB_CASES,
  assetAnchorLabReducer,
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
  type LabVariant,
} from './assetAnchorExperiment';

function visitSix(
  state: AssetAnchorLabState,
  variant?: LabVariant
): AssetAnchorLabState {
  let next = variant
    ? assetAnchorLabReducer(state, { type: 'select-variant', variant })
    : state;
  for (let facing = 0; facing < FACING_LABELS.length; facing += 1) {
    next = assetAnchorLabReducer(next, {
      type: 'select-facing',
      facing: facing as FacingIndex,
    });
  }
  return next;
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
    let state = createInitialAssetAnchorLabState();
    state = assetAnchorLabReducer(state, {
      type: 'select-candidate',
      candidate: 'bounds-center-floor',
    });
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

  it('withholds output until an explicit candidate, Orbit+Play, and all six facings are observed', () => {
    let state = createInitialAssetAnchorLabState();
    state = visitSix(state);
    state = assetAnchorLabReducer(state, {
      type: 'select-camera',
      mode: 'play',
    });
    expect(canRecordProvisional(state)).toBe(false);
    expect(
      assetAnchorLabReducer(state, { type: 'record-provisional' }).recorded
    ).toEqual({});

    state = assetAnchorLabReducer(state, {
      type: 'select-candidate',
      candidate: 'raw-origin',
    });
    state = visitSix(state);
    expect(canRecordProvisional(state)).toBe(true);
    state = assetAnchorLabReducer(state, { type: 'record-provisional' });
    expect(state.recorded.bookcase?.warning).toBe(
      'NON-PRODUCTION FIXTURE EVIDENCE'
    );
    expect(state.recorded.bookcase?.facingsCompared).toEqual(FACING_LABELS);
  });

  it.each(['raw-origin', 'bounds-center-floor'] as AnchorCandidate[])(
    'requires standing and downed to each retain all six observations for %s',
    (candidate) => {
      let state = assetAnchorLabReducer(createInitialAssetAnchorLabState(), {
        type: 'select-case',
        caseId: 'fighter-pair',
      });
      state = assetAnchorLabReducer(state, {
        type: 'select-candidate',
        candidate,
      });
      state = visitSix(state, 'standing');
      state = assetAnchorLabReducer(state, {
        type: 'select-camera',
        mode: 'play',
      });
      expect(canRecordProvisional(state)).toBe(false);
      state = visitSix(state, 'downed');
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
    'can exercise every %s / %s candidate through all facings and required variants',
    (caseId, candidate) => {
      let state = assetAnchorLabReducer(createInitialAssetAnchorLabState(), {
        type: 'select-case',
        caseId,
      });
      state = assetAnchorLabReducer(state, {
        type: 'select-candidate',
        candidate,
      });
      for (const variant of ANCHOR_LAB_CASES[caseId].variants) {
        state = visitSix(state, variant);
      }
      state = assetAnchorLabReducer(state, {
        type: 'select-camera',
        mode: 'play',
      });
      expect(canRecordProvisional(state)).toBe(true);
    }
  );
});
