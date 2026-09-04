import { describe, expect, it } from 'vitest';
import {
  parseDicePresentationEvent,
  projectDicePresentationEvents,
} from './dicePresentationEvent';
import type { DicePresentationRelease } from './dicePresentationRelease';
import type { VisualThrowProfileV1 } from './visualThrowProfile';

function profile(
  overrides: Partial<VisualThrowProfileV1> = {}
): VisualThrowProfileV1 {
  return {
    schemaVersion: 1,
    releasePosition: [0.5, 0.5],
    releaseDirection: [0, 0],
    releaseSpeed: 0,
    shakeEnergy: 0,
    spinBias: 0,
    motionSeed: 7,
    ...overrides,
  };
}

function requested(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    type: 'dice-presentation-requested',
    eventId: 'event:request:7',
    presentationId: 'attack:7',
    roller: { entityId: 'character:1', role: 'player' },
    die: {
      kind: 'd20',
      presetId: 'lightning',
      authoritativeResult: 10,
    },
    ...overrides,
  };
}

function release(
  overrides: Record<string, unknown> = {},
  releaseOverrides: Partial<DicePresentationRelease> = {}
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    type: 'dice-presentation-released',
    eventId: 'event:release:7',
    presentationId: 'attack:7',
    release: {
      schemaVersion: 2,
      presentationId: 'attack:7',
      presetId: 'lightning',
      throwProfile: profile(),
      ...releaseOverrides,
    },
    ...overrides,
  };
}

describe('parseDicePresentationEvent', () => {
  it.each([requested(), release()])(
    'strictly reconstructs and recursively freezes a valid event',
    (inbound) => {
      const parsed = parseDicePresentationEvent(inbound);

      expect(parsed).toEqual(inbound);
      expect(parsed).not.toBe(inbound);
      expect(Object.isFrozen(parsed)).toBe(true);
      if (parsed?.type === 'dice-presentation-requested') {
        expect(parsed.roller).not.toBe(inbound.roller);
        expect(parsed.die).not.toBe(inbound.die);
        expect(Object.isFrozen(parsed.roller)).toBe(true);
        expect(Object.isFrozen(parsed.die)).toBe(true);
      } else if (parsed) {
        expect(parsed.schemaVersion).toBe(1);
        expect(parsed.release.schemaVersion).toBe(2);
        expect(parsed.release.throwProfile.schemaVersion).toBe(1);
        expect(parsed.release).not.toBe(inbound.release);
        expect(Object.isFrozen(parsed.release)).toBe(true);
        expect(Object.isFrozen(parsed.release.throwProfile)).toBe(true);
        expect(
          Object.isFrozen(parsed.release.throwProfile.releasePosition)
        ).toBe(true);
        expect(
          Object.isFrozen(parsed.release.throwProfile.releaseDirection)
        ).toBe(true);
      }
      expect(Object.isFrozen(inbound)).toBe(false);
    }
  );

  it('classifies authority-bearing requests as requests and preserves the separate numeric coordinate through projection', () => {
    const inbound = requested({ authoritySeq: 91n });

    const parsed = parseDicePresentationEvent(inbound);
    const projection = projectDicePresentationEvents([inbound]);

    expect(parsed).toMatchObject({
      type: 'dice-presentation-requested',
      presentationId: 'attack:7',
      authoritySeq: 91n,
      die: { authoritativeResult: 10 },
    });
    expect(projection.request).toEqual(parsed);
    expect(projection.release).toBeUndefined();
    expect(projection.acceptedEvents).toEqual([parsed]);
  });

  it.each(['lightning', 'dice.original.carved.d20', 'newer-safe-preset'])(
    'accepts syntactically safe preset %s without authorizing an asset URL',
    (presetId) => {
      expect(
        parseDicePresentationEvent(
          requested({
            die: { kind: 'd20', presetId, authoritativeResult: 20 },
          })
        )
      ).toMatchObject({ die: { presetId, authoritativeResult: 20 } });
      expect(
        parseDicePresentationEvent(release({}, { presetId }))
      ).toMatchObject({ release: { presetId } });
    }
  );

  it.each([
    '',
    '.lightning',
    'lightning.',
    'dice..d20',
    'dice/original',
    'https://evil.test',
    '../dice',
    'Dice.original',
    `dice.${'a'.repeat(33)}`,
    'a.a.a.a.a.a.a.a.a',
  ])('rejects malformed inbound preset identifier %s', (presetId) => {
    expect(
      parseDicePresentationEvent(
        requested({ die: { kind: 'd20', presetId, authoritativeResult: 10 } })
      )
    ).toBeUndefined();
    expect(
      parseDicePresentationEvent(release({}, { presetId }))
    ).toBeUndefined();
  });

  it.each([
    { name: 'wrong request schema', value: requested({ schemaVersion: 2 }) },
    { name: 'wrong request type', value: requested({ type: 'dice-rolled' }) },
    { name: 'unknown outer request key', value: requested({ result: 10 }) },
    {
      name: 'unknown roller key',
      value: requested({
        roller: {
          entityId: 'character:1',
          role: 'player',
          target: 'monster:1',
        },
      }),
    },
    {
      name: 'unknown die key',
      value: requested({
        die: {
          kind: 'd20',
          presetId: 'lightning',
          authoritativeResult: 10,
          rendererId: 7,
        },
      }),
    },
    {
      name: 'invalid result',
      value: requested({
        die: { kind: 'd20', presetId: 'lightning', authoritativeResult: 20.5 },
      }),
    },
    {
      name: 'out of range result',
      value: requested({
        die: { kind: 'd20', presetId: 'lightning', authoritativeResult: 21 },
      }),
    },
    {
      name: 'invalid role',
      value: requested({ roller: { entityId: 'character:1', role: 'gm' } }),
    },
    { name: 'malformed event id', value: requested({ eventId: 'event/id' }) },
    {
      name: 'malformed presentation id',
      value: requested({ presentationId: 'https://evil.test' }),
    },
    {
      name: 'unknown release key',
      value: release({}, { renderer: '3d' } as never),
    },
    {
      name: 'former release schema',
      value: {
        ...release(),
        release: {
          schemaVersion: 1,
          presentationId: 'attack:7',
          presetId: 'lightning',
          variation: 7,
          vector: [0, 0],
          shake: 0,
        },
      },
    },
    {
      name: 'mixed release schema',
      value: {
        ...release(),
        release: {
          ...(release().release as object),
          variation: 7,
          vector: [0, 0],
          shake: 0,
        },
      },
    },
    {
      name: 'outer/release presentation mismatch',
      value: release({}, { presentationId: 'attack:8' }),
    },
    {
      name: 'raw gesture nested in profile',
      value: release(
        {},
        { throwProfile: { ...profile(), pointerId: 7 } as never }
      ),
    },
    {
      name: 'malformed profile tuple',
      value: release(
        {},
        { throwProfile: profile({ releasePosition: [0, 0, 0] as never }) }
      ),
    },
  ])('fails closed for $name', ({ value }) => {
    expect(parseDicePresentationEvent(value)).toBeUndefined();
  });

  it('fails closed instead of throwing for hostile getters and proxies', () => {
    const throwingGetter = requested();
    Object.defineProperty(throwingGetter, 'roller', {
      enumerable: true,
      get() {
        throw Error('hostile getter');
      },
    });
    const throwingProxy = new Proxy(requested(), {
      ownKeys() {
        throw Error('hostile proxy');
      },
    });

    expect(() => parseDicePresentationEvent(throwingGetter)).not.toThrow();
    expect(parseDicePresentationEvent(throwingGetter)).toBeUndefined();
    expect(() => parseDicePresentationEvent(throwingProxy)).not.toThrow();
    expect(parseDicePresentationEvent(throwingProxy)).toBeUndefined();
  });

  it('snapshots changing getters once before choosing and reconstructing the event', () => {
    const inbound = requested();
    let reads = 0;
    Object.defineProperty(inbound, 'type', {
      enumerable: true,
      get() {
        reads += 1;
        return reads === 1
          ? 'dice-presentation-requested'
          : 'dice-presentation-released';
      },
    });

    const parsed = parseDicePresentationEvent(inbound);

    expect(parsed?.type).toBe('dice-presentation-requested');
    expect(reads).toBe(1);
  });
});

describe('projectDicePresentationEvents', () => {
  it('returns no presentation when there is no valid request', () => {
    const projection = projectDicePresentationEvents([
      release(),
      requested({ eventId: '../bad' }),
    ]);

    expect(projection.request).toBeUndefined();
    expect(projection.release).toBeUndefined();
    expect(projection.acceptedEvents).toEqual([]);
  });

  it('fixes first request facts, treats identical replay as idempotent, and fails conflicting duplicate closed', () => {
    const first = requested();
    const identicalReplay = requested({ eventId: 'event:request:replay' });
    const conflict = requested({
      eventId: 'event:request:conflict',
      die: { kind: 'd20', presetId: 'lightning', authoritativeResult: 20 },
    });
    const projection = projectDicePresentationEvents([
      first,
      identicalReplay,
      conflict,
    ]);

    expect(projection.request).toMatchObject({
      eventId: 'event:request:7',
      die: { authoritativeResult: 10 },
    });
    expect(projection.acceptedEvents).toHaveLength(1);
  });

  it('accepts only the first post-request release and correlates solely by presentation id', () => {
    const first = release(
      { eventId: 'event:release:first' },
      { throwProfile: profile({ motionSeed: 4 }) }
    );
    const identicalReplay = release(
      { eventId: 'event:release:replay-with-another-event-id' },
      { throwProfile: profile({ motionSeed: 4 }) }
    );
    const conflict = release(
      { eventId: 'event:release:conflict' },
      {
        throwProfile: profile({
          releaseDirection: [1, 0],
          releaseSpeed: 1,
          motionSeed: 9,
        }),
      }
    );
    const projection = projectDicePresentationEvents([
      requested(),
      first,
      identicalReplay,
      conflict,
    ]);

    expect(projection.release).toMatchObject({
      eventId: 'event:release:first',
      release: { presentationId: 'attack:7', throwProfile: { motionSeed: 4 } },
    });
    expect(projection.acceptedEvents).toHaveLength(2);
  });

  it('ignores release before request, preset mismatch, malformed events, and stale presentation ids', () => {
    const secondRequest = requested({
      eventId: 'event:request:8',
      presentationId: 'attack:8',
      roller: { entityId: 'monster:2', role: 'monster' },
      die: {
        kind: 'd20',
        presetId: 'newer-safe-preset',
        authoritativeResult: 14,
      },
    });
    const validSecondRelease = release(
      { eventId: 'event:release:8', presentationId: 'attack:8' },
      {
        presentationId: 'attack:8',
        presetId: 'newer-safe-preset',
        throwProfile: profile({ motionSeed: 8 }),
      }
    );
    const projection = projectDicePresentationEvents([
      release({ eventId: 'event:release:before' }),
      requested(),
      secondRequest,
      release({ eventId: 'event:release:stale' }),
      requested({ eventId: '../malformed' }),
      release(
        { eventId: 'event:release:8:mismatch', presentationId: 'attack:8' },
        { presentationId: 'attack:8', presetId: 'lightning' }
      ),
      validSecondRelease,
    ]);

    expect(projection.request).toMatchObject({
      presentationId: 'attack:8',
      roller: { role: 'monster' },
      die: { presetId: 'newer-safe-preset', authoritativeResult: 14 },
    });
    expect(projection.release).toMatchObject({
      eventId: 'event:release:8',
      presentationId: 'attack:8',
    });
  });

  it('treats delivery arrays as immutable facts and freezes accepted snapshots', () => {
    const inboundRequest = requested();
    const inboundRelease = release();
    const delivery = Object.freeze([inboundRequest, inboundRelease]);
    const before = JSON.stringify(delivery);

    const projection = projectDicePresentationEvents(delivery);

    expect(JSON.stringify(delivery)).toBe(before);
    expect(projection.acceptedEvents).not.toBe(delivery);
    expect(projection.acceptedEvents[0]).not.toBe(inboundRequest);
    expect(projection.acceptedEvents[1]).not.toBe(inboundRelease);
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection.acceptedEvents)).toBe(true);
  });

  it('requires a new presentation id to make a replay active', () => {
    const first = requested();
    const second = requested({
      eventId: 'event:request:8',
      presentationId: 'attack:8',
    });
    const replayFirst = requested({ eventId: 'event:request:7:later' });
    const projection = projectDicePresentationEvents([
      first,
      second,
      replayFirst,
    ]);

    expect(projection.request?.presentationId).toBe('attack:8');
  });
});
