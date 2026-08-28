// @vitest-environment node
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFrozenBuildManifest } from './frozenBuildManifest';

describe('frozen build manifest', () => {
  it('sorts paths bytewise and hashes exact canonical records', async () => {
    const root = await mkdtemp(join(tmpdir(), 'attack-die-manifest-'));
    await mkdir(join(root, 'assets'));
    await writeFile(join(root, 'z.txt'), 'z');
    await writeFile(join(root, 'assets', 'a.js'), 'alpha');
    const manifest = await createFrozenBuildManifest(root);
    expect(manifest.files.map((file) => file.path)).toEqual([
      'assets/a.js',
      'z.txt',
    ]);
    expect(manifest.webBuildSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('invalidates on changed bytes and changed paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'attack-die-manifest-'));
    await writeFile(join(root, 'a'), 'one');
    const a = await createFrozenBuildManifest(root);
    await writeFile(join(root, 'a'), 'two');
    const b = await createFrozenBuildManifest(root);
    await writeFile(join(root, 'b'), 'two');
    const c = await createFrozenBuildManifest(root);
    expect(a.webBuildSha256).not.toBe(b.webBuildSha256);
    expect(b.webBuildSha256).not.toBe(c.webBuildSha256);
  });

  it('self-excludes an output manifest and rejects symlinks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'attack-die-manifest-'));
    const output = join(root, 'manifest.json');
    await writeFile(join(root, 'index.html'), 'ok');
    await writeFile(output, 'old manifest');
    const manifest = await createFrozenBuildManifest(root, output);
    expect(manifest.files.map((file) => file.path)).toEqual(['index.html']);
    await symlink(join(root, 'index.html'), join(root, 'link'));
    await expect(createFrozenBuildManifest(root, output)).rejects.toThrow(
      /symlink/
    );
    expect(await readFile(output, 'utf8')).toBe('old manifest');
  });
});
