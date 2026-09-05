import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { format } from 'prettier';
import { afterEach, describe, expect, it } from 'vitest';
import { buildGeneratedPropCatalog } from './generate-prop-catalog.mjs';

const roots: string[] = [];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'prop-catalog-'));
  roots.push(root);
  const providerRoot = join(root, 'assets');
  const outputPath = join(root, 'generatedPropCatalog.ts');
  const props = join(providerRoot, 'harness/models/synty/props');
  const catalogs = join(providerRoot, 'harness/catalogs');
  const runtimeRoot = join(root, 'web/public/models/synty');
  await mkdir(props, { recursive: true });
  await mkdir(catalogs, { recursive: true });
  await mkdir(join(runtimeRoot, 'props'), { recursive: true });
  await writeFile(join(props, 'plushie--skeleton-dog.glb'), 'promoted-glb');
  await writeFile(
    join(runtimeRoot, 'props/plushie--skeleton-dog.glb'),
    'promoted-glb'
  );
  await writeFile(
    join(catalogs, 'synty-props-web.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        generatedBy: 'build_prop_web_catalog@1.0.0',
        refs: {
          'dnd5e:props:barrel': {
            familyRef: 'dnd5e:props:barrel',
            displayName: 'Barrel',
            file: 'props/SM_Prop_Barrel_01.glb',
            sizeBytes: 100,
            sha256: 'a'.repeat(64),
            role: 'cover',
            footprintHexes: 1,
            blocksMovement: true,
            blocksLoS: false,
          },
          'dnd5e:props:plushie:skeleton-dog': {
            familyRef: 'dnd5e:props:plushie',
            displayName: 'Skele Dog Plushie',
            file: 'props/plushie--skeleton-dog.glb',
            sizeBytes: 12,
            sha256:
              'dbc666adb19aa053ab772b04dba60248d8a75462b2a50595e345c2d837a4aad0',
            role: 'decor',
            footprintHexes: 1,
            blocksMovement: false,
            blocksLoS: false,
          },
        },
        familyDefaults: {
          'dnd5e:props:plushie': 'dnd5e:props:plushie:skeleton-dog',
        },
        paletteRefs: ['dnd5e:props:barrel', 'dnd5e:props:plushie:skeleton-dog'],
      },
      null,
      2
    )}\n`
  );
  return { providerRoot, outputPath, runtimeRoot };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true }))
  );
});

describe('generate prop catalog', () => {
  it('generates only provider exact refs and their family defaults', async () => {
    const { providerRoot, outputPath, runtimeRoot } = await fixture();
    await buildGeneratedPropCatalog({ providerRoot, outputPath, runtimeRoot });
    const first = await readFile(outputPath, 'utf8');
    await buildGeneratedPropCatalog({ providerRoot, outputPath, runtimeRoot });
    const second = await readFile(outputPath, 'utf8');

    expect(second).toBe(first);
    expect(first).toBe(
      await format(first, {
        parser: 'typescript',
        semi: true,
        trailingComma: 'es5',
        singleQuote: true,
        printWidth: 80,
        tabWidth: 2,
        useTabs: false,
        arrowParens: 'always',
        endOfLine: 'lf',
      })
    );
    expect(first).toContain('dnd5e:props:plushie:skeleton-dog');
    expect(first).toContain('dnd5e:props:plushie');
    expect(first).toContain('Skele Dog Plushie');
    expect(first).not.toMatch(/"dnd5e:props:barrel"\s*:/);
  });

  it('rejects a provider GLB that does not match provider size and hash', async () => {
    const { providerRoot, outputPath, runtimeRoot } = await fixture();
    await writeFile(
      join(
        providerRoot,
        'harness/models/synty/props/plushie--skeleton-dog.glb'
      ),
      'changed'
    );

    await expect(
      buildGeneratedPropCatalog({ providerRoot, outputPath, runtimeRoot })
    ).rejects.toThrow(/size.*mismatch|hash.*mismatch/i);
  });

  it('rejects a synchronized Web GLB that differs from the provider', async () => {
    const { providerRoot, outputPath, runtimeRoot } = await fixture();
    await writeFile(
      join(runtimeRoot, 'props/plushie--skeleton-dog.glb'),
      'different-web-bytes'
    );

    await expect(
      buildGeneratedPropCatalog({ providerRoot, outputPath, runtimeRoot })
    ).rejects.toThrow(
      /synchronized.*size.*mismatch|synchronized.*hash.*mismatch/i
    );
  });
});
