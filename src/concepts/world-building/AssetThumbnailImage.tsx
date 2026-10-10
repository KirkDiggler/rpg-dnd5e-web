import { useState } from 'react';

/** Image-only catalog preview. Failures never allocate a model/capture worker.
 * State belongs to this image, not the document or the parent palette. */
export function AssetThumbnailImage({
  url,
  label,
  fallbackClassName,
}: {
  url?: string;
  label: string;
  fallbackClassName: string;
}): React.JSX.Element {
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!url || failedUrl === url) {
    return (
      <span
        className={fallbackClassName}
        role="img"
        aria-label={`Preview unavailable for ${label}`}
        data-thumbnail-state="error"
      >
        Preview unavailable
      </span>
    );
  }
  return (
    <img
      src={url}
      alt=""
      width={128}
      height={128}
      loading="lazy"
      draggable={false}
      data-thumbnail-state={loadedUrl === url ? 'ready' : 'loading'}
      onLoad={() => setLoadedUrl(url)}
      onError={() => setFailedUrl(url)}
    />
  );
}
