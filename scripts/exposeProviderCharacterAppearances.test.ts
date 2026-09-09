// @vitest-environment node
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
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
const currentOverlayPath = 'evidence/117-all-race-hair/verification.json';
const currentOverlayAllowedFields = [
  'providerMetadata.inventory.path',
  'providerMetadata.inventory.sizeBytes',
  'providerMetadata.inventory.sha256',
  'providerMetadata.inventory.fileCount',
  'providerMetadata.inventory.treeSha256',
  'providerMetadata.meshStats.path',
  'providerMetadata.meshStats.sizeBytes',
  'providerMetadata.meshStats.sha256',
  'providerMetadata.meshStats.assetCount',
  'providerMetadata.runtime.fileCount',
  'providerMetadata.runtime.treeSha256',
];

async function put(path: string, contents: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}
function sha256(contents: string | Buffer) {
  return createHash('sha256').update(contents).digest('hex');
}
function canonicalProviderJson(value: unknown): string {
  const sorted = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(sorted);
    if (item && typeof item === 'object')
      return Object.fromEntries(
        Object.entries(item)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, sorted(child)])
      );
    return item;
  };
  return `${JSON.stringify(sorted(value), null, 2)}\n`;
}
async function treeMetadata(root: string) {
  const rows: { path: string; size: number; sha256: string }[] = [];
  async function walk(directory: string, prefix = ''): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path, relative);
      else {
        const bytes = await readFile(path);
        rows.push({
          path: relative,
          size: (await stat(path)).size,
          sha256: sha256(bytes),
        });
      }
    }
  }
  await walk(root);
  const digest = createHash('sha256');
  for (const row of rows.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  )) {
    digest.update(row.path);
    digest.update('\0');
    digest.update(String(row.size));
    digest.update('\0');
    digest.update(row.sha256);
    digest.update('\n');
  }
  return { fileCount: rows.length, treeSha256: digest.digest('hex') };
}
async function git(root: string, ...args: string[]) {
  return execFileAsync('git', args, { cwd: root, env: gitEnvironment });
}
async function initRepository(root: string, remote: string) {
  await mkdir(root, { recursive: true });
  await git(root, 'init', '--quiet');
  await git(root, 'config', 'user.name', 'Fixture');
  await git(root, 'config', 'user.email', 'fixture@example.invalid');
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
  currentCompatibilityOverlays: (ArtifactRow & {
    schemaVersion: number;
    kind: string;
    baselineSha256: string;
    baselineHead: string;
    allowedJsonFields: string[];
  })[];
  preservation: {
    addedFiles: string[];
    changedCumulativeFiles: string[];
    allOtherPreExistingFilesByteIdentical: boolean;
  };
  provider: {
    repository: string;
    baselineRef: string;
    baselineHead: string;
    candidateRoot: string;
    base: string;
    branch: string;
    head: string;
    pullRequest: string;
    mergeSha: string | null;
  };
  status: {
    provider: string;
    published: boolean;
    merged: boolean;
    currentProviderCompatibilityReady: boolean;
    webCompatibilityReady: boolean;
  };
  publication: {
    implemented: boolean;
    operatorJsonEditingRequired: boolean;
    status: string;
    issue: number;
    project: number;
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

async function makeFixture(
  options: { existingClass?: boolean } = {}
): Promise<Fixture> {
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
  await put(join(provider, '.gitignore'), '.worktrees/\n');

  const declarationPaths = [
    ...races.map(
      (race) =>
        `harness/models/synty/characters/customization/${race}-v1/manifest.json`
    ),
    'harness/models/synty/characters/customization/manifest.json',
    'harness/models/synty/characters/outfit-customization/v1/manifest.json',
  ];
  const inventoryPath = 'harness/catalogs/synty-complete-inventory.json';
  const meshStatsPath = 'harness/models/synty/mesh-stats.json';
  const artifactPaths = [
    ...races.flatMap((race) => [
      `harness/models/synty/characters/customization/${race}-v1/bodies/${race}-bard-body.glb`,
      `harness/models/synty/characters/customization/${race}-v1/fallbacks/${race}-bard-complete.glb`,
    ]),
    'harness/models/synty/characters/outfit-customization/v1/masks/bard-bard.png',
  ];
  for (const path of declarationPaths)
    await put(join(provider, path), `baseline ${path}\n`);
  await put(
    join(provider, inventoryPath),
    '{"fileCount":1,"treeSha256":"old"}\n'
  );
  await put(join(provider, meshStatsPath), '{"assetCount":1}\n');
  if (options.existingClass)
    for (const path of artifactPaths)
      await put(join(provider, path), `prior ${path}\n`);
  const baselineOverlay = canonicalProviderJson({
    historicalApproval: { quote: 'preserve me', status: 'accepted' },
    providerMetadata: {
      inventory: {
        fileCount: 1,
        path: inventoryPath,
        sha256: 'a'.repeat(64),
        sizeBytes: 1,
        treeSha256: 'b'.repeat(64),
      },
      meshStats: {
        assetCount: 1,
        path: meshStatsPath,
        sha256: 'c'.repeat(64),
        sizeBytes: 1,
      },
      preservation: { historicalFact: true },
      runtime: { fileCount: 1, treeSha256: 'd'.repeat(64) },
    },
  });
  await put(join(provider, currentOverlayPath), baselineOverlay);
  await git(provider, 'add', '.');
  await git(provider, 'commit', '--quiet', '-m', 'provider baseline');
  const baselineHead = (await git(provider, 'rev-parse', 'HEAD')).stdout.trim();

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
    JSON.stringify({ classOrder: ['bard'] })
  );
  const runtime = await treeMetadata(
    join(provider, 'harness/models/synty/characters/customization')
  );
  const inventoryContents = canonicalProviderJson({
    fileCount: 9,
    treeSha256: 'e'.repeat(64),
  });
  const meshStatsContents = canonicalProviderJson({ assetCount: 7 });
  await add(generatedMetadata, meshStatsPath, meshStatsContents);
  await add(generatedMetadata, inventoryPath, inventoryContents);
  const overlayDocument = JSON.parse(baselineOverlay);
  overlayDocument.providerMetadata.inventory = {
    fileCount: 9,
    path: inventoryPath,
    sha256: sha256(inventoryContents),
    sizeBytes: Buffer.byteLength(inventoryContents),
    treeSha256: 'e'.repeat(64),
  };
  overlayDocument.providerMetadata.meshStats = {
    assetCount: 7,
    path: meshStatsPath,
    sha256: sha256(meshStatsContents),
    sizeBytes: Buffer.byteLength(meshStatsContents),
  };
  overlayDocument.providerMetadata.runtime = runtime;
  const overlayContents = canonicalProviderJson(overlayDocument);
  await put(join(provider, currentOverlayPath), overlayContents);
  const currentCompatibilityOverlays = [
    {
      schemaVersion: 1,
      kind: 'live-117-provider-metadata-overlay',
      path: currentOverlayPath,
      sha256: sha256(overlayContents),
      sizeBytes: Buffer.byteLength(overlayContents),
      baselineSha256: sha256(baselineOverlay),
      baselineHead,
      allowedJsonFields: [...currentOverlayAllowedFields],
    },
  ];
  await git(provider, 'add', '.');
  await git(provider, 'commit', '--quiet', '-m', 'merged provider');
  const mergeSha = (await git(provider, 'rev-parse', 'HEAD')).stdout.trim();

  // This is the corrected provider's prepare@2 -> publish@2 -> resolve shape:
  // every chain link is distinct and the merged receipt is bound to the Git
  // baseline, merged provider commit, and exact owned #117 overlay.
  const sourceProviderReceiptSha256 = 'a'.repeat(64);
  const receipt: ReceiptFixture = {
    schemaVersion: 2,
    tool: 'publish-modular-customization-provider@2',
    sourceProviderReceiptSha256,
    selection: { class: 'bard', outfitRecipe: 'bard', races },
    sourceExportManifest: {
      path: join(root, 'exports', 'export-manifest.json'),
      sha256: 'b'.repeat(64),
      exports: races.map((race) => ({
        race,
        path: join(root, 'exports', race, 'export-manifest.json'),
        sha256: 'c'.repeat(64),
      })),
    },
    installedArtifacts,
    declarations,
    generatedMetadata,
    currentCompatibilityOverlays,
    preservation: {
      addedFiles: options.existingClass
        ? []
        : installedArtifacts
            .map((row) => row.path.replace('harness/models/synty/', ''))
            .sort(),
      changedCumulativeFiles: declarations
        .map((row) => row.path.replace('harness/models/synty/', ''))
        .concat(
          'mesh-stats.json',
          ...(options.existingClass
            ? installedArtifacts.map((row) =>
                row.path.replace('harness/models/synty/', '')
              )
            : [])
        )
        .sort(),
      allOtherPreExistingFilesByteIdentical: true,
    },
    provider: {
      repository: 'KirkDiggler/rpg-game-assets',
      baselineRef: baselineHead,
      baselineHead,
      candidateRoot: '.',
      base: 'main',
      branch: 'asset/185-bard-provider',
      head: mergeSha,
      pullRequest: 'https://github.com/KirkDiggler/rpg-game-assets/pull/186',
      mergeSha,
    },
    status: {
      provider: 'merged',
      published: true,
      merged: true,
      currentProviderCompatibilityReady: true,
      webCompatibilityReady: false,
    },
    publication: {
      implemented: true,
      operatorJsonEditingRequired: false,
      status: 'merged',
      issue: 185,
      project: 19,
      sourceProviderReceiptSha256,
      resolvedFromReceiptSha256: 'd'.repeat(64),
      readback: { state: 'MERGED' },
    },
  };
  const receiptPath = join(root, 'merged-provider-receipt.json');
  await put(receiptPath, JSON.stringify(receipt));

  // The repository source deliberately advances and becomes dirty. Apply must
  // consume a separate detached worktree without changing either state.
  await put(join(provider, 'source-only.txt'), 'later source head\n');
  await git(provider, 'add', 'source-only.txt');
  await git(provider, 'commit', '--quiet', '-m', 'later source state');
  await put(join(provider, 'dirty-source.txt'), 'preserve me\n');

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
  await put(join(web, '.gitignore'), 'public/models/\n.husky/_/\n');
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
const fs = require('node:fs'); const path = require('node:path'); const cp = require('node:child_process');
const args = process.argv.slice(2); fs.appendFileSync(process.env.CALLS, 'npm ' + args.join(' ') + '\\n');
if (args.join(' ') === 'run prepare') {
  const hook = path.join(process.cwd(), '.husky/_/pre-commit');
  fs.mkdirSync(path.dirname(hook), {recursive:true});
  fs.writeFileSync(hook, '#!/bin/sh\\nexit 0\\n', {mode:0o755});
  cp.execFileSync('git', ['-C', process.cwd(), 'config', 'core.hooksPath', '.husky/_']);
}
if (args.join(' ') === 'run assets:sync') {
  const output = path.join(process.cwd(),'src/generated/characterCustomizationCatalog.ts');
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output, "export const providerCommit = '" + process.env.MERGE_SHA + "';\\ncombination: 'human:bard'\\ncombination: 'elf:bard'\\n");
  console.log('Generated aggregate customization catalog from ' + process.env.MERGE_SHA + ' (2 profiles, 15 source files).');
  if (process.env.WRITE_LICENSED === '1') { const p=path.join(process.cwd(),'public/models/synty/bard.glb'); fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,'licensed'); cp.execFileSync('git',['-C',process.cwd(),'add','-f',p]); }
}
`
  );
  await chmod(fakeNpm, 0o755);
  const fakeNpx = join(bin, 'npx');
  await put(
    fakeNpx,
    `#!/usr/bin/env node
const fs = require('node:fs'); const path = require('node:path');
fs.appendFileSync(process.env.CALLS, 'npx ' + process.argv.slice(2).join(' ') + '\\n');
const catalog = fs.readFileSync(path.join(process.cwd(), 'src/generated/characterCustomizationCatalog.ts'), 'utf8');
if (!catalog.includes(process.env.MERGE_SHA) || (catalog.match(/combination:/g) || []).length !== 2) process.exit(8);
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
    fixture.receipt.tool = 'prepare-modular-customization-provider@2';
    fixture.receipt.status = {
      provider: 'prepared',
      published: false,
      merged: false,
      currentProviderCompatibilityReady: true,
      webCompatibilityReady: false,
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

  it('derives the default Web worktree under the main checkout common-dir root', async () => {
    const fixture = await makeFixture();
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
    expect(JSON.parse(result.stdout).web.worktree).toBe(
      join(fixture.web, '.worktrees', '1012-bard-provider-exposure')
    );
  });

  it('accepts a corrected same-class update receipt without mutating dry-run', async () => {
    const fixture = await makeFixture({ existingClass: true });
    const result = await runCli(fixture);
    expect(JSON.parse(result.stdout)).toMatchObject({
      mode: 'dry-run',
      mutationsPerformed: false,
      ready: true,
    });
  });

  it('cross-reads the corrected prepare@2/publish@2 merged shape with fake GitHub', async () => {
    const fixture = await makeFixture();
    const before = (await git(fixture.web, 'rev-parse', 'HEAD')).stdout;
    const result = await runCli(fixture);
    expect(JSON.parse(result.stdout)).toMatchObject({
      mode: 'dry-run',
      mutationsPerformed: false,
      ready: true,
      provider: {
        baselineHead: fixture.receipt.provider.baselineHead,
        mergeSha: fixture.mergeSha,
        class: 'bard',
        races,
        receiptChain: {
          preparedReceiptSha256: fixture.receipt.sourceProviderReceiptSha256,
          publishedReceiptSha256:
            fixture.receipt.publication.resolvedFromReceiptSha256,
          mergedReceiptSha256: sha256(await readFile(fixture.receiptPath)),
        },
        currentCompatibilityOverlay: {
          kind: 'live-117-provider-metadata-overlay',
          path: currentOverlayPath,
          allowedJsonFields: currentOverlayAllowedFields,
        },
      },
      web: { base: 'dev', issue: 1012, project: 19 },
    });
    expect((await git(fixture.web, 'rev-parse', 'HEAD')).stdout).toBe(before);
    await expect(readFile(fixture.output, 'utf8')).rejects.toThrow();
    expect(await readFile(fixture.calls, 'utf8')).not.toContain('pr create');
  });

  it('rejects an otherwise hash-bound overlay that changes historical #117 facts', async () => {
    const fixture = await makeFixture();
    const overlayPath = join(fixture.provider, currentOverlayPath);
    const overlay = JSON.parse(await readFile(overlayPath, 'utf8'));
    overlay.historicalApproval.quote = 'tampered outside current metadata';
    const bytes = canonicalProviderJson(overlay);
    await writeFile(overlayPath, bytes);
    await git(fixture.provider, 'add', currentOverlayPath);
    await git(fixture.provider, 'commit', '--quiet', '-m', 'tampered merge');
    const mergeSha = (
      await git(fixture.provider, 'rev-parse', 'HEAD')
    ).stdout.trim();
    fixture.receipt.provider.head = mergeSha;
    fixture.receipt.provider.mergeSha = mergeSha;
    fixture.receipt.currentCompatibilityOverlays[0].sha256 = sha256(bytes);
    fixture.receipt.currentCompatibilityOverlays[0].sizeBytes =
      Buffer.byteLength(bytes);
    fixture.env.MERGE_SHA = mergeSha;
    await rewriteReceipt(fixture);

    await expect(runCli(fixture)).rejects.toMatchObject({
      code: expect.any(Number),
      stderr: expect.stringContaining('outside its exact allowed fields'),
    });
    expect(await readFile(fixture.calls, 'utf8')).not.toContain('npm ');
  });

  it('applies from an automatic pinned provider worktree with hooks and exact gates', async () => {
    const fixture = await makeFixture();
    const sourceHead = (await git(fixture.provider, 'rev-parse', 'HEAD'))
      .stdout;
    const sourceStatus = (
      await git(
        fixture.provider,
        'status',
        '--porcelain=v1',
        '--untracked-files=all'
      )
    ).stdout;
    expect(sourceHead.trim()).not.toBe(fixture.mergeSha);
    expect(sourceStatus).toContain('dirty-source.txt');
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
    expect(calls.indexOf('npm ci --ignore-scripts')).toBeLessThan(
      calls.indexOf('npm run prepare')
    );
    expect(calls.indexOf('npm run prepare')).toBeLessThan(
      calls.indexOf('npm run assets:sync')
    );
    expect(calls).toContain('npm run assets:sync');
    expect(calls).toContain(
      'npx vitest run scripts/generateCharacterCustomizationCatalog.test.ts scripts/characterCustomizationPublication.test.ts src/components/hex-grid/classCharacterModels.test.ts'
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
        huskySetup: 'npm run prepare',
        preCommitHook: expect.stringContaining('.husky/_/pre-commit'),
        command: 'npm run assets:sync',
        providerHead: fixture.mergeSha,
        stagedPaths: ['src/generated/characterCustomizationCatalog.ts'],
        ciCheck: 'passed',
      },
    });
    expect((await git(fixture.provider, 'rev-parse', 'HEAD')).stdout).toBe(
      sourceHead
    );
    expect(
      (
        await git(
          fixture.provider,
          'status',
          '--porcelain=v1',
          '--untracked-files=all'
        )
      ).stdout
    ).toBe(sourceStatus);
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
          currentProviderCompatibilityReady: true,
          webCompatibilityReady: false,
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
    [
      'arbitrary evidence path',
      (fixture: Fixture) => {
        fixture.receipt.currentCompatibilityOverlays[0].path =
          'evidence/999-unrelated/proof.json';
      },
    ],
    [
      'broadened current overlay scope',
      (fixture: Fixture) => {
        fixture.receipt.currentCompatibilityOverlays[0].allowedJsonFields.push(
          'historicalApproval.quote'
        );
      },
    ],
    [
      'broken prepared/publication hash chain',
      (fixture: Fixture) => {
        fixture.receipt.publication.sourceProviderReceiptSha256 = 'f'.repeat(
          64
        );
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
