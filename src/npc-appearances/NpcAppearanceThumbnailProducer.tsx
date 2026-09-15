import { ClassCharacterModel } from '@/components/hex-grid/ClassCharacterModel';
import {
  ThumbnailRenderer,
  type ThumbnailRendererProps,
} from '@/compositions/CompositionThumbnailRenderer';
import type { GeneratedNpcAppearance } from '@/generated/npcAppearanceCatalog';
import { npcAppearanceThumbnailKey } from './npcAppearanceThumbnailKey';

export interface NpcAppearanceThumbnailProducerProps extends Omit<
  ThumbnailRendererProps,
  'children' | 'requestKey'
> {
  appearance: GeneratedNpcAppearance;
}

/** Captures one exact standing appearance through the shared serial thumbnail
 * surface and the production skeleton-safe character model. The caller can
 * cache the completed image under the callback's exact request key. */
export function NpcAppearanceThumbnailProducer({
  appearance,
  ...captureProps
}: NpcAppearanceThumbnailProducerProps) {
  return (
    <ThumbnailRenderer
      {...captureProps}
      requestKey={npcAppearanceThumbnailKey(appearance)}
      fitBounds={false}
    >
      <ClassCharacterModel
        url={appearance.standingUrl}
        facingRotation={0}
        isMoving={false}
        isDownedVariant={false}
      />
    </ThumbnailRenderer>
  );
}
