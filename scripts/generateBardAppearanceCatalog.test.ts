// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const providerRoot = process.env.RPG_GAME_ASSETS_PATH;
const describeProvider = providerRoot ? describe : describe.skip;
const temporary: string[] = [];

const EXPECTED_BARD_ROWS = {
  dwarf: [
    '128e78dd9973dba9404ff3b1204f9937f6cc2ab4116ab152f1c914bab7d73688',
    '01-a',
  ],
  elf: [
    '2636f6131910b07cd0ef3915e2834709e92a5c64151496c0ae970edcc879bdd8',
    '01-a',
  ],
  gnome: [
    '989bc26ebaf1cd82a27a8a9130e5c415d3b6fc14b72eec580c7a7a451b0d7136',
    '01-a',
  ],
  'half-elf': [
    '0173a9d5a366f2f5d67da23d8925ad80f055651420c1be9cf02c968c9b71436b',
    '01-a',
  ],
  halfling: [
    '196075978e2b2fce8ac14e8dc8612fe4d12c0d1cc3c3a8066c23685fc00565b6',
    '01-a',
  ],
  'half-orc': [
    '1b4cc33d3b858122229842802c39ebabe3e0a0658fd8dd9e612f2514ac765bce',
    '01-a-half-orc-olive-40',
  ],
  human: [
    '767de0dde82ae92605239b183ed510ad3523aa132781c070b702844478a84832',
    '01-a',
  ],
  tiefling: [
    '2f2d75034b3604e607ed315b8604151e98c1c4ee1e4fa642509ff3f8f10eda28',
    '02-a-tiefling-crimson',
  ],
} as const;

afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true });
});

describe('Bard appearance catalog module', () => {
  it('exists independently of the four-class customization generator', () => {
    expect(
      existsSync(new URL('./generateBardAppearanceCatalog.ts', import.meta.url))
    ).toBe(true);
  });
});

describeProvider('Bard appearance catalog generator', () => {
  async function generator() {
    return import('./generateBardAppearanceCatalog');
  }

  it('projects exactly the approved eight additive manifest rows', async () => {
    const { projectBardAppearanceManifest } = await generator();
    const manifest = JSON.parse(
      readFileSync(
        join(
          providerRoot!,
          'harness/models/synty/characters/race-class/manifest.json'
        ),
        'utf8'
      )
    );

    const catalog = projectBardAppearanceManifest(manifest);

    expect(catalog.raceOrder).toEqual(Object.keys(EXPECTED_BARD_ROWS));
    expect(Object.keys(catalog.appearances)).toEqual(catalog.raceOrder);
    for (const [raceRef, [sha256, defaultPalette]] of Object.entries(
      EXPECTED_BARD_ROWS
    )) {
      expect(catalog.appearances[raceRef]).toEqual({
        combination: `${raceRef}:bard`,
        raceRef: `dnd5e:races:${raceRef}`,
        classRef: 'dnd5e:classes:bard',
        url: `/models/synty/characters/race-class/${raceRef}-bard.glb`,
        sha256,
        rigFamily: 'modular-fantasy-hero-v1',
        boneCount: 63,
        animations: ['Idle_Relaxed', 'Walk_Forward'],
        defaultPalette,
      });
    }
  });

  it('generates deterministic source pinned to the merged provider and manifest', async () => {
    const { generateBardAppearanceCatalog } = await generator();
    const root = mkdtempSync(join(tmpdir(), 'bard-appearance-catalog-'));
    temporary.push(root);
    const first = join(root, 'first.ts');
    const second = join(root, 'second.ts');

    const firstReceipt = generateBardAppearanceCatalog({
      providerRoot: providerRoot!,
      outputPath: first,
    });
    const secondReceipt = generateBardAppearanceCatalog({
      providerRoot: providerRoot!,
      outputPath: second,
    });

    expect(firstReceipt).toEqual({
      providerCommit: '37c13c68b6cfc87ad6684351f934b4ff1fd83515',
      manifestSha256:
        '6a0cf1fb99389c8b66ce34dbb60943d88af98f2181bfc28646deffe7260460eb',
      appearanceCount: 8,
    });
    expect(secondReceipt).toEqual(firstReceipt);
    expect(readFileSync(second)).toEqual(readFileSync(first));
    const source = readFileSync(first, 'utf8');
    expect(source).toContain('BARD_APPEARANCE_CATALOG');
    expect(source).toContain(firstReceipt.providerCommit);
    expect(source).toContain(firstReceipt.manifestSha256);
    expect(source).not.toMatch(/\/home\/|harness\/models\/|\.fbx|\.blend/i);
  });
});
