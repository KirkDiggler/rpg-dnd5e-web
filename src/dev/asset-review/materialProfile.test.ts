import { describe, expect, it } from 'vitest';
import {
  parseMaterialProfile,
  parseMaterialReviewManifest,
  selectFamilyOption,
  serializeMaterialProfile,
} from './materialProfile';
import capabilities from './materialReviewCapabilities.json';

import {
  auditedMaterialManifestFixture,
  materialManifestFixture,
} from './materialProfile.testFixtures';

describe('material profile contract', () => {
  it.each(capabilities.manifestVersions)(
    'parses the advertised manifest version %s',
    (version) => {
      const fixtures: Record<number, unknown> = {
        1: materialManifestFixture(),
        2: auditedMaterialManifestFixture(),
      };
      expect(parseMaterialReviewManifest(fixtures[version]).schemaVersion).toBe(
        version
      );
    }
  );
  it('accepts explicit blocked coverage but rejects previews from unresolved sources', () => {
    const manifest = parseMaterialReviewManifest(
      auditedMaterialManifestFixture(true)
    );
    expect(manifest.previews).toEqual([]);
    const broken = auditedMaterialManifestFixture(true);
    broken.previews = materialManifestFixture().previews;
    expect(() => parseMaterialReviewManifest(broken)).toThrow(/unresolved/);
    const incomplete = auditedMaterialManifestFixture();
    incomplete.previews = [];
    expect(() => parseMaterialReviewManifest(incomplete)).toThrow(/no preview/);
    const wrongHash = auditedMaterialManifestFixture();
    wrongHash.sourceAudit.exceptions[0]!.sourceSha256 = 'b'.repeat(64);
    expect(() => parseMaterialReviewManifest(wrongHash)).toThrow(/fingerprint/);
    const wrongCount = auditedMaterialManifestFixture();
    wrongCount.sourceAudit.verifiedCount = 2;
    expect(() => parseMaterialReviewManifest(wrongCount)).toThrow(/count/);
  });
  it('keeps recommendations separate from choices and round-trips the exact editable schema', () => {
    const manifest = parseMaterialReviewManifest(materialManifestFixture());
    expect(manifest.profile.selections.Stone).toBeNull();
    const selected = selectFamilyOption(
      manifest.profile,
      manifest,
      'Stone',
      'stone-dark'
    );
    expect(
      parseMaterialProfile(JSON.parse(serializeMaterialProfile(selected)))
    ).toEqual({
      schemaVersion: 1,
      profileId: 'review',
      packSlug: 'fixture-pack',
      packVersion: 'v1',
      selections: { Stone: 'stone-dark' },
    });
    expect(manifest.profile.selections.Stone).toBeNull();
  });
  it('refuses unknown family/options, wrong packs and approval switches', () => {
    const manifest = parseMaterialReviewManifest(materialManifestFixture());
    expect(() =>
      selectFamilyOption(manifest.profile, manifest, 'Foreign', 'stone-light')
    ).toThrow();
    expect(() =>
      selectFamilyOption(manifest.profile, manifest, 'Stone', 'foreign')
    ).toThrow();
    expect(() =>
      selectFamilyOption(
        { ...manifest.profile, packVersion: 'v2' },
        manifest,
        'Stone',
        null
      )
    ).toThrow();
    expect(() =>
      parseMaterialProfile({ ...manifest.profile, trusted: true })
    ).toThrow();
  });
  it('refuses duplicate identities, escaping URLs and incomplete previews', () => {
    const duplicate = materialManifestFixture();
    duplicate.catalog.families.push(duplicate.catalog.families[0]!);
    expect(() => parseMaterialReviewManifest(duplicate)).toThrow();
    const escaping = materialManifestFixture();
    escaping.previews[0]!.url = 'https://example.com/model.glb';
    expect(() => parseMaterialReviewManifest(escaping)).toThrow();
    const missing = materialManifestFixture();
    missing.previews = [];
    expect(() => parseMaterialReviewManifest(missing)).toThrow();
    const objects = materialManifestFixture();
    objects.previews[0]!.objectNames = ['NotTheSourceObject'];
    expect(() => parseMaterialReviewManifest(objects)).toThrow();
    const pack = materialManifestFixture();
    pack.catalog.packSlug = 'wrong';
    expect(() => parseMaterialReviewManifest(pack)).toThrow();
  });
});
