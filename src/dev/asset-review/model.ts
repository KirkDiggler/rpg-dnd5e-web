export type ReviewDecision = 'undecided' | 'keep' | 'ready' | 'skip' | 'defer';

export type WorldAssetCategory = 'props' | 'items' | 'weapons' | 'env';
export type ReviewStatus = 'trusted' | 'material-review' | 'fx-review';
export type FieldErrors = Record<string, string>;

export interface AssetReviewSource {
  packSlug: string;
  packVersion: string;
  sourcePath: string;
  glbSha256: string;
}

export interface AssetReviewCandidate {
  source: AssetReviewSource;
  url: string;
  sourceFamily: string;
  suggestedCategory: WorldAssetCategory;
  suggestedDisplayName: string;
  browsingFamily: string;
  referencePack: string;
  refSuffix: string;
  dimensionsMeters: [number, number, number];
  readyEligible: boolean;
  reviewStatus: ReviewStatus;
  reasons: string[];
}

export interface AssetReviewCatalog {
  schemaVersion: 1;
  candidates: AssetReviewCandidate[];
}

export interface AssetReviewEntry {
  source: AssetReviewSource;
  url: string;
  sourceFamily: string;
  browsingFamily: string;
  referencePack: string;
  refSuffix: string;
  dimensionsMeters: [number, number, number];
  readyEligible: boolean;
  reviewStatus: ReviewStatus;
  reasons: string[];
  decision: ReviewDecision;
  loadedSuccessfully: boolean;
  displayName: string;
  category: WorldAssetCategory;
  ref: string;
  calibration: {
    scale: number;
    yawDegrees: number;
    fineOffsetMeters: [number, number, number];
  };
  tags: string[];
  supportsDecoration: boolean;
  notes: string;
  deferReason: string;
}

export interface AssetReviewBatch {
  schemaVersion: 1;
  batchId: string;
  entries: AssetReviewEntry[];
}

export interface MergeResult {
  batch: AssetReviewBatch;
  staleSourceKeys: string[];
}

export interface ProviderFieldPatch {
  displayName?: string;
  category?: WorldAssetCategory;
  calibration?: Partial<AssetReviewEntry['calibration']>;
  tags?: string[];
  supportsDecoration?: boolean;
  notes?: string;
}

export interface ReviewFilter {
  search: string;
  category?: WorldAssetCategory;
  sourceFamily?: string;
  browsingFamily?: string;
  decision?: ReviewDecision | 'needs-details';
  reviewStatus?: ReviewStatus;
}

const CATALOG_KEYS = ['schemaVersion', 'candidates'] as const;
const CANDIDATE_KEYS = [
  'source',
  'url',
  'sourceFamily',
  'suggestedCategory',
  'suggestedDisplayName',
  'browsingFamily',
  'referencePack',
  'refSuffix',
  'dimensionsMeters',
  'readyEligible',
  'reviewStatus',
  'reasons',
] as const;
const SOURCE_KEYS = [
  'packSlug',
  'packVersion',
  'sourcePath',
  'glbSha256',
] as const;
const BATCH_KEYS = ['schemaVersion', 'batchId', 'entries'] as const;
const ENTRY_KEYS = [
  'source',
  'url',
  'sourceFamily',
  'browsingFamily',
  'referencePack',
  'refSuffix',
  'dimensionsMeters',
  'readyEligible',
  'reviewStatus',
  'reasons',
  'decision',
  'loadedSuccessfully',
  'displayName',
  'category',
  'ref',
  'calibration',
  'tags',
  'supportsDecoration',
  'notes',
  'deferReason',
] as const;
const PORTABLE_ENTRY_KEYS = ENTRY_KEYS.filter((key) => key !== 'url');
const CALIBRATION_KEYS = ['scale', 'yawDegrees', 'fineOffsetMeters'] as const;
const PROVIDER_PATCH_KEYS = [
  'displayName',
  'category',
  'calibration',
  'tags',
  'supportsDecoration',
  'notes',
] as const;
const CALIBRATION_PATCH_KEYS = CALIBRATION_KEYS;

const CATEGORIES = new Set<WorldAssetCategory>([
  'props',
  'items',
  'weapons',
  'env',
]);
const REVIEW_STATUSES = new Set<ReviewStatus>([
  'trusted',
  'material-review',
  'fx-review',
]);
const DECISIONS = new Set<ReviewDecision>([
  'undecided',
  'keep',
  'ready',
  'skip',
  'defer',
]);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PACK_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PACK_VERSION_PATTERN = /^v[0-9][a-z0-9.-]*$/;
const FAMILY_PATTERN = /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/;
const REF_SUFFIX_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const REVIEW_URL_PATTERN =
  /^\/models\/synty\/asset-review\/([0-9a-f]{12})-([A-Za-z0-9][A-Za-z0-9_-]*)\.glb$/;
const BATCH_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DISPLAY_NAME_MAX_CODE_POINTS = 80;
const DISPLAY_NAME_FORBIDDEN_MARKERS = [
  'sourcefiles',
  'downloads',
  'file:',
  'http:',
  'https:',
  '://',
] as const;
const DISPLAY_NAME_NONPRINTABLE_PATTERN = /[\p{C}\p{Z}]/u;
const TAG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const TAG_LIMIT = 20;
const SHARED_SYNTY_SCALE = 0.75;
const MAX_RUNTIME_AXIS_METERS = 20;

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function containsForbiddenDisplayNameMarker(value: string): boolean {
  // Uppercasing first expands full Unicode folds such as `ﬁ` -> `FI`.
  const folded = value.toUpperCase().toLowerCase();
  return DISPLAY_NAME_FORBIDDEN_MARKERS.some((marker) =>
    folded.includes(marker)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertRecord(
  value: unknown,
  label: string
): asserts value is Record<string, unknown> {
  requireValue(isRecord(value), `${label} must be an object`);
}

function assertExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string
): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  requireValue(
    actual.length === expected.length &&
      actual.every((key, index) => key === expected[index]),
    `${label} keys must be exactly ${expected.join(', ')}`
  );
}

function requireString(
  value: unknown,
  label: string,
  options: { nonEmpty?: boolean; pattern?: RegExp } = {}
): string {
  requireValue(typeof value === 'string', `${label} must be a string`);
  if (options.nonEmpty) {
    requireValue(value.trim().length > 0, `${label} must not be empty`);
  }
  if (options.pattern) {
    requireValue(options.pattern.test(value), `${label} has an invalid format`);
  }
  return value;
}

function requireStringArray(value: unknown, label: string): string[] {
  requireValue(Array.isArray(value), `${label} must be an array`);
  return value.map((item, index) =>
    requireString(item, `${label}[${index}]`, { nonEmpty: true })
  );
}

function requireFiniteNumber(value: unknown, label: string): number {
  requireValue(
    typeof value === 'number' && Number.isFinite(value),
    `${label} must be finite`
  );
  return value;
}

function requireFiniteTuple(
  value: unknown,
  label: string
): [number, number, number] {
  requireValue(
    Array.isArray(value) && value.length === 3,
    `${label} must contain exactly three numbers`
  );
  return [
    requireFiniteNumber(value[0], `${label}[0]`),
    requireFiniteNumber(value[1], `${label}[1]`),
    requireFiniteNumber(value[2], `${label}[2]`),
  ];
}

function requireReviewDimensions(
  value: unknown,
  label: string,
  readyEligible: boolean
): [number, number, number] {
  const dimensions = requireFiniteTuple(value, label);
  requireValue(
    dimensions.every((axis) => axis >= 0),
    `${label} axes must all be non-negative`
  );
  requireValue(
    dimensions.some((axis) => axis > 0),
    `${label} must include at least one positive axis`
  );
  if (readyEligible) {
    requireValue(
      dimensions.every((axis) => axis > 0),
      `${label} axes must all be positive when readyEligible is true`
    );
  }
  return dimensions;
}

function parseSource(value: unknown, label: string): AssetReviewSource {
  assertRecord(value, label);
  assertExactKeys(value, SOURCE_KEYS, label);

  const sourcePath = requireString(value.sourcePath, `${label}.sourcePath`, {
    nonEmpty: true,
  });
  requireValue(
    !sourcePath.startsWith('/') &&
      !sourcePath.includes('\\') &&
      sourcePath.endsWith('.fbx') &&
      sourcePath
        .split('/')
        .every((part) => part !== '' && part !== '.' && part !== '..'),
    `${label}.sourcePath must be a normalized relative POSIX .fbx path`
  );

  const glbSha256 = requireString(value.glbSha256, `${label}.glbSha256`);
  requireValue(
    SHA256_PATTERN.test(glbSha256),
    `${label}.glbSha256 must be a lowercase SHA-256`
  );

  return {
    packSlug: requireString(value.packSlug, `${label}.packSlug`, {
      pattern: PACK_SLUG_PATTERN,
    }),
    packVersion: requireString(value.packVersion, `${label}.packVersion`, {
      pattern: PACK_VERSION_PATTERN,
    }),
    sourcePath,
    glbSha256,
  };
}

function parseCategory(value: unknown, label: string): WorldAssetCategory {
  requireValue(
    typeof value === 'string' && CATEGORIES.has(value as WorldAssetCategory),
    `${label} must be one of props, items, weapons, env`
  );
  return value as WorldAssetCategory;
}

function parseReviewStatus(value: unknown, label: string): ReviewStatus {
  requireValue(
    typeof value === 'string' && REVIEW_STATUSES.has(value as ReviewStatus),
    `${label} must be a supported review status`
  );
  return value as ReviewStatus;
}

function parseDecision(value: unknown, label: string): ReviewDecision {
  requireValue(
    typeof value === 'string' && DECISIONS.has(value as ReviewDecision),
    `${label} must be a supported review decision`
  );
  return value as ReviewDecision;
}

function parseCandidate(value: unknown, index: number): AssetReviewCandidate {
  const label = `candidate[${index}]`;
  assertRecord(value, label);
  assertExactKeys(value, CANDIDATE_KEYS, label);

  const source = parseSource(value.source, `${label}.source`);
  const url = requireString(value.url, `${label}.url`);
  const urlMatch = REVIEW_URL_PATTERN.exec(url);
  requireValue(
    urlMatch !== null && urlMatch[1] === source.glbSha256.slice(0, 12),
    `${label}.url must be a safe content-addressed asset-review GLB URL matching its source hash`
  );

  requireValue(
    typeof value.readyEligible === 'boolean',
    `${label}.readyEligible must be boolean`
  );
  const readyEligible = value.readyEligible;
  const reviewStatus = parseReviewStatus(
    value.reviewStatus,
    `${label}.reviewStatus`
  );
  const reasons = requireStringArray(value.reasons, `${label}.reasons`);
  if (reviewStatus === 'trusted') {
    if (readyEligible) {
      requireValue(
        reasons.length === 0,
        `${label}: trusted eligible candidates must not include blocking reasons`
      );
    } else {
      requireValue(
        reasons.length > 0,
        `${label}: trusted ineligible candidates must include a provider-preflight reason`
      );
    }
  } else {
    requireValue(
      !readyEligible,
      `${label}: material/FX candidates must be ineligible`
    );
    requireValue(
      reasons.length > 0,
      `${label}: material/FX candidates must include a blocking reason`
    );
  }

  return {
    source,
    url,
    sourceFamily: requireString(value.sourceFamily, `${label}.sourceFamily`, {
      pattern: FAMILY_PATTERN,
    }),
    suggestedCategory: parseCategory(
      value.suggestedCategory,
      `${label}.suggestedCategory`
    ),
    suggestedDisplayName: requireString(
      value.suggestedDisplayName,
      `${label}.suggestedDisplayName`,
      { nonEmpty: true }
    ),
    browsingFamily: requireString(
      value.browsingFamily,
      `${label}.browsingFamily`,
      { pattern: FAMILY_PATTERN }
    ),
    referencePack: requireString(
      value.referencePack,
      `${label}.referencePack`,
      { pattern: PACK_SLUG_PATTERN }
    ),
    refSuffix: requireString(value.refSuffix, `${label}.refSuffix`, {
      pattern: REF_SUFFIX_PATTERN,
    }),
    dimensionsMeters: requireReviewDimensions(
      value.dimensionsMeters,
      `${label}.dimensionsMeters`,
      readyEligible
    ),
    readyEligible,
    reviewStatus,
    reasons,
  };
}

function stableSourceKey(source: AssetReviewSource): string {
  return `${source.packSlug}@${source.packVersion}:${source.sourcePath}#${source.glbSha256}`;
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function compareEntries(
  left: Pick<AssetReviewEntry, 'source'>,
  right: Pick<AssetReviewEntry, 'source'>
): number {
  return (
    compareText(left.source.sourcePath, right.source.sourcePath) ||
    compareText(left.source.packSlug, right.source.packSlug) ||
    compareText(left.source.packVersion, right.source.packVersion) ||
    compareText(left.source.glbSha256, right.source.glbSha256)
  );
}

function entryFromCandidate(candidate: AssetReviewCandidate): AssetReviewEntry {
  const base = {
    source: { ...candidate.source },
    url: candidate.url,
    sourceFamily: candidate.sourceFamily,
    browsingFamily: candidate.browsingFamily,
    referencePack: candidate.referencePack,
    refSuffix: candidate.refSuffix,
    dimensionsMeters: [...candidate.dimensionsMeters] as [
      number,
      number,
      number,
    ],
    readyEligible: candidate.readyEligible,
    reviewStatus: candidate.reviewStatus,
    reasons: [...candidate.reasons],
  };
  const category = candidate.suggestedCategory;

  return {
    ...base,
    decision: 'undecided',
    loadedSuccessfully: false,
    displayName: candidate.suggestedDisplayName,
    category,
    ref: visualRef({ ...base, category }),
    calibration: {
      scale: 1,
      yawDegrees: 0,
      fineOffsetMeters: [0, 0, 0],
    },
    tags: [],
    supportsDecoration: false,
    notes: '',
    deferReason: '',
  };
}

function parseCalibration(
  value: unknown,
  label: string
): AssetReviewEntry['calibration'] {
  assertRecord(value, label);
  assertExactKeys(value, CALIBRATION_KEYS, label);
  return {
    scale: requireFiniteNumber(value.scale, `${label}.scale`),
    yawDegrees: requireFiniteNumber(value.yawDegrees, `${label}.yawDegrees`),
    fineOffsetMeters: requireFiniteTuple(
      value.fineOffsetMeters,
      `${label}.fineOffsetMeters`
    ),
  };
}

function parseReviewEntry(value: unknown, index: number): AssetReviewEntry {
  const label = `review entry[${index}]`;
  assertRecord(value, label);
  const hasUrl = Object.hasOwn(value, 'url');
  assertExactKeys(value, hasUrl ? ENTRY_KEYS : PORTABLE_ENTRY_KEYS, label);

  const source = parseSource(value.source, `${label}.source`);
  const readyEligible = value.readyEligible;
  requireValue(
    typeof readyEligible === 'boolean',
    `${label}.readyEligible must be boolean`
  );
  requireValue(
    typeof value.loadedSuccessfully === 'boolean',
    `${label}.loadedSuccessfully must be boolean`
  );
  requireValue(
    typeof value.supportsDecoration === 'boolean',
    `${label}.supportsDecoration must be boolean`
  );

  return {
    source,
    url: hasUrl ? requireString(value.url, `${label}.url`) : '',
    sourceFamily: requireString(value.sourceFamily, `${label}.sourceFamily`, {
      pattern: FAMILY_PATTERN,
    }),
    browsingFamily: requireString(
      value.browsingFamily,
      `${label}.browsingFamily`,
      { pattern: FAMILY_PATTERN }
    ),
    referencePack: requireString(
      value.referencePack,
      `${label}.referencePack`,
      { pattern: PACK_SLUG_PATTERN }
    ),
    refSuffix: requireString(value.refSuffix, `${label}.refSuffix`, {
      pattern: REF_SUFFIX_PATTERN,
    }),
    dimensionsMeters: requireReviewDimensions(
      value.dimensionsMeters,
      `${label}.dimensionsMeters`,
      readyEligible
    ),
    readyEligible,
    reviewStatus: parseReviewStatus(
      value.reviewStatus,
      `${label}.reviewStatus`
    ),
    reasons: requireStringArray(value.reasons, `${label}.reasons`),
    decision: parseDecision(value.decision, `${label}.decision`),
    loadedSuccessfully: value.loadedSuccessfully,
    displayName: requireString(value.displayName, `${label}.displayName`),
    category: parseCategory(value.category, `${label}.category`),
    ref: requireString(value.ref, `${label}.ref`, { nonEmpty: true }),
    calibration: parseCalibration(value.calibration, `${label}.calibration`),
    tags: requireStringArray(value.tags, `${label}.tags`),
    supportsDecoration: value.supportsDecoration,
    notes: requireString(value.notes, `${label}.notes`),
    deferReason: requireString(value.deferReason, `${label}.deferReason`),
  };
}

function parseReviewBatch(value: unknown): AssetReviewBatch {
  assertRecord(value, 'review batch');
  assertExactKeys(value, BATCH_KEYS, 'review batch');
  requireValue(
    value.schemaVersion === 1,
    'review batch schemaVersion must be 1'
  );
  const batchId = requireString(value.batchId, 'review batch.batchId', {
    pattern: BATCH_ID_PATTERN,
  });
  requireValue(
    Array.isArray(value.entries),
    'review batch.entries must be an array'
  );
  const entries = value.entries.map(parseReviewEntry);
  const sourceKeys = new Set<string>();
  for (const reviewEntry of entries) {
    const key = stableSourceKey(reviewEntry.source);
    requireValue(
      !sourceKeys.has(key),
      `review batch contains duplicate source identity ${key}`
    );
    sourceKeys.add(key);
  }
  return { schemaVersion: 1, batchId, entries };
}

function defaultBatchId(catalog: AssetReviewCatalog): string {
  const referencePacks = new Set(
    catalog.candidates.map((candidate) => candidate.referencePack)
  );
  if (referencePacks.size === 1) {
    return `${catalog.candidates[0]!.referencePack}-world-assets-v1`;
  }
  return 'world-assets-v1';
}

function portableReviewEntry(
  entry: AssetReviewEntry
): Omit<AssetReviewEntry, 'url'> {
  return {
    source: { ...entry.source },
    sourceFamily: entry.sourceFamily,
    browsingFamily: entry.browsingFamily,
    referencePack: entry.referencePack,
    refSuffix: entry.refSuffix,
    dimensionsMeters: [...entry.dimensionsMeters],
    readyEligible: entry.readyEligible,
    reviewStatus: entry.reviewStatus,
    reasons: [...entry.reasons],
    decision: entry.decision,
    loadedSuccessfully: entry.loadedSuccessfully,
    displayName: entry.displayName,
    category: entry.category,
    ref: entry.ref,
    calibration: {
      ...entry.calibration,
      fineOffsetMeters: [...entry.calibration.fineOffsetMeters],
    },
    tags: [...entry.tags],
    supportsDecoration: entry.supportsDecoration,
    notes: entry.notes,
    deferReason: entry.deferReason,
  };
}

export function parseAssetReviewCatalog(value: unknown): AssetReviewCatalog {
  assertRecord(value, 'asset review catalog');
  assertExactKeys(value, CATALOG_KEYS, 'asset review catalog');
  requireValue(
    value.schemaVersion === 1,
    'asset review catalog schemaVersion must be 1'
  );
  requireValue(
    Array.isArray(value.candidates),
    'asset review catalog candidates must be an array'
  );

  const candidates = value.candidates.map(parseCandidate);
  const sourceKeys = new Set<string>();
  const urls = new Set<string>();
  for (const candidate of candidates) {
    const key = stableSourceKey(candidate.source);
    requireValue(
      !sourceKeys.has(key),
      `asset review catalog contains duplicate source identity ${key}`
    );
    requireValue(
      !urls.has(candidate.url),
      `asset review catalog contains duplicate URL ${candidate.url}`
    );
    sourceKeys.add(key);
    urls.add(candidate.url);
  }

  return { schemaVersion: 1, candidates };
}

export function mergeCatalogWithReview(
  catalog: AssetReviewCatalog,
  review?: AssetReviewBatch
): MergeResult {
  const parsedCatalog = parseAssetReviewCatalog(catalog);
  const parsedReview =
    review === undefined ? undefined : parseReviewBatch(review);
  const importedBySource = new Map(
    parsedReview?.entries.map((entry) => [stableSourceKey(entry.source), entry])
  );
  const currentSourceKeys = new Set(
    parsedCatalog.candidates.map((candidate) =>
      stableSourceKey(candidate.source)
    )
  );

  const entries = parsedCatalog.candidates
    .map((candidate) => {
      const fresh = entryFromCandidate(candidate);
      const imported = importedBySource.get(stableSourceKey(candidate.source));
      if (!imported) {
        return fresh;
      }

      const merged: AssetReviewEntry = {
        ...fresh,
        decision: imported.decision,
        loadedSuccessfully: imported.loadedSuccessfully,
        displayName: imported.displayName,
        category: imported.category,
        ref: visualRef({ ...fresh, category: imported.category }),
        calibration: {
          ...imported.calibration,
          fineOffsetMeters: [...imported.calibration.fineOffsetMeters],
        },
        tags: [...imported.tags],
        supportsDecoration: imported.supportsDecoration,
        notes: imported.notes,
        deferReason: imported.deferReason,
      };
      if (
        merged.decision === 'ready' &&
        Object.keys(validateReady(merged)).length > 0
      ) {
        merged.decision = 'keep';
      }
      return merged;
    })
    .sort(compareEntries);

  const staleSourceKeys = (parsedReview?.entries ?? [])
    .map((entry) => stableSourceKey(entry.source))
    .filter((key) => !currentSourceKeys.has(key))
    .sort(compareText);

  return {
    batch: {
      schemaVersion: 1,
      batchId: parsedReview?.batchId ?? defaultBatchId(parsedCatalog),
      entries,
    },
    staleSourceKeys,
  };
}

export function visualRef(
  entry: Pick<AssetReviewEntry, 'category' | 'referencePack' | 'refSuffix'>
): string {
  return `dnd5e:${entry.category}:${entry.referencePack}:${entry.refSuffix}`;
}

export function validateReady(entry: AssetReviewEntry): FieldErrors {
  const errors: FieldErrors = {};
  if (!entry.readyEligible || entry.reviewStatus !== 'trusted') {
    errors.readyEligible = 'Source is not eligible for Ready';
  }
  if (
    typeof entry.displayName !== 'string' ||
    entry.displayName.trim() === ''
  ) {
    errors.displayName = 'Display name is required';
  } else if (entry.displayName !== entry.displayName.trim()) {
    errors.displayName =
      'Display name must not have leading or trailing whitespace';
  } else if (
    Array.from(entry.displayName).length > DISPLAY_NAME_MAX_CODE_POINTS
  ) {
    errors.displayName =
      'Display name must contain at most 80 Unicode code points';
  } else if (
    Array.from(entry.displayName).some(
      (character) =>
        character !== ' ' && DISPLAY_NAME_NONPRINTABLE_PATTERN.test(character)
    )
  ) {
    errors.displayName =
      'Display name must contain only printable, non-control characters';
  } else if (
    entry.displayName.includes('/') ||
    entry.displayName.includes('\\')
  ) {
    errors.displayName = 'Display name must not contain path separators';
  } else if (containsForbiddenDisplayNameMarker(entry.displayName)) {
    errors.displayName =
      'Display name must not contain source-path or URI markers';
  }

  if (!Array.isArray(entry.tags)) {
    errors.tags = 'Tags must be an array';
  } else if (entry.tags.length > TAG_LIMIT) {
    errors.tags = 'Tags must contain at most 20 tags';
  } else if (
    entry.tags.some((tag) => typeof tag !== 'string' || !TAG_PATTERN.test(tag))
  ) {
    errors.tags = 'Each tag must match lowercase [a-z0-9][a-z0-9_-]{0,39}';
  } else if (new Set(entry.tags).size !== entry.tags.length) {
    errors.tags = 'Tags must contain unique tags';
  }

  if (!CATEGORIES.has(entry.category)) {
    errors.category = 'Category is invalid';
  }
  if (
    typeof entry.referencePack !== 'string' ||
    !PACK_SLUG_PATTERN.test(entry.referencePack) ||
    typeof entry.refSuffix !== 'string' ||
    !REF_SUFFIX_PATTERN.test(entry.refSuffix) ||
    entry.ref !== visualRef(entry)
  ) {
    errors.ref = 'Ref must equal the derived visual ref';
  }

  const scale = entry.calibration?.scale;
  if (
    typeof scale !== 'number' ||
    !Number.isFinite(scale) ||
    scale <= 0 ||
    scale > 100
  ) {
    errors['calibration.scale'] = 'Scale must be finite and in (0, 100]';
  }
  const yaw = entry.calibration?.yawDegrees;
  if (
    typeof yaw !== 'number' ||
    !Number.isFinite(yaw) ||
    yaw < -180 ||
    yaw >= 180
  ) {
    errors['calibration.yawDegrees'] =
      'Yaw must be finite and normalized to [-180, 180)';
  }

  const offsets = entry.calibration?.fineOffsetMeters;
  if (!Array.isArray(offsets) || offsets.length !== 3) {
    errors['calibration.fineOffsetMeters'] =
      'Fine offset must contain exactly three numbers';
  } else {
    const limits = [0.5, 0.1, 0.5] as const;
    offsets.forEach((offset, index) => {
      if (
        typeof offset !== 'number' ||
        !Number.isFinite(offset) ||
        Math.abs(offset) > limits[index]!
      ) {
        errors[`calibration.fineOffsetMeters[${index}]`] =
          index === 1
            ? 'Vertical offset must be within [-0.1, 0.1] metres'
            : 'Horizontal offset must be within [-0.5, 0.5] metres';
      }
    });
  }

  const dimensions = entry.dimensionsMeters;
  if (
    !Array.isArray(dimensions) ||
    dimensions.length !== 3 ||
    dimensions.some(
      (axis) => typeof axis !== 'number' || !Number.isFinite(axis) || axis <= 0
    )
  ) {
    errors.dimensionsMeters = 'Measured bounds must have three positive axes';
  } else if (typeof scale === 'number' && Number.isFinite(scale) && scale > 0) {
    if (
      dimensions.some(
        (axis) => axis * scale * SHARED_SYNTY_SCALE > MAX_RUNTIME_AXIS_METERS
      )
    ) {
      errors.dimensionsMeters =
        'Scaled runtime bounds must not exceed 20 metres on any axis';
    }
  }

  if (entry.loadedSuccessfully !== true) {
    errors.loadedSuccessfully = 'A successful model load is required';
  }
  if (typeof entry.supportsDecoration !== 'boolean') {
    errors.supportsDecoration = 'Supports decorations must be boolean';
  }

  return errors;
}

export function transitionDecision(
  entry: AssetReviewEntry,
  decision: ReviewDecision
): AssetReviewEntry {
  requireValue(DECISIONS.has(decision), 'Unknown review decision');
  if (decision === 'ready') {
    const errors = validateReady(entry);
    if (Object.keys(errors).length > 0) {
      throw new Error(
        `Cannot mark Ready: ${Object.entries(errors)
          .map(([field, message]) => `${field}: ${message}`)
          .join('; ')}`
      );
    }
  }
  return { ...entry, decision };
}

export function updateProviderFields(
  entry: AssetReviewEntry,
  patch: ProviderFieldPatch
): AssetReviewEntry {
  const patchValue: unknown = patch;
  assertRecord(patchValue, 'provider field patch');
  for (const key of Object.keys(patchValue)) {
    requireValue(
      PROVIDER_PATCH_KEYS.includes(key as (typeof PROVIDER_PATCH_KEYS)[number]),
      `provider field patch contains unknown key ${key}`
    );
  }
  if (patch.displayName !== undefined) {
    requireValue(
      typeof patch.displayName === 'string',
      'provider field patch displayName must be a string'
    );
  }
  if (patch.category !== undefined) {
    parseCategory(patch.category, 'provider field patch category');
  }
  if (patch.tags !== undefined) {
    requireStringArray(patch.tags, 'provider field patch tags');
  }
  if (patch.supportsDecoration !== undefined) {
    requireValue(
      typeof patch.supportsDecoration === 'boolean',
      'provider field patch supportsDecoration must be boolean'
    );
  }
  if (patch.notes !== undefined) {
    requireValue(
      typeof patch.notes === 'string',
      'provider field patch notes must be a string'
    );
  }
  if (patch.calibration !== undefined) {
    const calibrationPatch: unknown = patch.calibration;
    assertRecord(calibrationPatch, 'provider field patch calibration');
    for (const key of Object.keys(calibrationPatch)) {
      requireValue(
        CALIBRATION_PATCH_KEYS.includes(
          key as (typeof CALIBRATION_PATCH_KEYS)[number]
        ),
        `provider field patch calibration contains unknown key ${key}`
      );
    }
  }

  const category = patch.category ?? entry.category;
  const calibration: AssetReviewEntry['calibration'] = patch.calibration
    ? {
        ...entry.calibration,
        ...patch.calibration,
        fineOffsetMeters: (patch.calibration.fineOffsetMeters === undefined
          ? [...entry.calibration.fineOffsetMeters]
          : [...patch.calibration.fineOffsetMeters]) as [
          number,
          number,
          number,
        ],
      }
    : {
        ...entry.calibration,
        fineOffsetMeters: [...entry.calibration.fineOffsetMeters] as [
          number,
          number,
          number,
        ],
      };
  const updated: AssetReviewEntry = {
    ...entry,
    ...patch,
    category,
    ref: visualRef({ ...entry, category }),
    calibration,
    tags: patch.tags === undefined ? [...entry.tags] : [...patch.tags],
  };
  if (updated.decision === 'ready') {
    updated.decision = 'keep';
  }
  return updated;
}

export function filterReviewEntries(
  entries: AssetReviewEntry[],
  filter: ReviewFilter
): AssetReviewEntry[] {
  const search = filter.search.trim().toLocaleLowerCase();
  return entries
    .filter((entry) => {
      const matchesSearch =
        search === '' ||
        [
          entry.source.sourcePath,
          entry.displayName,
          entry.ref,
          entry.browsingFamily,
        ].some((value) => value.toLocaleLowerCase().includes(search));
      const matchesDecision =
        filter.decision === undefined ||
        (filter.decision === 'needs-details'
          ? entry.decision === 'keep' &&
            Object.keys(validateReady(entry)).length > 0
          : entry.decision === filter.decision);
      return (
        matchesSearch &&
        (filter.category === undefined || entry.category === filter.category) &&
        (filter.sourceFamily === undefined ||
          entry.sourceFamily === filter.sourceFamily) &&
        (filter.browsingFamily === undefined ||
          entry.browsingFamily === filter.browsingFamily) &&
        matchesDecision &&
        (filter.reviewStatus === undefined ||
          entry.reviewStatus === filter.reviewStatus)
      );
    })
    .sort(compareEntries);
}

export function serializeReviewProgress(batch: AssetReviewBatch): string {
  const parsed = parseReviewBatch(batch);
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      batchId: parsed.batchId,
      entries: parsed.entries.map(portableReviewEntry),
    },
    null,
    2
  )}\n`;
}

export function serializeReadyProviderBatch(batch: AssetReviewBatch): string {
  const parsed = parseReviewBatch(batch);
  const readyEntries = parsed.entries.filter(
    (entry) => entry.decision === 'ready'
  );
  requireValue(
    readyEntries.length > 0,
    'Provider export requires at least one Ready entry'
  );

  const refs = new Set<string>();
  for (const entry of readyEntries) {
    const errors = validateReady(entry);
    requireValue(
      Object.keys(errors).length === 0,
      `Ready entry ${stableSourceKey(entry.source)} is invalid: ${Object.entries(
        errors
      )
        .map(([field, message]) => `${field}: ${message}`)
        .join('; ')}`
    );
    requireValue(
      !refs.has(entry.ref),
      `Provider export has duplicate ref ${entry.ref}`
    );
    refs.add(entry.ref);
  }

  return `${JSON.stringify(
    {
      schemaVersion: 1,
      batchId: parsed.batchId,
      entries: readyEntries.map((entry) => ({
        source: { ...entry.source },
        category: entry.category,
        ref: entry.ref,
        displayName: entry.displayName,
        calibration: {
          ...entry.calibration,
          fineOffsetMeters: [...entry.calibration.fineOffsetMeters],
        },
        tags: [...entry.tags],
        supportsDecoration: entry.supportsDecoration,
        notes: entry.notes,
      })),
    },
    null,
    2
  )}\n`;
}
