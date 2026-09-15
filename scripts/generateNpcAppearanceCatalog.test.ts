// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateNpcAppearanceCatalog } from './generate-npc-appearance-catalog.mjs';

const temporary: string[] = [];
const digest = (bytes: string | Buffer) =>
  createHash('sha256').update(bytes).digest('hex');

interface Fixture {
  root: string;
  provider: string;
  runtime: string;
  manifestPath: string;
  selectionPath: string;
  output: string;
  standingPath: string;
  downedPath: string;
  manifest: { npcs: Record<string, Record<string, unknown>> };
  selection: {
    schemaVersion: number;
    releases: Array<{
      releaseId: string;
      appearances: Array<{
        manifestId: string;
        assetRef: string;
        displayName: string;
        jointCount: number;
        standingSha256: string;
        downedSha256: string;
      }>;
    }>;
  };
}

function put(path: string, bytes: string | Buffer) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

function commit(provider: string, message = 'fixture') {
  execFileSync('git', ['add', '--all'], { cwd: provider });
  execFileSync('git', ['commit', '--quiet', '-m', message], { cwd: provider });
}

function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'npc-appearance-generator-'));
  temporary.push(root);
  const provider = join(root, 'provider');
  const runtime = join(root, 'web', 'public', 'models', 'synty');
  const manifestPath = join(
    provider,
    'harness',
    'models',
    'synty',
    'npcs',
    'manifest.json'
  );
  const selectionPath = join(root, 'npc-appearance-releases.json');
  const output = join(
    root,
    'web',
    'src',
    'generated',
    'npcAppearanceCatalog.ts'
  );
  const standingFile = 'npcs/warrior-01.glb';
  const downedFile = 'npcs/warrior-01-downed.glb';
  const standingPath = join(
    provider,
    'harness',
    'models',
    'synty',
    standingFile
  );
  const downedPath = join(provider, 'harness', 'models', 'synty', downedFile);
  const standingBytes = Buffer.from('standing skinned model');
  const downedBytes = Buffer.from('static downed model');
  put(standingPath, standingBytes);
  put(downedPath, downedBytes);
  put(join(runtime, standingFile), standingBytes);
  put(join(runtime, downedFile), downedBytes);
  const manifest: Fixture['manifest'] = {
    npcs: {
      selectedWarrior01: {
        assetRef: 'dnd5e:npcs:warrior:01',
        rulesRef: null,
        rulesRefNote: 'Appearance only.',
        source: 'SM_Chr_Warrior_01',
        sourcePack: 'fixture-pack',
        file: standingFile,
        downed: downedFile,
        sha256: digest(standingBytes),
        downedSha256: digest(downedBytes),
        animationClips: ['Idle_Relaxed', 'Walk_Forward'],
        pose: 'Idle_Relaxed [2,55], Walk_Forward [2,33], 30 fps.',
        jointCount: 50,
        rootWrapper: 'Standing Armature root; downed Root wrapper.',
        forwardAxis: '+Z',
      },
      unrequestedNpc: {
        assetRef: 'dnd5e:npcs:unrequested:01',
      },
    },
  };
  const selection: Fixture['selection'] = {
    schemaVersion: 1,
    releases: [
      {
        releaseId: 'fixture-release-v1',
        appearances: [
          {
            manifestId: 'selectedWarrior01',
            assetRef: 'dnd5e:npcs:warrior:01',
            displayName: 'Warrior 01',
            jointCount: 50,
            standingSha256: digest(standingBytes),
            downedSha256: digest(downedBytes),
          },
        ],
      },
    ],
  };
  put(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  put(selectionPath, `${JSON.stringify(selection, null, 2)}\n`);
  execFileSync('git', ['init', '--quiet'], { cwd: provider });
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: provider });
  execFileSync('git', ['config', 'user.email', 'fixture@example.invalid'], {
    cwd: provider,
  });
  commit(provider);
  return {
    root,
    provider,
    runtime,
    manifestPath,
    selectionPath,
    output,
    standingPath,
    downedPath,
    manifest,
    selection,
  };
}

function rewriteProvider(fixture: Fixture) {
  put(fixture.manifestPath, `${JSON.stringify(fixture.manifest, null, 2)}\n`);
  commit(fixture.provider, 'mutate provider');
}

function rewriteSelection(fixture: Fixture) {
  put(fixture.selectionPath, `${JSON.stringify(fixture.selection, null, 2)}\n`);
}

afterEach(() => {
  temporary.splice(0).forEach((root) => rmSync(root, { recursive: true }));
});

describe('NPC appearance catalog generator', () => {
  it('deterministically emits only data-selected exact appearances and verifies both model bytes', () => {
    const fixture = makeFixture();
    const receipt = generateNpcAppearanceCatalog({
      providerRoot: fixture.provider,
      runtimeRoot: fixture.runtime,
      selectionPath: fixture.selectionPath,
      outputPath: fixture.output,
    });
    const first = readFileSync(fixture.output, 'utf8');
    generateNpcAppearanceCatalog({
      providerRoot: fixture.provider,
      runtimeRoot: fixture.runtime,
      selectionPath: fixture.selectionPath,
      outputPath: fixture.output,
    });

    expect(readFileSync(fixture.output, 'utf8')).toBe(first);
    expect(receipt.appearanceCount).toBe(1);
    expect(receipt.releaseCount).toBe(1);
    expect(first).toContain(receipt.providerCommit);
    expect(first).toContain(receipt.manifestSha256);
    expect(first).toContain(receipt.selectionSha256);
    expect(first).toContain("'dnd5e:npcs:warrior:01'");
    expect(first).toContain("displayName: 'Warrior 01'");
    expect(first).toContain('rulesRef: null');
    expect(first).toContain("standingUrl: '/models/synty/npcs/warrior-01.glb'");
    expect(first).toContain(
      "downedUrl: '/models/synty/npcs/warrior-01-downed.glb'"
    );
    expect(first).toContain('jointCount: 50');
    expect(first).toContain("forwardAxis: '+Z'");
    expect(first).not.toContain('unrequestedNpc');
    expect(first).not.toContain('dnd5e:npcs:unrequested:01');
    expect(first).not.toContain(fixture.provider);
    expect(first).toContain(
      'Object.hasOwn(GENERATED_NPC_APPEARANCES, assetRef)'
    );
  });

  it.each([
    [
      'non-null rules association',
      (fixture: Fixture) => {
        fixture.manifest.npcs.selectedWarrior01!.rulesRef =
          'dnd5e:monsters:goblin';
        rewriteProvider(fixture);
      },
      /rulesRef must be null/,
    ],
    [
      'changed published asset ref',
      (fixture: Fixture) => {
        fixture.manifest.npcs.selectedWarrior01!.assetRef =
          'dnd5e:npcs:warrior:changed';
        rewriteProvider(fixture);
      },
      /does not match selected assetRef/,
    ],
    [
      'wrong standing hash',
      (fixture: Fixture) => {
        fixture.manifest.npcs.selectedWarrior01!.sha256 = '0'.repeat(64);
        rewriteProvider(fixture);
      },
      /standing SHA-256 does not match/,
    ],
    [
      'missing downed model declaration',
      (fixture: Fixture) => {
        delete fixture.manifest.npcs.selectedWarrior01!.downed;
        rewriteProvider(fixture);
      },
      /downed/,
    ],
    [
      'wrong rig joint count',
      (fixture: Fixture) => {
        fixture.manifest.npcs.selectedWarrior01!.jointCount = 55;
        rewriteProvider(fixture);
      },
      /jointCount does not match selected jointCount/,
    ],
    [
      'duplicate selected manifest row',
      (fixture: Fixture) => {
        fixture.selection.releases[0]!.appearances.push({
          ...fixture.selection.releases[0]!.appearances[0]!,
        });
        rewriteSelection(fixture);
      },
      /duplicate selected manifestId/,
    ],
  ])('rejects %s', (_label, mutate, error) => {
    const fixture = makeFixture();
    mutate(fixture);
    expect(() =>
      generateNpcAppearanceCatalog({
        providerRoot: fixture.provider,
        selectionPath: fixture.selectionPath,
        outputPath: fixture.output,
      })
    ).toThrow(error);
  });

  it('--check detects stale generated bytes without rewriting them', () => {
    const fixture = makeFixture();
    generateNpcAppearanceCatalog({
      providerRoot: fixture.provider,
      runtimeRoot: fixture.runtime,
      selectionPath: fixture.selectionPath,
      outputPath: fixture.output,
    });
    put(fixture.output, 'stale bytes\n');

    expect(() =>
      generateNpcAppearanceCatalog({
        providerRoot: fixture.provider,
        runtimeRoot: fixture.runtime,
        selectionPath: fixture.selectionPath,
        outputPath: fixture.output,
        check: true,
      })
    ).toThrow(/stale/);
    expect(readFileSync(fixture.output, 'utf8')).toBe('stale bytes\n');
  });
});
