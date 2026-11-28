import type { MaterialChannelAdjustment } from '@/rendering/materialChannelTypes';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { expect, it, vi } from 'vitest';
import { WORLD_BUILDING_CATALOG_BY_REF } from './catalog';
import { WorldPropVisual } from './WorldBuildingViewport';
import { WorldPropModel } from './WorldPropModel';

// The real native/catalog adapters terminate at the model port; material writes
// and ownership are exercised separately by WorldMaterialChannels.test.tsx.
vi.mock('@/components/hex-grid/WorldAssetModel', () => ({
  WorldAssetModel: ({
    materialChannels,
  }: {
    materialChannels?: readonly MaterialChannelAdjustment[];
  }) => <group name="channel-model-port" userData={{ materialChannels }} />,
}));
vi.mock('@/components/hex-grid/PropModel', () => ({
  PropModel: () => <group name="legacy-model-port" />,
}));
const values: MaterialChannelAdjustment[] = [
  {
    targetId: 'body',
    normal: { mode: 'scale', multiplier: 1 },
    emissive: { mode: 'off' },
  },
];

it('passes native placed-prop intent through both existing world adapters', async () => {
  const item = {
    id: 'proof',
    kind: 'prop' as const,
    assetRef: 'dnd5e:props:dark-fortress:alchemy_tools_01',
    label: 'Proof',
    transform: { x: 0, y: 0, z: 0, rotationY: 0 },
    materialChannels: values,
  };
  const renderer = await ReactThreeTestRenderer.create(
    <WorldPropVisual
      item={item}
      selected={false}
      onSelect={vi.fn()}
      onAssetState={vi.fn()}
      selectedIds={[]}
      isGizmoPointer={() => false}
      resolveSelectionId={() => item.id}
    />
  );
  expect(
    renderer.scene.findByProps({ name: 'channel-model-port' }).props.userData
      .materialChannels
  ).toEqual(values);
  await renderer.unmount();
});

it('refuses captured intent on a legacy asset rather than drawing an unadjusted substitute', () => {
  const entry = WORLD_BUILDING_CATALOG_BY_REF.get('dnd5e:props:torture-table')!;
  expect(() =>
    WorldPropModel({
      entry,
      materialChannels: values,
      position: [0, 0, 0],
      rotationY: 0,
    })
  ).toThrow(/channel|provider-enrolled/i);
});
