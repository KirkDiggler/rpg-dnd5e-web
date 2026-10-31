import * as THREE from 'three';
import { ActivitySequencer } from './activitySequencer';
import type { ActivityCueRequest, NpcActivityProfile } from './activityTypes';

export interface WalkingReadiness {
  readonly moveSeq: number | undefined;
  readonly ready: boolean;
}
export interface ActivityPlaybackRequest {
  readonly defaultActivityRef?: string;
  readonly cue?: ActivityCueRequest;
  readonly wantsWalk: boolean;
  readonly moveSeq?: number;
  readonly active: boolean;
  readonly speed: number;
  readonly transitionSpeed: number;
}

/** One body's mixer adapter. It neither updates position nor owns a frame clock. */
export function createActivityPlayback(input: {
  readonly mixer: THREE.AnimationMixer;
  readonly clips: readonly THREE.AnimationClip[];
  readonly profile: NpcActivityProfile;
  readonly ready: (value: WalkingReadiness) => void;
}) {
  const byName = new Map(input.clips.map((clip) => [clip.name, clip]));
  if (byName.size !== input.clips.length)
    throw new Error('Duplicate activity clip names.');
  for (const activity of Object.values(input.profile.activities)) {
    for (const clip of [activity.enter, activity.sustain, activity.exit]) {
      if (clip && !byName.has(clip))
        throw new Error(`Missing activity clip: ${clip}`);
    }
  }
  let request: ActivityPlaybackRequest = {
    wantsWalk: false,
    active: false,
    speed: 1,
    transitionSpeed: 1.5,
  };
  let wasActive = false;
  let lastCueId: string | undefined;
  let disposed = false;
  let current: THREE.AnimationAction | undefined;
  const serials = new Map<THREE.AnimationAction, number>();
  const report = () =>
    input.ready({
      moveSeq: request.moveSeq,
      ready: request.active && request.wantsWalk && sequence.state.walkingReady,
    });
  const sequence = new ActivitySequencer({
    profile: input.profile,
    play: ({ clip, phase, serial, cycles }) => {
      const next = input.mixer.clipAction(byName.get(clip)!);
      if (current && current !== next) current.fadeOut(0.15);
      next.reset();
      next.clampWhenFinished = phase !== 'sustain' || cycles !== undefined;
      next.setLoop(
        phase === 'sustain' ? THREE.LoopRepeat : THREE.LoopOnce,
        phase === 'sustain' ? (cycles ?? Infinity) : 1
      );
      next.setEffectiveTimeScale(
        phase === 'sustain' ? 1 : request.transitionSpeed
      );
      next.fadeIn(0.15).play();
      serials.set(next, serial);
      current = next;
    },
    changed: report,
  });
  const finished = (event: { action: THREE.AnimationAction }) =>
    sequence.finished(serials.get(event.action) ?? -1);
  const loop = (event: { action: THREE.AnimationAction }) =>
    sequence.loop(serials.get(event.action) ?? -1);
  input.mixer.addEventListener('finished', finished);
  input.mixer.addEventListener('loop', loop);
  return {
    get state() {
      return sequence.state;
    },
    update(next: ActivityPlaybackRequest): void {
      if (disposed) return;
      const ref = next.defaultActivityRef || input.profile.defaultActivityRef;
      const activity = Object.hasOwn(input.profile.activities, ref)
        ? input.profile.activities[ref]
        : undefined;
      if (!activity || activity.moving)
        throw new Error(`Unsupported default activity: ${ref}`);
      if (
        ![next.speed, next.transitionSpeed].every(
          (rate) => Number.isFinite(rate) && rate > 0
        )
      )
        throw new Error('Presentation rates must be finite and positive.');
      const defaultChanged =
        ref !==
        (request.defaultActivityRef || input.profile.defaultActivityRef);
      const newCue = next.cue !== undefined && next.cue.id !== lastCueId;
      // Even a cue arriving while hidden/moving is consumed, never deferred
      // until a later surface or arrival. The presentation cursor owns delivery.
      if (next.cue) lastCueId = next.cue.id;
      request = next;
      input.mixer.timeScale = next.active ? next.speed : 0;
      if (!next.active) {
        if (wasActive) sequence.stop();
        wasActive = false;
        report();
        return;
      }
      const starting = !wasActive;
      if (starting) sequence.reset(ref);
      wasActive = true;
      if (next.wantsWalk || starting || defaultChanged || !sequence.state.cueId)
        sequence.request(next.wantsWalk ? input.profile.walkActivityRef : ref);
      if (newCue && next.cue && !next.wantsWalk)
        sequence.requestCue(next.cue, ref);
      current?.setEffectiveTimeScale(
        sequence.state.phase === 'sustain' ? 1 : next.transitionSpeed
      );
      if (starting) input.mixer.update(0);
      report();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      sequence.stop();
      input.mixer.removeEventListener('finished', finished);
      input.mixer.removeEventListener('loop', loop);
      input.mixer.stopAllAction();
      serials.clear();
    },
  };
}
