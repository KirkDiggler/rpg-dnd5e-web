// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BARD_APPEARANCE_CATALOG,
  BARD_APPEARANCE_PROVIDER,
} from '../src/generated/bardAppearanceCatalog';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function publicFile(publicUrl: string): string {
  expect(publicUrl).toMatch(/^\/models\/synty\//);
  return fileURLToPath(new URL(`../public${publicUrl}`, import.meta.url));
}

describe('eight-race Bard appearance publication', () => {
  it('pins the exact merged provider and additive race-class manifest', () => {
    expect(BARD_APPEARANCE_PROVIDER).toEqual({
      providerCommit: '37c13c68b6cfc87ad6684351f934b4ff1fd83515',
      manifestSha256:
        '6a0cf1fb99389c8b66ce34dbb60943d88af98f2181bfc28646deffe7260460eb',
    });
    expect(BARD_APPEARANCE_CATALOG.classRef).toBe('dnd5e:classes:bard');
    expect(BARD_APPEARANCE_CATALOG.raceOrder).toEqual([
      'dwarf',
      'elf',
      'gnome',
      'half-elf',
      'halfling',
      'half-orc',
      'human',
      'tiefling',
    ]);
  });

  it('binds all eight ignored runtime GLBs to their provider hashes and no downed URL', () => {
    const appearances = Object.values(BARD_APPEARANCE_CATALOG.appearances);
    expect(appearances).toHaveLength(8);
    expect(new Set(appearances.map((appearance) => appearance.url)).size).toBe(
      8
    );
    expect(
      appearances.every((appearance) => !appearance.url.includes('downed'))
    ).toBe(true);

    const present = appearances.filter((appearance) =>
      existsSync(publicFile(appearance.url))
    );
    expect(
      [0, appearances.length],
      `partial Bard runtime mirror: present=${present.length}`
    ).toContain(present.length);
    if (process.env.RPG_REQUIRE_SYNCED_BARD_ASSETS === '1') {
      expect(present).toHaveLength(appearances.length);
    }
    for (const appearance of present) {
      expect(
        sha256(readFileSync(publicFile(appearance.url))),
        appearance.url
      ).toBe(appearance.sha256);
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
        input:
          appearances
            .map((appearance) => publicFile(appearance.url))
            .join('\n') + '\n',
      }
    )
      .trim()
      .split('\n');
    expect(ignored).toHaveLength(appearances.length);
  });

  it('keeps the accepted rig, clips, anatomy count, and palette variation explicit', () => {
    for (const appearance of Object.values(
      BARD_APPEARANCE_CATALOG.appearances
    )) {
      expect(appearance.rigFamily).toBe('modular-fantasy-hero-v1');
      expect(appearance.boneCount).toBe(63);
      expect(appearance.animations).toEqual(['Idle_Relaxed', 'Walk_Forward']);
    }
    expect(BARD_APPEARANCE_CATALOG.appearances.tiefling.defaultPalette).toBe(
      '02-a-tiefling-crimson'
    );
  });
});
