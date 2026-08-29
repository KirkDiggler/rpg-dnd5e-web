// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mainHandWeaponsTestSource = readFileSync(
  new URL(
    '../src/components/hex-grid/mainHandWeapons.test.ts',
    import.meta.url
  ),
  'utf8'
);
const receipt = JSON.parse(
  readFileSync(
    new URL(
      '../docs/evidence/849-modular-elf-fighter/receipt.json',
      import.meta.url
    ),
    'utf8'
  )
) as {
  browser?: { scope?: string };
  elfFighterSha256?: string;
  hairMesh?: string;
  materialAlphaMode?: string;
  providerCommit?: string;
  providerManifestSha256?: string;
};
const EXPECTED_PROVIDER_COMMIT = '098dc9bb977199ea212a00d2742d5055a8f1a7dd';
const EXPECTED_PROVIDER_MANIFEST_SHA256 =
  '446581a10dbdbde7c06b9c884d18c96f71852714a093e844e1bb316bc987fa94';
const EXPECTED_ELF_FIGHTER_SHA256 =
  '3060e6bc2712c3699c3abceb78480fd24007d628ef9c928c5bcffcd53ca7aa39';
const readme = readFileSync(
  new URL(
    '../docs/evidence/849-modular-elf-fighter/README.md',
    import.meta.url
  ),
  'utf8'
);

describe('task 10 publication guardrails', () => {
  it('keeps the public main-hand socket test portable', () => {
    expect(mainHandWeaponsTestSource).not.toMatch(/\.pi\/worktrees\//);
    expect(mainHandWeaponsTestSource).not.toContain('public/models/synty/');
    expect(mainHandWeaponsTestSource).not.toContain('describe.runIf(');
    expect(mainHandWeaponsTestSource).toContain(
      'EXPECTED_MODULAR_FANTASY_HERO_MAIN_HAND_SOCKET'
    );
  });

  it('pins the corrected provider receipt facts', () => {
    expect(receipt.providerCommit).toBe(EXPECTED_PROVIDER_COMMIT);
    expect(receipt.providerManifestSha256).toBe(
      EXPECTED_PROVIDER_MANIFEST_SHA256
    );
    expect(receipt.elfFighterSha256).toBe(EXPECTED_ELF_FIGHTER_SHA256);
    expect(receipt.materialAlphaMode).toBe('OPAQUE');
    expect(receipt.hairMesh).toBe('Chr_Hair_01');
  });

  it('scopes browser zero counts to the captured proof window', () => {
    expect(receipt.browser?.scope).toBe('captured-proof-window');
    expect(readme).toContain('captured proof window');
    expect(readme).toContain('outside the captured proof window');
    expect(readme).toContain('provider PR #84');
    expect(readme).toContain('OPAQUE');
    expect(readme).toContain('Chr_Hair_01');
    expect(readme).toContain('Chr_Hair_38 absent');
  });
});
