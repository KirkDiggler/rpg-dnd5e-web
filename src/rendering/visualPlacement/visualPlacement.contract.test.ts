import { facingToRotationY } from '@/author/boardGeometry';
import { describe, expect, it } from 'vitest';
import {
  CONTRACT_FIXTURE_CATALOG,
  fixtureEntry,
  GENERIC_PLACEMENT_FIXTURES,
  SIX_EXISTING_FACINGS,
} from './contractFixtures';
import { buildReplacementCandidate } from './replacement';
import { resolveVisualPlacement } from './resolver';
import { selectVisualVariant } from './selector';
import {
  BOOKCASE_VARIANT_ID,
  TORCH_VARIANT_ID,
  type Matrix4Elements,
  type Vec3,
  type VisualAssetCatalog,
} from './types';

function expectMatrixClose(
  actual: Matrix4Elements,
  expected: readonly number[],
  digits = 12
) {
  expect(actual).toHaveLength(16);
  expected.forEach((value, index) =>
    expect(actual[index], `matrix[${index}]`).toBeCloseTo(value, digits)
  );
}

function expectVectorClose(actual: Vec3, expected: Vec3, digits = 12) {
  expected.forEach((value, index) =>
    expect(actual[index], `vector[${index}]`).toBeCloseTo(value, digits)
  );
}

function translation(matrix: Matrix4Elements): Vec3 {
  return [matrix[12], matrix[13], matrix[14]];
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function reorderedCatalog(): VisualAssetCatalog {
  return {
    ...CONTRACT_FIXTURE_CATALOG,
    families: [...CONTRACT_FIXTURE_CATALOG.families].reverse(),
    entries: [...CONTRACT_FIXTURE_CATALOG.entries].reverse(),
  };
}

describe('Wave B consumer contract fixtures', () => {
  it('pins exactly the two approved v1 ids without treating fixture values as provider facts', () => {
    expect(
      CONTRACT_FIXTURE_CATALOG.entries.map((entry) => entry.id).sort()
    ).toEqual([BOOKCASE_VARIANT_ID, TORCH_VARIANT_ID].sort());
    expect(
      CONTRACT_FIXTURE_CATALOG.entries.every((entry) =>
        entry.path.startsWith('fixture-only/')
      )
    ).toBe(true);
  });

  it('selects the declared family default independent of array order', () => {
    for (const catalog of [CONTRACT_FIXTURE_CATALOG, reorderedCatalog()]) {
      expect(
        selectVisualVariant(catalog, 'dnd5e:props:bookcase')
      ).toMatchObject({
        selected: true,
        entry: { id: BOOKCASE_VARIANT_ID },
      });
      expect(
        selectVisualVariant(catalog, 'dnd5e:props:torch-ornate')
      ).toMatchObject({
        selected: true,
        entry: { id: TORCH_VARIANT_ID },
      });
    }
  });

  it('fails unknown/foreign explicit ids and invalid defaults deterministically', () => {
    expect(
      selectVisualVariant(
        CONTRACT_FIXTURE_CATALOG,
        'dnd5e:props:bookcase',
        'synty:props:not-present'
      )
    ).toEqual({ selected: false, reason: 'unknown-explicit-variant' });
    expect(
      selectVisualVariant(
        CONTRACT_FIXTURE_CATALOG,
        'dnd5e:props:bookcase',
        TORCH_VARIANT_ID
      )
    ).toEqual({ selected: false, reason: 'foreign-explicit-variant' });
    expect(
      selectVisualVariant(
        {
          ...CONTRACT_FIXTURE_CATALOG,
          families: [
            {
              semanticRef: 'dnd5e:props:bookcase',
              defaultVariantId: 'synty:props:missing-default',
            },
          ],
        },
        'dnd5e:props:bookcase'
      )
    ).toEqual({ selected: false, reason: 'missing-default' });
    expect(
      selectVisualVariant(
        {
          ...CONTRACT_FIXTURE_CATALOG,
          families: [
            {
              semanticRef: 'dnd5e:props:bookcase',
              defaultVariantId: TORCH_VARIANT_ID,
            },
          ],
        },
        'dnd5e:props:bookcase'
      )
    ).toEqual({ selected: false, reason: 'foreign-default' });
  });

  it('distinguishes omission from an explicit zero without changing the generic matrix', () => {
    const omitted = resolveVisualPlacement(undefined, [3, 4, 5], Math.PI / 3);
    const zero = resolveVisualPlacement(
      undefined,
      [3, 4, 5],
      Math.PI / 3,
      [0, 0, 0]
    );
    expect(omitted.matrix).toEqual(zero.matrix);
    expect(omitted.diagnostics.offsetPresence).toBe('omitted');
    expect(zero.diagnostics.offsetPresence).toBe('explicit');
  });

  it.each(GENERIC_PLACEMENT_FIXTURES)(
    'applies generic P exactly once to $kind',
    (fixture) => {
      const yaw = facingToRotationY(fixture.facing);
      const result = resolveVisualPlacement(
        undefined,
        fixture.canonicalOrigin,
        yaw,
        fixture.offset
      );
      const offset = fixture.offset ?? [0, 0, 0];
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      expectMatrixClose(result.matrix, [
        c,
        0,
        -s,
        0,
        0,
        1,
        0,
        0,
        s,
        0,
        c,
        0,
        fixture.canonicalOrigin[0] + offset[0],
        fixture.canonicalOrigin[1] + offset[1],
        fixture.canonicalOrigin[2] + offset[2],
        1,
      ]);
      expect(result.diagnostics.calibration).toBe('generic');
    }
  );

  it.each(SIX_EXISTING_FACINGS)(
    'keeps the world offset unchanged by existing facing %i',
    (facing) => {
      const yaw = facingToRotationY(facing);
      const offset: Vec3 = [0.375, -0.25, 0.625];
      for (const entry of [undefined, fixtureEntry(BOOKCASE_VARIANT_ID)]) {
        const base = resolveVisualPlacement(entry, [7, 2, -4], yaw, [0, 0, 0]);
        const shifted = resolveVisualPlacement(entry, [7, 2, -4], yaw, offset);
        expectVectorClose(
          subtract(translation(shifted.matrix), translation(base.matrix)),
          offset
        );
      }
    }
  );

  it.each([
    [[1, 0, 0]],
    [[-1, 0, 0]],
    [[0, 1, 0]],
    [[0, -1, 0]],
    [[0, 0, 1]],
    [[0, 0, -1]],
  ] as const)('preserves signed world-axis offset %j', (offset) => {
    const result = resolveVisualPlacement(
      undefined,
      [10, 20, 30],
      Math.PI,
      offset
    );
    expect(translation(result.matrix)).toEqual([
      10 + offset[0],
      20 + offset[1],
      30 + offset[2],
    ]);
  });

  it('pins point then source-yaw then scale composition with a golden matrix', () => {
    const result = resolveVisualPlacement(
      fixtureEntry(BOOKCASE_VARIANT_ID),
      [10, 20, 30],
      Math.PI / 2,
      [1, 2, 3]
    );
    expectMatrixClose(result.matrix, [
      -1,
      0,
      -Math.sqrt(3),
      0,
      0,
      2,
      0,
      0,
      Math.sqrt(3),
      0,
      -1,
      0,
      11.5,
      22,
      33.25,
      1,
    ]);
    expect(result.diagnostics).toEqual({
      offsetPresence: 'explicit',
      calibration: 'enrolled',
      selectedVariantId: BOOKCASE_VARIANT_ID,
    });
  });

  it('uses source yaw and sole totalScale but no point translation for no-anchor identity', () => {
    const entry = {
      ...fixtureEntry(BOOKCASE_VARIANT_ID),
      modelPoint: undefined,
    };
    const result = resolveVisualPlacement(
      entry,
      [1, 2, 3],
      Math.PI / 3,
      [4, 5, 6]
    );
    const combined = Math.PI / 3 + Math.PI / 6;
    expectMatrixClose(result.matrix, [
      Math.cos(combined) * 2,
      0,
      -Math.sin(combined) * 2,
      0,
      0,
      2,
      0,
      0,
      Math.sin(combined) * 2,
      0,
      Math.cos(combined) * 2,
      0,
      5,
      7,
      9,
      1,
    ]);
    expect(result.diagnostics.calibration).toBe('no-anchor');
  });

  it.each(['retain', 'change', 'remove'] as const)(
    'reloads all torch intrinsic facts while offset action is explicitly %s',
    (action) => {
      const prior = {
        semanticRef: 'dnd5e:props:bookcase',
        canonicalOrigin: [3, 0, 2] as Vec3,
        facingYaw: facingToRotationY(0),
        offset: [0.05, 0, 0] as Vec3,
      };
      const decision =
        action === 'change'
          ? ({ action, offset: [0.05, 0, 0.2] } as const)
          : ({ action } as const);
      const result = buildReplacementCandidate(
        CONTRACT_FIXTURE_CATALOG,
        prior,
        'dnd5e:props:torch-ornate',
        decision
      );
      expect(result.accepted).toBe(true);
      if (!result.accepted) return;
      expect(result.entry).toEqual(fixtureEntry(TORCH_VARIANT_ID));
      expect(result.candidate.offset).toEqual(
        action === 'retain'
          ? prior.offset
          : action === 'change'
            ? [0.05, 0, 0.2]
            : undefined
      );
    }
  );

  it('keeps the prior complete document when replacement selection fails', () => {
    const prior = {
      semanticRef: 'dnd5e:props:bookcase',
      canonicalOrigin: [3, 0, 2] as Vec3,
      facingYaw: 0,
      offset: [0.05, 0, 0] as Vec3,
    };
    expect(
      buildReplacementCandidate(
        CONTRACT_FIXTURE_CATALOG,
        prior,
        'dnd5e:props:unknown',
        { action: 'remove' }
      )
    ).toEqual({
      accepted: false,
      prior,
      reason: 'family-not-enrolled',
    });
  });
});
