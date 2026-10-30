import { NPC_ACTIVITY_PROFILES } from '@/generated/npcAppearanceCatalog';
import { describe, expect, it, vi } from 'vitest';
import { ActivitySequencer } from './activitySequencer';

const profile = NPC_ACTIVITY_PROFILES[0];
const thoughtful = 'dnd5e:activities:thoughtful';
function fixture() {
  const play = vi.fn();
  const changed = vi.fn();
  return {
    play,
    changed,
    sequence: new ActivitySequencer({ profile, play, changed }),
  };
}

describe('provider-driven activity sequencing', () => {
  it('waits for the sustain boundary and complete exit before reporting walking readiness', () => {
    const { sequence, play } = fixture();
    sequence.reset(thoughtful);
    sequence.request(profile.walkActivityRef);
    expect(sequence.state).toMatchObject({
      activity: thoughtful,
      phase: 'sustain',
      walkingReady: false,
    });
    sequence.loop(sequence.state.serial);
    expect(play).toHaveBeenLastCalledWith(
      expect.objectContaining({ clip: 'Idle_Thoughtful_Exit', phase: 'exit' })
    );
    expect(sequence.state.walkingReady).toBe(false);
    sequence.finished(sequence.state.serial - 1);
    expect(sequence.state.phase).toBe('exit');
    sequence.finished(sequence.state.serial);
    expect(sequence.state).toMatchObject({
      activity: profile.walkActivityRef,
      phase: 'sustain',
      walkingReady: true,
    });
    expect(play).toHaveBeenLastCalledWith(
      expect.objectContaining({ clip: 'Walk_Forward' })
    );
  });

  it('returns through Enter after arrival and finishes Enter before a newer walk', () => {
    const { sequence, play } = fixture();
    sequence.reset(profile.walkActivityRef);
    sequence.request(thoughtful);
    sequence.loop(sequence.state.serial);
    expect(sequence.state).toMatchObject({
      activity: thoughtful,
      phase: 'enter',
      walkingReady: false,
    });
    const entry = sequence.state.serial;
    sequence.request(profile.walkActivityRef);
    expect(sequence.state.serial).toBe(entry);
    sequence.finished(entry);
    expect(play).toHaveBeenLastCalledWith(
      expect.objectContaining({ clip: 'Idle_Thoughtful_Exit' })
    );
    expect(sequence.state.walkingReady).toBe(false);
    sequence.finished(sequence.state.serial);
    expect(sequence.state.walkingReady).toBe(true);
  });

  it('keeps only the latest request and never queues an obsolete walk', () => {
    const { sequence, play } = fixture();
    sequence.reset(thoughtful);
    sequence.request(profile.walkActivityRef);
    sequence.loop(sequence.state.serial);
    sequence.request(profile.defaultActivityRef);
    sequence.request(thoughtful);
    sequence.finished(sequence.state.serial);
    expect(sequence.state).toMatchObject({
      activity: thoughtful,
      phase: 'enter',
    });
    sequence.finished(sequence.state.serial);
    expect(sequence.state).toMatchObject({
      activity: thoughtful,
      phase: 'sustain',
    });
    expect(
      play.mock.calls.some(([value]) => value.clip === 'Walk_Forward')
    ).toBe(false);
  });

  it('invalidates old events and pending motion on stop/reset', () => {
    const { sequence } = fixture();
    sequence.reset(thoughtful);
    sequence.request(profile.walkActivityRef);
    sequence.loop(sequence.state.serial);
    const oldExit = sequence.state.serial;
    sequence.stop();
    sequence.finished(oldExit);
    expect(sequence.state).toMatchObject({
      phase: 'stopped',
      walkingReady: false,
    });
    sequence.reset(thoughtful);
    sequence.finished(oldExit);
    sequence.loop(oldExit);
    expect(sequence.state).toMatchObject({
      activity: thoughtful,
      requested: thoughtful,
      phase: 'sustain',
      walkingReady: false,
    });
  });

  it('refuses unknown requests before changing state', () => {
    const { sequence } = fixture();
    sequence.reset(thoughtful);
    const before = sequence.state;
    expect(() => sequence.request('unknown:activities:missing')).toThrow(
      /Unknown activity/
    );
    expect(sequence.state).toEqual(before);
  });
});
