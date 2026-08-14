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

  it('quantizes a gesture into one deterministic deeply frozen release', () => {
    const input = {
      presentationId: 'attack:7',
      presetId: 'lightning',
      variation: 7,
      gesture: {
        origin: [10, 20] as const,
        current: [90, -20] as const,
        distance: 120,
      },
    };

    const first = createDicePresentationRelease(input);
    const second = createDicePresentationRelease(input);

    expect(first).toEqual({
      schemaVersion: 1,
      presentationId: 'attack:7',
      presetId: 'lightning',
      variation: 7,
      vector: [0.5, -0.25],
      shake: 0.5,
    });
    expect(second).toEqual(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.vector)).toBe(true);
  });

  it('clamps excess gesture values and sanitizes hostile runtime numerics', () => {
    const release = createDicePresentationRelease({
      presentationId: 'attack:7',
      presetId: 'lightning',
      variation: 7,
      gesture: {
        origin: [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY],
        current: [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
        distance: Number.POSITIVE_INFINITY,
      },
    });
    const neutralized = createDicePresentationRelease({
      presentationId: 'attack:8',
      presetId: 'lightning',
      variation: 7,
      gesture: {
        origin: [Number.POSITIVE_INFINITY, Number.NaN],
        current: [Number.POSITIVE_INFINITY, Number.NaN],
        distance: Number.NaN,
      },
    });
    const negativeDistance = createDicePresentationRelease({
      presentationId: 'attack:9',
      presetId: 'lightning',
      variation: 7,
      gesture: {
        origin: [500, -500],
        current: [-500, 500],
        distance: Number.NEGATIVE_INFINITY,
      },
    });

    expect(release.vector).toEqual([1, -1]);
    expect(release.shake).toBe(1);
    expect(neutralized.vector).toEqual([0, 0]);
    expect(neutralized.shake).toBe(0);
    expect(negativeDistance.vector).toEqual([-1, 1]);
    expect(negativeDistance.shake).toBe(0);
    expect(parseDicePresentationRelease(release)).toEqual(release);
    expect(parseDicePresentationRelease(neutralized)).toEqual(neutralized);
    expect(parseDicePresentationRelease(negativeDistance)).toEqual(
      negativeDistance
    );
    for (const value of [
      ...release.vector,
      release.shake,
      ...neutralized.vector,
      neutralized.shake,
      ...negativeDistance.vector,
      negativeDistance.shake,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('creates compact zero gesture defaults without samples, authority, or transport data', () => {
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
      /origin|current|distance|pointer|event|result|hit|damage|target|url|renderer|transport|https?:\/\//i
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

  it('fails closed instead of throwing for reflective access failures', () => {
    const throwingGetter = validRelease();
    Object.defineProperty(throwingGetter, 'presetId', {
      enumerable: true,
      get() {
        throw Error('hostile getter');
      },
    });
    const throwingProxy = new Proxy(validRelease(), {
      ownKeys() {
        throw Error('hostile proxy');
      },
    });

    expect(() => parseDicePresentationRelease(throwingGetter)).not.toThrow();
    expect(parseDicePresentationRelease(throwingGetter)).toBeUndefined();
    expect(() => parseDicePresentationRelease(throwingProxy)).not.toThrow();
    expect(parseDicePresentationRelease(throwingProxy)).toBeUndefined();
  });

  it('snapshots changing getters once before validation and reconstruction', () => {
    const inbound = validRelease();
    let reads = 0;
    Object.defineProperty(inbound, 'presentationId', {
      enumerable: true,
      get() {
        reads += 1;
        return reads === 1 ? 'attack:7' : 'attack:8';
      },
    });

    const parsed = parseDicePresentationRelease(inbound);

    expect(parsed?.presentationId).toBe('attack:7');
    expect(reads).toBe(1);
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
