import { useState } from 'react';
import './MaterialImagePicker.css';
import type { InventoryImage } from './materialRecipe';

export interface MaterialImagePickerProps {
  ariaLabel: string;
  value: string;
  images: readonly InventoryImage[];
  allowNone: boolean;
  noneLabel: string;
  onChange(path: string): void;
}

function folderOf(path: string): string {
  return path.includes('/')
    ? path.slice(0, path.lastIndexOf('/'))
    : '(pack root)';
}

/** Source paths are choices; prepared URLs are display resources. No role/name
 * compatibility heuristic may remove an image from this experimental browser. */
export function MaterialImagePicker({
  ariaLabel,
  value,
  images,
  allowNone,
  noneLabel,
  onChange,
}: MaterialImagePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState('');
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const folders = [
    ...new Set(images.map((image) => folderOf(image.path))),
  ].sort();
  const needle = search.trim().toLowerCase();
  const shown = images.filter(
    (image) =>
      (!folder || folderOf(image.path) === folder) &&
      (!needle || image.path.toLowerCase().includes(needle))
  );
  return (
    <div className="material-image-picker">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {allowNone && <option value="">{noneLabel}</option>}
        {folders.map((name) => (
          <optgroup key={name} label={name}>
            {images
              .filter((image) => folderOf(image.path) === name)
              .map((image) => (
                <option key={image.path} value={image.path}>
                  {image.path.split('/').at(-1)} ({image.format})
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Close' : 'Browse'} {ariaLabel.toLowerCase()}
      </button>
      {open && (
        <section
          className="material-image-browser"
          aria-label={`${ariaLabel} browser`}
        >
          <input
            aria-label={`Search ${ariaLabel.toLowerCase()}`}
            placeholder="Search name or folder"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            aria-label={`Folder for ${ariaLabel.toLowerCase()}`}
            value={folder}
            onChange={(event) => setFolder(event.target.value)}
          >
            <option value="">All folders</option>
            {folders.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <p>
            {shown.length} images · Current: {value || noneLabel}
          </p>
          <div className="material-image-thumbnails">
            {shown.map((image) => {
              const url = image.preview?.url ?? image.url;
              const errorKey = `${image.path}\u0000${url ?? ''}`;
              const broken = !url || failed.has(errorKey);
              return (
                <button
                  type="button"
                  key={image.path}
                  aria-label={`Choose ${image.path}`}
                  aria-pressed={value === image.path}
                  onClick={() => onChange(image.path)}
                  title={image.path}
                >
                  {broken ? (
                    <span role="status">Thumbnail unavailable</span>
                  ) : (
                    <img
                      src={url}
                      alt=""
                      width={80}
                      height={80}
                      loading="lazy"
                      decoding="async"
                      onError={() =>
                        setFailed((current) => new Set([...current, errorKey]))
                      }
                    />
                  )}
                  <span>{image.path.split('/').at(-1)}</span>
                </button>
              );
            })}
          </div>
          {!shown.length && (
            <p>No images match. Your selected image is unchanged.</p>
          )}
          <p>
            All source images are available to try. A thumbnail is not proof of
            material compatibility.
          </p>
        </section>
      )}
    </div>
  );
}
