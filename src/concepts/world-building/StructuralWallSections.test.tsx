import ReactThreeTestRenderer from '@react-three/test-renderer';
import { expect, it, vi } from 'vitest';
import { createWall } from './structuralWallEditing';
import { StructuralWallSurfacePieces } from './StructuralWallSurfaces';
import { addWallSection } from './wallSectionEditing';
import type { WorldPropModelProps } from './WorldPropModel';

vi.mock('./WorldPropModel', () => ({
  WorldPropModel: (props: WorldPropModelProps) => (
    <group
      name="section-model-probe"
      userData={{
        ref: props.entry.ref,
        fit: props.plainWallFit,
        height: props.targetHeight,
      }}
    />
  ),
}));
const ref = 'dnd5e:env:fantasy-kingdom:castle_wall_window_03';
function wall() {
  return addWallSection(
    createWall({
      id: 'one-wall',
      start: { x: 0, z: 0 },
      end: { x: 12, z: 0 },
      assetRef: 'dnd5e:env:fantasy-kingdom:castle_wall_01',
      height: 6,
      thickness: 0.375,
      elevation: 0,
    }),
    { id: 'window', assetRef: ref, position: 6 }
  );
}
it('renders a section once inside the owning wall and excludes that span from ordinary repeats', async () => {
  const view = await ReactThreeTestRenderer.create(
    <StructuralWallSurfacePieces wall={wall()} />
  );
  const probes = view.scene
    .findAllByProps({ name: 'section-model-probe' })
    .map((node) => node.instance.userData);
  const features = probes.filter((node) => node.ref === ref),
    plain = probes.filter((node) => node.ref !== ref);
  expect(features).toHaveLength(1);
  expect(features[0].height).toBe(6);
  expect(features[0].fit.width).toBeCloseTo(3.75);
  expect(features[0].fit.offset).toBeCloseTo(4.125);
  expect(plain).toHaveLength(2);
  expect(plain[0].fit.offset + plain[0].fit.width).toBeCloseTo(4.125);
  expect(plain[1].fit.offset).toBeCloseTo(7.875);
  expect(
    view.scene.findAllByProps({ name: 'structural-wall-pieces-one-wall' })
  ).toHaveLength(1);
  await view.unmount();
});
it('clips a partly unknown feature at the supplied fog boundary without shrinking its full-span fit', async () => {
  const view = await ReactThreeTestRenderer.create(
    <StructuralWallSurfacePieces
      wall={wall()}
      fogStretches={[
        { from: 0, to: 0.5, state: 'seen' },
        { from: 0.5, to: 1, state: 'absent' },
      ]}
    />
  );
  const feature = view.scene
    .findAllByProps({ name: 'section-model-probe' })
    .find((node) => node.instance.userData.ref === ref);
  expect(feature).toBeDefined();
  const fit = feature!.instance.userData.fit;
  expect(fit.width).toBeCloseTo(3.75);
  expect(fit.clipStart).toBeCloseTo(0);
  expect(fit.clipEnd).toBeCloseTo(1.875);
  await view.unmount();
});
