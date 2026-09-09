// @vitest-environment node
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { withoutGitLocalEnvironment } from './testGitEnvironment';

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const cli = join(
  repositoryRoot,
  'scripts',
  'expose-provider-character-appearances.mjs'
);
const temporaryRoots: string[] = [];
const gitEnvironment = withoutGitLocalEnvironment(process.env);
const races = ['human', 'elf'];

async function put(path: string, contents: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}
function sha256(contents: string) {
  return createHash('sha256').update(contents).digest('hex');
}
async function git(root: string, ...args: string[]) {
  return execFileAsync('git', args, { cwd: root, env: gitEnvironment });
}
async function initRepository(root: string, remote: string) {
  await mkdir(root, { recursive: true });
  await git(root, 'init', '--quiet');
  await git(root, 'config', 'user.name', 'Fixture');
  await git(root, 'config', 'user.email', 'fixture@example.invalid');
  await git(root, 'config', 'core.hooksPath', join(root, '.no-hooks'));
  await git(root, 'remote', 'add', 'origin', remote);
}

interface ArtifactRow {
  path: string;
  sha256: string;
  sizeBytes: number;
  race?: string | null;
  role?: string;
}

interface ReceiptFixture {
  schemaVersion: number;
  tool: string;
  sourceProviderReceiptSha256: string;
  selection: { class: string; outfitRecipe: string; races: string[] };
  sourceExportManifest: {
    path: string;
    sha256: string;
    exports: { race: string; path: string; sha256: string }[];
  };
  installedArtifacts: ArtifactRow[];
  declarations: ArtifactRow[];
  generatedMetadata: ArtifactRow[];
  preservation: {
    addedFiles: string[];
    allOtherPreExistingFilesByteIdentical: boolean;
  };
  provider: {
    repository: string;
    base: string;
    branch: string;
    head: string;
    pullRequest: string;
    mergeSha: string | null;
  };
  status: { provider: string; published: boolean; merged: boolean };
  publication: {
    status: string;
    sourceProviderReceiptSha256: string;
    resolvedFromReceiptSha256: string;
    readback: { state: string };
  };
}

interface Fixture {
  root: string;
  provider: string;
  web: string;
  receiptPath: string;
  receipt: ReceiptFixture;
  mergeSha: string;
  calls: string;
  env: NodeJS.ProcessEnv;
  output: string;
}

async function makeFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'web-provider-exposure-'));
  temporaryRoots.push(root);
  const provider = join(root, 'provider');
  const providerRemote = join(root, 'provider-origin.git');
  await execFileAsync('git', ['init', '--bare', '--quiet', providerRemote], {
    env: gitEnvironment,
  });
  await initRepository(
    provider,
    'git@github.com:KirkDiggler/rpg-game-assets.git'
  );

  const installedArtifacts: ArtifactRow[] = [];
  const declarations: ArtifactRow[] = [];
  const generatedMetadata: ArtifactRow[] = [];
  const add = async (
    group: ArtifactRow[],
    path: string,
    contents: string,
    extra: Record<string, unknown> = {}
  ) => {
    await put(join(provider, path), contents);
    group.push({
      path,
      sha256: sha256(contents),
      sizeBytes: Buffer.byteLength(contents),
      ...extra,
    });
  };
  for (const race of races) {
    await add(
      installedArtifacts,
      `harness/models/synty/characters/customization/${race}-v1/bodies/${race}-bard-body.glb`,
      `${race}-body`,
      { race, role: 'customizableBody' }
    );
    await add(
      installedArtifacts,
      `harness/models/synty/characters/customization/${race}-v1/fallbacks/${race}-bard-complete.glb`,
      `${race}-fallback`,
      { race, role: 'completeFallback' }
    );
    await add(
      declarations,
      `harness/models/synty/characters/customization/${race}-v1/manifest.json`,
      `${race}-manifest`
    );
  }
  await add(
    installedArtifacts,
    'harness/models/synty/characters/outfit-customization/v1/masks/bard-bard.png',
    'mask',
    { race: null, role: 'primarySecondaryMask' }
  );
  await add(
    declarations,
    'harness/models/synty/characters/customization/manifest.json',
    'aggregate'
  );
  await add(
    declarations,
    'harness/models/synty/characters/outfit-customization/v1/manifest.json',
    'outfits'
  );
  await add(generatedMetadata, 'harness/models/synty/mesh-stats.json', 'stats');
  await add(
    generatedMetadata,
    'harness/catalogs/synty-complete-inventory.json',
    'inventory'
  );
  await git(provider, 'add', '.');
  await git(provider, 'commit', '--quiet', '-m', 'merged provider');
  const mergeSha = (await git(provider, 'rev-parse', 'HEAD')).stdout.trim();

  const sourceProviderReceiptSha256 = 'a'.repeat(64);
  const receipt: ReceiptFixture = {
    schemaVersion: 1,
    tool: 'publish-modular-customization-provider@1',
    sourceProviderReceiptSha256,
    selection: { class: 'bard', outfitRecipe: 'bard', races },
    sourceExportManifest: {
      path: '.stage/export/export-manifest.json',
      sha256: 'b'.repeat(64),
      exports: races.map((race) => ({
        race,
        path: `.stage/export/${race}/export-manifest.json`,
        sha256: 'c'.repeat(64),
      })),
    },
    installedArtifacts,
    declarations,
    generatedMetadata,
    preservation: {
      addedFiles: installedArtifacts
        .map((row) => row.path.replace('harness/models/synty/', ''))
        .sort(),
      allOtherPreExistingFilesByteIdentical: true,
    },
    provider: {
      repository: 'KirkDiggler/rpg-game-assets',
      base: 'main',
      branch: 'asset/185-bard-provider',
      head: mergeSha,
      pullRequest: 'https://github.com/KirkDiggler/rpg-game-assets/pull/186',
      mergeSha,
    },
    status: { provider: 'merged', published: true, merged: true },
    publication: {
      status: 'merged',
      sourceProviderReceiptSha256,
      resolvedFromReceiptSha256: 'd'.repeat(64),
      readback: { state: 'MERGED' },
    },
  };
  const receiptPath = join(root, 'merged-provider-receipt.json');
  await put(receiptPath, JSON.stringify(receipt));

  const webRemote = join(root, 'web-origin.git');
  await execFileAsync('git', ['init', '--bare', '--quiet', webRemote], {
    env: gitEnvironment,
  });
  const web = join(root, 'web');
  await initRepository(web, webRemote);
  await put(
    join(web, 'scripts', 'generateCharacterCustomizationCatalog.ts'),
    '// classOrder must declare at least one class\n'
  );
  await put(join(web, 'package.json'), '{"name":"fixture"}\n');
  await put(join(web, '.gitignore'), 'public/models/\n');
  await git(web, 'add', '.');
  await git(web, 'commit', '--quiet', '-m', 'web base');
  await git(web, 'branch', '-M', 'dev');
  await git(web, 'push', '--quiet', webRemote, 'dev');
  await git(web, 'update-ref', 'refs/remotes/origin/dev', 'HEAD');
  await git(
    web,
    'remote',
    'set-url',
    'origin',
    'git@github.com:KirkDiggler/rpg-dnd5e-web.git'
  );
  await git(
    web,
    'config',
    `url.file://${webRemote}.insteadOf`,
    'git@github.com:KirkDiggler/rpg-dnd5e-web.git'
  );

  await put(
    join(root, 'rpg-project', 'docs', 'teams', 'roles', 'ui-ux', 'prompt.md'),
    '## Signature\n\n— ui-ux agent, on behalf of <github-login>\n'
  );
  const calls = join(root, 'calls.log');
  const bin = join(root, 'bin');
  await mkdir(bin);
  const fakeGh = join(bin, 'gh');
  await put(
    fakeGh,
    `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALLS, 'gh ' + args.join(' ') + '\\n');
if (args[0] === 'repo') console.log(JSON.stringify({nameWithOwner:'KirkDiggler/rpg-game-assets',isPrivate:true}));
else if (args[0] === 'api' && args[1] === 'user') console.log(JSON.stringify({login:'fixture-user'}));
else if (args[0] === 'api') console.log(JSON.stringify({data:{repository:{issue:{number:1012,state:'OPEN',title:'fixture',url:'https://example/1012',projectItems:{nodes:[{project:{number:19}}]}}}}}));
else if (args[0] === 'pr' && args[1] === 'list') console.log('[]');
else if (args[0] === 'pr' && args[1] === 'create') console.log('https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1013');
else if (args[0] === 'pr' && args[1] === 'view' && args[2].includes('rpg-game-assets')) console.log(JSON.stringify({number:186,url:'https://github.com/KirkDiggler/rpg-game-assets/pull/186',state:'MERGED',headRefName:'asset/185-bard-provider',headRefOid:process.env.MERGE_SHA,baseRefName:'main',mergedAt:'2026-09-09T00:00:00Z',mergeCommit:{oid:process.env.MERGE_SHA}}));
else if (args[0] === 'pr' && args[1] === 'view') {
  const git = require('node:child_process').execFileSync;
  const head = git('git',['-C',process.env.WEB_WORKTREE,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  console.log(JSON.stringify({number:1013,url:'https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1013',state:'OPEN',headRefName:'feat/1012-bard-provider-exposure',headRefOid:head,baseRefName:'dev',mergedAt:null,mergeCommit:null}));
} else process.exit(9);
`
  );
  await chmod(fakeGh, 0o755);
  const fakeNpm = join(bin, 'npm');
  await put(
    fakeNpm,
    `#!/usr/bin/env node
const fs = require('node:fs'); const path = require('node:path');
const args = process.argv.slice(2); fs.appendFileSync(process.env.CALLS, 'npm ' + args.join(' ') + '\\n');
if (args.join(' ') === 'run assets:sync') {
  const output = path.join(process.cwd(),'src/generated/characterCustomizationCatalog.ts');
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output, process.env.MERGE_SHA + '\\nhuman:bard\\nelf:bard\\n');
  if (process.env.WRITE_LICENSED === '1') { const p=path.join(process.cwd(),'public/models/synty/bard.glb'); fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,'licensed'); require('node:child_process').execFileSync('git',['-C',process.cwd(),'add','-f',p]); }
}
`
  );
  await chmod(fakeNpm, 0o755);
  const fakeNpx = join(bin, 'npx');
  await put(
    fakeNpx,
    `#!/bin/sh
echo "npx $*" >> "$CALLS"
`
  );
  await chmod(fakeNpx, 0o755);

  const worktree = join(root, 'web-worktree');
  const output = join(root, 'web-receipt.json');
  const env = {
    ...gitEnvironment,
    RPG_EXPOSURE_GH: fakeGh,
    RPG_EXPOSURE_NPM: fakeNpm,
    RPG_EXPOSURE_NPX: fakeNpx,
    CALLS: calls,
    MERGE_SHA: mergeSha,
    WEB_WORKTREE: worktree,
  };
  return {
    root,
    provider,
    web,
    receiptPath,
    receipt,
    mergeSha,
    calls,
    env,
    output,
  };
}

async function runCli(fixture: Fixture, extra: string[] = []) {
  return execFileAsync(
    process.execPath,
    [
      cli,
      '--provider-receipt',
      fixture.receiptPath,
      '--provider-repo',
      fixture.provider,
      '--web-repo',
      fixture.web,
      '--web-issue',
      '1012',
      '--worktree-root',
      join(fixture.root, 'web-worktree'),
      '--output',
      fixture.output,
      ...extra,
    ],
    { cwd: repositoryRoot, env: fixture.env }
  );
}

async function rewriteReceipt(fixture: Fixture) {
  await writeFile(fixture.receiptPath, JSON.stringify(fixture.receipt));
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true }))
  );
});

describe('receipt-driven provider exposure wrapper', () => {
  it('reports a prepared input as an unpublished dependency without mutations', async () => {
    const fixture = await makeFixture();
    fixture.receipt.tool = 'prepare-modular-customization-provider@1';
    fixture.receipt.status = {
      provider: 'prepared',
      published: false,
      merged: false,
    };
    await rewriteReceipt(fixture);
    const result = await execFileAsync(
      process.execPath,
      [
        cli,
        '--provider-receipt',
        fixture.receiptPath,
        '--provider-repo',
        fixture.provider,
        '--web-repo',
        fixture.web,
        '--web-issue',
        '1012',
      ],
      { cwd: repositoryRoot, env: fixture.env }
    );
    expect(JSON.parse(result.stdout)).toMatchObject({
      mode: 'dry-run',
      mutationsPerformed: false,
      ready: false,
      blockers: [expect.stringContaining('prepared/unpublished/unmerged')],
    });
    await expect(readFile(fixture.calls, 'utf8')).rejects.toThrow();
  });

  it('defaults to a machine-readable non-mutating plan from verified merged state', async () => {
    const fixture = await makeFixture();
    const before = (await git(fixture.web, 'rev-parse', 'HEAD')).stdout;
    const result = await runCli(fixture);
    expect(JSON.parse(result.stdout)).toMatchObject({
      mode: 'dry-run',
      mutationsPerformed: false,
      ready: true,
      provider: {
        mergeSha: fixture.mergeSha,
        class: 'bard',
        races,
      },
      web: { base: 'dev', issue: 1012, project: 19 },
    });
    expect((await git(fixture.web, 'rev-parse', 'HEAD')).stdout).toBe(before);
    await expect(readFile(fixture.output, 'utf8')).rejects.toThrow();
    expect(await readFile(fixture.calls, 'utf8')).not.toContain('pr create');
  });

  it('applies only through normal assets:sync, exact staging, checks, and dev PR readback', async () => {
    const fixture = await makeFixture();
    const result = await runCli(fixture, ['--apply']);
    const plan = JSON.parse(result.stdout);
    expect(plan).toMatchObject({
      mutationsPerformed: true,
      web: {
        base: 'dev',
        branch: 'feat/1012-bard-provider-exposure',
        status: 'OPEN',
      },
    });
    const calls = await readFile(fixture.calls, 'utf8');
    expect(calls).toContain('npm run assets:sync');
    expect(calls).toContain(
      'npx vitest run scripts/generateCharacterCustomizationCatalog.test.ts src/components/hex-grid/classCharacterModels.test.ts'
    );
    expect(calls).toContain('npm run ci-check');
    const receipt = JSON.parse(await readFile(fixture.output, 'utf8'));
    expect(receipt).toMatchObject({
      provider: { mergeSha: fixture.mergeSha, class: 'bard', races },
      web: {
        repository: 'KirkDiggler/rpg-dnd5e-web',
        base: 'dev',
        head: expect.stringMatching(/^[0-9a-f]{40}$/),
        pullRequest: 'https://github.com/KirkDiggler/rpg-dnd5e-web/pull/1013',
        status: 'OPEN',
      },
      generation: {
        command: 'npm run assets:sync',
        providerHead: fixture.mergeSha,
        stagedPaths: ['src/generated/characterCustomizationCatalog.ts'],
        ciCheck: 'passed',
      },
    });
    expect(
      (
        await git(
          join(fixture.root, 'web-worktree'),
          'diff-tree',
          '--no-commit-id',
          '--name-only',
          '-r',
          'HEAD'
        )
      ).stdout.trim()
    ).toBe('src/generated/characterCustomizationCatalog.ts');
  });

  it.each([
    [
      'prepared publisher state',
      (fixture: Fixture) => {
        fixture.receipt.status = {
          provider: 'published',
          published: true,
          merged: false,
        };
        fixture.receipt.provider.mergeSha = null;
        fixture.receipt.publication.status = 'published';
      },
    ],
    [
      'provider identity',
      (fixture: Fixture) => {
        fixture.receipt.provider.repository = 'someone/public-assets';
      },
    ],
    [
      'unsafe owned path',
      (fixture: Fixture) => {
        fixture.receipt.installedArtifacts[0].path = '../escape.glb';
      },
    ],
    [
      'artifact hash',
      (fixture: Fixture) => {
        fixture.receipt.installedArtifacts[0].sha256 = '0'.repeat(64);
      },
    ],
    [
      'source handoff',
      (fixture: Fixture) => {
        fixture.receipt.sourceExportManifest.exports[0].race = 'elf';
      },
    ],
  ])(
    'fails closed for mismatched %s before asset sync or Web checkout',
    async (_name, mutate) => {
      const fixture = await makeFixture();
      mutate(fixture);
      await rewriteReceipt(fixture);
      await expect(runCli(fixture)).rejects.toMatchObject({
        code: expect.any(Number),
      });
      let calls = '';
      try {
        calls = await readFile(fixture.calls, 'utf8');
      } catch {
        // Validation may reject before any adapter call.
      }
      expect(calls).not.toContain('npm ');
      expect(calls).not.toContain('pr create');
      await expect(
        git(
          fixture.web,
          'show-ref',
          '--verify',
          '--quiet',
          'refs/heads/feat/1012-bard-provider-exposure'
        )
      ).rejects.toThrow();
    }
  );

  it('rejects any licensed staged path before tests, commit, or publication', async () => {
    const fixture = await makeFixture();
    fixture.env.WRITE_LICENSED = '1';
    await expect(runCli(fixture, ['--apply'])).rejects.toMatchObject({
      code: expect.any(Number),
      stderr: expect.stringContaining('outside its generated catalog'),
    });
    const calls = await readFile(fixture.calls, 'utf8');
    expect(calls).toContain('npm run assets:sync');
    expect(calls).not.toContain('npx ');
    expect(calls).not.toContain('pr create');
  });
});
