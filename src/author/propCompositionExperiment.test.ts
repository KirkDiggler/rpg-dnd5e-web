import { cubeToWorld, HEX_SIZE } from '@/components/hex-grid/hexMath';
import { resolvePropVariant } from '@/components/hex-grid/propManifest';
import { SYNTY_SCALE } from '@/rendering/calibrationConstants';
import { describe, expect, it } from 'vitest';
import { cubeAtColRow } from './hexLayout';
import {
  ALONG_WALL_LIMIT_METERS,
  BOOKCASE_REF,
  compositionPreviewResolver,
  createInitialPropCompositionState,
  FIXTURE_BOOKCASE_RAW_XZ_BOUNDS,
  FIXTURE_SLOT_CENTER_Z,
  FIXTURE_TORCH_ATTACHMENT_HEIGHT,
  FIXTURE_TORCH_RAW_MIN_Z,
  FIXTURE_WALL_LINE_Z,
  FIXTURE_WALL_RAW_ROOM_FACE_Z,
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

    const override = compositionPreviewResolver(state)(after.selection)!;
    expect(override.assetRef).toBe(ORNATE_TORCH_REF);
    expect(override.positionOffset?.[0]).toBeCloseTo(0.1, 10);
    expect(override.positionOffset?.[1]).toBe(FIXTURE_TORCH_ATTACHMENT_HEIGHT);
    // The normal nudge is preserved relative to the NEW wall-attached
    // baseline, not reused as an absolute floor-slot position.
    const wallFaceZ =
      FIXTURE_WALL_LINE_Z + FIXTURE_WALL_RAW_ROOM_FACE_Z * SYNTY_SCALE;
    const torchBaselineZ = wallFaceZ - FIXTURE_TORCH_RAW_MIN_Z * SYNTY_SCALE;
    expect(FIXTURE_SLOT_CENTER_Z + override.positionOffset![2]).toBeCloseTo(
      torchBaselineZ - 0.05,
      10
    );
  });

  it('centers the measured bookcase XZ bounds on the canonical owning hex and leaves only flush wall overlap', () => {
    const state = createInitialPropCompositionState();
    const selected = selectedCompositionPlacement(state);
    const override = compositionPreviewResolver(state)(selected.selection)!;
    const [dx, , dz] = override.positionOffset!;
    const canonical = cubeToWorld(cubeAtColRow(2, 3), HEX_SIZE);
    const bounds = FIXTURE_BOOKCASE_RAW_XZ_BOUNDS;

    const resolvedBboxCenterX =
      canonical.x + dx + ((bounds.minX + bounds.maxX) / 2) * SYNTY_SCALE;
    const resolvedBboxCenterZ =
      canonical.z + dz + ((bounds.minZ + bounds.maxZ) / 2) * SYNTY_SCALE;
    expect(resolvedBboxCenterX).toBeCloseTo(canonical.x, 10);
    expect(resolvedBboxCenterZ).toBeCloseTo(canonical.z, 10);

    const resolvedBackFaceZ = canonical.z + dz + bounds.minZ * SYNTY_SCALE;
    const wallRoomFaceZ =
      FIXTURE_WALL_LINE_Z + FIXTURE_WALL_RAW_ROOM_FACE_Z * SYNTY_SCALE;
    // Actual measured result: a small overlap, not the raw-pivot 28.5 cm gap.
    expect(resolvedBackFaceZ - wallRoomFaceZ).toBeCloseTo(-0.044353, 5);
    expect(Math.abs(resolvedBackFaceZ - wallRoomFaceZ)).toBeLessThan(0.05);
  });

  it('resolves ornate torch replacement against its distinct wall plane and fixture-local attachment Y', () => {
    let state = createInitialPropCompositionState();
    state = propCompositionReducer(state, {
      type: 'nudge',
      axis: 'along-wall',
      delta: 0.1,
    });
    state = propCompositionReducer(state, {
      type: 'replace-with-ornate-torch',
    });
    const selected = selectedCompositionPlacement(state);
    const override = compositionPreviewResolver(state)(selected.selection)!;
    const canonical = cubeToWorld(cubeAtColRow(2, 3), HEX_SIZE);
    const resolvedRootZ = canonical.z + override.positionOffset![2];
    const resolvedBackFaceZ =
      resolvedRootZ + FIXTURE_TORCH_RAW_MIN_Z * SYNTY_SCALE;
    const wallRoomFaceZ =
      FIXTURE_WALL_LINE_Z + FIXTURE_WALL_RAW_ROOM_FACE_Z * SYNTY_SCALE;

    expect(override.positionOffset![0]).toBeCloseTo(0.1, 10);
    expect(override.positionOffset![1]).toBe(FIXTURE_TORCH_ATTACHMENT_HEIGHT);
    expect(resolvedBackFaceZ).toBeCloseTo(wallRoomFaceZ, 10);
    expect(resolvedRootZ).not.toBeCloseTo(canonical.z, 5);
  });

  it('snap and reset return to the resolved asset baseline rather than the raw GLB origin', () => {
    const initial = createInitialPropCompositionState();
    const initialPlacement = selectedCompositionPlacement(initial);
    const bookcaseBaseline = compositionPreviewResolver(initial)(
      initialPlacement.selection
    )!.positionOffset!;
    expect(bookcaseBaseline[0]).not.toBe(0);
    expect(bookcaseBaseline[2]).not.toBe(0);

    let snapped = propCompositionReducer(initial, {
      type: 'nudge',
      axis: 'toward-wall',
      delta: -0.1,
    });
    snapped = propCompositionReducer(snapped, {
      type: 'snap',
      anchor: 'wall-line',
    });
    expect(
      compositionPreviewResolver(snapped)(initialPlacement.selection)!
        .positionOffset
    ).toEqual(bookcaseBaseline);

    let replaced = propCompositionReducer(initial, {
      type: 'replace-with-ornate-torch',
    });
    replaced = propCompositionReducer(replaced, {
      type: 'nudge',
      axis: 'toward-wall',
      delta: 0.1,
    });
    replaced = propCompositionReducer(replaced, { type: 'reset-adjustment' });
    const torchBaseline = compositionPreviewResolver(replaced)(
      initialPlacement.selection
    )!.positionOffset!;
    expect(torchBaseline[2]).not.toBe(0);
    expect(
      FIXTURE_SLOT_CENTER_Z +
        torchBaseline[2] +
        FIXTURE_TORCH_RAW_MIN_Z * SYNTY_SCALE
    ).toBeCloseTo(
      FIXTURE_WALL_LINE_Z + FIXTURE_WALL_RAW_ROOM_FACE_Z * SYNTY_SCALE,
      10
    );
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
