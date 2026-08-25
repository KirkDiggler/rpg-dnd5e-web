import { useGLTF } from '@react-three/drei';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { facingToYaw } from '../hex-grid/facingYaw';
import { AtlasPropModel } from './AtlasPropModel';
import type { SceneProp3D } from './atlasToScene3D';

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
      offset: { x: 0.2, y: -0.3 },
    });

    expect(meshes(renderer).map((mesh) => mesh.name)).toContain(
      '/models/synty/props/SM_Env_Pillar_Round_01.glb'
    );

    const outer = renderer.scene
      .findAllByType('Group')
      .map((node) => (node as unknown as { instance: THREE.Group }).instance)
      .find((group) => Math.abs(group.position.x) > 0.1);

    expect(outer?.rotation.y).toBeCloseTo(facingToYaw('pointy', 'ne'));
  });

  it('renders the neutral placeholder for an unknown ref', async () => {
    const renderer = await renderAtlasProp({
      ref: 'homebrew:props:unknown',
      position: { x: 0, y: 0, z: 0 },
      facing: '',
      offset: { x: 0, y: 0 },
    });

    expect(
      meshes(renderer).filter(
        (mesh) => mesh.geometry.type === 'CylinderGeometry'
      )
    ).toHaveLength(1);
  });
});
