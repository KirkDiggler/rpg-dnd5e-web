import { GENERATED_WORLD_ASSETS } from '@/generated/worldAssetCatalog';
import {
  GENERATED_WORLD_MATERIAL_PROVIDER,
  GENERATED_WORLD_MATERIALS,
} from '@/generated/worldMaterialCatalog';
import type { DoorFramePresentation } from '@/rendering/doorFramePresentation';
import {
  createPinnedWorldMaterialCatalog,
  type WorldMaterialCatalog,
} from '@/rendering/worldMaterialCatalog';
import { WORLD_BUILDING_CATALOG_BY_REF } from './catalog';
import type { RoomDraft } from './roomDraft';
import { surfaceRepeatSceneUnits } from './roomWallFinishes';
import {
  localWallFaceChart,
  resolveWallFaceFinish,
} from './wallFinishProjection';
import { WALL_FINISH_SIDES } from './wallFinishTypes';

/** Same provider metadata/factory as rendering; no second registry or IO. */
export function pinnedFrameMaterials(): WorldMaterialCatalog | null {
  return createPinnedWorldMaterialCatalog({
    provider: GENERATED_WORLD_MATERIAL_PROVIDER,
    materials: GENERATED_WORLD_MATERIALS,
    assets: GENERATED_WORLD_ASSETS,
  });
}
/** Refresh affected source-owned frames in the same history transaction. With
 * no previous draft (native export/import), preserve supplied facts and fill
 * only missing captures. Unknown unchanged intent is never reinterpreted. */
export function captureDoorFramePresentations(
  draft: RoomDraft,
  catalog: WorldMaterialCatalog | null,
  previous?: RoomDraft
): RoomDraft {
  if (!draft.room.walls?.length) return draft;
  if (draft.sourceRef && previous?.sourceRef !== draft.sourceRef)
    previous = undefined;
  let changed = false;
  const walls = draft.room.walls.map((wall) => {
    const oldWall = previous?.room.walls?.find((w) => w.id === wall.id);
    let wallChanged = false;
    const openings = wall.openings.map((opening) => {
      if (!opening.door) return opening;
      const old = oldWall?.openings.find((o) => o.id === opening.id);
      const sourceChanged =
        !old?.door ||
        old.door.assetRef !== opening.door.assetRef ||
        old.position !== opening.position ||
        old.width !== opening.width ||
        WALL_FINISH_SIDES.some(
          (side) =>
            previous?.scene.wallFinishes?.[wall.id]?.[side] !==
            draft.scene.wallFinishes?.[wall.id]?.[side]
        );
      if (
        (previous && !sourceChanged) ||
        ((!previous || !old?.door) && opening.door.framePresentation)
      )
        return opening;
      const entry = WORLD_BUILDING_CATALOG_BY_REF.get(opening.door.assetRef);
      const profile =
        entry?.source === 'generated' ? entry.asset.wallOpening : undefined;
      if (!profile) {
        if (!opening.door.framePresentation) return opening;
        if (old?.door?.assetRef === opening.door.assetRef)
          throw Error('Cannot recapture an unavailable doorway frame profile.');
        const door = { ...opening.door };
        delete door.framePresentation;
        wallChanged = true;
        return { ...opening, door };
      }
      if (entry?.source !== 'generated')
        throw Error('Door frame needs a verified provider.');
      const scale = opening.width / profile.widthMeters;
      const framePresentation: DoorFramePresentation = {
        span: {
          before: profile.leftExtentMeters * scale,
          after: (profile.frameWidthMeters - profile.leftExtentMeters) * scale,
        },
        faceFinishes: [],
      };
      for (const side of WALL_FINISH_SIDES) {
        const ref = draft.scene.wallFinishes?.[wall.id]?.[side];
        if (
          old?.door?.assetRef === opening.door.assetRef &&
          opening.door.framePresentation &&
          ref === previous?.scene.wallFinishes?.[wall.id]?.[side]
        ) {
          const prior = opening.door.framePresentation.faceFinishes.find(
            (face) => face.side === side
          );
          if (prior) {
            const face = { ...prior };
            if (old.position !== opening.position) {
              const material = catalog?.materials.find(
                (m) => m.ref === face.materialRef
              );
              if (!material)
                throw Error(
                  `Captured frame material is unavailable: ${face.materialRef}.`
                );
              const phase =
                face.phaseU +
                ((side === 'positive-z' ? 1 : -1) *
                  (opening.position - old.position)) /
                  surfaceRepeatSceneUnits(material)[0];
              face.phaseU = ((phase % 1) + 1) % 1;
            }
            framePresentation.faceFinishes.push(face);
          }
          continue;
        }
        if (ref === undefined) continue;
        const resolved = resolveWallFaceFinish(catalog, wall, side, ref);
        if (
          !entry.asset.surfaces?.some(
            (b) => b.side === side && b.family === resolved.material.family
          )
        )
          throw Error('Door frame has no compatible fixed masonry target.');
        const chart = localWallFaceChart(
          wall,
          side,
          resolved.material,
          resolved.surfaceId
        );
        const phase =
          (chart.phase + chart.direction * opening.position) / chart.repeat[0];
        framePresentation.faceFinishes.push({
          side,
          materialRef: ref,
          phaseU: ((phase % 1) + 1) % 1,
        });
      }
      wallChanged = true;
      return { ...opening, door: { ...opening.door, framePresentation } };
    });
    if (!wallChanged) return wall;
    changed = true;
    return { ...wall, openings };
  });
  return changed ? { ...draft, room: { ...draft.room, walls } } : draft;
}
