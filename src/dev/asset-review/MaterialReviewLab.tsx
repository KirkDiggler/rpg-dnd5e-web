import { useCallback, useEffect, useState } from 'react';
import { AssetReviewScene } from './AssetReviewScene';
import {
  parseMaterialProfile,
  parseMaterialReviewManifest,
  selectFamilyOption,
  serializeMaterialProfile,
  validateProfileChoices,
  type MaterialReviewManifest,
  type PackMaterialProfile,
} from './materialProfile';
import './MaterialReviewLab.css';
import { MaterialSourceExceptions } from './MaterialSourceExceptions';
import type { AssetReviewLoadStatus } from './model';

const MANIFEST_URL = '/models/synty/asset-review-materials/manifest.json';
function fileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
function downloadProfile(profile: PackMaterialProfile): void {
  const url = URL.createObjectURL(
    new Blob([serializeMaterialProfile(profile)], { type: 'application/json' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `${profile.profileId.replace(/[^A-Za-z0-9._-]/g, '-')}-material-profile.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function MaterialReviewLab() {
  const [manifest, setManifest] = useState<MaterialReviewManifest>();
  const [profile, setProfile] = useState<PackMaterialProfile>();
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState('');
  const [group, setGroup] = useState('');
  const [sampleIndex, setSampleIndex] = useState(0);
  const [load, setLoad] = useState<{
    url: string;
    status: AssetReviewLoadStatus;
    detail?: string;
  }>();
  const onLoadStateChange = useCallback(
    (url: string, status: AssetReviewLoadStatus, detail?: string) => {
      setLoad((current) =>
        current?.url === url &&
        current.status === status &&
        current.detail === detail
          ? current
          : { url, status, detail }
      );
    },
    []
  );
  useEffect(() => {
    let active = true;
    void fetch(MANIFEST_URL)
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            `Material preparation manifest returned ${response.status}`
          );
        return parseMaterialReviewManifest(await response.json());
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

  async function importProfile(file: File): Promise<void> {
    try {
      if (!manifest) return;
      const imported = parseMaterialProfile(JSON.parse(await fileText(file)));
      validateProfileChoices(imported, manifest);
      setProfile(imported);
      setError('');
      setSampleIndex(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }
  if (!manifest || !profile)
    return (
      <main className="material-review">
        <h1>Pack materials</h1>
        {error ? (
          <p role="alert">
            {error}. Prepare material previews with the review script, then
            reload.
          </p>
        ) : (
          <p>Loading prepared material options…</p>
        )}
      </main>
    );

  const families = manifest.catalog.families.filter(
    (family) => !group || family.uses.some((use) => use.group === group)
  );
  const family =
    families.find((family) => family.id === activeId) ??
    families.find((family) => family.options.length) ??
    families[0];
  const selected = family ? (profile.selections[family.id] ?? null) : null;
  const shownId =
    selected ?? family?.recommendedOptionId ?? family?.options[0]?.id;
  const option = family?.options.find((option) => option.id === shownId);
  const samples = manifest.previews.filter(
    (preview) => preview.familyId === family?.id && preview.optionId === shownId
  );
  const sample = samples[sampleIndex] ?? samples[0];
  const groups = [
    ...new Set(
      manifest.catalog.families.flatMap((family) =>
        family.uses.map((use) => use.group)
      )
    ),
  ].sort();
  const count = family
    ? new Set(family.uses.map((use) => use.sourcePath)).size
    : 0;
  const blockedPaths = new Set(
    manifest.sourceAudit?.exceptions.map((issue) => issue.sourcePath)
  );
  const blockedCount = new Set(
    family?.uses
      .filter((use) => blockedPaths.has(use.sourcePath))
      .map((use) => use.sourcePath)
  ).size;
  const changed =
    serializeMaterialProfile(profile) !==
    serializeMaterialProfile(manifest.profile);
  const status = sample && load?.url === sample.url ? load.status : 'loading';

  return (
    <main className="material-review">
      <header>
        <h1>Pack materials</h1>
        <p>
          {profile.packSlug} / {profile.packVersion} — profile{' '}
          <strong>{profile.profileId}</strong>
        </p>
        <p className="material-review-notice">
          Preview only. These choices do not mark assets Ready, activate a
          cache, or publish anything.
        </p>
        <p>
          {changed
            ? 'Draft changes — export the profile to save them.'
            : 'Showing the prepared profile.'}
        </p>
        {error && <p role="alert">{error}</p>}
      </header>
      {manifest.sourceAudit && (
        <MaterialSourceExceptions audit={manifest.sourceAudit} />
      )}
      <div className="material-review-layout">
        <aside>
          <label>
            Category{' '}
            <select
              aria-label="Material category"
              value={group}
              onChange={(event) => {
                setGroup(event.target.value);
                setSampleIndex(0);
              }}
            >
              <option value="">All categories</option>
              {groups.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <nav aria-label="Material families">
            {families.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={family?.id === item.id}
                onClick={() => {
                  setActiveId(item.id);
                  setSampleIndex(0);
                }}
              >
                {item.label}
                <small>
                  {item.kind} ·{' '}
                  {new Set(item.uses.map((use) => use.sourcePath)).size} pieces
                </small>
              </button>
            ))}
          </nav>
        </aside>
        <section>
          {family ? (
            <>
              <h2>{family.label}</h2>
              <p>
                {count} affected {count === 1 ? 'piece' : 'pieces'} ·{' '}
                {family.uses.length} declared material slots
              </p>
              {blockedCount > 0 && (
                <p>
                  {blockedCount} affected sources require inspection and are
                  excluded from previews.
                </p>
              )}
              <ul>
                {family.reasons.map((reason, index) => (
                  <li key={index}>{reason}</li>
                ))}
              </ul>
              {family.options.length > 0 ? (
                <>
                  <label>
                    Profile choice{' '}
                    <select
                      aria-label={`Material option for ${family.label}`}
                      value={selected ?? ''}
                      disabled={!samples.length}
                      onChange={(event) => {
                        setProfile(
                          selectFamilyOption(
                            profile,
                            manifest,
                            family.id,
                            event.target.value || null
                          )
                        );
                        setSampleIndex(0);
                      }}
                    >
                      <option value="">Unresolved — no saved choice</option>
                      {family.options.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                          {item.id === family.recommendedOptionId
                            ? ' — recommended'
                            : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!samples.length && (
                    <p>
                      No verified representative is available. Inspect the
                      source exceptions; existing profile choices are preserved,
                      not approved.
                    </p>
                  )}
                  {!selected && samples.length > 0 && (
                    <p>
                      Showing a proposed option for comparison; it has not been
                      selected.
                    </p>
                  )}
                  {option && (
                    <>
                      <p>
                        <strong>{option.label}</strong>
                      </p>
                      <ul>
                        {option.reasons.map((reason, index) => (
                          <li key={index}>{reason}</li>
                        ))}
                      </ul>
                      <details>
                        <summary>Maps and sampling</summary>
                        <p>Color: {option.baseColor}</p>
                        <p>
                          Normal:{' '}
                          {option.normal ??
                            'No matched normal — not proof that none is authored'}
                        </p>
                        <p>Sampling: {option.wrap}</p>
                      </details>
                    </>
                  )}
                  {sample && (
                    <>
                      <label>
                        Representative piece{' '}
                        <select
                          aria-label="Representative piece"
                          value={samples.indexOf(sample)}
                          onChange={(event) =>
                            setSampleIndex(Number(event.target.value))
                          }
                        >
                          {samples.map((item, index) => (
                            <option key={item.sourcePath} value={index}>
                              {item.sourcePath}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p>
                        {samples.length} prepared{' '}
                        {samples.length === 1 ? 'example' : 'examples'} of{' '}
                        {count} affected pieces. This is sample coverage, not a
                        claim that every piece was visually reviewed.
                      </p>
                      <div className="material-review-canvas">
                        <AssetReviewScene
                          key={sample.url}
                          url={sample.url}
                          scale={1}
                          yawDegrees={0}
                          fineOffsetMeters={[0, 0, 0]}
                          cameraMode="orbit"
                          showRaw={false}
                          onLoadStateChange={onLoadStateChange}
                        />
                      </div>
                      <p role="status">
                        {status === 'success'
                          ? 'Prepared model loaded'
                          : status === 'error'
                            ? `Model load failed: ${load?.detail ?? 'unknown error'}`
                            : 'Loading prepared model…'}
                      </p>
                      {sample.context.length > 0 && (
                        <details>
                          <summary>Other materials in this example</summary>
                          <ul>
                            {sample.context.map((item) => (
                              <li key={item.familyId}>
                                {item.familyId}: {item.optionId ?? 'neutral'} (
                                {item.state})
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </>
                  )}
                </>
              ) : (
                <p>
                  No supported option is prepared for this family. Keep it
                  unresolved; use source/Blender inspection only for this
                  exception.
                </p>
              )}
              <details>
                <summary>All affected uses</summary>
                <ul>
                  {family.uses.map((use) => (
                    <li
                      key={JSON.stringify([
                        use.sourcePath,
                        use.objectName,
                        use.slot,
                      ])}
                    >
                      {use.sourcePath} — {use.objectName}, slot {use.slot}
                    </li>
                  ))}
                </ul>
              </details>
            </>
          ) : (
            <p>No families match this category.</p>
          )}
        </section>
      </div>
      <footer>
        <label>
          Import pack profile{' '}
          <input
            aria-label="Import pack profile"
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
          Export pack profile
        </button>
        <p>
          Run the review script against the exported JSON to rebuild the
          selected context. Material approval and trusted cache activation are
          separate from this preview-only editor.
        </p>
      </footer>
    </main>
  );
}
