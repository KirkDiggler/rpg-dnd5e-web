import type { CompositionReader } from '@/compositions/compositionJsonAdapter';
import type { CompositionSource } from '@/compositions/compositionSource';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import { useGLTF } from '@react-three/drei';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { facingToYaw } from '../hex-grid/facingYaw';
import { AtlasPropModel } from './AtlasPropModel';
import type { SceneProp3D } from './atlasToScene3D';

vi.mock('@/compositions/CompositionPlacementModel', () => ({
  CompositionPlacementModel: ({
    compositionId,
    instanceId,
    transform,
    source,
  }: {
    compositionId: string;
    instanceId: string;
    transform: { x: number; y: number; z: number; rotationY: number };
    source?: CompositionSource;
  }) => (
    <group
      name="resolved-composition-placement"
      userData={{ compositionId, instanceId, transform, source }}
    />
  ),
}));

vi.mock('@react-three/drei', () => ({
  useGLTF: (url: string) => {
    const scene = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial()
    );
    mesh.name = url;
    scene.add(mesh);
    return { scene };
  },
}));

void useGLTF;

async function renderAtlasProp(prop: SceneProp3D) {
  return ReactThreeTestRenderer.create(
    <AtlasPropModel prop={prop} hexSize={1} orientation="pointy" />
  );
}

function meshes(renderer: Awaited<ReturnType<typeof renderAtlasProp>>) {
  return renderer.scene
    .findAllByType('Mesh')
    .map((node) => (node as unknown as { instance: THREE.Mesh }).instance);
}

describe('AtlasPropModel', () => {
  it('resolves a known ref and applies authored position/facing through PropModel', async () => {
    const renderer = await renderAtlasProp({
      ref: 'dnd5e:props:pillar',
      position: { x: 1, y: -1, z: 0 },
      facing: 'ne',
      offset: { x: 0.2, y: -0.3, z: 0 },
    });

    const propMesh = meshes(renderer).find(
      (mesh) => mesh.name === '/models/synty/props/SM_Env_Pillar_Round_01.glb'
    );
    expect(propMesh).toBeDefined();

    const outer = propMesh?.parent?.parent as THREE.Group | undefined;
    expect(outer?.position.y).toBeCloseTo(DUNGEON_SURFACE_Y);
    expect(outer?.rotation.y).toBeCloseTo(facingToYaw('ne'));
  });

  it('routes composition refs through the world-scoped resolver with authored identity and transform', async () => {
    const compositionSource: CompositionSource = {
      worldId: 'world-current',
      reader: {} as CompositionReader,
    };
    const renderer = await ReactThreeTestRenderer.create(
      <AtlasPropModel
        prop={{
          ref: 'composition:props:decorated-table',
          id: 'decorated-table-2',
          position: { x: 1, y: -1, z: 0 },
          facing: 'ne',
          offset: { x: 0.2, y: -0.3, z: 0.4 },
        }}
        hexSize={1}
        orientation="pointy"
        compositionSource={compositionSource}
      />
    );

    const placement = renderer.scene.findByProps({
      name: 'resolved-composition-placement',
    });
    expect(placement.props.userData.compositionId).toBe('decorated-table');
    expect(placement.props.userData.instanceId).toBe('decorated-table-2');
    expect(placement.props.userData.source).toBe(compositionSource);
    expect(placement.props.userData.transform.rotationY).toBeCloseTo(
      facingToYaw('ne')
    );
    expect(placement.props.userData.transform.y).toBeCloseTo(0.4);
  });

  it('resolves the generated exact Plushie ref', async () => {
    const renderer = await renderAtlasProp({
      ref: 'dnd5e:props:plushie:skeleton-dog',
      position: { x: 0, y: 0, z: 0 },
      facing: '',
      offset: { x: 0, y: 0, z: 0 },
    });

    expect(
      meshes(renderer).find(
        (mesh) => mesh.name === '/models/synty/props/plushie--skeleton-dog.glb'
      )
    ).toBeDefined();
  });

  it('renders nothing for an unsupported exact prop ref', async () => {
    const renderer = await renderAtlasProp({
      ref: 'dnd5e:props:plushie:unknown',
      position: { x: 0, y: 0, z: 0 },
      facing: '',
      offset: { x: 0, y: 0, z: 0 },
    });

    expect(meshes(renderer)).toHaveLength(0);
  });

  it('renders the neutral placeholder for an unknown legacy ref', async () => {
    const renderer = await renderAtlasProp({
      ref: 'homebrew:props:unknown',
      position: { x: 0, y: 0, z: 0 },
      facing: '',
      offset: { x: 0, y: 0, z: 0 },
    });

    expect(
      meshes(renderer).filter(
        (mesh) => mesh.geometry.type === 'CylinderGeometry'
      )
    ).toHaveLength(1);
  });
});
