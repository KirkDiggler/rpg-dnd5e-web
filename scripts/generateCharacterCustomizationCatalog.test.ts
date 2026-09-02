// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
const moduleUrl = new URL(
  './generateCharacterCustomizationCatalog.ts',
  import.meta.url
);
const providerRoot = process.env.RPG_GAME_ASSETS_PATH;
const describeProvider =
  providerRoot && existsSync(moduleUrl) ? describe : describe.skip;
const temporary: string[] = [];

interface MutableProfileManifest {
  slots: { 'facial-hair': { defaultSelection: unknown } };
}

interface MutableAggregateManifest {
  profiles: Record<string, unknown>;
}

afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true });
});

function providerJson(relative: string): unknown {
  return JSON.parse(readFileSync(join(providerRoot!, relative), 'utf8'));
}

function exactProviderAuthority() {
  const aggregate = providerJson(
    'harness/models/synty/characters/customization/manifest.json'
  ) as {
    profileOrder: string[];
    profiles: Record<string, { manifest: string }>;
  };
  const manifests = Object.fromEntries(
    aggregate.profileOrder.map((raceRef) => [
      raceRef,
      providerJson(aggregate.profiles[raceRef].manifest),
    ])
  );
  return { aggregate, manifests };
}

describe('aggregate character customization catalog module', () => {
  it('exists before profile-driven generation can run', () => {
    expect(existsSync(moduleUrl)).toBe(true);
  });
});

describeProvider('aggregate character customization catalog generator', () => {
  async function generator() {
    return import('./generateCharacterCustomizationCatalog');
  }

  it('normalizes exact schema-v2 Dwarf and seven schema-v3 profiles in provider order', async () => {
    const { projectCharacterCustomizationAuthority } = await generator();
    const { aggregate, manifests } = exactProviderAuthority();

    const catalog = projectCharacterCustomizationAuthority(
      aggregate,
      manifests
    );

    expect(catalog.profileOrder).toEqual([
      'human',
      'elf',
      'dwarf',
      'half-elf',
      'tiefling',
      'halfling',
      'gnome',
      'half-orc',
    ]);
    expect(Object.keys(catalog.profiles)).toEqual(catalog.profileOrder);
    expect(catalog.profiles.human.defaults).toMatchObject({
      scalp: { kind: 'style', styleRef: 'modular-fantasy-hero:hair:16' },
      facialHair: { kind: 'none' },
    });
    expect(catalog.profiles.dwarf.defaults).toMatchObject({
      scalp: { kind: 'style', styleRef: 'modular-fantasy-hero:hair:04' },
      facialHair: {
        kind: 'style',
        styleRef: 'modular-fantasy-hero:facial-hair:02',
      },
    });
    expect(catalog.profiles.tiefling.defaults.scalp).toEqual({
      kind: 'style',
      styleRef: 'modular-fantasy-hero:hair:03',
    });
    expect(catalog.profiles['half-orc'].defaults.scalp).toEqual({
      kind: 'style',
      styleRef: 'modular-fantasy-hero:hair:08',
    });
    for (const profile of Object.values(catalog.profiles)) {
      expect(Object.keys(profile.bodies)).toEqual([
        'barbarian',
        'fighter',
        'monk',
        'rogue',
      ]);
      expect(profile.slots.scalp.options).toHaveLength(38);
      expect(profile.slots.facialHair.options).toHaveLength(18);
    }
  });

  it('rejects an ambiguous none default and an incomplete aggregate before rendering source', async () => {
    const { projectCharacterCustomizationAuthority } = await generator();
    const { aggregate, manifests } = exactProviderAuthority();
    const invalidManifests = structuredClone(manifests);
    const human = invalidManifests.human as MutableProfileManifest;
    human.slots['facial-hair'].defaultSelection = {
      kind: 'style',
      styleRef: '',
    };
    expect(() =>
      projectCharacterCustomizationAuthority(aggregate, invalidManifests)
    ).toThrow(/defaultSelection|styleRef/);

    const incomplete = structuredClone(aggregate) as MutableAggregateManifest;
    delete incomplete.profiles.gnome;
    expect(() =>
      projectCharacterCustomizationAuthority(incomplete, manifests)
    ).toThrow(/profiles|gnome/);
  });

  it('generates one deterministic module pinned to exact merged provider bytes', async () => {
    const { generateCharacterCustomizationCatalog } = await generator();
    const root = mkdtempSync(join(tmpdir(), 'all-race-catalog-'));
    temporary.push(root);
    const first = join(root, 'first.ts');
    const second = join(root, 'second.ts');

    const firstReceipt = generateCharacterCustomizationCatalog({
      providerRoot: providerRoot!,
      outputPath: first,
    });
    const secondReceipt = generateCharacterCustomizationCatalog({
      providerRoot: providerRoot!,
      outputPath: second,
    });

    expect(firstReceipt).toEqual({
      providerCommit: '0c837a801d97c98e50a336fb07e3b50d08d54df1',
      aggregateManifestSha256:
        '2457ee61b15cb0ef1ca8cd9b42bc30d84d5286510f91e44d8437a6efbc80efac',
      profileCount: 8,
      bodyCount: 32,
      accessoryCount: 448,
      thumbnailCount: 448,
      sourceAssetCount: 969,
    });
    expect(secondReceipt).toEqual(firstReceipt);
    expect(readFileSync(second)).toEqual(readFileSync(first));
    const source = readFileSync(first, 'utf8');
    expect(source).toContain('CHARACTER_CUSTOMIZATION_CATALOG');
    expect(source).toContain(firstReceipt.providerCommit);
    expect(source).toContain(firstReceipt.aggregateManifestSha256);
    expect(source).not.toMatch(/\/home\/|harness\/models\/|\.fbx|\.blend/i);
  });
});
