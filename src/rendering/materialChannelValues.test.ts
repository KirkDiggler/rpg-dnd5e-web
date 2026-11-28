// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ChannelCapability } from './materialChannelTypes';
import { resolveMaterialChannelValues } from './materialChannelValues';

const source = Object.freeze({
  normalScale: Object.freeze([-1, 0.6] as const),
  hasNormalMap: true,
  emissive: Object.freeze([0.2, 0.4, 0.6] as const),
  emissiveIntensity: 3,
  hasEmissiveMap: true,
});
const adjustable = Object.freeze({
  kind: 'adjustable' as const,
  minMultiplier: 0.5,
  maxMultiplier: 2,
});
const capabilities = { normal: adjustable, emissive: adjustable };

describe('resolveMaterialChannelValues', () => {
  it('scales effective normal signs and emission intensity without changing tint', () => {
    expect(
      resolveMaterialChannelValues({
        source,
        capabilities,
        adjustment: {
          normal: { mode: 'scale', multiplier: 0.5 },
          emissive: { mode: 'scale', multiplier: 2 },
        },
      })
    ).toEqual({ normalScale: [-0.5, 0.3], emissiveIntensity: 6 });
    expect(source.emissive).toEqual([0.2, 0.4, 0.6]);
  });

  it('returns detached authored defaults and does not accumulate on repeated resolution', () => {
    const first = resolveMaterialChannelValues({ source, capabilities });
    first.normalScale[0] = 10;
    expect(resolveMaterialChannelValues({ source, capabilities })).toEqual({
      normalScale: [-1, 0.6],
      emissiveIntensity: 3,
    });
    const adjustment = { normal: { mode: 'scale' as const, multiplier: 0.5 } };
    resolveMaterialChannelValues({ source, capabilities, adjustment });
    expect(
      resolveMaterialChannelValues({ source, capabilities, adjustment })
    ).toEqual({ normalScale: [-0.5, 0.3], emissiveIntensity: 3 });
  });

  it('suppresses only the explicitly off channel', () => {
    expect(
      resolveMaterialChannelValues({
        source,
        capabilities,
        adjustment: { normal: { mode: 'off' } },
      })
    ).toEqual({ normalScale: [0, 0], emissiveIntensity: 3 });
    expect(
      resolveMaterialChannelValues({
        source,
        capabilities,
        adjustment: { emissive: { mode: 'off' } },
      })
    ).toEqual({ normalScale: [-1, 0.6], emissiveIntensity: 0 });
  });

  it('keeps explicit one intact in the input intent', () => {
    const adjustment = Object.freeze({
      emissive: Object.freeze({ mode: 'scale' as const, multiplier: 1 }),
    });
    expect(
      resolveMaterialChannelValues({ source, capabilities, adjustment })
    ).toEqual({ normalScale: [-1, 0.6], emissiveIntensity: 3 });
    expect(adjustment).toEqual({ emissive: { mode: 'scale', multiplier: 1 } });
  });

  it('preserves default-only missing and source-zero channels', () => {
    expect(
      resolveMaterialChannelValues({
        source: {
          ...source,
          hasNormalMap: false,
          hasEmissiveMap: false,
          normalScale: [0, 0],
          emissiveIntensity: 0,
        },
        capabilities: {
          normal: { kind: 'absent' },
          emissive: { kind: 'fixed' },
        },
      })
    ).toEqual({ normalScale: [0, 0], emissiveIntensity: 0 });
  });

  it.each(['absent', 'fixed'] as const)(
    'refuses explicit edits to %s channels',
    (kind) => {
      for (const role of ['normal', 'emissive'] as const) {
        expect(() =>
          resolveMaterialChannelValues({
            source,
            capabilities: { ...capabilities, [role]: { kind } },
            adjustment: { [role]: { mode: 'off' } },
          })
        ).toThrow(/adjustable/);
      }
    }
  );

  it.each([{ hasNormalMap: false }, { normalScale: [0, 0] as const }])(
    'refuses normal edits without an effective nonzero mapped source %#',
    (change) => {
      expect(() =>
        resolveMaterialChannelValues({
          source: { ...source, ...change },
          capabilities,
          adjustment: { normal: { mode: 'scale', multiplier: 1 } },
        })
      ).toThrow(/normal/);
    }
  );

  it.each([
    { hasEmissiveMap: false },
    { emissiveIntensity: 0 },
    { emissive: [0, 0, 0] as const },
  ])('never invents an enabled emissive source %#', (change) => {
    expect(() =>
      resolveMaterialChannelValues({
        source: { ...source, ...change },
        capabilities,
        adjustment: { emissive: { mode: 'scale', multiplier: 2 } },
      })
    ).toThrow(/emissive/);
  });

  it.each([0, -1, NaN, Infinity, 0.25, 3])(
    'refuses invalid or out-of-range multipliers %#',
    (multiplier) => {
      expect(() =>
        resolveMaterialChannelValues({
          source,
          capabilities,
          adjustment: { normal: { mode: 'scale', multiplier } },
        })
      ).toThrow(/multiplier/);
    }
  );

  it.each([
    [0, 2],
    [2, 3],
    [0.5, 0.9],
    [NaN, 2],
    [0.5, Infinity],
    [1, 0.5],
  ])(
    'refuses invalid provider intervals %#',
    (minMultiplier, maxMultiplier) => {
      const capability: ChannelCapability = {
        kind: 'adjustable',
        minMultiplier,
        maxMultiplier,
      };
      expect(() =>
        resolveMaterialChannelValues({
          source,
          capabilities: { normal: capability, emissive: adjustable },
          adjustment: { normal: { mode: 'off' } },
        })
      ).toThrow(/interval/);
    }
  );

  it('refuses finite-JS results that would overflow shader floats', () => {
    const wide = {
      kind: 'adjustable' as const,
      minMultiplier: 0.5,
      maxMultiplier: 4,
    };
    expect(() =>
      resolveMaterialChannelValues({
        source: { ...source, normalScale: [1e38, 1] },
        capabilities: { normal: wide, emissive: wide },
        adjustment: { normal: { mode: 'scale', multiplier: 4 } },
      })
    ).toThrow(/finite|representable/);
    expect(() =>
      resolveMaterialChannelValues({
        source: { ...source, emissiveIntensity: 1e38 },
        capabilities: { normal: wide, emissive: wide },
        adjustment: { emissive: { mode: 'scale', multiplier: 4 } },
      })
    ).toThrow(/finite|representable/);
  });
});
