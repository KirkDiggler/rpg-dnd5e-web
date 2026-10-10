import { memo } from 'react';
import { AssetThumbnailImage } from './AssetThumbnailImage';
import type { WorldBuildingCatalogEntry } from './catalog';

export interface WorldBuildingPaletteCardProps {
  entry: WorldBuildingCatalogEntry;
  roomMode: boolean;
  repeatDisabled: boolean;
  onDragStart: (ref: string, transfer: DataTransfer) => void;
  onDragEnd: () => void;
  onRepeat: (ref: string) => void;
}

/** Static catalog images keep loading/error state local to the image. */
export const WorldBuildingPaletteCard = memo(function WorldBuildingPaletteCard({
  entry,
  roomMode,
  repeatDisabled,
  onDragStart,
  onDragEnd,
  onRepeat,
}: WorldBuildingPaletteCardProps) {
  return (
    <article
      className="wb-palette-entry"
      draggable
      aria-label={`Drag ${entry.label} into scene`}
      data-thumbnail-source={
        entry.source === 'generated' ? 'provider' : 'legacy'
      }
      data-asset-ref={entry.ref}
      onDragStart={(event) => onDragStart(entry.ref, event.dataTransfer)}
      onDragEnd={onDragEnd}
    >
      <AssetThumbnailImage
        url={entry.thumbnail}
        label={entry.label}
        fallbackClassName="wb-swatch"
      />
      <span>
        <strong>{entry.label}</strong>
        <small>
          Drag to add ·{' '}
          {entry.source === 'legacy' ? entry.role : entry.category}
          {entry.supportsDecoration ? ' · surface' : ''}
        </small>
        {roomMode && entry.source === 'generated' && (
          <button
            type="button"
            className="wb-repeat-action"
            aria-label={`Repeat ${entry.label}`}
            disabled={repeatDisabled}
            onClick={(event) => {
              event.stopPropagation();
              onRepeat(entry.ref);
            }}
          >
            Repeat
          </button>
        )}
      </span>
    </article>
  );
});
