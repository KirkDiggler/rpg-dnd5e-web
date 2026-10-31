import { NPC_ACTIVITY_PROFILES } from '@/generated/npcAppearanceCatalog';
import type { ActivityCueRequest } from '@/npc-activities/activityTypes';
import { useFrame } from '@react-three/fiber';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { useMemo, useState } from 'react';
import * as THREE from 'three';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { HexEntity } from './HexEntity';

const fixture = vi.hoisted(() => ({ failBody: false, played: [] as string[] }));
// Substitute asset I/O and drei's lazy root binding only. The entity, boundary,
// activity model, sequencer and frame-driven native mixer remain real.
vi.mock('@react-three/drei', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@react-three/drei')>();
  const body = new THREE.Group();
  const bodyClips = ['Idle_Relaxed', 'Walk_Forward'].map(
    (name) => new THREE.AnimationClip(name, 1, [])
  );
  const libraryClips = [
    'Idle_Thoughtful_Enter',
    'Idle_Thoughtful',
    'Idle_Thoughtful_Exit',
  ].map((name) => new THREE.AnimationClip(name, 1, []));
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
      const mixer = useMemo(() => new THREE.AnimationMixer(root), [root]);
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
