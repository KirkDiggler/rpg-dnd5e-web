import { describe, expect, it } from 'vitest';
import {
  parseMaterialProfile,
  parseMaterialReviewManifest,
  selectFamilyOption,
  serializeMaterialProfile,
} from './materialProfile';

import { materialManifestFixture } from './materialProfile.testFixtures';

describe('material profile contract', () => {
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
