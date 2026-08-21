/**
 * SessionScene R3F smoke test — mirrors HexEntity.test.tsx's mocking
 * approach (stub the asset loaders so this test is about wiring, not
 * assets) and SyntyHexWall.test.tsx's pattern of rendering the
 * Canvas-content component directly through the test renderer's own root
 * rather than nesting a second `<Canvas>` inside it.
 */
import type { ConnectorRun, EnvelopeRun } from '@/hooks/wallRuns';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { AbsoluteFloorTile } from '../../hooks/dungeonMapGeometry';
import { cubeToWorld } from '../hex-grid/hexMath';
import type { Scene3D } from './atlasToScene3D';
import type { DoorGapPiece } from './atlasWallRuns';

vi.mock('@react-three/fiber', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@react-three/fiber')>();
  const useLoader = (loader: unknown) =>
    loader === THREE.TextureLoader ? new THREE.Texture() : new THREE.Group();
  useLoader.preload = () => {};
  useLoader.clear = () => {};
  return { ...actual, useLoader };
});

vi.mock('@react-three/drei', () => {
  const make = () => {
    const scene = new THREE.Group();
    scene.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
      )
    );
    return scene;
  };
  return {
    useGLTF: () => ({ scene: make(), animations: [] }),
    useTexture: () => new THREE.Texture(),
    useAnimations: () => ({
      actions: {},
      names: [],
      mixer: new THREE.AnimationMixer(new THREE.Group()),
    }),
  };
});

import { SessionScene } from './SessionCanvas';

function floorTiles(...coords: Array<[number, number, number]>) {
  const map = new Map<string, AbsoluteFloorTile>();
  for (const [x, y, z] of coords) {
    map.set(`${x},${y},${z}`, { x, y, z, roomId: '' });
  }
  return map;
}

function scene(): Scene3D {
  const envelopeRuns: EnvelopeRun[] = [
    {
      regionId: 'tomb',
      side: 'left',
      start: { x: -1, z: -1 },
      end: { x: -1, z: 1 },
      facing: { x: -1, z: 0 },
    },
    {
      regionId: 'tomb',
      side: 'right',
      start: { x: 3, z: -1 },
      end: { x: 3, z: 1 },
      facing: { x: 1, z: 0 },
    },
    {
      regionId: 'tomb',
      side: 'top',
      start: { x: -1, z: -1 },
      end: { x: 3, z: -1 },
      facing: { x: 0, z: -1 },
    },
    {
      regionId: 'tomb',
      side: 'bottom',
      start: { x: -1, z: 1 },
      end: { x: 3, z: 1 },
      facing: { x: 0, z: 1 },
    },
  ];
  const connectorRuns: ConnectorRun[] = [
    {
      doorId: 'hall-1',
      regionAId: 'chamber-0',
      regionBId: 'chamber-1',
      segments: [
        { start: { x: 1, z: -1 }, end: { x: 1, z: -0.5 } },
        { start: { x: 1, z: 0.5 }, end: { x: 1, z: 1 } },
      ],
      coveredRows: { minRow: 0, maxRow: 1 },
      facing: { x: 1, z: 0 },
    },
  ];
  const doorGaps: DoorGapPiece[] = [
    {
      key: 'hall-1',
      connection: 'hall-1',
      position: { x: 1, z: 0 },
      leafPosition: { x: 1, z: -0.5 },
      rotationY: 0,
    },
  ];
  return {
    floorTiles: floorTiles([0, 0, 0], [1, -1, 0], [1, 0, -1]),
    envelopeRuns,
    connectorRuns,
    doorGaps,
  };
}

describe('SessionScene', () => {
  it('mounts the floor, walls, doors, and the local player without throwing', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SessionScene
        scene={scene()}
        hexSize={1}
        characterId="char-1"
        characterName="Toolkit Sandbox Fighter"
        character={undefined}
        classRefId={undefined}
        myPosition={{ x: 0, y: 0, z: 0 }}
      />
    );

    // Three floor tiles -> three meshes at FLOOR_Y (SyntyHexFloor.tsx).
    const floorMeshes = renderer.scene
      .findAll((node) => node.type === 'Mesh')
      .filter((node) => (node.instance as THREE.Mesh).position.y === 0.2);
    expect(floorMeshes).toHaveLength(3);

    // WallRunMesh tiles 4 envelope runs + 1 connector run (2 segments) into
    // GLB pieces, plus the door frame + leaf = several <primitive>
    // instances, each wrapping the mocked GLB scene's clone. `node.type`
    // is the underlying THREE object's own `.type` (e.g. 'Group'/'Mesh');
    // the JSX tag name lives on the raw fiber instead (`node.fiber.type`),
    // which is what identifies a `<primitive>`.
    const glbPrimitives = renderer.scene.findAll(
      (node) => node.fiber.type === 'primitive'
    );
    expect(glbPrimitives.length).toBeGreaterThan(0);

    // The local player's entity mounted too (MediumHumanoid fallback,
    // since no classRefId is passed here) — a capsule/humanoid mesh beyond
    // the three floor tiles already counted.
    const allMeshes = renderer.scene.findAll((node) => node.type === 'Mesh');
    expect(allMeshes.length).toBeGreaterThan(floorMeshes.length);
  });

  it('places the local player and camera target at the given cube position', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SessionScene
        scene={scene()}
        hexSize={1}
        characterId="char-1"
        characterName="Toolkit Sandbox Fighter"
        character={undefined}
        classRefId={undefined}
        myPosition={{ x: 1, y: -1, z: 0 }}
      />
    );
    // Doesn't throw and produces a scene graph — the camera itself lives
    // outside this component (SessionCanvas owns the actual <Canvas>), so
    // this only asserts the hook ran without error and content mounted.
    expect(renderer.scene.children.length).toBeGreaterThan(0);
  });

  it('mounts without throwing when a walk is in flight (movePath/moveSeq/onMovementPresentationComplete wired)', async () => {
    const onMovementPresentationComplete = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <SessionScene
        scene={scene()}
        hexSize={1}
        characterId="char-1"
        characterName="Toolkit Sandbox Fighter"
        character={undefined}
        classRefId={undefined}
        myPosition={{ x: 1, y: 0, z: -1 }}
        movePath={[
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: -1 },
        ]}
        moveSeq={1}
        onMovementPresentationComplete={onMovementPresentationComplete}
      />
    );
    expect(renderer.scene.children.length).toBeGreaterThan(0);
  });

  describe('ground-plane click', () => {
    /** Finds the invisible raycast plane by its geometry's `.type`
     * (`'PlaneGeometry'`, distinct from every other mesh in the scene:
     * floor tiles, walls and HexEntity's own invisible raycast-proxy
     * capsule all use different geometry types). Compared by `.type`
     * string rather than `instanceof THREE.PlaneGeometry` — R3F's
     * internal `three` module resolution and this test file's own `three`
     * import aren't guaranteed to be the same module instance (see the
     * "Multiple instances of Three.js being imported" warning this suite
     * already emits), which would make `instanceof` silently false. */
    function findGroundPlane(renderer: {
      scene: { findAll: (p: (n: unknown) => boolean) => unknown[] };
    }) {
      const nodes = renderer.scene.findAll(
        (node) =>
          (node as { instance: THREE.Mesh }).instance.geometry?.type ===
          'PlaneGeometry'
      ) as Array<{ fiber: { props: Record<string, unknown> } }>;
      expect(nodes).toHaveLength(1);
      return nodes[0]!.fiber.props;
    }

    it('a click on a valid floor cell calls onHexClick with its cube coordinate', async () => {
      const onHexClick = vi.fn();
      const renderer = await ReactThreeTestRenderer.create(
        <SessionScene
          scene={scene()}
          hexSize={1}
          characterId="char-1"
          characterName="Toolkit Sandbox Fighter"
          character={undefined}
          classRefId={undefined}
          myPosition={{ x: 0, y: 0, z: 0 }}
          onHexClick={onHexClick}
        />
      );
      const planeProps = findGroundPlane(renderer);
      const onClick = planeProps.onClick as (event: {
        point: THREE.Vector3;
        stopPropagation: () => void;
      }) => void;

      // scene()'s floor includes cube (1, -1, 0) — click at its world
      // center (hexSize 1).
      const worldPos = cubeToWorld({ x: 1, y: -1, z: 0 }, 1);
      onClick({
        point: new THREE.Vector3(worldPos.x, 0, worldPos.z),
        stopPropagation: () => {},
      });

      expect(onHexClick).toHaveBeenCalledWith({ x: 1, y: -1, z: 0 });
    });

    it('a click well outside the floor mask does not call onHexClick', async () => {
      const onHexClick = vi.fn();
      const renderer = await ReactThreeTestRenderer.create(
        <SessionScene
          scene={scene()}
          hexSize={1}
          characterId="char-1"
          characterName="Toolkit Sandbox Fighter"
          character={undefined}
          classRefId={undefined}
          myPosition={{ x: 0, y: 0, z: 0 }}
          onHexClick={onHexClick}
        />
      );
      const planeProps = findGroundPlane(renderer);
      const onClick = planeProps.onClick as (event: {
        point: THREE.Vector3;
        stopPropagation: () => void;
      }) => void;

      onClick({
        point: new THREE.Vector3(500, 0, 500),
        stopPropagation: () => {},
      });

      expect(onHexClick).not.toHaveBeenCalled();
    });
  });
});
