#!/usr/bin/env node
/**
 * Verify a merged modular-customization provider receipt and expose it through
 * the ordinary Web asset sync. The default mode only prints a machine plan;
 * --apply is the sole mutation opt-in.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';

const TOOL = 'expose-provider-character-appearances@1';
const PUBLISHER = 'publish-modular-customization-provider@1';
const PREPARER = 'prepare-modular-customization-provider@1';
const PROVIDER_REPOSITORY = 'KirkDiggler/rpg-game-assets';
const WEB_REPOSITORY = 'KirkDiggler/rpg-dnd5e-web';
const SHA40 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const IDENTIFIER = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

class ExposureError extends Error {}
function requireCondition(value, message) {
  if (!value) throw new ExposureError(message);
}
function canonical(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    const detail =
      result.stderr?.trim() || result.stdout?.trim() || `exit ${result.status}`;
    throw new ExposureError(`${command} ${args.join(' ')} failed: ${detail}`);
  }
  return result.stdout.trim();
}
function git(root, ...args) {
  return run(process.env.RPG_EXPOSURE_GIT || 'git', args, { cwd: root });
}
function gh(...args) {
  return run(process.env.RPG_EXPOSURE_GH || 'gh', args);
}
function npm(root, args, env) {
  return run(process.env.RPG_EXPOSURE_NPM || 'npm', args, { cwd: root, env });
}
function npx(root, args, env) {
  return run(process.env.RPG_EXPOSURE_NPX || 'npx', args, { cwd: root, env });
}
function parseJson(text, label) {
  try {
    const value = JSON.parse(text);
    requireCondition(
      value && typeof value === 'object' && !Array.isArray(value),
      `${label} must be a JSON object`
    );
    return value;
  } catch (error) {
    if (error instanceof ExposureError) throw error;
    throw new ExposureError(`${label} is invalid JSON: ${error.message}`);
  }
}
function realFile(path, label) {
  const absolute = resolve(path);
  let status;
  try {
    status = lstatSync(absolute);
  } catch {
    throw new ExposureError(`missing ${label}: ${absolute}`);
  }
  requireCondition(
    status.isFile() && !status.isSymbolicLink() && status.size > 0,
    `${label} must be a non-empty real file: ${absolute}`
  );
  requireCondition(
    realpathSync(absolute) === absolute,
    `${label} must not traverse symlinks: ${absolute}`
  );
  return absolute;
}
function safeRelative(value, label) {
  requireCondition(
    typeof value === 'string' &&
      value &&
      !value.includes('\\') &&
      !isAbsolute(value),
    `${label} must be a POSIX relative path`
  );
  const parts = value.split('/');
  requireCondition(
    parts.every((part) => part && part !== '.' && part !== '..') &&
      parts.join('/') === value,
    `${label} is unsafe or non-canonical`
  );
  return value;
}
function identifier(value, label) {
  requireCondition(
    typeof value === 'string' && IDENTIFIER.test(value),
    `${label} must be a lowercase path-safe identifier`
  );
  return value;
}
function hash(value, label) {
  requireCondition(
    typeof value === 'string' && SHA256.test(value),
    `${label} must be a lowercase sha256`
  );
  return value;
}
function commit(value, label) {
  requireCondition(
    typeof value === 'string' && SHA40.test(value),
    `${label} must be a full Git commit`
  );
  return value;
}
function remoteMatches(remote, repository) {
  const normalized = remote.replace(/\.git$/, '').replace(/\/$/, '');
  return (
    normalized.endsWith(`github.com/${repository}`) ||
    normalized.endsWith(`github.com:${repository}`)
  );
}
function receiptRows(value, label) {
  requireCondition(
    Array.isArray(value) &&
      value.every(
        (row) => row && typeof row === 'object' && !Array.isArray(row)
      ),
    `${label} must be an array of objects`
  );
  return value;
}

function validateReceipt(receiptPath) {
  const path = realFile(receiptPath, 'provider receipt');
  const bytes = readFileSync(path);
  const receipt = parseJson(bytes.toString('utf8'), 'provider receipt');
  const status = receipt.status;
  if (
    receipt.tool === PREPARER &&
    status?.provider === 'prepared' &&
    status?.published === false &&
    status?.merged === false
  ) {
    return {
      blocked: true,
      path,
      sha256: digest(bytes),
      receipt,
      blockers: [
        'provider receipt is prepared/unpublished/unmerged; publish it, merge its private provider PR, then use the publisher resolve command to create a merged receipt',
      ],
    };
  }
  requireCondition(
    receipt.schemaVersion === 1 && receipt.tool === PUBLISHER,
    'input must be a publisher-produced merged provider receipt'
  );
  requireCondition(
    status?.provider === 'merged' &&
      status?.published === true &&
      status?.merged === true,
    'provider receipt must truthfully report published and merged state'
  );
  const provider = receipt.provider;
  const selection = receipt.selection;
  const publication = receipt.publication;
  requireCondition(
    provider?.repository === PROVIDER_REPOSITORY,
    `provider repository must be ${PROVIDER_REPOSITORY}`
  );
  requireCondition(provider.base === 'main', 'provider PR base must be main');
  requireCondition(
    typeof provider.branch === 'string' &&
      /^asset\/[0-9]+-[a-z0-9-]+-provider$/.test(provider.branch),
    'provider branch is invalid'
  );
  const providerHead = commit(provider.head, 'provider.head');
  const mergeSha = commit(provider.mergeSha, 'provider.mergeSha');
  requireCondition(
    typeof provider.pullRequest === 'string' &&
      /^https:\/\/github\.com\/KirkDiggler\/rpg-game-assets\/pull\/[0-9]+$/.test(
        provider.pullRequest
      ),
    'provider.pullRequest must identify the private provider repository'
  );
  const classRef = identifier(selection?.class, 'selection.class');
  requireCondition(
    Array.isArray(selection?.races) && selection.races.length > 0,
    'selection.races must be non-empty'
  );
  const races = selection.races.map((race, index) =>
    identifier(race, `selection.races[${index}]`)
  );
  requireCondition(
    new Set(races).size === races.length,
    'selection.races must be unique'
  );
  identifier(selection.outfitRecipe, 'selection.outfitRecipe');
  const sourceReceiptSha256 = hash(
    receipt.sourceProviderReceiptSha256,
    'sourceProviderReceiptSha256'
  );
  requireCondition(
    publication?.status === 'merged' &&
      publication.sourceProviderReceiptSha256 === sourceReceiptSha256,
    'publication provenance differs from the source prepared-receipt hash'
  );
  hash(
    publication.resolvedFromReceiptSha256,
    'publication.resolvedFromReceiptSha256'
  );
  requireCondition(
    publication.readback?.state === 'MERGED',
    'publication readback must report MERGED'
  );
  const handoff = receipt.sourceExportManifest;
  requireCondition(
    handoff && typeof handoff === 'object',
    'sourceExportManifest handoff is missing'
  );
  safeRelative(handoff.path, 'sourceExportManifest.path');
  hash(handoff.sha256, 'sourceExportManifest.sha256');
  requireCondition(
    Array.isArray(handoff.exports) && handoff.exports.length === races.length,
    'source export handoff must exactly cover selection.races'
  );
  requireCondition(
    handoff.exports
      .map((row, index) => {
        requireCondition(
          row?.race === races[index],
          `source export handoff race ${index} differs from selection`
        );
        safeRelative(row.path, `sourceExportManifest.exports[${index}].path`);
        hash(row.sha256, `sourceExportManifest.exports[${index}].sha256`);
        return true;
      })
      .every(Boolean),
    'source export handoff is invalid'
  );

  const expectedArtifacts = new Map();
  for (const race of races) {
    expectedArtifacts.set(
      `harness/models/synty/characters/customization/${race}-v1/bodies/${race}-${classRef}-body.glb`,
      'customizableBody'
    );
    expectedArtifacts.set(
      `harness/models/synty/characters/customization/${race}-v1/fallbacks/${race}-${classRef}-complete.glb`,
      'completeFallback'
    );
  }
  const outfit = selection.outfitRecipe;
  expectedArtifacts.set(
    `harness/models/synty/characters/outfit-customization/v1/masks/${classRef}-${outfit}.png`,
    'primarySecondaryMask'
  );
  const expectedDeclarations = new Set([
    ...races.map(
      (race) =>
        `harness/models/synty/characters/customization/${race}-v1/manifest.json`
    ),
    'harness/models/synty/characters/customization/manifest.json',
    'harness/models/synty/characters/outfit-customization/v1/manifest.json',
  ]);
  const expectedMetadata = new Set([
    'harness/models/synty/mesh-stats.json',
    'harness/catalogs/synty-complete-inventory.json',
  ]);
  const seen = new Set();
  const owned = [];
  for (const [key, expected] of [
    ['installedArtifacts', new Set(expectedArtifacts.keys())],
    ['declarations', expectedDeclarations],
    ['generatedMetadata', expectedMetadata],
  ]) {
    const actual = new Set();
    for (const [index, row] of receiptRows(receipt[key], key).entries()) {
      const artifactPath = safeRelative(row.path, `${key}[${index}].path`);
      requireCondition(
        !seen.has(artifactPath),
        `duplicate receipt-owned path: ${artifactPath}`
      );
      seen.add(artifactPath);
      actual.add(artifactPath);
      const sha256 = hash(row.sha256, `${key}[${index}].sha256`);
      requireCondition(
        Number.isSafeInteger(row.sizeBytes) && row.sizeBytes > 0,
        `${key}[${index}].sizeBytes must be positive`
      );
      if (key === 'installedArtifacts')
        requireCondition(
          row.role === expectedArtifacts.get(artifactPath),
          `artifact role/path is unbound: ${artifactPath}`
        );
      owned.push({
        path: artifactPath,
        sha256,
        sizeBytes: row.sizeBytes,
        group: key,
      });
    }
    requireCondition(
      actual.size === expected.size &&
        [...actual].every((item) => expected.has(item)),
      `${key} paths differ from the class/race receipt contract`
    );
  }
  const added = receipt.preservation?.addedFiles;
  const expectedAdded = [...expectedArtifacts.keys()]
    .map((path) => path.replace('harness/models/synty/', ''))
    .sort();
  requireCondition(
    JSON.stringify(added) === JSON.stringify(expectedAdded) &&
      receipt.preservation?.allOtherPreExistingFilesByteIdentical === true,
    'preservation binding differs from installed artifacts'
  );
  return {
    blocked: false,
    path,
    sha256: digest(bytes),
    receipt,
    provider,
    providerHead,
    mergeSha,
    classRef,
    races,
    owned,
  };
}

function verifyProvider(validated, providerRepo) {
  const root = realpathSync(resolve(providerRepo));
  requireCondition(
    lstatSync(root).isDirectory() && !lstatSync(root).isSymbolicLink(),
    'provider checkout must be a real directory'
  );
  requireCondition(
    realpathSync(git(root, 'rev-parse', '--show-toplevel')) === root,
    '--provider-repo must be the provider Git worktree root'
  );
  requireCondition(
    remoteMatches(
      git(root, 'config', '--get', 'remote.origin.url'),
      PROVIDER_REPOSITORY
    ),
    'provider checkout origin differs from receipt repository'
  );
  requireCondition(
    git(root, 'rev-parse', 'HEAD^{commit}') === validated.mergeSha,
    'provider checkout HEAD must be pinned to the verified merge SHA'
  );
  requireCondition(
    git(root, 'status', '--porcelain=v1', '--untracked-files=all') === '',
    'provider checkout must be exactly clean'
  );
  const repo = parseJson(
    gh(
      'repo',
      'view',
      PROVIDER_REPOSITORY,
      '--json',
      'nameWithOwner,isPrivate'
    ),
    'provider repository readback'
  );
  requireCondition(
    repo.nameWithOwner === PROVIDER_REPOSITORY && repo.isPrivate === true,
    'provider repository is public or mismatched'
  );
  const pr = parseJson(
    gh(
      'pr',
      'view',
      validated.provider.pullRequest,
      '--repo',
      PROVIDER_REPOSITORY,
      '--json',
      'number,url,state,headRefName,headRefOid,baseRefName,mergedAt,mergeCommit'
    ),
    'provider PR readback'
  );
  requireCondition(
    pr.url === validated.provider.pullRequest &&
      pr.state === 'MERGED' &&
      pr.headRefName === validated.provider.branch &&
      pr.headRefOid === validated.providerHead &&
      pr.baseRefName === 'main' &&
      pr.mergeCommit?.oid === validated.mergeSha,
    'provider PR merged identity differs from receipt'
  );
  for (const row of validated.owned) {
    const path = join(root, ...row.path.split('/'));
    const file = realFile(path, `receipt-owned provider path ${row.path}`);
    const inside = relative(root, file);
    requireCondition(
      inside && !inside.startsWith(`..${sep}`) && inside !== '..',
      `provider path escapes checkout: ${row.path}`
    );
    const bytes = readFileSync(file);
    requireCondition(
      bytes.length === row.sizeBytes && digest(bytes) === row.sha256,
      `provider artifact hash/size differs: ${row.path}`
    );
  }
  return { root, pr };
}

function webPreflight(webRepo, issue, classRef, worktreeRoot) {
  const root = realpathSync(resolve(webRepo));
  requireCondition(
    realpathSync(git(root, 'rev-parse', '--show-toplevel')) === root,
    '--web-repo must be the Web Git worktree root'
  );
  requireCondition(
    remoteMatches(
      git(root, 'config', '--get', 'remote.origin.url'),
      WEB_REPOSITORY
    ),
    `Web origin must be ${WEB_REPOSITORY}`
  );
  const baseHead = commit(
    git(root, 'rev-parse', 'origin/dev^{commit}'),
    'origin/dev'
  );
  let generator = '';
  try {
    generator = git(
      root,
      'show',
      'origin/dev:scripts/generateCharacterCustomizationCatalog.ts'
    );
  } catch {
    // Reported as a plan blocker below.
  }
  const toolingReady = generator.includes(
    'classOrder must declare at least one class'
  );
  const login = parseJson(gh('api', 'user'), 'gh login readback').login;
  requireCondition(
    typeof login === 'string' && login,
    'gh login did not return an authenticated login'
  );
  const commonDir = git(
    root,
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir'
  );
  const workspace = dirname(dirname(commonDir));
  const charter = readFileSync(
    realFile(
      join(
        workspace,
        'rpg-project',
        'docs',
        'teams',
        'roles',
        'ui-ux',
        'prompt.md'
      ),
      'bootstrapped UI/UX charter'
    ),
    'utf8'
  );
  requireCondition(
    /^## Signature\s*\n\s*— ui-ux agent, on behalf of <github-login>\s*$/m.test(
      charter
    ),
    'canonical UI/UX signature is missing or changed'
  );
  const query =
    'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){issue(number:$number){number state title url projectItems(first:50){nodes{project{number}}}}}}';
  const issueResponse = parseJson(
    gh(
      'api',
      'graphql',
      '-f',
      `query=${query}`,
      '-F',
      'owner=KirkDiggler',
      '-F',
      'name=rpg-dnd5e-web',
      '-F',
      `number=${issue}`
    ),
    'Web issue readback'
  );
  const issueRow = issueResponse?.data?.repository?.issue;
  requireCondition(
    issueRow?.number === issue && issueRow.state === 'OPEN',
    `Web issue #${issue} was not found or is not open`
  );
  requireCondition(
    issueRow.projectItems?.nodes?.some((node) => node?.project?.number === 19),
    `Web issue #${issue} is not on Project 19`
  );
  const branch = `feat/${issue}-${classRef}-provider-exposure`;
  const existing = parseJson(
    `{"rows":${gh('pr', 'list', '--repo', WEB_REPOSITORY, '--head', branch, '--state', 'all', '--json', 'number,url,state,headRefName')}}`,
    'existing Web PR readback'
  ).rows;
  requireCondition(
    Array.isArray(existing) && existing.length === 0,
    `Web publication PR already exists for ${branch}; inspect it instead of creating a duplicate`
  );
  return {
    root,
    baseHead,
    toolingReady,
    login,
    signature: `— ui-ux agent, on behalf of ${login}`,
    issue: issueRow,
    branch,
    worktree: resolve(
      worktreeRoot ||
        join(dirname(root), `.worktrees/${issue}-${classRef}-provider-exposure`)
    ),
  };
}

function changedPaths(root) {
  const output = git(root, 'status', '--porcelain=v1', '--untracked-files=all');
  if (!output) return [];
  return output.split('\n').map((line) => line.slice(3));
}

function apply(validated, provider, web, output) {
  const created = [];
  try {
    git(web.root, 'fetch', 'origin', 'dev');
    const freshBase = commit(
      git(web.root, 'rev-parse', 'origin/dev^{commit}'),
      'fresh origin/dev'
    );
    const generator = git(
      web.root,
      'show',
      'origin/dev:scripts/generateCharacterCustomizationCatalog.ts'
    );
    requireCondition(
      generator.includes('classOrder must declare at least one class'),
      'generic class tooling is not merged in fresh origin/dev; merge/review tooling before provider data'
    );
    requireCondition(
      !statProbe(web.worktree),
      `Web publication worktree already exists: ${web.worktree}`
    );
    const localBranch = spawnSync(
      process.env.RPG_EXPOSURE_GIT || 'git',
      ['show-ref', '--verify', '--quiet', `refs/heads/${web.branch}`],
      { cwd: web.root }
    );
    requireCondition(
      localBranch.status === 1,
      `local Web branch already exists: ${web.branch}`
    );
    const remoteBranch = spawnSync(
      process.env.RPG_EXPOSURE_GIT || 'git',
      ['ls-remote', '--exit-code', '--heads', 'origin', web.branch],
      { cwd: web.root }
    );
    requireCondition(
      remoteBranch.status === 2,
      `remote Web branch already exists or could not be safely checked: ${web.branch}`
    );
    git(
      web.root,
      'worktree',
      'add',
      '-b',
      web.branch,
      web.worktree,
      'origin/dev'
    );
    created.push(`branch ${web.branch}`, `worktree ${web.worktree}`);
    const syncEnv = {
      ...process.env,
      RPG_GAME_ASSETS_PATH: provider.root,
      RPG_WEB_ROOT: web.worktree,
      ASSETS_SYNC_SKIP_UPDATE: '1',
    };
    npm(web.worktree, ['ci', '--ignore-scripts'], syncEnv);
    npm(web.worktree, ['run', 'assets:sync'], syncEnv);
    const paths = changedPaths(web.worktree);
    requireCondition(
      paths.length > 0,
      'ordinary assets:sync produced no tracked Web output'
    );
    requireCondition(
      paths.every(
        (path) => path === 'src/generated/characterCustomizationCatalog.ts'
      ),
      `assets:sync changed files outside its generated catalog: ${paths.join(', ')}`
    );
    const catalog = readFileSync(
      join(web.worktree, 'src/generated/characterCustomizationCatalog.ts'),
      'utf8'
    );
    requireCondition(
      catalog.includes(validated.mergeSha),
      'generated catalog does not bind the verified provider merge SHA'
    );
    for (const race of validated.races)
      requireCondition(
        catalog.includes(`${race}:${validated.classRef}`),
        `generated catalog omitted ${race}:${validated.classRef}`
      );
    npx(
      web.worktree,
      [
        'vitest',
        'run',
        'scripts/generateCharacterCustomizationCatalog.test.ts',
        'src/components/hex-grid/classCharacterModels.test.ts',
      ],
      syncEnv
    );
    npm(web.worktree, ['run', 'ci-check'], syncEnv);
    git(web.worktree, 'add', '--', ...paths);
    const staged = git(web.worktree, 'diff', '--cached', '--name-only')
      .split('\n')
      .filter(Boolean);
    requireCondition(
      JSON.stringify(staged.sort()) === JSON.stringify([...paths].sort()),
      'staged paths differ from exact generated outputs'
    );
    requireCondition(
      !staged.some(
        (path) =>
          /(^|\/)(?:.*\.blend|.*\.glb)$/.test(path) ||
          path.startsWith('public/models/')
      ),
      'licensed source/runtime paths may not be staged'
    );
    git(
      web.worktree,
      'commit',
      '-m',
      `Expose ${validated.classRef} provider appearances`,
      '-m',
      `Closes #${web.issue.number}\n\n${web.signature}`
    );
    const head = commit(
      git(web.worktree, 'rev-parse', 'HEAD^{commit}'),
      'Web head'
    );
    created.push(`commit ${head}`);
    git(web.worktree, 'push', '--set-upstream', 'origin', web.branch);
    created.push(`remote branch origin/${web.branch}`);
    const title = `Expose ${validated.classRef} provider appearances`;
    const body = `Closes #${web.issue.number}\n\nConsumes the verified merged private-provider receipt through the ordinary assets:sync path. No licensed runtime bytes are committed.\n\n${web.signature}`;
    const prUrl = gh(
      'pr',
      'create',
      '--repo',
      WEB_REPOSITORY,
      '--base',
      'dev',
      '--head',
      web.branch,
      '--title',
      title,
      '--body',
      body
    );
    requireCondition(
      /^https:\/\/github\.com\/KirkDiggler\/rpg-dnd5e-web\/pull\/[0-9]+$/.test(
        prUrl
      ),
      'gh pr create did not return the expected Web PR URL'
    );
    created.push(`PR ${prUrl}`);
    const readback = parseJson(
      gh(
        'pr',
        'view',
        prUrl,
        '--repo',
        WEB_REPOSITORY,
        '--json',
        'number,url,state,headRefName,headRefOid,baseRefName,mergedAt,mergeCommit'
      ),
      'Web PR readback'
    );
    requireCondition(
      readback.url === prUrl &&
        readback.state === 'OPEN' &&
        readback.headRefName === web.branch &&
        readback.headRefOid === head &&
        readback.baseRefName === 'dev',
      'Web PR readback differs from created refs'
    );
    const receipt = {
      schemaVersion: 1,
      tool: TOOL,
      sourceProviderReceipt: validated.path,
      sourceProviderReceiptSha256: validated.sha256,
      provider: {
        repository: PROVIDER_REPOSITORY,
        mergeSha: validated.mergeSha,
        publishedHead: validated.providerHead,
        pullRequest: validated.provider.pullRequest,
        class: validated.classRef,
        races: validated.races,
      },
      web: {
        repository: WEB_REPOSITORY,
        base: 'dev',
        baseHead: freshBase,
        branch: web.branch,
        head,
        pullRequest: prUrl,
        status: 'OPEN',
        issue: web.issue.number,
        project: 19,
      },
      generation: {
        dependencyInstall: 'npm ci --ignore-scripts',
        command: 'npm run assets:sync',
        providerCheckout: provider.root,
        providerHead: validated.mergeSha,
        stagedPaths: staged,
        focusedTests: [
          'scripts/generateCharacterCustomizationCatalog.test.ts',
          'src/components/hex-grid/classCharacterModels.test.ts',
        ],
        ciCheck: 'passed',
      },
      status: { provider: 'merged', web: 'published', applied: true },
    };
    requireCondition(
      !statProbe(output),
      `Web receipt output already exists: ${output}`
    );
    writeFileSync(output, canonical(receipt), { flag: 'wx' });
    return { receipt, output };
  } catch (error) {
    const recovery = created.length
      ? created.join(', ')
      : 'no Git/GitHub state created';
    throw new ExposureError(
      `${error.message}; recoverable state preserved: ${recovery}`
    );
  }
}
function statProbe(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function args(argv) {
  const parsed = {
    apply: false,
    webRepo: resolve(new URL('..', import.meta.url).pathname),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--apply') parsed.apply = true;
    else if (
      [
        '--provider-receipt',
        '--provider-repo',
        '--web-repo',
        '--web-issue',
        '--worktree-root',
        '--output',
      ].includes(key)
    )
      parsed[key.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] =
        argv[++index];
    else throw new ExposureError(`unknown argument: ${key}`);
  }
  requireCondition(
    parsed.providerReceipt && parsed.providerRepo && parsed.webIssue,
    '--provider-receipt, --provider-repo, and explicit --web-issue are required'
  );
  const issue = Number(parsed.webIssue);
  requireCondition(
    Number.isSafeInteger(issue) && issue > 0,
    '--web-issue must be a positive integer'
  );
  parsed.webIssue = issue;
  return parsed;
}

function main() {
  const options = args(process.argv.slice(2));
  const validated = validateReceipt(options.providerReceipt);
  if (validated.blocked) {
    const plan = {
      schemaVersion: 1,
      tool: TOOL,
      mode: 'dry-run',
      mutationsPerformed: false,
      ready: false,
      sourceProviderReceipt: validated.path,
      sourceProviderReceiptSha256: validated.sha256,
      blockers: validated.blockers,
    };
    process.stdout.write(canonical(plan));
    if (options.apply)
      throw new ExposureError(
        `exposure blocked: ${validated.blockers.join('; ')}`
      );
    return;
  }
  const provider = verifyProvider(validated, options.providerRepo);
  const web = webPreflight(
    options.webRepo,
    options.webIssue,
    validated.classRef,
    options.worktreeRoot
  );
  const blockers = web.toolingReady
    ? []
    : [
        'generic class tooling is not merged in Web origin/dev; merge/review tooling before provider data',
      ];
  const output = resolve(
    options.output || join(dirname(validated.path), 'web-receipt.json')
  );
  const plan = {
    schemaVersion: 1,
    tool: TOOL,
    mode: options.apply ? 'apply' : 'dry-run',
    mutationsPerformed: false,
    ready: blockers.length === 0,
    blockers,
    sourceProviderReceipt: validated.path,
    sourceProviderReceiptSha256: validated.sha256,
    provider: {
      repository: PROVIDER_REPOSITORY,
      mergeSha: validated.mergeSha,
      class: validated.classRef,
      races: validated.races,
    },
    web: {
      repository: WEB_REPOSITORY,
      base: 'dev',
      baseHead: web.baseHead,
      issue: options.webIssue,
      project: 19,
      branch: web.branch,
      worktree: web.worktree,
      receipt: output,
    },
    plannedMutations: [
      'fetch fresh origin/dev',
      'create isolated numbered Web issue worktree/branch',
      'install the lockfile-pinned Web dependencies without lifecycle scripts',
      'run ordinary npm run assets:sync with the verified pinned provider checkout',
      'stage only the generated customization catalog',
      'run focused tests and mandatory ci-check',
      'commit with normal hooks',
      'non-force push',
      'open PR against dev',
      'verify PR readback',
      'write Web receipt',
    ],
  };
  if (!options.apply) {
    process.stdout.write(canonical(plan));
    return;
  }
  requireCondition(
    blockers.length === 0,
    `exposure blocked: ${blockers.join('; ')}`
  );
  const result = apply(validated, provider, web, output);
  process.stdout.write(
    canonical({
      ...plan,
      mutationsPerformed: true,
      ready: true,
      webReceipt: result.output,
      web: result.receipt.web,
    })
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`error: ${message}\n`);
  process.exitCode = 1;
}
