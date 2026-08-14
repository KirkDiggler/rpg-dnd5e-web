import { describe, expect, it } from 'vitest';
import {
  createDicePresentationRelease,
  dicePresentationReleaseKey,
  parseDicePresentationRelease,
} from './dicePresentationRelease';

const validRelease = () => ({
  schemaVersion: 1,
  presentationId: 'attack:7',
  presetId: 'lightning',
  variation: 7,
  vector: [0.25, -0.5],
  shake: 0.75,
});

describe('dice presentation release', () => {
  it('accepts bounded safe identifiers without requiring preset registry membership', () => {
    expect(
      createDicePresentationRelease({
        presentationId: 'Encounter_7:attack-2',
        presetId: 'newer-safe-preset',
        variation: 1,
      })
    ).toMatchObject({
      presentationId: 'Encounter_7:attack-2',
      presetId: 'newer-safe-preset',
    });
  });

  it.each([
    ['', 'lightning'],
    [' attack', 'lightning'],
    ['https://example.test/presentation', 'lightning'],
    ['a'.repeat(129), 'lightning'],
    ['attack:7', 'Lightning'],
    ['attack:7', 'lightning.glb'],
    ['attack:7', 'a'.repeat(65)],
  ])(
    'rejects malformed or URL-shaped identifiers (%s, %s)',
    (presentationId, presetId) => {
      expect(() =>
        createDicePresentationRelease({
          presentationId,
          presetId,
          variation: 1,
        })
      ).toThrow(/presentation|preset/i);
    }
  );

  it.each([
    [1002.9, 5],
    [-1002.9, 5],
    [-0.9, 0],
  ])('normalizes finite variation %s to %s', (variation, normalized) => {
    expect(
      createDicePresentationRelease({
        presentationId: 'attack:7',
        presetId: 'lightning',
        variation,
      }).variation
    ).toBe(normalized);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite variation %s',
    (variation) => {
      expect(() =>
        createDicePresentationRelease({
          presentationId: 'attack:7',
          presetId: 'lightning',
          variation,
        })
      ).toThrow(/variation/i);
    }
  );

  it('creates a recursively frozen compact release with no authority or transport data', () => {
    const release = createDicePresentationRelease({
      presentationId: 'attack:7',
      presetId: 'lightning',
      variation: 7,
    });

    expect(release).toEqual({
      schemaVersion: 1,
      presentationId: 'attack:7',
      presetId: 'lightning',
      variation: 7,
      vector: [0, 0],
      shake: 0,
    });
    expect(Object.isFrozen(release)).toBe(true);
    expect(Object.isFrozen(release.vector)).toBe(true);
    expect(JSON.stringify(release)).not.toMatch(
      /result|hit|damage|target|https?:\/\//i
    );
  });

  it('strictly reconstructs and recursively freezes unknown inbound data', () => {
    const inbound = validRelease();
    const parsed = parseDicePresentationRelease(inbound);

    expect(parsed).toEqual(inbound);
    expect(parsed).not.toBe(inbound);
    expect(parsed?.vector).not.toBe(inbound.vector);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed?.vector)).toBe(true);
    expect(Object.isFrozen(inbound)).toBe(false);
    expect(Object.isFrozen(inbound.vector)).toBe(false);
  });

  it.each([
    { ...validRelease(), extra: true },
    { ...validRelease(), schemaVersion: 2 },
    { ...validRelease(), presentationId: '../attack' },
    { ...validRelease(), presetId: 'https://evil.test/model.glb' },
    { ...validRelease(), variation: 0.5 },
    { ...validRelease(), variation: 997 },
    { ...validRelease(), vector: [0, 0, 0] },
    { ...validRelease(), vector: Array(2) },
    { ...validRelease(), vector: [1.01, 0] },
    { ...validRelease(), vector: [Number.NaN, 0] },
    { ...validRelease(), shake: -0.01 },
    { ...validRelease(), shake: 1.01 },
  ])('fails closed for malformed inbound release %#', (value) => {
    expect(parseDicePresentationRelease(value)).toBeUndefined();
  });

  it('keys release cardinality solely by presentation id', () => {
    const release = createDicePresentationRelease({
      presentationId: 'attack:7',
      presetId: 'lightning',
      variation: 1002.9,
    });

    const alternateVariation = {
      ...release,
      variation: release.variation + 1,
    };
    expect(dicePresentationReleaseKey(release)).toBe('attack:7');
    expect(dicePresentationReleaseKey(alternateVariation)).toBe('attack:7');
  });
});
