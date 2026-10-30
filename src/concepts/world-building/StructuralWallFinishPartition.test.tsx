import { resolveWorldAsset } from '@/generated/worldAssetCatalog';
import type { WorldMaterialCatalog } from '@/rendering/worldMaterialCatalog';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  finishRoomFixture,
  FIT_WALL_REF,
  GRAY_REF,
} from './roomFinishTestFixtures';
import {
  surfaceRepeatSceneUnits,
  type WallFinishSpan,
} from './roomWallFinishes';
import { StructuralWallSurfacePieces } from './StructuralWallSurfaces';
import { setWallFinishes } from './wallFinishEdits';
import { projectWallFinishes } from './wallFinishProjection';
import type { WorldPropModelProps } from './WorldPropModel';
// Stop only at the model leaf: this test owns projection → partition → fitted
// piece/finish inputs. Real loaded-model charts and GPU appearance have separate
// model tests and the operator-accepted native walk.
vi.mock('./WorldPropModel', () => ({
  WorldPropModel: (props: WorldPropModelProps) => (
    <group name="finish-partition-probe" userData={{ props }} />
  ),
}));
vi.mock('@react-three/drei', () => ({ Html: () => null }));
const image = {
  url: '/test.png',
  sha256: 'a'.repeat(64),
  sizeBytes: 10,
  width: 1,
  height: 1,
};
const small = 'dnd5e:material:test:small_gray';
const material = {
  ref: GRAY_REF,
  displayName: 'Large',
  family: 'masonry',
  baseColor: image,
  normal: image,
  repeatMeters: [3.3, 3.3] as [number, number],
  normalScale: [1, 1] as [number, number],
  roughness: 0.5,
  metalness: 0,
};
const catalog: WorldMaterialCatalog = {
  kind: 'candidate',
  catalogSha256: 'a'.repeat(64),
  materials: [material, { ...material, ref: small, displayName: 'Small' }],
  surfaces: [
    {
      assetRef: FIT_WALL_REF,
      glbSha256: resolveWorldAsset(FIT_WALL_REF)!.glbSha256,
      bindings: [
        {
          id: 'front',
          node: 'WallBody_v1',
          material: 'Masonry_Front',
          side: 'positive-z',
          family: 'masonry',
        },
        {
          id: 'back',
          node: 'WallBody_v1',
          material: 'Masonry_Back',
          side: 'negative-z',
          family: 'masonry',
        },
      ],
    },
  ],
};
function document() {
  const draft = finishRoomFixture(true);
  const divider = draft.room.walls!.find((wall) => wall.id === 'divider')!;
  divider.line = { start: { x: 3, z: 0 }, end: { x: 3, z: 4 } };
  return draft;
}
/** Two owners of the north face, split where the divider meets it. Region
 * charts no longer resolve from walls (rpg-project#725: no region is
 * wall-bound), so the rows a chart provider would hand the pieces are built
 * here; the partition into fitted pieces is what this test owns. */
function northSpans(): WallFinishSpan[] {
  const row = (
    regionId: string,
    ref: string,
    start: number,
    end: number
  ): WallFinishSpan => {
    const material = catalog.materials.find((m) => m.ref === ref)!;
    return {
      regionId,
      wallId: 'north',
      side: 'positive-z',
      start,
      end,
      provider: catalog.surfaces[0],
      material,
      chart: {
        surfaceId: 'front',
        phase: start,
        direction: 1,
        repeat: surfaceRepeatSceneUnits(material),
        elevation: 0,
      },
    };
  };
  return [row('left', GRAY_REF, 0, 3), row('right', small, 3, 8)];
}
function probes(
  renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>
): Array<{ props: WorldPropModelProps; x: number }> {
  const rows: Array<{ props: WorldPropModelProps; x: number }> = [];
  (renderer.scene.instance as THREE.Object3D).traverse((node) => {
    if (node.name === 'finish-partition-probe')
      rows.push({
        props: node.userData.props as WorldPropModelProps,
        x: node.parent!.position.x,
      });
  });
  return rows.sort(
    (a, b) => a.props.plainWallFit!.offset! - b.props.plainWallFit!.offset!
  );
}
describe('room finish composition through real visual pieces', () => {
  it('splits a repeated piece internally at room ownership and carries only terminal miters', async () => {
    const draft = document(),
      before = structuredClone(draft);
    const wall = draft.room.walls!.find((row) => row.id === 'north')!;
    const renderer = await ReactThreeTestRenderer.create(
      <StructuralWallSurfacePieces
        wall={wall}
        endFits={{ start: 1, end: -1 }}
        finishSpans={northSpans()}
      />
    );
    const rows = probes(renderer);
    expect(
      rows.map(({ props }) => [
        props.plainWallFit!.offset,
        props.plainWallFit!.width,
      ])
    ).toEqual([
      [0, 3],
      [3, 1],
      [4, 4],
    ]);
    expect(rows.map(({ x }) => x)).toEqual([1.5, 3.5, 6]);
    expect(
      rows.map(({ props }) =>
        props.surfacePlans!.map((plan) => plan.material.ref)
      )
    ).toEqual([[GRAY_REF], [small], [small]]);
    expect(
      rows.map(({ props }) => [
        props.plainWallFit!.start,
        props.plainWallFit!.end,
      ])
    ).toEqual([
      [1, undefined],
      [undefined, undefined],
      [undefined, -1],
    ]);
    expect(rows[1].props.surfacePlans![0].chart).toEqual(
      rows[2].props.surfacePlans![0].chart
    );
    expect(
      rows.every(({ props }) => props.surfaceProvider === catalog.surfaces[0])
    ).toBe(true);
    expect(draft).toEqual(before);
    await renderer.unmount();
  });
  // The divider's two faces now come from wall-owned face choices: explicit
  // intent is the finish that still resolves (rpg-project#725).
  it('keeps both face plans on the same shared-divider geometry', async () => {
    const draft = document();
    draft.scene = setWallFinishes(draft.scene, 'divider', {
      'positive-z': GRAY_REF,
      'negative-z': small,
    });
    const projection = projectWallFinishes(draft, catalog),
      wall = draft.room.walls!.find((row) => row.id === 'divider')!;
    const renderer = await ReactThreeTestRenderer.create(
      <StructuralWallSurfacePieces
        wall={wall}
        finishSpans={projection.spans.filter((span) => span.wallId === wall.id)}
      />
    );
    const rows = probes(renderer);
    expect(rows).toHaveLength(1);
    expect(
      rows[0].props.surfacePlans!.map((plan) => plan.material.ref).sort()
    ).toEqual([GRAY_REF, small].sort());
    expect(
      new Set(rows[0].props.surfacePlans!.map((plan) => plan.chart.surfaceId))
    ).toEqual(new Set(['front', 'back']));
    expect(rows[0].props.plainWallFit!.width).toBe(4);
    await renderer.unmount();
  });
});
