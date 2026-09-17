// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  batchStorageKey,
  catalogMatchesSourceKind,
  contextStorageKey,
  LEGACY_BATCH_STORAGE_KEY,
  LEGACY_CATALOG_URL,
  LEGACY_SOURCE_ID,
  parseSourceContext,
  parseSourceIndex,
  planLegacyMigration,
  readStoredBatch,
  readStoredContext,
  serializeSourceContext,
  writeStoredBatch,
  writeStoredContext,
  type AssetReviewSourceContext,
  type AssetReviewSourceDescriptor,
} from './sourceRegistry';

function descriptor(
  overrides: Partial<AssetReviewSourceDescriptor> = {}
): AssetReviewSourceDescriptor {
  return {
    id: 'dark-fortress-legacy',
    label: 'Dark Fortress library',
    kind: 'converted-fbx',
    catalogUrl: LEGACY_CATALOG_URL,
    ...overrides,
  };
}

function index(sources: AssetReviewSourceDescriptor[]): {
  schemaVersion: 1;
  defaultSourceId: string;
  sources: AssetReviewSourceDescriptor[];
} {
  return { schemaVersion: 1, defaultSourceId: sources[0]!.id, sources };
}

const AUTHORED_CATALOG_URL = '/models/synty/asset-review/authored/catalog.json';

const validIndex = index([
  descriptor(),
  descriptor({
    id: 'authored-trial',
    label: 'Authored GLB trial',
    kind: 'authored-glb',
    catalogUrl: AUTHORED_CATALOG_URL,
  }),
]);

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('parseSourceIndex', () => {
  it('parses the exact schema-v1 index keys and descriptor keys', () => {
    expect(parseSourceIndex(validIndex)).toEqual(validIndex);
  });

  it('rejects unknown and missing keys at both boundaries', () => {
    expect(() => parseSourceIndex({ ...validIndex, unexpected: true })).toThrow(
      /keys must be exactly/i
    );
    expect(() =>
      parseSourceIndex({
        ...validIndex,
        sources: [{ ...validIndex.sources[0], extra: 1 }],
      })
    ).toThrow(/sources\[0\].*keys must be exactly/i);
  });

  it('requires a non-empty sources array and a registered defaultSourceId', () => {
    expect(() => parseSourceIndex({ ...validIndex, sources: [] })).toThrow(
      /non-empty array/i
    );
    expect(() =>
      parseSourceIndex({ ...validIndex, defaultSourceId: 'missing' })
    ).toThrow(/defaultSourceId must match a registered source id/i);
  });

  it('rejects duplicate ids, bad id formats, reserved ids, and unknown kinds', () => {
    expect(() => parseSourceIndex(index([descriptor(), descriptor()]))).toThrow(
      /duplicate source id/i
    );
    expect(() =>
      parseSourceIndex(index([descriptor({ id: '-leading' })]))
    ).toThrow(/id has an invalid format/i);
    expect(() =>
      parseSourceIndex(index([descriptor({ id: LEGACY_SOURCE_ID })]))
    ).toThrow(/reserved/i);
    expect(() =>
      parseSourceIndex(
        index([
          descriptor({
            kind: 'authored-fbx',
          } as unknown as Partial<AssetReviewSourceDescriptor>),
        ])
      )
    ).toThrow(/kind must be converted-fbx or authored-glb/i);
  });

  it('rejects non-prepared catalogue URLs', () => {
    const cases = [
      'https://example.com/catalog.json',
      '/models/synty/catalog.json',
      '/models/synty/asset-review/',
      '/models/synty/asset-review/catalog',
      '/models/synty/asset-review/../secrets/catalog.json',
      '/models/synty/asset-review//catalog.json',
      'models/synty/asset-review/catalog.json',
      '/models/synty/asset-review/catalog.JSON',
      '/models/synty/asset-review/%2e%2e/secrets/catalog.json',
      '/models/synty/asset-review/authored%2ftrial/catalog.json',
      '/models/synty/asset-review/authored%5ctrial/catalog.json',
      '/models/synty/asset-review/catalog.json?source=authored',
      '/models/synty/asset-review/catalog.json#authored',
      '/models/synty/asset-review/.json',
      '/models/synty/asset-review/authored/catalog.json/extra',
    ];
    for (const catalogUrl of cases) {
      expect(() =>
        parseSourceIndex(index([descriptor({ catalogUrl })]))
      ).toThrow(/same-origin prepared catalogue path/i);
    }
    expect(() =>
      parseSourceIndex(
        index([
          descriptor({
            catalogUrl: '/models/synty/asset-review/authored/catalog.json',
          }),
        ])
      )
    ).not.toThrow();
  });
});

describe('catalogMatchesSourceKind', () => {
  it('binds authored-glb to schema v3 and converted-fbx to v1/v2', () => {
    expect(catalogMatchesSourceKind('authored-glb', { schemaVersion: 3 })).toBe(
      true
    );
    expect(catalogMatchesSourceKind('authored-glb', { schemaVersion: 1 })).toBe(
      false
    );
    expect(catalogMatchesSourceKind('authored-glb', { schemaVersion: 2 })).toBe(
      false
    );
    expect(
      catalogMatchesSourceKind('converted-fbx', { schemaVersion: 1 })
    ).toBe(true);
    expect(
      catalogMatchesSourceKind('converted-fbx', { schemaVersion: 2 })
    ).toBe(true);
    expect(
      catalogMatchesSourceKind('converted-fbx', { schemaVersion: 3 })
    ).toBe(false);
  });
});

describe('storage keys', () => {
  it('scopes per-source keys and keeps the legacy id on the legacy key', () => {
    expect(batchStorageKey(LEGACY_SOURCE_ID)).toBe(LEGACY_BATCH_STORAGE_KEY);
    expect(batchStorageKey('authored-trial')).toBe(
      'rpg.asset-review.batch.v2:authored-trial'
    );
    expect(contextStorageKey('authored-trial')).toBe(
      'rpg.asset-review.context.v1:authored-trial'
    );
    expect(() => batchStorageKey('bad id')).toThrow(/invalid source id/i);
    expect(() => contextStorageKey('../escape')).toThrow(/invalid source id/i);
  });
});

describe('storage helpers', () => {
  const context: AssetReviewSourceContext = {
    selectedKey: 'authored-glb:authored-trial@v1:floor-tile.glb#f',
    search: 'floor',
    category: 'env',
    sourceFamily: 'floor',
    browsingFamily: 'floor',
    reviewStatus: 'authored',
    statusTab: 'all',
  };

  it('round-trips batches and contexts through injectable storage', () => {
    const storage = new MemoryStorage();
    const batch = {
      schemaVersion: 1 as const,
      batchId: 'review-1',
      entries: [],
    };

    writeStoredBatch(storage, 'authored-trial', batch);
    writeStoredContext(storage, 'authored-trial', context);

    expect(readStoredBatch(storage, 'authored-trial')).toEqual(batch);
    expect(readStoredContext(storage, 'authored-trial')).toEqual(context);
  });

  it('throws for malformed stored JSON rather than guessing state', () => {
    const storage = new MemoryStorage();
    storage.setItem('rpg.asset-review.batch.v2:authored-trial', '{bad');
    storage.setItem(
      'rpg.asset-review.context.v1:authored-trial',
      JSON.stringify({ ...context, extra: true })
    );

    expect(() => readStoredBatch(storage, 'authored-trial')).toThrow();
    expect(() => readStoredContext(storage, 'authored-trial')).toThrow(
      /keys must be exactly/i
    );
  });
});

describe('source context', () => {
  const context = {
    selectedKey: 'authored-glb:authored-trial@v1:floor-tile.glb#f',
    search: 'floor',
    category: 'env',
    sourceFamily: 'floor',
    browsingFamily: 'floor',
    reviewStatus: 'authored',
    statusTab: 'all',
  };

  it('round-trips the selection and filter context', () => {
    expect(
      parseSourceContext(JSON.parse(serializeSourceContext(context)))
    ).toEqual(context);
  });

  it('rejects wrong shapes instead of guessing defaults', () => {
    expect(() => parseSourceContext({ ...context, selectedKey: 5 })).toThrow(
      /selectedKey must be a string/i
    );
    expect(() => parseSourceContext({ ...context, extra: true })).toThrow(
      /keys must be exactly/i
    );
    expect(serializeSourceContext(context)).toBe(JSON.stringify(context));
  });
});

describe('planLegacyMigration', () => {
  const legacyDraft = JSON.stringify({
    schemaVersion: 1,
    batchId: 'dark-fortress-world-assets-20260910-abc',
    entries: [],
  });
  const baseInput = {
    index: validIndex,
    legacyCatalogUrl: LEGACY_CATALOG_URL,
    legacyRawJson: legacyDraft,
    hasScopedDraft: () => false,
  };

  it('migrates the legacy draft only to the uniquely matching converted source', () => {
    const plan = planLegacyMigration(baseInput);
    expect(plan.status).toBe('migrated');
    expect(plan.targetSourceId).toBe('dark-fortress-legacy');
    expect(JSON.parse(plan.serializedBatch!)).toEqual(JSON.parse(legacyDraft));
    expect(plan.message).toMatch(/Migrated the legacy review draft/i);
    expect(plan.message).toMatch(
      /retained under rpg\.asset-review\.batch\.v1/i
    );
  });

  it('never copies the legacy draft into an authored source', () => {
    const plan = planLegacyMigration({
      ...baseInput,
      index: index([
        descriptor({
          id: 'authored-only',
          kind: 'authored-glb',
          catalogUrl: AUTHORED_CATALOG_URL,
        }),
      ]),
      legacyCatalogUrl: AUTHORED_CATALOG_URL,
    });
    expect(plan.status).toBe('retained');
    expect(plan.message).toMatch(/expected exactly one converted-fbx source/i);
    expect(plan.targetSourceId).toBeUndefined();
  });

  it('retains the draft on ambiguity without clearing it', () => {
    const plan = planLegacyMigration({
      ...baseInput,
      index: index([descriptor(), descriptor({ id: 'second-legacy' })]),
    });
    expect(plan.status).toBe('retained');
    expect(plan.message).toMatch(/found 2/i);
  });

  it('retains an unreadable or invalid legacy draft with a recoverable message', () => {
    const invalid = planLegacyMigration({
      ...baseInput,
      legacyRawJson: '{"schemaVersion":9}',
    });
    expect(invalid.status).toBe('retained');
    expect(invalid.message).toMatch(/not a valid review batch/i);
    const unreadable = planLegacyMigration({
      ...baseInput,
      legacyRawJson: 'not json',
    });
    expect(unreadable.status).toBe('retained');
    expect(unreadable.message).toMatch(/not a valid review batch/i);
  });

  it('does nothing without a legacy draft or when a scoped draft already exists', () => {
    expect(planLegacyMigration({ ...baseInput, legacyRawJson: null })).toEqual({
      status: 'none',
    });
    expect(
      planLegacyMigration({
        ...baseInput,
        hasScopedDraft: (sourceId) => sourceId === 'dark-fortress-legacy',
      })
    ).toEqual({ status: 'none' });
  });
});
