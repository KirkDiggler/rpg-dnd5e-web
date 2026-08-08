import type { AuthoredWallRun } from '@/hooks/authoredWallRuns';
import type {
  ConnectorRun,
  EnvelopeCorner,
  EnvelopeRun,
  WallRunSegment,
} from '@/hooks/wallRuns';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

// Same stub convention as SyntyHexWall.test.tsx: WallRunMesh loads real
// Synty GLBs via GlbInstance/useGLTF (W3), so the real-mesh render path
// needs a fake scene rather than trying to fetch an actual .glb file in
// the test environment (jsdom can't resolve a relative URL at all).
vi.mock('@react-three/drei', () => {
  const scene = new THREE.Group();
  scene.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    )
  );
  return { useGLTF: () => ({ scene }) };
});

import { CRYPT_MEMORY_COLOR } from './sceneKnowledge';
import { WallRunMesh } from './WallRunMesh';

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

describe('WallRunMesh R3F scene', () => {
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
      },
      {
        key: 'right-run',
        start: { x: 4, z: 0 },
        end: { x: 4, z: 4 },
        facing: { x: 1, z: 0 },
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
