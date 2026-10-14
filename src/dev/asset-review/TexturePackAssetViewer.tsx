import { useCallback, useMemo, useState, type ReactElement } from 'react';
import {
  MaterialEditorScene,
  type TextureLoadStatus,
} from './MaterialEditorScene';
import { sceneSlots } from './materialEditorVisuals';
import {
  auditedMaterialName,
  setSlotChannels,
  type MaterialEditorManifest,
} from './materialRecipe';
import type { AssetReviewLoadStatus } from './model';
import {
  allowedPacks,
  assignPack,
  targetKey,
  unassignPack,
  type TexturePackLibrary,
} from './texturePackLibrary';

export interface PackViewerState {
  sourceIndex: number;
  surfaceKey: string;
  packId: string;
  choiceId: string;
}
export function TexturePackAssetViewer({
  manifest,
  library,
  state,
  onStateChange,
  onLibraryChange,
  onError,
}: {
  manifest: MaterialEditorManifest;
  library: TexturePackLibrary;
  state: PackViewerState;
  onStateChange: (state: PackViewerState) => void;
  onLibraryChange: (library: TexturePackLibrary) => void;
  onError: (message: string) => void;
}): ReactElement {
  const [search, setSearch] = useState('');
  const [load, setLoad] = useState<{
    url: string;
    status: AssetReviewLoadStatus;
    detail?: string;
  }>();
  const [textures, setTextures] = useState<
    Record<string, { status: TextureLoadStatus; detail?: string }>
  >({});
  const source = manifest.editor.sources[state.sourceIndex];
  const surfaces = source?.targets.filter((t) => t.rendered && t.target) ?? [];
  const selected =
    surfaces.find(
      (t) =>
        targetKey({ sourcePath: source!.sourcePath, ...t }) === state.surfaceKey
    ) ?? surfaces[0];
  const target = useMemo(
    () =>
      source && selected
        ? {
            sourcePath: source.sourcePath,
            objectName: selected.objectName,
            slot: selected.slot,
          }
        : undefined,
    [source, selected]
  );
  const pack = Object.hasOwn(library.packs, state.packId)
    ? library.packs[state.packId]
    : undefined;
  const choiceId =
    pack && Object.hasOwn(pack.sets, state.choiceId)
      ? state.choiceId
      : Object.keys(pack?.sets ?? {})[0];
  const definition = choiceId ? pack?.sets[choiceId] : undefined;
  const profile = useMemo(
    () =>
      target && definition
        ? setSlotChannels(
            manifest.profile,
            manifest,
            target.sourcePath,
            target.objectName,
            target.slot,
            definition
          )
        : manifest.profile,
    [manifest, target, definition]
  );
  const slots = useMemo(
    () => sceneSlots(manifest, profile, undefined, state.sourceIndex),
    [manifest, profile, state.sourceIndex]
  );
  const onLoad = useCallback(
    (url: string, status: AssetReviewLoadStatus, detail?: string) =>
      setLoad({ url, status, detail }),
    []
  );
  const onTexture = useCallback(
    (key: string, status: TextureLoadStatus, detail?: string) =>
      setTextures((old) => ({ ...old, [key]: { status, detail } })),
    []
  );
  const activeKeys = new Set(
    Object.entries(slots).flatMap(([key, s]) => [
      ...(s.channels.baseColor ? [`${key}\u0000baseColor`] : []),
      ...(s.channels.normal ? [`${key}\u0000normal`] : []),
      ...(s.channels.emissive?.image ? [`${key}\u0000emissive`] : []),
    ])
  );
  const failures = Object.entries(textures).filter(
    ([key, s]) => activeKeys.has(key) && s.status === 'error'
  );
  if (!source) return <p role="alert">No prepared assets are available.</p>;
  const matched =
    target && pack
      ? allowedPacks(library, target).includes(state.packId)
      : false;
  return (
    <section aria-label="Asset Viewer" className="pack-asset-viewer">
      <div className="pack-viewer-toolbar">
        <label>
          Find asset
          <input
            aria-label="Find asset"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Chair, wall, floor…"
          />
        </label>
        <label>
          Asset
          <select
            aria-label="Viewer asset"
            value={state.sourceIndex}
            onChange={(e) =>
              onStateChange({
                ...state,
                sourceIndex: Number(e.target.value),
                surfaceKey: '',
              })
            }
          >
            {manifest.editor.sources
              .map((s, i) => ({ s, i }))
              .filter(
                ({ s, i }) =>
                  i === state.sourceIndex ||
                  s.sourcePath.toLowerCase().includes(search.toLowerCase())
              )
              .map(({ s, i }) => (
                <option key={s.sourcePath} value={i}>
                  {s.sourcePath
                    .split('/')
                    .at(-1)!
                    .replace(/\.fbx$/i, '')}
                </option>
              ))}
          </select>
        </label>
        <label>
          Surface
          <select
            aria-label="Viewer surface"
            value={target ? targetKey(target) : ''}
            onChange={(e) =>
              onStateChange({ ...state, surfaceKey: e.target.value })
            }
          >
            {surfaces.map((t) => (
              <option
                key={targetKey({ sourcePath: source.sourcePath, ...t })}
                value={targetKey({ sourcePath: source.sourcePath, ...t })}
              >
                {t.objectName} · slot {t.slot} (
                {auditedMaterialName(
                  manifest,
                  source.sourcePath,
                  t.objectName,
                  t.slot
                ) ?? 'unassigned material'}
                )
              </option>
            ))}
          </select>
        </label>
        <label>
          Saved pack
          <select
            aria-label="Saved pack"
            value={state.packId}
            onChange={(e) =>
              onStateChange({ ...state, packId: e.target.value, choiceId: '' })
            }
          >
            <option value="">Original / prepared appearance</option>
            {Object.entries(library.packs).map(([id, p]) => (
              <option key={id} value={id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Color choice
          <select
            aria-label="Pack color choice"
            disabled={!pack}
            value={choiceId ?? ''}
            onChange={(e) =>
              onStateChange({ ...state, choiceId: e.target.value })
            }
          >
            {Object.entries(pack?.sets ?? {}).map(([id, s]) => (
              <option key={id} value={id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="pack-viewer-match-row">
        <button
          type="button"
          disabled={state.sourceIndex === 0}
          onClick={() =>
            onStateChange({
              ...state,
              sourceIndex: state.sourceIndex - 1,
              surfaceKey: '',
            })
          }
        >
          Previous asset
        </button>
        <button
          type="button"
          disabled={state.sourceIndex >= manifest.editor.sources.length - 1}
          onClick={() =>
            onStateChange({
              ...state,
              sourceIndex: state.sourceIndex + 1,
              surfaceKey: '',
            })
          }
        >
          Next asset
        </button>
        <label className="pack-match-label">
          <input
            type="checkbox"
            aria-label="Match this pack to this surface"
            checked={!!matched}
            disabled={!target || !pack}
            onChange={(e) => {
              if (!target || !pack) return;
              try {
                onLibraryChange(
                  e.target.checked
                    ? assignPack(library, state.packId, [target], manifest)
                    : unassignPack(library, state.packId, [target])
                );
                onError('');
              } catch (cause) {
                onError(cause instanceof Error ? cause.message : String(cause));
              }
            }}
          />
          Match this pack to this surface
        </label>
        <span>
          {target
            ? `${target.objectName} · slot ${target.slot}`
            : 'No rendered surface'}
          {surfaces.length > 1
            ? ' — other surfaces are unchanged.'
            : ' — this asset has one surface.'}
        </span>
      </div>
      {definition && (
        <p className="pack-choice-summary">
          {definition.label} · Normal {definition.normal ? 'on' : 'off'} ·
          Emissive {definition.emissive ? 'on' : 'off'} · {definition.wrap}.
          Preview does not imply a match.
        </p>
      )}
      {failures.length > 0 && (
        <p role="alert">
          Texture load failed:{' '}
          {failures
            .map(([, s]) => s.detail ?? 'image could not be decoded')
            .join('; ')}
        </p>
      )}
      <MaterialEditorScene
        source={source}
        slots={slots}
        selectedSlot={undefined}
        fitAsset
        onLoadStateChange={onLoad}
        onTextureStateChange={onTexture}
      />
      <p role="status">
        {load?.url === source.glb.url && load.status === 'success'
          ? 'Prepared editor geometry loaded.'
          : load?.url === source.glb.url && load.status === 'error'
            ? `GLB load failed: ${load.detail ?? 'unknown error'}`
            : 'Loading prepared editor geometry…'}
      </p>
      {!Object.keys(library.packs).length && (
        <p>Create and save a pack in Pack Builder first.</p>
      )}
    </section>
  );
}
