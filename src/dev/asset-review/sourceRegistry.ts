import {
  parseReviewBatch,
  serializeReviewProgress,
  type AssetReviewBatch,
  type AssetReviewCatalog,
} from './model';

export type AssetReviewSourceKind = 'converted-fbx' | 'authored-glb';

/** One row of the generated sources.json index (exact keys, no extras). */
export interface AssetReviewSourceDescriptor {
  id: string;
  label: string;
  kind: AssetReviewSourceKind;
  catalogUrl: string;
}

export interface AssetReviewSourceIndex {
  schemaVersion: 1;
  defaultSourceId: string;
  sources: AssetReviewSourceDescriptor[];
}

/**
 * Per-source review context: the selected candidate key plus the filter state
 that belongs to the source being browsed.
 */
export interface AssetReviewSourceContext {
  selectedKey: string;
  search: string;
  category: string;
  sourceFamily: string;
  browsingFamily: string;
  reviewStatus: string;
  statusTab: string;
}

/** Minimal storage seam so persistence can be tested without a browser. */
export interface AssetReviewStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Legacy single-source storage key; retained as the migration source/backup. */
export const LEGACY_BATCH_STORAGE_KEY = 'rpg.asset-review.batch.v1';
/** Catalogue URL of the original single-source lab. */
export const LEGACY_CATALOG_URL = '/models/synty/asset-review/catalog.json';
/** Generated sources index served next to the prepared catalogues. */
export const SOURCES_INDEX_URL = '/models/synty/asset-review/sources.json';
/** Where the remembered selected source id is stored. */
export const SELECTED_SOURCE_STORAGE_KEY = 'rpg.asset-review.source.v1';
/** Internal id of the implicit no-index legacy source. */
export const LEGACY_SOURCE_ID = 'legacy';

const PREPARED_ROOT = '/models/synty/asset-review/';
const PREPARED_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const BATCH_KEY_PREFIX = 'rpg.asset-review.batch.v2:';
const CONTEXT_KEY_PREFIX = 'rpg.asset-review.context.v1:';

const INDEX_KEYS = ['defaultSourceId', 'schemaVersion', 'sources'] as const;
const DESCRIPTOR_KEYS = ['catalogUrl', 'id', 'kind', 'label'] as const;
const SOURCE_KINDS = new Set<AssetReviewSourceKind>([
  'converted-fbx',
  'authored-glb',
]);
const SOURCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const CONTEXT_KEYS = [
  'browsingFamily',
  'category',
  'reviewStatus',
  'search',
  'selectedKey',
  'sourceFamily',
  'statusTab',
] as const;

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
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

/**
 * Catalogue URLs must be same-origin prepared paths under the review asset
 * root; filesystem paths, remote URLs and traversals are rejected.
 */
function parsePreparedCatalogUrl(value: unknown, label: string): string {
  const url = requireString(value, label, { nonEmpty: true });
  const remainder = url.startsWith(PREPARED_ROOT)
    ? url.slice(PREPARED_ROOT.length)
    : '';
  const segments = remainder.split('/');
  requireValue(
    remainder !== '' &&
      !url.includes('://') &&
      !url.includes('%') &&
      !url.includes('?') &&
      !url.includes('#') &&
      !remainder.includes('\\') &&
      segments.length > 0 &&
      segments.every((part) => PREPARED_PATH_SEGMENT_PATTERN.test(part)) &&
      segments.at(-1)?.endsWith('.json'),
    `${label} must be a same-origin prepared catalogue path under ${PREPARED_ROOT}`
  );
  return url;
}

function parseSourceDescriptor(
  value: unknown,
  index: number
): AssetReviewSourceDescriptor {
  const label = `sources[${index}]`;
  assertRecord(value, label);
  assertExactKeys(value, DESCRIPTOR_KEYS, label);
  const kind = requireString(value.kind, `${label}.kind`);
  requireValue(
    SOURCE_KINDS.has(kind as AssetReviewSourceKind),
    `${label}.kind must be converted-fbx or authored-glb`
  );
  const id = requireString(value.id, `${label}.id`, {
    pattern: SOURCE_ID_PATTERN,
  });
  requireValue(
    id !== LEGACY_SOURCE_ID,
    `${label}.id is reserved for the no-index legacy source`
  );
  return {
    id,
    label: requireString(value.label, `${label}.label`, { nonEmpty: true }),
    kind: kind as AssetReviewSourceKind,
    catalogUrl: parsePreparedCatalogUrl(
      value.catalogUrl,
      `${label}.catalogUrl`
    ),
  };
}

export function parseSourceIndex(value: unknown): AssetReviewSourceIndex {
  assertRecord(value, 'sources index');
  assertExactKeys(value, INDEX_KEYS, 'sources index');
  requireValue(
    value.schemaVersion === 1,
    'sources index schemaVersion must be 1'
  );
  const defaultSourceId = requireString(
    value.defaultSourceId,
    'sources index.defaultSourceId',
    { pattern: SOURCE_ID_PATTERN }
  );
  requireValue(
    Array.isArray(value.sources) && value.sources.length > 0,
    'sources index.sources must be a non-empty array'
  );
  const sources = value.sources.map((row, index) =>
    parseSourceDescriptor(row, index)
  );
  const ids = new Set<string>();
  for (const source of sources) {
    requireValue(
      !ids.has(source.id),
      `sources index contains duplicate source id ${source.id}`
    );
    ids.add(source.id);
  }
  requireValue(
    ids.has(defaultSourceId),
    'sources index.defaultSourceId must match a registered source id'
  );
  return { schemaVersion: 1, defaultSourceId, sources };
}

/**
 * An authored source serves exactly schema-v3 catalogues; converter sources
 * keep serving their exact schema-v1/v2 bytes.
 */
export function catalogMatchesSourceKind(
  kind: AssetReviewSourceKind,
  catalog: Pick<AssetReviewCatalog, 'schemaVersion'>
): boolean {
  return kind === 'authored-glb'
    ? catalog.schemaVersion === 3
    : catalog.schemaVersion === 1 || catalog.schemaVersion === 2;
}

/** Batch drafts are stored per source; the no-index legacy key is untouched. */
export function batchStorageKey(sourceId: string): string {
  if (sourceId === LEGACY_SOURCE_ID) {
    return LEGACY_BATCH_STORAGE_KEY;
  }
  requireValue(
    SOURCE_ID_PATTERN.test(sourceId),
    `invalid source id ${JSON.stringify(sourceId)}`
  );
  return `${BATCH_KEY_PREFIX}${sourceId}`;
}

export function contextStorageKey(sourceId: string): string {
  requireValue(
    SOURCE_ID_PATTERN.test(sourceId),
    `invalid source id ${JSON.stringify(sourceId)}`
  );
  return `${CONTEXT_KEY_PREFIX}${sourceId}`;
}

export function readStoredBatch(
  storage: AssetReviewStorage,
  sourceId: string
): AssetReviewBatch | undefined {
  const raw = storage.getItem(batchStorageKey(sourceId));
  if (raw === null) return undefined;
  return parseReviewBatch(JSON.parse(raw));
}

export function writeStoredBatch(
  storage: AssetReviewStorage,
  sourceId: string,
  batch: AssetReviewBatch
): void {
  storage.setItem(batchStorageKey(sourceId), serializeReviewProgress(batch));
}

export function readStoredContext(
  storage: AssetReviewStorage,
  sourceId: string
): AssetReviewSourceContext | undefined {
  const raw = storage.getItem(contextStorageKey(sourceId));
  if (raw === null) return undefined;
  return parseSourceContext(JSON.parse(raw));
}

export function writeStoredContext(
  storage: AssetReviewStorage,
  sourceId: string,
  context: AssetReviewSourceContext
): void {
  storage.setItem(contextStorageKey(sourceId), serializeSourceContext(context));
}

export function serializeSourceContext(
  context: AssetReviewSourceContext
): string {
  assertRecord(context, 'source context');
  assertExactKeys(context, CONTEXT_KEYS, 'source context');
  for (const key of CONTEXT_KEYS) {
    requireValue(
      typeof context[key] === 'string',
      `source context.${key} must be a string`
    );
  }
  return JSON.stringify(context);
}

export function parseSourceContext(value: unknown): AssetReviewSourceContext {
  assertRecord(value, 'source context');
  assertExactKeys(value, CONTEXT_KEYS, 'source context');
  const context = {} as AssetReviewSourceContext;
  for (const key of CONTEXT_KEYS) {
    context[key] = requireString(value[key], `source context.${key}`);
  }
  return context;
}

export interface LegacyMigrationPlanInput {
  index: AssetReviewSourceIndex;
  legacyCatalogUrl: string;
  legacyRawJson: string | null;
  hasScopedDraft: (sourceId: string) => boolean;
}

export interface LegacyMigrationPlan {
  status: 'migrated' | 'retained' | 'none';
  targetSourceId?: string;
  serializedBatch?: string;
  message?: string;
}

const MIGRATION_HINT =
  'The legacy draft stays under its original storage key as a backup and can be imported manually.';

/**
 * Plan the one-time migration of the global legacy draft into the uniquely
 * matching legacy source. It never copies across kinds, never clears the
 * original JSON, and never clobbers an existing per-source draft.
 */
export function planLegacyMigration(
  input: LegacyMigrationPlanInput
): LegacyMigrationPlan {
  if (input.legacyRawJson === null) {
    return { status: 'none' };
  }
  const matches = input.index.sources.filter(
    (source) =>
      source.catalogUrl === input.legacyCatalogUrl &&
      source.kind === 'converted-fbx'
  );
  if (matches.length !== 1) {
    return {
      status: 'retained',
      message: `Legacy review draft kept without migration: expected exactly one converted-fbx source serving ${input.legacyCatalogUrl}, found ${matches.length}. ${MIGRATION_HINT}`,
    };
  }
  const target = matches[0]!;
  if (input.hasScopedDraft(target.id)) {
    return { status: 'none' };
  }
  let serializedBatch: string;
  try {
    serializedBatch = serializeReviewBatchJson(input.legacyRawJson);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      status: 'retained',
      message: `Legacy review draft kept without migration: it is not a valid review batch (${detail}). ${MIGRATION_HINT}`,
    };
  }
  return {
    status: 'migrated',
    targetSourceId: target.id,
    serializedBatch,
    message: `Migrated the legacy review draft to source "${target.label}". The original JSON is retained under ${LEGACY_BATCH_STORAGE_KEY} as a backup.`,
  };
}

function serializeReviewBatchJson(rawJson: string): string {
  return serializeReviewProgress(parseReviewBatch(JSON.parse(rawJson)));
}
