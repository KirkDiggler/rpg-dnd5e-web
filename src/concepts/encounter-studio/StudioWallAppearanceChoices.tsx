import { useState } from 'react';
import { AssetThumbnailImage } from '../world-building/AssetThumbnailImage';
import type { StudioWallAppearanceOption } from './studioSession';

/** One image-only choice surface; unavailable previews remain selectable. */
export function StudioWallAppearanceChoices({
  options: available,
  assetRef,
  onChoose,
}: {
  options: readonly StudioWallAppearanceOption[];
  assetRef: string | null;
  onChoose(ref: string): void;
}): React.JSX.Element {
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const options = available
    .filter((option) =>
      `${option.label} ${option.ref}`.toLowerCase().includes(query)
    )
    .sort((a, b) => Number(b.wallMatch) - Number(a.wallMatch));
  const knownAsset = available.find((option) => option.ref === assetRef);
  return (
    <>
      <p className="es-help">
        {assetRef
          ? `Appearance: ${knownAsset?.label ?? assetRef}`
          : 'No appearance armed. Choose any supported appearance below.'}
      </p>
      {assetRef && !knownAsset && (
        <p role="status">
          Unsupported imported appearance: {assetRef}. Preserved until you
          explicitly choose a replacement.
        </p>
      )}
      <label className="es-wall-search">
        Search appearances
        <input
          type="search"
          aria-label="Search wall appearances"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              // A filter is presentation-only even inside the Arrange form:
              // block native implicit submit AND the form's Enter handler.
              event.preventDefault();
              event.stopPropagation();
            }
          }}
        />
      </label>
      <p className="es-help">
        Wall matches first · All supported repeatable appearances remain
        available ({options.length})
      </p>
      {options.length === 0 && (
        <p role="status">No matching wall appearances. Try another search.</p>
      )}
      <div
        className="es-wall-options"
        role="group"
        aria-label="Wall appearance choices"
      >
        {options.map((option) => (
          <button
            type="button"
            key={option.ref}
            aria-label={`Choose appearance ${option.label}`}
            title={option.ref}
            aria-pressed={assetRef === option.ref}
            data-wall-appearance-ref={option.ref}
            onClick={() => onChoose(option.ref)}
          >
            <AssetThumbnailImage
              url={
                option.thumbnail.status === 'ready'
                  ? option.thumbnail.image
                  : undefined
              }
              label={option.label}
              fallbackClassName="es-wall-thumbnail-fallback"
            />
            <span>{option.label}</span>
            {option.wallMatch && <small>Wall match</small>}
            {option.thumbnail.status === 'error' && (
              <small>{option.thumbnail.message}</small>
            )}
          </button>
        ))}
      </div>
    </>
  );
}
