import { resolvePropVariant } from '@/components/hex-grid/propManifest';
import { describe, expect, it } from 'vitest';
import {
  ALONG_WALL_LIMIT_METERS,
  BOOKCASE_REF,
  compositionPreviewResolver,
  createInitialPropCompositionState,
  NUDGE_STEP_METERS,
  ORNATE_TORCH_REF,
  propCompositionReducer,
  selectedCompositionPlacement,
  TOWARD_WALL_LIMIT_METERS,
} from './propCompositionExperiment';

describe('precise prop composition fixture state', () => {
  it('uses the actual shared manifest models, not fixture-only stand-ins', () => {
    expect(resolvePropVariant(BOOKCASE_REF)?.file).toBe(
      'props/SM_Prop_Bookcase_Small_01.glb'
    );
    expect(resolvePropVariant(ORNATE_TORCH_REF)?.file).toBe(
      'props/SM_Prop_Torch_Ornate_01.glb'
    );
  });

  it.each([
    {
      label: 'positive along-wall',
      axis: 'along-wall' as const,
      delta: NUDGE_STEP_METERS,
      field: 'alongWallMeters' as const,
      limit: ALONG_WALL_LIMIT_METERS,
    },
    {
      label: 'negative along-wall',
      axis: 'along-wall' as const,
      delta: -NUDGE_STEP_METERS,
      field: 'alongWallMeters' as const,
      limit: -ALONG_WALL_LIMIT_METERS,
    },
    {
      label: 'positive wall-normal',
      axis: 'toward-wall' as const,
      delta: NUDGE_STEP_METERS,
      field: 'towardWallMeters' as const,
      limit: TOWARD_WALL_LIMIT_METERS,
    },
    {
      label: 'negative wall-normal',
      axis: 'toward-wall' as const,
      delta: -NUDGE_STEP_METERS,
      field: 'towardWallMeters' as const,
      limit: -TOWARD_WALL_LIMIT_METERS,
    },
  ])(
    'clamps $label at its exact limit and leaves both neighbors untouched',
    ({ axis, delta, field, limit }) => {
      const initial = createInitialPropCompositionState();
      let state = initial;
      for (let i = 0; i < 20; i += 1) {
        state = propCompositionReducer(state, {
          type: 'nudge',
          axis,
          delta,
        });
      }

      const selected = selectedCompositionPlacement(state);
      expect(selected[field]).toBe(limit);
      expect(
        field === 'alongWallMeters'
          ? selected.towardWallMeters
          : selected.alongWallMeters
      ).toBe(0);
      expect(state.placements[0]).toEqual(initial.placements[0]);
      expect(state.placements[2]).toEqual(initial.placements[2]);
    }
  );

  it('slot-center snap clears only along-wall adjustment and preserves normal adjustment plus neighbors', () => {
    let state = createInitialPropCompositionState();
    state = propCompositionReducer(state, {
      type: 'nudge',
      axis: 'along-wall',
      delta: 0.1,
    });
    state = propCompositionReducer(state, {
      type: 'nudge',
      axis: 'toward-wall',
      delta: -0.15,
    });
    const neighborsBefore = [state.placements[0], state.placements[2]];

    const snapped = propCompositionReducer(state, {
      type: 'snap',
      anchor: 'slot-center',
    });
    expect(selectedCompositionPlacement(snapped)).toMatchObject({
      alongWallMeters: 0,
      towardWallMeters: -0.15,
    });
    expect([snapped.placements[0], snapped.placements[2]]).toEqual(
      neighborsBefore
    );
  });

  it('wall-line snap clears only wall-normal adjustment and preserves along-wall adjustment plus neighbors', () => {
    let state = createInitialPropCompositionState();
    state = propCompositionReducer(state, {
      type: 'nudge',
      axis: 'along-wall',
      delta: 0.1,
    });
    state = propCompositionReducer(state, {
      type: 'nudge',
      axis: 'toward-wall',
      delta: -0.15,
    });
    const neighborsBefore = [state.placements[0], state.placements[2]];

    const snapped = propCompositionReducer(state, {
      type: 'snap',
      anchor: 'wall-line',
    });
    expect(selectedCompositionPlacement(snapped)).toMatchObject({
      alongWallMeters: 0.1,
      towardWallMeters: 0,
    });
    expect([snapped.placements[0], snapped.placements[2]]).toEqual(
      neighborsBefore
    );
  });

  it('one-action replacement preserves authored center/nudge while refreshing the asset ref', () => {
    let state = createInitialPropCompositionState();
    state = propCompositionReducer(state, {
      type: 'nudge',
      axis: 'along-wall',
      delta: 0.1,
    });
    state = propCompositionReducer(state, {
      type: 'nudge',
      axis: 'toward-wall',
      delta: -0.05,
    });
    const before = selectedCompositionPlacement(state);

    state = propCompositionReducer(state, {
      type: 'replace-with-ornate-torch',
    });
    const after = selectedCompositionPlacement(state);
    expect(after.assetRef).toBe(ORNATE_TORCH_REF);
    expect(after.slotId).toBe(before.slotId);
    expect(after.selection).toEqual(before.selection);
    expect(after.alongWallMeters).toBe(before.alongWallMeters);
    expect(after.towardWallMeters).toBe(before.towardWallMeters);

    expect(compositionPreviewResolver(state)(after.selection)).toEqual({
      assetRef: ORNATE_TORCH_REF,
      positionOffset: [0.1, 1.15, -0.05],
    });
  });

  it('reset adjustment keeps the replacement; reset fixture restores all three bookcases', () => {
    let state = propCompositionReducer(createInitialPropCompositionState(), {
      type: 'replace-with-ornate-torch',
    });
    state = propCompositionReducer(state, {
      type: 'nudge',
      axis: 'along-wall',
      delta: 0.1,
    });
    state = propCompositionReducer(state, { type: 'reset-adjustment' });
    expect(selectedCompositionPlacement(state)).toMatchObject({
      assetRef: ORNATE_TORCH_REF,
      alongWallMeters: 0,
      towardWallMeters: 0,
    });

    state = propCompositionReducer(state, { type: 'reset-fixture' });
    expect(state.placements.every((p) => p.assetRef === BOOKCASE_REF)).toBe(
      true
    );
    expect(state.selectedSlotId).toBe('center');
  });
});
