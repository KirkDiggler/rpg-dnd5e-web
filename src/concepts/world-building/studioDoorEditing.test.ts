import { describe, expect, it } from 'vitest';
import {
  WORLD_BUILDING_CATALOG_BY_REF,
  type GeneratedWorldBuildingCatalogEntry,
} from './catalog';
import { createWall } from './structuralWallEditing';
import {
  clampDoorPosition,
  createStudioDoor,
  doorAlongWall,
  doorPreviewIds,
  editStudioDoor,
  removeStudioDoor,
  studioDoorAssetWidth,
  studioDoorOptions,
} from './studioDoorEditing';
const ref = 'dnd5e:env:dark-fortress:wall_door_double_01';
const asset = WORLD_BUILDING_CATALOG_BY_REF.get(
  ref
)! as GeneratedWorldBuildingCatalogEntry;
const wall = () =>
  createWall({
    id: 'wall',
    start: { x: 0, z: 0 },
    end: { x: 8, z: 0 },
    assetRef: 'dnd5e:env:dark-fortress:45_wall_01',
    height: 3,
    thickness: 0.3,
    elevation: 0,
  });
const target = {
  kind: 'door' as const,
  wallId: 'wall',
  openingId: 'opening',
  doorId: 'door',
};
describe('complete grouped Studio door candidates', () => {
  it('uses the actual one-group/frame metadata and native runtime-scaled width without filename rules', () => {
    expect(studioDoorAssetWidth(asset)).toBe(asset.asset.boundsMeters[0]);
    expect(studioDoorOptions().some((option) => option.ref === ref)).toBe(true);
    for (const roles of [
      asset.asset.roles!.filter((role) => role.role !== 'frame'),
      asset.asset.roles!.map((role) =>
        role.role === 'leaf' ? { ...role, door: undefined } : role
      ),
      asset.asset.roles!.map((role) =>
        role.node === 'Door_Right' ? { ...role, door: 'other-group' } : role
      ),
    ]) {
      expect(() =>
        studioDoorAssetWidth({ ...asset, asset: { ...asset.asset, roles } })
      ).toThrow(/frame|group/);
    }
    expect(() =>
      studioDoorAssetWidth({
        ...asset,
        asset: { ...asset.asset, boundsMeters: [NaN, 2, 0.3] },
      })
    ).toThrow(/dimensions/);
  });
  it('projects and clamps centre without shrinking chosen width; refuses a short wall and overlapping cut atomically', () => {
    const original = wall();
    const width = studioDoorAssetWidth(asset);
    expect(doorAlongWall(original, { x: 2, z: 99 })).toBe(2);
    expect(clampDoorPosition(original, -1, width)).toEqual({
      position: width / 2,
      clamped: true,
    });
    expect(() =>
      clampDoorPosition(
        { ...original, line: { start: { x: 0, z: 0 }, end: { x: 1, z: 0 } } },
        0.5,
        width
      )
    ).toThrow(/too short/);
    const next = createStudioDoor(original, {
      ...target,
      assetRef: ref,
      position: 2,
    });
    expect(next.openings[0]).toEqual({
      id: 'opening',
      position: 2,
      width,
      door: { id: 'door', assetRef: ref },
    });
    expect(original.openings).toEqual([]);
    expect(() =>
      createStudioDoor(next, {
        openingId: 'another',
        doorId: 'another-door',
        assetRef: ref,
        position: 2.1,
      })
    ).toThrow(/overlap/);
  });
  it('keeps exact no-ops, tiny edits, attachment identity and combined patch atomicity', () => {
    const original = createStudioDoor(wall(), {
      ...target,
      assetRef: ref,
      position: 2,
    });
    expect(
      editStudioDoor(original, target, {
        position: 2,
        width: original.openings[0].width,
      })
    ).toBe(original);
    const tiny = editStudioDoor(original, target, { position: 2 + 1e-12 });
    expect(tiny.openings[0].position).toBe(2 + 1e-12);
    expect(tiny.openings[0].door).toEqual(original.openings[0].door);
    expect(() =>
      editStudioDoor(original, target, { position: 3, width: NaN })
    ).toThrow();
    expect(original.openings[0].position).toBe(2);
    expect(removeStudioDoor(original, target).openings).toEqual([]);
    expect(doorPreviewIds(original)).not.toEqual({
      openingId: 'opening',
      doorId: 'door',
    });
    expect(() =>
      editStudioDoor(
        original,
        { ...target, doorId: 'retired' },
        { position: 3 }
      )
    ).toThrow(/no longer exists/);
  });
});
