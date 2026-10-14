import { useEffect, useMemo, useState } from 'react';
import {
  type EditingProfileDefinition,
  type MaterialEditorManifest,
} from './materialRecipe';
import {
  addPack,
  allowedPacks,
  assignPack,
  createLibrary,
  libraryDraftKey,
  parseLibrary,
  putSet,
  removePack,
  removeSet,
  renamePack,
  renderedTargets,
  reviewDeclaration,
  serializeLibrary,
  targetKey,
  unassignPack,
  validateLibrary,
  type PackTarget,
  type TexturePackLibrary,
} from './texturePackLibrary';
import './TexturePackPanel.css';

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
function stem(path: string): string {
  return path
    .split('/')
    .at(-1)!
    .replace(/\.[^.]+$/, '');
}
function slug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 110);
}
function freshId(name: string, existing: object): string {
  const base = slug(name) || 'choice';
  let result = base,
    index = 2;
  while (Object.hasOwn(existing, result)) result = `${base}-${index++}`;
  return result;
}
function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
function download(name: string, json: string): void {
  const url = URL.createObjectURL(
    new Blob([json], { type: 'application/json' })
  );
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function TexturePackPanel({
  manifest,
  currentTarget,
  currentDefinition,
  onPreview,
}: {
  manifest: MaterialEditorManifest;
  currentTarget?: PackTarget;
  currentDefinition?: EditingProfileDefinition;
  onPreview: (definition: EditingProfileDefinition) => void;
}) {
  const key = libraryDraftKey(manifest);
  const [restored] = useState(() => {
    const empty = createLibrary(
      `${manifest.profile.packSlug}-library`,
      manifest
    );
    try {
      const saved = localStorage.getItem(key);
      if (!saved) return { library: empty, error: '' };
      const library = parseLibrary(JSON.parse(saved));
      validateLibrary(library, manifest);
      return { library, error: '' };
    } catch (cause) {
      return {
        library: empty,
        error: `Saved library could not be restored: ${message(cause)}. The saved file was preserved.`,
      };
    }
  });
  const [library, setLibrary] = useState(restored.library);
  const [restoreError, setRestoreError] = useState(restored.error);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const [activePack, setActivePack] = useState(
    () => Object.keys(restored.library.packs)[0] ?? ''
  );
  const [packName, setPackName] = useState(''),
    [setName, setSetName] = useState('');
  const [imageSearch, setImageSearch] = useState(''),
    [assetSearch, setAssetSearch] = useState('');
  const [selectedImages, setSelectedImages] = useState(new Set<string>());
  const [selectedTargets, setSelectedTargets] = useState(new Set<string>());
  const [storageError, setStorageError] = useState('');
  useEffect(() => {
    if (restoreError) return;
    try {
      validateLibrary(library, manifest);
      localStorage.setItem(key, serializeLibrary(library));
      setStorageError('');
    } catch (cause) {
      setStorageError(
        `Autosave failed: ${message(cause)}. Export the library to keep your work.`
      );
    }
  }, [library, manifest, key, restoreError]);
  const targets = useMemo(() => renderedTargets(manifest), [manifest]);
  const chosenTargets = targets.filter((t) =>
    selectedTargets.has(targetKey(t))
  );
  const chosenAssets = new Set(chosenTargets.map((t) => t.sourcePath)).size;
  const images = manifest.inventory.images.filter((i) =>
    i.path.toLowerCase().includes(imageSearch.toLowerCase())
  );
  const sources = manifest.editor.sources.filter((s) =>
    [
      s.sourcePath,
      ...s.targets.map((t) => `${t.objectName} ${t.materialName}`),
    ].some((v) => v.toLowerCase().includes(assetSearch.toLowerCase()))
  );
  const currentPacks = currentTarget
    ? allowedPacks(library, currentTarget)
    : [];
  const pack = library.packs[activePack];
  function operate(action: () => TexturePackLibrary, detail: string): boolean {
    try {
      const next = action();
      validateLibrary(next, manifest);
      setLibrary(next);
      setError('');
      setNotice(detail);
      return true;
    } catch (cause) {
      setError(message(cause));
      return false;
    }
  }
  function commitSets(sets: Record<string, EditingProfileDefinition>): void {
    if (activePack) {
      operate(
        () =>
          Object.entries(sets).reduce(
            (l, [id, def]) => putSet(l, activePack, id, def, manifest),
            library
          ),
        'Saved complete sets to the shared pack.'
      );
    } else {
      const name = packName.trim();
      if (!name) {
        setError('Name the new pack first.');
        return;
      }
      const id = freshId(name, library.packs);
      if (
        operate(
          () => addPack(library, id, name, sets),
          'Created a shared pack. No assets were assigned.'
        )
      )
        setActivePack(id);
    }
  }
  function colors(): void {
    const sets: Record<string, EditingProfileDefinition> = {},
      existing = { ...(pack?.sets ?? {}) };
    for (const image of manifest.inventory.images.filter((i) =>
      selectedImages.has(i.path)
    )) {
      const name = stem(image.path),
        id = freshId(name, { ...existing, ...sets });
      const label = name.match(/(?:^|_)(\d+_[A-Za-z]+)$/)?.[1] ?? name;
      sets[id] = {
        label,
        baseColor: image.path,
        normal: null,
        emissive: null,
        wrap: currentDefinition?.wrap ?? 'clamp',
      };
    }
    if (!Object.keys(sets).length) {
      setError('Select at least one color image.');
      return;
    }
    commitSets(sets);
  }
  function saveCurrent(): void {
    if (!currentDefinition) return;
    const label = setName.trim() || currentDefinition.label;
    const id =
      Object.entries(pack?.sets ?? {}).find(
        ([, set]) => set.label === label
      )?.[0] ?? freshId(label, pack?.sets ?? {});
    commitSets({ [id]: { ...currentDefinition, label } });
  }
  function toggleImages(path: string, checked: boolean): void {
    setSelectedImages((old) => {
      const next = new Set(old);
      if (checked) next.add(path);
      else next.delete(path);
      return next;
    });
  }
  function toggleTargets(scopes: PackTarget[], checked: boolean): void {
    setSelectedTargets((old) => {
      const next = new Set(old);
      for (const t of scopes) {
        if (checked) next.add(targetKey(t));
        else next.delete(targetKey(t));
      }
      return next;
    });
  }
  async function importFile(file: File): Promise<void> {
    setBusy(true);
    try {
      const imported = parseLibrary(JSON.parse(await readFile(file)));
      validateLibrary(imported, manifest);
      setLibrary(imported);
      setActivePack(Object.keys(imported.packs)[0] ?? '');
      setRestoreError('');
      setError('');
      setNotice(
        'Imported the library. Pack assignment did not alter the preview or defaults.'
      );
    } catch (cause) {
      setError(
        `${message(cause)}. Current library and saved draft were preserved.`
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="texture-pack-panel">
      <summary>Texture packs and bulk assignment</summary>
      <p>
        One shared pack, many complete sets. Assigning declares available
        choices; it does not change an asset’s original/default appearance.
        Preview remains an artistic trial. Lists do not eagerly load the
        full-resolution texture library; use Preview to load a choice at source
        quality.
      </p>
      {(error || restoreError || storageError) && (
        <p role="alert">
          {[error, restoreError, storageError].filter(Boolean).join(' ')}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <fieldset disabled={busy}>
        <legend>Library draft</legend>
        <div className="texture-pack-actions">
          <button
            type="button"
            onClick={() => {
              try {
                download(
                  `${library.libraryId}.json`,
                  serializeLibrary(library)
                );
                setError('');
              } catch (cause) {
                setError(message(cause));
              }
            }}
          >
            Export pack library
          </button>
          <label>
            Import pack library{' '}
            <input
              aria-label="Import pack library"
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void importFile(file);
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setBusy(true);
              void reviewDeclaration(library, manifest)
                .then((d) =>
                  download(
                    `${library.libraryId}-review-declaration.json`,
                    JSON.stringify(d, null, 2) + '\n'
                  )
                )
                .catch((cause) => setError(message(cause)))
                .finally(() => setBusy(false));
            }}
          >
            Export review declaration
          </button>
          {restoreError && (
            <button type="button" onClick={() => setRestoreError('')}>
              Replace preserved autosave with this library
            </button>
          )}
        </div>
        <p>
          Review-only: source/editor bindings are not published runtime bindings
          or approval. Licensed declarations stay private.
        </p>
        <label>
          Texture pack{' '}
          <select
            aria-label="Texture pack"
            value={activePack}
            onChange={(e) => setActivePack(e.target.value)}
          >
            <option value="">New pack…</option>
            {Object.entries(library.packs).map(([id, p]) => (
              <option key={id} value={id}>
                {p.label} ({Object.keys(p.sets).length} sets)
              </option>
            ))}
          </select>
        </label>
        {pack ? (
          <div className="texture-pack-actions">
            <label>
              Pack display name{' '}
              <input
                aria-label="Pack display name"
                key={`${activePack}:${pack.label}`}
                defaultValue={pack.label}
                maxLength={200}
                onBlur={(e) => {
                  const label = e.target.value.trim();
                  if (label !== pack.label)
                    operate(
                      () => renamePack(library, activePack, label),
                      'Renamed pack; IDs and memberships are unchanged.'
                    );
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                operate(
                  () => removePack(library, activePack),
                  'Removed the pack and its memberships; previews/defaults are unchanged.'
                );
                setActivePack('');
              }}
            >
              Remove pack and memberships
            </button>
          </div>
        ) : (
          <label>
            New pack name{' '}
            <input
              aria-label="New pack name"
              value={packName}
              maxLength={128}
              onChange={(e) => setPackName(e.target.value)}
            />
          </label>
        )}
        <h4>Complete sets</h4>
        <label>
          Set name{' '}
          <input
            aria-label="Pack set name"
            placeholder={currentDefinition?.label ?? 'Brick, stucco, 01_A…'}
            value={setName}
            maxLength={128}
            onChange={(e) => setSetName(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={!currentDefinition?.baseColor}
          onClick={saveCurrent}
        >
          Save current surface as named set
        </button>
        <p>
          Copies the current color, normal, emissive and wrap settings. Saving
          the same set name updates that set; later workbench edits do not
          change the saved set.
        </p>
        {pack && (
          <ul className="texture-pack-sets">
            {Object.entries(pack.sets).map(([id, set]) => (
              <li key={id}>
                <div>
                  <label>
                    Set display name
                    <input
                      aria-label={`Set display name: ${id}`}
                      key={`${id}:${set.label}`}
                      defaultValue={set.label}
                      maxLength={200}
                      onBlur={(event) => {
                        const label = event.target.value.trim();
                        if (label !== set.label)
                          operate(
                            () =>
                              putSet(
                                library,
                                activePack,
                                id,
                                { ...set, label },
                                manifest
                              ),
                            'Renamed set; its identity and pack memberships are unchanged.'
                          );
                      }}
                    />
                  </label>
                  <small>
                    Color: {stem(set.baseColor!)} · Normal:{' '}
                    {set.normal ? stem(set.normal.image) : 'off'} · Emissive:{' '}
                    {set.emissive
                      ? set.emissive.image
                        ? stem(set.emissive.image)
                        : 'solid'
                      : 'off'}
                  </small>
                </div>
                <button
                  type="button"
                  disabled={!currentTarget}
                  onClick={() => {
                    try {
                      onPreview(set);
                      setError('');
                      setNotice(
                        'Previewed this complete set on the selected surface only. Membership/defaults were not changed.'
                      );
                    } catch (cause) {
                      setError(message(cause));
                    }
                  }}
                >
                  Preview {set.label}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    operate(
                      () => removeSet(library, activePack, id),
                      'Removed set from the shared pack.'
                    )
                  }
                >
                  Remove {set.label}
                </button>
              </li>
            ))}
          </ul>
        )}
        <details>
          <summary>Create color-only choices from source images</summary>
          <label>
            Find color images{' '}
            <input
              aria-label="Find pack color images"
              value={imageSearch}
              onChange={(e) => setImageSearch(e.target.value)}
            />
          </label>
          <div className="texture-pack-actions">
            <button
              type="button"
              onClick={() =>
                setSelectedImages(
                  (old) => new Set([...old, ...images.map((i) => i.path)])
                )
              }
            >
              Select matching color images ({images.length})
            </button>
            <button type="button" onClick={() => setSelectedImages(new Set())}>
              Clear image selection
            </button>
          </div>
          <div className="texture-pack-images">
            {images.map((i) => (
              <label key={i.path}>
                <input
                  type="checkbox"
                  aria-label={`Pack color image: ${i.path}`}
                  checked={selectedImages.has(i.path)}
                  onChange={(e) => toggleImages(i.path, e.target.checked)}
                />
                <span>{i.path}</span>
              </label>
            ))}
          </div>
          <p>
            {selectedImages.size} images selected. Each becomes a color-only
            set: normal/emissive off, wrap {currentDefinition?.wrap ?? 'clamp'}.
            Selection is artistic, not inferred compatibility.
          </p>
          <button
            type="button"
            disabled={!selectedImages.size}
            onClick={colors}
          >
            Save selected colors as sets
          </button>
        </details>
        <h4>Explicit bulk membership</h4>
        <p>
          Current surface:{' '}
          {currentPacks.length
            ? currentPacks.map((id) => library.packs[id]!.label).join(', ')
            : 'no assigned pack'}
          . Pack choices do not override unrelated materials.
        </p>
        <label>
          Find assets or materials{' '}
          <input
            aria-label="Find pack assignment targets"
            value={assetSearch}
            onChange={(e) => setAssetSearch(e.target.value)}
          />
        </label>
        <div className="texture-pack-actions">
          <button
            type="button"
            disabled={!currentTarget}
            onClick={() =>
              currentTarget && toggleTargets([currentTarget], true)
            }
          >
            Select current surface
          </button>
          <button
            type="button"
            onClick={() =>
              toggleTargets(
                targets.filter((t) =>
                  sources.some((s) => s.sourcePath === t.sourcePath)
                ),
                true
              )
            }
          >
            Select all matching rendered slots
          </button>
          <button type="button" onClick={() => setSelectedTargets(new Set())}>
            Clear target selection
          </button>
        </div>
        <div className="texture-pack-targets">
          {sources.map((source) => {
            const scopes = targets.filter(
              (t) => t.sourcePath === source.sourcePath
            );
            if (!scopes.length) return null;
            const count = scopes.filter((t) =>
              selectedTargets.has(targetKey(t))
            ).length;
            return (
              <div key={source.sourcePath}>
                <label>
                  <input
                    type="checkbox"
                    aria-label={`All slots: ${stem(source.sourcePath)}`}
                    checked={count === scopes.length}
                    onChange={(e) => toggleTargets(scopes, e.target.checked)}
                  />
                  {stem(source.sourcePath)}{' '}
                  <small>
                    ({count}/{scopes.length} slots selected)
                  </small>
                </label>
                <details>
                  <summary>Inspect material slots</summary>
                  {scopes.map((t) => (
                    <label key={targetKey(t)}>
                      <input
                        type="checkbox"
                        aria-label={`Target: ${t.objectName} slot ${t.slot}`}
                        checked={selectedTargets.has(targetKey(t))}
                        onChange={(e) => toggleTargets([t], e.target.checked)}
                      />
                      {t.objectName} · slot {t.slot} ·{' '}
                      {
                        source.targets.find(
                          (s) =>
                            s.objectName === t.objectName && s.slot === t.slot
                        )!.materialName
                      }
                      <small>
                        {' '}
                        Allowed:{' '}
                        {allowedPacks(library, t)
                          .map((id) => library.packs[id]!.label)
                          .join(', ') || 'none'}
                      </small>
                    </label>
                  ))}
                </details>
              </div>
            );
          })}
        </div>
        <p>
          <strong>
            {chosenTargets.length} rendered slots across {chosenAssets} assets
            selected.
          </strong>{' '}
          Inspect multi-material assets before assigning.
        </p>
        <div className="texture-pack-actions">
          <button
            type="button"
            disabled={!activePack || !chosenTargets.length}
            onClick={() =>
              operate(
                () => assignPack(library, activePack, chosenTargets, manifest),
                `Assigned shared pack to ${chosenTargets.length} slots across ${chosenAssets} assets. Defaults/preview unchanged.`
              )
            }
          >
            Assign pack to selected slots
          </button>
          <button
            type="button"
            disabled={!activePack || !chosenTargets.length}
            onClick={() =>
              operate(
                () => unassignPack(library, activePack, chosenTargets),
                'Removed selected memberships. Other packs/defaults remain unchanged.'
              )
            }
          >
            Unassign pack from selected slots
          </button>
        </div>
      </fieldset>
    </details>
  );
}
