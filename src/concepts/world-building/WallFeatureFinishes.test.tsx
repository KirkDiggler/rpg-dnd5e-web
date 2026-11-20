import type { WorldMaterialCatalog } from '@/rendering/worldMaterialCatalog';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { expect, it, vi } from 'vitest';
import { StructuralWallSurfacePieces } from './StructuralWallSurfaces';
import type { StructuralWallSurface } from './structuralWalls';
import { projectCapturedWallFinishes } from './wallFinishProjection';

vi.mock('./WorldPropModel', () => ({
  WorldPropModel: ({
    surfacePlans,
  }: {
    surfacePlans: readonly { chart: { surfaceId: string; phase: number } }[];
  }) => (
    <group name="feature-finish-probe" userData={{ plans: surfacePlans }} />
  ),
}));
const image = {
  url: '/test.png',
  sha256: 'a'.repeat(64),
  sizeBytes: 1,
  width: 1,
  height: 1,
};
const ref = 'dnd5e:env:fantasy-kingdom:castle_wall_02';
const finish = 'dnd5e:material:test:stone';
const catalog: WorldMaterialCatalog = {
  kind: 'candidate',
  catalogSha256: 'a'.repeat(64),
  materials: [
    {
      ref: finish,
      displayName: 'Stone',
      family: 'masonry',
      baseColor: image,
      normal: image,
      repeatMeters: [3.3, 3.3],
      normalScale: [1, 1],
      roughness: 0.5,
      metalness: 0,
    },
  ],
  surfaces: [
    {
      assetRef: ref,
      glbSha256: 'b'.repeat(64),
      bindings: [
        ...['frame', 'above', 'cap'].map((part) => ({
          id: part + '-front',
          node: 'Wall_' + part,
          material: 'Front',
          side: 'positive-z' as const,
          family: 'masonry',
        })),
        {
          id: 'back',
          node: 'Wall_frame',
          material: 'Back',
          side: 'negative-z',
          family: 'masonry',
        },
        {
          id: 'trim',
          node: 'Wall_frame',
          material: 'Trim',
          side: 'positive-z',
          family: 'trim',
        },
      ],
    },
  ],
};
const wall: StructuralWallSurface = {
  id: 'feature',
  label: 'Feature',
  line: { start: { x: 0, z: 0 }, end: { x: 3.75, z: 0 } },
  appearance: { assetRef: ref, height: 6, thickness: 0.375, elevation: 0 },
  openings: [],
};
it('projects one logical face choice to fixed, repeated and cap masonry, not trim or the other face', async () => {
  const spans = projectCapturedWallFinishes(
    wall,
    { 'positive-z': finish },
    catalog
  );
  expect(spans).toHaveLength(1);
  const view = await ReactThreeTestRenderer.create(
    <StructuralWallSurfacePieces wall={wall} finishSpans={spans} />
  );
  const probes = view.scene.findAllByProps({ name: 'feature-finish-probe' });
  expect(probes.length).toBeGreaterThan(0);
  for (const probe of probes) {
    const plans = probe.instance.userData.plans as {
      chart: { surfaceId: string; phase: number };
    }[];
    expect(plans.map((p) => p.chart.surfaceId)).toEqual([
      'frame-front',
      'above-front',
      'cap-front',
    ]);
    expect(new Set(plans.map((p) => p.chart.phase)).size).toBe(1);
  }
  await view.unmount();
});
