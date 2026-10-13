import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const IMAGE_ROLES = ['baseColor', 'normal', 'metallicRoughness', 'occlusion'];
const IMAGE_KEYS = ['file', 'sha256', 'sizeBytes', 'width', 'height'];
// Match the provider's decompression safeguard before allocating decoded pixels.
const MAX_IMAGE_PIXELS = 89478485;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
function fail(message) {
  throw new Error(`World material catalog: ${message}`);
}
function object(value, required, optional, path) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some(
      (key) => !required.includes(key) && !optional.includes(key)
    )
  )
    fail(`${path} has invalid fields`);
  return value;
}
function finite(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value))
    fail(`${path} must be finite`);
  return value;
}
function pair(value, path, positive = false) {
  if (!Array.isArray(value) || value.length !== 2)
    fail(`${path} must be a pair`);
  const parsed = value.map((n) => finite(n, path));
  if (positive && parsed.some((n) => n <= 0)) fail(`${path} must be positive`);
  return parsed;
}
function pattern(value, regex, path) {
  if (typeof value !== 'string' || !regex.test(value))
    fail(`${path} is invalid`);
  return value;
}
function regularFile(root, relative) {
  let path = root;
  if (lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory())
    fail('model root must be a real directory');
  // Callers only supply the exact content-addressed path validated below.
  for (const part of relative.split('/')) {
    path = join(path, part);
    if (lstatSync(path).isSymbolicLink())
      fail(`resource symlink refused: ${relative}`);
  }
  if (!lstatSync(path).isFile())
    fail(`resource must be a regular file: ${relative}`);
  return path;
}
function verifyImage(modelRoot, image) {
  const bytes = readFileSync(regularFile(modelRoot, image.file));
  if (bytes.length !== image.sizeBytes || digest(bytes) !== image.sha256)
    fail(`${image.file} hash/size mismatch`);
  if (
    bytes.length < 33 ||
    !bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    bytes.toString('ascii', 12, 16) !== 'IHDR' ||
    bytes.readUInt32BE(16) !== image.width ||
    bytes.readUInt32BE(20) !== image.height ||
    ![2, 6].includes(bytes[25])
  )
    fail(`${image.file} PNG dimensions/format mismatch`);
  try {
    const decoded = PNG.sync.read(bytes, { checkCRC: true });
    if (decoded.width !== image.width || decoded.height !== image.height)
      fail('decoded dimensions differ');
  } catch (error) {
    fail(`${image.file} invalid PNG: ${error.message}`);
  }
}
function verifyOwnedFiles(modelRoot, expected) {
  const actual = new Set();
  const visit = (relative) => {
    const path = join(modelRoot, relative);
    const info = lstatSync(path);
    if (info.isSymbolicLink()) fail(`resource symlink refused: ${relative}`);
    if (info.isDirectory()) {
      for (const name of readdirSync(path)) visit(`${relative}/${name}`);
    } else if (info.isFile()) actual.add(relative);
    else fail(`non-regular resource: ${relative}`);
  };
  try {
    visit('world-materials');
  } catch (error) {
    if (!(error.code === 'ENOENT' && expected.size === 0)) throw error;
  }
  if (
    actual.size !== expected.size ||
    [...actual].some((file) => !expected.has(file))
  )
    fail('world-materials file set differs from catalog');
}

/** Read a release OR an explicit private candidate using the identical strict
 * consumer schema/resource checks. No publication, copying, generated live pin,
 * or acceptance is implied by success. Only the material subtree is inspected.
 * @param {{catalogPath: string, modelRoot: string}} input
 * @returns {{catalogSha256: string, materials: import('../src/rendering/worldMaterialTypes').WorldSurfaceMaterial[]}}
 */
export function readWorldMaterialCatalog({ catalogPath, modelRoot }) {
  if (lstatSync(catalogPath).isSymbolicLink()) fail('catalog symlink refused');
  if (
    lstatSync(modelRoot).isSymbolicLink() ||
    !lstatSync(modelRoot).isDirectory()
  )
    fail('model root must be a real directory');
  const bytes = readFileSync(catalogPath);
  const catalog = object(
    JSON.parse(bytes.toString('utf8')),
    ['schemaVersion', 'materials'],
    [],
    'catalog'
  );
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.materials))
    fail('unsupported schema or materials');
  const refs = new Set(),
    images = new Map();
  const materials = catalog.materials.map((raw, index) => {
    const path = `materials[${index}]`;
    const row = object(
      raw,
      [
        'ref',
        'displayName',
        'family',
        'baseColor',
        'normal',
        'repeatMeters',
        'normalScale',
        'roughness',
        'metalness',
      ],
      ['metallicRoughness', 'occlusion'],
      path
    );
    const ref = pattern(
      row.ref,
      /^dnd5e:material:[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:_[a-z0-9]+)*$/,
      `${path}.ref`
    );
    if (refs.has(ref)) fail(`duplicate material ref: ${ref}`);
    refs.add(ref);
    if (
      typeof row.displayName !== 'string' ||
      !row.displayName.trim() ||
      row.displayName !== row.displayName.trim() ||
      /[\p{C}\p{Zl}\p{Zp}]/u.test(row.displayName)
    )
      fail(`${path}.displayName is invalid`);
    const result = {
      ref,
      displayName: row.displayName,
      family: pattern(row.family, /^[a-z][a-z0-9-]{0,63}$/, `${path}.family`),
      repeatMeters: pair(row.repeatMeters, `${path}.repeatMeters`, true),
      normalScale: pair(row.normalScale, `${path}.normalScale`),
      roughness: finite(row.roughness, `${path}.roughness`),
      metalness: finite(row.metalness, `${path}.metalness`),
    };
    for (const key of ['roughness', 'metalness'])
      if (result[key] < 0 || result[key] > 1)
        fail(`${path}.${key} must be in 0..1`);
    for (const role of IMAGE_ROLES) {
      if (!Object.hasOwn(row, role)) continue;
      const at = `${path}.${role}`;
      const image = object(row[role], IMAGE_KEYS, [], at);
      const sha256 = pattern(image.sha256, /^[0-9a-f]{64}$/, `${at}.sha256`);
      if (image.file !== `world-materials/images/${sha256}.png`)
        fail(`${at}.file must be contained and content-addressed`);
      for (const key of ['width', 'height', 'sizeBytes']) {
        if (!Number.isSafeInteger(image[key]) || image[key] <= 0)
          fail(`${at}.${key} must be a positive safe integer`);
      }
      if (image.width * image.height > MAX_IMAGE_PIXELS)
        fail(`${at} exceeds PNG pixel safeguard`);
      const previous = images.get(image.file);
      if (previous && IMAGE_KEYS.some((key) => previous[key] !== image[key]))
        fail(`${at} shared image has conflicting metadata`);
      images.set(image.file, image);
      result[role] = {
        url: `/models/synty/${image.file}?v=${sha256}`,
        sha256,
        sizeBytes: image.sizeBytes,
        width: image.width,
        height: image.height,
      };
    }
    return result;
  });
  for (const image of images.values()) verifyImage(modelRoot, image);
  verifyOwnedFiles(modelRoot, images);
  return { catalogSha256: digest(bytes), materials };
}
