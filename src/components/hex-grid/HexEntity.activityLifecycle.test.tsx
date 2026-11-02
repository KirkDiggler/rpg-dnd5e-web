import { NPC_ACTIVITY_PROFILES } from '@/generated/npcAppearanceCatalog';
import type { ActivityCueRequest } from '@/npc-activities/activityTypes';
import { useFrame } from '@react-three/fiber';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { useMemo, useState } from 'react';
import * as THREE from 'three';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { HexEntity } from './HexEntity';

const fixture = vi.hoisted(() => ({
  failBody: false,
  played: [] as string[],
  mixers: [] as THREE.AnimationMixer[],
}));
// Substitute asset I/O and drei's lazy root binding only. The entity, boundary,
// activity model, sequencer and frame-driven native mixer remain real.
vi.mock('@react-three/drei', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@react-three/drei')>();
  const body = new THREE.Group();
  const bodyClips = ['Idle_Relaxed', 'Walk_Forward'].map(
    (name) => new THREE.AnimationClip(name, 1, [])
  );
  const { NPC_ACTIVITY_PROFILES: profiles } =
    await import('@/generated/npcAppearanceCatalog');
  const libraryClips = profiles[0].library.clips.map(
    (name) => new THREE.AnimationClip(name, 1, [])
  );
  return {
    ...actual,
    Html: () => <group name="activity-diagnostic" />,
    useGLTF: (url: string) => {
      if (!url.includes('/activities/') && fixture.failBody)
        throw new Error('fixture body load failure');
      return {
        scene: body,
        animations: url.includes('/activities/') ? libraryClips : bodyClips,
      };
    },
    useAnimations: (clips: THREE.AnimationClip[], root: THREE.Object3D) => {
      const mixer = useMemo(() => {
        const value = new THREE.AnimationMixer(root);
        fixture.mixers.push(value);
        return value;
      }, [root]);
      const actions = useMemo(
        () =>
          Object.fromEntries(
            clips.map((clip) => {
              const action = mixer.clipAction(clip);
              const play = action.play.bind(action);
              action.play = () => {
                fixture.played.push(clip.name);
                return play();
              };
              return [clip.name, action];
            })
          ),
        [clips, mixer]
      );
      useFrame((_state, delta) => mixer.update(delta));
      return { mixer, actions, names: clips.map((clip) => clip.name) };
    },
  };
});

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => vi.restoreAllMocks());
it.each(['enter', 'sustain', 'exit'])(
  'moves immediately from %s without exit or walking and freezes the native mixer',
  async (phase) => {
    fixture.failBody = false;
    fixture.played = [];
    fixture.mixers = [];
    const complete = vi.fn();
    const appearance = NPC_ACTIVITY_PROFILES[0].appearances[0].assetRef;
    const request = {
      id: 'forced-cue',
      activityRef: 'dnd5e:activities:thoughtful',
      cycles: phase === 'exit' ? 1 : 20,
    };
    const model = (moving = false) => (
      <HexEntity
        entityId="npc"
        name="NPC"
        position={{ x: 0, y: 0, z: 0 }}
        hexSize={1}
        type="monster"
        appearanceRef={appearance}
        activityCue={request}
        moveSeq={moving ? 1 : undefined}
        movePath={
          moving
            ? [
                { x: 1, y: -1, z: 0 },
                { x: 1, y: -2, z: 1 },
              ]
            : undefined
        }
        moveForced={moving}
        onMovementPresentationComplete={complete}
      />
    );
    const renderer = await ReactThreeTestRenderer.create(model());
    await renderer.advanceFrames(
      phase === 'enter' ? 2 : phase === 'sustain' ? 10 : 20,
      0.1
    );
    expect(fixture.played.at(-1)).toBe(
      phase === 'enter'
        ? 'Idle_Thoughtful_Enter'
        : phase === 'exit'
          ? 'Idle_Thoughtful_Exit'
          : 'Idle_Thoughtful'
    );
    const playedBefore = [...fixture.played];
    const time = fixture.mixers[0].time;
    const group = renderer.scene.children[0].instance as THREE.Group;
    const start = group.position.clone();
    await renderer.update(model(true));
    await renderer.advanceFrames(1, 0.03);
    expect(group.position.distanceTo(start)).toBeGreaterThan(0);
    expect(fixture.mixers[0].time).toBe(time);
    expect(fixture.played).toEqual(playedBefore);
    await renderer.advanceFrames(1, 0.15);
    await renderer.update(model(true));
    expect(complete).toHaveBeenCalledExactlyOnceWith('npc', 1);
    await renderer.advanceFrames(60, 0.1);
    expect(fixture.played.slice(playedBefore.length)).toEqual(['Idle_Relaxed']);
    await renderer.unmount();
  }
);

const cue = {
  id: 'reply',
  activityRef: 'dnd5e:activities:thoughtful',
  cycles: 2,
};

function Delivery({
  appearanceRef,
  request,
  onConsumed,
}: {
  appearanceRef: string;
  request?: ActivityCueRequest;
  onConsumed: (member: string, id: string) => void;
}) {
  const [consumedId, setConsumedId] = useState<string>();
  return (
    <HexEntity
      entityId="npc"
      name="NPC"
      position={{ x: 0, y: 0, z: 0 }}
      hexSize={1}
      type="monster"
      appearanceRef={appearanceRef}
      activityCue={request?.id === consumedId ? undefined : request}
      onActivityCueConsumed={(member, id) => {
        onConsumed(member, id);
        setConsumedId(id);
      }}
    />
  );
}

it.each([false, true])(
  'retires a cue on a failed body without replay on replacement (late delivery=%s)',
  async (late) => {
    vi.spyOn(console, 'error').mockImplementation(() => {}); // expected asset error, caught by the real boundary
    fixture.failBody = true;
    fixture.played = [];
    const consumed = vi.fn();
    const profile = NPC_ACTIVITY_PROFILES[0];
    const model = (appearance: number, request?: ActivityCueRequest) => (
      <Delivery
        appearanceRef={profile.appearances[appearance].assetRef}
        request={request}
        onConsumed={consumed}
      />
    );
    const renderer = await ReactThreeTestRenderer.create(
      model(0, late ? undefined : cue)
    );
    if (late) await renderer.update(model(0, cue));
    expect(
      renderer.scene.findAll(
        (node) => node.instance.name === 'activity-diagnostic'
      )
    ).toHaveLength(1);
    const callsAfterFailure = consumed.mock.calls.slice();
    fixture.failBody = false;
    await renderer.update(model(1, cue));
    await renderer.advanceFrames(50, 0.1);
    await renderer.unmount();
    expect(callsAfterFailure).toEqual([['npc', 'reply']]);
    expect(fixture.played).toEqual(['Idle_Relaxed']);
  }
);
