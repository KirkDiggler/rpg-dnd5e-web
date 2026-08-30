// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const evidenceRoot = new URL(
  '../docs/evidence/869-halfling-gnome-classes/',
  import.meta.url
);
const receiptUrl = new URL('receipt.json', evidenceRoot);
const readmeUrl = new URL('README.md', evidenceRoot);
const resolverSource = readFileSync(
  new URL(
    '../src/components/hex-grid/classCharacterModels.ts',
    import.meta.url
  ),
  'utf8'
);

const expectedCombinations = {
  'dwarf:barbarian': {
    modelUrl: '/models/synty/characters/race-class/dwarf-barbarian.glb',
    sha256: 'dfd29de0d5a3611f6e92b88e7f706587ef705b332f0a8a949ee23919396a9a7f',
  },
  'dwarf:fighter': {
    modelUrl: '/models/synty/characters/race-class/dwarf-fighter.glb',
    sha256: '7e1c611b5b5e02a709e75ed71deeccdc30242e0716da469adc2ddaa559068224',
  },
  'dwarf:monk': {
    modelUrl: '/models/synty/characters/race-class/dwarf-monk.glb',
    sha256: 'e44a953e0678b029a379822a0593b21111fb7052c18152750ded94eed7086247',
  },
  'dwarf:rogue': {
    modelUrl: '/models/synty/characters/race-class/dwarf-rogue.glb',
    sha256: 'a6de5c8247d8fdd8eae3888ee10faa9eddb73b624be92e81c25993b24063cfe7',
  },
  'halfling:barbarian': {
    modelUrl: '/models/synty/characters/race-class/halfling-barbarian.glb',
    sha256: '4bec886592680bffa6534aac726fd1477451b30b8429bffcfa330a27751a3b70',
  },
  'halfling:fighter': {
    modelUrl: '/models/synty/characters/race-class/halfling-fighter.glb',
    sha256: '74232e1eca2149752722d6ed14c482b4e69cc7551c835fbe84ba681c3de685d1',
  },
  'halfling:monk': {
    modelUrl: '/models/synty/characters/race-class/halfling-monk.glb',
    sha256: 'c06d21673cb573ac7edc9b71a31dda613e0ad2192a8ecbb73da3b1d94d0694ae',
  },
  'halfling:rogue': {
    modelUrl: '/models/synty/characters/race-class/halfling-rogue.glb',
    sha256: '8b5020f2b225544033dce772a201f8914f2eb03b8d45383e6dbd535e5ea3d981',
  },
  'gnome:barbarian': {
    modelUrl: '/models/synty/characters/race-class/gnome-barbarian.glb',
    sha256: 'b95342c60e335f4138b5de3a18a554c49156ae57fb08654e7d874a432a905d58',
  },
  'gnome:fighter': {
    modelUrl: '/models/synty/characters/race-class/gnome-fighter.glb',
    sha256: 'f60688fb49f7dbcf25787c6b1b6da56477367fe134b90371e4ce0089dd926e3c',
  },
  'gnome:monk': {
    modelUrl: '/models/synty/characters/race-class/gnome-monk.glb',
    sha256: '75b267f3e9ed9bb7dd73433c99009f4ee9ea664d367afb4e9242949a747f9d60',
  },
  'gnome:rogue': {
    modelUrl: '/models/synty/characters/race-class/gnome-rogue.glb',
    sha256: 'e5a83d2c8ebdf33f27763cb5e8032dfb53175b5d7fb43dace17c61c83ec1bb0e',
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

describe('modular Halfling, Gnome, and refreshed Dwarf publication', () => {
  it('pins the exact merged provider, generated contracts, and all changed outputs', () => {
    const receipt = loadReceipt();
    expect(receipt.providerCommit).toBe(
      '03aae3bf60893ec7a948aa6794a03179fbfaaec6'
    );
    expect(receipt.providerManifestSha256).toBe(
      'da5b72d7d5df08271478c47b58a4a5eafd1dfda4a86115a87e212ce21cd7a935'
    );
    expect(receipt.providerInventorySha256).toBe(
      '1a9c18e8a071cd7b9657680010b75c76d24b9a0b25caf8122d0899b90bdaf998'
    );
    expect(receipt.combinations).toEqual(expectedCombinations);
    expect(receipt.rigFamily).toBe('modular-fantasy-hero-v1');
    expect(receipt.socketProfile).toBe('modular-fantasy-hero-main-hand-v1');
  });

  it('binds the reviewed fixed identities and derived arm clearances', () => {
    const receipt = loadReceipt();
    expect(receipt.identities).toEqual({
      dwarf: {
        head: 'Chr_Head_Male_00',
        ears: 'Chr_Ear_Ear_01',
        hair: 'Chr_Hair_04',
        facialHair: 'Chr_FacialHair_Male_02',
        proportions: [1.08, 0.78, 1.08],
      },
      halfling: {
        head: 'Chr_Head_Male_00',
        ears: 'Chr_Ear_Ear_01',
        hair: 'Chr_Hair_16',
        proportions: [0.84, 0.52, 0.84],
      },
      gnome: {
        head: 'Chr_Head_Male_00',
        ears: 'Chr_Ear_Ear_01',
        hair: 'Chr_Hair_16',
        proportions: [0.76, 0.64, 0.76],
      },
    });
    expect(receipt.armContract).toEqual({
      method: 'tpose-x-scale-v1',
      derivation: 'vertical-over-radial',
      fingertipMinusKneeMeters: {
        previousDwarf: -0.094966,
        refreshedDwarf: 0.132184,
        halfling: 0.085533,
        gnome: 0.11116,
      },
    });
  });

  it('keeps the eight new resolver entries on the shared modular rig family', () => {
    for (const [key, facts] of Object.entries(expectedCombinations)) {
      if (key.startsWith('dwarf:')) continue;
      expect(resolverSource).toContain(`'${key}'`);
      expect(resolverSource).toContain(
        `model: '${facts.modelUrl.replace('/models/synty/characters/', '')}'`
      );
    }
  });

  it('keeps canonical weapons full size and licensed provider bytes ignored', () => {
    const receipt = loadReceipt();
    expect(receipt.weapons).toEqual({
      canonicalFullSize: true,
      raceSpecificScaling: false,
      hashes: {
        greataxe:
          '39c08c15e778c1f1c915478001204f218382c47cad3c1306626784f7ca398bb7',
        greatsword:
          '600d83e67e47ff461efc94c43bde39e09139c3778ec82cfd86d47e03fb26eea1',
        shortsword:
          'ee5f39b67f7d77df01a9425c5a2a371603eff83138d236ba5049033a7dc4ce9b',
        rapier:
          '3318941a7dcfcd37256a289d234529da6279976e286734ba10b2dd41dee6c96f',
      },
    });
    const gitignore = readFileSync(
      new URL('../.gitignore', import.meta.url),
      'utf8'
    );
    expect(gitignore).toContain('public/models/synty/');
  });

  it('records the real-route review without private paths', () => {
    expect(existsSync(readmeUrl)).toBe(true);
    if (!existsSync(readmeUrl)) return;
    const readme = readFileSync(readmeUrl, 'utf8');
    expect(readme).toContain('Halfling');
    expect(readme).toContain('Gnome');
    expect(readme).toContain('Dwarf');
    expect(readme).toContain('they look great now');
    expect(readme).not.toMatch(/\/home\/|\/tmp\/|Downloads\/synty/);
  });
});
