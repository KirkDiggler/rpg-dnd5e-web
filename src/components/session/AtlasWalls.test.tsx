import {
  HEX_SIZE,
  hexEdgeBetween,
  type WorldPos,
} from '@/components/hex-grid/hexMath';
import { vertexKey, type AuthoredWallRun } from '@/hooks/authoredWallRuns';
import type { DungeonShellWallProfile } from '@/rendering/dungeonShellManifest';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import { DoorState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AtlasWalls } from './AtlasWalls';
import {
  boundariesToWallRuns,
  type DoorGapPiece,
  type WallRunScene,
} from './atlasWallRuns';
import { positionToCube } from './positionBridge';

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

type FixtureCell = readonly [q: number, r: number];
type FixtureCellPair = readonly [from: FixtureCell, to: FixtureCell];

/** Every source edge has a stable authored identity and a literal cell pair.
 * The three `t*` edges are the only edges incident at their common hex
 * vertex. Each named door has one independently named source edge on each
 * side, in a disconnected straight chain, so no output-order search can
 * substitute a different run. */
const AUTHORED_BOUNDARY_PAIRS = {
  tNorthWest: [
    [-1, 0],
    [-1, 1],
  ],
  tNorthEast: [
    [-1, 1],
    [0, 0],
  ],
  tSouth: [
    [-1, 0],
    [0, 0],
  ],
  firstDoorBefore: [
    [-6, 1],
    [-6, 2],
  ],
  firstDoorAfter: [
    [-5, 0],
    [-5, 1],
  ],
  secondDoorBefore: [
    [2, 1],
    [2, 2],
  ],
  secondDoorAfter: [
    [3, 0],
    [3, 1],
  ],
} as const satisfies Record<string, FixtureCellPair>;

type AuthoredBoundaryId = keyof typeof AUTHORED_BOUNDARY_PAIRS;

const AUTHORED_DOOR_PAIRS = {
  firstDoor: [
    [-6, 1],
    [-5, 1],
  ],
  secondDoor: [
    [2, 1],
    [3, 1],
  ],
} as const satisfies Record<string, FixtureCellPair>;

type AuthoredDoorId = keyof typeof AUTHORED_DOOR_PAIRS;

function atlasPosition([q, r]: FixtureCell) {
  return { x: q, y: r };
}

/** Derives the converter's documented run token directly from one named
 * fixture edge. It never reads a returned wall run or door gap. */
function expectedRunKey(source: AuthoredBoundaryId): string {
  const pair = AUTHORED_BOUNDARY_PAIRS[source];
  const { a, b } = hexEdgeBetween(
    positionToCube(atlasPosition(pair[0]) as never),
    positionToCube(atlasPosition(pair[1]) as never),
    HEX_SIZE
  );
  return `${vertexKey(a)}|${vertexKey(b)}`;
}

function authoredTruthAtlasFixture() {
  const allPairs = [
    ...Object.values(AUTHORED_BOUNDARY_PAIRS),
    ...Object.values(AUTHORED_DOOR_PAIRS),
  ];
  const cells = new Map<string, ReturnType<typeof atlasPosition>>();
  for (const pair of allPairs) {
    for (const cell of pair) cells.set(cell.join(','), atlasPosition(cell));
  }
  return {
    cells: [...cells.values()],
    boundaries: Object.values(AUTHORED_BOUNDARY_PAIRS).map((pair) => ({
      from: atlasPosition(pair[0]),
      to: atlasPosition(pair[1]),
      blocksMovement: true,
      blocksLineOfSight: true,
    })),
    doorways: Object.entries(AUTHORED_DOOR_PAIRS).map(([connection, pair]) => ({
      connection,
      from: atlasPosition(pair[0]),
      to: atlasPosition(pair[1]),
    })),
  } as never;
}

interface ExpectedRunFact {
  source: AuthoredBoundaryId;
  start: WorldPos;
  end: WorldPos;
}

/** Independent hex-geometry oracle (HEX_SIZE=1): cube center
 * `(q,r) -> (sqrt(3)*(q+r/2), 3r/2)`. The three T source edges share the
 * literal corner `(-sqrt(3)/2, 1/2)`; applying the authored 0.16 corner
 * overlap along their exact edge directions gives the three literal run
 * endpoints below. The door chains are q-translations of the same known
 * straight line with unit direction `(1/2, -sqrt(3)/2)`. Projecting each
 * source edge's far vertex onto that line gives z=2.625/0.375, while the
 * authored 1.0 frame width gives gap boundaries at center +/- 0.5*dir.
 * These decimals were evaluated from those formulas offline and remain
 * literals here; no converter result contributes to an expectation. */
const EXPECTED_RUNS = {
  tNorthWest: {
    source: 'tNorthWest',
    start: { x: -1.7320508075688772, z: 1 },
    end: { x: -0.7274613391789286, z: 0.42 },
  },
  tNorthEast: {
    source: 'tNorthEast',
    start: { x: -1.004589468389949, z: 0.42 },
    end: { x: 0, z: 1 },
  },
  tSouth: {
    source: 'tSouth',
    start: { x: -0.8660254037844386, z: 0.66 },
    end: { x: -0.8660254037844386, z: -0.5 },
  },
  firstDoorBefore: {
    source: 'firstDoorBefore',
    start: { x: -9.309773090682715, z: 2.625 },
    end: { x: -8.910254037844386, z: 1.9330127018922192 },
  },
  firstDoorAfter: {
    source: 'firstDoorAfter',
    start: { x: -8.410254037844386, z: 1.0669872981077808 },
    end: { x: -8.010734985006057, z: 0.375 },
  },
  secondDoorBefore: {
    source: 'secondDoorBefore',
    start: { x: 4.546633369868303, z: 2.625 },
    end: { x: 4.946152422706632, z: 1.9330127018922192 },
  },
  secondDoorAfter: {
    source: 'secondDoorAfter',
    start: { x: 5.446152422706632, z: 1.0669872981077808 },
    end: { x: 5.845671475544961, z: 0.375 },
  },
} as const satisfies Record<AuthoredBoundaryId, ExpectedRunFact>;

interface ExpectedDoorFact {
  connection: AuthoredDoorId;
  center: WorldPos;
  start: WorldPos;
  end: WorldPos;
  rotationY: number;
  framePosition: WorldPos;
  beforeSource: AuthoredBoundaryId;
  beforeSide: 'start' | 'end';
  afterSource: AuthoredBoundaryId;
  afterSide: 'start' | 'end';
}

const EXPECTED_DOORS = {
  firstDoor: {
    connection: 'firstDoor',
    center: { x: -8.660254037844386, z: 1.5 },
    start: { x: -8.910254037844386, z: 1.9330127018922192 },
    end: { x: -8.410254037844386, z: 1.0669872981077808 },
    rotationY: 1.0471975511965976,
    framePosition: { x: -8.651593783806542, z: 1.505 },
    beforeSource: 'firstDoorBefore',
    beforeSide: 'end',
    afterSource: 'firstDoorAfter',
    afterSide: 'start',
  },
  secondDoor: {
    connection: 'secondDoor',
    center: { x: 5.196152422706632, z: 1.5 },
    start: { x: 4.946152422706632, z: 1.9330127018922192 },
    end: { x: 5.446152422706632, z: 1.0669872981077808 },
    rotationY: 1.0471975511965976,
    framePosition: { x: 5.204812676744476, z: 1.505 },
    beforeSource: 'secondDoorBefore',
    beforeSide: 'end',
    afterSource: 'secondDoorAfter',
    afterSide: 'start',
  },
} as const satisfies Record<AuthoredDoorId, ExpectedDoorFact>;

const EXPECTED_T_JOINT = { x: -0.8660254037844386, z: 0.5 } as const;
const T_SOURCES = ['tNorthWest', 'tNorthEast', 'tSouth'] as const;

function expectPoint(actual: WorldPos, expected: WorldPos) {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.z).toBeCloseTo(expected.z, 9);
}

function runBySource(
  runs: readonly AuthoredWallRun[],
  source: AuthoredBoundaryId
): AuthoredWallRun {
  const key = expectedRunKey(source);
  const matches = runs.filter((run) => run.key === key);
  expect(matches, `one run for authored edge ${source} (${key})`).toHaveLength(
    1
  );
  return matches[0]!;
}

function doorByConnection(
  gaps: readonly DoorGapPiece[],
  connection: AuthoredDoorId
): DoorGapPiece {
  const matches = gaps.filter((gap) => gap.connection === connection);
  expect(matches, `one door gap for ${connection}`).toHaveLength(1);
  return matches[0]!;
}

function expectRunFact(run: AuthoredWallRun, expected: ExpectedRunFact) {
  expect(run.key).toBe(expectedRunKey(expected.source));
  expectPoint(run.start, expected.start);
  expectPoint(run.end, expected.end);
}

function expectDoorFact(gap: DoorGapPiece, expected: ExpectedDoorFact) {
  expect(gap.connection).toBe(expected.connection);
  expect(gap.key).toBe(expected.connection);
  expectPoint(gap.position, expected.center);
  expectPoint(gap.leafPosition, expected.start);
  expectPoint(
    {
      x: 2 * gap.position.x - gap.leafPosition.x,
      z: 2 * gap.position.z - gap.leafPosition.z,
    },
    expected.end
  );
  expect(gap.rotationY).toBeCloseTo(expected.rotationY, 9);
}

function pointToSegmentDistance(point: WorldPos, run: AuthoredWallRun) {
  const dx = run.end.x - run.start.x;
  const dz = run.end.z - run.start.z;
  const lengthSquared = dx * dx + dz * dz;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - run.start.x) * dx + (point.z - run.start.z) * dz) /
        lengthSquared
    )
  );
  return Math.hypot(
    point.x - (run.start.x + t * dx),
    point.z - (run.start.z + t * dz)
  );
}

function expectAuthoredFixtureTruth(scene: WallRunScene) {
  for (const expected of Object.values(EXPECTED_RUNS)) {
    expectRunFact(runBySource(scene.wallRuns, expected.source), expected);
  }
  const tRuns = T_SOURCES.map((source) => runBySource(scene.wallRuns, source));
  expect(new Set(tRuns.map((run) => run.key)).size).toBe(3);
  for (const run of tRuns) {
    expect(pointToSegmentDistance(EXPECTED_T_JOINT, run)).toBeLessThan(1e-9);
  }
  for (const expected of Object.values(EXPECTED_DOORS)) {
    expectDoorFact(
      doorByConnection(scene.doorGaps, expected.connection),
      expected
    );
  }
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

  it('renders exact authored T and door runs without mutating canonical converter output or doubling endpoint overlap', async () => {
    const atlas = authoredTruthAtlasFixture();
    const atlasBefore = JSON.parse(JSON.stringify(atlas));
    const scene = boundariesToWallRuns(atlas, HEX_SIZE);
    expectAuthoredFixtureTruth(scene);
    const wallRunsBefore = JSON.parse(JSON.stringify(scene.wallRuns));
    const doorGapsBefore = JSON.parse(JSON.stringify(scene.doorGaps));

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

    expect(atlas).toEqual(atlasBefore);
    expect(scene.wallRuns).toEqual(wallRunsBefore);
    expect(scene.doorGaps).toEqual(doorGapsBefore);
    // Re-check literals after render, including every T arm plus both
    // second-door flanks; snapshots alone must not be their oracle.
    expectAuthoredFixtureTruth(scene);

    const groups = primitiveGroups(renderer);
    const frames = groups.filter(
      (group) => meshName(group) === 'surround-left'
    );
    expect(frames).toHaveLength(2);
    expect(
      groups.filter((group) => meshName(group) === 'door-leaf')
    ).toHaveLength(1);

    for (const expectedDoor of Object.values(EXPECTED_DOORS)) {
      // Door selection is by authored connection, never output order.
      expectDoorFact(
        doorByConnection(scene.doorGaps, expectedDoor.connection),
        expectedDoor
      );
      const matchingFrames = frames.filter(
        (frame) =>
          Math.abs(frame.position.x - expectedDoor.framePosition.x) < 1e-9 &&
          Math.abs(frame.position.z - expectedDoor.framePosition.z) < 1e-9 &&
          Math.abs(frame.rotation.y - expectedDoor.rotationY) < 1e-9
      );
      expect(
        matchingFrames,
        `one literal rendered frame for ${expectedDoor.connection}`
      ).toHaveLength(1);
      expect(matchingFrames[0]!.position.y).toBeCloseTo(0.2, 9);

      const flanks = [
        {
          source: expectedDoor.beforeSource,
          side: expectedDoor.beforeSide,
          boundary: expectedDoor.start,
        },
        {
          source: expectedDoor.afterSource,
          side: expectedDoor.afterSide,
          boundary: expectedDoor.end,
        },
      ] as const;
      for (const flank of flanks) {
        // Run selection is the exact independently-derived source token,
        // and `side` names which authored endpoint meets this door.
        const run = runBySource(scene.wallRuns, flank.source);
        expectRunFact(run, EXPECTED_RUNS[flank.source]);
        const bodyGroups = runBodyGroups(groups, run);
        expect(bodyGroups.length).toBeGreaterThan(0);
        const dx = run.end.x - run.start.x;
        const dz = run.end.z - run.start.z;
        const length = Math.hypot(dx, dz);
        const boundaryProjection =
          ((flank.boundary.x - run.start.x) * dx +
            (flank.boundary.z - run.start.z) * dz) /
          length;
        const tileExtents = bodyGroups.map((group) =>
          projectedBodyExtent([group], run)
        );
        const crossingTiles = tileExtents.filter((extent) =>
          flank.side === 'start'
            ? extent.min < boundaryProjection - 1e-6
            : extent.max > boundaryProjection + 1e-6
        );
        expect(
          crossingTiles,
          `one terminal tile crosses ${expectedDoor.connection} ${flank.source}`
        ).toHaveLength(1);
        const overlap =
          flank.side === 'start'
            ? boundaryProjection - crossingTiles[0]!.min
            : crossingTiles[0]!.max - boundaryProjection;
        expect(overlap).toBeCloseTo(0.08, 6);
        expect(overlap).toBeLessThan(0.080001);
      }
    }
  });

  it('rejects wrong branch selection and wrong authored gap output', () => {
    const scene = boundariesToWallRuns(authoredTruthAtlasFixture(), HEX_SIZE);
    const wrongBranch = runBySource(scene.wallRuns, 'firstDoorBefore');
    expect(() =>
      expectRunFact(wrongBranch, EXPECTED_RUNS.tNorthWest)
    ).toThrow();

    const firstDoor = doorByConnection(scene.doorGaps, 'firstDoor');
    const wrongGap: DoorGapPiece = {
      ...firstDoor,
      position: { x: -8.410254037844386, z: 1.5 },
    };
    expect(() => expectDoorFact(wrongGap, EXPECTED_DOORS.firstDoor)).toThrow();
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
