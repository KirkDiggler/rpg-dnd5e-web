import { StructuralWallVisual } from '@/concepts/world-building/StructuralWallVisual';
import type { StructuralWall } from '@/concepts/world-building/structuralWalls';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { WorldAssetModel } from './WorldAssetModel';

const state = vi.hoisted(() => ({ scene: null as THREE.Group | null }));
vi.mock('@react-three/drei', () => ({
  Html: () => null,
  useGLTF: () => ({ scene: state.scene }),
}));
function fixture(): THREE.Group {
  const root = new THREE.Group(),
    body = new THREE.Mesh(
      new THREE.BoxGeometry(4, 3, 0.4).translate(0, 1.5, 0),
      new THREE.MeshStandardMaterial()
    );
  body.name = 'WallBody_v1';
  root.add(body);
  for (const [name, p] of Object.entries({
    Start: [-2, 0, 0],
    End: [2, 0, 0],
    Front: [0, 0, 0.2],
    Back: [0, 0, -0.2],
    Top: [0, 3, 0],
  })) {
    const node = new THREE.Object3D();
    node.name = `WallFit_v1_${name}`;
    node.position.set(...(p as [number, number, number]));
    root.add(node);
  }
  return root;
}
describe('plain wall fitting through the shared model leaf', () => {
  it('joins terminal pieces through the real wall renderer without changing source geometry', async () => {
    state.scene = fixture();
    const source = state.scene.getObjectByName('WallBody_v1') as THREE.Mesh;
    const wall = (
      id: string,
      start: { x: number; z: number },
      end: { x: number; z: number }
    ): StructuralWall => ({
      id,
      label: id,
      line: { start, end },
      openings: [],
      appearance: {
        assetRef: 'dnd5e:env:fantasy-kingdom:castle_wall_fit_01',
        height: 3,
        thickness: 0.4,
        elevation: 0,
      },
      blocker: {
        blocksMovement: true,
        blocksLineOfSight: true,
        footprint: { width: 8, depth: 0.4, offsetX: 0, offsetZ: 0 },
      },
    });
    const walls = [
      wall('a', { x: -8, z: 0 }, { x: 0, z: 0 }),
      wall('b', { x: 0, z: 0 }, { x: 0, z: 8 }),
    ];
    const before = structuredClone(walls),
      cached = Array.from(source.geometry.attributes.position.array);
    const renderer = await ReactThreeTestRenderer.create(
      <StructuralWallVisual
        walls={walls}
        selectedWallId={null}
        selectable={false}
      />
    );
    const cap = (name: string, endX: number): string[] => {
      const group = renderer.scene.findByProps({ name })
        .instance as THREE.Group;
      group.updateWorldMatrix(true, true);
      const mesh = group.getObjectByName('WallBody_v1') as THREE.Mesh;
      expect(mesh.geometry).not.toBe(source.geometry);
      const values: string[] = [];
      const old = source.geometry.getAttribute('position'),
        next = mesh.geometry.getAttribute('position');
      for (let i = 0; i < old.count; i++)
        if (old.getX(i) === endX) {
          const v = new THREE.Vector3()
            .fromBufferAttribute(next, i)
            .applyMatrix4(mesh.matrixWorld);
          expect(v.x + v.z).toBeCloseTo(0, 5);
          values.push(
            v
              .toArray()
              .map((n) => Number(n.toFixed(5)))
              .join(',')
          );
        }
      return [...new Set(values)].sort();
    };
    expect(cap('structural-wall-piece-a-0-1', 2)).toEqual(
      cap('structural-wall-piece-b-0-0', -2)
    );
    expect(walls).toEqual(before);
    expect(Array.from(source.geometry.attributes.position.array)).toEqual(
      cached
    );
    await renderer.unmount();
  });
  it('uses marker dimensions, keeps stable fit resources and disposes only owned geometry', async () => {
    state.scene = fixture();
    const source = state.scene.getObjectByName('WallBody_v1') as THREE.Mesh;
    const original = Array.from(source.geometry.attributes.position.array),
      sourceDispose = vi.spyOn(source.geometry, 'dispose');
    const props = {
      assetRef: 'dnd5e:env:fantasy-kingdom:castle_wall_fit_01',
      position: [0, 0, 0] as [number, number, number],
    };
    const fit = { width: 3, height: 6, depth: 0.8, end: -1 };
    const renderer = await ReactThreeTestRenderer.create(
      <WorldAssetModel {...props} plainWallFit={fit} />
    );
    const group = renderer.scene.findByProps({ name: 'world-asset-model' })
      .instance as THREE.Group;
    expect(group.scale.x).toBeCloseTo(0.75, 14);
    expect(group.scale.y).toBeCloseTo(2, 14);
    expect(group.scale.z).toBeCloseTo(2, 14);
    expect(group.position.y).toBe(DUNGEON_SURFACE_Y);
    const fitted = group.getObjectByName('WallBody_v1') as THREE.Mesh;
    const geometry = fitted.geometry,
      dispose = vi.spyOn(geometry, 'dispose');
    expect(geometry).not.toBe(source.geometry);
    await renderer.update(
      <WorldAssetModel {...props} plainWallFit={{ ...fit }} />
    );
    expect((group.getObjectByName('WallBody_v1') as THREE.Mesh).geometry).toBe(
      geometry
    );
    expect(dispose).not.toHaveBeenCalled();
    await renderer.update(
      <WorldAssetModel
        {...props}
        plainWallFit={{ width: 3, height: 6, depth: 0.8 }}
      />
    );
    expect(dispose).toHaveBeenCalledTimes(1);
    await renderer.unmount();
    expect(sourceDispose).not.toHaveBeenCalled();
    expect(Array.from(source.geometry.attributes.position.array)).toEqual(
      original
    );
  });
});
