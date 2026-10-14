import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  batchCounts,
  batchDefinitionForSlot,
  batchScopeForSlot,
  createBatchDocument,
  deferPiece,
  enqueueSources,
  extractConfiguredOverrides,
  findQueueEntry,
  markPieceEditing,
  parseBatchDocument,
  removeSource,
  restoreSavedPiece,
  savePiece,
  serializeBatchDocument,
  serializeBatchExtraction,
  setBatchName,
  setBatchSlotChannels,
  setWorkingStyle,
  staleQueueEntries,
  validateBatchDocument,
  type BatchDocument,
  type BatchPieceStatus,
} from './materialBatch';
import './MaterialEditorLab.css';
import {
  MaterialEditorScene,
  type SlotVisualState,
  type TextureLoadStatus,
} from './MaterialEditorScene';
import { MaterialImagePicker as ImageSelect } from './MaterialImagePicker';
import {
  auditedMaterialName,
  channelsOfDefinition,
  definitionForSlot,
  editingDefinitionWireDocument,
  inventoryUrl,
  parseEditingProfile,
  parseEditingProfileDefinition,
  parseMaterialEditorManifest,
  resetSlotOverride,
  resolvedSlotChannels,
  serializeEditingProfile,
  setSlotChannels,
  slotKey,
  validateEditingProfile,
  type EditingProfile,
  type EditingProfileDefinition,
  type InventoryImage,
  type MaterialEditorManifest,
} from './materialRecipe';
import type { AssetReviewLoadStatus } from './model';
import { TexturePackPanel } from './TexturePackPanel';

const MANIFEST_URL = '/models/synty/asset-review-editor/manifest.json';
/** Batch-specific browser convenience draft; the exported JSON is durable. */
const BATCH_DRAFT_KEY = 'material-editor-batch-draft-v1';

interface TextureState {
  status: TextureLoadStatus;
  detail?: string;
}

interface ChannelLabels {
  baseColor: string;
  normal: string;
  normalStrength: string;
  emissiveMode: string;
  emissiveImage: string;
  emissiveColor: string;
  emissiveColorHex: string;
  emissiveStrength: string;
  wrap: string;
}

const SLOT_LABELS: ChannelLabels = {
  baseColor: 'Base color image',
  normal: 'Normal image',
  normalStrength: 'Normal strength',
  emissiveMode: 'Emissive mode',
  emissiveImage: 'Emissive image',
  emissiveColor: 'Emissive color',
  emissiveColorHex: 'Emissive color hex',
  emissiveStrength: 'Emissive strength',
  wrap: 'Texture wrap',
};

const STYLE_LABELS: ChannelLabels = {
  baseColor: 'Working style base color image',
  normal: 'Working style normal image',
  normalStrength: 'Working style normal strength',
  emissiveMode: 'Working style emissive mode',
  emissiveImage: 'Working style emissive image',
  emissiveColor: 'Working style emissive color',
  emissiveColorHex: 'Working style emissive color hex',
  emissiveStrength: 'Working style emissive strength',
  wrap: 'Working style texture wrap',
};

function fileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function downloadJson(name: string, json: string): void {
  const url = URL.createObjectURL(
    new Blob([json], { type: 'application/json' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadProfile(profile: EditingProfile): void {
  downloadJson(
    `${profile.profileId.replace(/[^A-Za-z0-9._-]/g, '-')}-material-editor-profile.json`,
    serializeEditingProfile(profile)
  );
}

function textureKey(slot: string, channel: string): string {
  return `${slot}\u0000${channel}`;
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

/**
 * The channel controls shared by a slot editor and the working style panel:
 * identical inputs, distinct labels, optional per-channel texture status.
 */
function DefinitionChannels({
  definition,
  images,
  labels,
  onPatch: commitPatch,
  statusLine,
}: {
  definition: EditingProfileDefinition;
  images: InventoryImage[];
  labels: ChannelLabels;
  onPatch: (patch: Partial<EditingProfileDefinition>) => void;
  statusLine?: (channel: 'baseColor' | 'normal' | 'emissive') => ReactNode;
}) {
  const [channelError, setChannelError] = useState('');
  const onPatch = (patch: Partial<EditingProfileDefinition>): void => {
    try {
      parseEditingProfileDefinition(
        editingDefinitionWireDocument({ ...definition, ...patch })
      );
      commitPatch(patch);
      setChannelError('');
    } catch (cause) {
      setChannelError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  return (
    <div className="channel-grid">
      {channelError && (
        <p role="alert">{channelError}. Previous settings were preserved.</p>
      )}
      <div className="channel">
        <h4>Base color</h4>
        <div>
          Image{' '}
          <ImageSelect
            ariaLabel={labels.baseColor}
            value={definition.baseColor ?? ''}
            images={images}
            allowNone
            noneLabel="None — neutral solid (#666666)"
            onChange={(path) => onPatch({ baseColor: path || null })}
          />
        </div>
        {statusLine?.('baseColor')}
      </div>
      <div className="channel">
        <h4>Normal</h4>
        <div>
          Image{' '}
          <ImageSelect
            ariaLabel={labels.normal}
            value={definition.normal?.image ?? ''}
            images={images}
            allowNone
            noneLabel="None"
            onChange={(path) =>
              onPatch({
                normal:
                  path === ''
                    ? null
                    : {
                        image: path,
                        strength: definition.normal?.strength ?? 1,
                      },
              })
            }
          />
        </div>
        <label>
          Strength{' '}
          <input
            aria-label={labels.normalStrength}
            type="number"
            min={0}
            max={10}
            step={0.05}
            value={definition.normal?.strength ?? 1}
            disabled={!definition.normal}
            onChange={(event) =>
              onPatch({
                normal: definition.normal
                  ? {
                      ...definition.normal,
                      strength: Number(event.target.value),
                    }
                  : null,
              })
            }
          />
        </label>
        {statusLine?.('normal')}
      </div>
      <div className="channel">
        <h4>Emissive</h4>
        <label>
          Mode{' '}
          <select
            aria-label={labels.emissiveMode}
            value={
              definition.emissive === null
                ? 'off'
                : definition.emissive.image === null
                  ? 'solid'
                  : 'image'
            }
            onChange={(event) => {
              const mode = event.target.value;
              if (mode === 'off') {
                onPatch({ emissive: null });
              } else {
                const previous = definition.emissive;
                onPatch({
                  emissive: {
                    image: mode === 'image' ? (previous?.image ?? null) : null,
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
        {definition.emissive !== null && (
          <>
            <div>
              Image{' '}
              <ImageSelect
                ariaLabel={labels.emissiveImage}
                value={definition.emissive.image ?? ''}
                images={images}
                allowNone
                noneLabel="None (solid color)"
                onChange={(path) =>
                  onPatch({
                    emissive: { ...definition.emissive!, image: path || null },
                  })
                }
              />
            </div>
            <div className="channel-row">
              <input
                aria-label={labels.emissiveColor}
                type="color"
                value={`#${definition.emissive.color}`}
                onChange={(event) =>
                  onPatch({
                    emissive: {
                      ...definition.emissive!,
                      color: event.target.value.replace('#', '').toUpperCase(),
                    },
                  })
                }
              />
              <input
                aria-label={labels.emissiveColorHex}
                type="text"
                value={definition.emissive.color}
                onChange={(event) => {
                  const value = event.target.value
                    .replace('#', '')
                    .toUpperCase();
                  if (/^[0-9A-Fa-f]{6}$/.test(value))
                    onPatch({
                      emissive: { ...definition.emissive!, color: value },
                    });
                }}
              />
            </div>
            <label>
              Strength{' '}
              <input
                aria-label={labels.emissiveStrength}
                type="number"
                min={0}
                max={10}
                step={0.05}
                value={definition.emissive.strength}
                onChange={(event) =>
                  onPatch({
                    emissive: {
                      ...definition.emissive!,
                      strength: Number(event.target.value),
                    },
                  })
                }
              />
            </label>
          </>
        )}
        {statusLine?.('emissive')}
      </div>
      <div className="channel">
        <h4>Sampling</h4>
        <label>
          Wrap{' '}
          <select
            aria-label={labels.wrap}
            value={definition.wrap}
            onChange={(event) =>
              onPatch({ wrap: event.target.value as 'repeat' | 'clamp' })
            }
          >
            <option value="repeat">repeat</option>
            <option value="clamp">clamp</option>
          </select>
        </label>
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<BatchPieceStatus, string> = {
  draft: 'draft',
  configured: 'configured',
  deferred: 'deferred',
};

function sceneSlots(
  manifest: MaterialEditorManifest,
  profile: EditingProfile,
  batchDoc: BatchDocument | undefined,
  sourceIndex: number
): Record<string, SlotVisualState> {
  const source = manifest.editor.sources[sourceIndex];
  const result: Record<string, SlotVisualState> = {};
  if (!source) return result;
  const queued = batchDoc
    ? findQueueEntry(batchDoc, source.sourcePath)
    : undefined;
  for (const target of source.targets) {
    if (!target.rendered) continue;
    const channels =
      batchDoc && queued
        ? channelsOfDefinition(
            batchDefinitionForSlot(
              batchDoc,
              source.sourcePath,
              target.objectName,
              target.slot
            )
          )
        : resolvedSlotChannels(
            profile,
            manifest,
            source.sourcePath,
            target.objectName,
            target.slot
          ).channels;
    const key = slotKey(source.sourcePath, target.objectName, target.slot);
    result[key] = {
      channels,
      urls: {
        baseColor: channels.baseColor
          ? inventoryUrl(manifest, channels.baseColor.path)
          : null,
        normal: channels.normal
          ? inventoryUrl(manifest, channels.normal.path)
          : null,
        emissive: channels.emissive?.image
          ? inventoryUrl(manifest, channels.emissive.image.path)
          : null,
      },
    };
  }
  return result;
}

export function MaterialEditorLab() {
  const [manifest, setManifest] = useState<MaterialEditorManifest>();
  const [profile, setProfile] = useState<EditingProfile>();
  const [batch, setBatch] = useState<BatchDocument>();
  const [batchNote, setBatchNote] = useState('');
  const [batchError, setBatchError] = useState('');
  const [batchSearch, setBatchSearch] = useState('');
  const [newBatchName, setNewBatchName] = useState('');
  const [error, setError] = useState('');
  const [sourceIndex, setSourceIndex] = useState(0);
  const [highlightSlot, setHighlightSlot] = useState(true);
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
        if (!active) return;
        setManifest(value);
        setProfile(value.profile);
        // Browser convenience draft: restore only when it still validates
        // against this prepared workspace; the exported JSON stays durable.
        try {
          const raw = localStorage.getItem(BATCH_DRAFT_KEY);
          if (raw) {
            const doc = parseBatchDocument(JSON.parse(raw));
            validateBatchDocument(doc, value);
            setBatch(doc);
            setBatchNote(
              'Restored the batch draft saved in this browser. Export the batch JSON as the durable copy.'
            );
          }
        } catch (cause: unknown) {
          setBatchNote(
            `Ignored a stale browser batch draft (${
              cause instanceof Error ? cause.message : String(cause)
            }). Import the exported batch JSON to restore it.`
          );
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

  // Persist the batch draft under its own key whenever it changes.
  useEffect(() => {
    if (!batch) return;
    try {
      localStorage.setItem(BATCH_DRAFT_KEY, serializeBatchDocument(batch));
    } catch {
      // Storage unavailable: the exported batch JSON remains the durable copy.
    }
  }, [batch]);

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

  const activeProfile = batch ? batch.profile : profile;

  // Per-slot visual state for the scene; recomputed only when the profile,
  // manifest or source selection changes so texture loads stay stable.
  const slots = useMemo(
    () =>
      manifest && activeProfile
        ? sceneSlots(manifest, activeProfile, batch, sourceIndex)
        : {},
    [manifest, activeProfile, batch, sourceIndex]
  );

  async function importProfile(file: File): Promise<void> {
    try {
      if (!manifest || !activeProfile) return;
      const imported = parseEditingProfile(JSON.parse(await fileText(file)));
      validateEditingProfile(imported, manifest);
      if (batch) setBatch({ ...batch, profile: imported });
      else setProfile(imported);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function importBatch(file: File): Promise<void> {
    try {
      if (!manifest) return;
      const imported = parseBatchDocument(JSON.parse(await fileText(file)));
      validateBatchDocument(imported, manifest);
      setBatch(imported);
      setBatchError('');
      setBatchNote(
        `Imported batch "${imported.batchName}" — ${imported.queue.length} queued piece(s).`
      );
    } catch (cause) {
      setBatchNote('');
      setBatchError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  if (!manifest || !activeProfile)
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

  const queueEntry = batch
    ? findQueueEntry(batch, source.sourcePath)
    : undefined;
  const stalePaths = batch ? staleQueueEntries(batch, manifest) : [];
  const currentStale = queueEntry
    ? stalePaths.includes(source.sourcePath)
    : false;
  const counts = batch ? batchCounts(batch) : undefined;

  const selectSource = (index: number, currentBatch = batch) => {
    setSourceIndex(index);
    setSelected(undefined);
    // Restore against the latest save/defer state, not the previous render.
    if (currentBatch && manifest.editor.sources[index]) {
      const path = manifest.editor.sources[index]!.sourcePath;
      const entry = findQueueEntry(currentBatch, path);
      if (entry?.status === 'configured')
        setBatch(restoreSavedPiece(currentBatch, manifest, path));
    }
  };

  const advanceQueue = (fromPath: string, currentBatch = batch): void => {
    if (!currentBatch) return;
    const index = currentBatch.queue.findIndex(
      (entry) => entry.sourcePath === fromPath
    );
    const next = currentBatch.queue[index + 1];
    if (!next) {
      const latestCounts = batchCounts(currentBatch);
      setBatchNote(
        `End of queue — ${latestCounts.configured} configured, ${latestCounts.deferred} deferred, ${latestCounts.draft} draft.`
      );
      return;
    }
    const nextIndex = manifest.editor.sources.findIndex(
      (item) => item.sourcePath === next.sourcePath
    );
    if (nextIndex >= 0) selectSource(nextIndex, currentBatch);
  };

  const saveAndNext = (): void => {
    if (!batch) return;
    try {
      const next = savePiece(batch, manifest, source.sourcePath);
      setBatch(next);
      setBatchError('');
      advanceQueue(source.sourcePath, next);
    } catch (cause) {
      setBatchError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const deferAndNext = (): void => {
    if (!batch) return;
    try {
      const next = deferPiece(batch, source.sourcePath);
      setBatch(next);
      setBatchError('');
      advanceQueue(source.sourcePath, next);
    } catch (cause) {
      setBatchError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const changed =
    serializeEditingProfile(activeProfile) !==
    serializeEditingProfile(manifest.profile);

  const selectedTarget = selected
    ? source.targets.find(
        (target) =>
          target.objectName === selected.objectName &&
          target.slot === selected.slot
      )
    : undefined;
  const selectedResolution = selected
    ? resolvedSlotChannels(
        activeProfile,
        manifest,
        source.sourcePath,
        selected.objectName,
        selected.slot
      )
    : undefined;
  const selectedDefinition = selected
    ? queueEntry
      ? batchDefinitionForSlot(
          batch!,
          source.sourcePath,
          selected.objectName,
          selected.slot
        )
      : definitionForSlot(
          activeProfile,
          manifest,
          source.sourcePath,
          selected.objectName,
          selected.slot
        )
    : undefined;
  const selectedScope = selected
    ? queueEntry
      ? batchScopeForSlot(
          batch!,
          source.sourcePath,
          selected.objectName,
          selected.slot
        )
      : selectedResolution?.scope
    : undefined;
  const selectedKey = selected
    ? slotKey(source.sourcePath, selected.objectName, selected.slot)
    : '';

  const updateDefinition = (patch: Partial<EditingProfileDefinition>) => {
    if (!selected || !selectedDefinition) return;
    if (batch && queueEntry) {
      setBatch(
        setBatchSlotChannels(
          batch,
          manifest,
          source.sourcePath,
          selected.objectName,
          selected.slot,
          { ...selectedDefinition, ...patch }
        )
      );
      return;
    }
    const nextProfile = setSlotChannels(
      activeProfile,
      manifest,
      source.sourcePath,
      selected.objectName,
      selected.slot,
      { ...selectedDefinition, ...patch }
    );
    if (batch) setBatch({ ...batch, profile: nextProfile });
    else setProfile(nextProfile);
  };

  const resetSlot = () => {
    if (!selected) return;
    const nextProfile = resetSlotOverride(
      activeProfile,
      source.sourcePath,
      selected.objectName,
      selected.slot
    );
    if (batch) {
      setBatch({
        ...markPieceEditing(batch, source.sourcePath),
        profile: nextProfile,
      });
    } else setProfile(nextProfile);
  };

  const activeTextureKeys = new Set(
    Object.entries(slots).flatMap(([key, visual]) => [
      ...(visual.channels.baseColor ? [textureKey(key, 'baseColor')] : []),
      ...(visual.channels.normal ? [textureKey(key, 'normal')] : []),
      ...(visual.channels.emissive?.image ? [textureKey(key, 'emissive')] : []),
    ])
  );
  const textureErrorCount = Object.entries(textureStates).filter(
    ([key, state]) => activeTextureKeys.has(key) && state.status === 'error'
  ).length;
  const glbStatus =
    glbLoad && glbLoad.url === source.glb.url ? glbLoad.status : 'loading';

  const searchNeedle = batchSearch.trim().toLowerCase();
  const pickableSources = manifest.editor.sources.filter(
    (item) =>
      !searchNeedle || item.sourcePath.toLowerCase().includes(searchNeedle)
  );

  return (
    <main className="material-editor">
      <header>
        <h1>Material editor</h1>
        <p>
          {manifest.catalog.packSlug} / {manifest.catalog.packVersion} — editing
          profile <strong>{activeProfile.profileId}</strong>
          {batch && (
            <>
              {' '}
              · batch <strong>{batch.batchName}</strong>
            </>
          )}
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
          <fieldset className="material-editor-batch">
            <legend>Related-piece batch</legend>
            {!batch ? (
              <>
                <label>
                  Batch name{' '}
                  <input
                    aria-label="New batch name"
                    value={newBatchName}
                    onChange={(event) => setNewBatchName(event.target.value)}
                    placeholder="e.g. stone walls"
                  />
                </label>
                <button
                  type="button"
                  disabled={!newBatchName.trim()}
                  onClick={() => {
                    setBatch(
                      createBatchDocument(
                        `batch-${Date.now().toString(36)}`,
                        newBatchName.trim(),
                        activeProfile
                      )
                    );
                    setBatchNote(
                      'Batch created. Pick related pieces below; set the working style; save each piece.'
                    );
                  }}
                >
                  Create batch
                </button>
                <p>
                  Group related pieces, carry one working style across them, and
                  save each piece independently.
                </p>
              </>
            ) : (
              <>
                <label>
                  Batch name{' '}
                  <input
                    aria-label="Batch name"
                    value={batch.batchName}
                    onChange={(event) =>
                      setBatch(setBatchName(batch, event.target.value))
                    }
                  />
                </label>
                <p className="material-editor-batch-counts" role="status">
                  Queue: {batch.queue.length} piece(s) — {counts!.configured}{' '}
                  configured, {counts!.deferred} deferred, {counts!.draft}{' '}
                  draft.
                </p>
                <nav aria-label="Batch queue">
                  {batch.queue.map((entry) => {
                    const index = manifest.editor.sources.findIndex(
                      (item) => item.sourcePath === entry.sourcePath
                    );
                    const stale = stalePaths.includes(entry.sourcePath);
                    return (
                      <div
                        key={entry.sourcePath}
                        className="material-editor-batch-row"
                      >
                        <button
                          type="button"
                          aria-label={`Batch piece ${entry.sourcePath}`}
                          aria-pressed={entry.sourcePath === source.sourcePath}
                          disabled={index < 0}
                          onClick={() => {
                            if (stale) {
                              setBatchError(
                                `Stale source — it changed since it was queued: ${entry.sourcePath}`
                              );
                              return;
                            }
                            if (index >= 0) selectSource(index);
                          }}
                        >
                          {entry.sourcePath.split('/').at(-1)}
                          <small>
                            <span
                              className={`material-editor-batch-status material-editor-batch-status--${entry.status}`}
                            >
                              {STATUS_LABEL[entry.status]}
                            </span>
                            {stale && (
                              <span className="material-editor-batch-stale">
                                source changed — remove and re-add
                              </span>
                            )}
                          </small>
                        </button>
                        <button
                          type="button"
                          className="material-editor-batch-remove"
                          aria-label={`Remove ${entry.sourcePath} from the batch`}
                          onClick={() => {
                            setBatch(removeSource(batch, entry.sourcePath));
                            setBatchError('');
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                  {batch.queue.length === 0 && <p>Queue is empty.</p>}
                </nav>
                <label>
                  Search sources{' '}
                  <input
                    aria-label="Search batch sources"
                    value={batchSearch}
                    onChange={(event) => setBatchSearch(event.target.value)}
                    placeholder="name or path"
                  />
                </label>
                <div className="material-editor-batch-picks">
                  {pickableSources.map((item) => {
                    const picked = Boolean(
                      findQueueEntry(batch, item.sourcePath)
                    );
                    return (
                      <label key={item.sourcePath}>
                        <input
                          type="checkbox"
                          aria-label={`Queue ${item.sourcePath}`}
                          checked={picked}
                          onChange={(event) => {
                            setBatchError('');
                            if (event.target.checked) {
                              setBatch(
                                enqueueSources(batch, [
                                  {
                                    sourcePath: item.sourcePath,
                                    sourceSha256: item.sourceSha256,
                                  },
                                ])
                              );
                            } else {
                              setBatch(removeSource(batch, item.sourcePath));
                            }
                          }}
                        />
                        {item.sourcePath.split('/').at(-1)}
                      </label>
                    );
                  })}
                  {pickableSources.length === 0 && (
                    <p>No prepared source matches the search.</p>
                  )}
                </div>
                <div className="material-editor-footer-row">
                  <button
                    type="button"
                    onClick={saveAndNext}
                    disabled={!queueEntry || currentStale}
                  >
                    Save &amp; Next
                  </button>
                  <button
                    type="button"
                    onClick={deferAndNext}
                    disabled={!queueEntry || currentStale}
                  >
                    Defer &amp; Next
                  </button>
                </div>
                {queueEntry?.saved && queueEntry.status !== 'configured' && (
                  <button
                    type="button"
                    onClick={() =>
                      setBatch(
                        restoreSavedPiece(batch, manifest, source.sourcePath)
                      )
                    }
                  >
                    Restore last saved
                  </button>
                )}
                {batchNote && (
                  <p role="status" className="material-editor-batch-note">
                    {batchNote}
                  </p>
                )}
                {batchError && <p role="alert">{batchError}</p>}
              </>
            )}
          </fieldset>
          {batch && (
            <fieldset>
              <legend>Working style</legend>
              <DefinitionChannels
                definition={batch.workingStyle}
                images={manifest.inventory.images}
                labels={STYLE_LABELS}
                onPatch={(patch) =>
                  setBatch(
                    setWorkingStyle(batch, { ...batch.workingStyle, ...patch })
                  )
                }
              />
              <p>
                New and unconfigured pieces start from these channels. Changing
                the style never mutates already-saved pieces.
              </p>
            </fieldset>
          )}
          <label>
            Editor source{' '}
            <select
              aria-label="Editor source"
              value={sourceIndex}
              onChange={(event) => selectSource(Number(event.target.value))}
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
              const resolved = queueEntry
                ? {
                    scope: batchScopeForSlot(
                      batch!,
                      source.sourcePath,
                      target.objectName,
                      target.slot
                    ),
                  }
                : resolvedSlotChannels(
                    activeProfile,
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
        <section className="material-editor-workspace">
          <div className="material-editor-controls">
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
                  · scope {selectedScope}
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
                <label>
                  Texture set name{' '}
                  <input
                    aria-label="Texture set name"
                    key={`${selectedKey}:${selectedDefinition.label}`}
                    defaultValue={selectedDefinition.label}
                    maxLength={200}
                    onBlur={(event) => {
                      const label = event.target.value.trim();
                      if (!label) {
                        event.target.value = selectedDefinition.label;
                        setError('Texture set name must not be empty.');
                        return;
                      }
                      try {
                        updateDefinition({ label });
                        setError('');
                      } catch (cause) {
                        setError(
                          cause instanceof Error ? cause.message : String(cause)
                        );
                      }
                    }}
                  />
                </label>
                <label className="material-editor-outline-toggle">
                  <input
                    type="checkbox"
                    checked={highlightSlot}
                    onChange={(event) => setHighlightSlot(event.target.checked)}
                  />
                  Outline edited surface
                </label>
                <p>
                  Only this surface changes. Color, normal and emissive images
                  are independent; these are draft choices, not published
                  compatible looks.
                </p>
                <DefinitionChannels
                  key={selectedKey}
                  definition={selectedDefinition}
                  images={manifest.inventory.images}
                  labels={SLOT_LABELS}
                  onPatch={updateDefinition}
                  statusLine={(channel) => (
                    <TextureStatusLine
                      state={
                        activeTextureKeys.has(textureKey(selectedKey, channel))
                          ? textureStates[textureKey(selectedKey, channel)]
                          : undefined
                      }
                      label={
                        channel === 'baseColor'
                          ? 'Base color image'
                          : channel === 'normal'
                            ? 'Normal image'
                            : 'Emissive image'
                      }
                    />
                  )}
                />
                <div className="material-editor-footer-row">
                  <button type="button" onClick={resetSlot}>
                    Reset slot to prepared state
                  </button>
                  {batch && (
                    <button
                      type="button"
                      onClick={() =>
                        setBatch(
                          setWorkingStyle(batch, {
                            ...selectedDefinition,
                            label: 'Working style',
                          })
                        )
                      }
                    >
                      Set slot's channels as the working style
                    </button>
                  )}
                </div>
              </>
            ) : (
              <p>Select a rendered material slot to edit its channels.</p>
            )}
            <TexturePackPanel
              key={`${manifest.profile.packSlug}:${manifest.profile.packVersion}`}
              manifest={manifest}
              currentTarget={
                selected && selectedTarget?.rendered
                  ? { sourcePath: source.sourcePath, ...selected }
                  : undefined
              }
              currentDefinition={selectedDefinition}
              onPreview={updateDefinition}
            />
          </div>
          <div className="material-editor-preview">
            <MaterialEditorScene
              source={source}
              slots={slots}
              selectedSlot={highlightSlot ? selectedKey : undefined}
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
          </div>
        </section>
      </div>
      <footer>
        <div className="material-editor-footer-row">
          <label>
            Import batch configuration{' '}
            <input
              aria-label="Import batch configuration"
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importBatch(file);
                event.target.value = '';
              }}
            />
          </label>
          {batch && (
            <>
              <button
                type="button"
                onClick={() =>
                  downloadJson(
                    `${batch.batchId.replace(/[^A-Za-z0-9._-]/g, '-')}-material-batch.json`,
                    serializeBatchDocument(batch)
                  )
                }
              >
                Export batch configuration
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadJson(
                    `${batch.batchId.replace(/[^A-Za-z0-9._-]/g, '-')}-configured-extraction.json`,
                    serializeBatchExtraction(extractConfiguredOverrides(batch))
                  )
                }
              >
                Export configured-only extraction
              </button>
            </>
          )}
        </div>
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
          <button type="button" onClick={() => downloadProfile(activeProfile)}>
            Export editing profile
          </button>
        </div>
        <p>
          The exported batch file is the schemaVersion 1 material-editor-batch
          envelope around the schemaVersion 2 editing profile: queue order,
          per-piece configured/deferred/draft status, source identities, the
          working style and each saved piece's channels. The configured-only
          extraction is the future script input — deferred and draft pieces and
          inherited family defaults are excluded. Run the review script against
          an export to rebuild prepared output. Material approval and trusted
          cache activation are separate from this preview-only editor; final GLB
          ingestion integration follows later.
        </p>
      </footer>
    </main>
  );
}
