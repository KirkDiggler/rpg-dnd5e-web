import { describe, expect, it } from 'vitest';
import {
  createDicePresentationRelease,
  dicePresentationReleaseKey,
  parseDicePresentationRelease,
} from './dicePresentationRelease';
import type { VisualThrowProfileV1 } from './visualThrowProfile';

function validProfile(
  overrides: Partial<VisualThrowProfileV1> = {}
): VisualThrowProfileV1 {
  return {
    schemaVersion: 1,
    releasePosition: [0.25, 0.75],
    releaseDirection: [0.6, -0.8],
    releaseSpeed: 0.7,
    shakeEnergy: 0.4,
    spinBias: -0.3,
    motionSeed: 0x755,
    ...overrides,
  };
}

function validRelease() {
  return {
    schemaVersion: 2,
    presentationId: 'attack:7',
    presetId: 'lightning',
    throwProfile: validProfile(),
  };
}

describe('dice presentation release v2', () => {
  it.each(['lightning', 'dice.original.carved.d20', 'newer-safe-preset'])(
    'creates the exact v2 release for safe preset identifier %s',
    (presetId) => {
      const release = createDicePresentationRelease({
        presentationId: 'Encounter_7:attack-2',
        presetId,
        throwProfile: validProfile(),
      });

      expect(release).toEqual({
        schemaVersion: 2,
        presentationId: 'Encounter_7:attack-2',
        presetId,
        throwProfile: validProfile(),
      });
      expect(Reflect.ownKeys(release)).toEqual([
        'schemaVersion',
        'presentationId',
        'presetId',
        'throwProfile',
      ]);
      expect(release.throwProfile.schemaVersion).toBe(1);
    }
  );

  it.each([
    ['', 'lightning'],
    [' attack', 'lightning'],
    ['https://example.test/presentation', 'lightning'],
    ['a'.repeat(129), 'lightning'],
    ['attack:7', ''],
    ['attack:7', '.lightning'],
    ['attack:7', 'lightning.'],
    ['attack:7', 'dice..d20'],
    ['attack:7', 'dice/original'],
    ['attack:7', 'https://evil.test'],
    ['attack:7', '../dice'],
    ['attack:7', 'Dice.original'],
    ['attack:7', `dice.${'a'.repeat(33)}`],
    ['attack:7', 'a.a.a.a.a.a.a.a.a'],
  ])(
    'rejects malformed or URL-shaped identifiers (%s, %s)',
    (presentationId, presetId) => {
      expect(() =>
        createDicePresentationRelease({
          presentationId,
          presetId,
          throwProfile: validProfile(),
        })
      ).toThrow(/presentation|preset/i);
    }
  );

  it('snapshots the parsed profile instead of retaining caller-owned gesture or profile data', () => {
    const throwProfile = validProfile();
    const release = createDicePresentationRelease({
      presentationId: 'attack:7',
      presetId: 'lightning',
      throwProfile,
    });

    expect(release.throwProfile).toEqual(throwProfile);
    expect(release.throwProfile).not.toBe(throwProfile);
    expect(release.throwProfile.releasePosition).not.toBe(
      throwProfile.releasePosition
    );
    expect(release.throwProfile.releaseDirection).not.toBe(
      throwProfile.releaseDirection
    );
    expect(Object.isFrozen(release)).toBe(true);
    expect(Object.isFrozen(release.throwProfile)).toBe(true);
    expect(Object.isFrozen(release.throwProfile.releasePosition)).toBe(true);
    expect(Object.isFrozen(release.throwProfile.releaseDirection)).toBe(true);
    expect(JSON.stringify(release)).not.toMatch(
      /origin|current|distance|pointer|event|result|hit|damage|target|url|renderer|transport|https?:\/\//i
    );
  });

  it.each([
    validProfile({ schemaVersion: 2 as never }),
    validProfile({ releasePosition: [0, 0, 0] as never }),
    validProfile({ releaseDirection: [0.5, 0.5] }),
    validProfile({ releaseSpeed: Number.NaN }),
    validProfile({ releaseSpeed: 1.01 }),
    validProfile({ shakeEnergy: -0.01 }),
    validProfile({ spinBias: 1.01 }),
    validProfile({ motionSeed: -1 }),
    { ...validProfile(), pointerId: 7 },
  ])(
    'rejects malformed or gesture-bearing profile input %#',
    (throwProfile) => {
      expect(() =>
        createDicePresentationRelease({
          presentationId: 'attack:7',
          presetId: 'lightning',
          throwProfile: throwProfile as VisualThrowProfileV1,
        })
      ).toThrow(/profile/i);
    }
  );

  it('strictly reconstructs and deeply freezes unknown inbound data', () => {
    const inbound = validRelease();
    const parsed = parseDicePresentationRelease(inbound);

    expect(parsed).toEqual(inbound);
    expect(parsed).not.toBe(inbound);
    expect(parsed?.throwProfile).not.toBe(inbound.throwProfile);
    expect(parsed?.throwProfile.releasePosition).not.toBe(
      inbound.throwProfile.releasePosition
    );
    expect(parsed?.throwProfile.releaseDirection).not.toBe(
      inbound.throwProfile.releaseDirection
    );
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed?.throwProfile)).toBe(true);
    expect(Object.isFrozen(parsed?.throwProfile.releasePosition)).toBe(true);
    expect(Object.isFrozen(parsed?.throwProfile.releaseDirection)).toBe(true);
    expect(Object.isFrozen(inbound)).toBe(false);
  });

  it.each([
    { ...validRelease(), extra: true },
    { ...validRelease(), schemaVersion: 1 },
    { ...validRelease(), presentationId: '../attack' },
    { ...validRelease(), presetId: 'https://evil.test/model.glb' },
    {
      schemaVersion: 1,
      presentationId: 'attack:7',
      presetId: 'lightning',
      variation: 7,
      vector: [0, 0],
      shake: 0,
    },
    {
      ...validRelease(),
      variation: 7,
      vector: [0, 0],
      shake: 0,
    },
    { ...validRelease(), throwProfile: { ...validProfile(), pointerId: 1 } },
    {
      ...validRelease(),
      throwProfile: { ...validProfile(), origin: [10, 20] },
    },
    {
      ...validRelease(),
      throwProfile: {
        ...validProfile(),
        releasePosition: Object.assign([0.25, 0.75], { pointerId: 1 }),
      },
    },
    {
      ...validRelease(),
      throwProfile: { ...validProfile(), releaseDirection: [0, 0, 0] },
    },
    {
      ...validRelease(),
      throwProfile: { ...validProfile(), releaseDirection: Array(2) },
    },
    {
      ...validRelease(),
      throwProfile: {
        ...validProfile(),
        releaseSpeed: Number.POSITIVE_INFINITY,
      },
    },
  ])(
    'fails closed for former, mixed, extra, or malformed shape %#',
    (value) => {
      expect(parseDicePresentationRelease(value)).toBeUndefined();
    }
  );

  it('rejects symbol keys and denied raw gesture fields at every object depth', () => {
    const symbol = Symbol('pointer');
    const outer = Object.assign(validRelease(), { [symbol]: 1 });
    const profile = validRelease();
    Object.assign(profile.throwProfile, { [symbol]: 1 });
    const tuple = validRelease();
    Object.assign(tuple.throwProfile.releasePosition, { [symbol]: 1 });

    expect(parseDicePresentationRelease(outer)).toBeUndefined();
    expect(parseDicePresentationRelease(profile)).toBeUndefined();
    expect(parseDicePresentationRelease(tuple)).toBeUndefined();
  });

  it('fails closed instead of throwing for reflective access failures', () => {
    const throwingGetter = validRelease();
    Object.defineProperty(throwingGetter, 'throwProfile', {
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
      throwProfile: validProfile(),
    });
    const alternateProfile = {
      ...release,
      throwProfile: validProfile({ motionSeed: 99 }),
    };

    expect(dicePresentationReleaseKey(release)).toBe('attack:7');
    expect(dicePresentationReleaseKey(alternateProfile)).toBe('attack:7');
  });
});
