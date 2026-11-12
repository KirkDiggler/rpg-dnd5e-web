// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readWorldMaterialCatalog } from './world-material-catalog.mjs';
import { worldAtlasFixture } from './worldAtlasCatalog.testFixtures';

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'atlas-compatibility-'));
  roots.push(root);
  const value = worldAtlasFixture(root);
  value.document.schemaVersion = 3;
  Object.assign(value.binding.surfaces[0], {
    compatibleFamilies: ['main-atlas'],
  });
  value.save();
  return value;
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('provider-declared atlas compatibility', () => {
  it('reads technical families without turning recommendations into permission', () => {
    const f = fixture();
    f.document.materials.push({
      ...f.atlas,
      ref: 'dnd5e:material:test:unrecommended',
    });
    f.save();
    const result = readWorldMaterialCatalog(f);
    expect(result.schemaVersion).toBe(3);
    if (result.schemaVersion !== 3) throw Error('Missing schema3 projection');
    expect(result.bindings[0].surfaces[0].compatibleFamilies).toEqual([
      'main-atlas',
    ]);
    expect(result.atlasMaterials.map((row) => row.ref)).toEqual([
      f.atlas.ref,
      'dnd5e:material:test:unrecommended',
    ]);
    expect(result.collections[0].materials).toEqual([f.atlas.ref]);
  });

  it.each([
    ['empty', []],
    ['duplicate', ['main-atlas', 'main-atlas']],
    ['unknown', ['undeclared-layout']],
    ['masonry is not an atlas layout', ['masonry']],
    ['non-string', [3]],
  ])('refuses %s compatibility declarations', (_name, compatibleFamilies) => {
    const f = fixture();
    Object.assign(f.binding.surfaces[0], { compatibleFamilies });
    f.save();
    expect(() => readWorldMaterialCatalog(f)).toThrow(/compatibleFamilies/i);
  });

  it('does not infer compatibility when the target omits it', () => {
    const f = fixture();
    Reflect.deleteProperty(f.binding.surfaces[0], 'compatibleFamilies');
    f.save();
    expect(() => readWorldMaterialCatalog(f)).toThrow(/surfaces.*fields/i);
  });

  it('refuses the older atlas schema rather than guessing its compatibility', () => {
    const root = mkdtempSync(join(tmpdir(), 'old-atlas-contract-'));
    roots.push(root);
    const f = worldAtlasFixture(root);
    f.document.schemaVersion = 2;
    Reflect.deleteProperty(f.binding.surfaces[0], 'compatibleFamilies');
    f.save();
    expect(() => readWorldMaterialCatalog(f)).toThrow(/version|schema/i);
  });
});
