import { useCallback, useEffect, useMemo, useState } from 'react';
import './MaterialEditorLab.css';
import {
  MaterialEditorScene,
  type SlotVisualState,
  type TextureLoadStatus,
} from './MaterialEditorScene';
import {
  auditedMaterialName,
  definitionForSlot,
  inventoryUrl,
  parseEditingProfile,
  parseMaterialEditorManifest,
  resetSlotOverride,
  resolvedSlotChannels,
  serializeEditingProfile,
  setSlotChannels,
  slotKey,
  validateEditingProfile,
  type EditingProfile,
  type EditingProfileDefinition,
  type MaterialEditorManifest,
} from './materialRecipe';
import type { AssetReviewLoadStatus } from './model';

const MANIFEST_URL = '/models/synty/asset-review-editor/manifest.json';

interface TextureState {
  status: TextureLoadStatus;
  detail?: string;
}

function fileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function downloadProfile(profile: EditingProfile): void {
  const url = URL.createObjectURL(
    new Blob([serializeEditingProfile(profile)], { type: 'application/json' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `${profile.profileId.replace(/[^A-Za-z0-9._-]/g, '-')}-material-editor-profile.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function textureKey(slot: string, channel: string): string {
  return `${slot}\u0000${channel}`;
}

function ImageSelect({
  ariaLabel,
  value,
  images,
  allowNone,
  noneLabel,
  onChange,
}: {
  ariaLabel: string;
  value: string;
  images: MaterialEditorManifest['inventory']['images'];
  allowNone: boolean;
  noneLabel: string;
  onChange: (path: string) => void;
}) {
  const folders = new Map<string, typeof images>();
  for (const image of images) {
    const folder = image.path.includes('/')
      ? image.path.slice(0, image.path.lastIndexOf('/'))
      : '(pack root)';
    const list = folders.get(folder) ?? [];
    list.push(image);
    folders.set(folder, list);
  }
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {allowNone && <option value="">{noneLabel}</option>}
      {[...folders.entries()].map(([folder, folderImages]) => (
        <optgroup key={folder} label={folder}>
          {folderImages.map((image) => (
            <option key={image.path} value={image.path}>
              {image.path.split('/').at(-1)} ({image.format})
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function TextureStatusLine({
  state,
  label,
}: {
  state?: TextureState;
  label: string;
}) {
  const status = state?.status ?? 'idle';
  return (
    <p
      className={`material-editor-texture-status material-editor-texture-status--${status}`}
      role={status === 'error' ? 'alert' : 'status'}
    >
      {label}:{' '}
      {status === 'loading'
        ? 'loading…'
        : status === 'error'
          ? `failed — ${state?.detail ?? 'unknown error'}`
          : status === 'success'
            ? 'loaded'
            : 'not used'}
    </p>
  );
}

function sceneSlots(
  manifest: MaterialEditorManifest,
  profile: EditingProfile,
  sourceIndex: number
): Record<string, SlotVisualState> {
  const source = manifest.editor.sources[sourceIndex];
  const result: Record<string, SlotVisualState> = {};
  if (!source) return result;
  for (const target of source.targets) {
    if (!target.rendered) continue;
    const key = slotKey(source.sourcePath, target.objectName, target.slot);
    const resolved = resolvedSlotChannels(
      profile,
      manifest,
      source.sourcePath,
      target.objectName,
      target.slot
    );
    result[key] = {
      channels: resolved.channels,
      urls: {
        baseColor: resolved.channels.baseColor
          ? inventoryUrl(manifest, resolved.channels.baseColor.path)
          : null,
        normal: resolved.channels.normal
          ? inventoryUrl(manifest, resolved.channels.normal.path)
          : null,
        emissive: resolved.channels.emissive?.image
          ? inventoryUrl(manifest, resolved.channels.emissive.image.path)
          : null,
      },
    };
  }
  return result;
}

export function MaterialEditorLab() {
  const [manifest, setManifest] = useState<MaterialEditorManifest>();
  const [profile, setProfile] = useState<EditingProfile>();
  const [error, setError] = useState('');
  const [sourceIndex, setSourceIndex] = useState(0);
  const [selected, setSelected] = useState<{
    objectName: string;
    slot: number;
  }>();
  const [glbLoad, setGlbLoad] = useState<{
    url: string;
    status: AssetReviewLoadStatus;
    detail?: string;
  }>();
  const [textureStates, setTextureStates] = useState<
    Record<string, TextureState>
  >({});

  useEffect(() => {
    let active = true;
    void fetch(MANIFEST_URL)
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            `Material editor manifest returned ${response.status}`
          );
        return parseMaterialEditorManifest(await response.json());
      })
      .then((value) => {
        if (active) {
          setManifest(value);
          setProfile(value.profile);
        }
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      active = false;
    };
  }, []);

  const onLoadStateChange = useCallback(
    (url: string, status: AssetReviewLoadStatus, detail?: string) => {
      setGlbLoad((current) =>
        current?.url === url &&
        current.status === status &&
        current.detail === detail
          ? current
          : { url, status, detail }
      );
    },
    []
  );
  const onTextureStateChange = useCallback(
    (key: string, status: TextureLoadStatus, detail?: string) => {
      setTextureStates((current) => {
        const previous = current[key];
        if (previous?.status === status && previous.detail === detail)
          return current;
        return { ...current, [key]: { status, detail } };
      });
    },
    []
  );

  // Per-slot visual state for the scene; recomputed only when the profile,
  // manifest or source selection changes so texture loads stay stable.
  const slots = useMemo(
    () =>
      manifest && profile ? sceneSlots(manifest, profile, sourceIndex) : {},
    [manifest, profile, sourceIndex]
  );

  async function importProfile(file: File): Promise<void> {
    try {
      if (!manifest) return;
      const imported = parseEditingProfile(JSON.parse(await fileText(file)));
      validateEditingProfile(imported, manifest);
      setProfile(imported);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  if (!manifest || !profile)
    return (
      <main className="material-editor">
        <h1>Material editor</h1>
        {error ? (
          <p role="alert">
            {error}. Prepare editor output with the review script, then reload.
          </p>
        ) : (
          <p>Loading prepared editor geometry…</p>
        )}
      </main>
    );

  const source = manifest.editor.sources[sourceIndex];
  if (!source)
    return (
      <main className="material-editor">
        <h1>Material editor</h1>
        <p role="alert">
          Prepared manifest has no editor source at index {sourceIndex}.
        </p>
      </main>
    );

  const changed =
    serializeEditingProfile(profile) !==
    serializeEditingProfile(manifest.profile);

  const selectedTarget = selected
    ? source.targets.find(
        (target) =>
          target.objectName === selected.objectName &&
          target.slot === selected.slot
      )
    : undefined;
  const selectedDefinition = selected
    ? definitionForSlot(
        profile,
        manifest,
        source.sourcePath,
        selected.objectName,
        selected.slot
      )
    : undefined;
  const selectedResolution = selected
    ? resolvedSlotChannels(
        profile,
        manifest,
        source.sourcePath,
        selected.objectName,
        selected.slot
      )
    : undefined;
  const selectedKey = selected
    ? slotKey(source.sourcePath, selected.objectName, selected.slot)
    : '';

  const updateDefinition = (patch: Partial<EditingProfileDefinition>) => {
    if (!selected || !selectedDefinition) return;
    setProfile(
      setSlotChannels(
        profile,
        manifest,
        source.sourcePath,
        selected.objectName,
        selected.slot,
        { ...selectedDefinition, ...patch }
      )
    );
  };

  const textureErrorCount = Object.values(textureStates).filter(
    (state) => state.status === 'error'
  ).length;
  const glbStatus =
    glbLoad && glbLoad.url === source.glb.url ? glbLoad.status : 'loading';

  return (
    <main className="material-editor">
      <header>
        <h1>Material editor</h1>
        <p>
          {manifest.catalog.packSlug} / {manifest.catalog.packVersion} — editing
          profile <strong>{profile.profileId}</strong>
        </p>
        <p className="material-editor-notice" role="note">
          Experimental draft preview — per-slot material editing only. This does
          NOT mark assets Ready, approve materials, activate a cache, or publish
          assets.
        </p>
        <p>
          {changed
            ? 'Draft changes — export the editing profile to save them.'
            : 'Showing the prepared editing profile.'}
        </p>
        {error && <p role="alert">{error}</p>}
        {textureErrorCount > 0 && (
          <p role="alert">
            {textureErrorCount} image{' '}
            {textureErrorCount === 1 ? 'load' : 'loads'} failed — affected
            surfaces show the error color instead of a plain white material. See
            the per-channel status under the selected slot.
          </p>
        )}
      </header>
      <div className="material-editor-layout">
        <aside>
          <label>
            Editor source{' '}
            <select
              aria-label="Editor source"
              value={sourceIndex}
              onChange={(event) => {
                setSourceIndex(Number(event.target.value));
                setSelected(undefined);
              }}
            >
              {manifest.editor.sources.map((item, index) => (
                <option key={item.sourcePath} value={index}>
                  {item.sourcePath}
                </option>
              ))}
            </select>
          </label>
          <nav aria-label="Material slots">
            {source.targets.map((target) => {
              const resolved = resolvedSlotChannels(
                profile,
                manifest,
                source.sourcePath,
                target.objectName,
                target.slot
              );
              const label = auditedMaterialName(
                manifest,
                source.sourcePath,
                target.objectName,
                target.slot
              );
              const active =
                selected?.objectName === target.objectName &&
                selected?.slot === target.slot;
              return (
                <button
                  key={`${target.objectName}:${target.slot}`}
                  type="button"
                  aria-pressed={active}
                  disabled={!target.rendered}
                  onClick={() =>
                    setSelected({
                      objectName: target.objectName,
                      slot: target.slot,
                    })
                  }
                >
                  {target.objectName} · slot {target.slot}
                  <small>
                    {label ?? 'unknown material'} ·{' '}
                    <span
                      className={`material-editor-scope material-editor-scope--${resolved.scope}`}
                    >
                      {resolved.scope}
                    </span>
                    {target.rendered ? '' : ' · not rendered'}
                  </small>
                </button>
              );
            })}
          </nav>
        </aside>
        <section>
          {selected && selectedTarget && selectedDefinition ? (
            <>
              <h2>
                {selected.objectName} · slot {selected.slot}
              </h2>
              <p>
                Actual material:{' '}
                <strong>
                  {auditedMaterialName(
                    manifest,
                    source.sourcePath,
                    selected.objectName,
                    selected.slot
                  ) ?? 'unknown'}
                </strong>{' '}
                · scope {selectedResolution?.scope}
                {selectedResolution?.definitionId && (
                  <>
                    {' '}
                    · definition{' '}
                    <strong>{selectedResolution.definitionId}</strong>
                  </>
                )}
              </p>
              <p className="material-editor-mapping">
                {selectedTarget.rendered && selectedTarget.target
                  ? `Prepared target mapping — mesh ${selectedTarget.target.mesh}, primitive ${selectedTarget.target.primitive}, material ${selectedTarget.target.material} (${selectedTarget.target.materialName}), ${selectedTarget.faceCount} faces`
                  : 'Not rendered in the prepared editor geometry'}
              </p>
              <div className="channel-grid">
                <div className="channel">
                  <h4>Base color</h4>
                  <label>
                    Image{' '}
                    <ImageSelect
                      ariaLabel="Base color image"
                      value={selectedDefinition.baseColor ?? ''}
                      images={manifest.inventory.images}
                      allowNone
                      noneLabel="None — neutral solid (#666666)"
                      onChange={(path) =>
                        updateDefinition({ baseColor: path || null })
                      }
                    />
                  </label>
                  <TextureStatusLine
                    state={textureStates[textureKey(selectedKey, 'baseColor')]}
                    label="Base color image"
                  />
                </div>
                <div className="channel">
                  <h4>Normal</h4>
                  <label>
                    Image{' '}
                    <ImageSelect
                      ariaLabel="Normal image"
                      value={selectedDefinition.normal?.image ?? ''}
                      images={manifest.inventory.images}
                      allowNone
                      noneLabel="None"
                      onChange={(path) =>
                        updateDefinition({
                          normal:
                            path === ''
                              ? null
                              : {
                                  image: path,
                                  strength:
                                    selectedDefinition.normal?.strength ?? 1,
                                },
                        })
                      }
                    />
                  </label>
                  <label>
                    Strength{' '}
                    <input
                      aria-label="Normal strength"
                      type="number"
                      min={0}
                      max={10}
                      step={0.05}
                      value={selectedDefinition.normal?.strength ?? 1}
                      disabled={!selectedDefinition.normal}
                      onChange={(event) =>
                        updateDefinition({
                          normal: selectedDefinition.normal
                            ? {
                                ...selectedDefinition.normal,
                                strength: Number(event.target.value),
                              }
                            : null,
                        })
                      }
                    />
                  </label>
                  <TextureStatusLine
                    state={textureStates[textureKey(selectedKey, 'normal')]}
                    label="Normal image"
                  />
                </div>
                <div className="channel">
                  <h4>Emissive</h4>
                  <label>
                    Mode{' '}
                    <select
                      aria-label="Emissive mode"
                      value={
                        selectedDefinition.emissive === null
                          ? 'off'
                          : selectedDefinition.emissive.image === null
                            ? 'solid'
                            : 'image'
                      }
                      onChange={(event) => {
                        const mode = event.target.value;
                        if (mode === 'off') {
                          updateDefinition({ emissive: null });
                        } else {
                          const previous = selectedDefinition.emissive;
                          updateDefinition({
                            emissive: {
                              image:
                                mode === 'image'
                                  ? (previous?.image ?? null)
                                  : null,
                              color: previous?.color ?? 'FFFFFF',
                              strength: previous?.strength ?? 1,
                            },
                          });
                        }
                      }}
                    >
                      <option value="off">Off</option>
                      <option value="solid">Solid color</option>
                      <option value="image">Image</option>
                    </select>
                  </label>
                  {selectedDefinition.emissive !== null && (
                    <>
                      <label>
                        Image{' '}
                        <ImageSelect
                          ariaLabel="Emissive image"
                          value={selectedDefinition.emissive.image ?? ''}
                          images={manifest.inventory.images}
                          allowNone
                          noneLabel="None (solid color)"
                          onChange={(path) =>
                            updateDefinition({
                              emissive: {
                                ...selectedDefinition.emissive!,
                                image: path || null,
                              },
                            })
                          }
                        />
                      </label>
                      <div className="channel-row">
                        <input
                          aria-label="Emissive color"
                          type="color"
                          value={`#${selectedDefinition.emissive.color}`}
                          onChange={(event) =>
                            updateDefinition({
                              emissive: {
                                ...selectedDefinition.emissive!,
                                color: event.target.value
                                  .replace('#', '')
                                  .toUpperCase(),
                              },
                            })
                          }
                        />
                        <input
                          aria-label="Emissive color hex"
                          type="text"
                          value={selectedDefinition.emissive.color}
                          onChange={(event) => {
                            const value = event.target.value
                              .replace('#', '')
                              .toUpperCase();
                            if (/^[0-9A-Fa-f]{6}$/.test(value))
                              updateDefinition({
                                emissive: {
                                  ...selectedDefinition.emissive!,
                                  color: value,
                                },
                              });
                          }}
                        />
                      </div>
                      <label>
                        Strength{' '}
                        <input
                          aria-label="Emissive strength"
                          type="number"
                          min={0}
                          max={10}
                          step={0.05}
                          value={selectedDefinition.emissive.strength}
                          onChange={(event) =>
                            updateDefinition({
                              emissive: {
                                ...selectedDefinition.emissive!,
                                strength: Number(event.target.value),
                              },
                            })
                          }
                        />
                      </label>
                    </>
                  )}
                  <TextureStatusLine
                    state={textureStates[textureKey(selectedKey, 'emissive')]}
                    label="Emissive image"
                  />
                </div>
                <div className="channel">
                  <h4>Sampling</h4>
                  <label>
                    Wrap{' '}
                    <select
                      aria-label="Texture wrap"
                      value={selectedDefinition.wrap}
                      onChange={(event) =>
                        updateDefinition({
                          wrap: event.target.value as 'repeat' | 'clamp',
                        })
                      }
                    >
                      <option value="repeat">repeat</option>
                      <option value="clamp">clamp</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setProfile(
                        resetSlotOverride(
                          profile,
                          source.sourcePath,
                          selected.objectName,
                          selected.slot
                        )
                      );
                    }}
                  >
                    Reset slot to prepared state
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p>Select a rendered material slot to edit its channels.</p>
          )}
          <MaterialEditorScene
            source={source}
            slots={slots}
            onLoadStateChange={onLoadStateChange}
            onTextureStateChange={onTextureStateChange}
          />
          <p role="status">
            {glbStatus === 'success'
              ? 'Prepared editor geometry loaded.'
              : glbStatus === 'error'
                ? `GLB load failed: ${glbLoad?.detail ?? 'unknown error'}`
                : 'Loading prepared editor geometry…'}
          </p>
        </section>
      </div>
      <footer>
        <div className="material-editor-footer-row">
          <label>
            Import editing profile{' '}
            <input
              aria-label="Import editing profile"
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importProfile(file);
                event.target.value = '';
              }}
            />
          </label>
          <button type="button" onClick={() => downloadProfile(profile)}>
            Export editing profile
          </button>
        </div>
        <p>
          The exported file is the schemaVersion 2 editing profile: independent
          channels, explicit None/solid emissive, per-slot scope. Run the review
          script against it to rebuild prepared output. Material approval and
          trusted cache activation are separate from this preview-only editor.
        </p>
      </footer>
    </main>
  );
}
