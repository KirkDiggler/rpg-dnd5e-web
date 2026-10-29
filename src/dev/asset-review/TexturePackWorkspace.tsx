import { useEffect, useState, type ReactElement } from 'react';
import './MaterialEditorLab.css';
import type {
  EditingProfileDefinition,
  MaterialEditorManifest,
} from './materialRecipe';
import {
  TexturePackAssetViewer,
  type PackViewerState,
} from './TexturePackAssetViewer';
import { TexturePackBuilder, type PackDraft } from './TexturePackBuilder';
import {
  addPack,
  createLibrary,
  imageLabel,
  libraryDraftKey,
  parseLibrary,
  reviewDeclaration,
  serializeLibrary,
  validateLibrary,
  type TexturePackLibrary,
} from './texturePackLibrary';
import './TexturePackWorkspace.css';

type View = 'builder' | 'viewer' | 'files';
function detail(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
function download(name: string, text: string): void {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/json' })
  );
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
function fileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
function uniqueId(name: string, values: object): string {
  const base =
    name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .slice(0, 110) || 'pack';
  let id = base,
    count = 2;
  while (Object.hasOwn(values, id)) id = `${base}-${count++}`;
  return id;
}
export function TexturePackWorkspace({
  manifest,
}: {
  manifest: MaterialEditorManifest;
}): ReactElement {
  const [view, setView] = useState<View>('builder');
  const [restored] = useState(() => {
    const empty = createLibrary(
      `${manifest.profile.packSlug}-library`,
      manifest
    );
    try {
      const raw = localStorage.getItem(libraryDraftKey(manifest));
      if (!raw) return { library: empty, error: '' };
      const library = parseLibrary(JSON.parse(raw));
      validateLibrary(library, manifest);
      return { library, error: '' };
    } catch (cause) {
      return {
        library: empty,
        error: `Saved library could not be restored: ${detail(cause)}. It was preserved. Use Library files to load a valid saved library.`,
      };
    }
  });
  const [library, setLibrary] = useState(restored.library),
    [restoreError, setRestoreError] = useState(restored.error);
  const [error, setError] = useState(''),
    [storageError, setStorageError] = useState(''),
    [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<PackDraft>({
    name: '',
    colors: [],
    normal: '',
    emissive: '',
    wrap: 'clamp',
  });
  const [viewer, setViewer] = useState<PackViewerState>({
    sourceIndex: 0,
    surfaceKey: '',
    packId: '',
    choiceId: '',
  });
  useEffect(() => {
    if (restoreError) return;
    try {
      validateLibrary(library, manifest);
      localStorage.setItem(
        libraryDraftKey(manifest),
        serializeLibrary(library)
      );
      setStorageError('');
    } catch (cause) {
      setStorageError(
        `Browser save failed: ${detail(cause)}. Use Library files → Save library file to keep your work.`
      );
    }
  }, [library, manifest, restoreError]);
  function changeLibrary(next: TexturePackLibrary): void {
    validateLibrary(next, manifest);
    setLibrary(next);
  }
  function savePack(): void {
    try {
      const name = draft.name.trim();
      if (!name || !draft.colors.length)
        throw new Error('Name the pack and select at least one color image.');
      const sets: Record<string, EditingProfileDefinition> = {};
      for (const path of draft.colors) {
        const id = uniqueId(
          path
            .split('/')
            .at(-1)!
            .replace(/\.[^.]+$/, ''),
          sets
        );
        sets[id] = {
          label: imageLabel(path),
          baseColor: path,
          normal: draft.normal ? { image: draft.normal, strength: 1 } : null,
          emissive: draft.emissive
            ? { image: draft.emissive, color: 'FFFFFF', strength: 1 }
            : null,
          wrap: draft.wrap,
        };
      }
      const id = uniqueId(name, library.packs);
      changeLibrary(addPack(library, id, name, sets));
      setViewer({ ...viewer, packId: id, choiceId: '' });
      setView('viewer');
      setError('');
      setDraft({
        name: '',
        colors: [],
        normal: '',
        emissive: '',
        wrap: 'clamp',
      });
    } catch (cause) {
      setError(detail(cause));
    }
  }
  async function loadLibrary(file: File): Promise<void> {
    setBusy(true);
    try {
      const imported = parseLibrary(JSON.parse(await fileText(file)));
      validateLibrary(imported, manifest);
      setLibrary(imported);
      setRestoreError('');
      setError('');
      setViewer({ ...viewer, packId: '', choiceId: '' });
    } catch (cause) {
      setError(
        `${detail(cause)}. Current library and saved draft were preserved.`
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="material-editor texture-pack-workspace">
      <header className="pack-workspace-header">
        <div>
          <h1>Texture packs</h1>
          <p>
            {manifest.profile.packSlug} · {Object.keys(library.packs).length}{' '}
            saved packs · draft authoring, not runtime publication
          </p>
        </div>
        <a href="?assetReview=1&materialEditor=1&materialWorkbench=1">
          Advanced material lab
        </a>
      </header>
      <nav aria-label="Texture pack views" className="pack-view-tabs">
        <button
          type="button"
          aria-pressed={view === 'builder'}
          onClick={() => setView('builder')}
        >
          Pack Builder
        </button>
        <button
          type="button"
          aria-pressed={view === 'viewer'}
          onClick={() => setView('viewer')}
        >
          Asset Viewer
        </button>
        <button
          type="button"
          aria-pressed={view === 'files'}
          onClick={() => setView('files')}
        >
          Library files
        </button>
      </nav>
      {(error || restoreError || storageError) && (
        <p role="alert" className="pack-workspace-error">
          {[error, restoreError, storageError].filter(Boolean).join(' ')}
        </p>
      )}
      {view === 'builder' && (
        <TexturePackBuilder
          manifest={manifest}
          draft={draft}
          onChange={setDraft}
          onSave={savePack}
        />
      )}
      {view === 'viewer' && (
        <TexturePackAssetViewer
          manifest={manifest}
          library={library}
          state={viewer}
          onStateChange={setViewer}
          onLibraryChange={changeLibrary}
          onError={setError}
        />
      )}
      {view === 'files' && (
        <section className="pack-library-files" aria-label="Library files">
          <h2>Keep or reopen your saved work</h2>
          <p>
            Save pack stores it in this browser. Download a library JSON file
            for a durable copy or to move your work to another viewer.
          </p>
          <fieldset disabled={busy}>
            <legend>Saved library JSON</legend>
            <button
              type="button"
              onClick={() => {
                try {
                  download(
                    `${library.libraryId}.json`,
                    serializeLibrary(library)
                  );
                } catch (cause) {
                  setError(detail(cause));
                }
              }}
            >
              Save library file
            </button>
            <label>
              Load a previously saved library (.json)
              <input
                aria-label="Load saved library"
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void loadLibrary(file);
                }}
              />
            </label>
            <p>
              This loads a file produced by Save library file—not a Synty ZIP, a
              texture folder or an editing-profile file.
            </p>
            {restoreError && (
              <button type="button" onClick={() => setRestoreError('')}>
                Replace preserved browser draft with current library
              </button>
            )}
          </fieldset>
          <h3>Saved packs</h3>
          <ul>
            {Object.entries(library.packs).map(([id, p]) => (
              <li key={id}>
                <strong>{p.label}</strong> · {Object.keys(p.sets).length}{' '}
                choices{' '}
                <button
                  type="button"
                  onClick={() => {
                    setViewer({ ...viewer, packId: id, choiceId: '' });
                    setView('viewer');
                  }}
                >
                  View {p.label} on an asset
                </button>
              </li>
            ))}
          </ul>
          <details>
            <summary>Ingestion handoff (advanced)</summary>
            <p>
              Review-only source/editor declaration. This is not a released
              Studio catalog.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void reviewDeclaration(library, manifest)
                  .then((d) =>
                    download(
                      `${library.libraryId}-review.json`,
                      JSON.stringify(d, null, 2) + '\n'
                    )
                  )
                  .catch((cause) => setError(detail(cause)))
                  .finally(() => setBusy(false));
              }}
            >
              Export review declaration
            </button>
          </details>
        </section>
      )}
    </main>
  );
}
