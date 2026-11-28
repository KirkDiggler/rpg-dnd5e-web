import { GENERATED_WORLD_ASSETS } from '@/generated/worldAssetCatalog';
import type { MaterialChannelBinding } from '@/rendering/materialChannelTypes';
import { expect, it } from 'vitest';
import {
  captureDoorFramePresentations,
  pinnedFrameMaterials,
} from './doorFrameCapture';
import { createRoomDraft } from './roomDraft';
import { createEmptyScene } from './sceneState';
import { createWall } from './structuralWallEditing';
import { createStudioDoor } from './studioDoorEditing';

function fixture() {
  const sourceRef = 'dnd5e:env:fantasy-kingdom:castle_wall_fit_01';
  const doorRef = 'dnd5e:env:fantasy-kingdom:castle_wall_doorway_single_01';
  const draft = createRoomDraft(createEmptyScene('scene'), 'room');
  const wall = createWall({
    id: 'wall',
    start: { x: 0, z: 0 },
    end: { x: 12, z: 0 },
    assetRef: sourceRef,
    height: 3.75,
    thickness: 0.375,
    elevation: 0,
  });
  wall.appearance.materialChannels = [
    { targetId: 'masonry', normal: { mode: 'scale', multiplier: 0.5 } },
  ];
  draft.room.walls = [
    createStudioDoor(wall, {
      openingId: 'gap',
      doorId: 'door',
      assetRef: doorRef,
      position: 6,
    }),
  ];
  draft.room.doorBindings = { door: { closed: true } };
  // Synthetic enrollment over declared fixed masonry selectors; source receipt
  // verification belongs to Assets, not these capture-owner tests.
  const channelBindings: MaterialChannelBinding[] = [sourceRef, doorRef].map(
    (assetRef) => {
      const asset = GENERATED_WORLD_ASSETS[assetRef];
      const selectors = [
        ...new Map(
          asset.surfaces!.map(({ node, material }) => [
            JSON.stringify([node, material]),
            { node, material },
          ])
        ).values(),
      ];
      return {
        assetRef,
        glbSha256: asset.glbSha256,
        representation: 'model',
        targets: [
          {
            id: 'masonry',
            label: 'Masonry',
            selectors,
            normal: {
              kind: 'adjustable',
              minMultiplier: 0.5,
              maxMultiplier: 2,
            },
            emissive: { kind: 'fixed' },
          },
        ],
      };
    }
  );
  const catalog = { ...pinnedFrameMaterials()!, channelBindings };
  return { draft, catalog };
}
const frame = (draft: ReturnType<typeof fixture>['draft']) =>
  draft.room.walls![0].openings[0].door!.framePresentation!;

it('captures only compatible fixed-frame values and detaches them from the wall owner', () => {
  const { draft, catalog } = fixture();
  const captured = captureDoorFramePresentations(draft, catalog);
  expect(frame(captured).materialChannels).toEqual(
    draft.room.walls![0].appearance.materialChannels
  );
  expect(frame(captured)).not.toHaveProperty('wallId');
  expect(captured.room.doorBindings).toEqual(draft.room.doorBindings);
  draft.room.walls![0].appearance.materialChannels![0].targetId = 'later';
  expect(frame(captured).materialChannels![0].targetId).toBe('masonry');
});
it('refreshes Off and default in the same source transaction and preserves unrelated imported frame intent', () => {
  const { draft, catalog } = fixture();
  const before = captureDoorFramePresentations(draft, catalog);
  expect(frame(before).materialChannels).toHaveLength(1);
  frame(before).materialChannels!.push({
    targetId: 'unrelated',
    emissive: { mode: 'off' },
  });
  const next = structuredClone(before);
  next.room.walls![0].appearance.materialChannels = [
    { targetId: 'masonry', normal: { mode: 'off' } },
  ];
  const off = captureDoorFramePresentations(next, catalog, before);
  expect(frame(off).materialChannels).toEqual([
    { targetId: 'unrelated', emissive: { mode: 'off' } },
    { targetId: 'masonry', normal: { mode: 'off' } },
  ]);
  const reset = structuredClone(off);
  reset.room.walls![0].appearance.materialChannels = [];
  const restored = captureDoorFramePresentations(reset, catalog, off);
  expect(frame(restored).materialChannels).toEqual([
    { targetId: 'unrelated', emissive: { mode: 'off' } },
  ]);
});
it('refuses a replacement that would erase captured frame intent', () => {
  const { draft, catalog } = fixture();
  const before = captureDoorFramePresentations(draft, catalog);
  const replaced = structuredClone(before);
  replaced.room.walls![0].openings[0].door!.assetRef =
    'dnd5e:env:fantasy-kingdom:castle_wall_doorway_double_01';
  expect(() =>
    captureDoorFramePresentations(replaced, catalog, before)
  ).toThrow(/captured material channels|reset|unavailable/);
  expect(frame(before).materialChannels).toEqual([
    { targetId: 'masonry', normal: { mode: 'scale', multiplier: 0.5 } },
  ]);
});

it('refuses a finish that removes a retained fixed-frame emissive map', () => {
  const { draft, catalog } = fixture();
  const before = captureDoorFramePresentations(draft, catalog);
  frame(before).materialChannels![0].emissive = { mode: 'off' };
  const capable = {
    ...catalog,
    channelBindings: catalog.channelBindings.map((binding) => ({
      ...binding,
      targets: binding.targets.map((target) => ({
        ...target,
        emissive: {
          kind: 'adjustable' as const,
          minMultiplier: 0.5,
          maxMultiplier: 2,
        },
      })),
    })),
  };
  const changed = structuredClone(before);
  changed.scene.wallFinishes = {
    wall: {
      'positive-z': 'dnd5e:material:fantasy-kingdom:wall_large_brick_01',
    },
  };
  expect(() => captureDoorFramePresentations(changed, capable, before)).toThrow(
    /emissive/
  );
  expect(frame(before).materialChannels![0].emissive).toEqual({ mode: 'off' });
});

it('preserves supplied or geometrically moved frame values without looking up unchanged channel intent', () => {
  const { draft, catalog } = fixture();
  const before = captureDoorFramePresentations(draft, catalog);
  expect(frame(before).materialChannels).toHaveLength(1);
  expect(captureDoorFramePresentations(before, null)).toBe(before);
  const moved = structuredClone(before);
  moved.room.walls![0].openings[0].position = 5;
  expect(
    frame(captureDoorFramePresentations(moved, null, before)).materialChannels
  ).toEqual(frame(before).materialChannels);
});
it('leaves unenrolled inserted assets alone and refuses a declared incompatible strength before changing the draft', () => {
  const { draft, catalog } = fixture();
  expect(
    frame(
      captureDoorFramePresentations(draft, {
        ...catalog,
        channelBindings: catalog.channelBindings.slice(0, 1),
      })
    ).materialChannels
  ).toBeUndefined();
  const before = structuredClone(draft);
  const restricted = {
    ...catalog,
    channelBindings: catalog.channelBindings.map((binding, index) =>
      index === 0
        ? binding
        : {
            ...binding,
            targets: binding.targets.map((target) => ({
              ...target,
              normal: {
                kind: 'adjustable' as const,
                minMultiplier: 1,
                maxMultiplier: 1,
              },
            })),
          }
    ),
  };
  expect(() => captureDoorFramePresentations(draft, restricted)).toThrow(
    /range/
  );
  expect(draft).toEqual(before);
});
