/**
 * SessionScene R3F smoke test — mirrors HexEntity.test.tsx's mocking
 * approach (stub the asset loaders so this test is about wiring, not
 * assets) and SyntyHexWall.test.tsx's pattern of rendering the
 * Canvas-content component directly through the test renderer's own root
 * rather than nesting a second `<Canvas>` inside it.
 */
import type { AuthoredWallRun } from '@/hooks/authoredWallRuns';
import type { PublicMemberInfo } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  MemberKind,
  Standing,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AbsoluteFloorTile } from '../../hooks/dungeonMapGeometry';
import { resolveClassCharacterModelUrl } from '../hex-grid/classCharacterModels';
import { facingToYaw } from '../hex-grid/facingYaw';
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

const gltfMockState = vi.hoisted(() => ({
  failedUrls: new Set<string>(),
  pendingUrls: new Set<string>(),
  pending: new Promise<never>(() => undefined),
}));

afterEach(() => {
  gltfMockState.failedUrls.clear();
  gltfMockState.pendingUrls.clear();
});

vi.mock('@react-three/drei', () => {
  const make = (name = '') => {
    const scene = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    mesh.name = name;
    scene.add(mesh);
    return scene;
  };
  return {
    useGLTF: (url: string) => {
      if (gltfMockState.failedUrls.has(url)) {
        throw new Error(`failed to load ${url}`);
      }
      if (gltfMockState.pendingUrls.has(url)) throw gltfMockState.pending;
      return { scene: make(url), animations: [] };
    },
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
  // Four envelope-shaped runs plus the two segments a connector's own
  // door gap would leave (rpg-dnd5e-web#787: envelope and interior seam
  // runs are no longer separate shapes — both are just AuthoredWallRun
  // entries now, see atlasWallRuns.ts's own module doc comment).
  const wallRuns: AuthoredWallRun[] = [
    {
      key: 'left',
      start: { x: -1, z: -1 },
      end: { x: -1, z: 1 },
      facing: { x: -1, z: 0 },
    },
    {
      key: 'right',
      start: { x: 3, z: -1 },
      end: { x: 3, z: 1 },
      facing: { x: 1, z: 0 },
    },
    {
      key: 'top',
      start: { x: -1, z: -1 },
      end: { x: 3, z: -1 },
      facing: { x: 0, z: -1 },
    },
    {
      key: 'bottom',
      start: { x: -1, z: 1 },
      end: { x: 3, z: 1 },
      facing: { x: 0, z: 1 },
    },
    {
      key: 'hall-1-a',
      start: { x: 1, z: -1 },
      end: { x: 1, z: -0.5 },
      facing: { x: 1, z: 0 },
    },
    {
      key: 'hall-1-b',
      start: { x: 1, z: 0.5 },
      end: { x: 1, z: 1 },
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
    props: [],
    wallRuns,
    doorGaps,
  };
}

function renderSession(scene3D = scene()) {
  return ReactThreeTestRenderer.create(
    <SessionScene
      scene={scene3D}
      hexSize={1}
      characterId="char-1"
      characterName="Toolkit Sandbox Fighter"
      character={undefined}
      classRefId={undefined}
      myPosition={{ x: 0, y: 0, z: 0 }}
    />
  );
}

function sceneWithProp(
  ref: string,
  position = { x: 1, y: 0, z: -1 },
  facing = '',
  offset = { x: 0, y: 0 }
) {
  const propScene = scene();
  propScene.props = [{ ref, position, facing, offset }];
  return propScene;
}

function meshInstances(
  renderer: Awaited<ReturnType<typeof renderSession>>
): THREE.Mesh[] {
  return renderer.scene
    .findAllByType('Mesh')
    .map((node) => (node as unknown as { instance: THREE.Mesh }).instance);
}

function expectOneVisiblePlaceholder(
  renderer: Awaited<ReturnType<typeof renderSession>>,
  baseMeshCount: number
) {
  const meshes = meshInstances(renderer);
  expect(meshes).toHaveLength(baseMeshCount + 1);
  const expected = cubeToWorld({ x: 1, y: 0, z: -1 }, 1);
  expect(
    meshes.some(
      (mesh) =>
        mesh.position.x === expected.x &&
        mesh.position.y > 0.2 &&
        mesh.position.z === expected.z
    )
  ).toBe(true);
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

    // WallRunMesh tiles 6 authored wall runs into GLB pieces, plus the
    // door frame + leaf = several <primitive> instances, each wrapping the
    // mocked GLB scene's clone. `node.type` is the underlying THREE
    // object's own `.type` (e.g. 'Group'/'Mesh'); the JSX tag name lives
    // on the raw fiber instead (`node.fiber.type`), which is what
    // identifies a `<primitive>`.
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

  it('renders a known AtlasProp model at the prop cell', async () => {
    const position = { x: 1, y: -1, z: 0 };
    const renderer = await renderSession(
      sceneWithProp('dnd5e:props:pillar', position)
    );

    expect(meshInstances(renderer).map((mesh) => mesh.name)).toContain(
      '/models/synty/props/SM_Env_Pillar_Round_01.glb'
    );

    const expected = cubeToWorld(position, 1);
    const propGroup = renderer.scene
      .findAllByType('Group')
      .map((node) => (node as unknown as { instance: THREE.Group }).instance)
      .find(
        (group) =>
          group.position.x === expected.x && group.position.z === expected.z
      );
    expect(propGroup?.position.toArray()).toEqual([expected.x, 0, expected.z]);
  });

  it('an authored offset/facing reaches the rendered PropModel (rpg-project#261, Copilot review PR #795: the JSX wiring, not just propWorldPosition/facingToYaw in isolation)', async () => {
    const position = { x: 1, y: -1, z: 0 };
    const renderer = await renderSession(
      sceneWithProp('dnd5e:props:pillar', position, 'ne', { x: 0.2, y: -0.3 })
    );

    const cellCenter = cubeToWorld(position, 1);
    const expectedX = cellCenter.x + 0.2 * 1;
    const expectedZ = cellCenter.z + -0.3 * 1;
    const expectedYaw = facingToYaw('pointy', 'ne');

    const propGroup = renderer.scene
      .findAllByType('Group')
      .map((node) => (node as unknown as { instance: THREE.Group }).instance)
      .find((group) => Math.abs(group.position.x - expectedX) < 1e-9);

    expect(propGroup?.position.x).toBeCloseTo(expectedX, 9);
    expect(propGroup?.position.z).toBeCloseTo(expectedZ, 9);
    expect(propGroup?.rotation.y).toBeCloseTo(expectedYaw, 9);
  });

  it('renders a visible placeholder at the cell when an AtlasProp ref is unknown', async () => {
    const baseMeshCount = meshInstances(await renderSession()).length;
    const renderer = await renderSession(
      sceneWithProp('homebrew:props:unknown')
    );

    expectOneVisiblePlaceholder(renderer, baseMeshCount);
  });

  it('keeps a placeholder visible when a mapped AtlasProp model fails to load', async () => {
    const baseMeshCount = meshInstances(await renderSession()).length;
    gltfMockState.failedUrls.add(
      '/models/synty/props/SM_Env_Pillar_Round_01.glb'
    );
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const outcome = await renderSession(
      sceneWithProp('dnd5e:props:pillar')
    ).then(
      (renderer) => ({ renderer }),
      (error: unknown) => ({ error })
    );
    consoleError.mockRestore();

    expect(outcome).toHaveProperty('renderer');
    if ('renderer' in outcome) {
      expectOneVisiblePlaceholder(outcome.renderer, baseMeshCount);
    }
  });

  it('keeps a placeholder visible while a mapped AtlasProp model is loading', async () => {
    const baseMeshCount = meshInstances(await renderSession()).length;
    gltfMockState.pendingUrls.add(
      '/models/synty/props/SM_Env_Pillar_Round_01.glb'
    );
    const renderer = await renderSession(sceneWithProp('dnd5e:props:pillar'));

    expectOneVisiblePlaceholder(renderer, baseMeshCount);
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

  describe('roster identity (rpg-project#264, rpg-dnd5e-web#806)', () => {
    const sightedPlayer = {
      subject: 'char-bob',
      name: 'Bob',
      monsterRefId: undefined,
      kind: MemberKind.PLAYER,
      position: { x: 1, y: -1, z: 0 },
      remembered: false,
      standing: Standing.UP,
    };

    it('a PLAYER-kind member with a roster entry mounts their CLASS GLB, not the neutral placeholder', async () => {
      const renderer = await ReactThreeTestRenderer.create(
        <SessionScene
          scene={scene()}
          hexSize={1}
          characterId="char-1"
          characterName="Toolkit Sandbox Fighter"
          character={undefined}
          classRefId={undefined}
          myPosition={{ x: 0, y: 0, z: 0 }}
          otherMembers={[sightedPlayer]}
          roster={
            new Map([
              [
                'char-bob',
                {
                  id: 'char-bob',
                  kind: MemberKind.PLAYER,
                  name: 'Bob',
                  classRef: 'fighter',
                  raceRef: 'human',
                  monsterRef: '',
                } as PublicMemberInfo,
              ],
            ])
          }
        />
      );
      // Mocked useGLTF names its mesh after the resolved URL — the fighter
      // class GLB path appears only when the class model actually mounted.
      const expectedUrl = resolveClassCharacterModelUrl('fighter', false);
      expect(expectedUrl).toBeTruthy();
      const classMeshes = renderer.scene.findAll(
        (node) =>
          node.type === 'Mesh' &&
          (node.instance as THREE.Mesh).name.includes(expectedUrl as string)
      );
      expect(classMeshes.length).toBeGreaterThan(0);
    });

    it('a PLAYER-kind member with NO roster entry keeps the neutral placeholder — a missing row degrades, never blocks', async () => {
      const renderer = await ReactThreeTestRenderer.create(
        <SessionScene
          scene={scene()}
          hexSize={1}
          characterId="char-1"
          characterName="Toolkit Sandbox Fighter"
          character={undefined}
          classRefId={undefined}
          myPosition={{ x: 0, y: 0, z: 0 }}
          otherMembers={[sightedPlayer]}
          roster={new Map()}
        />
      );
      const expectedUrl = resolveClassCharacterModelUrl('fighter', false);
      const classMeshes = renderer.scene.findAll(
        (node) =>
          node.type === 'Mesh' &&
          (node.instance as THREE.Mesh).name.includes(expectedUrl as string)
      );
      expect(classMeshes).toHaveLength(0);
      expect(renderer.scene.children.length).toBeGreaterThan(0);
    });

    it("a MONSTER-kind member's model resolves from the roster's authored ref — no subject-derived monsterRefId needed", async () => {
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
              subject: 'bag-of-bones-7',
              name: 'Skeleton',
              // Deliberately NO derived ref: the roster's authored ref is
              // the primary source now (rpg-project#264); derivation
              // survives only as the missing-entry fallback.
              monsterRefId: undefined,
              kind: MemberKind.MONSTER,
              position: { x: 1, y: -1, z: 0 },
              remembered: false,
              standing: Standing.UP,
            },
          ]}
          roster={
            new Map([
              [
                'bag-of-bones-7',
                {
                  id: 'bag-of-bones-7',
                  kind: MemberKind.MONSTER,
                  name: 'Skeleton',
                  classRef: '',
                  raceRef: '',
                  monsterRef: 'dnd5e:monsters:skeleton',
                } as PublicMemberInfo,
              ],
            ])
          }
        />
      );
      const skeletonMeshes = renderer.scene.findAll(
        (node) =>
          node.type === 'Mesh' &&
          (node.instance as THREE.Mesh).name.includes('skeleton')
      );
      expect(skeletonMeshes.length).toBeGreaterThan(0);
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
              name: 'skeleton-1',
              monsterRefId: 'skeleton',
              kind: MemberKind.MONSTER,
              position: { x: 1, y: -1, z: 0 },
              remembered: false,
              standing: Standing.UP,
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
              name: 'skeleton-1',
              monsterRefId: 'skeleton',
              kind: MemberKind.MONSTER,
              position: { x: 1, y: -1, z: 0 },
              remembered: true,
              standing: Standing.UP,
            },
          ]}
        />
      );
      expect(renderer.scene.children.length).toBeGreaterThan(0);
    });

    it('mounts without throwing for a downed other member (Standing.DOWNED)', async () => {
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
              name: 'skeleton-1',
              monsterRefId: 'skeleton',
              kind: MemberKind.MONSTER,
              position: { x: 1, y: -1, z: 0 },
              remembered: false,
              standing: Standing.DOWNED,
            },
          ]}
        />
      );
      expect(renderer.scene.children.length).toBeGreaterThan(0);
    });

    it('a MONSTER-kind member renders via the monster path -- its resolved npc GLB mounts', async () => {
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
              name: 'skeleton-1',
              monsterRefId: 'skeleton',
              kind: MemberKind.MONSTER,
              position: { x: 1, y: -1, z: 0 },
              remembered: false,
              standing: Standing.UP,
            },
          ]}
        />
      );
      // The mocked useGLTF (top of file) names its mesh after the resolved
      // URL -- resolveMonsterModelUrl('skeleton', ...) resolves a real npc
      // GLB under monsterModels.ts's own MONSTER_MODEL_BASE, so its path
      // shows up somewhere in the tree only when ClassCharacterModel
      // actually mounted it.
      const monsterGlbMeshes = renderer.scene.findAll(
        (node) =>
          node.type === 'Mesh' &&
          (node.instance as THREE.Mesh).name.includes(
            '/models/synty/npcs/skeleton'
          )
      );
      expect(monsterGlbMeshes.length).toBeGreaterThan(0);
    });

    it('a PLAYER-kind member renders via the player path -- no monster ref is derived, and no monster GLB mounts', async () => {
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
              // A player subject id looks nothing like a monster ref --
              // sightingEntities.ts already leaves monsterRefId undefined
              // for PLAYER kind, so this member carries none, unlike every
              // other case in this describe block.
              subject: 'char-2',
              name: 'Second Barbarian',
              monsterRefId: undefined,
              kind: MemberKind.PLAYER,
              position: { x: 1, y: -1, z: 0 },
              remembered: false,
              standing: Standing.UP,
            },
          ]}
        />
      );
      // No classRefId/character is known for a sighted player (rpg-api#814:
      // GetCharacterData is owner-gated), so the player path's own class-GLB
      // resolution falls through to undefined and this entity mounts the
      // MediumHumanoid placeholder instead. Scoped to the npc GLB base path
      // (monsterModels.ts's MONSTER_MODEL_BASE) rather than "any named
      // mesh" -- the floor/walls in `scene()` mount their own real GLBs via
      // this same useGLTF mock, so a blanket non-empty-name check would
      // false-fail on those, unrelated to this entity's own render path.
      const monsterGlbMeshes = renderer.scene.findAll(
        (node) =>
          node.type === 'Mesh' &&
          (node.instance as THREE.Mesh).name.includes('/models/synty/npcs/')
      );
      expect(monsterGlbMeshes).toHaveLength(0);
      // Still mounts something -- the neutral fallback, not a blank void.
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

    it('turnLocked overrides an otherwise-reachable hover with a single locked-colored hex, not a path', async () => {
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
          turnLocked
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

    it('hovering an attackable entity draws the target-colored hex regardless of pathIndex/turnLocked (rpg-project#249: Attack is a hover state, not a mode)', async () => {
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
          otherMembers={[
            {
              subject: 'skeleton-1',
              name: 'skeleton-1',
              monsterRefId: 'skeleton',
              kind: MemberKind.MONSTER,
              position: { x: 1, y: -1, z: 0 },
              remembered: false,
              standing: Standing.UP,
            },
          ]}
          attackableTargets={['skeleton-1']}
        />
      );
      await hoverAt(renderer, { x: 1, y: -1, z: 0 });

      // TWO meshes at the indicator's own Y offset now: the persistent,
      // quiet in-reach ring (SessionScene's own ATTACKABLE_RING_OPACITY)
      // PLUS MoveIndicator's own brighter 'target' ring for the specific
      // hovered entity — Kirk's own ruling: "hover state can add a
      // little more" on top of an always-visible passive ring, not a
      // single mesh that only exists on hover.
      const meshes = indicatorMeshes(renderer);
      expect(meshes).toHaveLength(2);
      const materials = meshes.map(
        (m) => (m.instance as THREE.Mesh).material as THREE.MeshBasicMaterial
      );
      expect(
        materials.every((mat) => mat.color.getHexString() === 'f97316')
      ).toBe(true); // both share MoveIndicator's own TARGET_COLOR hue
      const opacities = materials
        .map((mat) => mat.opacity)
        .sort((a, b) => a - b);
      expect(opacities[0]).toBeLessThan(opacities[1]!); // quiet ring, then the brighter hover ring
    });

    it('an attackable target draws its own quiet ring even when nothing is hovered at all (the passive, persistent state)', async () => {
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
          otherMembers={[
            {
              subject: 'skeleton-1',
              name: 'skeleton-1',
              monsterRefId: 'skeleton',
              kind: MemberKind.MONSTER,
              position: { x: 1, y: -1, z: 0 },
              remembered: false,
              standing: Standing.UP,
            },
          ]}
          attackableTargets={['skeleton-1']}
        />
      );
      // No hover at all -- indicatorMeshes still finds the passive ring.
      const meshes = indicatorMeshes(renderer);
      expect(meshes).toHaveLength(1);
      const material = (meshes[0]!.instance as THREE.Mesh)
        .material as THREE.MeshBasicMaterial;
      expect(material.color.getHexString()).toBe('f97316');
      expect(material.opacity).toBeLessThan(0.3); // quiet, not an emissive wash
    });

    it('a remembered (faded-memory) entity never draws an attackable ring, even if listed in attackableTargets', async () => {
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
          otherMembers={[
            {
              subject: 'skeleton-1',
              name: 'skeleton-1',
              monsterRefId: 'skeleton',
              kind: MemberKind.MONSTER,
              position: { x: 1, y: -1, z: 0 },
              remembered: true,
              standing: Standing.UP,
            },
          ]}
          attackableTargets={['skeleton-1']}
        />
      );
      expect(indicatorMeshes(renderer)).toHaveLength(0);
    });

    it('hovering an entity that is present but NOT in attackableTargets falls through to the ordinary walk preview', async () => {
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
          otherMembers={[
            {
              subject: 'skeleton-1',
              name: 'skeleton-1',
              monsterRefId: 'skeleton',
              kind: MemberKind.MONSTER,
              position: { x: 1, y: -1, z: 0 },
              remembered: false,
              standing: Standing.UP,
            },
          ]}
        />
      );
      await hoverAt(renderer, { x: 1, y: -1, z: 0 });

      const color = (
        (indicatorMeshes(renderer)[0]!.instance as THREE.Mesh)
          .material as THREE.MeshBasicMaterial
      ).color;
      expect(color.getHexString()).toBe('3b82f6'); // PATH_COLOR, not TARGET_COLOR
    });

    it('a stale mesh-hover on a target that\'s no longer offered (fight ended, otherMembers dropped attackableTargets) never pins the indicator to that entity\'s OLD cell -- a later floor hover elsewhere draws normally (rpg-project#251 web#771: caught live as "the path looks like it continues from the downed skeleton")', async () => {
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
          otherMembers={[
            {
              subject: 'skeleton-1',
              name: 'skeleton-1',
              monsterRefId: 'skeleton',
              kind: MemberKind.MONSTER,
              position: { x: 1, y: -1, z: 0 },
              remembered: false,
              standing: Standing.UP,
            },
          ]}
          attackableTargets={['skeleton-1']}
        />
      );

      // Hover the entity's OWN mesh (not the floor beside it) -- sets
      // `meshHoveredSubject`, same trigger `onHoverEntity`'s own "over the
      // model" test above uses.
      const overNodes = renderer.scene.findAll(
        (node) =>
          typeof (node as { props: Record<string, unknown> }).props
            ?.onPointerOver === 'function'
      ) as Array<{ props: Record<string, unknown> }>;
      expect(overNodes.length).toBeGreaterThan(0);
      await ReactThreeTestRenderer.act(async () => {
        for (const node of overNodes) {
          (
            node.props.onPointerOver as (e: {
              stopPropagation: () => void;
            }) => void
          )({ stopPropagation: () => {} });
        }
      });

      // Fight ends: the caller drops attackableTargets to undefined (free
      // roam) -- deliberately WITHOUT ever firing onPointerOut first,
      // reproducing the live gap (the downed pose's geometry doesn't
      // overlap the standing pose's, so pointer-out never re-fires
      // naturally either).
      await renderer.update(
        <SessionScene
          scene={scene()}
          hexSize={1}
          characterId="char-1"
          characterName="Toolkit Sandbox Fighter"
          character={undefined}
          classRefId={undefined}
          myPosition={{ x: 0, y: 0, z: 0 }}
          pathIndex={fullPathIndex()}
          otherMembers={[
            {
              subject: 'skeleton-1',
              name: 'skeleton-1',
              monsterRefId: 'skeleton',
              kind: MemberKind.MONSTER,
              position: { x: 1, y: -1, z: 0 },
              remembered: false,
              standing: Standing.DOWNED,
            },
          ]}
        />
      );

      // A later floor hover, on a DIFFERENT reachable cell than the
      // downed skeleton's own -- both are one step from the player, so
      // EITHER destination draws a legitimate 2-mesh path (start +
      // destination, same as the plain "reachable floor cell" test
      // above); the mesh COUNT alone can't distinguish correct from
      // stuck, only the destination's actual world position can.
      await hoverAt(renderer, { x: 1, y: 0, z: -1 });

      const meshes = indicatorMeshes(renderer);
      expect(meshes).toHaveLength(2);
      const colors = meshes.map(
        (m) =>
          ((m.instance as THREE.Mesh).material as THREE.MeshBasicMaterial).color
      );
      expect(colors.every((c) => c.getHexString() === '3b82f6')).toBe(true); // PATH_COLOR throughout, never TARGET/INVALID

      const newHoverWorld = cubeToWorld({ x: 1, y: 0, z: -1 }, 1);
      const staleEntityWorld = cubeToWorld({ x: 1, y: -1, z: 0 }, 1);
      const positions = meshes.map((m) => (m.instance as THREE.Mesh).position);
      const closeTo = (
        a: { x: number; z: number },
        b: { x: number; z: number }
      ) => Math.abs(a.x - b.x) < 0.001 && Math.abs(a.z - b.z) < 0.001;
      // The path's destination is the NEW hovered cell...
      expect(positions.some((p) => closeTo(p, newHoverWorld))).toBe(true);
      // ...and NEVER the stale mesh-hovered entity's own cell -- the bug,
      // unfixed, pins the whole path to that cell regardless of where
      // the floor is actually hovered next.
      expect(positions.some((p) => closeTo(p, staleEntityWorld))).toBe(false);
    });
  });

  describe('click routing: attack vs walk (rpg-project#249)', () => {
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

    function clickAt(
      props: Record<string, unknown>,
      cube: { x: number; y: number; z: number }
    ) {
      const onClick = props.onClick as (event: {
        point: THREE.Vector3;
        stopPropagation: () => void;
      }) => void;
      const worldPos = cubeToWorld(cube, 1);
      onClick({
        point: new THREE.Vector3(worldPos.x, 0, worldPos.z),
        stopPropagation: () => {},
      });
    }

    const oneMember = [
      {
        subject: 'skeleton-1',
        name: 'skeleton-1',
        monsterRefId: 'skeleton',
        kind: MemberKind.MONSTER,
        position: { x: 1, y: -1, z: 0 },
        remembered: false,
        standing: Standing.UP,
      },
    ];

    /** Finds a node with its OWN `onClick` handler that is NOT the ground
     * plane (`PlaneGeometry`) — i.e. the entity's own model wrapper,
     * exactly the node whose click a raycast actually hits first when the
     * cursor is over the model (rpg-project#249, Kirk's own live-walk
     * finding: clicking the skeleton itself did nothing; only a click on
     * the floor cell under/near it worked, because `HexEntity`'s own
     * `handleClick` unconditionally stops propagation and, before this
     * fix, `SessionScene` never wired an `onClick` for it to call). */
    /** Every node with its OWN `onClick` handler that is NOT the ground
     * plane (`PlaneGeometry`) — i.e. each entity's own model wrapper,
     * exactly the node whose click a raycast actually hits first when the
     * cursor is over a model (rpg-project#249, Kirk's own live-walk
     * finding: clicking the skeleton itself did nothing; only a click on
     * the floor cell under/near it worked, because `HexEntity`'s own
     * `handleClick` unconditionally stops propagation and, before this
     * fix, `SessionScene` never wired an `onClick` for it to call). The
     * local player's OWN `HexEntity` is one of these too (`HexEntity`
     * builds its own `handleClick` regardless of whether an `onClick`
     * prop was ever passed to it — it simply no-ops on the inner call
     * when there's nothing to call) — this fires EVERY match, not just
     * the first, so the assertion is robust to render order rather than
     * assuming which one is the skeleton's. */
    function fireEveryEntityClick(renderer: {
      scene: { findAll: (p: (n: unknown) => boolean) => unknown[] };
    }) {
      const nodes = renderer.scene.findAll(
        (node) =>
          typeof (node as { props: Record<string, unknown> }).props?.onClick ===
            'function' &&
          (node as { instance?: THREE.Mesh }).instance?.geometry?.type !==
            'PlaneGeometry'
      ) as Array<{ props: Record<string, unknown> }>;
      expect(nodes.length).toBeGreaterThan(0);
      for (const node of nodes) {
        const onClick = node.props.onClick as (event: {
          stopPropagation: () => void;
        }) => void;
        onClick({ stopPropagation: () => {} });
      }
    }

    it("clicking an ENTITY'S OWN mesh (not the floor underneath it) fires onEntityClick — the exact raycast-order bug caught live", async () => {
      const onHexClick = vi.fn();
      const onEntityClick = vi.fn();
      const renderer = await ReactThreeTestRenderer.create(
        <SessionScene
          scene={scene()}
          hexSize={1}
          characterId="char-1"
          characterName="Toolkit Sandbox Fighter"
          character={undefined}
          classRefId={undefined}
          myPosition={{ x: 0, y: 0, z: 0 }}
          otherMembers={oneMember}
          attackableTargets={['skeleton-1']}
          onHexClick={onHexClick}
          onEntityClick={onEntityClick}
        />
      );
      fireEveryEntityClick(renderer);

      // The skeleton's own mesh click resolved to onEntityClick exactly
      // once; the local player's own (unwired) click handler safely
      // no-oped, same as it does in the live app.
      expect(onEntityClick).toHaveBeenCalledTimes(1);
      expect(onEntityClick).toHaveBeenCalledWith('skeleton-1');
      expect(onHexClick).not.toHaveBeenCalled();
    });

    it('clicking an attackable entity fires onEntityClick, not onHexClick', async () => {
      const onHexClick = vi.fn();
      const onEntityClick = vi.fn();
      const renderer = await ReactThreeTestRenderer.create(
        <SessionScene
          scene={scene()}
          hexSize={1}
          characterId="char-1"
          characterName="Toolkit Sandbox Fighter"
          character={undefined}
          classRefId={undefined}
          myPosition={{ x: 0, y: 0, z: 0 }}
          otherMembers={oneMember}
          attackableTargets={['skeleton-1']}
          onHexClick={onHexClick}
          onEntityClick={onEntityClick}
        />
      );
      clickAt(findGroundPlaneProps(renderer), { x: 1, y: -1, z: 0 });

      expect(onEntityClick).toHaveBeenCalledWith('skeleton-1');
      expect(onHexClick).not.toHaveBeenCalled();
    });

    it('clicking a non-attackable entity is a no-op — never onEntityClick, never onHexClick either', async () => {
      const onHexClick = vi.fn();
      const onEntityClick = vi.fn();
      const renderer = await ReactThreeTestRenderer.create(
        <SessionScene
          scene={scene()}
          hexSize={1}
          characterId="char-1"
          characterName="Toolkit Sandbox Fighter"
          character={undefined}
          classRefId={undefined}
          myPosition={{ x: 0, y: 0, z: 0 }}
          otherMembers={oneMember}
          attackableTargets={[]}
          onHexClick={onHexClick}
          onEntityClick={onEntityClick}
        />
      );
      clickAt(findGroundPlaneProps(renderer), { x: 1, y: -1, z: 0 });

      expect(onEntityClick).not.toHaveBeenCalled();
      expect(onHexClick).not.toHaveBeenCalled();
    });

    it('clicking empty floor still walks, unaffected by attackableTargets', async () => {
      const onHexClick = vi.fn();
      const onEntityClick = vi.fn();
      const renderer = await ReactThreeTestRenderer.create(
        <SessionScene
          scene={scene()}
          hexSize={1}
          characterId="char-1"
          characterName="Toolkit Sandbox Fighter"
          character={undefined}
          classRefId={undefined}
          myPosition={{ x: 0, y: 0, z: 0 }}
          otherMembers={oneMember}
          attackableTargets={['skeleton-1']}
          onHexClick={onHexClick}
          onEntityClick={onEntityClick}
        />
      );
      clickAt(findGroundPlaneProps(renderer), { x: 1, y: 0, z: -1 });

      expect(onHexClick).toHaveBeenCalledWith({ x: 1, y: 0, z: -1 });
      expect(onEntityClick).not.toHaveBeenCalled();
    });
  });

  describe('onHoverEntity', () => {
    async function hoverAtPlane(
      renderer: {
        scene: { findAll: (p: (n: unknown) => boolean) => unknown[] };
      },
      cube: { x: number; y: number; z: number }
    ) {
      const nodes = renderer.scene.findAll(
        (node) =>
          (node as { instance: THREE.Mesh }).instance.geometry?.type ===
          'PlaneGeometry'
      ) as Array<{ fiber: { props: Record<string, unknown> } }>;
      const onPointerMove = nodes[0]!.fiber.props.onPointerMove as (event: {
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

    it('reports the subject under the cursor, and null once the pointer leaves it', async () => {
      const onHoverEntity = vi.fn();
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
              name: 'skeleton-1',
              monsterRefId: 'skeleton',
              kind: MemberKind.MONSTER,
              position: { x: 1, y: -1, z: 0 },
              remembered: false,
              standing: Standing.UP,
            },
          ]}
          onHoverEntity={onHoverEntity}
        />
      );

      await hoverAtPlane(renderer, { x: 1, y: -1, z: 0 });
      expect(onHoverEntity).toHaveBeenLastCalledWith('skeleton-1');

      await hoverAtPlane(renderer, { x: 0, y: 0, z: 0 });
      expect(onHoverEntity).toHaveBeenLastCalledWith(null);
    });

    it("reports the subject when the pointer is over the ENTITY'S OWN mesh, not just the bare hex beside it — Kirk's own live-walk finding: the hover affordance only ever worked over the floor, never over the model", async () => {
      const onHoverEntity = vi.fn();
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
              name: 'skeleton-1',
              monsterRefId: 'skeleton',
              kind: MemberKind.MONSTER,
              position: { x: 1, y: -1, z: 0 },
              remembered: false,
              standing: Standing.UP,
            },
          ]}
          onHoverEntity={onHoverEntity}
        />
      );

      // Every node with its OWN onPointerOver handler (the local
      // player's included — HexEntity builds one regardless of whether a
      // prop was ever passed, same as onClick) — fire all of them, same
      // robust-to-render-order approach the entity click test uses.
      const nodes = renderer.scene.findAll(
        (node) =>
          typeof (node as { props: Record<string, unknown> }).props
            ?.onPointerOver === 'function'
      ) as Array<{ props: Record<string, unknown> }>;
      expect(nodes.length).toBeGreaterThan(0);
      await ReactThreeTestRenderer.act(async () => {
        for (const node of nodes) {
          const onPointerOver = node.props.onPointerOver as (event: {
            stopPropagation: () => void;
          }) => void;
          onPointerOver({ stopPropagation: () => {} });
        }
      });

      expect(onHoverEntity).toHaveBeenLastCalledWith('skeleton-1');

      const outNodes = renderer.scene.findAll(
        (node) =>
          typeof (node as { props: Record<string, unknown> }).props
            ?.onPointerOut === 'function'
      ) as Array<{ props: Record<string, unknown> }>;
      await ReactThreeTestRenderer.act(async () => {
        for (const node of outNodes) {
          (node.props.onPointerOut as () => void)();
        }
      });
      expect(onHoverEntity).toHaveBeenLastCalledWith(null);
    });
  });
});
