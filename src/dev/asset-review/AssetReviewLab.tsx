import { useCallback, useEffect, useMemo, useState } from 'react';
import './AssetReviewLab.css';
import {
  AssetReviewScene,
  type AssetReviewLoadStatus,
} from './AssetReviewScene';
import {
  filterReviewEntries,
  mergeCatalogWithReview,
  parseAssetReviewCatalog,
  serializeReadyProviderBatch,
  serializeReviewProgress,
  transitionDecision,
  updateProviderFields,
  validateReady,
  type AssetReviewBatch,
  type AssetReviewCatalog,
  type AssetReviewEntry,
  type ProviderFieldPatch,
  type ReviewDecision,
  type ReviewFilter,
  type ReviewStatus,
  type WorldAssetCategory,
} from './model';

const CATALOG_URL = '/models/synty/asset-review/catalog.json';
export const ASSET_REVIEW_STORAGE_KEY = 'rpg.asset-review.batch.v1';

const CATEGORIES: WorldAssetCategory[] = ['props', 'items', 'weapons', 'env'];
const REVIEW_STATUSES: ReviewStatus[] = [
  'trusted',
  'material-review',
  'fx-review',
];
const STATUS_TABS = [
  ['all', 'All'],
  ['undecided', 'Undecided'],
  ['keep', 'Keep'],
  ['needs-details', 'Needs Details'],
  ['ready', 'Ready'],
  ['skip', 'Skip'],
  ['defer', 'Defer'],
] as const;
type StatusTab = (typeof STATUS_TABS)[number][0];

function sourceKey(entry: AssetReviewEntry): string {
  return `${entry.source.packSlug}@${entry.source.packVersion}:${entry.source.sourcePath}#${entry.source.glbSha256}`;
}

function decisionLabel(decision: ReviewDecision): string {
  return decision.charAt(0).toLocaleUpperCase() + decision.slice(1);
}

function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () =>
      reject(reader.error ?? new Error('Unable to read import file'));
    reader.readAsText(file);
  });
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/json' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable ||
    target.closest('[contenteditable]:not([contenteditable="false"])') !== null
  );
}

function selectValue(value: string): string | undefined {
  return value === '' ? undefined : value;
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <span className="asset-review-field-error">{message}</span>
  ) : null;
}

function StatusPill({ status }: { status: ReviewStatus }) {
  return (
    <span className={`asset-review-status asset-review-status--${status}`}>
      {status}
    </span>
  );
}

export function AssetReviewLab() {
  const [catalog, setCatalog] = useState<AssetReviewCatalog>();
  const [batch, setBatch] = useState<AssetReviewBatch>();
  const [selectedKey, setSelectedKey] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [importError, setImportError] = useState('');
  const [staleSources, setStaleSources] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sourceFamilyFilter, setSourceFamilyFilter] = useState('');
  const [browsingFamilyFilter, setBrowsingFamilyFilter] = useState('');
  const [reviewStatusFilter, setReviewStatusFilter] = useState('');
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [cameraMode, setCameraMode] = useState<'orbit' | 'play'>('orbit');
  const [showRaw, setShowRaw] = useState(false);
  const [facingDegrees, setFacingDegrees] = useState(0);
  const [sceneStates, setSceneStates] = useState<
    Record<string, { status: AssetReviewLoadStatus; detail?: string }>
  >({});

  useEffect(() => {
    let current = true;
    void fetch(CATALOG_URL)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`catalog request returned ${response.status}`);
        }
        return parseAssetReviewCatalog(await response.json());
      })
      .then((loadedCatalog) => {
        if (!current) return;
        let review: AssetReviewBatch | undefined;
        const saved = window.localStorage.getItem(ASSET_REVIEW_STORAGE_KEY);
        if (saved) {
          try {
            review = JSON.parse(saved) as AssetReviewBatch;
            // Validate the complete saved value before it can influence state.
            mergeCatalogWithReview(loadedCatalog, review);
          } catch (error) {
            review = undefined;
            const detail =
              error instanceof Error ? error.message : String(error);
            setNotice(`Saved review was ignored: ${detail}`);
          }
        }
        const merged = mergeCatalogWithReview(loadedCatalog, review);
        setCatalog(loadedCatalog);
        setBatch(merged.batch);
        setStaleSources(merged.staleSourceKeys);
        setSelectedKey(
          merged.batch.entries[0] ? sourceKey(merged.batch.entries[0]) : ''
        );
      })
      .catch((error: unknown) => {
        if (!current) return;
        const detail = error instanceof Error ? error.message : String(error);
        setLoadError(
          `No prepared asset-review catalog is available (${detail}). Run the asset ingestion command, then reload this page.`
        );
      });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (!batch) return;
    window.localStorage.setItem(
      ASSET_REVIEW_STORAGE_KEY,
      serializeReviewProgress(batch)
    );
  }, [batch]);

  const sourceFamilies = useMemo(
    () =>
      [
        ...new Set(batch?.entries.map((entry) => entry.sourceFamily) ?? []),
      ].sort(),
    [batch]
  );
  const browsingFamilies = useMemo(
    () =>
      [
        ...new Set(batch?.entries.map((entry) => entry.browsingFamily) ?? []),
      ].sort(),
    [batch]
  );

  const filter = useMemo<ReviewFilter>(
    () => ({
      search,
      category: selectValue(categoryFilter) as WorldAssetCategory | undefined,
      sourceFamily: selectValue(sourceFamilyFilter),
      browsingFamily: selectValue(browsingFamilyFilter),
      reviewStatus: selectValue(reviewStatusFilter) as ReviewStatus | undefined,
      decision:
        statusTab === 'all'
          ? undefined
          : (statusTab as ReviewDecision | 'needs-details'),
    }),
    [
      browsingFamilyFilter,
      categoryFilter,
      reviewStatusFilter,
      search,
      sourceFamilyFilter,
      statusTab,
    ]
  );
  const filteredEntries = useMemo(
    () => filterReviewEntries(batch?.entries ?? [], filter),
    [batch, filter]
  );
  const activeEntry =
    filteredEntries.find((entry) => sourceKey(entry) === selectedKey) ??
    filteredEntries[0];
  const selectedIndex = activeEntry
    ? filteredEntries.findIndex(
        (entry) => sourceKey(entry) === sourceKey(activeEntry)
      )
    : -1;

  const statusCounts = useMemo(() => {
    const entries = batch?.entries ?? [];
    return Object.fromEntries(
      STATUS_TABS.map(([value]) => [
        value,
        value === 'all'
          ? entries.length
          : filterReviewEntries(entries, {
              search: '',
              decision: value as ReviewDecision | 'needs-details',
            }).length,
      ])
    ) as Record<StatusTab, number>;
  }, [batch]);

  const replaceEntry = useCallback(
    (key: string, transform: (entry: AssetReviewEntry) => AssetReviewEntry) => {
      setBatch((current) => {
        if (!current) return current;
        const entries = current.entries.map((entry) =>
          sourceKey(entry) === key ? transform(entry) : entry
        );
        return { ...current, entries };
      });
    },
    []
  );

  const patchProviderFields = (patch: ProviderFieldPatch) => {
    if (!activeEntry) return;
    replaceEntry(sourceKey(activeEntry), (entry) =>
      updateProviderFields(entry, patch)
    );
  };

  const replaceDeferReason = (deferReason: string) => {
    if (!activeEntry) return;
    replaceEntry(sourceKey(activeEntry), (entry) => ({
      ...entry,
      decision: entry.decision === 'ready' ? 'keep' : entry.decision,
      deferReason,
    }));
  };

  const navigate = useCallback(
    (direction: -1 | 1) => {
      if (selectedIndex < 0) return;
      const target = filteredEntries[selectedIndex + direction];
      if (target) setSelectedKey(sourceKey(target));
    },
    [filteredEntries, selectedIndex]
  );

  const markDecision = useCallback(
    (decision: ReviewDecision, advance: boolean) => {
      if (!activeEntry) return;
      const key = sourceKey(activeEntry);
      const nextEntry = advance
        ? filteredEntries[selectedIndex + 1]
        : undefined;
      replaceEntry(key, (entry) => transitionDecision(entry, decision));
      if (nextEntry) setSelectedKey(sourceKey(nextEntry));
    },
    [activeEntry, filteredEntries, replaceEntry, selectedIndex]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      switch (event.key.toLocaleLowerCase()) {
        case 'arrowleft':
          navigate(-1);
          break;
        case 'arrowright':
          navigate(1);
          break;
        case 'k':
          markDecision('keep', false);
          break;
        case 's':
          markDecision('skip', true);
          break;
        case 'd':
          markDecision('defer', true);
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [markDecision, navigate]);

  const handleSceneLoadState = useCallback(
    (url: string, status: AssetReviewLoadStatus, detail?: string) => {
      setSceneStates((current) => ({
        ...current,
        [url]: { status, detail },
      }));
      if (status === 'loading') return;
      setBatch((current) => {
        if (!current) return current;
        return {
          ...current,
          entries: current.entries.map((entry) => {
            if (entry.url !== url) return entry;
            const loadedSuccessfully = status === 'success';
            return {
              ...entry,
              loadedSuccessfully,
              decision:
                !loadedSuccessfully && entry.decision === 'ready'
                  ? 'keep'
                  : entry.decision,
            };
          }),
        };
      });
    },
    []
  );

  const importReview = async (file: File | undefined) => {
    if (!file || !catalog) return;
    try {
      const imported = JSON.parse(await readFileText(file)) as AssetReviewBatch;
      const merged = mergeCatalogWithReview(catalog, imported);
      setBatch(merged.batch);
      setStaleSources(merged.staleSourceKeys);
      setSelectedKey(
        merged.batch.entries[0] ? sourceKey(merged.batch.entries[0]) : ''
      );
      setImportError('');
      setNotice('Review imported successfully.');
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    }
  };

  if (loadError) {
    return (
      <main className="asset-review-message" aria-label="Asset Review Lab">
        <h1>Asset Review Lab</h1>
        <p role="alert">{loadError}</p>
      </main>
    );
  }
  if (!catalog || !batch) {
    return (
      <main className="asset-review-message" aria-label="Asset Review Lab">
        Loading asset-review catalog…
      </main>
    );
  }

  const readyErrors = activeEntry ? validateReady(activeEntry) : {};
  const canMarkReady = activeEntry && Object.keys(readyErrors).length === 0;
  const readyCount = statusCounts.ready;
  const sceneState = activeEntry ? sceneStates[activeEntry.url] : undefined;

  return (
    <main className="asset-review-lab" aria-label="Asset Review Lab">
      <aside className="asset-review-drawer" data-testid="candidate-drawer">
        <header>
          <strong>Asset Review Lab</strong>
          <span>loopback only · one candidate loaded</span>
        </header>

        <nav className="asset-review-tabs" aria-label="Decision status">
          {STATUS_TABS.map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={statusTab === value}
              onClick={() => setStatusTab(value)}
            >
              {label} ({statusCounts[value]})
            </button>
          ))}
        </nav>

        <div className="asset-review-filters">
          <label>
            Search
            <input
              aria-label="Search candidates"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="name, path, ref, family"
            />
          </label>
          <label>
            Category
            <select
              aria-label="Category filter"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="">All categories</option>
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label>
            Source family
            <select
              aria-label="Source family filter"
              value={sourceFamilyFilter}
              onChange={(event) => setSourceFamilyFilter(event.target.value)}
            >
              <option value="">All source families</option>
              {sourceFamilies.map((family) => (
                <option key={family} value={family}>
                  {family}
                </option>
              ))}
            </select>
          </label>
          <label>
            Browsing family
            <select
              aria-label="Browsing family filter"
              value={browsingFamilyFilter}
              onChange={(event) => setBrowsingFamilyFilter(event.target.value)}
            >
              <option value="">All browsing families</option>
              {browsingFamilies.map((family) => (
                <option key={family} value={family}>
                  {family}
                </option>
              ))}
            </select>
          </label>
          <label>
            Material status
            <select
              aria-label="Material status filter"
              value={reviewStatusFilter}
              onChange={(event) => setReviewStatusFilter(event.target.value)}
            >
              <option value="">All statuses</option>
              {REVIEW_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="asset-review-candidate-list">
          {filteredEntries.map((entry) => (
            <button
              type="button"
              key={sourceKey(entry)}
              className={
                activeEntry && sourceKey(entry) === sourceKey(activeEntry)
                  ? 'selected'
                  : ''
              }
              aria-current={
                activeEntry && sourceKey(entry) === sourceKey(activeEntry)
                  ? 'true'
                  : undefined
              }
              onClick={() => setSelectedKey(sourceKey(entry))}
            >
              <span>{entry.displayName || '(unnamed candidate)'}</span>
              <small>{entry.source.sourcePath.split('/').at(-1)}</small>
              <span
                className={`asset-review-decision asset-review-decision--${entry.decision}`}
              >
                {decisionLabel(entry.decision)}
              </span>
            </button>
          ))}
          {filteredEntries.length === 0 && (
            <p className="asset-review-empty">
              No candidates match these filters.
            </p>
          )}
        </div>
      </aside>

      <section className="asset-review-preview">
        <div className="asset-review-preview-bar">
          <button
            type="button"
            aria-label="Previous candidate"
            disabled={selectedIndex <= 0}
            onClick={() => navigate(-1)}
          >
            ←
          </button>
          <strong>
            Candidate {selectedIndex < 0 ? 0 : selectedIndex + 1} /{' '}
            {filteredEntries.length}
          </strong>
          <button
            type="button"
            aria-label="Next candidate"
            disabled={
              selectedIndex < 0 || selectedIndex >= filteredEntries.length - 1
            }
            onClick={() => navigate(1)}
          >
            →
          </button>
        </div>
        <div className="asset-review-canvas">
          {activeEntry ? (
            <AssetReviewScene
              url={activeEntry.url}
              scale={activeEntry.calibration.scale}
              yawDegrees={activeEntry.calibration.yawDegrees + facingDegrees}
              fineOffsetMeters={activeEntry.calibration.fineOffsetMeters}
              cameraMode={cameraMode}
              showRaw={showRaw}
              onLoadStateChange={handleSceneLoadState}
            />
          ) : (
            <p>No candidate selected.</p>
          )}
        </div>
        <div className="asset-review-view-controls">
          <button type="button" onClick={() => setCameraMode('orbit')}>
            Orbit camera
          </button>
          <button type="button" onClick={() => setCameraMode('play')}>
            Play camera
          </button>
          <label>
            <input
              type="checkbox"
              checked={showRaw}
              onChange={(event) => setShowRaw(event.target.checked)}
            />{' '}
            Raw overlay
          </label>
          {[0, 45, 90, 135, 180, 225, 270, 315].map((degrees) => (
            <button
              type="button"
              key={degrees}
              onClick={() => setFacingDegrees(degrees)}
            >
              {degrees}°
            </button>
          ))}
        </div>
      </section>

      <aside className="asset-review-sheet" data-testid="property-sheet">
        {!activeEntry ? (
          <p>Select a candidate from the drawer.</p>
        ) : (
          <>
            <div className="asset-review-sheet-heading">
              <div>
                <span>Current decision</span>
                <strong data-testid="current-decision">
                  {decisionLabel(activeEntry.decision)}
                </strong>
              </div>
              <StatusPill status={activeEntry.reviewStatus} />
            </div>

            <div className="asset-review-actions">
              <button
                type="button"
                aria-keyshortcuts="K"
                onClick={() => markDecision('keep', false)}
              >
                Keep
              </button>
              <button
                type="button"
                aria-keyshortcuts="S"
                onClick={() => markDecision('skip', true)}
              >
                Skip
              </button>
              <button
                type="button"
                aria-keyshortcuts="D"
                onClick={() => markDecision('defer', true)}
              >
                Defer
              </button>
              <button
                type="button"
                className="asset-review-ready"
                disabled={!canMarkReady}
                onClick={() => markDecision('ready', false)}
              >
                Mark Ready
              </button>
            </div>
            <p className="asset-review-load-state">
              Model:{' '}
              {sceneState?.status ??
                (activeEntry.loadedSuccessfully ? 'success' : 'not loaded')}
              {sceneState?.detail ? ` — ${sceneState.detail}` : ''}
            </p>

            <fieldset>
              <legend>Prepared source</legend>
              <label>
                Pack
                <input
                  readOnly
                  value={`${activeEntry.source.packSlug}/${activeEntry.source.packVersion}`}
                />
              </label>
              <label>
                Source path
                <input
                  aria-label="Source path"
                  readOnly
                  value={activeEntry.source.sourcePath}
                />
              </label>
              <label>
                GLB SHA-256
                <input
                  aria-label="GLB SHA-256"
                  readOnly
                  value={activeEntry.source.glbSha256}
                />
              </label>
              <label>
                Measured bounds (m)
                <input
                  aria-label="Measured bounds"
                  readOnly
                  value={activeEntry.dimensionsMeters.join(' × ')}
                />
              </label>
              <div className="asset-review-reasons">
                <strong>Blocking reasons</strong>
                {activeEntry.reasons.length > 0 ? (
                  <ul>
                    {activeEntry.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                ) : (
                  <span>None</span>
                )}
              </div>
            </fieldset>

            <fieldset>
              <legend>Provider identity</legend>
              <label>
                Display name
                <input
                  aria-label="Display name"
                  value={activeEntry.displayName}
                  onChange={(event) =>
                    patchProviderFields({ displayName: event.target.value })
                  }
                />
                <FieldError message={readyErrors.displayName} />
              </label>
              <div className="asset-review-category-radios">
                <span>Category</span>
                {CATEGORIES.map((category) => (
                  <label key={category}>
                    <input
                      type="radio"
                      name="asset-review-category"
                      checked={activeEntry.category === category}
                      onChange={() => patchProviderFields({ category })}
                    />{' '}
                    {category.charAt(0).toLocaleUpperCase() + category.slice(1)}
                  </label>
                ))}
              </div>
              <label>
                Derived ref
                <input
                  aria-label="Derived ref"
                  readOnly
                  value={activeEntry.ref}
                />
                <FieldError message={readyErrors.ref} />
              </label>
            </fieldset>

            <fieldset>
              <legend>Calibration</legend>
              <label>
                Scale
                <input
                  aria-label="Scale"
                  type="range"
                  min="0.05"
                  max="5"
                  step="0.01"
                  value={activeEntry.calibration.scale}
                  onChange={(event) =>
                    patchProviderFields({
                      calibration: { scale: Number(event.target.value) },
                    })
                  }
                />
                <input
                  aria-label="Scale value"
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.01"
                  value={activeEntry.calibration.scale}
                  onChange={(event) =>
                    patchProviderFields({
                      calibration: { scale: Number(event.target.value) },
                    })
                  }
                />
                <FieldError message={readyErrors['calibration.scale']} />
              </label>
              <label>
                Base yaw
                <input
                  aria-label="Base yaw"
                  type="range"
                  min="-180"
                  max="179"
                  step="1"
                  value={activeEntry.calibration.yawDegrees}
                  onChange={(event) =>
                    patchProviderFields({
                      calibration: {
                        yawDegrees: Number(event.target.value),
                      },
                    })
                  }
                />
                <input
                  aria-label="Base yaw value"
                  type="number"
                  min="-180"
                  max="179"
                  step="1"
                  value={activeEntry.calibration.yawDegrees}
                  onChange={(event) =>
                    patchProviderFields({
                      calibration: {
                        yawDegrees: Number(event.target.value),
                      },
                    })
                  }
                />
                <FieldError message={readyErrors['calibration.yawDegrees']} />
              </label>
              {(['X', 'Y', 'Z'] as const).map((axis, index) => (
                <label key={axis}>
                  Fine offset {axis} (m)
                  <input
                    aria-label={`Fine offset ${axis}`}
                    type="number"
                    min={axis === 'Y' ? -0.1 : -0.5}
                    max={axis === 'Y' ? 0.1 : 0.5}
                    step="0.01"
                    value={activeEntry.calibration.fineOffsetMeters[index]}
                    onChange={(event) => {
                      const fineOffsetMeters: [number, number, number] = [
                        ...activeEntry.calibration.fineOffsetMeters,
                      ];
                      fineOffsetMeters[index] = Number(event.target.value);
                      patchProviderFields({
                        calibration: { fineOffsetMeters },
                      });
                    }}
                  />
                  <FieldError
                    message={
                      readyErrors[`calibration.fineOffsetMeters[${index}]`]
                    }
                  />
                </label>
              ))}
            </fieldset>

            <fieldset>
              <legend>Review details</legend>
              <label>
                Tags (comma separated)
                <input
                  aria-label="Tags"
                  value={activeEntry.tags.join(', ')}
                  onChange={(event) =>
                    patchProviderFields({
                      tags: event.target.value
                        .split(',')
                        .map((tag) => tag.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
              <label className="asset-review-check">
                <input
                  type="checkbox"
                  checked={activeEntry.supportsDecoration}
                  onChange={(event) =>
                    patchProviderFields({
                      supportsDecoration: event.target.checked,
                    })
                  }
                />{' '}
                Supports decorations
              </label>
              <label>
                Notes
                <textarea
                  aria-label="Notes"
                  value={activeEntry.notes}
                  onChange={(event) =>
                    patchProviderFields({ notes: event.target.value })
                  }
                />
              </label>
              <label>
                Defer reason
                <textarea
                  aria-label="Defer reason"
                  value={activeEntry.deferReason}
                  onChange={(event) => replaceDeferReason(event.target.value)}
                />
              </label>
            </fieldset>

            {Object.keys(readyErrors).length > 0 && (
              <details className="asset-review-validation">
                <summary>
                  Ready blockers ({Object.keys(readyErrors).length})
                </summary>
                <ul>
                  {Object.entries(readyErrors).map(([field, message]) => (
                    <li key={field}>
                      {field}: {message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}

        {notice && <p className="asset-review-notice">{notice}</p>}
        {staleSources.length > 0 && (
          <details className="asset-review-notice">
            <summary>{staleSources.length} stale imported source(s)</summary>
            <ul>
              {staleSources.map((source) => (
                <li key={source}>{source}</li>
              ))}
            </ul>
          </details>
        )}
        {importError && <p role="alert">Import failed: {importError}</p>}
        <label className="asset-review-import">
          Import review JSON
          <input
            aria-label="Import review JSON"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void importReview(event.target.files?.[0])}
          />
        </label>
        <div className="asset-review-export-actions">
          <button
            type="button"
            onClick={() =>
              download(
                `${batch.batchId}-review.json`,
                serializeReviewProgress(batch)
              )
            }
          >
            Export review JSON
          </button>
          <button
            type="button"
            disabled={readyCount === 0}
            onClick={() =>
              download(
                `${batch.batchId}-provider.json`,
                serializeReadyProviderBatch(batch)
              )
            }
          >
            Export Ready provider JSON
          </button>
        </div>
      </aside>
    </main>
  );
}
