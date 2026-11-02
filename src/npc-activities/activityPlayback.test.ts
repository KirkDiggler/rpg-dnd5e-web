import { NPC_ACTIVITY_PROFILES } from '@/generated/npcAppearanceCatalog';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createActivityPlayback } from './activityPlayback';

const profile = NPC_ACTIVITY_PROFILES[0];
const thoughtful = 'dnd5e:activities:thoughtful';
function fixture() {
  const root = new THREE.Object3D();
  const mixer = new THREE.AnimationMixer(root);
  const clips = ['Idle_Relaxed', 'Walk_Forward', ...profile.library.clips].map(
    (name) =>
      new THREE.AnimationClip(name, 1, [
        new THREE.NumberKeyframeTrack('.rotation[x]', [0, 1], [0, 0.1]),
      ])
  );
  const ready = vi.fn();
  const playback = createActivityPlayback({ mixer, clips, profile, ready });
  return { mixer, ready, playback };
}

describe('real mixer activity adapter', () => {
  it('gates the exact route until the real exit finishes, then re-enters after arrival', () => {
    const { mixer, ready, playback } = fixture();
    playback.update({
      defaultActivityRef: thoughtful,
      wantsWalk: false,
      moveSeq: undefined,
      active: true,
      speed: 1,
      transitionSpeed: 1.5,
    });
    playback.update({
      defaultActivityRef: thoughtful,
      wantsWalk: true,
      moveSeq: 7,
      active: true,
      speed: 1,
      transitionSpeed: 1.5,
    });
    expect(ready).toHaveBeenLastCalledWith({ moveSeq: 7, ready: false });
    mixer.update(1.01);
    expect(playback.state.phase).toBe('exit');
    mixer.update(0.5);
    expect(ready).toHaveBeenLastCalledWith({ moveSeq: 7, ready: false });
    mixer.update(0.18);
    expect(ready).toHaveBeenLastCalledWith({ moveSeq: 7, ready: true });
    playback.update({
      defaultActivityRef: thoughtful,
      wantsWalk: false,
      moveSeq: 7,
      active: true,
      speed: 1,
      transitionSpeed: 1.5,
    });
    mixer.update(1.01);
    expect(playback.state).toMatchObject({
      activity: thoughtful,
      phase: 'enter',
      walkingReady: false,
    });
    mixer.update(0.68);
    expect(playback.state.phase).toBe('sustain');
    playback.dispose();
  });

  it('freezes memory, invalidates pending movement and resets on reobservation', () => {
    const { mixer, ready, playback } = fixture();
    const input = {
      defaultActivityRef: thoughtful,
      wantsWalk: true,
      moveSeq: 1,
      active: true,
      speed: 2,
      transitionSpeed: 1.5,
    };
    playback.update(input);
    mixer.update(0.51);
    expect(playback.state.phase).toBe('exit');
    playback.update({ ...input, active: false });
    mixer.update(10);
    expect(playback.state.phase).toBe('stopped');
    expect(mixer.timeScale).toBe(0);
    playback.update({ ...input, wantsWalk: false, moveSeq: undefined });
    expect(playback.state).toMatchObject({
      activity: thoughtful,
      phase: 'sustain',
      walkingReady: false,
    });
    expect(mixer.timeScale).toBe(2);
    playback.dispose();
    const calls = ready.mock.calls.length;
    mixer.update(10);
    expect(ready).toHaveBeenCalledTimes(calls);
  });

  it('reports missing clips and unsupported explicit defaults instead of guessing', () => {
    expect(() =>
      createActivityPlayback({
        mixer: new THREE.AnimationMixer(new THREE.Object3D()),
        clips: [],
        profile,
        ready: vi.fn(),
      })
    ).toThrow(/Missing activity clip/);
    const { playback } = fixture();
    expect(() =>
      playback.update({
        defaultActivityRef: 'other:activities:unknown',
        wantsWalk: false,
        active: true,
        speed: 1,
        transitionSpeed: 1.5,
      })
    ).toThrow(/Unsupported default activity/);
    playback.dispose();
  });
});
