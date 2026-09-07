// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CustomizationRaceRef } from '../src/generated/characterCustomizationCatalog';
import { CHARACTER_CUSTOMIZATION_CATALOG } from '../src/generated/characterCustomizationCatalog';

const evidenceRoot = new URL(
  '../docs/evidence/862-halfelf-tiefling-classes/',
  import.meta.url
);
const receiptUrl = new URL('receipt.json', evidenceRoot);
const readmeUrl = new URL('README.md', evidenceRoot);
const expectedCombinations = {
  'half-elf:barbarian': {
    modelUrl: '/models/synty/characters/race-class/half-elf-barbarian.glb',
    sha256: '9dde33258b69ec66bd694f705fcc035d307a388b1518027571f33ffc75b76ca8',
  },
  'half-elf:fighter': {
    modelUrl: '/models/synty/characters/race-class/half-elf-fighter.glb',
    sha256: 'd8a82b5a803a030e6f7c384f93b7a29e0cf288f52c4daa8ebaaec6818f8d639b',
  },
  'half-elf:monk': {
    modelUrl: '/models/synty/characters/race-class/half-elf-monk.glb',
    sha256: 'ba9c7d636ecb06eb0d65ab509d527b27b28b17e534f0cc9861331076eaca6924',
  },
  'half-elf:rogue': {
    modelUrl: '/models/synty/characters/race-class/half-elf-rogue.glb',
    sha256: 'ff8c8a978880afaafa0428a28dae7a027806c4d6931c3ea79107dd51d3687754',
  },
  'tiefling:barbarian': {
    modelUrl: '/models/synty/characters/race-class/tiefling-barbarian.glb',
    sha256: '06e819db490b185fcfa66f5197bab95f632d70297695d216e237b0aa50f884a1',
  },
  'tiefling:fighter': {
    modelUrl: '/models/synty/characters/race-class/tiefling-fighter.glb',
    sha256: 'ebdefbc679fc8d01defe201b890fea0608a96b43215f701c241b34f7281363f7',
  },
  'tiefling:monk': {
    modelUrl: '/models/synty/characters/race-class/tiefling-monk.glb',
    sha256: 'b44a642a305018eefd5276d39ed30ef4f6f6b27ab71795e63a173393a0ee1fa6',
  },
  'tiefling:rogue': {
    modelUrl: '/models/synty/characters/race-class/tiefling-rogue.glb',
    sha256: 'ebb2d827df5906079e808bd78d9904775d3b25143776b0817c08b17f81a98a04',
  },
} as const;

function loadReceipt(): Record<string, unknown> {
  expect(existsSync(receiptUrl)).toBe(true);
  if (!existsSync(receiptUrl)) return {};
  return JSON.parse(readFileSync(receiptUrl, 'utf8')) as Record<
    string,
    unknown
  >;
}

describe('modular Half-Elf and Tiefling publication', () => {
  it('pins the exact merged provider, manifest, crimson atlas, and all eight outputs', () => {
    const receipt = loadReceipt();
    expect(receipt.providerCommit).toBe(
      '7ac84ec04c049cd62ed66e577189b976d59f8db5'
    );
    expect(receipt.providerManifestSha256).toBe(
      '0dc904a1212afa4d328cf8c7f0d715e269c10c7d6e899d539e426f786a390094'
    );
    expect(receipt.tieflingAtlas).toEqual({
      sourceSha256:
        '457eea3ae525036ac05fa1fa6935e5c56e0b63f9166488a7139a5f9c441cfea2',
      derivedSha256:
        '38fcf12eecdcb9075b9a944857eec3c52aefb82b8e2f3f06355c58009a267e67',
      changedPixelCount: 247941,
    });
    expect(receipt.combinations).toEqual(expectedCombinations);
    expect(receipt.socketProfile).toBe('modular-fantasy-hero-main-hand-v1');
  });

  it('keeps all eight historical outputs as exact generated profile fallbacks', () => {
    for (const [key, facts] of Object.entries(expectedCombinations)) {
      const [raceRef, classRef] = key.split(':') as [
        CustomizationRaceRef,
        'barbarian' | 'fighter' | 'monk' | 'rogue',
      ];
      const profile = CHARACTER_CUSTOMIZATION_CATALOG.profiles[raceRef];
      expect(profile.bodies[classRef].fallbackUrl).toBe(facts.modelUrl);
      expect(profile.bodies[classRef].fallbackSha256).toBe(facts.sha256);
      expect(profile.rigFamily).toBe('modular-fantasy-hero-v1');
    }
  });

  it('keeps licensed provider bytes ignored while the receipt pins their hashes', () => {
    const gitignore = readFileSync(
      new URL('../.gitignore', import.meta.url),
      'utf8'
    );
    expect(gitignore).toContain('public/models/synty/');
    expect(
      Object.values(expectedCombinations).map((facts) => facts.sha256)
    ).toEqual(
      Object.values(
        loadReceipt().combinations as typeof expectedCombinations
      ).map((facts) => facts.sha256)
    );
  });

  it('records the real-route review without private paths', () => {
    expect(existsSync(readmeUrl)).toBe(true);
    if (!existsSync(readmeUrl)) return;
    const readme = readFileSync(readmeUrl, 'utf8');
    expect(readme).toContain('Half-Elf');
    expect(readme).toContain('Tiefling');
    expect(readme).toContain('looks great');
    expect(readme).not.toMatch(/\/home\/|\/tmp\/|Downloads\/synty/);
  });
});
