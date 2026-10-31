import { NPC_ACTIVITY_PROFILES } from '@/generated/npcAppearanceCatalog';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createActivityPlayback } from './activityPlayback';

const profile = NPC_ACTIVITY_PROFILES[0];
const thoughtful = 'dnd5e:activities:thoughtful';
const cue = { id: 'answer-1', activityRef: thoughtful, cycles: 2 };
const base = { active: true, wantsWalk: false, speed: 1, transitionSpeed: 1.5 };

function fixture() {
  const mixer = new THREE.AnimationMixer(new THREE.Object3D());
  const clips = ['Idle_Relaxed', 'Walk_Forward', ...profile.library.clips].map(
    (name) =>
      new THREE.AnimationClip(name, 1, [
        new THREE.NumberKeyframeTrack('.rotation[x]', [0, 1], [0, 0.1]),
      ])
  );
  const ready = vi.fn();
  const consumed = vi.fn();
  const playback = createActivityPlayback({
    mixer,
    clips,
    profile,
    ready,
    consumed,
  });
  const reach = (activity: string, phase: string) => {
    for (let i = 0; i < 600; i++) {
      if (
        playback.state.activity === activity &&
        playback.state.phase === phase
      )
        return;
      mixer.update(0.01);
    }
    throw new Error(
      `Never reached ${activity}/${phase}: ${JSON.stringify(playback.state)}`
    );
  };
  return { mixer, playback, ready, reach, consumed };
}

describe('counted response through the real mixer', () => {
  it('acknowledges delivery once while keeping the finite budget in the mixer owner', () => {
    const { playback, mixer, reach, consumed } = fixture();
    playback.update({ ...base, cue });
    expect(consumed).toHaveBeenCalledExactlyOnceWith('answer-1');
    reach(thoughtful, 'sustain');
    playback.update(base); // The cursor retires the dispatched request, not its playback.
    mixer.update(1.1);
    expect(playback.state.phase).toBe('sustain');
    mixer.update(1.1);
    expect(playback.state.phase).toBe('exit');
    reach(profile.defaultActivityRef, 'sustain');
    playback.update({ ...base, cue });
    expect(consumed).toHaveBeenCalledOnce();
    playback.dispose();
  });
  it.each([
    { ...cue, cycles: 0 },
    { ...cue, cycles: 1.5 },
    { ...cue, cycles: 4294967296 },
    { ...cue, activityRef: 'unknown' },
    { ...cue, activityRef: profile.walkActivityRef },
    { ...cue, id: '' },
  ])(
    'refuses an unsupported or malformed cue without guessing: %j',
    (invalid) => {
      const { playback } = fixture();
      expect(() => playback.update({ ...base, cue: invalid })).toThrow(
        /activity cue/i
      );
      playback.dispose();
    }
  );
  it('counts two sustain cycles, excluding Enter/Exit, then returns to default', () => {
    const { playback, mixer, reach } = fixture();
    playback.update({ ...base, cue });
    reach(thoughtful, 'enter');
    mixer.update(0.3);
    expect(playback.state.phase).toBe('enter');
    reach(thoughtful, 'sustain');
    mixer.update(1.1);
    expect(playback.state.phase).toBe('sustain');
    mixer.update(1.1);
    expect(playback.state.phase).toBe('exit');
    reach(profile.defaultActivityRef, 'sustain');
    mixer.update(10);
    expect(playback.state.activity).toBe(profile.defaultActivityRef);
    playback.dispose();
  });

  it.each([1, 2])(
    'finishes %s cycles even when a mixer update crosses several boundaries',
    (cycles) => {
      const { playback, mixer, reach } = fixture();
      playback.update({ ...base, cue: { ...cue, cycles } });
      reach(thoughtful, 'sustain');
      mixer.update(20);
      expect(playback.state.phase).toBe('exit');
      reach(profile.defaultActivityRef, 'sustain');
      playback.dispose();
    }
  );

  it('discards remaining cycles on movement and does not resume them after arrival', () => {
    const { playback, mixer, reach, ready } = fixture();
    const request = { ...base, cue: { ...cue, cycles: 5 } };
    playback.update(request);
    reach(thoughtful, 'sustain');
    mixer.update(1.1);
    playback.update({ ...request, wantsWalk: true, moveSeq: 7 });
    expect(ready).toHaveBeenLastCalledWith({ moveSeq: 7, ready: false });
    reach(profile.walkActivityRef, 'sustain');
    expect(ready).toHaveBeenLastCalledWith({ moveSeq: 7, ready: true });
    playback.update({ ...request, wantsWalk: false, moveSeq: 7 });
    reach(profile.defaultActivityRef, 'sustain');
    mixer.update(10);
    playback.update(request);
    mixer.update(10);
    expect(playback.state.activity).toBe(profile.defaultActivityRef);
    playback.dispose();
  });

  it('does not restart a budget on repeated prop updates or repeat a completed response', () => {
    const { playback, mixer, reach } = fixture();
    const request = { ...base, cue };
    playback.update(request);
    reach(thoughtful, 'sustain');
    mixer.update(1.1);
    playback.update(request);
    mixer.update(1.1);
    expect(playback.state.phase).toBe('exit');
    reach(profile.defaultActivityRef, 'sustain');
    playback.update(request);
    mixer.update(10);
    expect(playback.state.activity).toBe(profile.defaultActivityRef);
    playback.dispose();
  });

  it('lets a genuinely new response replace the remaining count at a sustain boundary', () => {
    const { playback, mixer, reach } = fixture();
    playback.update({ ...base, cue: { ...cue, cycles: 5 } });
    reach(thoughtful, 'sustain');
    mixer.update(0.4);
    playback.update({ ...base, cue: { ...cue, id: 'answer-2', cycles: 1 } });
    mixer.update(0.7); // finish the old partial cycle, then begin the new full one
    expect(playback.state.phase).toBe('sustain');
    mixer.update(0.5);
    expect(playback.state.phase).toBe('sustain');
    mixer.update(0.6);
    expect(playback.state.phase).toBe('exit');
    playback.dispose();
  });

  it('does not revive a response after losing the active body', () => {
    const { playback, mixer, reach } = fixture();
    const request = { ...base, cue };
    playback.update(request);
    reach(thoughtful, 'enter');
    playback.update({ ...request, active: false });
    mixer.update(10);
    playback.update(request);
    mixer.update(10);
    expect(playback.state).toMatchObject({
      activity: profile.defaultActivityRef,
      phase: 'sustain',
    });
    playback.dispose();
  });

  it('returns seamlessly when the cue and the configured default are the same activity', () => {
    const { playback, mixer } = fixture();
    playback.update({ ...base, defaultActivityRef: thoughtful, cue });
    expect(playback.state.cueId).toBe('answer-1');
    for (let i = 0; i < 50; i++) {
      mixer.update(0.1);
      expect(playback.state).toMatchObject({
        activity: thoughtful,
        phase: 'sustain',
      });
    }
    expect(playback.state.cueId).toBeUndefined();
    playback.dispose();
  });
});
