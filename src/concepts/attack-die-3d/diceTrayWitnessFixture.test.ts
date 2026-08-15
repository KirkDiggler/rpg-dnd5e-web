import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseDicePresentationEvent,
  type DicePresentationEvent,
} from '../../components/ui/dice/dicePresentationEvent';
import {
  createDicePresentationRelease,
  dicePresentationReleaseKey,
} from '../../components/ui/dice/dicePresentationRelease';
import {
  createNeutralVisualThrowProfile,
  createVisualThrowProfile,
} from '../../components/ui/dice/visualThrowProfile';
import type { CombatLogEntry } from '../../hooks/useCombatLog';
import { CONCEPT_LOG_ENTRIES } from '../combat-panel/logFixtures';
import {
  appendDiceTrayWitnessEvent,
  createDiceTrayWitnessInitialEvents,
  MONSTER_FIXTURE_RELEASE_DELAY_MS,
  scheduleMonsterDiceTrayWitnessRelease,
} from './diceTrayWitnessFixture';

function expectRecursivelyFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectRecursivelyFrozen(child);
}

function recursivelyCollectKeys(value: unknown, keys = new Set<string>()) {
  if (value === null || typeof value !== 'object') return keys;
  for (const [key, child] of Object.entries(value)) {
    keys.add(key.toLowerCase());
    recursivelyCollectKeys(child, keys);
  }
  return keys;
}

function presentationHash(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function appendScheduledMonsterRelease(token: number, result = 10) {
  let events: readonly DicePresentationEvent[] =
    createDiceTrayWitnessInitialEvents(token, 'monster', result);
  const append = (input: unknown) => {
    events = appendDiceTrayWitnessEvent(events, input);
  };
  return {
    append,
    events: () => events,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('dice tray witness fixture', () => {
  it.each([
    {
      mode: 'player' as const,
      token: 7,
      presentationId: 'concept:witness:player:7:result:10',
      eventId: 'concept:witness:request:player:7:result:10',
      entityId: 'concept:player',
    },
    {
      mode: 'monster' as const,
      token: 8,
      presentationId: 'concept:witness:monster:8:result:10',
      eventId: 'concept:witness:request:monster:8:result:10',
      entityId: 'concept:monster',
    },
  ])(
    'creates an exact recursively frozen, parser-valid $mode request-only list',
    ({ mode, token, presentationId, eventId, entityId }) => {
      const events = createDiceTrayWitnessInitialEvents(token, mode, 10);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        schemaVersion: 1,
        type: 'dice-presentation-requested',
        eventId,
        presentationId,
        roller: { entityId, role: mode },
        die: {
          kind: 'd20',
          presetId: 'dice.original.carved.d20',
          authoritativeResult: 10,
        },
      });
      expect(parseDicePresentationEvent(events[0])).toEqual(events[0]);
      expectRecursivelyFrozen(events);
    }
  );

  it.each(Array.from({ length: 20 }, (_, index) => index + 1))(
    'accepts authoritative fixture result %i and binds it into request identity before delivery',
    (result) => {
      const events = createDiceTrayWitnessInitialEvents(10, 'player', result);
      expect(events[0]).toMatchObject({
        eventId: `concept:witness:request:player:10:result:${result}`,
        presentationId: `concept:witness:player:10:result:${result}`,
        die: {
          presetId: 'dice.original.carved.d20',
          authoritativeResult: result,
        },
      });
      expect(parseDicePresentationEvent(events[0])).toEqual(events[0]);
      expectRecursivelyFrozen(events);
    }
  );

  it('changes request identity when the authoritative result changes before delivery', () => {
    const first = createDiceTrayWitnessInitialEvents(10, 'player', 1)[0];
    const second = createDiceTrayWitnessInitialEvents(10, 'player', 20)[0];

    expect(second.eventId).not.toBe(first.eventId);
    expect(second.presentationId).not.toBe(first.presentationId);
  });

  it.each([0, 21, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid authoritative fixture result %s',
    (result) => {
      expect(() =>
        createDiceTrayWitnessInitialEvents(10, 'player', result)
      ).toThrow(/result.*1–20/i);
    }
  );

  it('strictly parses, reconstructs, freezes, and appends valid events in order', () => {
    const current = createDiceTrayWitnessInitialEvents(11, 'player', 10);
    const inbound = {
      schemaVersion: 1,
      type: 'dice-presentation-released',
      eventId: 'fixture:release:11',
      presentationId: 'concept:witness:player:11:result:10',
      release: {
        schemaVersion: 2,
        presentationId: 'concept:witness:player:11:result:10',
        presetId: 'dice.original.carved.d20',
        throwProfile: createVisualThrowProfile({
          releasePosition: [0.5, 0.5],
          releaseDirection: [0.5, -0.25],
          releaseSpeed: 0.5,
          shakeEnergy: 0.5,
          spinBias: 0,
          motionSeed: 3,
        }),
      },
    };

    const appended = appendDiceTrayWitnessEvent(current, inbound);

    expect(appended).not.toBe(current);
    expect(appended).toHaveLength(2);
    expect(appended[0]).toBe(current[0]);
    expect(appended[1]).toEqual(inbound);
    expect(appended[1]).not.toBe(inbound);
    expect(appended[1].type).toBe('dice-presentation-released');
    if (appended[1].type === 'dice-presentation-released') {
      expect(appended[1].release).not.toBe(inbound.release);
      expect(dicePresentationReleaseKey(appended[1].release)).toBe(
        'concept:witness:player:11:result:10'
      );
    }
    expectRecursivelyFrozen(appended);
  });

  it('returns the same array for malformed input, duplicate IDs, and duplicate release keys', () => {
    const initial = createDiceTrayWitnessInitialEvents(12, 'player', 10);
    expect(appendDiceTrayWitnessEvent(initial, { malformed: true })).toBe(
      initial
    );
    expect(appendDiceTrayWitnessEvent(initial, { ...initial[0] })).toBe(
      initial
    );

    const release = {
      schemaVersion: 1 as const,
      type: 'dice-presentation-released' as const,
      eventId: 'fixture:release:12',
      presentationId: 'concept:witness:player:12:result:10',
      release: createDicePresentationRelease({
        presentationId: 'concept:witness:player:12:result:10',
        presetId: 'dice.original.carved.d20',
        throwProfile: createNeutralVisualThrowProfile(0),
      }),
    };
    const accepted = appendDiceTrayWitnessEvent(initial, release);
    expect(appendDiceTrayWitnessEvent(accepted, release)).toBe(accepted);
    expect(
      appendDiceTrayWitnessEvent(accepted, {
        ...release,
        eventId: 'fixture:later-release:12',
        release: createDicePresentationRelease({
          presentationId: 'concept:witness:player:12:result:10',
          presetId: 'dice.original.carved.d20',
          throwProfile: createNeutralVisualThrowProfile(42),
        }),
      })
    ).toBe(accepted);
  });

  it('keeps player delivery request-only indefinitely', () => {
    vi.useFakeTimers();
    const events = createDiceTrayWitnessInitialEvents(20, 'player', 10);

    vi.advanceTimersByTime(60 * 60 * 1000);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('dice-presentation-requested');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('delivers a host-created Monster neutral release seeded from presentation identity at exactly 250ms', () => {
    vi.useFakeTimers();
    const host = appendScheduledMonsterRelease(21);
    scheduleMonsterDiceTrayWitnessRelease(21, 10, host.append);

    expect(host.events()).toHaveLength(1);
    vi.advanceTimersByTime(MONSTER_FIXTURE_RELEASE_DELAY_MS - 1);
    expect(host.events()).toHaveLength(1);
    vi.advanceTimersByTime(1);

    expect(host.events()).toHaveLength(2);
    expect(host.events().map((event) => event.type)).toEqual([
      'dice-presentation-requested',
      'dice-presentation-released',
    ]);
    expect(host.events()[1]).toEqual({
      schemaVersion: 1,
      type: 'dice-presentation-released',
      eventId: 'concept:witness:release:monster:21:result:10',
      presentationId: 'concept:witness:monster:21:result:10',
      release: {
        schemaVersion: 2,
        presentationId: 'concept:witness:monster:21:result:10',
        presetId: 'dice.original.carved.d20',
        throwProfile: {
          schemaVersion: 1,
          releasePosition: [0.5, 0.5],
          releaseDirection: [0, 0],
          releaseSpeed: 0,
          shakeEnergy: 0,
          spinBias: 0,
          motionSeed: presentationHash('concept:witness:monster:21:result:10'),
        },
      },
    });
    expectRecursivelyFrozen(host.events());
  });

  it('cancels monster delivery on cleanup and dedupes duplicate schedulers', () => {
    vi.useFakeTimers();
    const cancelledHost = appendScheduledMonsterRelease(22);
    const cleanup = scheduleMonsterDiceTrayWitnessRelease(
      22,
      10,
      cancelledHost.append
    );
    cleanup();
    vi.advanceTimersByTime(MONSTER_FIXTURE_RELEASE_DELAY_MS);
    expect(cancelledHost.events()).toHaveLength(1);

    const duplicateHost = appendScheduledMonsterRelease(23);
    scheduleMonsterDiceTrayWitnessRelease(23, 10, duplicateHost.append);
    scheduleMonsterDiceTrayWitnessRelease(23, 10, duplicateHost.append);
    vi.advanceTimersByTime(MONSTER_FIXTURE_RELEASE_DELAY_MS);
    expect(duplicateHost.events()).toHaveLength(2);
    expect(
      duplicateHost
        .events()
        .filter((event) => event.type === 'dice-presentation-released')
    ).toHaveLength(1);
  });

  it('keeps fixture release presentation-only and all fixture events prose/URL/transport free', () => {
    vi.useFakeTimers();
    const host = appendScheduledMonsterRelease(24);
    scheduleMonsterDiceTrayWitnessRelease(24, 10, host.append);
    vi.advanceTimersByTime(MONSTER_FIXTURE_RELEASE_DELAY_MS);

    const allKeys = recursivelyCollectKeys(host.events());
    for (const key of [
      'description',
      'message',
      'text',
      'url',
      'html',
      'transport',
    ])
      expect(allKeys.has(key)).toBe(false);

    const released = host
      .events()
      .find((event) => event.type === 'dice-presentation-released');
    expect(released?.type).toBe('dice-presentation-released');
    if (released?.type !== 'dice-presentation-released') return;
    const releaseKeys = recursivelyCollectKeys(released);
    for (const key of [
      'authoritativeresult',
      'result',
      'outcome',
      'hit',
      'critical',
      'damage',
      'target',
      'renderertoken',
      'renderergeneration',
      'pointersample',
      'networktimestamp',
      'description',
      'message',
      'text',
      'url',
      'html',
      'transport',
    ])
      expect(releaseKeys.has(key)).toBe(false);

    const profile = released.release.throwProfile;
    expect(Reflect.ownKeys(profile)).toEqual([
      'schemaVersion',
      'releasePosition',
      'releaseDirection',
      'releaseSpeed',
      'shakeEnergy',
      'spinBias',
      'motionSeed',
    ]);
    const profileKeys = recursivelyCollectKeys(profile);
    for (const key of [
      'clientx',
      'clienty',
      'pointerid',
      'pointertype',
      'timems',
      'timestamp',
      'samples',
      'history',
      'pathlength',
      'held',
      'normalizedposition',
      'normalizedtilt',
      'wobblephase',
      'authoritativeresult',
      'result',
      'target',
    ])
      expect(profileKeys.has(key)).toBe(false);
    expectRecursivelyFrozen(profile);
    expect(host.events()[0]).toMatchObject({
      die: { authoritativeResult: 10 },
    });
  });

  it('keeps combat history as unchanged structured facts and fixture prose out of the producer', () => {
    const entries: CombatLogEntry[] = CONCEPT_LOG_ENTRIES;
    expect(entries.length).toBeGreaterThan(0);
    expect(
      entries.every(
        (entry) =>
          typeof entry.id === 'number' &&
          typeof entry.round === 'number' &&
          typeof entry.kind === 'string' &&
          entry.event !== null &&
          typeof entry.event === 'object'
      )
    ).toBe(true);

    const attackEntries = entries.filter(
      (entry): entry is Extract<CombatLogEntry, { kind: 'attack' }> =>
        entry.kind === 'attack'
    );
    expect(attackEntries.length).toBeGreaterThan(0);
    for (const { event } of attackEntries)
      expect(event).toEqual(
        expect.objectContaining({
          attackRoll: expect.any(Number),
          attackBonus: expect.any(Number),
          targetAc: expect.any(Number),
          hit: expect.any(Boolean),
          critical: expect.any(Boolean),
          hasAdvantage: expect.any(Boolean),
          hasDisadvantage: expect.any(Boolean),
          advantageSources: expect.any(Array),
          disadvantageSources: expect.any(Array),
        })
      );

    const damageEntries = entries.filter(
      (entry): entry is Extract<CombatLogEntry, { kind: 'damage' }> =>
        entry.kind === 'damage'
    );
    expect(damageEntries.length).toBeGreaterThan(0);
    for (const { event } of damageEntries)
      expect(event).toEqual(
        expect.objectContaining({
          entityId: expect.any(String),
          amount: expect.any(Number),
          damageType: expect.objectContaining({ id: expect.any(String) }),
          damageBreakdown: expect.any(Array),
          hpAfter: expect.objectContaining({
            current: expect.any(Number),
            max: expect.any(Number),
          }),
        })
      );

    const logKeys = recursivelyCollectKeys(entries);
    for (const key of ['description', 'message', 'text', 'html', 'url'])
      expect(logKeys.has(key)).toBe(false);

    const source = readFileSync(
      'src/concepts/attack-die-3d/diceTrayWitnessFixture.ts',
      'utf8'
    );
    expect(source).not.toMatch(
      /CONCEPT_LOG_ENTRIES|logFixtures|CombatLogEntry/
    );
  });
});
