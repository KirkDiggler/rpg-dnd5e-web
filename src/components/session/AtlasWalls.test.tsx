import { HEX_SIZE, type WorldPos } from '@/components/hex-grid/hexMath';
import type { AuthoredWallRun } from '@/components/session/atlasWallRuns';
import type { DungeonShellWallProfile } from '@/rendering/dungeonShellManifest';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import { create } from '@bufbuild/protobuf';
import { GetAtlasResponseSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { DoorState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SHELL_DOOR_FRAME_FOREGROUND_MARGIN,
  shellLocalOffsetToWorld,
} from '../hex-grid/dungeonShellWallHelpers';
import { AtlasWalls } from './AtlasWalls';
import { segmentsToWallRuns, type DoorGapPiece } from './atlasWallRuns';

const loadedUrls: string[] = [];
const rejectedUrls = new Set<string>();

vi.mock('@react-three/drei', () => {
  const useGLTF = (url: string) => {
    loadedUrls.push(url);
    if (rejectedUrls.has(url)) {
      throw new Error(`failed to load ${url}`);
    }
    const scene = new THREE.Group();
    const box = (
      min: [number, number, number],
      max: [number, number, number],
      name: string
    ) => {
      const geometry = new THREE.BoxGeometry(
        max[0] - min[0],
        max[1] - min[1],
        max[2] - min[2]
      );
      geometry.translate(
        (min[0] + max[0]) / 2,
        (min[1] + max[1]) / 2,
        (min[2] + max[2]) / 2
      );
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: 0xffffff })
      );
      mesh.name = name;
      return mesh;
    };
    if (url.includes('Crypt_Wall_Body_01')) {
      scene.add(box([-1, 0, -0.2], [3, 4, 0.2], 'profile-body'));
    } else if (url.includes('Crypt_Wall_Base_01')) {
      scene.add(box([0, 0, -0.3], [2, 0.4, 0.3], 'profile-base'));
    } else if (url.includes('Crypt_Wall_Cap_01')) {
      scene.add(box([0.25, 0, -0.2], [2.25, 0.4, 0.2], 'profile-cap'));
    } else if (url.includes('Provider_Door_Surround_Registration')) {
      scene.add(
        box(
          [-0.9993886947631836, 0, -0.3419951796531677],
          [-0.66627635917071, 2.5346500873565674, 0.3419951796531677],
          'provider-surround-left'
        ),
        box(
          [0.6408623012743637, 0, -0.3419951796531677],
          [0.9993886947631836, 2.5346500873565674, 0.3419951796531677],
          'provider-surround-right'
        ),
        box(
          [-0.9993886947631836, 2.1852569580078125, -0.3419951796531677],
          [0.9993886947631836, 2.5346500873565674, 0.3419951796531677],
          'provider-surround-lintel'
        )
      );
    } else if (url.includes('Door_Surround')) {
      scene.add(
        box([-1, 0, -0.3], [-0.7, 2, 0.3], 'surround-left'),
        box([0.7, 0, -0.3], [1, 2, 0.3], 'surround-right'),
        box([-1, 2, -0.3], [1, 2.5, 0.3], 'surround-lintel')
      );
    } else if (url.includes('Door_Frame')) {
      scene.add(box([-0.9995, 0, -0.2], [0.9995, 2.5347, 0.2], 'legacy-frame'));
    } else {
      scene.add(box([0, 0, -0.1], [1.2, 1.9, 0.1], 'door-leaf'));
    }
    return { scene };
  };
  useGLTF.preload = () => undefined;
  return { useGLTF };
});

const profile: DungeonShellWallProfile = {
  body: {
    file: 'env/Crypt_Wall_Body_01.glb',
    sha256: 'a'.repeat(64),
    localSpanAxis: '+X',
    localFaceAxis: 'Z',
    twoSided: true,
    bounds: { min: [-1, 0, -0.2], max: [3, 4, 0.2] },
  },
  base: {
    file: 'env/Crypt_Wall_Base_01.glb',
    sha256: 'a'.repeat(64),
    bounds: { min: [0, 0, -0.3], max: [2, 0.4, 0.3] },
  },
  cap: {
    file: 'env/Crypt_Wall_Cap_01.glb',
    sha256: 'a'.repeat(64),
    bounds: { min: [0.25, 0, -0.2], max: [2.25, 0.4, 0.2] },
  },
  doorSurround: {
    file: 'env/Crypt_Wall_Door_Surround_01.glb',
    sha256: 'a'.repeat(64),
    bounds: { min: [-1, 0, -0.3], max: [1, 2.5, 0.3] },
  },
};

const providerRegistrationProfile: DungeonShellWallProfile = {
  ...profile,
  cap: {
    file: 'env/Crypt_Wall_Cap_01.glb',
    sha256: 'a'.repeat(64),
    bounds: {
      min: [-2.546480178833008, 0, -0.20546433329582214],
      max: [2.546480178833008, 0.663008451461792, 0.20546433329582214],
    },
  },
  doorSurround: {
    file: 'env/Provider_Door_Surround_Registration.glb',
    sha256: 'a'.repeat(64),
    bounds: {
      min: [-0.9993886947631836, 0, -0.3419951796531677],
      max: [0.9993886947631836, 2.5346500873565674, 0.3419951796531677],
    },
  },
};

function providerLeafScene(): THREE.Group {
  const scene = new THREE.Group();
  const geometry = new THREE.BoxGeometry(
    1.2874064445495605 - -0.03624606132507324,
    2.455683946609497,
    0.09246950596570969 - -0.09246932715177536
  );
  geometry.translate(
    (1.2874064445495605 + -0.03624606132507324) / 2,
    2.455683946609497 / 2,
    (0.09246950596570969 + -0.09246932715177536) / 2
  );
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: 0xffffff })
  );
  mesh.name = 'provider-leaf';
  scene.add(mesh);
  return scene;
}

function meshBoundsInDoorCoordinates(
  mesh: THREE.Mesh,
  door: DoorGapPiece
): THREE.Box3 {
  mesh.updateWorldMatrix(true, false);
  const positions = mesh.geometry.getAttribute('position');
  const points: THREE.Vector3[] = [];
  const cos = Math.cos(door.rotationY);
  const sin = Math.sin(door.rotationY);
  for (let i = 0; i < positions.count; i += 1) {
    const world = new THREE.Vector3()
      .fromBufferAttribute(positions, i)
      .applyMatrix4(mesh.matrixWorld);
    const dx = world.x - door.position.x;
    const dz = world.z - door.position.z;
    points.push(
      new THREE.Vector3(
        dx * cos - dz * sin,
        world.y - DUNGEON_SURFACE_Y,
        dx * sin + dz * cos
      )
    );
  }
  return new THREE.Box3().setFromPoints(points);
}

const wallRuns = [
  {
    key: 'wall',
    start: { x: -2, z: 0 },
    end: { x: -0.5, z: 0 },
    facing: { x: 0, z: 1 },
    height: 0,
  },
  {
    key: 'wall-2',
    start: { x: 0.5, z: 0 },
    end: { x: 2, z: 0 },
    facing: { x: 0, z: 1 },
    height: 0,
  },
];

const doorGaps = [
  {
    key: 'door-key',
    connection: 'door-id',
    position: { x: 0, z: 0 },
    leafPosition: { x: -0.5, z: 0 },
    rotationY: 0,
  },
];

function meshNodes(renderer: {
  scene: { findAll: (predicate: (node: unknown) => boolean) => unknown[] };
}) {
  return renderer.scene.findAll((node) => {
    const n = node as { type?: string; instance?: unknown };
    return n.type === 'Mesh' || n.instance instanceof THREE.Mesh;
  });
}

function primitiveGroups(renderer: {
  scene: { findAll: (predicate: (node: unknown) => boolean) => unknown[] };
}): THREE.Group[] {
  return renderer.scene
    .findAll((node) => {
      const instance = (node as { instance?: unknown }).instance;
      return (
        instance instanceof THREE.Group &&
        instance.children.some((child) => child instanceof THREE.Mesh)
      );
    })
    .map((node) => (node as { instance: THREE.Group }).instance);
}

function closedFallbackMeshes(renderer: {
  scene: { findAll: (predicate: (node: unknown) => boolean) => unknown[] };
}) {
  return renderer.scene.findAll((node) => {
    const rendered = node as { type: string; instance: unknown };
    return (
      rendered.type === 'Mesh' &&
      (rendered.instance as THREE.Mesh).name === 'closed-door-fallback'
    );
  });
}

function worldBox(group: THREE.Group): THREE.Box3 {
  let root: THREE.Object3D = group;
  while (root.parent) root = root.parent;
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(group);
}

function meshName(group: THREE.Group): string {
  return (
    group.children.find((child) => child instanceof THREE.Mesh) as THREE.Mesh
  ).name;
}

function expectBox(
  group: THREE.Group,
  min: [number, number, number],
  max: [number, number, number]
) {
  const box = worldBox(group);
  expect(box.min.x).toBeCloseTo(min[0], 6);
  expect(box.min.y).toBeCloseTo(min[1], 6);
  expect(box.min.z).toBeCloseTo(min[2], 6);
  expect(box.max.x).toBeCloseTo(max[0], 6);
  expect(box.max.y).toBeCloseTo(max[1], 6);
  expect(box.max.z).toBeCloseTo(max[2], 6);
}

/**
 * A single straight segment carrying two doors — enough to exercise
 * `segmentsToWallRuns` producing three runs and two gaps (rpg-project#360
 * slice 2's own straight-line contract, atlasWallRuns.test.ts's own
 * "two doors on one segment" pin), and then to check THIS file's actual
 * job: that `AtlasWalls`/`WallRunMesh` render that trusted converter
 * output faithfully — frame/leaf per door, and each flanking run's own
 * tile overlapping its gap boundary by exactly WallRunMesh's calibrated
 * margin, not a doubled or missing one.
 *
 * There is no T-junction/corner fixture here any more: that concept
 * belonged to the deleted chain-fitting engine's corner-closure solver
 * (`cornerJoint`, `CORNER_OVERLAP_MARGIN`), which no longer exists — two
 * segments an author drew sharing an endpoint simply share it, by
 * construction, with nothing left to solve or pin.
 */
const TWO_DOOR_SEGMENT_ATLAS = create(GetAtlasResponseSchema, {
  segments: [{ from: { q: -8, r: 0 }, to: { q: 8, r: 0 }, height: 0 }],
  doorways: [
    { connection: 'firstDoor', from: { x: -3, y: 0 }, to: { x: -2, y: 0 } },
    { connection: 'secondDoor', from: { x: 2, y: 0 }, to: { x: 3, y: 0 } },
  ],
});

function doorByConnection(
  gaps: readonly DoorGapPiece[],
  connection: string
): DoorGapPiece {
  const matches = gaps.filter((gap) => gap.connection === connection);
  expect(matches, `one door gap for ${connection}`).toHaveLength(1);
  return matches[0]!;
}

/** The run whose own end sits at `point`, within float noise — used to
 * find the run flanking a known gap boundary without depending on the
 * converter's own key format. */
function runTouching(
  runs: readonly AuthoredWallRun[],
  point: WorldPos
): { run: AuthoredWallRun; side: 'start' | 'end' } {
  for (const run of runs) {
    if (Math.hypot(run.start.x - point.x, run.start.z - point.z) < 1e-9) {
      return { run, side: 'start' };
    }
    if (Math.hypot(run.end.x - point.x, run.end.z - point.z) < 1e-9) {
      return { run, side: 'end' };
    }
  }
  throw new Error(`no run touches ${JSON.stringify(point)}`);
}

function runBodyGroups(groups: readonly THREE.Group[], run: AuthoredWallRun) {
  const dx = run.end.x - run.start.x;
  const dz = run.end.z - run.start.z;
  const length = Math.hypot(dx, dz);
  return groups.filter((group) => {
    if (meshName(group) !== 'profile-body') return false;
    const along =
      ((group.position.x - run.start.x) * dx +
        (group.position.z - run.start.z) * dz) /
      (length * length);
    const cross = Math.abs(
      (group.position.x - run.start.x) * dz -
        (group.position.z - run.start.z) * dx
    );
    return cross < 1e-5 && along > -0.01 && along < 1.01;
  });
}

function projectedBodyExtent(
  groups: readonly THREE.Group[],
  run: AuthoredWallRun
) {
  const dx = run.end.x - run.start.x;
  const dz = run.end.z - run.start.z;
  const length = Math.hypot(dx, dz);
  const ux = dx / length;
  const uz = dz / length;
  const projections: number[] = [];
  for (const group of groups) {
    group.updateMatrixWorld(true);
    group.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const positions = node.geometry.getAttribute('position');
      const vertex = new THREE.Vector3();
      for (let i = 0; i < positions.count; i += 1) {
        vertex.fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld);
        projections.push(
          (vertex.x - run.start.x) * ux + (vertex.z - run.start.z) * uz
        );
      }
    });
  }
  return { min: Math.min(...projections), max: Math.max(...projections) };
}

describe('AtlasWalls profile assembly', () => {
  beforeEach(() => {
    loadedUrls.splice(0);
    rejectedUrls.clear();
  });

  it('places the measured profile frame and derived leaf exactly at floor level for both rotations', async () => {
    const twoDoors = [
      { ...doorGaps[0]!, connection: 'door-one' },
      {
        key: 'door-two',
        connection: 'door-two',
        position: { x: 3, z: 1 },
        leafPosition: { x: 3, z: 1.5 },
        rotationY: Math.PI / 2,
      },
    ];
    const renderer = await ReactThreeTestRenderer.create(
      <AtlasWalls
        wallRuns={[]}
        doorGaps={twoDoors}
        profile={profile}
        wallHeight={2.4}
        doors={new Map([['door-one', { state: DoorState.LOCKED } as never]])}
      />
    );
    const groups = primitiveGroups(renderer);
    expect(groups).toHaveLength(4);
    const frames = groups.filter(
      (group) => meshName(group) === 'surround-left'
    );
    const leaves = groups.filter((group) => meshName(group) === 'door-leaf');
    expect(frames).toHaveLength(2);
    expect(leaves).toHaveLength(2); // locked and unknown both stay shut

    const firstFrame = frames.find((group) => group.position.x === 0)!;
    expect(firstFrame.position.toArray()).toEqual([0, 0.2, 0.01]);
    expect(firstFrame.rotation.y).toBeCloseTo(0, 8);
    expectBox(firstFrame, [-0.5, 0.2, -0.215], [0.5, 2.9, 0.235]);
    const firstLeaf = leaves.find(
      (group) => worldBox(group).getCenter(new THREE.Vector3()).x < 1.5
    )!;
    expect(firstLeaf.parent!.position.toArray()).toEqual([-0.5, 0.2, 0]);
    expect(firstLeaf.parent!.rotation.y).toBeCloseTo(0, 8);
    expect(firstLeaf.position.x).toBeCloseTo(0.129999, 6);
    expect(firstLeaf.position.y).toBe(0);
    expect(firstLeaf.position.z).toBe(0);
    expectBox(firstLeaf, [-0.370001, 0.2, -0.075], [0.370001, 2.380001, 0.075]);

    const secondFrame = frames.find((group) => group.position.x > 3)!;
    expect(secondFrame.position.x).toBeCloseTo(3.01, 8);
    expect(secondFrame.position.y).toBeCloseTo(0.2, 8);
    expect(secondFrame.position.z).toBeCloseTo(1, 8);
    expect(secondFrame.rotation.y).toBeCloseTo(Math.PI / 2, 8);
    expectBox(secondFrame, [2.785, 0.2, 0.5], [3.235, 2.9, 1.5]);
    const secondLeaf = leaves.find(
      (group) => worldBox(group).getCenter(new THREE.Vector3()).x > 1.5
    )!;
    expect(secondLeaf.parent!.position.toArray()).toEqual([3, 0.2, 1.5]);
    expect(secondLeaf.parent!.rotation.y).toBeCloseTo(Math.PI / 2, 8);
    expect(secondLeaf.position.x).toBeCloseTo(0.129999, 6);
    expect(secondLeaf.position.y).toBe(0);
    expect(secondLeaf.position.z).toBe(0);
    expectBox(secondLeaf, [2.925, 0.2, 0.629999], [3.075, 2.380001, 1.370001]);
  });

  it.each([
    { wallHeight: 2.4, label: 'standard' },
    { wallHeight: 3.6, label: 'raised' },
  ])(
    'registers provider-derived closed leaves under exact gapStart hinges with full cover at $label height for both rotations and facings',
    async ({ wallHeight }) => {
      const facingDoors: DoorGapPiece[] = [
        {
          key: 'east',
          connection: 'east',
          position: { x: 0, z: 0 },
          leafPosition: { x: -0.5, z: 0 },
          rotationY: 0,
        },
        {
          key: 'north',
          connection: 'north',
          position: { x: 4, z: 0 },
          leafPosition: { x: 4, z: 0.5 },
          rotationY: Math.PI / 2,
        },
        {
          key: 'west',
          connection: 'west',
          position: { x: 8, z: 0 },
          leafPosition: { x: 8.5, z: 0 },
          rotationY: Math.PI,
        },
        {
          key: 'south',
          connection: 'south',
          position: { x: 12, z: 0 },
          leafPosition: { x: 12, z: -0.5 },
          rotationY: -Math.PI / 2,
        },
      ];
      const renderer = await ReactThreeTestRenderer.create(
        <AtlasWalls
          wallRuns={[]}
          doorGaps={facingDoors}
          profile={providerRegistrationProfile}
          profileLeafScene={providerLeafScene()}
          wallHeight={wallHeight}
        />
      );

      const groupNodes = renderer.scene.findAll(
        (node) => (node as { type?: string }).type === 'Group'
      ) as unknown as Array<{
        props: {
          object?: THREE.Group;
          position?: [number, number, number];
          rotation?: [number, number, number];
        };
      }>;
      for (const door of facingDoors) {
        const hingeRoot = groupNodes.find(
          (node) =>
            !node.props.object &&
            node.props.position?.[0] === door.leafPosition.x &&
            node.props.position[1] === DUNGEON_SURFACE_Y &&
            node.props.position[2] === door.leafPosition.z &&
            node.props.rotation?.[1] === door.rotationY
        );
        expect(hingeRoot, `${door.connection} exact hinge root`).toBeDefined();
      }

      const leaves = meshNodes(renderer)
        .map((node) => (node as { instance: THREE.Mesh }).instance)
        .filter((mesh) => mesh.name === 'provider-leaf');
      expect(leaves).toHaveLength(facingDoors.length);

      const frameScaleX = 1 / (0.9993886947631836 - -0.9993886947631836);
      const frameScaleY =
        (wallHeight + 0.663008451461792 * 0.75) / 2.5346500873565674;
      const openingLeft = -0.66627635917071 * frameScaleX;
      const openingRight = 0.6408623012743637 * frameScaleX;
      const openingTop = 2.1852569580078125 * frameScaleY;

      for (const door of facingDoors) {
        const nearestLeaf = leaves
          .map((leaf) => {
            leaf.updateWorldMatrix(true, false);
            const center = new THREE.Box3()
              .setFromObject(leaf)
              .getCenter(new THREE.Vector3());
            return {
              leaf,
              distance: Math.hypot(
                center.x - door.position.x,
                center.z - door.position.z
              ),
            };
          })
          .sort((a, b) => a.distance - b.distance)[0]!.leaf;
        const bounds = meshBoundsInDoorCoordinates(nearestLeaf, door);
        expect(openingLeft - bounds.min.x).toBeGreaterThanOrEqual(0.02);
        expect(bounds.max.x - openingRight).toBeGreaterThanOrEqual(0.02);
        expect(bounds.max.y - openingTop).toBeGreaterThanOrEqual(0.02);
        expect(openingLeft - bounds.min.x).toBeCloseTo(0.020001, 5);
        expect(bounds.max.x - openingRight).toBeCloseTo(0.020001, 5);
        expect(bounds.max.y - openingTop).toBeCloseTo(0.020001, 5);
        expect(bounds.min.y).toBeCloseTo(0, 6);
      }
    }
  );

  it('raises the profile frame to body-plus-cap top at a raised authored height', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <AtlasWalls
        wallRuns={[]}
        doorGaps={doorGaps}
        profile={profile}
        wallHeight={4.8}
        doors={new Map([['door-id', { state: DoorState.CLOSED } as never]])}
      />
    );
    const frame = primitiveGroups(renderer).find(
      (group) => meshName(group) === 'surround-left'
    )!;
    expectBox(frame, [-0.5, 0.2, -0.215], [0.5, 5.3, 0.235]);
    const leaf = primitiveGroups(renderer).find(
      (group) => meshName(group) === 'door-leaf'
    )!;
    expectBox(leaf, [-0.370001, 0.2, -0.075], [0.370001, 4.300001, 0.075]);
  });

  it('renders exact segment-derived runs and door frames without mutating canonical converter output, and each flanking tile overlaps its own gap by exactly WallRunMesh’s calibrated margin', async () => {
    const scene = segmentsToWallRuns(TWO_DOOR_SEGMENT_ATLAS, HEX_SIZE);
    expect(scene.wallRuns).toHaveLength(3);
    expect(scene.doorGaps).toHaveLength(2);
    const wallRunsBefore = structuredClone(scene.wallRuns);
    const doorGapsBefore = structuredClone(scene.doorGaps);

    const renderer = await ReactThreeTestRenderer.create(
      <AtlasWalls
        wallRuns={scene.wallRuns}
        doorGaps={scene.doorGaps}
        profile={profile}
        doors={
          new Map([
            ['firstDoor', { state: DoorState.LOCKED } as never],
            ['secondDoor', { state: DoorState.OPEN } as never],
          ])
        }
      />
    );

    // AtlasWalls neither mutates the converter's output nor recomputes it.
    expect(scene.wallRuns).toEqual(wallRunsBefore);
    expect(scene.doorGaps).toEqual(doorGapsBefore);

    const groups = primitiveGroups(renderer);
    const frames = groups.filter(
      (group) => meshName(group) === 'surround-left'
    );
    expect(frames).toHaveLength(2);
    // LOCKED renders a shut leaf; OPEN does not (rpg-project#268).
    expect(
      groups.filter((group) => meshName(group) === 'door-leaf')
    ).toHaveLength(1);

    for (const connection of ['firstDoor', 'secondDoor'] as const) {
      const gap = doorByConnection(scene.doorGaps, connection);

      // The frame sits at the gap's own position, nudged forward by the
      // shell's own foreground margin — the same formula AtlasWalls.tsx
      // itself applies, used here as an independent oracle rather than
      // a hardcoded literal (that formula, not this test, owns its own
      // coverage).
      const frameOffset = shellLocalOffsetToWorld(
        { x: 0, z: SHELL_DOOR_FRAME_FOREGROUND_MARGIN },
        gap.rotationY
      );
      const expectedFramePosition = {
        x: gap.position.x + frameOffset.x,
        z: gap.position.z + frameOffset.z,
      };
      const matchingFrames = frames.filter(
        (frame) =>
          Math.abs(frame.position.x - expectedFramePosition.x) < 1e-9 &&
          Math.abs(frame.position.z - expectedFramePosition.z) < 1e-9 &&
          Math.abs(frame.rotation.y - gap.rotationY) < 1e-9
      );
      expect(
        matchingFrames,
        `one rendered frame for ${connection}`
      ).toHaveLength(1);
      expect(matchingFrames[0]!.position.y).toBeCloseTo(0.2, 9);

      // The gap's two boundary points — the near one is `leafPosition`
      // itself (this module's documented convention), the far one its
      // mirror through the centre. atlasWallRuns.test.ts already pins
      // that a flanking run's own end sits EXACTLY on each boundary
      // (no float slack); `runTouching` finds that run from the
      // boundary point alone, independent of run order or key format.
      const near = gap.leafPosition;
      const far = {
        x: 2 * gap.position.x - near.x,
        z: 2 * gap.position.z - near.z,
      };
      for (const boundary of [near, far]) {
        const { run, side } = runTouching(scene.wallRuns, boundary);
        const bodyGroups = runBodyGroups(groups, run);
        expect(bodyGroups.length).toBeGreaterThan(0);
        const dx = run.end.x - run.start.x;
        const dz = run.end.z - run.start.z;
        const length = Math.hypot(dx, dz);
        // The boundary is exactly run.start (projection 0) or run.end
        // (projection `length`), by construction of `runTouching`.
        const boundaryProjection = side === 'start' ? 0 : length;
        const tileExtents = bodyGroups.map((group) =>
          projectedBodyExtent([group], run)
        );
        const crossingTiles = tileExtents.filter((extent) =>
          side === 'start'
            ? extent.min < boundaryProjection - 1e-6
            : extent.max > boundaryProjection + 1e-6
        );
        expect(
          crossingTiles,
          `one terminal tile crosses ${connection} on its ${side}`
        ).toHaveLength(1);
        const overlap =
          side === 'start'
            ? boundaryProjection - crossingTiles[0]!.min
            : crossingTiles[0]!.max - boundaryProjection;
        expect(overlap).toBeCloseTo(0.08, 6);
        expect(overlap).toBeLessThan(0.080001);
      }
    }
  });

  it('uses profile body/base/cap and the accepted surround/leaf files while keeping the click id', async () => {
    const onDoorClick = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <AtlasWalls
        wallRuns={wallRuns}
        doorGaps={doorGaps}
        profile={profile}
        doors={new Map([['door-id', { state: DoorState.LOCKED } as never]])}
        onDoorClick={onDoorClick}
        wallHeight={2.4}
      />
    );

    expect(meshNodes(renderer)).toHaveLength(16); // 4 profile tiles x 3 meshes + 3-part surround + leaf
    expect(loadedUrls).toEqual(
      expect.arrayContaining([
        '/models/synty/env/Crypt_Wall_Body_01.glb',
        '/models/synty/env/Crypt_Wall_Base_01.glb',
        '/models/synty/env/Crypt_Wall_Cap_01.glb',
        '/models/synty/env/Crypt_Wall_Door_Surround_01.glb',
        '/models/synty/env/SM_Env_Door_01.glb',
      ])
    );
    const clickable = renderer.scene.find(
      (node) => typeof node.props.onClick === 'function'
    );
    await renderer.fireEvent(clickable, 'click');
    expect(onDoorClick).toHaveBeenCalledWith('door-id');
  });

  it('omits the closed leaf only when the existing door state is OPEN', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <AtlasWalls
        wallRuns={[]}
        doorGaps={doorGaps}
        profile={profile}
        doors={new Map([['door-id', { state: DoorState.OPEN } as never]])}
      />
    );
    expect(meshNodes(renderer)).toHaveLength(3); // surround remains; leaf is omitted
  });

  it('keeps legacy door leaves isolated in the shell resource fallback', async () => {
    const onDoorClick = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <AtlasWalls
        wallRuns={wallRuns}
        doorGaps={doorGaps}
        doors={new Map([['door-id', { state: DoorState.LOCKED } as never]])}
        onDoorClick={onDoorClick}
        resilientDoorLeaves
      />
    );

    expect(meshNodes(renderer)).toHaveLength(8); // two wall tiles + frame + leaf
    expect(loadedUrls).toContain('/models/synty/env/SM_Env_Door_01.glb');
    const clickable = renderer.scene.find(
      (node) => typeof node.props.onClick === 'function'
    );
    await renderer.fireEvent(clickable, 'click');
    expect(onDoorClick).toHaveBeenCalledWith('door-id');
  });

  it('unmounts a rejected resilient leaf while OPEN and remounts its fallback when reclosed', async () => {
    rejectedUrls.add('/models/synty/env/SM_Env_Door_01.glb');
    const onDoorClick = vi.fn();
    const renderer = await ReactThreeTestRenderer.create(
      <AtlasWalls
        wallRuns={[]}
        doorGaps={doorGaps}
        doors={new Map([['door-id', { state: DoorState.CLOSED } as never]])}
        onDoorClick={onDoorClick}
        resilientDoorLeaves
      />
    );
    await renderer.update(
      <AtlasWalls
        wallRuns={[]}
        doorGaps={doorGaps}
        doors={new Map([['door-id', { state: DoorState.CLOSED } as never]])}
        onDoorClick={onDoorClick}
        resilientDoorLeaves
      />
    );

    expect(closedFallbackMeshes(renderer)).toHaveLength(1);

    await renderer.update(
      <AtlasWalls
        wallRuns={[]}
        doorGaps={doorGaps}
        doors={new Map([['door-id', { state: DoorState.OPEN } as never]])}
        onDoorClick={onDoorClick}
        resilientDoorLeaves
      />
    );
    expect(primitiveGroups(renderer).map(meshName)).toEqual(['legacy-frame']);
    expect(closedFallbackMeshes(renderer)).toHaveLength(0);
    const clickable = renderer.scene.find(
      (node) => typeof node.props.onClick === 'function'
    );
    await renderer.fireEvent(clickable, 'click');
    expect(onDoorClick).toHaveBeenCalledWith('door-id');

    await renderer.update(
      <AtlasWalls
        wallRuns={[]}
        doorGaps={doorGaps}
        doors={new Map([['door-id', { state: DoorState.CLOSED } as never]])}
        onDoorClick={onDoorClick}
        resilientDoorLeaves
      />
    );
    expect(closedFallbackMeshes(renderer)).toHaveLength(1);
  });

  it('preserves exact legacy frame/leaf files, transforms, positions, and state behavior without profile transforms', async () => {
    const locked = await ReactThreeTestRenderer.create(
      <AtlasWalls
        wallRuns={[]}
        doorGaps={doorGaps}
        doors={new Map([['door-id', { state: DoorState.LOCKED } as never]])}
      />
    );
    expect(meshNodes(locked)).toHaveLength(2);
    expect(loadedUrls).toEqual(
      expect.arrayContaining([
        '/models/synty/env/SM_Env_Door_Frame_01.glb',
        '/models/synty/env/SM_Env_Door_01.glb',
      ])
    );
    const legacyGroups = primitiveGroups(locked);
    const legacyFrame = legacyGroups.find(
      (group) => meshName(group) === 'legacy-frame'
    )!;
    const legacyLeaf = legacyGroups.find(
      (group) => meshName(group) === 'door-leaf'
    )!;
    expect(legacyFrame.position.toArray()).toEqual([0, 0, 0]);
    expect(legacyFrame.rotation.y).toBe(0);
    expectBox(legacyFrame, [-0.5, 0, -0.15], [0.5, 2.4, 0.15]);
    expect(legacyLeaf.position.toArray()).toEqual([-0.5, 0, 0]);
    expect(legacyLeaf.rotation.y).toBe(0);
    expectBox(legacyLeaf, [-0.5, 0, -0.075], [0.4, 1.7990294709433068, 0.075]);

    const open = await ReactThreeTestRenderer.create(
      <AtlasWalls
        wallRuns={[]}
        doorGaps={doorGaps}
        doors={new Map([['door-id', { state: DoorState.OPEN } as never]])}
      />
    );
    expect(meshNodes(open)).toHaveLength(1);
    expect(primitiveGroups(open).map(meshName)).toEqual(['legacy-frame']);
  });
});
