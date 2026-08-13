import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface FrozenBuildFile {
  path: string;
  size: number;
  sha256: string;
}
export interface FrozenBuildManifest {
  schemaVersion: 1;
  kind: 'attack-die-web-build-manifest';
  files: FrozenBuildFile[];
  webBuildSha256: string;
}
const sha256 = (bytes: Uint8Array | string) =>
  createHash('sha256').update(bytes).digest('hex');
const posix = (path: string) => path.split(sep).join('/');
function contained(root: string, candidate: string) {
  const rel = relative(root, candidate);
  return (
    rel === '' ||
    (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
  );
}

export function encodeFrozenBuildRecords(files: readonly FrozenBuildFile[]) {
  return files
    .map((file) => `${file.path}\0${file.size}\0${file.sha256}\n`)
    .join('');
}

export async function createFrozenBuildManifest(
  distPath: string,
  outputPath?: string
): Promise<FrozenBuildManifest> {
  const root = resolve(distPath);
  const excluded = outputPath ? resolve(outputPath) : null;
  const files: FrozenBuildFile[] = [];
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = resolve(directory, entry.name);
      if (!contained(root, absolute)) throw Error('path escaped dist');
      const info = await lstat(absolute);
      if (info.isSymbolicLink())
        throw Error(`symlink is not allowed: ${absolute}`);
      if (info.isDirectory()) await walk(absolute);
      else if (info.isFile() && absolute !== excluded) {
        const bytes = await readFile(absolute);
        files.push({
          path: posix(relative(root, absolute)),
          size: bytes.byteLength,
          sha256: sha256(bytes),
        });
      }
    }
  }
  await walk(root);
  files.sort((a, b) => Buffer.from(a.path).compare(Buffer.from(b.path)));
  return {
    schemaVersion: 1,
    kind: 'attack-die-web-build-manifest',
    files,
    webBuildSha256: sha256(encodeFrozenBuildRecords(files)),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [dist] = process.argv.slice(2);
  if (!dist) throw Error('usage: frozenBuildManifest.ts <dist>');
  console.log(JSON.stringify(await createFrozenBuildManifest(dist), null, 2));
}
