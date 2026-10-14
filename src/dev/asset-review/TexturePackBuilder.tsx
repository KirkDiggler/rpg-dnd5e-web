import { useState, type ReactElement } from 'react';
import { MaterialImagePicker } from './MaterialImagePicker';
import { inventoryUrl, type MaterialEditorManifest } from './materialRecipe';
import { imageLabel } from './texturePackLibrary';

export interface PackDraft {
  name: string;
  colors: string[];
  normal: string;
  emissive: string;
  wrap: 'repeat' | 'clamp';
}
export function TexturePackBuilder({
  manifest,
  draft,
  onChange,
  onSave,
}: {
  manifest: MaterialEditorManifest;
  draft: PackDraft;
  onChange: (draft: PackDraft) => void;
  onSave: () => void;
}): ReactElement {
  const [search, setSearch] = useState(''),
    [folder, setFolder] = useState('');
  const folders = [
    ...new Set(
      manifest.inventory.images.map((i) =>
        i.path.slice(0, i.path.lastIndexOf('/'))
      )
    ),
  ];
  const images = manifest.inventory.images.filter(
    (i) =>
      (!folder || i.path.startsWith(folder + '/')) &&
      i.path.toLowerCase().includes(search.toLowerCase())
  );
  function toggle(path: string, checked: boolean): void {
    onChange({
      ...draft,
      colors: checked
        ? [...new Set([...draft.colors, path])]
        : draft.colors.filter((p) => p !== path),
    });
  }
  return (
    <section aria-label="Pack Builder" className="pack-builder">
      <div className="pack-color-browser">
        <h2>1. Choose color images</h2>
        <div className="pack-browser-filters">
          <label>
            Folder
            <select
              aria-label="Color image folder"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
            >
              <option value="">All source folders</option>
              {folders.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label>
            Search
            <input
              aria-label="Find color images"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or path…"
            />
          </label>
        </div>
        <div className="pack-inline-actions">
          <button
            type="button"
            onClick={() =>
              onChange({
                ...draft,
                colors: [
                  ...new Set([...draft.colors, ...images.map((i) => i.path)]),
                ],
              })
            }
          >
            Select shown ({images.length})
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...draft, colors: [] })}
          >
            Clear colors
          </button>
          <strong>{draft.colors.length} colors selected</strong>
        </div>
        <div className="pack-color-grid">
          {images.map((i) => (
            <label
              key={i.path}
              className={
                draft.colors.includes(i.path)
                  ? 'pack-color-card is-selected'
                  : 'pack-color-card'
              }
              title={i.path}
            >
              <input
                type="checkbox"
                aria-label={`Color: ${i.path}`}
                checked={draft.colors.includes(i.path)}
                onChange={(e) => toggle(i.path, e.target.checked)}
              />
              <img
                loading="lazy"
                alt=""
                src={inventoryUrl(manifest, i.path) ?? undefined}
              />
              <span>{imageLabel(i.path)}</span>
            </label>
          ))}
        </div>
        {!images.length && <p>No source images match this search.</p>}
      </div>
      <div className="pack-builder-settings">
        <h2>2. Name and save</h2>
        <label>
          Pack name
          <input
            aria-label="Pack name"
            value={draft.name}
            maxLength={200}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder="Kingdom atlas, Castle walls…"
          />
        </label>
        <label>
          Normal image <small>Optional · shared by every color</small>
          <MaterialImagePicker
            ariaLabel="Pack normal image"
            value={draft.normal}
            images={manifest.inventory.images}
            allowNone
            noneLabel="None"
            onChange={(normal) => onChange({ ...draft, normal })}
          />
        </label>
        <label>
          Emissive image <small>Optional · shared by every color</small>
          <MaterialImagePicker
            ariaLabel="Pack emissive image"
            value={draft.emissive}
            images={manifest.inventory.images}
            allowNone
            noneLabel="None"
            onChange={(emissive) => onChange({ ...draft, emissive })}
          />
        </label>
        <label>
          Texture wrap
          <select
            aria-label="Pack texture wrap"
            value={draft.wrap}
            onChange={(e) =>
              onChange({ ...draft, wrap: e.target.value as PackDraft['wrap'] })
            }
          >
            <option value="clamp">Clamp</option>
            <option value="repeat">Repeat</option>
          </select>
        </label>
        <p>
          {draft.colors.length} color choices
          {draft.normal ? ' + shared normal' : ''}
          {draft.emissive ? ' + shared emissive' : ''}.
        </p>
        <button
          className="pack-primary"
          type="button"
          disabled={!draft.name.trim() || !draft.colors.length}
          onClick={onSave}
        >
          Save pack
        </button>
        <p>Save once, then try this pack on assets in the Asset Viewer.</p>
      </div>
    </section>
  );
}
