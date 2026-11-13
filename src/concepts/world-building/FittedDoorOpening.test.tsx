import { GENERATED_WORLD_MATERIALS } from '@/generated/worldMaterialCatalog';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { WORLD_BUILDING_CATALOG_BY_REF } from './catalog';
import type { WallFinishSpan } from './roomWallFinishes';
import { FittedDoorSurface } from './StructuralWallSurfaces';
import type { WorldPropModelProps } from './WorldPropModel';

vi.mock('./WorldPropModel', () => ({
  WorldPropModel: (props: WorldPropModelProps) => (
    <group
      name="opening-probe"
      userData={{
        fit: props.wallOpeningFit,
        provider: props.surfaceProvider,
        plans: props.surfacePlans,
        open: props.open,
        hideDoorLeaves: props.hideDoorLeaves,
      }}
    />
  ),
}));
const assetRef = 'dnd5e:env:fantasy-kingdom:castle_wall_doorway_single_01';
const entry = WORLD_BUILDING_CATALOG_BY_REF.get(assetRef)!;
if (entry.source !== 'generated') throw Error('Expected provider fixture');
const fit = entry.asset.wallOpening!;
const pose = {
  point: { x: 10, z: -3 },
  rotationY: 0.2,
  y: 2,
  width: fit.widthMeters,
  height: 4,
  thickness: 0.4,
};
const finish: WallFinishSpan = {
  wallId: 'wall',
  side: 'positive-z',
  start: 0,
  end: 12,
  provider: { assetRef: 'wall', glbSha256: 'a'.repeat(64), bindings: [] },
  material: GENERATED_WORLD_MATERIALS[0],
  chart: {
    surfaceId: 'wall-face-A',
    phase: 0.25,
    direction: 1,
    repeat: [3.75, 3.75],
    elevation: 2,
  },
};

describe('Studio fixed surround rendering seam', () => {
  it('renders supplied wrapped frame facts without a parent wall or source chart', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <FittedDoorSurface
        doorId="door"
        assetRef={assetRef}
        pose={pose}
        state="closed"
        framePresentation={{
          span: {
            before: fit.leftExtentMeters,
            after: fit.frameWidthMeters - fit.leftExtentMeters,
          },
          faceFinishes: [
            {
              side: 'positive-z',
              materialRef: finish.material.ref,
              phaseU: 0.6,
            },
          ],
        }}
        requireFramePresentation
      />
    );
    const probe = renderer.scene.findByProps({ name: 'opening-probe' }).instance
      .userData;
    expect(probe.plans).toHaveLength(1);
    expect(probe.plans[0].material.ref).toBe(finish.material.ref);
    expect(
      probe.plans[0].chart.phase / probe.plans[0].chart.repeat[0]
    ).toBeCloseTo(0.6);
    expect(probe.fit.offset).toBeCloseTo(-fit.leftExtentMeters);
    await renderer.unmount();
  });
  it('keeps a known fixed surround when mutable leaf state is unknown', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <FittedDoorSurface
        doorId="door"
        assetRef={assetRef}
        pose={pose}
        state="unknown"
        framePresentation={{
          span: {
            before: fit.leftExtentMeters,
            after: fit.frameWidthMeters - fit.leftExtentMeters,
          },
          faceFinishes: [],
        }}
        requireFramePresentation
      />
    );
    const probe = renderer.scene.findByProps({ name: 'opening-probe' }).instance
      .userData;
    expect(probe.hideDoorLeaves).toBe(true);
    expect(
      renderer.scene.findAllByProps({ name: 'structural-door-unknown-door' })
    ).toHaveLength(1);
    await renderer.unmount();
  });
  it('marks an uncaptured aperture kit rather than guessing a parent in play', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <FittedDoorSurface
        doorId="door"
        assetRef={assetRef}
        pose={pose}
        state="closed"
        requireFramePresentation
      />
    );
    expect(
      renderer.scene.findAllByProps({ name: 'opening-probe' })
    ).toHaveLength(0);
    expect(
      renderer.scene.findByProps({ name: 'structural-wall-error-door' })
        .instance.userData.reason
    ).toMatch(/capture/);
    await renderer.unmount();
  });
  it('uses the frame envelope while retaining aperture pose and inherited chart phase', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <FittedDoorSurface
        doorId="door"
        assetRef={assetRef}
        pose={pose}
        state="closed"
        wallOffset={7}
        finishSpans={[finish]}
      />
    );
    const probe = renderer.scene.findByProps({ name: 'opening-probe' }).instance
      .userData;
    expect(probe.fit).toMatchObject({
      width: fit.frameWidthMeters,
      height: 4,
      depth: 0.4,
    });
    expect(probe.fit.offset).toBeCloseTo(7 - fit.leftExtentMeters);
    expect(probe.provider.assetRef).toBe(assetRef);
    expect(probe.provider.glbSha256).toBe(entry.asset.glbSha256);
    expect(probe.plans[0].chart).toEqual({
      ...finish.chart,
      surfaceId: 'front',
    });
    expect(finish.chart.surfaceId).toBe('wall-face-A');
    expect(probe.open).toBe(false);
    const group = renderer.scene.findByProps({
      name: 'structural-wall-door-door',
    }).instance;
    expect(group.position.toArray()).toEqual([10, 2, -3]);
    expect(group.scale.toArray()).toEqual([1, 1, 1]);
    await renderer.update(
      <FittedDoorSurface
        doorId="door"
        assetRef={assetRef}
        pose={pose}
        state="open"
        wallOffset={7}
        finishSpans={[finish]}
      />
    );
    expect(
      renderer.scene.findByProps({ name: 'opening-probe' }).instance.userData
        .open
    ).toBe(true);
    await renderer.unmount();
  });
  it('never guesses a door state or creates a masonry model for unknown knowledge', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <FittedDoorSurface
        doorId="door"
        assetRef={assetRef}
        pose={pose}
        state="unknown"
      />
    );
    expect(
      renderer.scene.findAllByProps({ name: 'opening-probe' })
    ).toHaveLength(0);
    expect(
      renderer.scene.findAllByProps({ name: 'structural-door-unknown-door' })
    ).toHaveLength(1);
    await renderer.unmount();
  });
});
