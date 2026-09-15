#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MANIFEST_RELATIVE = 'harness/models/synty/npcs/manifest.json';
const PROVIDER_MODEL_ROOT = 'harness/models/synty';
const RUNTIME_URL_ROOT = '/models/synty/';
const SELECTION_KEYS = ['releases', 'schemaVersion'];
const RELEASE_KEYS = ['appearances', 'releaseId'];
const APPEARANCE_SELECTION_KEYS = [
  'assetRef',
  'displayName',
  'downedSha256',
  'jointCount',
  'manifestId',
  'standingSha256',
];
const PRETTIER_CLI = fileURLToPath(
  new URL('../node_modules/prettier/bin/prettier.cjs', import.meta.url)
);
const GENERATED_FORMAT_PATH = fileURLToPath(
  new URL('../src/generated/npcAppearanceCatalog.ts', import.meta.url)
);

function fail(message) {
  throw new Error(`NPC appearance catalog: ${message}`);
}

function exactObject(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(`${label} fields must be exactly: ${expected.join(', ')}`);
  }
  return value;
}

function nonempty(value, label, max = 300) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > max ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    fail(`${label} must be a non-empty portable string`);
  }
  return value;
}

function sha256(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    fail(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function hashBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function safeRelativeGlb(value, label) {
  const result = nonempty(value, label);
  const parts = result.split('/');
  if (
    isAbsolute(result) ||
    result.includes('\\') ||
    result.includes('://') ||
    !result.endsWith('.glb') ||
    parts.some((part) => part === '' || part === '.' || part === '..') ||
    result !== parts.join('/')
  ) {
    fail(`${label} must be a normalized traversal-free relative GLB path`);
  }
  if (!result.startsWith('npcs/')) {
    fail(`${label} must stay in the NPC runtime root`);
  }
  return result;
}

function containedRegularFile(root, relativePath, label) {
  const canonicalRoot = realpathSync(root);
  let current = canonicalRoot;
  for (const part of relativePath.split('/')) {
    current = resolve(current, part);
    const info = lstatSync(current);
    if (info.isSymbolicLink()) fail(`${label} must not contain a symlink`);
  }
  const canonical = realpathSync(current);
  const fromRoot = relative(canonicalRoot, canonical);
  if (
    fromRoot === '..' ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromRoot)
  ) {
    fail(`${label} escapes its approved root`);
  }
  if (!statSync(canonical).isFile()) fail(`${label} must be a regular file`);
  return canonical;
}

function cleanProviderCommit(providerRoot) {
  let commit;
  try {
    commit = execFileSync(
      'git',
      ['-C', providerRoot, 'rev-parse', '--verify', 'HEAD^{commit}'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim();
  } catch {
    fail('provider HEAD must resolve to an exact Git commit');
  }
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    fail('provider HEAD must be an exact 40-character commit id');
  }
  const dirty = execFileSync(
    'git',
    ['-C', providerRoot, 'status', '--porcelain=v1', '--untracked-files=all'],
    { encoding: 'utf8' }
  );
  if (dirty !== '') fail('provider checkout must be exactly clean');
  return commit;
}

function readJsonFile(path, label) {
  if (lstatSync(path).isSymbolicLink()) fail(`${label} must not be a symlink`);
  if (!statSync(path).isFile()) fail(`${label} must be a regular file`);
  const bytes = readFileSync(path);
  try {
    return { bytes, value: JSON.parse(bytes.toString('utf8')) };
  } catch {
    fail(`${label} must be valid UTF-8 JSON`);
  }
}

function verifyModelBytes({
  modelRoot,
  runtimeRoot,
  relativePath,
  expectedHash,
  label,
}) {
  const providerFile = containedRegularFile(modelRoot, relativePath, label);
  if (hashBytes(readFileSync(providerFile)) !== expectedHash) {
    fail(`${label} SHA-256 does not agree with the provider GLB`);
  }
  if (!runtimeRoot) return;
  const runtimeFile = containedRegularFile(
    runtimeRoot,
    relativePath,
    `${label} synchronized GLB`
  );
  if (hashBytes(readFileSync(runtimeFile)) !== expectedHash) {
    fail(`${label} synchronized GLB SHA-256 does not agree with the catalog`);
  }
}

function parseSelection(selectionPath) {
  const { bytes, value } = readJsonFile(selectionPath, 'release selection');
  const selection = exactObject(value, SELECTION_KEYS, 'release selection');
  if (selection.schemaVersion !== 1) {
    fail('release selection schemaVersion must be 1');
  }
  if (!Array.isArray(selection.releases) || selection.releases.length === 0) {
    fail('release selection releases must be a non-empty array');
  }

  const releaseIds = new Set();
  const manifestIds = new Set();
  const assetRefs = new Set();
  const releases = selection.releases.map((rawRelease, releaseIndex) => {
    const releaseLabel = `releases[${releaseIndex}]`;
    const release = exactObject(rawRelease, RELEASE_KEYS, releaseLabel);
    const releaseId = nonempty(
      release.releaseId,
      `${releaseLabel}.releaseId`,
      120
    );
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(releaseId)) {
      fail(`${releaseLabel}.releaseId must be a portable slug`);
    }
    if (releaseIds.has(releaseId)) fail(`duplicate releaseId: ${releaseId}`);
    releaseIds.add(releaseId);
    if (
      !Array.isArray(release.appearances) ||
      release.appearances.length === 0
    ) {
      fail(`${releaseLabel}.appearances must be a non-empty array`);
    }
    const appearances = release.appearances.map((rawAppearance, index) => {
      const label = `${releaseLabel}.appearances[${index}]`;
      const selected = exactObject(
        rawAppearance,
        APPEARANCE_SELECTION_KEYS,
        label
      );
      const manifestId = nonempty(selected.manifestId, `${label}.manifestId`);
      if (!/^[A-Za-z0-9]+$/.test(manifestId)) {
        fail(`${label}.manifestId must be a portable manifest key`);
      }
      if (manifestIds.has(manifestId)) {
        fail(`duplicate selected manifestId: ${manifestId}`);
      }
      manifestIds.add(manifestId);
      const assetRef = nonempty(selected.assetRef, `${label}.assetRef`);
      if (!/^dnd5e:npcs:[a-z0-9][a-z0-9:-]*$/.test(assetRef)) {
        fail(`${label}.assetRef must be an exact NPC appearance reference`);
      }
      if (assetRefs.has(assetRef))
        fail(`duplicate selected assetRef: ${assetRef}`);
      assetRefs.add(assetRef);
      if (
        !Number.isSafeInteger(selected.jointCount) ||
        selected.jointCount <= 0
      ) {
        fail(`${label}.jointCount must be a positive safe integer`);
      }
      return {
        releaseId,
        manifestId,
        assetRef,
        displayName: nonempty(
          selected.displayName,
          `${label}.displayName`,
          120
        ),
        jointCount: selected.jointCount,
        standingSha256: sha256(
          selected.standingSha256,
          `${label}.standingSha256`
        ),
        downedSha256: sha256(selected.downedSha256, `${label}.downedSha256`),
      };
    });
    appearances.sort((left, right) =>
      left.assetRef.localeCompare(right.assetRef)
    );
    return { releaseId, appearances };
  });
  releases.sort((left, right) => left.releaseId.localeCompare(right.releaseId));
  return { selectionSha256: hashBytes(bytes), releases };
}

function parseManifest(providerRoot, runtimeRoot, selection) {
  const manifestPath = containedRegularFile(
    providerRoot,
    MANIFEST_RELATIVE,
    'NPC manifest'
  );
  const manifestBytes = readFileSync(manifestPath);
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8'));
  } catch {
    fail('NPC manifest must be valid UTF-8 JSON');
  }
  if (
    !manifest?.npcs ||
    typeof manifest.npcs !== 'object' ||
    Array.isArray(manifest.npcs)
  ) {
    fail('NPC manifest must contain an npcs object');
  }
  const modelRoot = resolve(providerRoot, PROVIDER_MODEL_ROOT);
  const urls = new Set();
  const appearances = selection.releases.flatMap((release) =>
    release.appearances.map((selected) => {
      const label = `manifest NPC ${selected.manifestId}`;
      const raw = manifest.npcs[selected.manifestId];
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        fail(`${label} is missing`);
      }
      if (raw.assetRef !== selected.assetRef) {
        fail(`${label}.assetRef does not match selected assetRef`);
      }
      if (raw.rulesRef !== null) fail(`${label}.rulesRef must be null`);
      if (raw.jointCount !== selected.jointCount) {
        fail(`${label}.jointCount does not match selected jointCount`);
      }
      const standingSha256 = sha256(raw.sha256, `${label}.sha256`);
      const downedSha256 = sha256(raw.downedSha256, `${label}.downedSha256`);
      if (standingSha256 !== selected.standingSha256) {
        fail(`${label} standing SHA-256 does not match the selected release`);
      }
      if (downedSha256 !== selected.downedSha256) {
        fail(`${label} downed SHA-256 does not match the selected release`);
      }
      const standingFile = safeRelativeGlb(raw.file, `${label}.file`);
      const downedFile = safeRelativeGlb(raw.downed, `${label}.downed`);
      if (standingFile === downedFile) fail(`${label} models must be distinct`);
      const standingUrl = RUNTIME_URL_ROOT + standingFile;
      const downedUrl = RUNTIME_URL_ROOT + downedFile;
      for (const url of [standingUrl, downedUrl]) {
        if (urls.has(url)) fail(`duplicate NPC appearance runtime URL: ${url}`);
        urls.add(url);
      }
      verifyModelBytes({
        modelRoot,
        runtimeRoot,
        relativePath: standingFile,
        expectedHash: standingSha256,
        label: `${label} standing`,
      });
      verifyModelBytes({
        modelRoot,
        runtimeRoot,
        relativePath: downedFile,
        expectedHash: downedSha256,
        label: `${label} downed`,
      });
      if (
        !Array.isArray(raw.animationClips) ||
        raw.animationClips.length === 0
      ) {
        fail(`${label}.animationClips must be a non-empty array`);
      }
      const animationClips = raw.animationClips.map((clip, index) =>
        nonempty(clip, `${label}.animationClips[${index}]`, 120)
      );
      if (new Set(animationClips).size !== animationClips.length) {
        fail(`${label}.animationClips must be unique`);
      }
      return {
        releaseId: release.releaseId,
        manifestId: selected.manifestId,
        assetRef: selected.assetRef,
        displayName: selected.displayName,
        rulesRef: null,
        sourceName: nonempty(raw.source, `${label}.source`, 160),
        sourcePack: nonempty(raw.sourcePack, `${label}.sourcePack`, 160),
        standingUrl,
        downedUrl,
        standingSha256,
        downedSha256,
        animationClips,
        jointCount: raw.jointCount,
        pose: nonempty(raw.pose, `${label}.pose`, 1000),
        rootWrapper: nonempty(raw.rootWrapper, `${label}.rootWrapper`, 1000),
        forwardAxis: nonempty(raw.forwardAxis, `${label}.forwardAxis`, 120),
      };
    })
  );
  appearances.sort((left, right) =>
    left.assetRef.localeCompare(right.assetRef)
  );
  return { manifestSha256: hashBytes(manifestBytes), appearances };
}

const q = (value) => JSON.stringify(value);

export function renderNpcAppearanceCatalogModule({
  commit,
  manifestSha256,
  selectionSha256,
  releases,
  appearances,
}) {
  const entries = appearances
    .map(
      (appearance) =>
        `  ${q(appearance.assetRef)}: Object.freeze({\n${[
          ['releaseId', appearance.releaseId],
          ['manifestId', appearance.manifestId],
          ['assetRef', appearance.assetRef],
          ['displayName', appearance.displayName],
          ['rulesRef', null],
          ['sourceName', appearance.sourceName],
          ['sourcePack', appearance.sourcePack],
          ['standingUrl', appearance.standingUrl],
          ['downedUrl', appearance.downedUrl],
          ['standingSha256', appearance.standingSha256],
          ['downedSha256', appearance.downedSha256],
        ]
          .map(([key, value]) => `    ${key}: ${q(value)},`)
          .join(
            '\n'
          )}\n    animationClips: Object.freeze(${q(appearance.animationClips)}),\n    jointCount: ${q(appearance.jointCount)},\n    pose: ${q(appearance.pose)},\n    rootWrapper: ${q(appearance.rootWrapper)},\n    forwardAxis: ${q(appearance.forwardAxis)},\n  }),`
    )
    .join('\n');
  const source = `// Generated by scripts/generate-npc-appearance-catalog.mjs. Do not edit.\n\nexport const GENERATED_NPC_APPEARANCE_PROVIDER = Object.freeze({\n  commit: ${q(commit)},\n  manifestSha256: ${q(manifestSha256)},\n  selectionSha256: ${q(selectionSha256)},\n  releases: Object.freeze(${q(releases)}),\n});\n\nexport interface GeneratedNpcAppearance {\n  readonly releaseId: string;\n  readonly manifestId: string;\n  readonly assetRef: string;\n  readonly displayName: string;\n  readonly rulesRef: null;\n  readonly sourceName: string;\n  readonly sourcePack: string;\n  readonly standingUrl: string;\n  readonly downedUrl: string;\n  readonly standingSha256: string;\n  readonly downedSha256: string;\n  readonly animationClips: readonly string[];\n  readonly jointCount: number;\n  readonly pose: string;\n  readonly rootWrapper: string;\n  readonly forwardAxis: string;\n}\n\nexport interface NpcAppearanceResolutionDiagnostic {\n  readonly assetRef: string;\n  readonly reason: 'unsupported-exact-asset-ref';\n}\n\nexport const GENERATED_NPC_APPEARANCES: Readonly<Record<string, GeneratedNpcAppearance>> = Object.freeze({\n${entries}\n});\n\n/** Deterministic exact release selection; it is separate from every prop catalog. */\nexport const NPC_APPEARANCE_CATALOG: readonly GeneratedNpcAppearance[] =\n  Object.freeze(Object.values(GENERATED_NPC_APPEARANCES));\n\n/** Exact-only lookup. It never substitutes an appearance or rules identity. */\nexport function resolveNpcAppearance(\n  assetRef: string,\n  onDiagnostic?: (diagnostic: NpcAppearanceResolutionDiagnostic) => void\n): GeneratedNpcAppearance | undefined {\n  const appearance = Object.hasOwn(GENERATED_NPC_APPEARANCES, assetRef)\n    ? GENERATED_NPC_APPEARANCES[assetRef]\n    : undefined;\n  if (!appearance) {\n    onDiagnostic?.({ assetRef, reason: 'unsupported-exact-asset-ref' });\n  }\n  return appearance;\n}\n`;
  return execFileSync(
    process.execPath,
    [PRETTIER_CLI, '--stdin-filepath', GENERATED_FORMAT_PATH],
    { encoding: 'utf8', input: source }
  );
}

export function generateNpcAppearanceCatalog({
  providerRoot,
  selectionPath,
  outputPath,
  runtimeRoot,
  check = false,
}) {
  if (lstatSync(providerRoot).isSymbolicLink()) {
    fail('provider root must not be a symlink');
  }
  const canonicalProvider = realpathSync(providerRoot);
  const commit = cleanProviderCommit(canonicalProvider);
  const selection = parseSelection(selectionPath);
  const manifest = parseManifest(
    canonicalProvider,
    runtimeRoot ? realpathSync(runtimeRoot) : undefined,
    selection
  );
  const releases = selection.releases.map(({ releaseId }) => releaseId);
  const source = renderNpcAppearanceCatalogModule({
    commit,
    manifestSha256: manifest.manifestSha256,
    selectionSha256: selection.selectionSha256,
    releases,
    appearances: manifest.appearances,
  });
  if (
    source.includes(canonicalProvider) ||
    source.includes(MANIFEST_RELATIVE)
  ) {
    fail('generated output leaked provider path identity');
  }
  if (check) {
    let current;
    try {
      current = readFileSync(outputPath, 'utf8');
    } catch {
      fail(`generated catalog is missing: ${outputPath}`);
    }
    if (current !== source) {
      fail('generated catalog is stale; run assets:sync');
    }
  } else {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, source);
  }
  return {
    providerCommit: commit,
    manifestSha256: manifest.manifestSha256,
    selectionSha256: selection.selectionSha256,
    releaseCount: releases.length,
    appearanceCount: manifest.appearances.length,
  };
}

function argument(name, required = true) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (required && (!value || value.startsWith('--'))) fail(`missing ${name}`);
  return value;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const receipt = generateNpcAppearanceCatalog({
    providerRoot: argument('--provider-root'),
    selectionPath: argument('--selection'),
    outputPath: argument('--output'),
    runtimeRoot: argument('--runtime-root', false),
    check: process.argv.includes('--check'),
  });
  console.log(
    `NPC appearance catalog: ${receipt.appearanceCount} exact appearances from ${receipt.releaseCount} release(s), pinned to ${receipt.providerCommit}`
  );
}
