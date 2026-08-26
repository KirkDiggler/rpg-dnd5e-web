import { render, screen } from '@testing-library/react';
import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiceMotionPose } from './diceMotionSolver';
import { validDiceRuntimeManifest } from './diceRuntimeTestFixtures';
import type { DiceMaterialTreatment } from './materialFreeCarvedMesh';
import { RuntimeDiceMesh, type RuntimeDiceMeshSource } from './RuntimeDiceMesh';

const mocks = vi.hoisted(() => ({
  frames: [] as Array<(state: { clock: { elapsedTime: number } }) => void>,
  quaternionSets: [] as Array<readonly number[]>,
  positionSets: [] as Array<readonly number[]>,
}));

vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: (state: { clock: { elapsedTime: number } }) => void) =>
    mocks.frames.push(callback),
}));

const TREATMENT: DiceMaterialTreatment = Object.freeze({
  bodyColor: '#112233',
  numeralColor: '#f5eddc',
  roughness: 0.72,
  metalness: 0.08,
});

const POSE: DiceMotionPose = Object.freeze({
  quaternion: Object.freeze([0, 0, 0, 1] as const),
  translation: Object.freeze([0.2, 0.3, -0.1] as const),
  shadow: Object.freeze({
    translation: Object.freeze([0.2, 0, -0.1] as const),
    scale: 0.8,
    opacity: 0.2,
  }),
  observeNow: false,
  exactTargetHeld: false,
  failed: false,
});

function runtimeSource(): RuntimeDiceMeshSource {
  const manifest = validDiceRuntimeManifest();
  const mutablePreset = manifest.presets[0] as unknown as {
    model: {
      bounds: {
        bboxMin: number[];
        bboxMax: number[];
        dimensions: number[];
      };
      meshFacts: { triangles: number };
      geometry: {
        totalTriangles: number;
        bodyTriangleIndices: number[];
        numeralTriangleIndices: number[];
      };
    };
  };
  mutablePreset.model.bounds = {
    bboxMin: [-1, -1, -1],
    bboxMax: [1, 1, 1],
    dimensions: [2, 2, 2],
  };
  mutablePreset.model.meshFacts.triangles = 2;
  mutablePreset.model.geometry.totalTriangles = 2;
  mutablePreset.model.geometry.bodyTriangleIndices = [0];
  mutablePreset.model.geometry.numeralTriangleIndices = [1];
  const preset = mutablePreset as unknown as RuntimeDiceMeshSource['preset'];

  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(
      [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1],
      3
    )
  );
  geometry.setIndex([0, 1, 2, 3, 4, 5]);
  const material = new MeshStandardMaterial({ color: '#778899' });
  const mesh = new Mesh(geometry, material);
  const scene = new Group();
  mesh.name =
    preset.model.selectors.kind === 'single-mesh'
      ? preset.model.selectors.objectNode
      : 'unexpected';
  scene.add(mesh);

  return {
    preset,
    scene,
    binding: Object.freeze({
      objectNode: mesh.name,
      meshDefinition:
        preset.model.selectors.kind === 'single-mesh'
          ? preset.model.selectors.meshDefinition
          : 'unexpected',
      meshDefinitionIndex: 0,
    }),
  };
}

beforeEach(() => {
  mocks.frames = [];
  mocks.quaternionSets = [];
  mocks.positionSets = [];
  Object.defineProperty(HTMLElement.prototype, 'quaternion', {
    configurable: true,
    get() {
      return {
        set: (...values: number[]) => mocks.quaternionSets.push(values),
      };
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'position', {
    configurable: true,
    get() {
      return { set: (...values: number[]) => mocks.positionSets.push(values) };
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scale', {
    configurable: true,
    get() {
      return { setScalar: vi.fn() };
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'opacity', {
    configurable: true,
    get() {
      return 0;
    },
    set() {
      // The shadow material is deliberately not part of this ownership assertion.
    },
  });
});

describe('RuntimeDiceMesh', () => {
  it('prepares independent material-free clones from one immutable provider source', () => {
    const source = runtimeSource();
    const sourceMaterial = (source.scene.children[0] as Mesh)
      .material as MeshStandardMaterial;
    const sourceColor = sourceMaterial.color.getHex();
    const ready = vi.fn();
    const failure = vi.fn();

    const view = render(
      <>
        <RuntimeDiceMesh
          source={source}
          treatment={TREATMENT}
          initialPose={POSE}
          getPose={() => POSE}
          onReady={ready}
          onFailure={failure}
        />
        <RuntimeDiceMesh
          source={source}
          treatment={{ ...TREATMENT, bodyColor: '#334455' }}
          initialPose={POSE}
          getPose={() => POSE}
          onReady={ready}
          onFailure={failure}
        />
      </>
    );

    expect(failure).not.toHaveBeenCalled();
    expect(ready).toHaveBeenCalledTimes(2);
    const first = ready.mock.calls[0][0];
    const second = ready.mock.calls[1][0];
    expect(first.runtimeSourceId).toBe(second.runtimeSourceId);
    expect(first.runtimeCloneId).not.toBe(second.runtimeCloneId);
    expect(sourceMaterial.color.getHex()).toBe(sourceColor);
    expect((source.scene.children[0] as Mesh).material).toBe(sourceMaterial);
    expect(screen.getAllByTestId('runtime-dice-mesh')).toHaveLength(2);

    view.unmount();
    expect(sourceMaterial.color.getHex()).toBe(sourceColor);
  });

  it('applies supplied motion poses to the owned selected group without mutating the provider source', () => {
    const source = runtimeSource();
    const poseValidated = { current: false };
    const applied = vi.fn();

    render(
      <RuntimeDiceMesh
        source={source}
        treatment={TREATMENT}
        initialPose={POSE}
        getPose={() => POSE}
        poseValidated={poseValidated}
        onPoseApplied={applied}
        onFailure={vi.fn()}
      />
    );

    mocks.frames.at(-1)?.({ clock: { elapsedTime: 4.25 } });

    expect(poseValidated.current).toBe(true);
    expect(mocks.quaternionSets.at(-1)).toEqual([...POSE.quaternion]);
    expect(mocks.positionSets).toContainEqual([...POSE.translation]);
    expect(applied).toHaveBeenCalledWith(POSE, 4250);
  });
});
