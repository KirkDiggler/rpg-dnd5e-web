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
};
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

  it('scopes browser zero counts to the captured proof window', () => {
    expect(receipt.browser?.scope).toBe('captured-proof-window');
    expect(readme).toContain('captured proof window');
    expect(readme).toContain('outside the captured proof window');
  });
});
