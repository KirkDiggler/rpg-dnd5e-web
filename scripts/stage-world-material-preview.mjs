import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseSurfaces } from './generate-world-asset-catalog.mjs';
import { readWorldMaterialCatalog } from './world-material-catalog.mjs';
const OWNER = 'studio-world-material-preview-v1';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function file(root, relative) {
  if (lstatSync(root).isSymbolicLink())
    throw new Error('Preview root symlink refused.');
  let current = root;
  for (const part of relative.split('/')) {
    if (!part || part === '.' || part === '..' || part.includes('\\'))
      throw new Error('Invalid preview resource path.');
    current = join(current, part);
    if (lstatSync(current).isSymbolicLink())
      throw new Error('Preview resource symlink refused.');
  }
  if (!lstatSync(current).isFile())
    throw new Error('Preview resource must be a regular file.');
  return current;
}
/** Explicit local candidate transaction. Does not edit generated pins, provider
 * runtime trees or public assets. Output is served only by Vite's dev middleware. */
export function stageWorldMaterialPreview({
  catalogPath,
  modelRoot,
  worldCatalogPath,
  runtimeRoot,
  outputRoot,
  assets,
}) {
  if (basename(outputRoot) !== 'world-material-preview')
    throw new Error(
      'Use the dedicated world-material-preview output directory.'
    );
  if (
    existsSync(outputRoot) &&
    (lstatSync(outputRoot).isSymbolicLink() ||
      !existsSync(join(outputRoot, '.owner')) ||
      readFileSync(join(outputRoot, '.owner'), 'utf8') !== OWNER)
  )
    throw new Error('Refusing to replace an unowned preview directory.');
  const parsed = readWorldMaterialCatalog({ catalogPath, modelRoot });
  const source = JSON.parse(readFileSync(worldCatalogPath, 'utf8'));
  if (source.schemaVersion !== 1 || !Array.isArray(source.assets))
    throw new Error('Invalid candidate world catalog.');
  const surfaces = source.assets
    .filter((row) => Object.hasOwn(row, 'surfaces'))
    .map((row) => {
      const expected = assets[row.ref];
      if (
        !expected ||
        row.glbSha256 !== expected.glbSha256 ||
        row.file !== expected.url.slice('/models/synty/'.length)
      )
        throw new Error(
          `Candidate geometry differs from pinned asset ${row.ref}.`
        );
      const bytes = readFileSync(file(runtimeRoot, row.file));
      if (
        hash(bytes) !== expected.glbSha256 ||
        bytes.length !== expected.sizeBytes
      )
        throw new Error(`Runtime GLB differs for ${row.ref}.`);
      return {
        assetRef: row.ref,
        glbSha256: row.glbSha256,
        bindings: parseSurfaces(row.surfaces, row.ref),
      };
    });
  if (
    !surfaces.length ||
    new Set(surfaces.map((s) => s.assetRef)).size !== surfaces.length
  )
    throw new Error('Expected unique enrolled preview assets.');
  const images = new Map();
  const materials = parsed.materials.map((row) => {
    const result = { ...row };
    for (const role of [
      'baseColor',
      'normal',
      'metallicRoughness',
      'occlusion',
    ]) {
      if (!row[role]) continue;
      const image = row[role],
        name = `${image.sha256}.png`;
      const bytes = readFileSync(
        file(modelRoot, `world-materials/images/${name}`)
      );
      if (hash(bytes) !== image.sha256 || bytes.length !== image.sizeBytes)
        throw new Error(`Candidate image changed during staging: ${name}.`);
      images.set(name, bytes);
      result[role] = {
        ...image,
        url: `/world-material-preview/images/${name}?v=${image.sha256}`,
      };
    }
    return result;
  });
  const catalog = {
    kind: 'candidate',
    catalogSha256: parsed.catalogSha256,
    materials,
    surfaces,
  };
  mkdirSync(dirname(outputRoot), { recursive: true });
  const stage = mkdtempSync(
    join(dirname(outputRoot), 'material-preview-stage-')
  );
  const backup = `${stage}-previous`;
  try {
    mkdirSync(join(stage, 'images'));
    for (const [name, bytes] of images)
      writeFileSync(join(stage, 'images', name), bytes);
    writeFileSync(
      join(stage, 'catalog.json'),
      JSON.stringify(catalog, null, 2) + '\n'
    );
    writeFileSync(join(stage, '.owner'), OWNER);
    if (existsSync(outputRoot)) renameSync(outputRoot, backup);
    try {
      renameSync(stage, outputRoot);
    } catch (error) {
      if (existsSync(backup)) renameSync(backup, outputRoot);
      throw error;
    }
    rmSync(backup, { recursive: true, force: true });
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
  return {
    catalogSha256: parsed.catalogSha256,
    materials: materials.length,
    images: images.size,
    surfaces: surfaces.length,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const argument = (name) => {
    const i = process.argv.indexOf(name);
    if (i < 0 || !process.argv[i + 1]) throw new Error(`Missing ${name}`);
    return resolve(process.argv[i + 1]);
  };
  const { GENERATED_WORLD_ASSETS: assets } =
    await import('../src/generated/worldAssetCatalog.ts');
  console.log(
    stageWorldMaterialPreview({
      catalogPath: argument('--catalog'),
      modelRoot: argument('--models'),
      worldCatalogPath: argument('--world-catalog'),
      runtimeRoot: argument('--runtime-root'),
      outputRoot: resolve('.local/world-material-preview'),
      assets,
    })
  );
}
