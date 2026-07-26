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

import { WallRunMesh } from './WallRunMesh';

/** Counts every rendered THREE.Mesh instance — both literal `<mesh>` JSX
 * (the floor skirts; the R3F test renderer reports these as
 * `node.type === 'Mesh'`, the original placeholder-era test's own
 * convention) and `<primitive object={cloned}>`-wrapped GLB instances
 * (the tiled wall pieces / corner fittings, via GlbInstance — reported
 * only via `node.instance instanceof THREE.Mesh`, SyntyHexWall.test.tsx's
 * convention for primitives, NOT `node.type`, which is `'primitive'`). */
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
      },
      {
        regionId: 'hall',
        side: 'right',
        start: { x: 4, z: 0 },
        end: { x: 4, z: 4 },
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

  it('places one wall-corner-outer fitting per envelope corner, in addition to the tiled runs', async () => {
    const envelopeRuns: EnvelopeRun[] = [
      {
        regionId: 'hall',
        side: 'left',
        start: { x: 0, z: 0 },
        end: { x: 0, z: 1 },
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

    // 1 tiled wall piece (length-1 run) + 1 skirt + 2 corner fittings = 4.
    expect(countMeshes(renderer)).toBe(4);
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

  it('skips degenerate zero-length segments without throwing', async () => {
    const envelopeRuns: EnvelopeRun[] = [
      {
        regionId: 'r',
        side: 'left',
        start: { x: 1, z: 1 },
        end: { x: 1, z: 1 },
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
});
