import { describe, expect, it } from 'vitest';
import { planAssetHeight, type AssetHeightProfile } from './assetHeightLayout';

const repeat: AssetHeightProfile = {
  mode: 'repeat-above',
  node: 'UpperMasonry',
  baseHeight: 2,
  rowHeight: 1,
};

describe('declared asset height layout', () => {
  it('gives differently sized scalable assets the same explicit height', () => {
    for (const nativeHeight of [1.875, 3.75]) {
      const result = planAssetHeight({
        nativeHeight,
        targetHeight: 6,
        profile: { mode: 'scale' },
      });
      expect(nativeHeight * result.scaleY).toBe(6);
      expect(result.height).toBe(6);
      expect(result.rows).toEqual([]);
    }
  });

  it('keeps the fixed region unscaled and grows only declared upper rows', () => {
    const result = planAssetHeight({
      nativeHeight: 3,
      targetHeight: 6,
      profile: repeat,
    });
    expect(result.height).toBe(6);
    expect(result.scaleY).toBe(1);
    expect(result.rows).toEqual([
      { offsetY: 0, scaleY: 1 },
      { offsetY: 1, scaleY: 1 },
      { offsetY: 2, scaleY: 1 },
      { offsetY: 3, scaleY: 1 },
    ]);
  });

  it('retains the authored row at native height', () => {
    expect(
      planAssetHeight({ nativeHeight: 3, targetHeight: 3, profile: repeat })
        .rows
    ).toEqual([{ offsetY: 0, scaleY: 1 }]);
  });

  it('distributes the existing nearest-row residual to land on the exact top', () => {
    const result = planAssetHeight({
      nativeHeight: 3,
      targetHeight: 4.4,
      profile: repeat,
    });
    expect(result.scaleY).toBe(1);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.scaleY).toBeCloseTo(1.2);
    expect(result.rows[1]!.offsetY).toBeCloseTo(1.2);
    expect(2 + result.rows[1]!.offsetY + result.rows[1]!.scaleY).toBeCloseTo(
      4.4
    );
  });

  it('removes upper rows at the fixed minimum and refuses below it', () => {
    expect(
      planAssetHeight({ nativeHeight: 3, targetHeight: 2, profile: repeat })
        .rows
    ).toEqual([]);
    expect(() =>
      planAssetHeight({ nativeHeight: 3, targetHeight: 1.99, profile: repeat })
    ).toThrow('below the fixed region');
  });

  it('does not stretch a fixed profile to pretend to satisfy a height', () => {
    const input = {
      nativeHeight: 3,
      targetHeight: 3,
      profile: { mode: 'fixed' } as const,
    };
    expect(planAssetHeight(input)).toEqual({
      height: 3,
      scaleY: 1,
      rows: [],
    });
    expect(() => planAssetHeight({ ...input, targetHeight: 6 })).toThrow(
      'fixed asset'
    );
  });

  it('bounds the row pool without shortening a valid target height', () => {
    const result = planAssetHeight({
      nativeHeight: 3,
      targetHeight: 6,
      profile: repeat,
      maxRows: 3,
    });
    expect(result.rows).toHaveLength(3);
    expect(result.scaleY).toBe(1);
    const last = result.rows.at(-1)!;
    expect(2 + last.offsetY + last.scaleY).toBeCloseTo(6);
    const tall = planAssetHeight({
      nativeHeight: 3,
      targetHeight: 120,
      profile: repeat,
    });
    expect(tall.rows).toHaveLength(64);
    expect(tall.scaleY).toBe(1);
    expect(2 + tall.rows[63]!.offsetY + tall.rows[63]!.scaleY).toBeCloseTo(120);
  });

  it('rejects invalid dimensions and inconsistent provider geometry', () => {
    for (const value of [0, -1, NaN, Infinity]) {
      expect(() =>
        planAssetHeight({
          nativeHeight: value,
          targetHeight: 6,
          profile: { mode: 'scale' },
        })
      ).toThrow('height');
      expect(() =>
        planAssetHeight({
          nativeHeight: 3,
          targetHeight: value,
          profile: repeat,
        })
      ).toThrow('height');
    }
    for (const profile of [
      { ...repeat, node: '' },
      { ...repeat, baseHeight: -1 },
      { ...repeat, rowHeight: 0 },
      { ...repeat, rowHeight: NaN },
      { ...repeat, rowHeight: 2 },
    ]) {
      expect(() =>
        planAssetHeight({ nativeHeight: 3, targetHeight: 6, profile })
      ).toThrow();
    }
    expect(() =>
      planAssetHeight({
        nativeHeight: 3,
        targetHeight: 6,
        profile: repeat,
        maxRows: 0,
      })
    ).toThrow('row limit');
  });

  it('reserves a fixed top cap once instead of repeating or scaling it', () => {
    const profile = {
      mode: 'repeat-above',
      node: 'Upper',
      baseHeight: 2,
      rowHeight: 1,
      capNode: 'Cap',
      capHeight: 0.5,
    } as const;
    const layout = planAssetHeight({
      nativeHeight: 3.5,
      targetHeight: 6,
      profile,
    });
    expect(layout.scaleY).toBe(1);
    expect(layout.capOffsetY).toBe(2.5);
    expect(
      layout.rows.reduce((height, row) => height + row.scaleY, 2.5)
    ).toBeCloseTo(6);
    const minimum = planAssetHeight({
      nativeHeight: 3.5,
      targetHeight: 2.5,
      profile,
    });
    expect(minimum.rows).toEqual([]);
    expect(minimum.capOffsetY).toBe(-1);
    expect(() =>
      planAssetHeight({ nativeHeight: 3.5, targetHeight: 2.49, profile })
    ).toThrow('fixed region');
    for (const bad of [
      { ...profile, capNode: undefined },
      { ...profile, capHeight: undefined },
      { ...profile, capNode: 'Upper' },
      { ...profile, capHeight: -1 },
    ]) {
      expect(() =>
        planAssetHeight({ nativeHeight: 3.5, targetHeight: 6, profile: bad })
      ).toThrow();
    }
  });

  it('extends anchored infill once while translating rigid top parts', () => {
    const profile = {
      mode: 'anchored',
      node: 'Infill',
      capNode: 'Cap',
      lowerAnchor: 'Lower',
      upperAnchor: 'Upper',
      lowerHeight: 2,
      upperHeight: 3,
      extension: 'stretch',
    } as const;
    expect(
      planAssetHeight({ nativeHeight: 3.5, targetHeight: 6, profile })
    ).toEqual({
      height: 6,
      scaleY: 1,
      capOffsetY: 2.5,
      rows: [{ offsetY: 0, scaleY: 3.5 }],
    });
    expect(
      planAssetHeight({ nativeHeight: 3.5, targetHeight: 3.5, profile }).rows
    ).toEqual([{ offsetY: 0, scaleY: 1 }]);
    expect(() =>
      planAssetHeight({ nativeHeight: 3.5, targetHeight: 3.4, profile })
    ).toThrow('native minimum');
    for (const bad of [
      { ...profile, lowerHeight: NaN },
      { ...profile, lowerHeight: -1 },
      { ...profile, upperHeight: 2 },
      { ...profile, upperHeight: 4 },
      { ...profile, lowerAnchor: 'Cap' },
      { ...profile, upperAnchor: '' },
      { ...profile, extension: 'guess' as 'stretch' },
    ])
      expect(() =>
        planAssetHeight({ nativeHeight: 3.5, targetHeight: 6, profile: bad })
      ).toThrow();
  });

  it('bounds anchored repeat allocation without shortening the requested height', () => {
    const profile = {
      mode: 'anchored',
      node: 'Infill',
      capNode: 'Cap',
      lowerAnchor: 'Lower',
      upperAnchor: 'Upper',
      lowerHeight: 2,
      upperHeight: 3,
      extension: 'repeat',
    } as const;
    const result = planAssetHeight({
      nativeHeight: 3.5,
      targetHeight: 120,
      profile,
    });
    expect(result.rows).toHaveLength(64);
    expect(result.rows.reduce((sum, r) => sum + r.scaleY, 2.5)).toBeCloseTo(
      120
    );
    expect(result.capOffsetY).toBe(116.5);
  });

  it('is repeatable and cannot mutate its input or another layout', () => {
    const input = Object.freeze({
      nativeHeight: 3,
      targetHeight: 6,
      profile: Object.freeze(repeat),
    });
    const first = planAssetHeight(input);
    expect(planAssetHeight(input)).toEqual(first);
    first.rows[0]!.offsetY = 100;
    expect(planAssetHeight(input).rows[0]!.offsetY).toBe(0);
    expect(input.profile.baseHeight).toBe(2);
  });
});
