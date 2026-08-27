import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNeutralVisualThrowProfile } from '../../components/ui/dice/visualThrowProfile';
import { createSharedTableDiceDeliveryHost } from './sharedTableDiceDelivery';
import { SHARED_TABLE_DICE_SCENARIOS as PARSED_SHARED_TABLE_DICE_SCENARIOS } from './sharedTableDiceFixtures';

if (!PARSED_SHARED_TABLE_DICE_SCENARIOS)
  throw Error('built-in shared table dice fixtures must pass strict parsing');
const SHARED_TABLE_DICE_SCENARIOS = PARSED_SHARED_TABLE_DICE_SCENARIOS;

afterEach(() => {
  vi.useRealTimers();
});

function request(presentationId = 'attack:1') {
  return {
    schemaVersion: 1 as const,
    type: 'dice-roll-group-requested' as const,
    eventId: `request:${presentationId}`,
    presentationId,
    roller: { memberId: 'member:roller', role: 'player' as const },
    group: SHARED_TABLE_DICE_SCENARIOS['ordinary-damage'].attack,
  };
}

function release(
  presentationId = 'attack:1',
  motionSeed = 17,
  groupKey: 'attack' | 'damage' = 'attack'
) {
  return {
    schemaVersion: 1 as const,
    type: 'dice-roll-group-released' as const,
    eventId: `release:${presentationId}:${groupKey}:${motionSeed}`,
    presentationId,
    release: {
      schemaVersion: 1 as const,
      presentationId,
      groupKey,
      throwProfile: createNeutralVisualThrowProfile(motionSeed),
    },
  };
}

describe('shared table dice delivery host', () => {
  it('appends the first event once, freezes the delivered list, and reports changes', () => {
    const onChange = vi.fn();
    const host = createSharedTableDiceDeliveryHost(onChange);
    const accepted = host.append(request());

    expect(accepted).toBe(true);
    expect(host.events()).toEqual([request()]);
    expect(Object.isFrozen(host.events())).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(host.events());
  });

  it('rejects equal and conflicting duplicate requests and releases without emitting extra changes', () => {
    const onChange = vi.fn();
    const host = createSharedTableDiceDeliveryHost(onChange);

    expect(host.append(request('attack:1'))).toBe(true);
    expect(host.append(request('attack:1'))).toBe(false);
    expect(
      host.append({
        ...request('attack:1'),
        eventId: 'request:attack:1:conflict',
        roller: { memberId: 'member:other', role: 'player' as const },
      })
    ).toBe(false);

    expect(host.append(release('attack:1', 17, 'attack'))).toBe(true);
    expect(host.append(release('attack:1', 17, 'attack'))).toBe(false);
    expect(host.append(release('attack:1', 99, 'attack'))).toBe(false);

    expect(host.events()).toEqual([
      request('attack:1'),
      release('attack:1', 17, 'attack'),
    ]);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('owns the sole missing-release timer and appends one neutral release at exactly 3000ms', () => {
    vi.useFakeTimers();
    const host = createSharedTableDiceDeliveryHost(vi.fn());
    host.append(request('attack:missing'));
    host.scheduleMissingRelease({
      presentationId: 'attack:missing',
      groupKey: 'attack',
      presetSeed: 301,
      graceMs: 3_000,
    });

    expect(host.events()).toEqual([request('attack:missing')]);
    vi.advanceTimersByTime(2_999);
    expect(host.events()).toEqual([request('attack:missing')]);

    vi.advanceTimersByTime(1);
    expect(host.events()).toEqual([
      request('attack:missing'),
      {
        schemaVersion: 1,
        type: 'dice-roll-group-released',
        eventId: 'shared-table:missing-release:attack:missing:attack',
        presentationId: 'attack:missing',
        release: {
          schemaVersion: 1,
          presentationId: 'attack:missing',
          groupKey: 'attack',
          throwProfile: createNeutralVisualThrowProfile(301),
        },
      },
    ]);
  });

  it('cleans up the missing-release timer on real release, reset, replay cleanup, and unmount cleanup while staying one-shot under StrictMode rescheduling', () => {
    vi.useFakeTimers();
    const host = createSharedTableDiceDeliveryHost(vi.fn());
    host.append(request('attack:cleanup'));

    const strictModeCleanup = host.scheduleMissingRelease({
      presentationId: 'attack:cleanup',
      groupKey: 'attack',
      presetSeed: 77,
      graceMs: 3_000,
    });
    strictModeCleanup();
    host.scheduleMissingRelease({
      presentationId: 'attack:cleanup',
      groupKey: 'attack',
      presetSeed: 77,
      graceMs: 3_000,
    });
    host.scheduleMissingRelease({
      presentationId: 'attack:cleanup',
      groupKey: 'attack',
      presetSeed: 77,
      graceMs: 3_000,
    });
    vi.advanceTimersByTime(3_000);
    expect(
      host.events().filter((event) => event.type === 'dice-roll-group-released')
    ).toHaveLength(1);

    const realReleaseHost = createSharedTableDiceDeliveryHost(vi.fn());
    realReleaseHost.append(request('attack:real'));
    realReleaseHost.scheduleMissingRelease({
      presentationId: 'attack:real',
      groupKey: 'attack',
      presetSeed: 88,
      graceMs: 3_000,
    });
    expect(realReleaseHost.append(release('attack:real', 42, 'attack'))).toBe(
      true
    );
    vi.advanceTimersByTime(3_000);
    expect(realReleaseHost.events()).toEqual([
      request('attack:real'),
      release('attack:real', 42, 'attack'),
    ]);

    const replayHost = createSharedTableDiceDeliveryHost(vi.fn());
    replayHost.append(request('attack:replay'));
    const replayCleanup = replayHost.scheduleMissingRelease({
      presentationId: 'attack:replay',
      groupKey: 'attack',
      presetSeed: 99,
      graceMs: 3_000,
    });
    replayCleanup();
    vi.advanceTimersByTime(3_000);
    expect(replayHost.events()).toEqual([request('attack:replay')]);

    const resetHost = createSharedTableDiceDeliveryHost(vi.fn());
    resetHost.append(request('attack:reset'));
    resetHost.scheduleMissingRelease({
      presentationId: 'attack:reset',
      groupKey: 'attack',
      presetSeed: 109,
      graceMs: 3_000,
    });
    resetHost.reset();
    vi.advanceTimersByTime(3_000);
    expect(resetHost.events()).toEqual([]);
  });
});
