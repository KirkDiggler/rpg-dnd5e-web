import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './AssetReviewLab.css';
import { AssetReviewScene } from './AssetReviewScene';
import {
  entryAppearanceFacts,
  entryPreviewUrl,
  filterReviewEntries,
  generateBatchId,
  mergeCatalogWithReview,
  parseAssetReviewCatalog,
  performanceAdvisories,
  recordPreviewLoad,
  selectPaletteAppearance,
  serializeReadyProviderBatch,
  serializeReviewProgress,
  setBatchId,
  stableSourceKey,
  transitionDecision,
  updateProviderFields,
  validateReady,
  type AssetReviewBatch,
  type AssetReviewCatalog,
  type AssetReviewEntry,
  type AssetReviewLoadStatus,
  type ProviderFieldPatch,
  type ReviewDecision,
  type ReviewFilter,
  type ReviewStatus,
  type WorldAssetCategory,
} from './model';
import {
  batchStorageKey,
  catalogMatchesSourceKind,
  contextStorageKey,
  LEGACY_BATCH_STORAGE_KEY,
  LEGACY_CATALOG_URL,
  LEGACY_SOURCE_ID,
  parseSourceIndex,
  planLegacyMigration,
  readStoredBatch,
  readStoredContext,
  SELECTED_SOURCE_STORAGE_KEY,
  SOURCES_INDEX_URL,
  writeStoredBatch,
  writeStoredContext,
  type AssetReviewSourceContext,
  type AssetReviewSourceDescriptor,
  type AssetReviewSourceIndex,
} from './sourceRegistry';

import { MaterialReviewLab } from './MaterialReviewLab';

export const ASSET_REVIEW_STORAGE_KEY = LEGACY_BATCH_STORAGE_KEY;

const CATEGORIES: WorldAssetCategory[] = ['props', 'items', 'weapons', 'env'];
const REVIEW_STATUSES: ReviewStatus[] = [
  'trusted',
  'material-review',
  'fx-review',
  'authored',
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
  return stableSourceKey(entry.source);
}

/** The implicit single source used when no generated sources index exists. */
const LEGACY_SOURCE_DESCRIPTOR: AssetReviewSourceDescriptor = {
  id: LEGACY_SOURCE_ID,
  label: 'Prepared catalogue',
  kind: 'converted-fbx',
  catalogUrl: LEGACY_CATALOG_URL,
};

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function SourcePicker({
  sources,
  activeSourceId,
  onSwitch,
}: {
  sources: AssetReviewSourceDescriptor[];
  activeSourceId: string;
  onSwitch: (sourceId: string) => void;
}) {
  const active = sources.find((source) => source.id === activeSourceId);
  return (
    <div className="asset-review-source-picker">
      <label>
        Source
        <select
          aria-label="Review source"
          value={activeSourceId}
          onChange={(event) => onSwitch(event.target.value)}
        >
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.label}
            </option>
          ))}
        </select>
      </label>
      <span data-testid="active-source">
        {active ? `${active.label} · ${active.kind}` : 'Prepared catalogue'}
      </span>
    </div>
  );
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
  return new URLSearchParams(window.location.search).get('materialReview') ===
    '1' ? (
    <MaterialReviewLab />
  ) : (
    <AssetBatchReviewLab />
  );
}

function AssetBatchReviewLab() {
  const [sources, setSources] = useState<AssetReviewSourceDescriptor[]>();
  const [activeSourceId, setActiveSourceId] = useState(LEGACY_SOURCE_ID);
  const activeSourceIdRef = useRef(LEGACY_SOURCE_ID);
  const requestRef = useRef(0);
  /** True once the loaded batch carries user work worth persisting. */
  const batchDirtyRef = useRef(false);
  const [catalog, setCatalog] = useState<AssetReviewCatalog>();
  const [batch, setBatch] = useState<AssetReviewBatch>();
  const [selectedKey, setSelectedKey] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [importError, setImportError] = useState('');
  const [staleSources, setStaleSources] = useState<string[]>([]);
  const [staleAppearances, setStaleAppearances] = useState<string[]>([]);
  const [batchIdValue, setBatchIdValue] = useState('');
  const [batchIdError, setBatchIdError] = useState('');
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

  const loadSourceCatalogue = useCallback(
    async (
      descriptor: AssetReviewSourceDescriptor,
      requestId: number
    ): Promise<void> => {
      try {
        const response = await fetch(descriptor.catalogUrl);
        if (!response.ok) {
          throw new Error(`catalog request returned ${response.status}`);
        }
        const loadedCatalog = parseAssetReviewCatalog(await response.json());
        if (!catalogMatchesSourceKind(descriptor.kind, loadedCatalog)) {
          throw new Error(
            `catalog schema v${loadedCatalog.schemaVersion} does not match source kind ${descriptor.kind}`
          );
        }
        if (
          requestRef.current !== requestId ||
          activeSourceIdRef.current !== descriptor.id
        ) {
          return;
        }
        let review: AssetReviewBatch | undefined;
        if (window.localStorage.getItem(batchStorageKey(descriptor.id))) {
          try {
            review = readStoredBatch(window.localStorage, descriptor.id);
          } catch (error) {
            review = undefined;
            setNotice(
              `Saved review for this source was ignored: ${errorDetail(error)}`
            );
          }
        }
        const merged = mergeCatalogWithReview(loadedCatalog, review);
        const initialBatch = review
          ? merged.batch
          : setBatchId(
              merged.batch,
              generateBatchId(
                merged.batch.entries[0]?.referencePack ?? 'world-assets'
              )
            );
        let context: AssetReviewSourceContext | undefined;
        if (descriptor.id !== LEGACY_SOURCE_ID) {
          if (window.localStorage.getItem(contextStorageKey(descriptor.id))) {
            try {
              context = readStoredContext(window.localStorage, descriptor.id);
            } catch {
              context = undefined;
            }
          }
        }
        setCatalog(loadedCatalog);
        batchDirtyRef.current = review !== undefined;
        setBatch(initialBatch);
        setBatchIdValue(initialBatch.batchId);
        setStaleSources(merged.staleSourceKeys);
        setStaleAppearances(merged.staleAppearanceKeys);
        setSelectedKey(
          context &&
            merged.batch.entries.some(
              (entry) => stableSourceKey(entry.source) === context.selectedKey
            )
            ? context.selectedKey
            : merged.batch.entries[0]
              ? stableSourceKey(merged.batch.entries[0].source)
              : ''
        );
        if (context) {
          setSearch(context.search);
          setCategoryFilter(context.category);
          setSourceFamilyFilter(context.sourceFamily);
          setBrowsingFamilyFilter(context.browsingFamily);
          setReviewStatusFilter(context.reviewStatus);
          setStatusTab(
            (STATUS_TABS.some(([value]) => value === context.statusTab)
              ? context.statusTab
              : 'all') as StatusTab
          );
        }
      } catch (error) {
        if (
          requestRef.current !== requestId ||
          activeSourceIdRef.current !== descriptor.id
        ) {
          return;
        }
        const prefix =
          descriptor.id === LEGACY_SOURCE_ID
            ? 'No prepared asset-review catalog is available'
            : `No prepared asset-review catalog is available for source "${descriptor.label}"`;
        setLoadError(
          `${prefix} (${errorDetail(error)}). Run the asset ingestion command, then reload this page.`
        );
      }
    },
    []
  );

  useEffect(() => {
    const requestId = ++requestRef.current;
    void (async () => {
      let index: AssetReviewSourceIndex | null = null;
      try {
        const response = await fetch(SOURCES_INDEX_URL);
        if (response.status !== 404) {
          if (!response.ok) {
            throw new Error(`sources request returned ${response.status}`);
          }
          index = parseSourceIndex(await response.json());
        }
      } catch (error) {
        if (requestRef.current !== requestId) return;
        setLoadError(
          `No prepared asset-review source index is available (${errorDetail(error)}). Run the asset ingestion command, then reload this page.`
        );
        return;
      }
      if (requestRef.current !== requestId) return;
      if (!index) {
        // No-index legacy fallback: exactly the original single-source lab.
        await loadSourceCatalogue(LEGACY_SOURCE_DESCRIPTOR, requestId);
        return;
      }
      const legacyRaw = window.localStorage.getItem(LEGACY_BATCH_STORAGE_KEY);
      const plan = planLegacyMigration({
        index,
        legacyCatalogUrl: LEGACY_CATALOG_URL,
        legacyRawJson: legacyRaw,
        hasScopedDraft: (sourceId) =>
          window.localStorage.getItem(batchStorageKey(sourceId)) !== null,
      });
      if (plan.status === 'migrated' && plan.targetSourceId) {
        window.localStorage.setItem(
          batchStorageKey(plan.targetSourceId),
          plan.serializedBatch!
        );
      }
      const storedSourceId = window.localStorage.getItem(
        SELECTED_SOURCE_STORAGE_KEY
      );
      const selectedDescriptor =
        index.sources.find((source) => source.id === storedSourceId) ??
        index.sources.find((source) => source.id === index.defaultSourceId) ??
        index.sources[0]!;
      setSources(index.sources);
      activeSourceIdRef.current = selectedDescriptor.id;
      setActiveSourceId(selectedDescriptor.id);
      if (plan.message) setNotice(plan.message);
      await loadSourceCatalogue(selectedDescriptor, requestId);
    })();
  }, [loadSourceCatalogue]);

  useEffect(() => {
    // Persist only batches that carry user work: a freshly generated batch is
    // pristine and must not occupy the scoped key (it would block legacy
    // migration and count as an existing draft on the next launch).
    if (!batch || !batchDirtyRef.current) return;
    writeStoredBatch(window.localStorage, activeSourceIdRef.current, batch);
  }, [batch, activeSourceId]);

  const context = useMemo<AssetReviewSourceContext>(
    () => ({
      selectedKey,
      search,
      category: categoryFilter,
      sourceFamily: sourceFamilyFilter,
      browsingFamily: browsingFamilyFilter,
      reviewStatus: reviewStatusFilter,
      statusTab,
    }),
    [
      browsingFamilyFilter,
      categoryFilter,
      reviewStatusFilter,
      search,
      selectedKey,
      sourceFamilyFilter,
      statusTab,
    ]
  );

  useEffect(() => {
    // Skip while a source switch is in flight: writing the cleared context
    // would clobber the target source's saved selection/filter context.
    if (!sources || !batch) return;
    writeStoredContext(window.localStorage, activeSourceIdRef.current, context);
  }, [context, activeSourceId, sources, batch]);

  const switchSource = useCallback(
    (nextId: string) => {
      if (!sources) return;
      const descriptor = sources.find((source) => source.id === nextId);
      if (!descriptor || nextId === activeSourceId) return;
      const requestId = ++requestRef.current;
      activeSourceIdRef.current = nextId;
      setActiveSourceId(nextId);
      setCatalog(undefined);
      setBatch(undefined);
      setSceneStates({});
      setLoadError('');
      setImportError('');
      setNotice('');
      setStaleSources([]);
      setStaleAppearances([]);
      setSelectedKey('');
      setSearch('');
      setCategoryFilter('');
      setSourceFamilyFilter('');
      setBrowsingFamilyFilter('');
      setReviewStatusFilter('');
      setStatusTab('all');
      window.localStorage.setItem(SELECTED_SOURCE_STORAGE_KEY, nextId);
      void loadSourceCatalogue(descriptor, requestId);
    },
    [activeSourceId, loadSourceCatalogue, sources]
  );

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

  const mutateBatch = useCallback(
    (
      updater: (
        current: AssetReviewBatch | undefined
      ) => AssetReviewBatch | undefined
    ) => {
      batchDirtyRef.current = true;
      setBatch(updater);
    },
    []
  );

  const replaceEntry = useCallback(
    (key: string, transform: (entry: AssetReviewEntry) => AssetReviewEntry) => {
      mutateBatch((current) => {
        if (!current) return current;
        const entries = current.entries.map((entry) =>
          sourceKey(entry) === key ? transform(entry) : entry
        );
        return { ...current, entries };
      });
    },
    [mutateBatch]
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

  const handleSceneLoadState = useMemo(() => {
    // Captured per active source: late callbacks from a scene that belonged to
    // a previous source are ignored entirely, including same-URL successes.
    const sourceId = activeSourceId;
    return (url: string, status: AssetReviewLoadStatus, detail?: string) => {
      if (activeSourceIdRef.current !== sourceId) return;
      setSceneStates((current) => ({
        ...current,
        [url]: { status, detail },
      }));
      mutateBatch((current) => {
        if (!current) return current;
        return {
          ...current,
          entries: current.entries.map((entry) =>
            recordPreviewLoad(entry, url, status)
          ),
        };
      });
    };
  }, [activeSourceId, mutateBatch]);

  const importReview = async (file: File | undefined) => {
    if (!file || !catalog) return;
    try {
      const imported = JSON.parse(await readFileText(file)) as AssetReviewBatch;
      const merged = mergeCatalogWithReview(catalog, imported);
      mutateBatch(() => merged.batch);
      setBatchIdValue(merged.batch.batchId);
      setBatchIdError('');
      setStaleSources(merged.staleSourceKeys);
      setStaleAppearances(merged.staleAppearanceKeys);
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
        {sources && (
          <SourcePicker
            sources={sources}
            activeSourceId={activeSourceId}
            onSwitch={switchSource}
          />
        )}
      </main>
    );
  }
  if (!catalog || !batch) {
    return (
      <main className="asset-review-message" aria-label="Asset Review Lab">
        Loading asset-review catalog…
        {sources && (
          <SourcePicker
            sources={sources}
            activeSourceId={activeSourceId}
            onSwitch={switchSource}
          />
        )}
      </main>
    );
  }

  const readyErrors = activeEntry ? validateReady(activeEntry) : {};
  const canMarkReady = activeEntry && Object.keys(readyErrors).length === 0;
  const readyCount = statusCounts.ready;
  const previewUrl = activeEntry ? entryPreviewUrl(activeEntry) : '';
  const appearanceFacts = activeEntry
    ? entryAppearanceFacts(activeEntry)
    : undefined;
  const sceneState = previewUrl ? sceneStates[previewUrl] : undefined;
  const selectedGlbSha256 =
    activeEntry?.paletteSelection?.selectedGlb.sha256 ??
    activeEntry?.source.glbSha256 ??
    '';
  const paletteValue = activeEntry?.paletteSelection
    ? `${activeEntry.paletteSelection.comparisonId}\u0000${activeEntry.paletteSelection.palette}`
    : '';
  const sortedPalettes = [...(activeEntry?.paletteAlternatives ?? [])].sort(
    (left, right) =>
      left.palette.localeCompare(right.palette) ||
      left.comparisonId.localeCompare(right.comparisonId)
  );

  const updateBatchId = (value: string) => {
    setBatchIdValue(value);
    try {
      const next = setBatchId(batch!, value);
      mutateBatch(() => next);
      setBatchIdError('');
    } catch (error) {
      setBatchIdError(error instanceof Error ? error.message : String(error));
    }
  };

  const generateNewBatchId = () => {
    const referencePack = activeEntry?.referencePack ?? 'world-assets';
    updateBatchId(generateBatchId(referencePack));
  };

  return (
    <main className="asset-review-lab" aria-label="Asset Review Lab">
      <aside className="asset-review-drawer" data-testid="candidate-drawer">
        <header>
          <strong>Asset Review Lab</strong>
          <span>loopback only · one candidate loaded</span>
          {sources && (
            <SourcePicker
              sources={sources}
              activeSourceId={activeSourceId}
              onSwitch={switchSource}
            />
          )}
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
              key={activeSourceId}
              url={previewUrl}
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
              {(activeEntry.paletteAlternatives?.length ?? 0) > 0 && (
                <label>
                  Palette
                  <select
                    aria-label="Palette"
                    value={paletteValue}
                    onChange={(event) => {
                      const [comparisonId = '', palette = ''] =
                        event.target.value.split('\u0000');
                      replaceEntry(sourceKey(activeEntry), (entry) =>
                        selectPaletteAppearance(entry, comparisonId, palette)
                      );
                    }}
                  >
                    <option value="">Original / default</option>
                    {sortedPalettes.map((alternative) => (
                      <option
                        key={`${alternative.comparisonId}/${alternative.palette}`}
                        value={`${alternative.comparisonId}\u0000${alternative.palette}`}
                      >
                        {alternative.palette}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Original GLB SHA-256
                <input
                  aria-label="GLB SHA-256"
                  readOnly
                  value={activeEntry.source.glbSha256}
                />
              </label>
              <label>
                Selected GLB SHA-256
                <input
                  aria-label="Selected GLB SHA-256"
                  readOnly
                  value={selectedGlbSha256}
                />
              </label>
              <label>
                Measured bounds (m)
                <input
                  aria-label="Measured bounds"
                  readOnly
                  value={appearanceFacts?.dimensionsMeters.join(' × ') ?? ''}
                />
              </label>
              <div className="asset-review-reasons">
                <strong>Performance observations</strong>
                <span>
                  Size, triangle and texture targets are provisional. Release
                  reports retain measurements for benchmarking.
                </span>
                {performanceAdvisories(activeEntry).map((message) => (
                  <p key={message}>{message}</p>
                ))}
              </div>
              <div className="asset-review-reasons">
                <strong>Blocking reasons</strong>
                {(appearanceFacts?.reasons.length ?? 0) > 0 ? (
                  <ul>
                    {appearanceFacts?.reasons.map((reason) => (
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
                <FieldError message={readyErrors.tags} />
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
        {staleAppearances.length > 0 && (
          <details className="asset-review-notice">
            <summary>
              {staleAppearances.length} stale imported appearance(s)
            </summary>
            <ul>
              {staleAppearances.map((appearance) => (
                <li key={appearance}>{appearance}</li>
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
        <div className="asset-review-batch-controls">
          <label>
            Batch ID
            <input
              aria-label="Batch ID"
              value={batchIdValue}
              onChange={(event) => updateBatchId(event.target.value)}
            />
            <FieldError message={batchIdError} />
          </label>
          <button type="button" onClick={generateNewBatchId}>
            Generate batch ID
          </button>
        </div>
        <div className="asset-review-export-actions">
          <button
            type="button"
            disabled={batchIdError !== ''}
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
            disabled={readyCount === 0 || batchIdError !== ''}
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
