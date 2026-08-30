// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const receiptUrl = new URL(
  '../docs/evidence/858-modular-dwarf-classes/receipt.json',
  import.meta.url
);
const readmeUrl = new URL(
  '../docs/evidence/858-modular-dwarf-classes/README.md',
  import.meta.url
);
const resolverSource = readFileSync(
  new URL(
    '../src/components/hex-grid/classCharacterModels.ts',
    import.meta.url
  ),
  'utf8'
);

function loadReceipt(): Record<string, unknown> {
  expect(existsSync(receiptUrl)).toBe(true);
  if (!existsSync(receiptUrl)) return {};
  return JSON.parse(readFileSync(receiptUrl, 'utf8')) as Record<
    string,
    unknown
  >;
}

describe('modular Dwarf class publication', () => {
  it('pins the exact merged provider and all four output hashes', () => {
    const receipt = loadReceipt();
    expect(receipt.providerCommit).toBe(
      '3c779ebc13409e2169ef2143644495aad66f8f2f'
    );
    expect(receipt.providerManifestSha256).toBe(
      'ba804119ea38b0a6d39acd4a00ab331633ee06eb4d33fe309a7d7d49defe2741'
    );
    expect(receipt.combinations).toEqual({
      'dwarf:barbarian': {
        modelUrl: '/models/synty/characters/race-class/dwarf-barbarian.glb',
        sha256:
          '9420770680b3efcca3443a50803bb1bf9fd9ca4e4f03d125961ab52652742b8c',
      },
      'dwarf:fighter': {
        modelUrl: '/models/synty/characters/race-class/dwarf-fighter.glb',
        sha256:
          'e2ccabd29b471fad0732fb1a728ec13627e71a4cb747c1366ed56a06dc7cafa5',
      },
      'dwarf:monk': {
        modelUrl: '/models/synty/characters/race-class/dwarf-monk.glb',
        sha256:
          '397e13577ceb793e676d50e218d661f8fa9b7eb0e8cc6c5716f4b9574aceece7',
      },
      'dwarf:rogue': {
        modelUrl: '/models/synty/characters/race-class/dwarf-rogue.glb',
        sha256:
          'a189b0836af26106f6745157a01bcf79c0c52ca76a192d35ed75178489a9742e',
      },
    });
  });

  it('keeps all exact Dwarf entries on the modular rig family', () => {
    for (const classRef of ['barbarian', 'fighter', 'monk', 'rogue']) {
      expect(resolverSource).toContain(`'dwarf:${classRef}'`);
      expect(resolverSource).toContain(
        `model: 'race-class/dwarf-${classRef}.glb'`
      );
    }
    expect(loadReceipt().socketProfile).toBe(
      'modular-fantasy-hero-main-hand-v1'
    );
  });

  it('documents the isolated fixture limitation without private paths', () => {
    expect(existsSync(readmeUrl)).toBe(true);
    if (!existsSync(readmeUrl)) return;
    const readme = readFileSync(readmeUrl, 'utf8');
    expect(readme).toContain('captured proof window');
    expect(readme).toContain('D858 Dwarf Barbarian');
    expect(readme).toContain('D858 Dwarf Fighter');
    expect(readme).toContain('D858 Dwarf Monk');
    expect(readme).toContain('D858 Dwarf Rogue');
    expect(readme).toContain('Dwarf tool choice');
    expect(readme).not.toMatch(/\/home\/|\/tmp\/|Downloads\/synty/);
  });
});
