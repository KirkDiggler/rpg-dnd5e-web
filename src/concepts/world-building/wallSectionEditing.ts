import { planAssetHeight } from '@/rendering/assetHeightLayout';
import {
  WORLD_BUILDING_CATALOG_BY_REF,
  type GeneratedWorldBuildingCatalogEntry,
} from './catalog';
import { doorFrameExtents } from './doorwayPlacement';
import type { StructuralWall, StructuralWallSurface } from './structuralWalls';
import { assertWallSections, copyWallSections } from './wallSections';

export interface WallSectionOption {
  ref: string;
  label: string;
  width: number;
}
function configured(ref: string): GeneratedWorldBuildingCatalogEntry {
  const entry = WORLD_BUILDING_CATALOG_BY_REF.get(ref);
  if (
    entry?.source !== 'generated' ||
    !entry.asset.tags.includes('wall-section') ||
    !entry.asset.tags.includes('wall-body-fit') ||
    entry.asset.roles?.some((role) => role.role === 'leaf')
  )
    throw Error(
      'Wall section requires a configured static feature appearance.'
    );
  return entry;
}
export function wallSectionOptions(): WallSectionOption[] {
  return [...WORLD_BUILDING_CATALOG_BY_REF.values()].flatMap((entry) => {
    if (
      entry.source !== 'generated' ||
      !entry.asset.tags.includes('wall-section') ||
      !entry.asset.tags.includes('wall-body-fit') ||
      entry.asset.roles?.some((role) => role.role === 'leaf')
    )
      return [];
    return [
      {
        ref: entry.ref,
        label: entry.label,
        width: entry.asset.boundsMeters[0],
      },
    ];
  });
}
/** Editor-only: legacy doors without captured surrounds resolve from the current provider. */
export function assertEditableWallSections(wall: StructuralWallSurface): void {
  assertWallSections({
    ...wall,
    openings: wall.openings.map((opening) => {
      if (!opening.door || opening.door.framePresentation) return opening;
      const span = doorFrameExtents(opening.door.assetRef, opening.width);
      return {
        ...opening,
        frameSpan: { before: span.left, after: span.right },
      };
    }),
  });
}
function check(next: StructuralWall): StructuralWall {
  next.appearance.sections = copyWallSections(next.appearance.sections);
  assertEditableWallSections(next);
  return next;
}
function checkHeight(wall: StructuralWall, ref: string): void {
  const entry = configured(ref);
  planAssetHeight({
    nativeHeight: entry.asset.boundsMeters[1],
    targetHeight: wall.appearance.height,
    profile: entry.asset.heightFit ?? { mode: 'scale' },
  });
}
export function addWallSection(
  wall: StructuralWall,
  input: { id: string; assetRef: string; position: number }
): StructuralWall {
  const entry = configured(input.assetRef);
  checkHeight(wall, input.assetRef);
  const next = structuredClone(wall);
  next.appearance.sections = [
    ...(next.appearance.sections ?? []),
    { ...input, width: entry.asset.boundsMeters[0] },
  ];
  return check(next);
}
export function editWallSection(
  wall: StructuralWall,
  id: string,
  input: { position: number }
): StructuralWall {
  if (!wall.appearance.sections?.some((section) => section.id === id))
    throw Error(`Unknown wall section ${id}.`);
  const next = structuredClone(wall);
  next.appearance.sections = next.appearance.sections!.map((section) =>
    section.id === id ? { ...section, position: input.position } : section
  );
  return check(next);
}
export function removeWallSection(
  wall: StructuralWall,
  id: string
): StructuralWall {
  if (!wall.appearance.sections?.some((section) => section.id === id))
    throw Error(`Unknown wall section ${id}.`);
  const next = structuredClone(wall);
  next.appearance.sections = next.appearance.sections!.filter(
    (section) => section.id !== id
  );
  return next;
}
