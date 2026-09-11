import { useFrame, useThree, type RootState } from '@react-three/fiber';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// Replace asset I/O and drei's lazy root-binding wrapper (which sees different
// Object3D class identities under this test renderer). Keep a real Three mixer
// driven on every R3F frame, just like drei, to test actual pose movement.
const fixture = vi.hoisted(() => ({
  scene: undefined as THREE.Group | undefined,
  animations: [] as THREE.AnimationClip[],
  played: [] as string[],
}));
vi.mock('@react-three/drei', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@react-three/drei')>();
  return {
    ...actual,
    useGLTF: () => fixture,
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
      useEffect(
        () => () => {
          mixer.stopAllAction();
        },
        [mixer]
      );
      return { mixer, actions, names: clips.map((clip) => clip.name) };
    },
  };
});

import { ClassCharacterModel } from './ClassCharacterModel';

let state: RootState;
function CaptureState() {
  state = useThree();
  return null;
}

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial()
  );
  mesh.name = 'MotionTarget';
  fixture.scene = new THREE.Group();
  fixture.scene.add(mesh);
  fixture.played.length = 0;
  fixture.animations = [
    new THREE.AnimationClip('Idle_Relaxed', 1, [
      new THREE.NumberKeyframeTrack('MotionTarget.position[x]', [0, 1], [0, 1]),
    ]),
  ];
});

function view(remembered: boolean) {
  return (
    <>
      <CaptureState />
      <ClassCharacterModel
        url="/models/synty/npcs/bartender-01.glb"
        remembered={remembered}
      />
    </>
  );
}

function motionTarget(
  renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>
): THREE.Object3D {
  return renderer.scene.find(
    (node) => (node.instance as THREE.Object3D).name === 'MotionTarget'
  ).instance as THREE.Object3D;
}

describe('Bard idle/walk playback through ClassCharacterModel', () => {
  it('plays the exact supplied idle clip while stationary and walk clip while moving', async () => {
    fixture.animations = [
      new THREE.AnimationClip('Idle_Relaxed', 1, []),
      new THREE.AnimationClip('Walk_Forward', 1, []),
    ];
    const bard = (isMoving: boolean) => (
      <ClassCharacterModel
        url="/models/synty/characters/race-class/human-bard.glb"
        isMoving={isMoving}
      />
    );

    const renderer = await ReactThreeTestRenderer.create(bard(false));
    expect(fixture.played.at(-1)).toBe('Idle_Relaxed');

    await renderer.update(bard(true));
    expect(fixture.played.at(-1)).toBe('Walk_Forward');
    await renderer.unmount();
  });
});

describe('remembered animated models stay frozen', () => {
  it('does not animate or request another frame when mounted as a memory', async () => {
    const renderer = await ReactThreeTestRenderer.create(view(true));
    const mesh = motionTarget(renderer);
    const start = mesh.position.x;
    const invalidate = vi.spyOn(state, 'invalidate');
    await renderer.advanceFrames(2, 0.15);
    expect(mesh.position.x).toBe(start);
    expect(invalidate).not.toHaveBeenCalled();
    invalidate.mockRestore();
    await renderer.unmount();
  });

  it('freezes the observed pose on becoming remembered, even when other frames run, and resumes when live', async () => {
    const renderer = await ReactThreeTestRenderer.create(view(false));
    await renderer.advanceFrames(2, 0.15);
    const mesh = motionTarget(renderer);
    expect(mesh.position.x).toBeGreaterThan(0);
    await renderer.update(view(true));
    const rememberedX = mesh.position.x;
    const invalidate = vi.spyOn(state, 'invalidate');
    await renderer.advanceFrames(3, 0.1);
    expect(mesh.position.x).toBe(rememberedX);
    expect(invalidate).not.toHaveBeenCalled();
    invalidate.mockRestore();
    await renderer.update(view(false));
    const resumedX = mesh.position.x;
    await renderer.advanceFrames(2, 0.2);
    expect(mesh.position.x).not.toBe(resumedX);
    await renderer.unmount();
  });
});
