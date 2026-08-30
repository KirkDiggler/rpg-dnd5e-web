// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const receiptUrl = new URL(
  '../docs/evidence/856-modular-elf-classes/receipt.json',
  import.meta.url
);
const readmeUrl = new URL(
  '../docs/evidence/856-modular-elf-classes/README.md',
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

describe('Phase B modular Elf publication', () => {
  it('pins the exact merged provider and all four output hashes', () => {
    const receipt = loadReceipt();
    expect(receipt.providerCommit).toBe(
      'b62c1e55c0a419e25a5a412f9bf3dccf0421df07'
    );
    expect(receipt.providerManifestSha256).toBe(
      '30efda1002b6cc9bd0286c18fd2e3275f25e8505f4ebf524236dd7eff33217cd'
    );
    expect(receipt.combinations).toEqual({
      'elf:barbarian': {
        modelUrl: '/models/synty/characters/race-class/elf-barbarian.glb',
        sha256:
          'e436883e6adf7e9912bffafc8734351cd970fb6154263e0fe96e842f490ef80d',
      },
      'elf:fighter': {
        modelUrl: '/models/synty/characters/race-class/elf-fighter.glb',
        sha256:
          '3060e6bc2712c3699c3abceb78480fd24007d628ef9c928c5bcffcd53ca7aa39',
      },
      'elf:monk': {
        modelUrl: '/models/synty/characters/race-class/elf-monk.glb',
        sha256:
          '4167695e5268a84dfdbf202a883c6012825216902afa60f7b88bbc6349236206',
      },
      'elf:rogue': {
        modelUrl: '/models/synty/characters/race-class/elf-rogue.glb',
        sha256:
          '939e38fbb1121a6b185e7edf427f6b0a7867597a004e94c41f0982db3df82365',
      },
    });
  });

  it('keeps all exact Elf entries on the one modular rig family', () => {
    for (const classRef of ['barbarian', 'fighter', 'monk', 'rogue']) {
      expect(resolverSource).toContain(`'elf:${classRef}'`);
      expect(resolverSource).toContain(
        `model: 'race-class/elf-${classRef}.glb'`
      );
    }
    expect(loadReceipt().socketProfile).toBe(
      'modular-fantasy-hero-main-hand-v1'
    );
  });

  it('documents the scoped real-route proof without private paths', () => {
    expect(existsSync(readmeUrl)).toBe(true);
    if (!existsSync(readmeUrl)) return;
    const readme = readFileSync(readmeUrl, 'utf8');
    expect(readme).toContain('captured proof window');
    expect(readme).toContain('B856 Elf Barbarian');
    expect(readme).toContain('B856 Elf Monk');
    expect(readme).toContain('B856 Elf Rogue');
    expect(readme).not.toMatch(/\/home\/|\/tmp\/|Downloads\/synty/);
  });
});
