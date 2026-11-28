import { GENERATED_WORLD_ASSETS } from '@/generated/worldAssetCatalog';
import type {
  MaterialChannelAdjustment,
  MaterialChannelBinding,
} from '@/rendering/materialChannelTypes';
import type { WorldMaterialCatalogState } from '@/rendering/useWorldMaterialCatalog';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { beforeEach, expect, it, vi } from 'vitest';
import { pinnedFrameMaterials } from './doorFrameCapture';
import { createWall } from './structuralWallEditing';
import {
  FittedDoorSurface,
  StructuralWallSurfacePieces,
} from './StructuralWallSurfaces';

const state = vi.hoisted(() => ({
  catalog: null as WorldMaterialCatalogState | null,
}));
vi.mock('@/rendering/useWorldMaterialCatalog', () => ({
  useWorldMaterialCatalog: () => state.catalog,
}));
vi.mock('./WorldPropModel', () => ({
  WorldPropModel: (props: {
    entry: { ref: string };
    materialChannels?: readonly MaterialChannelAdjustment[];
    hideDoorLeaves?: boolean;
  }) => <group name="wall-channel-port" userData={props} />,
}));
const sourceRef = 'dnd5e:env:fantasy-kingdom:castle_wall_fit_01';
const sectionRef = 'dnd5e:env:fantasy-kingdom:castle_wall_window_03';
const doorRef = 'dnd5e:env:fantasy-kingdom:castle_wall_doorway_single_01';
const values: MaterialChannelAdjustment[] = [
  { targetId: 'masonry', normal: { mode: 'scale', multiplier: 1 } },
];
beforeEach(() => {
  const channelBindings: MaterialChannelBinding[] = [
    sourceRef,
    sectionRef,
    doorRef,
  ].map((assetRef) => {
    const asset = GENERATED_WORLD_ASSETS[assetRef];
    const selectors = [
      ...new Map(
        asset.surfaces!.map(({ node, material }) => [
          JSON.stringify([node, material]),
          { node, material },
        ])
      ).values(),
    ];
    expect(selectors.length).toBeGreaterThan(0);
    return {
      assetRef,
      representation: 'model',
      glbSha256: asset.glbSha256,
      targets: [
        {
          id: 'masonry',
          label: 'Masonry',
          selectors,
          normal: { kind: 'adjustable', minMultiplier: 0.5, maxMultiplier: 2 },
          emissive: { kind: 'fixed' },
        },
      ],
    };
  });
  state.catalog = {
    status: 'ready',
    message: 'Synthetic enrollment',
    catalog: { ...pinnedFrameMaterials()!, channelBindings },
  };
});
function wall() {
  const wall = createWall({
    id: 'wall',
    assetRef: sourceRef,
    start: { x: 0, z: 0 },
    end: { x: 12, z: 0 },
    height: 6,
    thickness: 0.375,
    elevation: 0,
  });
  wall.appearance.materialChannels = values;
  wall.appearance.sections = [
    { id: 'window', assetRef: sectionRef, position: 6, width: 3.75 },
  ];
  return wall;
}
it('passes wall intent to its body and declared compatible fixed sections', async () => {
  const renderer = await ReactThreeTestRenderer.create(
    <StructuralWallSurfacePieces wall={wall()} />
  );
  const ports = renderer.scene.findAllByProps({ name: 'wall-channel-port' });
  expect(
    ports.some((port) => port.props.userData.entry.ref === sectionRef)
  ).toBe(true);
  expect(
    ports.some((port) => port.props.userData.entry.ref === sourceRef)
  ).toBe(true);
  for (const port of ports)
    expect(port.props.userData.materialChannels).toEqual(values);
  await renderer.unmount();
});
it('does not apply parent values to an unenrolled inserted asset', async () => {
  state.catalog!.catalog = {
    ...state.catalog!.catalog!,
    channelBindings: state.catalog!.catalog!.channelBindings!.filter(
      (binding) => binding.assetRef !== sectionRef
    ),
  };
  const renderer = await ReactThreeTestRenderer.create(
    <StructuralWallSurfacePieces wall={wall()} />
  );
  const ports = renderer.scene.findAllByProps({ name: 'wall-channel-port' });
  const section = ports.find(
    (port) => port.props.userData.entry.ref === sectionRef
  )!;
  const body = ports.find(
    (port) => port.props.userData.entry.ref === sourceRef
  )!;
  expect(section.props.userData.materialChannels ?? []).toEqual([]);
  expect(body.props.userData.materialChannels).toEqual(values);
  await renderer.unmount();
});
it('passes independently captured frame intent even when the wall and moving leaf state are unknown', async () => {
  const asset = GENERATED_WORLD_ASSETS[doorRef],
    profile = asset.wallOpening!;
  const renderer = await ReactThreeTestRenderer.create(
    <FittedDoorSurface
      doorId="door"
      assetRef={doorRef}
      pose={{
        point: { x: 0, z: 0 },
        rotationY: 0,
        y: 0,
        width: profile.widthMeters,
        height: 6,
        thickness: profile.wallDepthMeters,
      }}
      state="unknown"
      requireFramePresentation
      framePresentation={{
        span: {
          before: profile.leftExtentMeters,
          after: profile.frameWidthMeters - profile.leftExtentMeters,
        },
        faceFinishes: [],
        materialChannels: values,
      }}
    />
  );
  const port = renderer.scene.findByProps({ name: 'wall-channel-port' });
  expect(port.props.userData.materialChannels).toEqual(values);
  expect(port.props.userData.hideDoorLeaves).toBe(true);
  await renderer.unmount();
});
