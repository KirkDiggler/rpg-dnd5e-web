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
    weaponSets?: Array<{
      manifestId: string;
      assetRef: string;
      standingSha256: string;
      catalogSha256: string;
    }>;
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

interface WeaponFixture extends Fixture {
  modelRoot: string;
  catalog: {
    schemaVersion: number;
    appearance: string;
    body: { file: string; sha256: string };
    weapons: Array<{
      ref: string;
      asset: string;
      sha256: string;
      socket: {
        bone: string;
        boneUnitMeters: number;
        positionMeters: number[];
        rotationQuaternion: number[];
        scale: number;
      };
    }>;
  };
}

function withWeaponSet(): WeaponFixture {
  const fixture = makeFixture();
  const modelRoot = join(fixture.provider, 'harness/models/synty');
  const file = 'npcs/weapons/warrior/sword.glb';
  put(join(modelRoot, file), 'fitted sword');
  put(join(fixture.runtime, file), 'fitted sword');
  const catalog = {
    schemaVersion: 1,
    appearance: 'dnd5e:npcs:warrior:01',
    body: {
      file: 'npcs/warrior-01.glb',
      sha256: digest(readFileSync(fixture.standingPath)),
    },
    weapons: [
      {
        ref: 'dnd5e:weapons:scimitar',
        asset: file,
        sha256: digest('fitted sword'),
        socket: {
          bone: 'Hand_R',
          boneUnitMeters: 0.01,
          positionMeters: [0.04, 0.1, 0.005],
          rotationQuaternion: [0, 0, 0, 1],
          scale: 1,
        },
      },
    ],
  };
  const fitted = { ...fixture, catalog, modelRoot };
  saveWeaponSet(fitted);
  return fitted;
}

function saveWeaponSet(fixture: ReturnType<typeof withWeaponSet>) {
  const catalogFile = 'npcs/warrior-01-weapons.json';
  const bytes = JSON.stringify(fixture.catalog);
  put(join(fixture.modelRoot, catalogFile), bytes);
  put(join(fixture.runtime, catalogFile), bytes);
  fixture.manifest.npcs.selectedWarrior01!.weapons = {
    file: catalogFile,
    sha256: digest(bytes),
  };
  fixture.selection.weaponSets = [
    {
      manifestId: 'selectedWarrior01',
      assetRef: 'dnd5e:npcs:warrior:01',
      standingSha256: digest(readFileSync(fixture.standingPath)),
      catalogSha256: digest(bytes),
    },
  ];
  rewriteSelection(fixture);
  rewriteProvider(fixture);
}

function generateFitted(fixture: ReturnType<typeof withWeaponSet>) {
  return generateNpcAppearanceCatalog({
    providerRoot: fixture.provider,
    runtimeRoot: fixture.runtime,
    selectionPath: fixture.selectionPath,
    outputPath: fixture.output,
  });
}

afterEach(() => {
  temporary.splice(0).forEach((root) => rmSync(root, { recursive: true }));
});

describe('exact-body fitted weapon catalog generation', () => {
  it('publishes only metadata with explicit item/weapon identity mapping and a shared provider pin', () => {
    const fixture = withWeaponSet();
    generateFitted(fixture);
    const output = readFileSync(fixture.output, 'utf8');
    expect(output).toContain("weaponRef: 'dnd5e:weapons:scimitar'");
    expect(output).toContain("itemRef: 'dnd5e:item:scimitar'");
    expect(output).toContain("bodyUrl: '/models/synty/npcs/warrior-01.glb'");
    expect(output).toContain('boneUnitMeters: 0.01');
    expect(output).not.toContain(fixture.provider);
    expect(output).not.toContain('fitted sword');
    generateFitted(fixture);
    expect(readFileSync(fixture.output, 'utf8')).toBe(output);
  });

  it.each([
    [
      'different appearance',
      (f: ReturnType<typeof withWeaponSet>) => {
        f.catalog.appearance = 'dnd5e:npcs:other:01';
      },
      'selected exact body',
    ],
    [
      'different body hash',
      (f: ReturnType<typeof withWeaponSet>) => {
        f.catalog.body.sha256 = '0'.repeat(64);
      },
      'selected exact body',
    ],
    [
      'different body file',
      (f: ReturnType<typeof withWeaponSet>) => {
        f.catalog.body.file = 'npcs/other.glb';
      },
      'selected exact body',
    ],
    [
      'traversal',
      (f: ReturnType<typeof withWeaponSet>) => {
        f.catalog.weapons[0]!.asset = 'npcs/../../secret.glb';
      },
      'traversal-free',
    ],
    [
      'non-weapon ref',
      (f: ReturnType<typeof withWeaponSet>) => {
        f.catalog.weapons[0]!.ref = 'dnd5e:monster_actions:bite';
      },
      'exact weapon reference',
    ],
    [
      'wrong weapon bytes',
      (f: ReturnType<typeof withWeaponSet>) => {
        f.catalog.weapons[0]!.sha256 = '0'.repeat(64);
      },
      'provider GLB',
    ],
    [
      'non-normalized quaternion',
      (f: ReturnType<typeof withWeaponSet>) => {
        f.catalog.weapons[0]!.socket.rotationQuaternion = [0, 0, 0, 2];
      },
      'normalized',
    ],
    [
      'wrong position tuple',
      (f: ReturnType<typeof withWeaponSet>) => {
        f.catalog.weapons[0]!.socket.positionMeters = [0, 1];
      },
      'finite 3-tuple',
    ],
    [
      'zero units',
      (f: ReturnType<typeof withWeaponSet>) => {
        f.catalog.weapons[0]!.socket.boneUnitMeters = 0;
      },
      'positive and finite',
    ],
    [
      'negative scale',
      (f: ReturnType<typeof withWeaponSet>) => {
        f.catalog.weapons[0]!.socket.scale = -1;
      },
      'positive and finite',
    ],
    [
      'duplicate weapon',
      (f: ReturnType<typeof withWeaponSet>) => {
        f.catalog.weapons.push(f.catalog.weapons[0]!);
      },
      'duplicate weapon reference',
    ],
  ] as const)(
    'rejects %s at the fitted contract, without replacing a catalog',
    (_name, mutate, reason) => {
      const fixture = withWeaponSet();
      put(fixture.output, 'previous reviewed catalog');
      mutate(fixture);
      saveWeaponSet(fixture);
      expect(() => generateFitted(fixture)).toThrow(reason);
      expect(readFileSync(fixture.output, 'utf8')).toBe(
        'previous reviewed catalog'
      );
    }
  );

  it.each(['body', 'weapon', 'catalog'] as const)(
    'rejects changed synchronized %s bytes',
    (target) => {
      const fixture = withWeaponSet();
      const path =
        target === 'body'
          ? 'npcs/warrior-01.glb'
          : target === 'weapon'
            ? fixture.catalog.weapons[0]!.asset
            : 'npcs/warrior-01-weapons.json';
      put(join(fixture.runtime, path), 'bad synchronized bytes');
      expect(() => generateFitted(fixture)).toThrow(
        `synchronized ${target === 'catalog' ? 'JSON' : 'GLB'} SHA-256`
      );
    }
  );
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
