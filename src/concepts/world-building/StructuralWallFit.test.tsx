import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { attachedDoorVisualPose } from './structuralDoorEditing';
import type { StructuralWallSurface } from './structuralWalls';
import {
  FittedDoorSurface,
  StructuralWallSurfacePieces,
} from './StructuralWallSurfaces';

// Synthetic boxes with dimensions measured from the promoted GLBs, BEFORE
// WorldAssetModel applies its shared 0.75 scale. No licensed mesh data.
// The catalog boundsMeters already include that scale (provider generator:
// world_asset_bounds_meters). Checking parent scale alone missed double scaling.
function box(width: number, height: number, depth: number) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial()
  );
  mesh.position.y = height / 2;
  return mesh;
}
const wallModel = new THREE.Group();
wallModel.add(box(3.715851306915283, 3.0115373134613037, 0.3303843140602112));
const doorModel = new THREE.Group();
const frame = new THREE.Group();
frame.name = 'Door_Frame';
frame.add(box(2.499992609024048, 2.8509929849533364, 0.3516844362020495));
const above = new THREE.Group();
above.name = 'Door_Wall_Above';
above.position.y = 2.8509929849533364;
above.add(box(2.499992609024048, 3.0067358686355874 - 2.8509929849533364, 0.3));
for (const [name, x] of [
  ['Door_Left', -1],
  ['Door_Right', 1],
] as const) {
  const leaf = new THREE.Group();
  leaf.name = name;
  leaf.position.x = x;
  const panel = box(0.98, 2.48, 0.1);
  panel.position.x = x < 0 ? 0.49 : -0.49;
  leaf.add(panel);
  doorModel.add(leaf);
}
doorModel.add(frame, above);
vi.mock('@react-three/drei', () => ({
  useGLTF: (url: string) => ({
    scene: url.includes('wall_door_double_01') ? doorModel : wallModel,
  }),
}));

const wall: StructuralWallSurface = {
  id: 'fit-wall',
  label: 'Fit wall',
  line: { start: { x: 0, z: 0 }, end: { x: 8, z: 0 } },
  appearance: {
    assetRef: 'dnd5e:env:dark-fortress:45_wall_01',
    height: 2,
    thickness: 0.25,
    elevation: 0.2,
  },
  openings: [],
};
function bounds(object: THREE.Object3D) {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object);
}

describe('structural fit uses catalog runtime dimensions exactly once', () => {
  it('fits actual wall vertices to the line, height and thickness without seam overhang', async () => {
    const view = await ReactThreeTestRenderer.create(
      <StructuralWallSurfacePieces wall={wall} />
    );
    const root = view.scene.findByProps({
      name: 'structural-wall-pieces-fit-wall',
    }).instance;
    const measured = bounds(root);
    expect(measured.min.x).toBeCloseTo(0, 5);
    expect(measured.max.x).toBeCloseTo(8, 5);
    expect(measured.getSize(new THREE.Vector3()).y).toBeCloseTo(2, 5);
    expect(measured.getSize(new THREE.Vector3()).z).toBeCloseTo(0.25, 5);
    expect(measured.min.y).toBeCloseTo(DUNGEON_SURFACE_Y + 0.2, 5);
    // Adjacent pieces meet at their actual geometry bounds, not merely at
    // transforms calculated from the same mistaken scale factor.
    const pieces = root.children.map(bounds).sort((a, b) => a.min.x - b.min.x);
    for (let i = 1; i < pieces.length; i++)
      expect(pieces[i].min.x).toBeCloseTo(pieces[i - 1].max.x, 5);
    await view.unmount();
  });

  it('fits the closed door assembly to the opening without scaling its floor lift twice', async () => {
    const opening = {
      id: 'gap',
      position: 4,
      width: 2,
      door: {
        id: 'door',
        assetRef: 'dnd5e:env:dark-fortress:wall_door_double_01',
      },
    };
    const wallWithOpening = { ...wall, openings: [opening] };
    const view = await ReactThreeTestRenderer.create(
      <FittedDoorSurface
        doorId={opening.door.id}
        assetRef={opening.door.assetRef}
        pose={attachedDoorVisualPose({
          wall: wallWithOpening,
          openingId: opening.id,
        })}
        state="closed"
      />
    );
    const measured = bounds(
      view.scene.findByProps({ name: 'structural-wall-door-door' }).instance
    );
    const size = measured.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(2, 5);
    expect(size.y).toBeCloseTo(2, 5);
    expect(size.z).toBeCloseTo(0.25, 5);
    expect(measured.getCenter(new THREE.Vector3()).x).toBeCloseTo(4, 5);
    expect(measured.min.y).toBeCloseTo(DUNGEON_SURFACE_Y + 0.2, 5);
    await view.unmount();
  });
});
