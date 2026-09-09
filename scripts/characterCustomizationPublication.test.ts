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
const legacySnapshot = JSON.parse(
  readFileSync(
    new URL(
      './fixtures/legacy-four-class-customization-snapshot.json',
      import.meta.url
    ),
    'utf8'
  )
) as {
  provider: typeof CHARACTER_CUSTOMIZATION_PROVIDER;
  catalogSha256: string;
  classOrder: string[];
  referenceCount: number;
  dwarf: (typeof CHARACTER_CUSTOMIZATION_CATALOG.profiles)['dwarf'];
};

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

function outfitAssets() {
  return Object.values(CHARACTER_CUSTOMIZATION_CATALOG.outfits).map(
    (outfit) => ({ url: outfit.maskUrl, sha256: outfit.maskSha256 })
  );
}

describe('aggregate production character customization publication', () => {
  it('retains the exact historical four-class publication receipt', () => {
    expect(legacySnapshot).toMatchObject({
      provider: {
        providerCommit: '37c13c68b6cfc87ad6684351f934b4ff1fd83515',
        aggregateManifestSha256:
          '2457ee61b15cb0ef1ca8cd9b42bc30d84d5286510f91e44d8437a6efbc80efac',
        outfitManifestSha256:
          '12a0656f83de0501d8aaa1c26201fc43e3a3fe999e64eb7bb88f4bf1c94581d2',
      },
      catalogSha256:
        '80328c8b8524301f4b44a73f19267ba02e8d35ecad5775dc37a2501fe8a8cefa',
      classOrder: ['barbarian', 'fighter', 'monk', 'rogue'],
      referenceCount: 964,
    });
  });

  it('publishes one internally consistent current generated authority', () => {
    expect(CHARACTER_CUSTOMIZATION_PROVIDER.providerCommit).toMatch(
      /^[0-9a-f]{40}$/
    );
    expect(CHARACTER_CUSTOMIZATION_PROVIDER.aggregateManifestSha256).toMatch(
      /^[0-9a-f]{64}$/
    );
    expect(CHARACTER_CUSTOMIZATION_PROVIDER.outfitManifestSha256).toMatch(
      /^[0-9a-f]{64}$/
    );
    expect(sha256(readFileSync(catalogUrl))).toMatch(/^[0-9a-f]{64}$/);
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

  it('preserves the entire historical four-class Dwarf projection', () => {
    const dwarf = CHARACTER_CUSTOMIZATION_CATALOG.profiles.dwarf;
    const historicalProjection = {
      ...dwarf,
      bodies: Object.fromEntries(
        legacySnapshot.classOrder.map((classRef) => [
          classRef,
          dwarf.bodies[classRef],
        ])
      ),
    };
    expect(historicalProjection).toEqual(legacySnapshot.dwarf);
    expect(historicalProjection.bodies).toEqual(
      DWARF_CUSTOMIZATION_CATALOG.bodies
    );
  });

  it('binds every declaration-derived body/style/mask reference to zero or all ignored bytes', () => {
    const assets = [...profileAssets(), ...outfitAssets()];
    const classOrder = Object.keys(CHARACTER_CUSTOMIZATION_CATALOG.outfits);
    const expectedCount = CHARACTER_CUSTOMIZATION_CATALOG.profileOrder.reduce(
      (count, raceRef) => {
        const profile = CHARACTER_CUSTOMIZATION_CATALOG.profiles[raceRef];
        return (
          count +
          classOrder.length * 2 +
          profile.slots.scalp.options.length * 2 +
          profile.slots.facialHair.options.length * 2
        );
      },
      classOrder.length
    );
    expect(assets).toHaveLength(expectedCount);
    expect(new Set(assets.map((asset) => asset.url))).toHaveLength(
      expectedCount
    );
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
    const ignored = execFileSync(
      'git',
      ['check-ignore', '--no-index', '--stdin'],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        input: assets.map((asset) => publicFile(asset.url)).join('\n') + '\n',
      }
    )
      .trim()
      .split('\n');
    expect(ignored).toHaveLength(assets.length);
  });

  it('publishes exact defaults and declaration-derived class outfits', () => {
    const classOrder = Object.keys(CHARACTER_CUSTOMIZATION_CATALOG.outfits);
    expect(classOrder.length).toBeGreaterThan(0);
    expect(new Set(classOrder).size).toBe(classOrder.length);
    expect(classOrder).toEqual(
      expect.arrayContaining(legacySnapshot.classOrder)
    );
    for (const raceRef of CHARACTER_CUSTOMIZATION_CATALOG.profileOrder) {
      const profile = CHARACTER_CUSTOMIZATION_CATALOG.profiles[raceRef];
      expect(Object.keys(profile.bodies)).toEqual(classOrder);
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
    expect(CHARACTER_CUSTOMIZATION_CATALOG.outfits.fighter).toMatchObject({
      classRef: 'fighter',
      outfit: '16',
      maskUrl:
        '/models/synty/characters/outfit-customization/v1/masks/fighter-16.png',
      defaultPrimaryColorSrgb: 0x49667e,
      defaultSecondaryColorSrgb: 0xd1a44c,
      meshNames: expect.arrayContaining(['Chr_Torso_Male_16']),
    });
  });
});
