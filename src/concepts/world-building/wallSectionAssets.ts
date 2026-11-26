import type { WorldBuildingCatalogEntry } from './catalog';

export interface StaticWallFit {
  kind: 'body' | 'opening';
  width: number;
}

/** Geometry capability only: a leafless surround can be fitted as static art
 * without becoming a door or a gameplay passage. The provider's measured
 * full frame span, not its aperture width, occupies a visual section. */
export function staticWallFit(
  entry: WorldBuildingCatalogEntry
): StaticWallFit | undefined {
  if (
    entry.source !== 'generated' ||
    entry.asset.roles?.some((role) => role.role === 'leaf')
  )
    return undefined;
  if (
    entry.asset.tags.some(
      (tag) => tag === 'wall-body-fit' || tag === 'wall-miter-90'
    )
  )
    return { kind: 'body', width: entry.asset.boundsMeters[0] };
  if (
    entry.asset.tags.includes('wall-opening') &&
    entry.asset.wallOpening &&
    entry.asset.roles?.some((role) => role.role === 'frame')
  )
    return { kind: 'opening', width: entry.asset.wallOpening.frameWidthMeters };
  return undefined;
}

/** New authoring choices are declared features, not every generic prop body.
 * Existing imported repeat intent remains a separate readable/renderable path. */
export function isWallSectionAppearance(
  entry: WorldBuildingCatalogEntry
): boolean {
  const fit = staticWallFit(entry);
  return (
    !!fit &&
    entry.source === 'generated' &&
    (fit.kind === 'opening' || entry.asset.tags.includes('wall-section'))
  );
}
