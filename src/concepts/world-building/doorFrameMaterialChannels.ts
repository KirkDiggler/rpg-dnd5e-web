import type { GeneratedWorldAsset } from '@/generated/worldAssetCatalog';
import type { DoorFrameFaceFinish } from '@/rendering/doorFramePresentation';
import { projectMasonryMaterialChannels } from '@/rendering/materialChannelProjection';
import type { MaterialChannelAdjustment } from '@/rendering/materialChannelTypes';
import type { WorldMaterialCatalog } from '@/rendering/worldMaterialCatalog';
import { WORLD_BUILDING_CATALOG_BY_REF } from './catalog';
import { validateMaterialChannels } from './materialChannels';
import type { StructuralWall, StructuralWallOpening } from './structuralWalls';

type Door = NonNullable<StructuralWallOpening['door']>;
const generated = (ref: string) => {
  const entry = WORLD_BUILDING_CATALOG_BY_REF.get(ref);
  return entry?.source === 'generated' ? entry.asset : undefined;
};

/** A changed complete look must retain every captured channel it affects. */
function assertRetainedLook(
  values: readonly MaterialChannelAdjustment[],
  asset: GeneratedWorldAsset,
  catalog: WorldMaterialCatalog | null,
  faces: readonly DoorFrameFaceFinish[]
): void {
  if (!values.length) return;
  const binding = catalog?.channelBindings?.find(
    (row) => row.assetRef === asset.ref && row.representation === 'model'
  );
  if (!binding || binding.glbSha256 !== asset.glbSha256)
    throw Error(
      'Cannot change a frame look with unavailable captured material channels; reset or repair them first.'
    );
  for (const value of values) {
    const target = binding.targets.find((row) => row.id === value.targetId);
    if (!target)
      throw Error(
        `Captured frame channel target is unavailable: ${value.targetId}.`
      );
    for (const role of ['normal', 'emissive'] as const) {
      const adjustment = value[role];
      if (!adjustment) continue;
      const capability = target[role];
      if (
        capability.kind !== 'adjustable' ||
        (adjustment.mode === 'scale' &&
          (adjustment.multiplier < capability.minMultiplier ||
            adjustment.multiplier > capability.maxMultiplier))
      )
        throw Error(
          `Captured frame ${role} channel is incompatible with the new look/range.`
        );
      if (
        role === 'emissive' &&
        faces.some((face) =>
          asset.surfaces?.some(
            (surface) =>
              surface.side === face.side &&
              target.selectors.some(
                (selector) => selector.material === surface.material
              )
          )
        )
      )
        throw Error(
          'Paired masonry finishes remove emissive maps; reset the captured frame emissive adjustment first.'
        );
    }
  }
}

/** Refresh only proved inherited scopes. Unrelated/imported frame facts remain
 * independent; an unavailable old binding never grants permission to erase them. */
export function captureFrameMaterialChannels(input: {
  wall: StructuralWall;
  previousWall?: StructuralWall;
  door: Door;
  previousDoor?: Door;
  asset: GeneratedWorldAsset;
  catalog: WorldMaterialCatalog | null;
  channelsChanged: boolean;
  lookChanged: boolean;
  faceFinishes: readonly DoorFrameFaceFinish[];
}): MaterialChannelAdjustment[] {
  const { wall, previousWall, door, previousDoor, asset, catalog } = input;
  const prior = validateMaterialChannels(
    door.framePresentation?.materialChannels ??
      previousDoor?.framePresentation?.materialChannels ??
      [],
    'frame.materialChannels'
  );
  const sameAsset = previousDoor?.assetRef === door.assetRef;
  if (previousDoor && !sameAsset)
    assertRetainedLook(prior, asset, catalog, input.faceFinishes);
  if (sameAsset && !input.channelsChanged) {
    if (input.lookChanged)
      assertRetainedLook(prior, asset, catalog, input.faceFinishes);
    return prior;
  }
  const source = generated(wall.appearance.assetRef);
  const values = wall.appearance.materialChannels ?? [];
  if (values.length && !source)
    throw Error('Cannot project channels from an unavailable wall source.');
  const projected = source
    ? projectMasonryMaterialChannels({
        source,
        destination: asset,
        values,
        catalog,
      })
    : [];
  let inheritedBefore: MaterialChannelAdjustment[] = [];
  const oldSource = previousWall && generated(previousWall.appearance.assetRef);
  const oldDestination = previousDoor && generated(previousDoor.assetRef);
  if (oldSource && oldDestination) {
    try {
      inheritedBefore = projectMasonryMaterialChannels({
        source: oldSource,
        destination: oldDestination,
        values: previousWall?.appearance.materialChannels,
        catalog,
      });
    } catch {
      // No proof of the former projection: retain supplied independent facts.
      // This is not permission to reinterpret or silently reset an unknown scope.
    }
  }
  for (const inherited of inheritedBefore) {
    const row = prior.find((value) => value.targetId === inherited.targetId);
    if (!row) continue;
    if (inherited.normal) delete row.normal;
    if (inherited.emissive) delete row.emissive;
  }
  const result = prior.filter((row) => row.normal || row.emissive);
  for (const projectedRow of projected) {
    const row = result.find(
      (value) => value.targetId === projectedRow.targetId
    );
    if (row) Object.assign(row, projectedRow);
    else result.push(projectedRow);
  }
  if (input.lookChanged || (previousDoor && !sameAsset))
    assertRetainedLook(result, asset, catalog, input.faceFinishes);
  return result;
}
