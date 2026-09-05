#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { format } from 'prettier';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(SCRIPT_DIR, '..');
const CATALOG_RELATIVE = 'harness/catalogs/synty-props-web.json';
const OUTPUT_PATH = join(
  WEB_ROOT,
  'src/components/hex-grid/generatedPropCatalog.ts'
);
const TOP_KEYS = [
  'familyDefaults',
  'generatedBy',
  'paletteRefs',
  'refs',
  'schemaVersion',
];
const REF_KEYS = [
  'blocksLoS',
  'blocksMovement',
  'displayName',
  'familyRef',
  'file',
  'footprintHexes',
  'role',
  'sha256',
  'sizeBytes',
];

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, expected, label) {
  requireCondition(
    value && typeof value === 'object' && !Array.isArray(value),
    `${label} must be an object`
  );
  const keys = Object.keys(value).sort();
  requireCondition(
    JSON.stringify(keys) === JSON.stringify([...expected].sort()),
    `${label} fields differ: ${keys.join(', ')}`
  );
}

function isExactPropRef(ref) {
  const parts = ref.split(':');
  return (
    parts.length >= 4 &&
    parts[0] === 'dnd5e' &&
    parts[1] === 'props' &&
    parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))
  );
}

async function sha256(path) {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

async function generatedBytes(exactRefs, familyDefaults, paletteRefs) {
  const source = `/** GENERATED FILE — DO NOT EDIT.\n * Source: rpg-game-assets/${CATALOG_RELATIVE}\n */\n\nexport const GENERATED_EXACT_PROP_REFS = ${JSON.stringify(exactRefs, null, 2)} as const;\n\nexport const GENERATED_PROP_FAMILY_DEFAULTS = ${JSON.stringify(familyDefaults, null, 2)} as const;\n\nexport const GENERATED_EXACT_PROP_PALETTE_REFS = ${JSON.stringify(paletteRefs, null, 2)} as const;\n`;
  return format(source, {
    parser: 'typescript',
    semi: true,
    trailingComma: 'es5',
    singleQuote: true,
    printWidth: 80,
    tabWidth: 2,
    useTabs: false,
    arrowParens: 'always',
    endOfLine: 'lf',
  });
}

export async function buildGeneratedPropCatalog({
  providerRoot,
  runtimeRoot = join(WEB_ROOT, 'public/models/synty'),
  outputPath = OUTPUT_PATH,
  check = false,
}) {
  const catalogPath = join(providerRoot, CATALOG_RELATIVE);
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  exactKeys(catalog, TOP_KEYS, 'provider catalog');
  requireCondition(
    catalog.schemaVersion === 1,
    'provider catalog schemaVersion must be 1'
  );
  requireCondition(
    catalog.generatedBy === 'build_prop_web_catalog@1.0.0',
    'provider catalog generator differs'
  );
  exactKeys(catalog.refs, Object.keys(catalog.refs), 'provider catalog refs');
  exactKeys(
    catalog.familyDefaults,
    Object.keys(catalog.familyDefaults),
    'provider catalog familyDefaults'
  );
  requireCondition(
    Array.isArray(catalog.paletteRefs),
    'provider catalog paletteRefs must be an array'
  );

  const exactRefs = {};
  for (const ref of Object.keys(catalog.refs).sort()) {
    if (!isExactPropRef(ref)) continue;
    const row = catalog.refs[ref];
    exactKeys(row, REF_KEYS, `provider ref ${ref}`);
    requireCondition(
      row.familyRef === ref.split(':').slice(0, 3).join(':'),
      `${ref}: familyRef differs`
    );
    requireCondition(
      /^props\/[A-Za-z0-9_.-]+\.glb$/.test(row.file),
      `${ref}: unsafe runtime path`
    );
    requireCondition(
      Number.isInteger(row.sizeBytes) && row.sizeBytes > 0,
      `${ref}: invalid sizeBytes`
    );
    requireCondition(
      /^[a-f0-9]{64}$/.test(row.sha256),
      `${ref}: invalid sha256`
    );
    requireCondition(
      ['obstacle', 'cover', 'decor'].includes(row.role),
      `${ref}: invalid role`
    );
    requireCondition(
      Number.isInteger(row.footprintHexes) && row.footprintHexes > 0,
      `${ref}: invalid footprintHexes`
    );
    requireCondition(
      typeof row.blocksMovement === 'boolean' &&
        typeof row.blocksLoS === 'boolean',
      `${ref}: behavior must be boolean`
    );
    const runtimePath = join(providerRoot, 'harness/models/synty', row.file);
    const facts = await stat(runtimePath);
    requireCondition(
      facts.isFile() && facts.size === row.sizeBytes,
      `${ref}: runtime size mismatch`
    );
    requireCondition(
      (await sha256(runtimePath)) === row.sha256,
      `${ref}: runtime hash mismatch`
    );
    const synchronizedPath = join(runtimeRoot, row.file);
    const synchronizedFacts = await stat(synchronizedPath);
    requireCondition(
      synchronizedFacts.isFile() && synchronizedFacts.size === row.sizeBytes,
      `${ref}: synchronized runtime size mismatch`
    );
    requireCondition(
      (await sha256(synchronizedPath)) === row.sha256,
      `${ref}: synchronized runtime hash mismatch`
    );
    exactRefs[ref] = {
      name: row.displayName,
      displayName: row.displayName,
      file: row.file,
      role: row.role,
      footprintHexes: row.footprintHexes,
      blocksMovement: row.blocksMovement,
      blocksLoS: row.blocksLoS,
      sizeBytes: row.sizeBytes,
      sha256: row.sha256,
    };
  }

  const familyDefaults = {};
  for (const familyRef of Object.keys(catalog.familyDefaults).sort()) {
    const exactRef = catalog.familyDefaults[familyRef];
    requireCondition(
      exactRefs[exactRef],
      `${familyRef}: default exact ref is absent`
    );
    requireCondition(
      exactRefs[exactRef] && catalog.refs[exactRef].familyRef === familyRef,
      `${familyRef}: default family differs`
    );
    familyDefaults[familyRef] = exactRef;
  }

  const paletteRefs = catalog.paletteRefs.filter((ref) => isExactPropRef(ref));
  requireCondition(
    new Set(paletteRefs).size === paletteRefs.length,
    'exact palette refs must be unique'
  );
  for (const ref of paletteRefs)
    requireCondition(exactRefs[ref], `palette exact ref is absent: ${ref}`);

  const bytes = await generatedBytes(exactRefs, familyDefaults, paletteRefs);
  if (check) {
    const current = await readFile(outputPath, 'utf8').catch(() => '');
    requireCondition(
      current === bytes,
      `stale generated prop catalog: ${outputPath}`
    );
  } else {
    await writeFile(outputPath, bytes);
  }
  return {
    exactRefCount: Object.keys(exactRefs).length,
    familyDefaultCount: Object.keys(familyDefaults).length,
  };
}

async function main() {
  const check = process.argv.slice(2).includes('--check');
  const providerRoot = resolve(
    process.env.RPG_GAME_ASSETS_PATH ||
      process.env.RPG_GAME_ASSETS_DIR ||
      join(WEB_ROOT, '..', 'rpg-game-assets')
  );
  const result = await buildGeneratedPropCatalog({
    providerRoot,
    runtimeRoot: join(WEB_ROOT, 'public/models/synty'),
    outputPath: OUTPUT_PATH,
    check,
  });
  console.log(
    `${check ? 'verified' : 'generated'} exact prop catalog (${result.exactRefCount} exact refs, ${result.familyDefaultCount} family defaults)`
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(`generate prop catalog: FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
