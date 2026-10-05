import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { FittedDoorSurface } from './StructuralWallSurfaces';
import { StructuralWallVisual } from './StructuralWallVisual';
import type { StructuralWall } from './structuralWalls';

const modelState = vi.hoisted(() => ({
  mode: 'loaded' as 'loaded' | 'pending',
  pending: new Promise<never>(() => {}),
}));

const loadedScene = new THREE.Group();
loadedScene.add(
  new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial()
  )
);
// Named door role nodes so the shared leaf can resolve frame/leaf/above and
// expose an actual swing. The wall asset declares no roles, so these are inert
// for the repeated wall pieces.
for (const name of [
  'Door_Frame',
  'Door_Left',
  'Door_Right',
  'Door_Wall_Above',
]) {
  const node = new THREE.Group();
  node.name = name;
  const isLeaf = name === 'Door_Left' || name === 'Door_Right';
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(isLeaf ? 0.98 : 1, isLeaf ? 2.5 : 1, 0.1),
    new THREE.MeshStandardMaterial()
  );
  if (isLeaf) {
    // An upright side-hinged panel, not an axis-ambiguous square at its center.
    node.position.x = name === 'Door_Left' ? -0.5 : 0.5;
    mesh.position.set(name === 'Door_Left' ? 0.49 : -0.49, 1.25, 0);
  }
  node.add(mesh);
  loadedScene.add(node);
}

vi.mock('@react-three/drei', () => ({
  useGLTF: () => {
    if (modelState.mode === 'pending') throw modelState.pending;
    return { scene: loadedScene };
  },
}));

const WALL_ASSET = 'dnd5e:env:dark-fortress:45_wall_01';
const DOOR_ASSET = 'dnd5e:env:dark-fortress:wall_door_double_01';
const DOOR_BOUNDS_METERS = [
  1.8749944567680359, 2.2550519014766905, 0.2637633271515371,
] as const;
// Provider-measured asset height, metres (generated catalog, 45_wall_01).
const ASSET_HEIGHT_M = 2.258652985095978;

function wall(overrides: Partial<StructuralWall> = {}): StructuralWall {
  return {
    id: 'wall-1',
    label: 'North wall',
    line: { start: { x: 0, z: 0 }, end: { x: 10, z: 0 } },
    openings: [{ id: 'opening-1', position: 7, width: 2 }],
    appearance: {
      assetRef: WALL_ASSET,
      height: 3,
      thickness: 0.3,
      elevation: 0.1,
    },
    blocker: {
      footprint: { width: 12, depth: 0.4, offsetX: 1, offsetZ: 0 },
      blocksMovement: false,
      blocksLineOfSight: true,
    },
    ...overrides,
  };
}

describe('StructuralWallVisual', () => {
  it('repeats real pieces across the cut spans and skips the opening interval', async () => {
    modelState.mode = 'loaded';
    const renderer = await ReactThreeTestRenderer.create(
      <StructuralWallVisual
        walls={[wall()]}
        selectedWallId={null}
        selectable={false}
      />
    );
    // Catalog runtime width is 2.786; span [0,6] fits two pieces.
    expect(
      renderer.scene.findAllByProps({
        name: 'structural-wall-piece-wall-1-0-0',
      })
    ).toHaveLength(1);
    expect(
      renderer.scene.findAllByProps({
        name: 'structural-wall-piece-wall-1-0-1',
      })
    ).toHaveLength(1);
    // Span [8,10] fits one piece centred at x=9; no second piece there.
    const spanTwo = renderer.scene.findByProps({
      name: 'structural-wall-piece-wall-1-1-0',
    });
    expect(spanTwo.props.position[0]).toBeCloseTo(9);
    expect(
      renderer.scene.findAllByProps({
        name: 'structural-wall-piece-wall-1-1-1',
      })
    ).toHaveLength(0);
  });

  it('owns the full exact height fit on the parent, unbounded by the prop clamp', async () => {
    modelState.mode = 'loaded';
    const expected = (height: number) => height / ASSET_HEIGHT_M;
    const tall = await ReactThreeTestRenderer.create(
      <StructuralWallVisual
        walls={[
          wall({
            appearance: {
              assetRef: WALL_ASSET,
              height: 20,
              thickness: 0.3,
              elevation: 0.1,
            },
          }),
        ]}
        selectedWallId={null}
        selectable={false}
      />
    );
    const tallPiece = tall.scene.findByProps({
      name: 'structural-wall-piece-wall-1-0-0',
    });
    expect(tallPiece.props.scale[1]).toBeCloseTo(expected(20));
    expect(tallPiece.props.scale[1]).toBeGreaterThan(4);
    await tall.unmount();

    const short = await ReactThreeTestRenderer.create(
      <StructuralWallVisual
        walls={[
          wall({
            appearance: {
              assetRef: WALL_ASSET,
              height: 0.1,
              thickness: 0.3,
              elevation: 0.1,
            },
          }),
        ]}
        selectedWallId={null}
        selectable={false}
      />
    );
    const shortPiece = short.scene.findByProps({
      name: 'structural-wall-piece-wall-1-0-0',
    });
    expect(shortPiece.props.scale[1]).toBeCloseTo(expected(0.1));
    expect(shortPiece.props.scale[1]).toBeLessThan(0.25);
  });

  it('adds the floor lift exactly once, at the authored elevation and never scaled', async () => {
    modelState.mode = 'loaded';
    for (const height of [20, 3, 0.1]) {
      const renderer = await ReactThreeTestRenderer.create(
        <StructuralWallVisual
          walls={[
            wall({
              appearance: {
                assetRef: WALL_ASSET,
                height,
                thickness: 0.3,
                elevation: 0.1,
              },
            }),
          ]}
          selectedWallId={null}
          selectable={false}
        />
      );
      const models = renderer.scene.findAllByProps({
        name: 'world-asset-model',
      });
      expect(models.length).toBeGreaterThan(0);
      for (const model of models) {
        // The shared leaf applies its own lift once; the parent adds none.
        expect(model.props.position[1]).toBeCloseTo(DUNGEON_SURFACE_Y);
      }
      const piece = renderer.scene.findByProps({
        name: 'structural-wall-piece-wall-1-0-0',
      });
      const scaleY = piece.props.scale[1] as number;
      const baseY = piece.props.position[1] as number;
      // Net floor lift is exactly DUNGEON_SURFACE_Y, not scaleY * it.
      expect(baseY + scaleY * DUNGEON_SURFACE_Y).toBeCloseTo(
        0.1 + DUNGEON_SURFACE_Y
      );
      await renderer.unmount();
    }
  });

  it('yaws a diagonal run by the shared wall direction convention', async () => {
    modelState.mode = 'loaded';
    const target = wall({
      line: { start: { x: 0, z: 0 }, end: { x: 3, z: 4 } },
      openings: [],
    });
    const renderer = await ReactThreeTestRenderer.create(
      <StructuralWallVisual
        walls={[target]}
        selectedWallId={null}
        selectable={false}
      />
    );
    const piece = renderer.scene.findByProps({
      name: 'structural-wall-piece-wall-1-0-0',
    });
    expect(piece.props.rotation[1]).toBeCloseTo(Math.atan2(-4, 3));
  });

  it('shows a named refusal marker at the wall location instead of allocating past the cap', async () => {
    modelState.mode = 'loaded';
    const target = wall({
      line: { start: { x: 0, z: 0 }, end: { x: 4000, z: 0 } },
      openings: [],
    });
    const renderer = await ReactThreeTestRenderer.create(
      <StructuralWallVisual
        walls={[target]}
        selectedWallId={null}
        selectable={false}
        maxPieces={32}
      />
    );
    const marker = renderer.scene.findByProps({
      name: 'structural-wall-refusal-wall-1',
    });
    expect(marker.props.userData.reason).toMatch(/allocation cap/);
    // Located at the wall midpoint (x=2000), not the world origin.
    expect(marker.props.position[0]).toBeCloseTo(2000);
    expect(
      renderer.scene.findAllByProps({ name: 'world-asset-model' })
    ).toHaveLength(0);
  });

  it('marks an unsupported appearance asset by name at the wall, not as the asset', async () => {
    modelState.mode = 'loaded';
    const target = wall({
      appearance: {
        assetRef: 'dnd5e:props:torture-table',
        height: 3,
        thickness: 0.3,
        elevation: 0,
      },
    });
    const renderer = await ReactThreeTestRenderer.create(
      <StructuralWallVisual
        walls={[target]}
        selectedWallId={null}
        selectable={false}
      />
    );
    const marker = renderer.scene.findByProps({
      name: 'structural-wall-error-wall-1',
    });
    expect(marker.props.userData.reason).toMatch(
      /no repeatable appearance asset/
    );
    expect(marker.props.position[0]).toBeCloseTo(5);
    expect(
      renderer.scene.findAllByProps({ name: 'world-asset-model' })
    ).toHaveLength(0);
  });

  it('renders an explicit non-raycasting loading marker while the asset loads', async () => {
    modelState.mode = 'pending';
    const renderer = await ReactThreeTestRenderer.create(
      <StructuralWallVisual
        walls={[wall()]}
        selectedWallId={null}
        selectable={false}
      />
    );
    const loading = renderer.scene.findByProps({
      name: 'structural-wall-loading-wall-1',
    });
    expect(loading).toBeTruthy();
    // Anchored at the wall midpoint, not the origin.
    expect(loading.props.position[0]).toBeCloseTo(5);
    // The visual traversal disables raycasting on every derived mesh.
    const mesh = loading.instance as THREE.Mesh;
    expect(typeof mesh.raycast).toBe('function');
    expect(
      renderer.scene.findAllByProps({ name: 'world-asset-model' })
    ).toHaveLength(0);
    modelState.mode = 'loaded';
  });

  it('renders an attached door fitted to the opening and wall with one unscaled lift', async () => {
    modelState.mode = 'loaded';
    const target = wall({
      openings: [
        {
          id: 'opening-1',
          position: 7,
          width: 2,
          door: { id: 'door-1', assetRef: DOOR_ASSET },
        },
      ],
    });
    const renderer = await ReactThreeTestRenderer.create(
      <StructuralWallVisual
        walls={[target]}
        selectedWallId={null}
        doorBindings={{ 'door-1': { closed: true } }}
        selectable={false}
      />
    );
    const doorGroup = renderer.scene.findByProps({
      name: 'structural-wall-door-wall-1-opening-1',
    });
    expect(doorGroup).toBeTruthy();
    expect(doorGroup.props.position[0]).toBeCloseTo(7);
    expect(doorGroup.props.userData.open).toBe(false);
    const [widthM, heightM, depthM] = DOOR_BOUNDS_METERS;
    expect(doorGroup.props.scale[0]).toBeCloseTo(2 / widthM);
    expect(doorGroup.props.scale[1]).toBeCloseTo(3 / heightM);
    expect(doorGroup.props.scale[2]).toBeCloseTo(0.3 / depthM);
    // Exactly one unscaled floor lift, at the authored elevation.
    const scaleY = doorGroup.props.scale[1] as number;
    const baseY = doorGroup.props.position[1] as number;
    expect(baseY + scaleY * DUNGEON_SURFACE_Y).toBeCloseTo(
      0.1 + DUNGEON_SURFACE_Y
    );
  });

  it('previews the authored INITIAL state at the shared leaf and never raycasts the door mesh', async () => {
    modelState.mode = 'loaded';
    const target = wall({
      openings: [
        {
          id: 'opening-1',
          position: 7,
          width: 2,
          door: { id: 'door-1', assetRef: DOOR_ASSET },
        },
      ],
    });
    const openRenderer = await ReactThreeTestRenderer.create(
      <StructuralWallVisual
        walls={[target]}
        selectedWallId={null}
        doorBindings={{ 'door-1': {} }}
        selectable={false}
      />
    );
    const closedRenderer = await ReactThreeTestRenderer.create(
      <StructuralWallVisual
        walls={[target]}
        selectedWallId={null}
        doorBindings={{ 'door-1': { closed: true } }}
        selectable={false}
      />
    );
    expect(
      openRenderer.scene.findByProps({
        name: 'structural-wall-door-wall-1-opening-1',
      }).props.userData.open
    ).toBe(true);
    const openDoor = openRenderer.scene.findByProps({
      name: 'structural-wall-door-wall-1-opening-1',
    }).instance as THREE.Object3D;
    const closedDoor = closedRenderer.scene.findByProps({
      name: 'structural-wall-door-wall-1-opening-1',
    }).instance as THREE.Object3D;
    const openLeaf = openDoor.getObjectByName('Door_Left')!;
    const closedLeaf = closedDoor.getObjectByName('Door_Left')!;
    // The authored open state actually reaches the shared leaf's swing.
    expect(openLeaf.rotation.y).not.toBeCloseTo(closedLeaf.rotation.y);

    const meshes: THREE.Mesh[] = [];
    openDoor.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh);
    });
    expect(meshes.length).toBeGreaterThan(0);
    for (const mesh of meshes) {
      expect(mesh.raycast(new THREE.Raycaster(), [])).toBeNull();
    }
  });

  it('names a missing attached-door asset at the opening, not as the wall asset', async () => {
    modelState.mode = 'loaded';
    const target = wall({
      openings: [
        {
          id: 'opening-1',
          position: 7,
          width: 2,
          door: { id: 'door-1', assetRef: 'dnd5e:props:torture-table' },
        },
      ],
    });
    const renderer = await ReactThreeTestRenderer.create(
      <StructuralWallVisual
        walls={[target]}
        selectedWallId={null}
        selectable={false}
      />
    );
    const marker = renderer.scene.findByProps({
      name: 'structural-wall-error-wall-1/opening-1',
    });
    expect(marker.props.userData.reason).toMatch(/no door asset/);
    expect(marker.props.position[0]).toBeCloseTo(7);
  });

  it('runs the caller click exactly when the shared door leaf has one, never otherwise', async () => {
    modelState.mode = 'loaded';
    const target = wall({
      openings: [
        {
          id: 'opening-1',
          position: 7,
          width: 2,
          door: { id: 'door-1', assetRef: DOOR_ASSET },
        },
      ],
    });
    const onClick = vi.fn();
    const clickable = await ReactThreeTestRenderer.create(
      <FittedDoorSurface
        wall={target}
        opening={target.openings[0]!}
        open={false}
        onClick={onClick}
      />
    );
    const clickableLeaf = clickable.scene.findByProps({
      name: 'world-asset-model',
    });
    await clickable.fireEvent(clickableLeaf, 'click', {});
    expect(onClick).toHaveBeenCalledTimes(1);
    await clickable.unmount();

    // The same surface with no caller click renders the rest pose and stays
    // unclickable — an editor preview can never steal a floor gesture.
    const inert = await ReactThreeTestRenderer.create(
      <FittedDoorSurface
        wall={target}
        opening={target.openings[0]!}
        open={false}
      />
    );
    const inertLeaf = inert.scene.findByProps({ name: 'world-asset-model' });
    expect(inertLeaf.props.onClick).toBeUndefined();
  });
});
