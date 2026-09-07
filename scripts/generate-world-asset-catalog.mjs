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

const CATALOG_RELATIVE = 'harness/catalogs/synty-world-assets.json';
const PROVIDER_MODEL_ROOT = 'harness/models/synty';
const RUNTIME_URL_ROOT = '/models/synty/';
const CATEGORIES = new Set(['props', 'items', 'weapons', 'env']);
const CATALOG_KEYS = ['assets', 'generatedBy', 'recipes', 'schemaVersion'];
const RECIPE_KEYS = ['batchId', 'sha256'];
const PRETTIER_CLI = fileURLToPath(
  new URL('../node_modules/prettier/bin/prettier.cjs', import.meta.url)
);
const GENERATED_FORMAT_PATH = fileURLToPath(
  new URL('../src/generated/worldAssetCatalog.ts', import.meta.url)
);
const ASSET_KEYS = [
  'boundsMeters',
  'category',
  'displayName',
  'file',
  'glbSha256',
  'ref',
  'sizeBytes',
  'supportsDecoration',
  'tags',
];

function fail(message) {
  throw new Error(`World asset catalog: ${message}`);
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

function nonempty(value, label, max = 200) {
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
  const result = nonempty(value, label, 300);
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

function parseCatalog(providerRoot, runtimeRoot) {
  const catalogPath = containedRegularFile(
    providerRoot,
    CATALOG_RELATIVE,
    'provider catalog'
  );
  const catalogBytes = readFileSync(catalogPath);
  let raw;
  try {
    raw = JSON.parse(catalogBytes.toString('utf8'));
  } catch {
    fail('provider catalog must be valid UTF-8 JSON');
  }
  const catalog = exactObject(raw, CATALOG_KEYS, 'provider catalog');
  if (catalog.schemaVersion !== 1)
    fail('provider catalog schemaVersion must be 1');
  const generatedBy = nonempty(
    catalog.generatedBy,
    'provider catalog generatedBy'
  );
  if (!Array.isArray(catalog.recipes))
    fail('provider catalog recipes must be an array');
  if (!Array.isArray(catalog.assets))
    fail('provider catalog assets must be an array');

  const recipeIds = new Set();
  const recipes = catalog.recipes.map((rawRecipe, index) => {
    const recipe = exactObject(rawRecipe, RECIPE_KEYS, `recipes[${index}]`);
    const batchId = nonempty(recipe.batchId, `recipes[${index}].batchId`, 120);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(batchId)) {
      fail(`recipes[${index}].batchId must be a portable slug`);
    }
    if (recipeIds.has(batchId)) fail(`duplicate recipe batchId: ${batchId}`);
    recipeIds.add(batchId);
    const digest = sha256(recipe.sha256, `recipes[${index}].sha256`);
    const recipeRelative = `scripts/configs/world-asset-promotion/${batchId}.json`;
    const recipePath = containedRegularFile(
      providerRoot,
      recipeRelative,
      `recipe ${batchId}`
    );
    if (hashBytes(readFileSync(recipePath)) !== digest) {
      fail(`recipe ${batchId} SHA-256 does not agree with the catalog`);
    }
    return { batchId, sha256: digest };
  });
  recipes.sort((left, right) => left.batchId.localeCompare(right.batchId));

  const refs = new Set();
  const urls = new Set();
  const assets = catalog.assets.map((rawAsset, index) => {
    const label = `assets[${index}]`;
    const asset = exactObject(rawAsset, ASSET_KEYS, label);
    const category = nonempty(asset.category, `${label}.category`);
    if (!CATEGORIES.has(category))
      fail(`${label}.category is unknown: ${category}`);
    const ref = nonempty(asset.ref, `${label}.ref`, 200);
    if (!new RegExp(`^dnd5e:${category}:[a-z0-9][a-z0-9:_-]*$`).test(ref)) {
      fail(`${label}.ref must be an exact ${category} reference`);
    }
    if (refs.has(ref)) fail(`duplicate world asset ref: ${ref}`);
    refs.add(ref);
    const file = safeRelativeGlb(asset.file, `${label}.file`);
    if (!file.startsWith(`world-assets/${category}/`)) {
      fail(`${label}.file must stay in world-assets/${category}`);
    }
    const url = RUNTIME_URL_ROOT + file;
    if (urls.has(url)) fail(`duplicate world asset runtime URL: ${url}`);
    urls.add(url);
    const providerFile = containedRegularFile(
      resolve(providerRoot, PROVIDER_MODEL_ROOT),
      file,
      `${label}.file`
    );
    const expectedHash = sha256(asset.glbSha256, `${label}.glbSha256`);
    if (!Number.isSafeInteger(asset.sizeBytes) || asset.sizeBytes <= 0) {
      fail(`${label}.sizeBytes must be a positive safe integer`);
    }
    const providerBytes = readFileSync(providerFile);
    if (providerBytes.byteLength !== asset.sizeBytes) {
      fail(`${label}.sizeBytes does not agree with the provider GLB`);
    }
    if (hashBytes(providerBytes) !== expectedHash) {
      fail(`${label}.glbSha256 does not agree with the provider GLB`);
    }
    if (runtimeRoot) {
      const synchronizedFile = containedRegularFile(
        runtimeRoot,
        file,
        `${label} synchronized GLB`
      );
      const synchronizedBytes = readFileSync(synchronizedFile);
      if (
        synchronizedBytes.byteLength !== asset.sizeBytes ||
        hashBytes(synchronizedBytes) !== expectedHash
      ) {
        fail(
          `${label} synchronized GLB size/hash does not agree with the catalog`
        );
      }
    }
    if (
      !Array.isArray(asset.boundsMeters) ||
      asset.boundsMeters.length !== 3 ||
      asset.boundsMeters.some(
        (value) =>
          typeof value !== 'number' ||
          !Number.isFinite(value) ||
          value <= 0 ||
          value > 1000
      )
    ) {
      fail(
        `${label}.boundsMeters must contain three finite positive dimensions`
      );
    }
    if (!Array.isArray(asset.tags)) fail(`${label}.tags must be an array`);
    const tags = asset.tags.map((tag, tagIndex) => {
      const parsed = nonempty(tag, `${label}.tags[${tagIndex}]`, 80);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parsed)) {
        fail(`${label}.tags[${tagIndex}] must be a portable slug`);
      }
      return parsed;
    });
    if (new Set(tags).size !== tags.length)
      fail(`${label}.tags must be unique`);
    if (typeof asset.supportsDecoration !== 'boolean') {
      fail(`${label}.supportsDecoration must be boolean`);
    }
    return {
      ref,
      displayName: nonempty(asset.displayName, `${label}.displayName`, 120),
      category,
      url,
      glbSha256: expectedHash,
      sizeBytes: asset.sizeBytes,
      boundsMeters: asset.boundsMeters,
      tags: [...tags].sort(),
      supportsDecoration: asset.supportsDecoration,
    };
  });
  assets.sort((left, right) => left.ref.localeCompare(right.ref));
  return {
    catalogSha256: hashBytes(catalogBytes),
    generatedBy,
    recipes,
    assets,
  };
}

const q = (value) => JSON.stringify(value);

export function renderWorldAssetCatalogModule({ commit, catalog }) {
  const entries = catalog.assets
    .map(
      (asset) =>
        `  ${q(asset.ref)}: Object.freeze({\n${[
          ['ref', asset.ref],
          ['displayName', asset.displayName],
          ['category', asset.category],
          ['url', asset.url],
          ['glbSha256', asset.glbSha256],
          ['sizeBytes', asset.sizeBytes],
          ['boundsMeters', asset.boundsMeters],
          ['tags', asset.tags],
          ['supportsDecoration', asset.supportsDecoration],
        ]
          .map(
            ([key, value]) =>
              `    ${key}: ${q(value)}${key === 'boundsMeters' ? ' as [number, number, number]' : ''},`
          )
          .join('\n')}\n  }),`
    )
    .join('\n');
  const recipes = catalog.recipes
    .map(
      (recipe) =>
        `    Object.freeze({ batchId: ${q(recipe.batchId)}, sha256: ${q(recipe.sha256)} }),`
    )
    .join('\n');
  const source = `// Generated by scripts/generate-world-asset-catalog.mjs. Do not edit.\n\nexport const GENERATED_WORLD_ASSET_PROVIDER = Object.freeze({\n  commit: ${q(commit)},\n  catalogSha256: ${q(catalog.catalogSha256)},\n  generatedBy: ${q(catalog.generatedBy)},\n  recipes: Object.freeze([\n${recipes}\n  ]) as ReadonlyArray<Readonly<{ batchId: string; sha256: string }>>,\n});\n\nexport interface GeneratedWorldAsset {\n  ref: string;\n  displayName: string;\n  category: 'props' | 'items' | 'weapons' | 'env';\n  url: string;\n  glbSha256: string;\n  sizeBytes: number;\n  boundsMeters: [number, number, number];\n  tags: string[];\n  supportsDecoration: boolean;\n}\n\nexport interface WorldAssetResolutionDiagnostic {\n  ref: string;\n  reason: 'unsupported-exact-ref';\n}\n\nexport const GENERATED_WORLD_ASSETS: Readonly<Record<string, GeneratedWorldAsset>> = Object.freeze({\n${entries}\n});\n\n/** Exact-only lookup. It never substitutes a family/default asset. */\nexport function resolveWorldAsset(\n  ref: string,\n  onDiagnostic?: (diagnostic: WorldAssetResolutionDiagnostic) => void\n): GeneratedWorldAsset | undefined {\n  const asset = GENERATED_WORLD_ASSETS[ref];\n  if (!asset) onDiagnostic?.({ ref, reason: 'unsupported-exact-ref' });\n  return asset;\n}\n`;
  return execFileSync(
    process.execPath,
    [PRETTIER_CLI, '--stdin-filepath', GENERATED_FORMAT_PATH],
    { encoding: 'utf8', input: source }
  );
}

export function generateWorldAssetCatalog({
  providerRoot,
  outputPath,
  runtimeRoot,
  check = false,
}) {
  const canonicalProvider = realpathSync(providerRoot);
  if (lstatSync(providerRoot).isSymbolicLink())
    fail('provider root must not be a symlink');
  const commit = cleanProviderCommit(canonicalProvider);
  const catalog = parseCatalog(
    canonicalProvider,
    runtimeRoot ? realpathSync(runtimeRoot) : undefined
  );
  const source = renderWorldAssetCatalogModule({ commit, catalog });
  if (source.includes(canonicalProvider) || source.includes(CATALOG_RELATIVE)) {
    fail('generated output leaked provider identity');
  }
  if (check) {
    let current;
    try {
      current = readFileSync(outputPath, 'utf8');
    } catch {
      fail(`generated catalog is missing: ${outputPath}`);
    }
    if (current !== source)
      fail('generated catalog is stale; run world-assets:sync');
  } else {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, source);
  }
  return {
    providerCommit: commit,
    catalogSha256: catalog.catalogSha256,
    assetCount: catalog.assets.length,
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
  const receipt = generateWorldAssetCatalog({
    providerRoot: argument('--provider-root'),
    outputPath: argument('--output'),
    runtimeRoot: argument('--runtime-root', false),
    check: process.argv.includes('--check'),
  });
  console.log(
    `World asset catalog: ${receipt.assetCount} exact assets pinned to ${receipt.providerCommit}`
  );
}
