import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

export const MAX_IMAGE_PIXELS = 89478485;
const fail = (message) => {
  throw new Error(`Runtime image resources: ${message}`);
};

/** Relative names must already be constrained by the owning catalog schema. */
export function regularResourceFile(root, relative) {
  let path = root;
  if (lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory())
    fail('model root must be a real directory');
  for (const part of relative.split('/')) {
    path = join(path, part);
    if (lstatSync(path).isSymbolicLink())
      fail(`resource symlink refused: ${relative}`);
  }
  if (!lstatSync(path).isFile())
    fail(`resource must be a regular file: ${relative}`);
  return path;
}

export function verifyRuntimeImage({ modelRoot, image, opaque = false }) {
  const bytes = readFileSync(regularResourceFile(modelRoot, image.file));
  if (
    (image.sizeBytes !== undefined && bytes.length !== image.sizeBytes) ||
    createHash('sha256').update(bytes).digest('hex') !== image.sha256
  )
    fail(`${image.file} hash/size mismatch`);
  if (image.width * image.height > MAX_IMAGE_PIXELS)
    fail(`${image.file} exceeds PNG pixel safeguard`);
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
    if (opaque)
      for (let i = 3; i < decoded.data.length; i += 4)
        if (decoded.data[i] !== 255) fail(`${image.file} must be opaque`);
  } catch (error) {
    fail(`${image.file} invalid PNG: ${error.message}`);
  }
}

export function verifyOwnedResourceFiles({ modelRoot, subtree, expected }) {
  const actual = new Set();
  const visit = (relative) => {
    const path = join(modelRoot, relative),
      info = lstatSync(path);
    if (info.isSymbolicLink()) fail(`resource symlink refused: ${relative}`);
    if (info.isDirectory())
      for (const name of readdirSync(path)) visit(`${relative}/${name}`);
    else if (info.isFile()) actual.add(relative);
    else fail(`non-regular resource: ${relative}`);
  };
  try {
    visit(subtree);
  } catch (error) {
    if (!(error.code === 'ENOENT' && expected.size === 0)) throw error;
  }
  if (
    actual.size !== expected.size ||
    [...actual].some((file) => !expected.has(file))
  )
    fail(`${subtree} file set differs from catalog`);
}
