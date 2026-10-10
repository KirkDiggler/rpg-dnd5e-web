import type { ThumbnailResult } from '@/author/useSerialThumbnailQueue';
import { memo } from 'react';
import type { WorldBuildingCatalogEntry } from './catalog';

export interface WorldBuildingPaletteCardProps {
  entry: WorldBuildingCatalogEntry;
  /** Undefined is the stable pending state; do not allocate a loading result. */
  generatedThumbnail?: ThumbnailResult;
  roomMode: boolean;
  repeatDisabled: boolean;
  onDragStart: (ref: string, transfer: DataTransfer) => void;
  onDragEnd: () => void;
  onRepeat: (ref: string) => void;
}

/** Immutable catalog entries and per-key queue results let unchanged card
 * bodies skip thumbnail-only updates without freezing their owner actions. */
export const WorldBuildingPaletteCard = memo(function WorldBuildingPaletteCard({
  entry,
  generatedThumbnail,
  roomMode,
  repeatDisabled,
  onDragStart,
  onDragEnd,
  onRepeat,
}: WorldBuildingPaletteCardProps) {
  const thumbnail =
    entry.thumbnail ??
    (generatedThumbnail?.status === 'ready'
      ? generatedThumbnail.image
      : undefined);
  const thumbnailState =
    entry.source === 'legacy'
      ? 'legacy'
      : (generatedThumbnail?.status ?? 'loading');
  return (
    <article
      className="wb-palette-entry"
      draggable
      aria-label={`Drag ${entry.label} into scene`}
      data-thumbnail-state={thumbnailState}
      data-asset-ref={entry.ref}
      onDragStart={(event) => onDragStart(entry.ref, event.dataTransfer)}
      onDragEnd={onDragEnd}
    >
      {thumbnail ? (
        <img src={thumbnail} alt="" draggable={false} />
      ) : (
        <span className="wb-swatch">
          {entry.label.slice(0, 2)}
          {generatedThumbnail?.status === 'error' ? ' !' : ''}
        </span>
      )}
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
        {entry.source === 'generated' && (
          <span className="sr-only">
            {generatedThumbnail?.status === 'error'
              ? `Thumbnail unavailable${generatedThumbnail.message ? `: ${generatedThumbnail.message}` : ''}`
              : generatedThumbnail?.status === 'ready'
                ? 'Thumbnail ready'
                : 'Thumbnail loading'}
          </span>
        )}
      </span>
    </article>
  );
});
