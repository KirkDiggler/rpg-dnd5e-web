import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  validateVisualAssetCatalog,
  validateVisualAssetProviderLock,
  verifyCatalogProvenance,
  VisualContractError,
} from './catalogValidation';

const fixtureRoot = resolve(process.cwd(), 'test-fixtures/visual-placement');
const catalogFixture = JSON.parse(
  readFileSync(resolve(fixtureRoot, 'synty-web-assets.contract.json'), 'utf8')
) as Record<string, unknown>;
const lockFixture = JSON.parse(
  readFileSync(resolve(fixtureRoot, 'provider-lock.contract.json'), 'utf8')
) as Record<string, unknown>;
const clone = <T>(value: T): T => structuredClone(value);

describe('safe catalog/provider-lock public contract', () => {
  it('accepts the synthetic exact-two matrix fixture and real aggregate lock', () => {
    const catalog = validateVisualAssetCatalog(catalogFixture);
    expect(catalog.entries).toHaveLength(2);
    expect(
      catalog.entries.every((entry) => entry.path.startsWith('fixture-only/'))
    ).toBe(true);
    expect(
      validateVisualAssetProviderLock(lockFixture).provider.commit
    ).toMatch(/^[a-f0-9]{40}$/);
  });

  const invalidCases: Array<
    [string, (value: Record<string, unknown>) => unknown, string]
  > = [
    [
      'unsupported schema',
      (value) => (value.schemaVersion = 2),
      'unsupported-schema',
    ],
    [
      'wrong unit',
      (value) => (value.lengthUnit = 'meters'),
      'unsupported-schema',
    ],
    [
      'extra sibling entry',
      (value) =>
        (value.entries as unknown[]).push(
          clone((value.entries as unknown[])[0])
        ),
      'invalid-inventory',
    ],
    [
      'nonfinite scale',
      (value) =>
        ((value.entries as Record<string, unknown>[])[0]!.totalScale =
          Number.NaN),
      'invalid-catalog',
    ],
    [
      'floor y correction',
      (value) =>
        ((
          (
            (value.entries as Record<string, unknown>[])[0]!
              .modelPoint as Record<string, unknown>
          ).position as number[]
        )[1] = 0.1),
      'invalid-catalog',
    ],
    [
      'missing hints',
      (value) =>
        delete (value.entries as Record<string, unknown>[])[0]!.authoringHints,
      'invalid-catalog',
    ],
  ];

  it.each(invalidCases)('fails %s deterministically', (_name, mutate, code) => {
    const value = clone(catalogFixture);
    mutate(value);
    try {
      validateVisualAssetCatalog(value);
      expect.fail('expected validation failure');
    } catch (error) {
      expect(error).toBeInstanceOf(VisualContractError);
      expect((error as VisualContractError).code).toBe(code);
    }
  });

  it('rejects branch/web SHA provenance and catalog digest drift', () => {
    const invalid = clone(lockFixture);
    (invalid.provider as Record<string, unknown>).branch = 'main';
    expect(() => validateVisualAssetProviderLock(invalid)).toThrow(
      VisualContractError
    );

    const lock = validateVisualAssetProviderLock(lockFixture);
    expect(() =>
      verifyCatalogProvenance(lock, {
        sha256: '3'.repeat(64),
        schemaVersion: 1,
        catalogId: 'synty-web-assets',
        toolName: 'build_web_asset_catalog',
        toolVersion: 'fixture-only',
      })
    ).toThrowError(expect.objectContaining({ code: 'provenance-mismatch' }));
  });

  it('binds the checked-in safe production catalog to the exact aggregate lock within budget', () => {
    const catalogPath = resolve(
      process.cwd(),
      'src/rendering/visualPlacement/synty-web-assets.json'
    );
    const lockPath = resolve(
      process.cwd(),
      'src/rendering/visualPlacement/provider-lock.json'
    );
    const bytes = readFileSync(catalogPath);
    const lock = validateVisualAssetProviderLock(
      JSON.parse(readFileSync(lockPath, 'utf8'))
    );
    const catalog = validateVisualAssetCatalog(JSON.parse(bytes.toString()));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      lock.catalog.sha256
    );
    expect(catalog.tool).toEqual({
      name: 'build_web_asset_catalog',
      version: '1.0.0',
    });
    expect(
      statSync(catalogPath).size + statSync(lockPath).size
    ).toBeLessThanOrEqual(8 * 1024);
    expect(JSON.stringify(lock)).not.toMatch(/branch|webSha|files\s*:/);
  });
});
