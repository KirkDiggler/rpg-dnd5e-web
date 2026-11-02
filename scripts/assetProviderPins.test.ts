// @vitest-environment node
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assetProviderPins } from './asset-provider-pins.mjs';
const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'provider-pins-'));
  roots.push(root);
  const generated = join(root, 'src/generated');
  mkdirSync(generated, { recursive: true });
  for (const [file, key, pin] of [
    ['characterCustomizationCatalog.ts', 'providerCommit', 'a'],
    ['npcAppearanceCatalog.ts', 'commit', 'b'],
    ['worldAssetCatalog.ts', 'commit', 'c'],
    ['worldMaterialCatalog.ts', 'commit', 'c'],
    ['itemThumbnailCatalog.ts', 'commit', 'd'],
  ])
    writeFileSync(
      join(generated, file),
      `export const PROVIDER = {\n  ${key}: '${pin.repeat(40)}',\n};\n`
    );
  return { root, generated };
}
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true }))
);
describe('packaging provider pins', () => {
  it('includes the item owner and deduplicates explicit pins without choosing provider HEAD', () => {
    const f = fixture();
    expect(assetProviderPins(f.root)).toEqual([
      'a'.repeat(40),
      'b'.repeat(40),
      'c'.repeat(40),
      'd'.repeat(40),
    ]);
  });
  it.each(['missing', 'short', 'duplicate'])(
    'fails closed on %s metadata',
    (kind) => {
      const f = fixture(),
        file = join(f.generated, 'worldMaterialCatalog.ts');
      if (kind === 'missing') rmSync(file);
      if (kind === 'short') writeFileSync(file, "commit: 'abc'\n");
      if (kind === 'duplicate')
        writeFileSync(
          file,
          `commit: '${'c'.repeat(40)}'\ncommit: '${'d'.repeat(40)}'\n`
        );
      expect(() => assetProviderPins(f.root)).toThrow();
    }
  );
  it('uses exact pin fetching and the pinned union in the production packaging workflow', () => {
    const workflow = readFileSync(
      new URL('../.github/workflows/docker.yml', import.meta.url),
      'utf8'
    );
    expect(workflow).toContain('PINS=$(node scripts/asset-provider-pins.mjs)');
    expect(workflow).toContain(
      'git -C "$TMP_DIR" fetch --depth 1 origin "$PIN"'
    );
    expect(workflow).toContain(
      'sh scripts/sync-game-assets.sh --pinned-runtime'
    );
    expect(workflow).not.toContain(
      'sh scripts/sync-game-assets.sh --runtime-assets'
    );
    const dockerIgnore = readFileSync(
      new URL('../.dockerignore', import.meta.url),
      'utf8'
    );
    expect(dockerIgnore.split('\n')).toContain('.local/');
    expect(dockerIgnore.split('\n')).toContain('.worktrees/');
  });
});
