import { describe, expect, it } from 'vitest';
import {
  parseDicePresentationEvent,
  projectDicePresentationEvents,
} from './dicePresentationEvent';
import type { DicePresentationRelease } from './dicePresentationRelease';

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
      schemaVersion: 1,
      presentationId: 'attack:7',
      presetId: 'lightning',
      variation: 7,
      vector: [0, 0],
      shake: 0,
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
        expect(parsed.release).not.toBe(inbound.release);
        expect(Object.isFrozen(parsed.release)).toBe(true);
        expect(Object.isFrozen(parsed.release.vector)).toBe(true);
      }
      expect(Object.isFrozen(inbound)).toBe(false);
    }
  );

  it.each(['lightning', 'dice.original.carved.d20', 'newer-safe-preset'])(
    'accepts the syntactically safe preset %s without authorizing an asset URL',
    (presetId) => {
      expect(
        parseDicePresentationEvent(
          requested({
            die: {
              kind: 'd20',
              presetId,
              authoritativeResult: 20,
            },
          })
        )
      ).toMatchObject({
        die: { presetId, authoritativeResult: 20 },
      });
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
    'dice\\original',
    'dice:original',
    'dice%2eoriginal',
    'https://evil.test',
    '../dice',
    'Dice.original',
    `dice.${'a'.repeat(33)}`,
    Array.from({ length: 8 }, () => 'abcdefgh').join('.'),
    'a.a.a.a.a.a.a.a.a',
  ])('rejects malformed inbound preset identifier %s', (presetId) => {
    expect(
      parseDicePresentationEvent(
        requested({
          die: { kind: 'd20', presetId, authoritativeResult: 10 },
        })
      )
    ).toBeUndefined();
    expect(
      parseDicePresentationEvent(release({}, { presetId }))
    ).toBeUndefined();
  });

  it.each([
    { name: 'wrong schema', value: requested({ schemaVersion: 2 }) },
    { name: 'wrong type', value: requested({ type: 'dice-rolled' }) },
    { name: 'unknown outer key', value: requested({ result: 10 }) },
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
      name: 'renderer token',
      value: requested({ presentationToken: 7 }),
    },
    {
      name: 'URL',
      value: requested({
        die: {
          kind: 'd20',
          presetId: 'https://evil.test/die.glb',
          authoritativeResult: 10,
        },
      }),
    },
    {
      name: 'description',
      value: requested({ description: 'critical hit' }),
    },
    {
      name: 'invalid result',
      value: requested({
        die: {
          kind: 'd20',
          presetId: 'lightning',
          authoritativeResult: 20.5,
        },
      }),
    },
    {
      name: 'out of range result',
      value: requested({
        die: {
          kind: 'd20',
          presetId: 'lightning',
          authoritativeResult: 21,
        },
      }),
    },
    {
      name: 'invalid role',
      value: requested({
        roller: { entityId: 'character:1', role: 'gm' },
      }),
    },
    {
      name: 'malformed event id',
      value: requested({ eventId: 'event/id' }),
    },
    {
      name: 'malformed presentation id',
      value: requested({ presentationId: 'https://evil.test' }),
    },
    {
      name: 'malformed entity id',
      value: requested({
        roller: { entityId: 'a'.repeat(129), role: 'player' },
      }),
    },
    {
      name: 'unknown release key',
      value: release({}, { renderer: '3d' } as never),
    },
    {
      name: 'outer/release presentation mismatch',
      value: release({}, { presentationId: 'attack:8' }),
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

  it('fixes the first request facts, treats identical replay as idempotent, and rejects conflict', () => {
    const first = requested();
    const identicalReplay = requested({ eventId: 'event:request:replay' });
    const conflict = requested({
      eventId: 'event:request:conflict',
      die: {
        kind: 'd20',
        presetId: 'lightning',
        authoritativeResult: 20,
      },
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

  it('ignores release before request and accepts only the first later release by presentation id', () => {
    const before = release({ eventId: 'event:release:before' });
    const first = release(
      { eventId: 'event:release:first' },
      { variation: 4, vector: [0.25, -0.5], shake: 0.5 }
    );
    const duplicate = release(
      { eventId: 'event:release:duplicate' },
      { variation: 4, vector: [0.25, -0.5], shake: 0.5 }
    );
    const conflict = release(
      { eventId: 'event:release:conflict' },
      { variation: 9, vector: [-1, 1], shake: 1 }
    );
    const projection = projectDicePresentationEvents([
      before,
      requested(),
      first,
      duplicate,
      conflict,
    ]);

    expect(projection.release).toMatchObject({
      eventId: 'event:release:first',
      release: { variation: 4, vector: [0.25, -0.5], shake: 0.5 },
    });
    expect(projection.acceptedEvents).toHaveLength(2);
  });

  it('ignores release preset mismatch, malformed events, and stale releases without poisoning the latest request', () => {
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
    const staleRelease = release({ eventId: 'event:release:stale' });
    const mismatchedPreset = release(
      {
        eventId: 'event:release:8:mismatch',
        presentationId: 'attack:8',
      },
      { presentationId: 'attack:8', presetId: 'lightning' }
    );
    const validSecondRelease = release(
      {
        eventId: 'event:release:8',
        presentationId: 'attack:8',
      },
      {
        presentationId: 'attack:8',
        presetId: 'newer-safe-preset',
        variation: 8,
      }
    );
    const projection = projectDicePresentationEvents([
      requested(),
      secondRequest,
      staleRelease,
      requested({ eventId: '../malformed' }),
      mismatchedPreset,
      validSecondRelease,
    ]);

    expect(projection.request).toMatchObject({
      presentationId: 'attack:8',
      roller: { role: 'monster' },
      die: {
        presetId: 'newer-safe-preset',
        authoritativeResult: 14,
      },
    });
    expect(projection.release).toMatchObject({
      eventId: 'event:release:8',
      presentationId: 'attack:8',
    });
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
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection.acceptedEvents)).toBe(true);
  });
});
