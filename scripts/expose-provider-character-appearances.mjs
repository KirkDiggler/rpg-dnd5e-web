#!/usr/bin/env node
/**
 * Verify a merged modular-customization provider receipt and expose it through
 * the ordinary Web asset sync. The default mode only prints a machine plan;
 * --apply is the sole mutation opt-in.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';

const TOOL = 'expose-provider-character-appearances@2';
const PUBLISHER = 'publish-modular-customization-provider@2';
const PREPARER = 'prepare-modular-customization-provider@2';
const PROVIDER_REPOSITORY = 'KirkDiggler/rpg-game-assets';
const WEB_REPOSITORY = 'KirkDiggler/rpg-dnd5e-web';
const CURRENT_OVERLAY_PATH = 'evidence/117-all-race-hair/verification.json';
const CURRENT_OVERLAY_KIND = 'live-117-provider-metadata-overlay';
const CURRENT_OVERLAY_ALLOWED_FIELDS = [
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
const GENERATED_CATALOG = 'src/generated/characterCustomizationCatalog.ts';
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
  return options.raw ? result.stdout : result.stdout.trim();
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
function sourceReceiptPath(value, label) {
  requireCondition(
    typeof value === 'string' &&
      value &&
      !value.includes('\\') &&
      !value.includes('\0'),
    `${label} must be a non-empty POSIX path`
  );
  const absolute = value.startsWith('/');
  const parts = value.split('/').slice(absolute ? 1 : 0);
  requireCondition(
    parts.length > 0 &&
      parts.every((part) => part && part !== '.' && part !== '..'),
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
function jsonField(document, dotted, label = 'current compatibility overlay') {
  let target = document;
  for (const part of dotted.split('.')) {
    requireCondition(
      target &&
        typeof target === 'object' &&
        !Array.isArray(target) &&
        Object.hasOwn(target, part),
      `${label} is missing allowed field: ${dotted}`
    );
    target = target[part];
  }
  return target;
}
function setJsonField(document, dotted, value, label) {
  const parts = dotted.split('.');
  let target = document;
  for (const part of parts.slice(0, -1)) {
    requireCondition(
      target &&
        typeof target === 'object' &&
        !Array.isArray(target) &&
        Object.hasOwn(target, part),
      `${label} is missing field parent: ${dotted}`
    );
    target = target[part];
  }
  requireCondition(
    target &&
      typeof target === 'object' &&
      !Array.isArray(target) &&
      Object.hasOwn(target, parts.at(-1)),
    `${label} is missing field: ${dotted}`
  );
  target[parts.at(-1)] = value;
}
function positiveInteger(value, label, { allowZero = false } = {}) {
  requireCondition(
    Number.isSafeInteger(value) && (allowZero ? value >= 0 : value > 0),
    `${label} must be ${allowZero ? 'a non-negative' : 'a positive'} integer`
  );
  return value;
}

function validateReceipt(receiptPath) {
  const path = realFile(receiptPath, 'provider receipt');
  const bytes = readFileSync(path);
  const receipt = parseJson(bytes.toString('utf8'), 'provider receipt');
  const status = receipt.status;
  if (
    receipt.schemaVersion === 2 &&
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
    receipt.schemaVersion === 2 && receipt.tool === PUBLISHER,
    'input must be a schema-v2 publisher-produced merged provider receipt'
  );
  requireCondition(
    status?.provider === 'merged' &&
      status?.published === true &&
      status?.merged === true &&
      status?.currentProviderCompatibilityReady === true &&
      status?.webCompatibilityReady === false,
    'provider receipt must truthfully report merged current-provider state before Web exposure'
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
  const baselineHead = commit(provider.baselineHead, 'provider.baselineHead');
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
    publication?.implemented === true &&
      publication?.operatorJsonEditingRequired === false &&
      publication?.status === 'merged' &&
      publication?.project === 19 &&
      Number.isSafeInteger(publication?.issue) &&
      publication.issue > 0 &&
      publication.sourceProviderReceiptSha256 === sourceReceiptSha256,
    'publication provenance differs from the corrected publisher receipt chain'
  );
  const resolvedFromReceiptSha256 = hash(
    publication.resolvedFromReceiptSha256,
    'publication.resolvedFromReceiptSha256'
  );
  requireCondition(
    resolvedFromReceiptSha256 !== sourceReceiptSha256,
    'published and prepared receipt hashes must identify distinct chain links'
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
  sourceReceiptPath(handoff.path, 'sourceExportManifest.path');
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
        sourceReceiptPath(
          row.path,
          `sourceExportManifest.exports[${index}].path`
        );
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
  const expectedCurrentOverlays = new Set([CURRENT_OVERLAY_PATH]);
  const seen = new Set();
  const owned = [];
  for (const [key, expected] of [
    ['installedArtifacts', new Set(expectedArtifacts.keys())],
    ['declarations', expectedDeclarations],
    ['generatedMetadata', expectedMetadata],
    ['currentCompatibilityOverlays', expectedCurrentOverlays],
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
      if (key === 'installedArtifacts') {
        requireCondition(
          row.role === expectedArtifacts.get(artifactPath),
          `artifact role/path is unbound: ${artifactPath}`
        );
      } else if (key === 'currentCompatibilityOverlays') {
        requireCondition(
          JSON.stringify(Object.keys(row).sort()) ===
            JSON.stringify(
              [
                'allowedJsonFields',
                'baselineHead',
                'baselineSha256',
                'kind',
                'path',
                'schemaVersion',
                'sha256',
                'sizeBytes',
              ].sort()
            ),
          'current compatibility overlay record keys differ from the corrected provider interface'
        );
        requireCondition(
          row.schemaVersion === 1 && row.kind === CURRENT_OVERLAY_KIND,
          'current compatibility overlay kind/version differs'
        );
        requireCondition(
          row.baselineHead === baselineHead,
          'current compatibility overlay baselineHead differs from provider baseline'
        );
        hash(
          row.baselineSha256,
          'currentCompatibilityOverlays[0].baselineSha256'
        );
        requireCondition(
          JSON.stringify(row.allowedJsonFields) ===
            JSON.stringify(CURRENT_OVERLAY_ALLOWED_FIELDS),
          'current compatibility overlay allowedJsonFields differ from the exact #117 scope'
        );
      }
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
  const changed = receipt.preservation?.changedCumulativeFiles;
  const expectedArtifactInventoryPaths = new Set(
    [...expectedArtifacts.keys()].map((path) =>
      path.replace('harness/models/synty/', '')
    )
  );
  const expectedOwnedInventoryPaths = new Set(
    owned
      .filter((row) => row.path.startsWith('harness/models/synty/'))
      .map((row) => row.path.replace('harness/models/synty/', ''))
  );
  requireCondition(
    Array.isArray(added) &&
      new Set(added).size === added.length &&
      added.every(
        (path) =>
          typeof path === 'string' && expectedArtifactInventoryPaths.has(path)
      ),
    'preservation.addedFiles contains a duplicate or non-artifact path'
  );
  requireCondition(
    Array.isArray(changed) &&
      new Set(changed).size === changed.length &&
      changed.every(
        (path) =>
          typeof path === 'string' && expectedOwnedInventoryPaths.has(path)
      ),
    'preservation.changedCumulativeFiles contains a duplicate or unowned path'
  );
  requireCondition(
    added.every((path) => !changed.includes(path)) &&
      receipt.preservation?.allOtherPreExistingFilesByteIdentical === true,
    'preservation state is contradictory or incomplete'
  );
  return {
    blocked: false,
    path,
    sha256: digest(bytes),
    receipt,
    provider,
    providerHead,
    mergeSha,
    baselineHead,
    classRef,
    races,
    owned,
    currentOverlay: receipt.currentCompatibilityOverlays[0],
  };
}

function gitBlob(root, revision, path, label) {
  const result = spawnSync(
    process.env.RPG_EXPOSURE_GIT || 'git',
    ['show', `${revision}:${path}`],
    { cwd: root }
  );
  requireCondition(result.status === 0, `missing ${label}: ${path}`);
  return result.stdout;
}
function gitBlobOrNull(root, revision, path) {
  const result = spawnSync(
    process.env.RPG_EXPOSURE_GIT || 'git',
    ['show', `${revision}:${path}`],
    { cwd: root }
  );
  if (result.status !== 0) return null;
  return result.stdout;
}

function parseJsonBytes(bytes, label) {
  return parseJson(bytes.toString('utf8'), label);
}

function gitCustomizationTreeMetadata(root, revision) {
  const prefix = 'harness/models/synty/characters/customization';
  const output = run(
    process.env.RPG_EXPOSURE_GIT || 'git',
    ['ls-tree', '-r', '-l', revision, '--', prefix],
    { cwd: root }
  );
  const rows = output ? output.split('\n') : [];
  const records = rows.map((line) => {
    const match = /^(\d+) (\w+) ([0-9a-f]{40})\s+(\d+)\t(.+)$/.exec(line);
    requireCondition(
      match,
      `invalid Git tree row for current runtime: ${line}`
    );
    const [, mode, type, oid, sizeText, path] = match;
    requireCondition(
      type === 'blob' && (mode === '100644' || mode === '100755'),
      `current runtime contains a non-file or symbolic path: ${path}`
    );
    requireCondition(
      path.startsWith(`${prefix}/`),
      `current runtime path escapes its exact root: ${path}`
    );
    const size = positiveInteger(
      Number(sizeText),
      `current runtime size for ${path}`
    );
    const blob = spawnSync(
      process.env.RPG_EXPOSURE_GIT || 'git',
      ['cat-file', 'blob', oid],
      { cwd: root }
    );
    requireCondition(
      blob.status === 0 && blob.stdout.length === size,
      `could not hash current runtime blob: ${path}`
    );
    return {
      path: path.slice(prefix.length + 1),
      size,
      sha256: digest(blob.stdout),
    };
  });
  const tree = createHash('sha256');
  for (const row of records.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  )) {
    tree.update(row.path);
    tree.update('\0');
    tree.update(String(row.size));
    tree.update('\0');
    tree.update(row.sha256);
    tree.update('\n');
  }
  return { fileCount: records.length, treeSha256: tree.digest('hex') };
}

function validateMergedCurrentOverlay(validated, root) {
  const row = validated.currentOverlay;
  const baselineBytes = gitBlob(
    root,
    validated.baselineHead,
    CURRENT_OVERLAY_PATH,
    'Git-baseline #117 compatibility receipt'
  );
  requireCondition(
    digest(baselineBytes) === row.baselineSha256,
    'current compatibility overlay baseline hash differs from Git'
  );
  const overlayBytes = gitBlob(
    root,
    validated.mergeSha,
    CURRENT_OVERLAY_PATH,
    'merged #117 compatibility overlay'
  );
  requireCondition(
    overlayBytes.length === row.sizeBytes &&
      digest(overlayBytes) === row.sha256,
    'merged #117 compatibility overlay hash/size differs from receipt'
  );
  const baseline = parseJsonBytes(
    baselineBytes,
    'Git-baseline #117 compatibility receipt'
  );
  const overlay = parseJsonBytes(
    overlayBytes,
    'merged #117 compatibility overlay'
  );
  requireCondition(
    Buffer.compare(Buffer.from(canonical(overlay)), overlayBytes) === 0,
    'merged #117 compatibility overlay is not canonical JSON'
  );
  const scoped = structuredClone(baseline);
  for (const field of CURRENT_OVERLAY_ALLOWED_FIELDS) {
    setJsonField(
      scoped,
      field,
      jsonField(overlay, field),
      'Git-baseline #117 compatibility receipt'
    );
  }
  requireCondition(
    JSON.stringify(scoped) === JSON.stringify(overlay),
    'current compatibility overlay changes JSON outside its exact allowed fields'
  );

  const ownedMetadata = new Map(
    validated.owned
      .filter((owned) => owned.group === 'generatedMetadata')
      .map((owned) => [owned.path, owned])
  );
  const inventoryPath = 'harness/catalogs/synty-complete-inventory.json';
  const meshStatsPath = 'harness/models/synty/mesh-stats.json';
  const inventoryRow = ownedMetadata.get(inventoryPath);
  const meshStatsRow = ownedMetadata.get(meshStatsPath);
  const inventory = parseJsonBytes(
    gitBlob(
      root,
      validated.mergeSha,
      inventoryPath,
      'merged inventory metadata'
    ),
    'merged inventory metadata'
  );
  const meshStats = parseJsonBytes(
    gitBlob(
      root,
      validated.mergeSha,
      meshStatsPath,
      'merged mesh-stats metadata'
    ),
    'merged mesh-stats metadata'
  );
  const expected = {
    'providerMetadata.inventory.path': inventoryPath,
    'providerMetadata.inventory.sizeBytes': inventoryRow.sizeBytes,
    'providerMetadata.inventory.sha256': inventoryRow.sha256,
    'providerMetadata.inventory.fileCount': inventory.fileCount,
    'providerMetadata.inventory.treeSha256': inventory.treeSha256,
    'providerMetadata.meshStats.path': meshStatsPath,
    'providerMetadata.meshStats.sizeBytes': meshStatsRow.sizeBytes,
    'providerMetadata.meshStats.sha256': meshStatsRow.sha256,
    'providerMetadata.meshStats.assetCount': meshStats.assetCount,
  };
  Object.assign(
    expected,
    Object.fromEntries(
      Object.entries(
        gitCustomizationTreeMetadata(root, validated.mergeSha)
      ).map(([key, value]) => [`providerMetadata.runtime.${key}`, value])
    )
  );
  for (const [field, value] of Object.entries(expected)) {
    requireCondition(
      jsonField(overlay, field) === value,
      `current compatibility overlay field differs from merged provider: ${field}`
    );
  }
}

function verifyMergedProviderCommit(validated, root) {
  for (const row of validated.owned) {
    const blob = gitBlob(
      root,
      validated.mergeSha,
      row.path,
      `receipt-owned provider path at verified merge`
    );
    requireCondition(
      blob.length === row.sizeBytes && digest(blob) === row.sha256,
      `provider artifact hash/size differs at verified merge: ${row.path}`
    );
  }
  const syntyPrefix = 'harness/models/synty/';
  const expectedAdded = validated.owned
    .filter(
      (row) =>
        row.group === 'installedArtifacts' &&
        gitBlobOrNull(root, validated.baselineHead, row.path) === null
    )
    .map((row) => row.path.slice(syntyPrefix.length))
    .sort();
  const expectedChanged = validated.owned
    .filter((row) => row.path.startsWith(syntyPrefix))
    .filter((row) => {
      const baseline = gitBlobOrNull(root, validated.baselineHead, row.path);
      return baseline !== null && digest(baseline) !== row.sha256;
    })
    .map((row) => row.path.slice(syntyPrefix.length))
    .sort();
  requireCondition(
    JSON.stringify(validated.receipt.preservation.addedFiles) ===
      JSON.stringify(expectedAdded),
    'preservation.addedFiles differs from the Git baseline/merged provider'
  );
  requireCondition(
    JSON.stringify(validated.receipt.preservation.changedCumulativeFiles) ===
      JSON.stringify(expectedChanged),
    'preservation.changedCumulativeFiles differs from the Git baseline/merged provider'
  );
  validateMergedCurrentOverlay(validated, root);
}

function verifyProviderSource(validated, providerRepo) {
  const root = realpathSync(resolve(providerRepo));
  requireCondition(
    lstatSync(root).isDirectory() && !lstatSync(root).isSymbolicLink(),
    'provider repository source must be a real directory'
  );
  requireCondition(
    realpathSync(git(root, 'rev-parse', '--show-toplevel')) === root,
    '--provider-repo must be an existing provider Git worktree root'
  );
  requireCondition(
    remoteMatches(
      git(root, 'config', '--get', 'remote.origin.url'),
      PROVIDER_REPOSITORY
    ),
    'provider repository source origin differs from receipt repository'
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
  const commonDir = realpathSync(
    git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir')
  );
  const mainRoot = dirname(commonDir);
  const objectProbe = spawnSync(
    process.env.RPG_EXPOSURE_GIT || 'git',
    ['cat-file', '-e', `${validated.mergeSha}^{commit}`],
    { cwd: root }
  );
  const needsFetch = objectProbe.status !== 0;
  if (!needsFetch) verifyMergedProviderCommit(validated, root);
  return {
    root,
    pr,
    commonDir,
    mainRoot,
    needsFetch,
    worktree: join(
      mainRoot,
      '.worktrees',
      `.provider-${validated.classRef}-${validated.mergeSha.slice(0, 12)}`
    ),
  };
}

function pinProvider(validated, source, created) {
  if (source.needsFetch) {
    git(source.root, 'fetch', 'origin', validated.mergeSha);
    requireCondition(
      git(source.root, 'rev-parse', 'FETCH_HEAD^{commit}') ===
        validated.mergeSha,
      'provider fetch did not resolve the verified receipt merge SHA'
    );
    verifyMergedProviderCommit(validated, source.root);
  }
  requireCondition(
    !statProbe(source.worktree),
    `isolated provider worktree already exists: ${source.worktree}`
  );
  mkdirSync(dirname(source.worktree), { recursive: true });
  git(
    source.root,
    'worktree',
    'add',
    '--detach',
    source.worktree,
    validated.mergeSha
  );
  created.push(`provider worktree ${source.worktree}`);
  const root = realpathSync(source.worktree);
  requireCondition(
    git(root, 'rev-parse', 'HEAD^{commit}') === validated.mergeSha,
    'isolated provider worktree is not pinned to the verified merge SHA'
  );
  requireCondition(
    git(root, 'status', '--porcelain=v1', '--untracked-files=all') === '',
    'isolated provider worktree must be exactly clean'
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
  return { ...source, root };
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
        join(
          dirname(commonDir),
          `.worktrees/${issue}-${classRef}-provider-exposure`
        )
    ),
  };
}

function statusEntries(root) {
  const output = run(
    process.env.RPG_EXPOSURE_GIT || 'git',
    ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    { cwd: root, raw: true }
  );
  if (!output) return [];
  const records = output.split('\0');
  requireCondition(
    records.pop() === '',
    'Git returned unterminated porcelain status output'
  );
  const entries = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    requireCondition(
      record.length >= 4 && record[2] === ' ',
      'Git returned malformed porcelain status output'
    );
    entries.push({ status: record.slice(0, 2), path: record.slice(3) });
    if ('RC'.includes(record[0]) || 'RC'.includes(record[1])) {
      index += 1;
      requireCondition(
        index < records.length && records[index].length > 0,
        'Git returned malformed rename/copy status output'
      );
    }
  }
  return entries;
}

function changedPaths(root) {
  return statusEntries(root).map((entry) => entry.path);
}

function effectivePreCommit(root) {
  const hook = git(
    root,
    'rev-parse',
    '--path-format=absolute',
    '--git-path',
    'hooks/pre-commit'
  );
  let status;
  try {
    status = lstatSync(hook);
  } catch {
    throw new ExposureError(
      `Husky setup did not create the configured pre-commit hook: ${hook}`
    );
  }
  requireCondition(
    status.isFile() && !status.isSymbolicLink() && (status.mode & 0o111) !== 0,
    `configured pre-commit hook is not an executable real file: ${hook}`
  );
  return hook;
}

function resumeState(validated, providerSource, web, baseHead) {
  requireCondition(
    statProbe(providerSource.worktree),
    `expected pinned provider worktree is missing: ${providerSource.worktree}`
  );
  const providerRoot = realpathSync(providerSource.worktree);
  requireCondition(
    realpathSync(
      git(
        providerRoot,
        'rev-parse',
        '--path-format=absolute',
        '--git-common-dir'
      )
    ) === providerSource.commonDir,
    'pinned provider worktree belongs to an unexpected repository/common root'
  );
  requireCondition(
    git(providerRoot, 'rev-parse', 'HEAD^{commit}') === validated.mergeSha,
    'pinned provider worktree is not at the receipt merge SHA'
  );
  requireCondition(
    changedPaths(providerRoot).length === 0,
    'pinned provider worktree must be exactly clean'
  );
  for (const state of [
    'MERGE_HEAD',
    'rebase-merge',
    'rebase-apply',
    'index.lock',
  ]) {
    const path = git(
      providerRoot,
      'rev-parse',
      '--path-format=absolute',
      '--git-path',
      state
    );
    requireCondition(
      !statProbe(path),
      `resume refuses provider Git operation or lock state: ${state}`
    );
  }
  verifyMergedProviderCommit(validated, providerRoot);

  requireCondition(
    statProbe(web.worktree),
    `expected issue-owned Web worktree is missing: ${web.worktree}`
  );
  const webRoot = realpathSync(web.worktree);
  requireCondition(
    webRoot === resolve(web.worktree) &&
      realpathSync(git(webRoot, 'rev-parse', '--show-toplevel')) === webRoot,
    'resume Web worktree path is not the exact expected repository root'
  );
  const expectedCommon = realpathSync(
    git(web.root, 'rev-parse', '--path-format=absolute', '--git-common-dir')
  );
  requireCondition(
    realpathSync(
      git(webRoot, 'rev-parse', '--path-format=absolute', '--git-common-dir')
    ) === expectedCommon,
    'resume Web worktree belongs to an unexpected repository/common root'
  );
  requireCondition(
    git(webRoot, 'branch', '--show-current') === web.branch,
    `resume Web worktree is not on expected issue-derived branch ${web.branch}`
  );
  const remoteBranch = spawnSync(
    process.env.RPG_EXPOSURE_GIT || 'git',
    ['ls-remote', '--exit-code', '--heads', 'origin', web.branch],
    { cwd: webRoot }
  );
  requireCondition(
    remoteBranch.status === 2,
    `remote Web branch already exists or could not be safely checked: ${web.branch}`
  );
  for (const state of [
    'MERGE_HEAD',
    'rebase-merge',
    'rebase-apply',
    'index.lock',
  ]) {
    const path = git(
      webRoot,
      'rev-parse',
      '--path-format=absolute',
      '--git-path',
      state
    );
    requireCondition(
      !statProbe(path),
      `resume refuses active Git operation or lock state: ${state}`
    );
  }
  const head = commit(
    git(webRoot, 'rev-parse', 'HEAD^{commit}'),
    'resume Web head'
  );
  const ancestor = spawnSync(
    process.env.RPG_EXPOSURE_GIT || 'git',
    ['merge-base', '--is-ancestor', head, baseHead],
    { cwd: webRoot }
  );
  requireCondition(
    ancestor.status === 0,
    'resume v1 requires no Web commits ahead of the current dev base'
  );
  requireCondition(
    git(
      webRoot,
      'diff',
      '--name-only',
      head,
      baseHead,
      '--',
      GENERATED_CATALOG
    ) === '',
    'current dev changed the generated catalog; resume cannot overwrite upstream or user data'
  );
  const entries = statusEntries(webRoot);
  requireCondition(
    entries.length === 1 &&
      entries[0].path === GENERATED_CATALOG &&
      entries[0].status === ' M',
    'pre-commit resume requires an unstaged dirty set containing only the generated catalog'
  );
  return { provider: { ...providerSource, root: providerRoot }, webRoot, head };
}

function apply(validated, providerSource, web, output, resume = false) {
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
    let provider;
    if (resume) {
      const state = resumeState(validated, providerSource, web, freshBase);
      provider = state.provider;
      if (state.head !== freshBase)
        git(state.webRoot, 'merge', '--ff-only', freshBase);
      created.push(`resumed existing worktree ${state.webRoot}`);
    } else {
      provider = pinProvider(validated, providerSource, created);
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
    }
    const syncEnv = {
      ...process.env,
      RPG_GAME_ASSETS_PATH: provider.root,
      RPG_WEB_ROOT: web.worktree,
      ASSETS_SYNC_SKIP_UPDATE: '1',
    };
    npm(web.worktree, ['ci', '--ignore-scripts'], syncEnv);
    npm(web.worktree, ['run', 'prepare'], syncEnv);
    const preCommitHook = effectivePreCommit(web.worktree);
    if (resume) {
      const temporary = mkdtempSync(join(tmpdir(), 'web-exposure-resume-'));
      const generated = join(temporary, 'characterCustomizationCatalog.ts');
      try {
        npx(
          web.worktree,
          [
            '--no-install',
            'tsx',
            'scripts/generateCharacterCustomizationCatalog.ts',
            '--provider-root',
            provider.root,
            '--output',
            generated,
          ],
          syncEnv
        );
        requireCondition(
          readFileSync(join(web.worktree, GENERATED_CATALOG), 'utf8') ===
            readFileSync(generated, 'utf8'),
          'existing generated catalog does not match fresh generator output from the verified provider'
        );
      } finally {
        rmSync(temporary, { recursive: true, force: true });
      }
    }
    const syncOutput = npm(web.worktree, ['run', 'assets:sync'], syncEnv);
    const paths = changedPaths(web.worktree);
    requireCondition(
      paths.length > 0,
      'ordinary assets:sync produced no tracked Web output'
    );
    requireCondition(
      paths.length === 1 && paths[0] === GENERATED_CATALOG,
      `assets:sync changed files outside its generated catalog: ${paths.join(', ')}`
    );
    const catalog = readFileSync(join(web.worktree, GENERATED_CATALOG), 'utf8');
    requireCondition(
      catalog.includes(validated.mergeSha),
      'generated catalog does not bind the verified provider merge SHA'
    );
    for (const race of validated.races)
      requireCondition(
        catalog.includes(`combination: '${race}:${validated.classRef}'`),
        `generated catalog omitted ${race}:${validated.classRef}`
      );
    const outfitManifest = parseJson(
      readFileSync(
        join(
          provider.root,
          'harness/models/synty/characters/outfit-customization/v1/manifest.json'
        ),
        'utf8'
      ),
      'pinned provider outfit manifest'
    );
    requireCondition(
      Array.isArray(outfitManifest.classOrder) &&
        outfitManifest.classOrder.length > 0 &&
        outfitManifest.classOrder.every(
          (classRef) =>
            typeof classRef === 'string' && IDENTIFIER.test(classRef)
        ) &&
        new Set(outfitManifest.classOrder).size ===
          outfitManifest.classOrder.length,
      'pinned provider classOrder must contain unique class identifiers'
    );
    const classCount = outfitManifest.classOrder.length;
    const combinations = catalog.match(/combination: '[^']+'/g) || [];
    requireCondition(
      combinations.length === validated.races.length * classCount,
      `generated body count differs from provider declarations: expected ${validated.races.length * classCount}, found ${combinations.length}`
    );
    requireCondition(
      /Generated aggregate customization catalog from [0-9a-f]{40} \([0-9]+ profiles, [0-9]+ source files\)\./.test(
        syncOutput
      ),
      'ordinary assets:sync did not report actual aggregate generation counts'
    );
    npx(
      web.worktree,
      [
        'vitest',
        'run',
        'scripts/generateCharacterCustomizationCatalog.test.ts',
        'scripts/characterCustomizationPublication.test.ts',
        'src/components/hex-grid/classCharacterModels.test.ts',
      ],
      syncEnv
    );
    npm(web.worktree, ['run', 'ci-check'], syncEnv);
    const finalPaths = changedPaths(web.worktree);
    requireCondition(
      finalPaths.length === 1 && finalPaths[0] === GENERATED_CATALOG,
      `checks changed files outside the actual generated catalog: ${finalPaths.join(', ')}`
    );
    git(web.worktree, 'add', '--', GENERATED_CATALOG);
    const staged = git(web.worktree, 'diff', '--cached', '--name-only')
      .split('\n')
      .filter(Boolean);
    requireCondition(
      JSON.stringify(staged) === JSON.stringify([GENERATED_CATALOG]),
      'staged paths differ from the exact generated Web catalog'
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
        baselineHead: validated.baselineHead,
        mergeSha: validated.mergeSha,
        publishedHead: validated.providerHead,
        pullRequest: validated.provider.pullRequest,
        class: validated.classRef,
        races: validated.races,
        receiptChain: {
          preparedReceiptSha256: validated.receipt.sourceProviderReceiptSha256,
          publishedReceiptSha256:
            validated.receipt.publication.resolvedFromReceiptSha256,
          mergedReceiptSha256: validated.sha256,
        },
        currentCompatibilityOverlay: {
          kind: CURRENT_OVERLAY_KIND,
          path: CURRENT_OVERLAY_PATH,
          sha256: validated.currentOverlay.sha256,
          baselineSha256: validated.currentOverlay.baselineSha256,
          allowedJsonFields: CURRENT_OVERLAY_ALLOWED_FIELDS,
        },
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
        huskySetup: 'npm run prepare',
        preCommitHook,
        command: 'npm run assets:sync',
        providerCheckout: provider.root,
        providerHead: validated.mergeSha,
        stagedPaths: staged,
        focusedTests: [
          'scripts/generateCharacterCustomizationCatalog.test.ts',
          'scripts/characterCustomizationPublication.test.ts',
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
    resume: false,
    webRepo: resolve(new URL('..', import.meta.url).pathname),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--apply') parsed.apply = true;
    else if (key === '--resume') parsed.resume = true;
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
    parsed.providerReceipt && parsed.webIssue,
    '--provider-receipt and explicit --web-issue are required'
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
  const web = webPreflight(
    options.webRepo,
    options.webIssue,
    validated.classRef,
    options.worktreeRoot
  );
  const webCommonDir = git(
    web.root,
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir'
  );
  const providerRepo =
    options.providerRepo ||
    join(dirname(dirname(webCommonDir)), 'rpg-game-assets');
  const provider = verifyProviderSource(validated, providerRepo);
  const blockers = web.toolingReady
    ? []
    : [
        'generic class tooling is not merged in Web origin/dev; merge/review tooling before provider data',
      ];
  const output = resolve(
    options.output || join(dirname(validated.path), 'web-receipt.json')
  );
  if (options.resume) {
    requireCondition(
      !statProbe(output),
      `Web receipt output already exists: ${output}`
    );
    resumeState(validated, provider, web, web.baseHead);
  }
  const plan = {
    schemaVersion: 1,
    tool: TOOL,
    mode: options.resume
      ? options.apply
        ? 'resume-apply'
        : 'resume-dry-run'
      : options.apply
        ? 'apply'
        : 'dry-run',
    mutationsPerformed: false,
    ready: blockers.length === 0,
    blockers,
    sourceProviderReceipt: validated.path,
    sourceProviderReceiptSha256: validated.sha256,
    provider: {
      repository: PROVIDER_REPOSITORY,
      baselineHead: validated.baselineHead,
      mergeSha: validated.mergeSha,
      class: validated.classRef,
      races: validated.races,
      receiptChain: {
        preparedReceiptSha256: validated.receipt.sourceProviderReceiptSha256,
        publishedReceiptSha256:
          validated.receipt.publication.resolvedFromReceiptSha256,
        mergedReceiptSha256: validated.sha256,
      },
      currentCompatibilityOverlay: {
        kind: CURRENT_OVERLAY_KIND,
        path: CURRENT_OVERLAY_PATH,
        sha256: validated.currentOverlay.sha256,
        baselineSha256: validated.currentOverlay.baselineSha256,
        allowedJsonFields: CURRENT_OVERLAY_ALLOWED_FIELDS,
      },
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
      ...(provider.needsFetch
        ? ['fetch the verified provider merge SHA during apply only']
        : []),
      ...(options.resume
        ? [
            'revalidate the existing pinned provider and issue-owned Web worktrees',
            'fetch fresh origin/dev and fast-forward only when the old Web head is its ancestor and the upstream catalog is unchanged',
            'compare the preserved catalog to fresh generator output before ordinary sync',
          ]
        : [
            'create a fresh detached private-provider worktree at the verified merge SHA',
            'fetch fresh origin/dev',
            'create isolated numbered Web issue worktree/branch',
          ]),
      'install the lockfile-pinned Web dependencies without lifecycle scripts',
      'run trusted repository Husky setup and verify the configured executable pre-commit hook',
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
  const result = apply(validated, provider, web, output, options.resume);
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
