// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CHARACTER_CUSTOMIZATION_CATALOG,
  CHARACTER_CUSTOMIZATION_PROVIDER,
} from '../src/generated/characterCustomizationCatalog';
import { DWARF_CUSTOMIZATION_CATALOG } from '../src/generated/dwarfCustomizationCatalog';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const catalogUrl = new URL(
  '../src/generated/characterCustomizationCatalog.ts',
  import.meta.url
);

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function publicFile(publicUrl: string): string {
  expect(publicUrl).toMatch(/^\/models\/synty\//);
  return fileURLToPath(new URL(`../public${publicUrl}`, import.meta.url));
}

function profileAssets() {
  return CHARACTER_CUSTOMIZATION_CATALOG.profileOrder.flatMap((raceRef) => {
    const profile = CHARACTER_CUSTOMIZATION_CATALOG.profiles[raceRef];
    return [
      ...Object.values(profile.bodies).flatMap((body) => [
        { url: body.url, sha256: body.sha256 },
        { url: body.fallbackUrl, sha256: body.fallbackSha256 },
      ]),
      ...profile.slots.scalp.options.flatMap((style) => [
        { url: style.url, sha256: style.sha256 },
        { url: style.thumbnailUrl, sha256: style.thumbnailSha256 },
      ]),
      ...profile.slots.facialHair.options.flatMap((style) => [
        { url: style.url, sha256: style.sha256 },
        { url: style.thumbnailUrl, sha256: style.thumbnailSha256 },
      ]),
    ];
  });
}

describe('aggregate production character customization publication', () => {
  it('pins the exact merged provider and generated aggregate authority', () => {
    expect(CHARACTER_CUSTOMIZATION_PROVIDER).toEqual({
      providerCommit: '0c837a801d97c98e50a336fb07e3b50d08d54df1',
      aggregateManifestSha256:
        '2457ee61b15cb0ef1ca8cd9b42bc30d84d5286510f91e44d8437a6efbc80efac',
    });
    expect(sha256(readFileSync(catalogUrl))).toBe(
      '6f56f8fb80575601a12fc5f9ff528c1ae9f1f12154cdfb9ed162c757dfdc10af'
    );
    expect(CHARACTER_CUSTOMIZATION_CATALOG.profileOrder).toEqual([
      'human',
      'elf',
      'dwarf',
      'half-elf',
      'tiefling',
      'halfling',
      'gnome',
      'half-orc',
    ]);
    expect(Object.keys(CHARACTER_CUSTOMIZATION_CATALOG.profiles)).toEqual(
      CHARACTER_CUSTOMIZATION_CATALOG.profileOrder
    );
  });

  it('normalizes immutable Dwarf without changing any body/style/runtime bytes', () => {
    const dwarf = CHARACTER_CUSTOMIZATION_CATALOG.profiles.dwarf;
    expect(dwarf.schemaVersion).toBe(2);
    expect(dwarf.profileRef).toBe(DWARF_CUSTOMIZATION_CATALOG.profileRef);
    expect(dwarf.proportions).toEqual(DWARF_CUSTOMIZATION_CATALOG.proportions);
    expect(dwarf.skeleton).toEqual(DWARF_CUSTOMIZATION_CATALOG.skeleton);
    expect(dwarf.bodies).toEqual(DWARF_CUSTOMIZATION_CATALOG.bodies);
    expect(dwarf.slots.scalp.options).toEqual(
      DWARF_CUSTOMIZATION_CATALOG.slots.scalp.options
    );
    expect(dwarf.slots.facialHair.options).toEqual(
      DWARF_CUSTOMIZATION_CATALOG.slots.facialHair.options
    );
    expect(dwarf.defaults).toEqual({
      scalp: {
        kind: 'style',
        styleRef: DWARF_CUSTOMIZATION_CATALOG.defaults.scalpStyleRef,
      },
      facialHair: {
        kind: 'style',
        styleRef: DWARF_CUSTOMIZATION_CATALOG.defaults.facialHairStyleRef,
      },
      colorSrgb: DWARF_CUSTOMIZATION_CATALOG.defaults.colorSrgb,
      roughness: DWARF_CUSTOMIZATION_CATALOG.defaults.roughness,
      metalness: DWARF_CUSTOMIZATION_CATALOG.defaults.metalness,
    });
  });

  it('binds exactly 960 body/fallback/style/thumbnail references to zero or all ignored bytes', () => {
    const assets = profileAssets();
    expect(assets).toHaveLength(960);
    expect(new Set(assets.map((asset) => asset.url))).toHaveLength(960);
    const present = assets.filter((asset) => existsSync(publicFile(asset.url)));
    const missing = assets.filter(
      (asset) => !existsSync(publicFile(asset.url))
    );
    expect(
      [0, assets.length],
      `partial aggregate customization mirror: present=${present.length} missing=${missing.length}`
    ).toContain(present.length);
    if (process.env.RPG_REQUIRE_SYNCED_CUSTOMIZATION_ASSETS === '1') {
      expect(present).toHaveLength(assets.length);
    }
    for (const asset of present) {
      expect(sha256(readFileSync(publicFile(asset.url))), asset.url).toBe(
        asset.sha256
      );
    }
    expect(
      execFileSync('git', ['ls-files', '--', 'public/models/synty'], {
        cwd: repositoryRoot,
        encoding: 'utf8',
      })
    ).toBe('');
    for (const asset of assets) {
      expect(() =>
        execFileSync(
          'git',
          ['check-ignore', '--quiet', '--no-index', publicFile(asset.url)],
          { cwd: repositoryRoot }
        )
      ).not.toThrow();
    }
  });

  it('publishes exact style-or-none defaults and four classes for every profile', () => {
    for (const raceRef of CHARACTER_CUSTOMIZATION_CATALOG.profileOrder) {
      const profile = CHARACTER_CUSTOMIZATION_CATALOG.profiles[raceRef];
      expect(Object.keys(profile.bodies)).toEqual([
        'barbarian',
        'fighter',
        'monk',
        'rogue',
      ]);
      expect(profile.slots.scalp.options).toHaveLength(38);
      expect(profile.slots.facialHair.options).toHaveLength(18);
      for (const selection of [
        profile.defaults.scalp,
        profile.defaults.facialHair,
      ]) {
        expect(['style', 'none']).toContain(selection.kind);
        if (selection.kind === 'style') {
          expect(selection.styleRef).not.toMatch(/[\\/]|:\/\//);
        }
      }
    }
    expect(
      CHARACTER_CUSTOMIZATION_CATALOG.profiles.human.defaults
    ).toMatchObject({
      scalp: { kind: 'style', styleRef: 'modular-fantasy-hero:hair:16' },
      facialHair: { kind: 'none' },
    });
  });
});
