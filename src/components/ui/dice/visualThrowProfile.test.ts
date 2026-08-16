import { describe, expect, it } from 'vitest';
import {
  createNeutralVisualThrowProfile,
  createVisualThrowProfile,
  parseVisualThrowProfile,
  type VisualThrowProfileInput,
} from './visualThrowProfile';

const DENIED_KEYS = [
  'result',
  'target',
  'damage',
  'url',
  'transport',
  'presentationId',
  'pointer',
  'coordinate',
  'path',
  'timestamp',
  'sample',
] as const;

function validInput(): VisualThrowProfileInput {
  return {
    releasePosition: [0.25, 0.75],
    releaseDirection: [0.6, 0.8],
    releaseSpeed: 0.75,
    shakeEnergy: 0.5,
    spinBias: -0.25,
    motionSeed: 7,
  };
}

function validProfile(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    releasePosition: [0.25, 0.75],
    releaseDirection: [0.6, 0.8],
    releaseSpeed: 0.75,
    shakeEnergy: 0.5,
    spinBias: -0.25,
    motionSeed: 7,
    ...overrides,
  };
}

function collectKeys(value: unknown, found = new Set<string>()): Set<string> {
  if (value === null || typeof value !== 'object') return found;
  for (const [key, nested] of Object.entries(value)) {
    found.add(key);
    collectKeys(nested, found);
  }
  return found;
}

describe('createVisualThrowProfile', () => {
  it('creates the exact deeply frozen neutral profile and unsigned seed', () => {
    const neutral = createNeutralVisualThrowProfile(0x1_0000_0001);

    expect(neutral).toEqual({
      schemaVersion: 1,
      releasePosition: [0.5, 0.5],
      releaseDirection: [0, 0],
      releaseSpeed: 0,
      shakeEnergy: 0,
      spinBias: 0,
      motionSeed: 1,
    });
    expect(Object.isFrozen(neutral)).toBe(true);
    expect(Object.isFrozen(neutral.releasePosition)).toBe(true);
    expect(Object.isFrozen(neutral.releaseDirection)).toBe(true);
    expect(parseVisualThrowProfile(neutral)).toEqual(neutral);
  });

  it('clamps bounded scalars and maps finite signed integers to uint32', () => {
    expect(
      createVisualThrowProfile({
        releasePosition: [-2, 2],
        releaseDirection: [1, 0],
        releaseSpeed: 2,
        shakeEnergy: -1,
        spinBias: 4,
        motionSeed: -1,
      })
    ).toEqual({
      schemaVersion: 1,
      releasePosition: [0, 1],
      releaseDirection: [1, 0],
      releaseSpeed: 1,
      shakeEnergy: 0,
      spinBias: 1,
      motionSeed: 0xffff_ffff,
    });

    expect(
      createVisualThrowProfile({
        ...validInput(),
        releasePosition: [2, -2],
        spinBias: -4,
        motionSeed: -0x1_0000_0001,
      })
    ).toMatchObject({
      releasePosition: [1, 0],
      spinBias: -1,
      motionSeed: 0xffff_ffff,
    });
  });

  it.each([1.5, -0.25, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects non-integer or non-finite producer seed %s before unsigned mapping',
    (motionSeed) => {
      expect(() =>
        createVisualThrowProfile({ ...validInput(), motionSeed })
      ).toThrow(RangeError);
      expect(() => createNeutralVisualThrowProfile(motionSeed)).toThrow(
        RangeError
      );
    }
  );

  it('normalizes nonzero directions', () => {
    const profile = createVisualThrowProfile({
      ...validInput(),
      releaseDirection: [3, 4],
    });
    const barelyNonzero = createVisualThrowProfile({
      ...validInput(),
      releaseDirection: [2e-9, 0],
    });
    const maximumFinite = createVisualThrowProfile({
      ...validInput(),
      releaseDirection: [Number.MAX_VALUE, Number.MAX_VALUE],
    });

    expect(profile.releaseDirection[0]).toBeCloseTo(0.6, 15);
    expect(profile.releaseDirection[1]).toBeCloseTo(0.8, 15);
    expect(Math.hypot(...profile.releaseDirection)).toBeCloseTo(1, 15);
    expect(barelyNonzero.releaseDirection).toEqual([1, 0]);
    expect(barelyNonzero.releaseSpeed).toBe(0.75);
    expect(maximumFinite.releaseDirection[0]).toBeCloseTo(Math.SQRT1_2, 15);
    expect(maximumFinite.releaseDirection[1]).toBeCloseTo(Math.SQRT1_2, 15);
  });

  it.each([[0, 0] as const, [1e-10, -1e-10] as const, [1e-9, 0] as const])(
    'canonicalizes near-zero direction [%s, %s] and forces speed to zero',
    (x, y) => {
      const profile = createVisualThrowProfile({
        ...validInput(),
        releaseDirection: [x, y],
        releaseSpeed: 0.8,
      });

      expect(profile.releaseDirection).toEqual([0, 0]);
      expect(profile.releaseSpeed).toBe(0);
    }
  );

  it.each([
    [
      'releasePosition[0]',
      (input: VisualThrowProfileInput) => ({
        ...input,
        releasePosition: [Number.NaN, 0] as const,
      }),
    ],
    [
      'releasePosition[1]',
      (input: VisualThrowProfileInput) => ({
        ...input,
        releasePosition: [0, Number.POSITIVE_INFINITY] as const,
      }),
    ],
    [
      'releaseDirection[0]',
      (input: VisualThrowProfileInput) => ({
        ...input,
        releaseDirection: [Number.NEGATIVE_INFINITY, 0] as const,
      }),
    ],
    [
      'releaseDirection[1]',
      (input: VisualThrowProfileInput) => ({
        ...input,
        releaseDirection: [0, Number.NaN] as const,
      }),
    ],
    [
      'releaseSpeed',
      (input: VisualThrowProfileInput) => ({
        ...input,
        releaseSpeed: Number.POSITIVE_INFINITY,
      }),
    ],
    [
      'shakeEnergy',
      (input: VisualThrowProfileInput) => ({
        ...input,
        shakeEnergy: Number.NaN,
      }),
    ],
    [
      'spinBias',
      (input: VisualThrowProfileInput) => ({
        ...input,
        spinBias: Number.NEGATIVE_INFINITY,
      }),
    ],
    [
      'motionSeed',
      (input: VisualThrowProfileInput) => ({
        ...input,
        motionSeed: Number.NaN,
      }),
    ],
  ])('rejects a non-finite %s', (_name, mutate) => {
    expect(() => createVisualThrowProfile(mutate(validInput()))).toThrow();
  });

  it('returns only fresh, deeply frozen presentation facts', () => {
    const position = [0.25, 0.75] as [number, number] & { pointer?: string };
    position.pointer = '/combat/result';
    const input = {
      ...validInput(),
      releasePosition: position,
      result: 20,
      target: { damage: 99, url: 'https://example.invalid' },
      transport: { presentationId: 'server-result' },
      coordinate: { path: '/authoritative' },
      timestamp: 123,
      sample: 'private',
    };

    const profile = createVisualThrowProfile(input);
    const serializedKeys = collectKeys(JSON.parse(JSON.stringify(profile)));

    expect(profile.releasePosition).not.toBe(position);
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.releasePosition)).toBe(true);
    expect(Object.isFrozen(profile.releaseDirection)).toBe(true);
    for (const key of DENIED_KEYS) expect(serializedKeys.has(key)).toBe(false);
  });
});

describe('parseVisualThrowProfile', () => {
  it('accepts only the seven exact profile keys', () => {
    expect(parseVisualThrowProfile(validProfile())).toEqual(validProfile());

    const missing = validProfile();
    delete missing.spinBias;
    expect(parseVisualThrowProfile(missing)).toBeUndefined();
    expect(
      parseVisualThrowProfile(validProfile({ result: 20 }))
    ).toBeUndefined();
    expect(parseVisualThrowProfile([])).toBeUndefined();
  });

  it.each([
    ['short position', [0.25]],
    ['sparse position', Object.assign(new Array(2), { 0: 0.25 })],
    ['long position', [0.25, 0.75, 1]],
    ['short direction', [0.6]],
    ['sparse direction', Object.assign(new Array(2), { 1: 0.8 })],
    ['long direction', [0.6, 0.8, 0]],
  ])('rejects a %s tuple', (_name, tuple) => {
    const key = _name.includes('position')
      ? 'releasePosition'
      : 'releaseDirection';
    expect(
      parseVisualThrowProfile(validProfile({ [key]: tuple }))
    ).toBeUndefined();
  });

  it('rejects tuples with extra keys', () => {
    const position = Object.assign([0.25, 0.75], { path: '/result' });
    const direction = Object.assign([0.6, 0.8], { sample: 3 });

    expect(
      parseVisualThrowProfile(validProfile({ releasePosition: position }))
    ).toBeUndefined();
    expect(
      parseVisualThrowProfile(validProfile({ releaseDirection: direction }))
    ).toBeUndefined();
  });

  it.each([
    ['releasePosition[0]', { releasePosition: [Number.NaN, 0.75] }],
    [
      'releasePosition[1]',
      { releasePosition: [0.25, Number.POSITIVE_INFINITY] },
    ],
    [
      'releaseDirection[0]',
      { releaseDirection: [Number.NEGATIVE_INFINITY, 0.8] },
    ],
    ['releaseDirection[1]', { releaseDirection: [0.6, Number.NaN] }],
    ['releaseSpeed', { releaseSpeed: Number.POSITIVE_INFINITY }],
    ['shakeEnergy', { shakeEnergy: Number.NaN }],
    ['spinBias', { spinBias: Number.NEGATIVE_INFINITY }],
    ['motionSeed', { motionSeed: Number.POSITIVE_INFINITY }],
  ])('rejects non-finite %s', (_name, overrides) => {
    expect(parseVisualThrowProfile(validProfile(overrides))).toBeUndefined();
  });

  it.each([
    ['position below range', { releasePosition: [-0.01, 0.75] }],
    ['position above range', { releasePosition: [0.25, 1.01] }],
    ['speed below range', { releaseSpeed: -0.01 }],
    ['speed above range', { releaseSpeed: 1.01 }],
    ['energy below range', { shakeEnergy: -0.01 }],
    ['energy above range', { shakeEnergy: 1.01 }],
    ['bias below range', { spinBias: -1.01 }],
    ['bias above range', { spinBias: 1.01 }],
    ['fractional seed', { motionSeed: 1.5 }],
    ['negative seed', { motionSeed: -1 }],
    ['oversized seed', { motionSeed: 0x1_0000_0000 }],
  ])('rejects %s', (_name, overrides) => {
    expect(parseVisualThrowProfile(validProfile(overrides))).toBeUndefined();
  });

  it('accepts zero or unit directions within tolerance without normalizing', () => {
    const zero = parseVisualThrowProfile(
      validProfile({ releaseDirection: [0, 0], releaseSpeed: 0 })
    );
    const withinTolerance = [1 + 0.5e-6, 0] as const;
    const accepted = parseVisualThrowProfile(
      validProfile({ releaseDirection: withinTolerance })
    );

    expect(zero?.releaseDirection).toEqual([0, 0]);
    expect(accepted?.releaseDirection).toEqual(withinTolerance);
  });

  it('rejects nonzero speed for a zero direction', () => {
    expect(
      parseVisualThrowProfile(
        validProfile({ releaseDirection: [0, 0], releaseSpeed: 1 })
      )
    ).toBeUndefined();
  });

  it.each([
    [0.5, 0],
    [1 + 1.1e-6, 0],
    [0.6, 0.79],
  ])('rejects a non-unit nonzero direction [%s, %s]', (x, y) => {
    expect(
      parseVisualThrowProfile(validProfile({ releaseDirection: [x, y] }))
    ).toBeUndefined();
  });

  it('fails closed for throwing accessors and hostile proxies', () => {
    const throwingProfile = validProfile();
    Object.defineProperty(throwingProfile, 'releaseSpeed', {
      enumerable: true,
      get() {
        throw new Error('hostile profile getter');
      },
    });
    const throwingTuple = [0.25, 0.75];
    Object.defineProperty(throwingTuple, '1', {
      enumerable: true,
      get() {
        throw new Error('hostile tuple getter');
      },
    });
    const throwingProxy = new Proxy(validProfile(), {
      ownKeys() {
        throw new Error('hostile ownKeys trap');
      },
    });

    for (const value of [
      throwingProfile,
      validProfile({ releasePosition: throwingTuple }),
      throwingProxy,
    ]) {
      expect(() => parseVisualThrowProfile(value)).not.toThrow();
      expect(parseVisualThrowProfile(value)).toBeUndefined();
    }
  });

  it('snapshots fresh tuples and deeply freezes the parsed profile', () => {
    const inbound = validProfile();
    const inboundPosition = inbound.releasePosition as number[];
    const inboundDirection = inbound.releaseDirection as number[];

    const parsed = parseVisualThrowProfile(inbound);

    expect(parsed).toEqual(inbound);
    expect(parsed).not.toBe(inbound);
    expect(parsed?.releasePosition).not.toBe(inboundPosition);
    expect(parsed?.releaseDirection).not.toBe(inboundDirection);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed?.releasePosition)).toBe(true);
    expect(Object.isFrozen(parsed?.releaseDirection)).toBe(true);

    inboundPosition[0] = 1;
    inboundDirection[0] = 0;
    expect(parsed?.releasePosition).toEqual([0.25, 0.75]);
    expect(parsed?.releaseDirection).toEqual([0.6, 0.8]);
  });
});
