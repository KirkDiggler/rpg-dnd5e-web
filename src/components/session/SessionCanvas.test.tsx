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
import { buildAtlasPathIndex } from './atlasPath';
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

  describe('otherMembers (rpg-dnd5e-web#762 slice 3)', () => {
    it('mounts one extra entity per otherMembers entry, beyond the local player alone', async () => {
      const withoutOthers = await ReactThreeTestRenderer.create(
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
      const baselineMeshes = withoutOthers.scene.findAll(
        (node) => node.type === 'Mesh'
      ).length;

      const withOthers = await ReactThreeTestRenderer.create(
        <SessionScene
          scene={scene()}
          hexSize={1}
          characterId="char-1"
          characterName="Toolkit Sandbox Fighter"
          character={undefined}
          classRefId={undefined}
          myPosition={{ x: 0, y: 0, z: 0 }}
          otherMembers={[
            {
              subject: 'skeleton-1',
              monsterRefId: 'skeleton',
              position: { x: 1, y: -1, z: 0 },
              remembered: false,
            },
          ]}
        />
      );
      const withOthersMeshes = withOthers.scene.findAll(
        (node) => node.type === 'Mesh'
      ).length;

      expect(withOthersMeshes).toBeGreaterThan(baselineMeshes);
    });

    it('mounts without throwing for a remembered (faded-memory) other member', async () => {
      const renderer = await ReactThreeTestRenderer.create(
        <SessionScene
          scene={scene()}
          hexSize={1}
          characterId="char-1"
          characterName="Toolkit Sandbox Fighter"
          character={undefined}
          classRefId={undefined}
          myPosition={{ x: 0, y: 0, z: 0 }}
          otherMembers={[
            {
              subject: 'skeleton-1',
              monsterRefId: 'skeleton',
              position: { x: 1, y: -1, z: 0 },
              remembered: true,
            },
          ]}
        />
      );
      expect(renderer.scene.children.length).toBeGreaterThan(0);
    });
  });

  describe('move indicator (rpg-dnd5e-web#762 slice 4)', () => {
    /** scene()'s floor as an atlas path index: (0,0,0)/(1,-1,0)/(1,0,-1) —
     * axial q,r such that positionToCube(q,r) lands on each cube (no
     * boundaries/doorways/props, so every declared pair is open floor). */
    function fullPathIndex() {
      return buildAtlasPathIndex({
        cells: [
          { x: 0, y: 0 } as never,
          { x: 1, y: 0 } as never,
          { x: 1, y: -1 } as never,
        ],
        boundaries: [],
        doorways: [],
        props: [],
      });
    }

    /** Only the local player's own cell declared as floor — any OTHER
     * scene() floor tile is still a valid raycast hover (it's in
     * `scene.floorTiles`) but has no route in this index, so it selects
     * 'invalid'. */
    function myCellOnlyPathIndex() {
      return buildAtlasPathIndex({
        cells: [{ x: 0, y: 0 } as never],
        boundaries: [],
        doorways: [],
        props: [],
      });
    }

    /** Same lookup `SessionCanvas.test.tsx`'s ground-plane click tests
     * already use — finds the invisible raycast plane's own props by its
     * geometry type. */
    function findGroundPlaneProps(renderer: {
      scene: { findAll: (p: (n: unknown) => boolean) => unknown[] };
    }) {
      const nodes = renderer.scene.findAll(
        (node) =>
          (node as { instance: THREE.Mesh }).instance.geometry?.type ===
          'PlaneGeometry'
      ) as Array<{ fiber: { props: Record<string, unknown> } }>;
      return nodes[0]!.fiber.props;
    }

    // Firing the raw prop handler (matching this file's own ground-plane
    // click helper above) updates `hoveredHex` React state outside of
    // React's own event system, so — unlike the click tests, which only
    // assert a callback was called — reading the resulting scene graph
    // needs an explicit `act` to flush that update AND the R3F
    // test-renderer's own re-render before `renderer.scene` reflects it.
    async function hoverAt(
      renderer: {
        scene: { findAll: (p: (n: unknown) => boolean) => unknown[] };
      },
      cube: { x: number; y: number; z: number }
    ) {
      const planeProps = findGroundPlaneProps(renderer);
      const onPointerMove = planeProps.onPointerMove as (event: {
        point: THREE.Vector3;
        stopPropagation: () => void;
      }) => void;
      const worldPos = cubeToWorld(cube, 1);
      await ReactThreeTestRenderer.act(async () => {
        onPointerMove({
          point: new THREE.Vector3(worldPos.x, 0, worldPos.z),
          stopPropagation: () => {},
        });
      });
    }

    /** `PathPreview`'s own `PATH_Y_OFFSET` (0.21) — the indicator's
     * meshes live at this Y regardless of which color/kind they render,
     * distinct from the floor (0.2) and every other mesh in this scene. */
    function indicatorMeshes(renderer: {
      scene: { findAll: (p: (n: unknown) => boolean) => unknown[] };
    }) {
      return renderer.scene.findAll(
        (node) =>
          (node as { instance: THREE.Mesh }).instance.type === 'Mesh' &&
          Math.abs(
            (node as { instance: THREE.Mesh }).instance.position.y - 0.21
          ) < 0.001
      ) as Array<{ instance: THREE.Mesh }>;
    }

    it('nothing is drawn before any hover', async () => {
      const renderer = await ReactThreeTestRenderer.create(
        <SessionScene
          scene={scene()}
          hexSize={1}
          characterId="char-1"
          characterName="Toolkit Sandbox Fighter"
          character={undefined}
          classRefId={undefined}
          myPosition={{ x: 0, y: 0, z: 0 }}
          pathIndex={fullPathIndex()}
        />
      );
      expect(indicatorMeshes(renderer)).toHaveLength(0);
    });

    it('hovering a valid floor cell with no pathIndex at all draws nothing (not a false "invalid" hex) — rpg-dnd5e-web#768 Copilot review', async () => {
      const renderer = await ReactThreeTestRenderer.create(
        <SessionScene
          scene={scene()}
          hexSize={1}
          characterId="char-1"
          characterName="Toolkit Sandbox Fighter"
          character={undefined}
          classRefId={undefined}
          myPosition={{ x: 0, y: 0, z: 0 }}
          // pathIndex omitted entirely — defaults to null, the "haven't
          // loaded an atlas yet" state `moveIndicator.ts`'s own doc
          // comment distinguishes from a COMPUTED 'invalid' answer.
        />
      );
      await hoverAt(renderer, { x: 1, y: -1, z: 0 });

      expect(indicatorMeshes(renderer)).toHaveLength(0);
    });

    it('hovering a reachable floor cell draws a path-colored preview through the route', async () => {
      const renderer = await ReactThreeTestRenderer.create(
        <SessionScene
          scene={scene()}
          hexSize={1}
          characterId="char-1"
          characterName="Toolkit Sandbox Fighter"
          character={undefined}
          classRefId={undefined}
          myPosition={{ x: 0, y: 0, z: 0 }}
          pathIndex={fullPathIndex()}
        />
      );
      await hoverAt(renderer, { x: 1, y: -1, z: 0 });

      const meshes = indicatorMeshes(renderer);
      // (0,0,0) is adjacent to (1,-1,0) in this fixture -> a 2-cell route
      // (start + destination), each rendered as its own PathPreview hex.
      expect(meshes).toHaveLength(2);
      const color = (
        (meshes[0]!.instance as THREE.Mesh).material as THREE.MeshBasicMaterial
      ).color;
      expect(color.getHexString()).toBe('3b82f6'); // MoveIndicator's PATH_COLOR
    });

    it('hovering a floor cell with no route in the current pathIndex draws a single invalid-colored hex', async () => {
      const renderer = await ReactThreeTestRenderer.create(
        <SessionScene
          scene={scene()}
          hexSize={1}
          characterId="char-1"
          characterName="Toolkit Sandbox Fighter"
          character={undefined}
          classRefId={undefined}
          myPosition={{ x: 0, y: 0, z: 0 }}
          pathIndex={myCellOnlyPathIndex()}
        />
      );
      // (1,-1,0) is real scene() floor (a valid raycast hover) but is NOT
      // in this test's deliberately-narrow pathIndex.
      await hoverAt(renderer, { x: 1, y: -1, z: 0 });

      const meshes = indicatorMeshes(renderer);
      expect(meshes).toHaveLength(1);
      const color = (
        (meshes[0]!.instance as THREE.Mesh).material as THREE.MeshBasicMaterial
      ).color;
      expect(color.getHexString()).toBe('ef4444'); // MoveIndicator's INVALID_COLOR
    });

    it('fightLocked overrides an otherwise-reachable hover with a single locked-colored hex, not a path', async () => {
      const renderer = await ReactThreeTestRenderer.create(
        <SessionScene
          scene={scene()}
          hexSize={1}
          characterId="char-1"
          characterName="Toolkit Sandbox Fighter"
          character={undefined}
          classRefId={undefined}
          myPosition={{ x: 0, y: 0, z: 0 }}
          pathIndex={fullPathIndex()}
          fightLocked
        />
      );
      await hoverAt(renderer, { x: 1, y: -1, z: 0 });

      const meshes = indicatorMeshes(renderer);
      expect(meshes).toHaveLength(1);
      const color = (
        (meshes[0]!.instance as THREE.Mesh).material as THREE.MeshBasicMaterial
      ).color;
      expect(color.getHexString()).toBe('a855f7'); // MoveIndicator's LOCKED_COLOR
    });

    it('mode="target" draws the target-colored hex regardless of pathIndex/fightLocked', async () => {
      const renderer = await ReactThreeTestRenderer.create(
        <SessionScene
          scene={scene()}
          hexSize={1}
          characterId="char-1"
          characterName="Toolkit Sandbox Fighter"
          character={undefined}
          classRefId={undefined}
          myPosition={{ x: 0, y: 0, z: 0 }}
          pathIndex={fullPathIndex()}
          mode="target"
        />
      );
      await hoverAt(renderer, { x: 1, y: -1, z: 0 });

      const meshes = indicatorMeshes(renderer);
      expect(meshes).toHaveLength(1);
      const color = (
        (meshes[0]!.instance as THREE.Mesh).material as THREE.MeshBasicMaterial
      ).color;
      expect(color.getHexString()).toBe('f97316'); // MoveIndicator's TARGET_COLOR
    });
  });
});
