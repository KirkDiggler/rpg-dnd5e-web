import type { AuthoredWallRun } from '@/components/session/atlasWallRuns';
import type {
  ConnectorRun,
  EnvelopeCorner,
  EnvelopeRun,
  WallRunSegment,
} from '@/hooks/wallRuns';
import type { DungeonShellWallProfile } from '@/rendering/dungeonShellManifest';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

// Same stub convention as SyntyHexWall.test.tsx: WallRunMesh loads real
// Synty GLBs via GlbInstance/useGLTF (W3), so the real-mesh render path
// needs a fake scene rather than trying to fetch an actual .glb file in
// the test environment (jsdom can't resolve a relative URL at all).
vi.mock('@react-three/drei', () => {
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
  const sceneFor = (url: string) => {
    const scene = new THREE.Group();
    if (url.includes('Crypt_Wall_Body_01')) {
      scene.add(box([-1, 0, -0.2], [3, 4, 0.2], 'body'));
    } else if (url.includes('Crypt_Wall_Base_01')) {
      scene.add(box([0, 0, -0.3], [2, 0.4, 0.3], 'base'));
    } else if (url.includes('Crypt_Wall_Cap_01')) {
      scene.add(box([0.25, 0, -0.2], [2.25, 0.4, 0.2], 'cap'));
    } else {
      scene.add(box([-0.5, 0, -0.5], [0.5, 1, 0.5], 'legacy'));
    }
    scene.traverse((node) => {
      if (node instanceof THREE.Mesh) node.userData.file = url;
    });
    return scene;
  };
  return { useGLTF: (url: string) => ({ scene: sceneFor(url) }) };
});

import { CRYPT_MEMORY_COLOR } from './sceneKnowledge';
import { WallRunMesh } from './WallRunMesh';

const SHELL_PROFILE: DungeonShellWallProfile = {
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
    bounds: { min: [-2, 0, -0.3], max: [2, 2.5, 0.3] },
  },
};

/** Counts every rendered THREE.Mesh instance — both literal `<mesh>` JSX
 * (the floor skirts) and `<primitive object={cloned}>`-wrapped GLB
 * instances (the tiled wall pieces / corner fittings, via GlbInstance) —
 * see `skirtMaterialsFor`/`glbMaterialsFor`'s shared doc comment below for
 * why `type === 'Mesh'` and `instance instanceof THREE.Mesh` are each
 * individually necessary (and, empirically, mutually exclusive) here. */
function countMeshes(renderer: {
  scene: { findAll: (pred: (node: unknown) => boolean) => unknown[] };
}): number {
  return renderer.scene.findAll((node) => {
    const n = node as { type?: string; instance?: unknown };
    return n.type === 'Mesh' || n.instance instanceof THREE.Mesh;
  }).length;
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

function worldBox(group: THREE.Group): THREE.Box3 {
  group.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(group);
}

function expectCloseVector(
  actual: THREE.Vector3,
  expected: [number, number, number]
) {
  expect(actual.x).toBeCloseTo(expected[0], 6);
  expect(actual.y).toBeCloseTo(expected[1], 6);
  expect(actual.z).toBeCloseTo(expected[2], 6);
}

describe('WallRunMesh R3F scene', () => {
  it('renders one body, base, and cap per profile tile without a floor skirt', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WallRunMesh
        envelopeRuns={[]}
        connectorRuns={[]}
        authoredRuns={[
          {
            key: 'profile-run',
            start: { x: 0, z: 0 },
            end: { x: 0, z: 2 },
            facing: { x: 1, z: 0 },
            height: 0,
          },
        ]}
        profile={SHELL_PROFILE}
      />
    );

    // Two tiled slots, with body/base/cap geometry for each slot. Profile
    // mode deliberately has no placeholder FloorSkirtBox.
    expect(countMeshes(renderer)).toBe(6);
    expect(
      renderer.scene.findAll((node) => {
        const n = node as { instance?: unknown };
        return n.instance instanceof THREE.Mesh;
      })
    ).toHaveLength(6);
  });

  it('uses exact profile files, baked X/Y/Z dimensions, pivot positions, both facings, and residual piece widths', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WallRunMesh
        envelopeRuns={[]}
        connectorRuns={[]}
        authoredRuns={[
          {
            key: 'forward',
            start: { x: 0, z: 0 },
            end: { x: 2.5, z: 0 },
            facing: { x: 0, z: 1 },
            height: 0,
          },
          {
            key: 'reverse-facing',
            start: { x: 0, z: 2 },
            end: { x: 2.5, z: 2 },
            facing: { x: 0, z: -1 },
            height: 0,
          },
        ]}
        profile={SHELL_PROFILE}
      />
    );
    const groups = primitiveGroups(renderer);
    expect(groups).toHaveLength(18);
    expect(
      [
        ...new Set(
          groups.map((group) => (group.children[0] as THREE.Mesh).userData.file)
        ),
      ].sort()
    ).toEqual([
      '/models/synty/env/Crypt_Wall_Base_01.glb',
      '/models/synty/env/Crypt_Wall_Body_01.glb',
      '/models/synty/env/Crypt_Wall_Cap_01.glb',
    ]);
    expect(groups.map((group) => group.children[0]!.name)).toEqual(
      Array(6).fill(['body', 'base', 'cap']).flat()
    );

    const byRole = (role: string) =>
      groups
        .filter((group) => group.children[0]!.name === role)
        .sort(
          (a, b) => a.position.z - b.position.z || a.position.x - b.position.x
        );
    const expectedXs = {
      body: [
        [0.16833333333333333, 1.0016666666666667, 1.835],
        [0.665, 1.4983333333333333, 2.331666666666667],
      ],
      base: [
        [-0.08, 0.7533333333333333, 1.5866666666666667],
        [0.9133333333, 1.7466666667, 2.58],
      ],
      cap: [
        [-0.20416666666666666, 0.6291666666666667, 1.4625],
        [1.0375, 1.8708333333333333, 2.704166666666667],
      ],
    } as const;
    for (const role of ['body', 'base', 'cap'] as const) {
      const roleGroups = byRole(role);
      for (let row = 0; row < 2; row += 1) {
        const rowGroups = roleGroups.filter(
          (group) => Math.abs(group.position.z - (row === 0 ? 0 : 2)) < 1e-8
        );
        expect(rowGroups).toHaveLength(3);
        for (let i = 0; i < 3; i += 1) {
          const group = rowGroups[i]!;
          expect(group.position.x).toBeCloseTo(expectedXs[role][row][i], 8);
          expect(group.position.y).toBeCloseTo(role === 'cap' ? 2.6 : 0.2, 8);
          expect(group.rotation.y).toBeCloseTo(row === 0 ? 0 : Math.PI, 8);
          const box = worldBox(group);
          const slotMin = i * (5 / 6) - 0.08;
          const slotMax = (i + 1) * (5 / 6) + 0.08;
          const yMax = role === 'body' ? 2.6 : role === 'cap' ? 2.9 : 0.5;
          const zHalf = role === 'base' ? 0.225 : 0.15;
          expectCloseVector(box.min, [
            slotMin,
            role === 'cap' ? 2.6 : 0.2,
            (row === 0 ? 0 : 2) - zHalf,
          ]);
          expectCloseVector(box.max, [
            slotMax,
            yMax,
            (row === 0 ? 0 : 2) + zHalf,
          ]);
        }
      }
    }
  });

  it('keeps the actual run end overlap at 0.08 once, including a residual-width run', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WallRunMesh
        envelopeRuns={[]}
        connectorRuns={[]}
        authoredRuns={[
          {
            key: 'residual',
            start: { x: 0, z: 0 },
            end: { x: 1.5, z: 0 },
            facing: { x: 0, z: 1 },
            height: 0,
          },
        ]}
        profile={SHELL_PROFILE}
      />
    );
    const bodies = primitiveGroups(renderer)
      .filter((group) => group.children[0]!.name === 'body')
      .sort((a, b) => a.position.x - b.position.x);
    expect(bodies).toHaveLength(2);
    const boxes = bodies.map(worldBox);
    expect(boxes[0]!.max.x - boxes[0]!.min.x).toBeCloseTo(0.91, 6);
    expect(boxes[1]!.max.x - boxes[1]!.min.x).toBeCloseTo(0.91, 6);
    expect(boxes[0]!.max.x - boxes[1]!.min.x).toBeCloseTo(0.16, 6);
    expect(boxes[1]!.max.x - 1.5).toBeCloseTo(0.08, 6);
  });

  it('uses authored 2x and cutaway effective heights while keeping the cap visible top above the body', async () => {
    const authored = await ReactThreeTestRenderer.create(
      <WallRunMesh
        envelopeRuns={[]}
        connectorRuns={[]}
        authoredRuns={[
          {
            key: 'double',
            start: { x: 0, z: 0 },
            end: { x: 1, z: 0 },
            facing: { x: 0, z: 1 },
            height: 2,
          },
        ]}
        wallHeight={2.4}
        profile={SHELL_PROFILE}
      />
    );
    const authoredGroups = primitiveGroups(authored);
    const authoredBody = authoredGroups.find(
      (group) => group.children[0]!.name === 'body'
    )!;
    const authoredCap = authoredGroups.find(
      (group) => group.children[0]!.name === 'cap'
    )!;
    expectCloseVector(worldBox(authoredBody).max, [1.08, 5, 0.15]);
    expectCloseVector(worldBox(authoredCap).min, [-0.08, 5, -0.15]);
    expect(worldBox(authoredCap).max.y).toBeCloseTo(5.3, 6);

    const cutaway = await ReactThreeTestRenderer.create(
      <WallRunMesh
        envelopeRuns={[
          {
            regionId: 'near',
            side: 'left',
            start: { x: 0, z: 0 },
            end: { x: 1, z: 0 },
            facing: { x: 1, z: 1 },
          },
        ]}
        connectorRuns={[]}
        wallHeight={2.4}
        wallCutaway
        profile={SHELL_PROFILE}
      />
    );
    const cutawayGroups = primitiveGroups(cutaway);
    expect(
      worldBox(
        cutawayGroups.find((group) => group.children[0]!.name === 'body')!
      ).max.y
    ).toBeCloseTo(0.5, 6);
    expect(
      worldBox(
        cutawayGroups.find((group) => group.children[0]!.name === 'cap')!
      ).max.y
    ).toBeCloseTo(0.8, 6);

    const farCutaway = await ReactThreeTestRenderer.create(
      <WallRunMesh
        envelopeRuns={[
          {
            regionId: 'far',
            side: 'right',
            start: { x: 0, z: 0 },
            end: { x: 1, z: 0 },
            facing: { x: -1, z: -1 },
          },
        ]}
        connectorRuns={[]}
        wallHeight={2.4}
        wallCutaway
        profile={SHELL_PROFILE}
      />
    );
    const farCutawayGroups = primitiveGroups(farCutaway);
    expect(
      worldBox(
        farCutawayGroups.find((group) => group.children[0]!.name === 'body')!
      ).max.y
    ).toBeCloseTo(2.6, 6);
    expect(
      worldBox(
        farCutawayGroups.find((group) => group.children[0]!.name === 'cap')!
      ).max.y
    ).toBeCloseTo(2.9, 6);
  });

  it('does not mutate envelope, connector, or fallback inputs while rendering profile pieces', async () => {
    const envelopeRuns: EnvelopeRun[] = [
      {
        regionId: 'envelope',
        side: 'left',
        start: { x: -2, z: 0 },
        end: { x: -1, z: 0 },
        facing: { x: 0, z: 1 },
      },
    ];
    const connectorRuns: ConnectorRun[] = [
      {
        doorId: 'connector',
        regionAId: 'a',
        regionBId: 'b',
        segments: [{ start: { x: 0, z: 0 }, end: { x: 1, z: 0 } }],
        coveredRows: { minRow: 0, maxRow: 1 },
        facing: { x: 0, z: 1 },
      },
    ];
    const fallbackSegments: WallRunSegment[] = [
      { start: { x: 2, z: 0 }, end: { x: 3, z: 0 } },
    ];
    const envelopeBefore = JSON.parse(JSON.stringify(envelopeRuns));
    const connectorBefore = JSON.parse(JSON.stringify(connectorRuns));
    const fallbackBefore = JSON.parse(JSON.stringify(fallbackSegments));
    const renderer = await ReactThreeTestRenderer.create(
      <WallRunMesh
        envelopeRuns={envelopeRuns}
        connectorRuns={connectorRuns}
        fallbackSegments={fallbackSegments}
        profile={SHELL_PROFILE}
      />
    );
    expect(primitiveGroups(renderer).length).toBeGreaterThan(0);
    expect(envelopeRuns).toEqual(envelopeBefore);
    expect(connectorRuns).toEqual(connectorBefore);
    expect(fallbackSegments).toEqual(fallbackBefore);
  });

  it('does not mutate authored T-junction or multiple-run inputs while rendering profile pieces', async () => {
    const authoredRuns: AuthoredWallRun[] = [
      {
        key: 'trunk',
        start: { x: 0, z: 0 },
        end: { x: 2, z: 0 },
        facing: { x: 0, z: 1 },
        height: 0,
      },
      {
        key: 'arm',
        start: { x: 1, z: 0 },
        end: { x: 1, z: 1 },
        facing: { x: 1, z: 0 },
        height: 0,
      },
      {
        key: 'second',
        start: { x: 3, z: 0 },
        end: { x: 4.25, z: 0 },
        facing: { x: 0, z: 1 },
        height: 0,
      },
    ];
    const before = JSON.parse(JSON.stringify(authoredRuns));
    const renderer = await ReactThreeTestRenderer.create(
      <WallRunMesh
        envelopeRuns={[]}
        connectorRuns={[]}
        authoredRuns={authoredRuns}
        profile={SHELL_PROFILE}
      />
    );
    expect(primitiveGroups(renderer)).toHaveLength(12);
    expect(authoredRuns).toEqual(before);
  });

  it('tiles real wall pieces along each envelope run and connector segment, plus one skirt box per run/segment', async () => {
    const envelopeRuns: EnvelopeRun[] = [
      {
        regionId: 'hall',
        side: 'left',
        start: { x: 0, z: 0 },
        end: { x: 0, z: 4 },
        facing: { x: -1, z: 0 },
      },
      {
        regionId: 'hall',
        side: 'right',
        start: { x: 4, z: 0 },
        end: { x: 4, z: 4 },
        facing: { x: 1, z: 0 },
      },
    ];
    const connectorRuns: ConnectorRun[] = [
      {
        doorId: 'door-1',
        regionAId: 'entrance',
        regionBId: 'hall',
        segments: [
          { start: { x: 6, z: 0 }, end: { x: 6, z: 1 } },
          { start: { x: 6, z: 3 }, end: { x: 6, z: 4 } },
        ],
        coveredRows: { minRow: 0, maxRow: 4 },
        facing: { x: 1, z: 0 },
      },
    ];

    const renderer = await ReactThreeTestRenderer.create(
      <WallRunMesh envelopeRuns={envelopeRuns} connectorRuns={connectorRuns} />
    );

    // Nominal piece width is 1.0 world unit: each length-4 envelope run
    // tiles to round(4/1)=4 pieces (8 total across both), each length-1
    // connector segment tiles to 1 piece (2 total) — 10 tiled wall
    // pieces — plus 4 floor-skirt boxes (one per run/segment, unchanged
    // from W2) = 14 total mesh instances.
    expect(countMeshes(renderer)).toBe(14);
  });

  it('accepts envelopeCorners without rendering a dedicated corner-fitting GLB (round-2 W3/W4: overlap-miter replaces the corner-fitting piece, see WallRunMesh’s own doc comment)', async () => {
    const envelopeRuns: EnvelopeRun[] = [
      {
        regionId: 'hall',
        side: 'left',
        start: { x: 0, z: 0 },
        end: { x: 0, z: 1 },
        facing: { x: -1, z: 0 },
      },
    ];
    const envelopeCorners: EnvelopeCorner[] = [
      {
        regionId: 'hall',
        corner: 'topLeft',
        position: { x: 0, z: 0 },
        rotationY: 0,
      },
      {
        regionId: 'hall',
        corner: 'topRight',
        position: { x: 1, z: 0 },
        rotationY: 0,
      },
    ];

    const renderer = await ReactThreeTestRenderer.create(
      <WallRunMesh
        envelopeRuns={envelopeRuns}
        envelopeCorners={envelopeCorners}
        connectorRuns={[]}
      />
    );

    // 1 tiled wall piece (length-1 run) + 1 skirt = 2 — envelopeCorners is
    // accepted (a caller passing it isn't an error) but no longer renders
    // anything; adjacent runs self-cover the corner via cornerExtension
    // instead (wallRuns.ts).
    expect(countMeshes(renderer)).toBe(2);
  });

  it('renders connector-fallback segments with the same tiled visual language (W3 fallback restyle)', async () => {
    const fallbackSegments: WallRunSegment[] = [
      { start: { x: 10, z: 0 }, end: { x: 10, z: 1 } },
    ];

    const renderer = await ReactThreeTestRenderer.create(
      <WallRunMesh
        envelopeRuns={[]}
        connectorRuns={[]}
        fallbackSegments={fallbackSegments}
      />
    );

    // 1 tiled wall piece + 1 skirt = 2.
    expect(countMeshes(renderer)).toBe(2);
  });

  it('renders authored wall runs with the same tiled visual language and facing correction as envelope runs', async () => {
    const authoredRuns: AuthoredWallRun[] = [
      {
        key: 'left-run',
        start: { x: 0, z: 0 },
        end: { x: 0, z: 4 },
        facing: { x: -1, z: 0 },
        height: 0,
      },
      {
        key: 'right-run',
        start: { x: 4, z: 0 },
        end: { x: 4, z: 4 },
        facing: { x: 1, z: 0 },
        height: 0,
      },
    ];

    const renderer = await ReactThreeTestRenderer.create(
      <WallRunMesh
        envelopeRuns={[]}
        connectorRuns={[]}
        authoredRuns={authoredRuns}
      />
    );

    // Same tiling arithmetic as the envelope-run test above: 2 runs of
    // length 4 -> 4 pieces each (8 total) + 1 skirt per run (2) = 10.
    expect(countMeshes(renderer)).toBe(10);
  });

  it('skips degenerate zero-length segments without throwing', async () => {
    const envelopeRuns: EnvelopeRun[] = [
      {
        regionId: 'r',
        side: 'left',
        start: { x: 1, z: 1 },
        end: { x: 1, z: 1 },
        facing: { x: -1, z: 0 },
      },
    ];
    const renderer = await ReactThreeTestRenderer.create(
      <WallRunMesh envelopeRuns={envelopeRuns} connectorRuns={[]} />
    );
    expect(countMeshes(renderer)).toBe(0);
  });

  it('renders nothing for empty runs', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WallRunMesh envelopeRuns={[]} connectorRuns={[]} />
    );
    expect(countMeshes(renderer)).toBe(0);
  });

  it('uses crypt materials for a remembered envelope wall and skirt', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WallRunMesh
        envelopeRuns={[
          {
            regionId: 'remembered-room',
            side: 'left',
            start: { x: 0, z: 0 },
            end: { x: 0, z: 4 },
            facing: { x: -1, z: 0 },
          },
        ]}
        connectorRuns={[]}
        rememberedEnvelopeRegionIds={new Set(['remembered-room'])}
      />
    );

    // Length-4 run tiles to 4 wall pieces (round(4/1)) + 1 skirt box.
    expectCryptMaterials(renderer, 4);
  });

  it('uses crypt materials for a remembered connector wall and skirt', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WallRunMesh
        envelopeRuns={[]}
        connectorRuns={[
          {
            doorId: 'remembered-door',
            regionAId: 'a',
            regionBId: 'b',
            segments: [{ start: { x: 0, z: 0 }, end: { x: 0, z: 4 } }],
            coveredRows: { minRow: 0, maxRow: 4 },
            facing: { x: 1, z: 0 },
          },
        ]}
        rememberedConnectorDoorIds={new Set(['remembered-door'])}
      />
    );

    expectCryptMaterials(renderer, 4);
  });

  it("keeps a live (non-remembered) run's real Synty wall pieces untinted and the skirt on its own placeholder color", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WallRunMesh
        envelopeRuns={[
          {
            regionId: 'live-room',
            side: 'left',
            start: { x: 0, z: 0 },
            end: { x: 0, z: 4 },
            facing: { x: -1, z: 0 },
          },
        ]}
        connectorRuns={[]}
      />
    );

    // The 4 tiled wall pieces are the mocked GLB's own material (white,
    // untinted — no spaceTheme/remembered here), NOT a hardcoded
    // placeholder color (W3 replaced the old WallRunBox entirely).
    const glbMaterials = glbMaterialsFor(renderer);
    expect(glbMaterials).toHaveLength(4);
    for (const material of glbMaterials) {
      expect(material.color.getHexString()).toBe('ffffff');
    }

    // The skirt is still a literal placeholder box (this file's own doc
    // comment — W3's scope is the wall/corner meshes, not the skirt).
    const skirtMaterials = skirtMaterialsFor(renderer);
    expect(skirtMaterials).toHaveLength(1);
    expect(skirtMaterials[0]!.color.getHexString()).toBe('3a3630');
  });
});

/** `node.type === 'Mesh'` matches EVERY rendered mesh here — both a
 * literal `<mesh>` JSX element (the floor skirt) and a `<primitive
 * object={cloned}>`'s nested mesh (the mocked GLB pieces) — `type` is a
 * plain string match on the underlying THREE class name, unaffected by
 * which module instance built it. `instance instanceof THREE.Mesh`
 * (this file's own `THREE` import) is what actually discriminates them,
 * and only because of the "Multiple instances of Three.js being
 * imported" warning this suite triggers: the mock GLB's mesh was built
 * with THIS FILE's `new THREE.Mesh(...)`, so it satisfies `instanceof`
 * against this file's `THREE.Mesh` — but a literal `<mesh>` is built by
 * react-three-fiber's OWN internally-resolved (different) THREE module,
 * so it does NOT. The floor skirt is therefore `type === 'Mesh'` AND
 * NOT `instanceof` — verified empirically, not assumed; don't "simplify"
 * this back to `type === 'Mesh'` alone. */
function skirtMaterialsFor(renderer: {
  scene: { findAll: (predicate: (node: unknown) => boolean) => unknown[] };
}): THREE.MeshStandardMaterial[] {
  return renderer.scene
    .findAll((node) => {
      const n = node as { type?: string; instance?: unknown };
      return n.type === 'Mesh' && !(n.instance instanceof THREE.Mesh);
    })
    .map(
      (node) =>
        (node as { instance: { material: THREE.MeshStandardMaterial } })
          .instance.material
    );
}

/** Every real (mocked) GLB piece's material — a mesh nested inside a
 * `<primitive>` (tiled wall pieces, corner fittings), via `instance
 * instanceof THREE.Mesh` — see skirtMaterialsFor's doc comment for why
 * this reliably excludes the floor skirt in this test environment. */
function glbMaterialsFor(renderer: {
  scene: { findAll: (predicate: (node: unknown) => boolean) => unknown[] };
}): THREE.MeshStandardMaterial[] {
  return renderer.scene
    .findAll(
      (node) => (node as { instance?: unknown }).instance instanceof THREE.Mesh
    )
    .map(
      (node) =>
        (node as { instance: { material: THREE.MeshStandardMaterial } })
          .instance.material
    );
}

function expectCryptMaterials(
  renderer: {
    scene: { findAll: (predicate: (node: unknown) => boolean) => unknown[] };
  },
  expectedGlbCount: number
) {
  const glbMaterials = glbMaterialsFor(renderer);
  const skirtMaterials = skirtMaterialsFor(renderer);
  expect(glbMaterials).toHaveLength(expectedGlbCount);
  expect(skirtMaterials).toHaveLength(1);
  for (const material of [...glbMaterials, ...skirtMaterials]) {
    expect(material.color.getHex()).toBe(CRYPT_MEMORY_COLOR.getHex());
    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(true);
    expect(material.emissive.getHexString()).toBe('111923');
    expect(material.emissiveIntensity).toBe(0.08);
  }
}
