import { describe, expect, it } from 'vitest';
import {
  ALL_DIAL_SPECS,
  defaultDialValues,
  getDialSpec,
  validateDialValue,
  type EnumDialSpec,
  type NumberDialSpec,
} from './dials';

describe('ALL_DIAL_SPECS', () => {
  it('aggregates camera and dice specs, camera first', () => {
    const groups = ALL_DIAL_SPECS.map((spec) => spec.group);
    const firstDiceIndex = groups.indexOf('dice');
    expect(firstDiceIndex).toBeGreaterThan(0);
    expect(groups.slice(0, firstDiceIndex).every((g) => g === 'camera')).toBe(
      true
    );
    expect(groups.slice(firstDiceIndex).every((g) => g === 'dice')).toBe(true);
  });

  it('has no duplicate keys', () => {
    const keys = ALL_DIAL_SPECS.map((spec) => spec.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('registers the dials a player would actually tune, per #906 batch 2', () => {
    const keys = new Set(ALL_DIAL_SPECS.map((spec) => spec.key));
    for (const expected of [
      'rotateSpeed',
      'panSpeed',
      'orbitPivot',
      'pitchFar',
      'pitchNear',
      'pitchCurve',
      'zoomMin',
      'zoomMax',
      'zoomStart',
      'dieScale',
      'rollFlash',
    ]) {
      expect(keys.has(expected)).toBe(true);
    }
    // The projection escape hatch stays URL-only, by design — never registered.
    expect(keys.has('camera')).toBe(false);
    expect(keys.has('dragRotate')).toBe(false);
  });
});

describe('getDialSpec', () => {
  it('finds a registered spec by key', () => {
    expect(getDialSpec('dieScale')?.group).toBe('dice');
  });

  it('returns undefined for an unknown key', () => {
    expect(getDialSpec('bogus')).toBeUndefined();
  });
});

describe('defaultDialValues', () => {
  it('has exactly one entry per registered spec, each equal to its default', () => {
    const values = defaultDialValues();
    expect(Object.keys(values)).toHaveLength(ALL_DIAL_SPECS.length);
    for (const spec of ALL_DIAL_SPECS) {
      expect(values[spec.key]).toBe(spec.default);
    }
  });
});

describe('validateDialValue', () => {
  const numberSpec = getDialSpec('rotateSpeed') as NumberDialSpec;
  const enumSpec = getDialSpec('orbitPivot') as EnumDialSpec;

  it('clamps a number below the spec minimum', () => {
    expect(validateDialValue(numberSpec, numberSpec.min - 100)).toBe(
      numberSpec.min
    );
  });

  it('clamps a number above the spec maximum', () => {
    expect(validateDialValue(numberSpec, numberSpec.max + 100)).toBe(
      numberSpec.max
    );
  });

  it('passes a number within range through unchanged', () => {
    const mid = (numberSpec.min + numberSpec.max) / 2;
    expect(validateDialValue(numberSpec, mid)).toBe(mid);
  });

  it('coerces a numeric string', () => {
    expect(validateDialValue(numberSpec, '100')).toBe(100);
  });

  it('falls back to the default for NaN/non-numeric input, never poisoning the dial', () => {
    expect(validateDialValue(numberSpec, 'not-a-number')).toBe(
      numberSpec.default
    );
    expect(validateDialValue(numberSpec, undefined)).toBe(numberSpec.default);
    expect(validateDialValue(numberSpec, NaN)).toBe(numberSpec.default);
  });

  it('accepts a listed enum option', () => {
    expect(validateDialValue(enumSpec, 'me')).toBe('me');
  });

  it('rejects an unlisted enum value back to the default', () => {
    expect(validateDialValue(enumSpec, 'sideways')).toBe(enumSpec.default);
    expect(validateDialValue(enumSpec, 123)).toBe(enumSpec.default);
  });
});
