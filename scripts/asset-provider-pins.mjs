import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const SOURCES = [
  ['characterCustomizationCatalog.ts', 'providerCommit'],
  ['npcAppearanceCatalog.ts', 'commit'],
  ['worldAssetCatalog.ts', 'commit'],
  ['worldMaterialCatalog.ts', 'commit'],
  ['itemThumbnailCatalog.ts', 'commit'],
];
/** Packaging fetches exactly the provider commits all generated asset owners
 * describe. Missing/malformed pins refuse; never fall back to provider HEAD. */
export function assetProviderPins(webRoot) {
  const pins = new Set();
  for (const [file, property] of SOURCES) {
    const source = readFileSync(
      resolve(webRoot, 'src/generated', file),
      'utf8'
    );
    const pattern = new RegExp(
      `^\\s*${property}:\\s*(['"])([a-f0-9]{40})\\1,?\\s*$`,
      'gm'
    );
    const found = [...source.matchAll(pattern)];
    if (found.length !== 1)
      throw new Error(`${file} must declare exactly one full provider commit`);
    pins.add(found[0][2]);
  }
  return [...pins];
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const root = process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url));
  console.log(assetProviderPins(root).join('\n'));
}
