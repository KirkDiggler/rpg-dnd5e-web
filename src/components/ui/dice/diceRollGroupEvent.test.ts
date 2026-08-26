import { describe, expect, it } from 'vitest';
import {
  parseDiceRollGroupEvent,
  projectDiceRollGroupEvents,
} from './diceRollGroupEvent';
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

function die(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'die:1',
    kind: 'd20',
    presetId: 'lightning',
    setId: 'set:1',
    originalFace: 10,
    finalFace: 10,
    rerolls: [],
    disposition: 'counted',
    sourceRef: 'source:1',
    sourceLabel: 'Longsword',
    contributorMemberId: 'member:1',
    purpose: 'base',
    ...overrides,
  };
}

function group(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    key: 'attack',
    dice: [die()],
    modifiers: [],
    ...overrides,
  };
}

function requested(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    type: 'dice-roll-group-requested',
    eventId: 'event:request:7',
    presentationId: 'group:7',
    roller: { memberId: 'member:1', role: 'player' },
    group: group(),
    ...overrides,
  };
}

function released(
  overrides: Record<string, unknown> = {},
  releaseOverrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    type: 'dice-roll-group-released',
    eventId: 'event:release:7',
    presentationId: 'group:7',
    release: {
      schemaVersion: 1,
      presentationId: 'group:7',
      groupKey: 'attack',
      throwProfile: profile(),
      ...releaseOverrides,
    },
    ...overrides,
  };
}

describe('parseDiceRollGroupEvent', () => {
  it.each([requested(), released()])(
    'strictly reconstructs and deeply freezes a valid event',
    (inbound) => {
      const parsed = parseDiceRollGroupEvent(inbound);

      expect(parsed).toEqual(inbound);
      expect(parsed).not.toBe(inbound);
      expect(Object.isFrozen(parsed)).toBe(true);
      if (parsed?.type === 'dice-roll-group-requested') {
        expect(parsed.roller).not.toBe(inbound.roller);
        expect(parsed.group).not.toBe(inbound.group);
        expect(parsed.group.dice).not.toBe(inbound.group.dice);
        expect(parsed.group.dice[0]).not.toBe(inbound.group.dice[0]);
        expect(Object.isFrozen(parsed.roller)).toBe(true);
        expect(Object.isFrozen(parsed.group)).toBe(true);
        expect(Object.isFrozen(parsed.group.dice)).toBe(true);
        expect(Object.isFrozen(parsed.group.dice[0])).toBe(true);
      } else if (parsed) {
        expect(parsed.release).not.toBe(inbound.release);
        expect(parsed.release.throwProfile).not.toBe(
          inbound.release.throwProfile
        );
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

  it.each([
    {
      name: 'unknown request key',
      value: requested({ result: 10 }),
    },
    {
      name: 'unknown roller key',
      value: requested({
        roller: { memberId: 'member:1', role: 'player', entityId: 'x' },
      }),
    },
    {
      name: 'unknown release key',
      value: released({ damage: 10 }),
    },
    {
      name: 'malformed group',
      value: requested({ group: { ...group(), extra: true } }),
    },
    {
      name: 'malformed member id',
      value: requested({ roller: { memberId: '../bad', role: 'player' } }),
    },
    {
      name: 'malformed presentation id',
      value: requested({ presentationId: 'https://evil.test' }),
    },
    {
      name: 'malformed profile',
      value: released(
        {},
        {
          throwProfile: profile({ releaseDirection: [1, 0, 0] as never }),
        }
      ),
    },
    {
      name: 'legacy result leaked into release',
      value: released({}, { result: 10 }),
    },
    {
      name: 'raw pointer id leaked into release',
      value: released({}, { pointerId: 7 }),
    },
    {
      name: 'legacy damage leaked into release',
      value: released({}, { damage: 12 }),
    },
    {
      name: 'preset id leaked into release',
      value: released({}, { presetId: 'lightning' }),
    },
  ])('fails closed for $name', ({ value }) => {
    expect(parseDiceRollGroupEvent(value)).toBeUndefined();
  });
});

describe('projectDiceRollGroupEvents', () => {
  it('requires a valid request before accepting a release', () => {
    const projection = projectDiceRollGroupEvents([
      released(),
      requested({ eventId: '../bad' }),
    ]);

    expect(projection.request).toBeUndefined();
    expect(projection.release).toBeUndefined();
    expect(projection.acceptedEvents).toEqual([]);
  });

  it('locks first request facts, ignores equal duplicates, and refuses conflicting duplicates', () => {
    const first = requested();
    const equalDuplicate = requested({ eventId: 'event:request:replay' });
    const conflictingDuplicate = requested({
      eventId: 'event:request:conflict',
      group: group({
        dice: [die({ finalFace: 20 })],
      }),
    });

    const projection = projectDiceRollGroupEvents([
      first,
      equalDuplicate,
      conflictingDuplicate,
    ]);

    expect(projection.request).toMatchObject({
      eventId: 'event:request:7',
      group: { dice: [{ finalFace: 10 }] },
    });
    expect(projection.acceptedEvents).toHaveLength(1);
  });

  it('accepts only the first compatible post-request release and refuses group-key mismatches', () => {
    const projection = projectDiceRollGroupEvents([
      requested(),
      released({ eventId: 'event:release:mismatch' }, { groupKey: 'damage' }),
      released(
        { eventId: 'event:release:first' },
        { throwProfile: profile({ motionSeed: 11 }) }
      ),
      released(
        { eventId: 'event:release:replay' },
        { throwProfile: profile({ motionSeed: 11 }) }
      ),
      released(
        { eventId: 'event:release:conflict' },
        { throwProfile: profile({ motionSeed: 21 }) }
      ),
    ]);

    expect(projection.release).toMatchObject({
      eventId: 'event:release:first',
      release: { groupKey: 'attack', throwProfile: { motionSeed: 11 } },
    });
    expect(projection.acceptedEvents).toHaveLength(2);
  });

  it('locks onto the first active presentation stream and ignores foreign presentation ids', () => {
    const projection = projectDiceRollGroupEvents([
      requested(),
      requested({
        eventId: 'event:request:8',
        presentationId: 'group:8',
      }),
      released(
        {
          eventId: 'event:release:8',
          presentationId: 'group:8',
        },
        {
          presentationId: 'group:8',
          throwProfile: profile({ motionSeed: 18 }),
        }
      ),
      released(
        { eventId: 'event:release:first-stream' },
        { throwProfile: profile({ motionSeed: 17 }) }
      ),
    ]);

    expect(projection.request?.presentationId).toBe('group:7');
    expect(projection.release).toMatchObject({
      eventId: 'event:release:first-stream',
      presentationId: 'group:7',
      release: {
        presentationId: 'group:7',
        groupKey: 'attack',
        throwProfile: { motionSeed: 17 },
      },
    });
    expect(projection.acceptedEvents).toHaveLength(2);
    expect(
      projection.acceptedEvents.map((event) => event.presentationId)
    ).toEqual(['group:7', 'group:7']);
  });

  it('treats delivery arrays as immutable facts and deeply freezes accepted outputs', () => {
    const inboundRequest = requested();
    const inboundRelease = released();
    const delivery = Object.freeze([inboundRequest, inboundRelease]);
    const before = JSON.stringify(delivery);

    const projection = projectDiceRollGroupEvents(delivery);

    expect(JSON.stringify(delivery)).toBe(before);
    expect(projection.acceptedEvents).not.toBe(delivery);
    expect(projection.acceptedEvents[0]).not.toBe(inboundRequest);
    expect(projection.acceptedEvents[1]).not.toBe(inboundRelease);
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection.acceptedEvents)).toBe(true);
    expect(Object.isFrozen(projection.request)).toBe(true);
    expect(Object.isFrozen(projection.request?.roller)).toBe(true);
    expect(Object.isFrozen(projection.request?.group)).toBe(true);
    expect(Object.isFrozen(projection.request?.group.dice)).toBe(true);
    expect(Object.isFrozen(projection.release)).toBe(true);
    expect(Object.isFrozen(projection.release?.release)).toBe(true);
    expect(Object.isFrozen(projection.release?.release.throwProfile)).toBe(
      true
    );
  });
});
