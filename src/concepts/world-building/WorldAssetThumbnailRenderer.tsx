import {
  ThumbnailRenderer,
  type ThumbnailRendererProps,
} from '@/compositions/CompositionThumbnailRenderer';
import type { GeneratedWorldBuildingCatalogEntry } from './catalog';
import { WorldPropModel } from './WorldPropModel';

export interface WorldAssetThumbnailRendererProps extends Omit<
  ThumbnailRendererProps,
  'children'
> {
  entry: GeneratedWorldBuildingCatalogEntry;
}

/** Captures the same generated model leaf used by placed World Builder props;
 * it does not create or persist a composition. */
export function WorldAssetThumbnailRenderer({
  entry,
  ...captureProps
}: WorldAssetThumbnailRendererProps) {
  return (
    <ThumbnailRenderer {...captureProps}>
      <WorldPropModel entry={entry} position={[0, 0, 0]} rotationY={0} />
    </ThumbnailRenderer>
  );
}
