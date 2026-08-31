// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const evidenceRoot = new URL(
  '../docs/evidence/871-half-orc-classes/',
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
  'half-orc:barbarian': {
    modelUrl: '/models/synty/characters/race-class/half-orc-barbarian.glb',
    sha256: 'a59e6cf665da6805968a5112250f49aff16da5f9769de1fb48d16fd889ea09f5',
  },
  'half-orc:fighter': {
    modelUrl: '/models/synty/characters/race-class/half-orc-fighter.glb',
    sha256: '2ffcb8d7acf9b0c91fa2075f8a53bcd0be42e05146d3b6b6663dad8eeaf11c12',
  },
  'half-orc:monk': {
    modelUrl: '/models/synty/characters/race-class/half-orc-monk.glb',
    sha256: '2d344f5b2f3c1da9e6a643821fc210e939db9f4d17a5f3f48e54cbda7ed57b9f',
  },
  'half-orc:rogue': {
    modelUrl: '/models/synty/characters/race-class/half-orc-rogue.glb',
    sha256: '82dd6fb1bcb5e054c268d3648ba223a3a41f4538bf83cdb72750b05d24824048',
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

describe('modular Half-Orc publication', () => {
  it('pins the exact merged provider and all four outputs', () => {
    const receipt = loadReceipt();
    expect(receipt.providerCommit).toBe(
      'fa908b7990de37630606b4117d4dbe08270768b8'
    );
    expect(receipt.providerManifestSha256).toBe(
      '7fd139faceafe55cad9c67add23645e68c2c228034809640f3e8bf7e44424aeb'
    );
    expect(receipt.providerInventorySha256).toBe(
      '51ca72cae606d0d2e37e5b58a76e28dfb8b69a03d0fb5c9d7f580334f451daef'
    );
    expect(receipt.combinations).toEqual(expectedCombinations);
    expect(receipt.rigFamily).toBe('modular-fantasy-hero-v1');
    expect(receipt.socketProfile).toBe('modular-fantasy-hero-main-hand-v1');
  });

  it('binds the approved native identity and human-forward palette', () => {
    const receipt = loadReceipt();
    expect(receipt.identity).toEqual({
      head: 'Chr_Head_Male_03',
      ears: 'Chr_Ear_Ear_02',
      hair: 'Chr_Hair_08',
      proportions: [1.08, 1.05, 1.08],
    });
    expect(receipt.halfOrcPalette).toEqual({
      key: '01-a-half-orc-olive-40',
      sourceSha256:
        '7f84972790e530f8d83b378eb95f3151e2664c7b4ac23b1d125a55e1efcecd62',
      derivedSha256:
        'ef5e37f511a20f94844b729bac2bfb2a0f2341be22da8dcc3e0801d325f15791',
      changedPixelCount: 247941,
      monsterGeometryUsed: false,
    });
    expect(receipt.armContract).toEqual({
      method: 'tpose-x-scale-v1',
      derivation: 'vertical-over-radial',
      factor: 1.05 / 1.08,
    });
  });

  it('keeps all four resolver rows on the shared modular rig family', () => {
    for (const [key, facts] of Object.entries(expectedCombinations)) {
      expect(resolverSource).toContain(`'${key}'`);
      expect(resolverSource).toContain(
        `model: '${facts.modelUrl.replace('/models/synty/characters/', '')}'`
      );
    }
  });

  it('keeps canonical weapons full size and provider bytes ignored', () => {
    const receipt = loadReceipt();
    expect(receipt.weapons).toEqual({
      canonicalFullSize: true,
      raceSpecificScaling: false,
      mainHands: {
        barbarian: 'dnd5e:item:greataxe',
        fighter: 'dnd5e:item:greatsword',
        monk: 'dnd5e:item:shortsword',
        rogue: 'dnd5e:item:rapier',
      },
    });
    const gitignore = readFileSync(
      new URL('../.gitignore', import.meta.url),
      'utf8'
    );
    expect(gitignore).toContain('public/models/synty/');
  });

  it('records the approved and real-route review without private paths', () => {
    expect(existsSync(readmeUrl)).toBe(true);
    if (!existsSync(readmeUrl)) return;
    const readme = readFileSync(readmeUrl, 'utf8');
    expect(readme).toContain('Half-Orc');
    expect(readme).toContain('40% olive looks like the keeper');
    expect(readme).toContain('not monster');
    expect(readme).not.toMatch(/\/home\/|\/tmp\/|Downloads\/synty/);
  });
});
